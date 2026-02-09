/**
 * /api/generate-tips
 *
 * POST — Genera pronostici AI per le prossime partite di una lega.
 *   Body: { league?: "serie-a" | "la-liga" | ... }
 *
 * GET — Cron orchestrator giornaliero (Vercel Cron).
 *   Esegue in sequenza: settle → generate (tutte le leghe) → send.
 *
 * Sicurezza: richiede CRON_SECRET nell'header Authorization.
 */

const { supabase } = require('./_lib/supabase');
const apiFootball = require('./_lib/api-football');
const footballData = require('./_lib/football-data');
const { generateBatchPredictions } = require('./_lib/prediction-engine');
const { resolveLeagueSlug, getLeague, VALID_SLUGS: LEAGUE_SLUGS } = require('./_lib/leagues');
const { verifyCronSecret } = require('./_lib/auth-middleware');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return handleCron(req, res);
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { authorized, error: cronError } = verifyCronSecret(req);
  if (!authorized) {
    return res.status(401).json({ error: cronError });
  }

  const leagueSlug = resolveLeagueSlug(req.body && req.body.league);

  try {
    const result = await generateForLeague(leagueSlug);

    return res.status(200).json({
      generated: result.generated,
      league: leagueSlug,
      tips: result.tips || [],
    });
  } catch (err) {
    console.error('generate-tips error:', err);
    return res.status(500).json({ error: 'Errore nella generazione dei pronostici' });
  }
};

// ─── Cron Handler (GET) ─────────────────────────────────────────────────────

async function handleCron(req, res) {
  const { authorized, error: cronError } = verifyCronSecret(req);
  if (!authorized) {
    return res.status(401).json({ error: cronError });
  }

  const { handleSettle, handleSend } = require('./cron-tasks');

  const results = { settle: null, generate: [], send: null };

  try {
    // Step 1 — Settle (call handler function directly, no fake req/res)
    try {
      const settleResult = { data: null };
      const settleRes = {
        status: function () {
          return settleRes;
        },
        json: function (data) {
          settleResult.data = data;
        },
      };
      await handleSettle(req, settleRes);
      results.settle = settleResult.data;
    } catch (err) {
      console.error('Cron daily — settle error:', err.message);
      results.settle = { error: err.message };
    }

    // Step 2 — Generate (all leagues)
    for (const slug of LEAGUE_SLUGS) {
      try {
        const result = await generateForLeague(slug);
        results.generate.push(result);
      } catch (err) {
        console.error('Cron daily — generate error for ' + slug + ':', err.message);
        results.generate.push({ league: slug, error: err.message });
      }
    }

    // Step 3 — Send (call handler function directly)
    try {
      const sendResult = { data: null };
      const sendRes = {
        status: function () {
          return sendRes;
        },
        json: function (data) {
          sendResult.data = data;
        },
      };
      await handleSend(req, sendRes);
      results.send = sendResult.data;
    } catch (err) {
      console.error('Cron daily — send error:', err.message);
      results.send = { error: err.message };
    }

    return res.status(200).json(results);
  } catch (err) {
    console.error('Cron daily — fatal error:', err);
    return res.status(500).json({ error: 'Errore fatale nel cron giornaliero', partial: results });
  }
}

// ─── Historical Accuracy ────────────────────────────────────────────────────

/**
 * Query Supabase per lo storico accuratezza per tipo di pronostico in una lega.
 * Ritorna una stringa formattata da iniettare nel prompt, oppure '' se dati insufficienti.
 *
 * @param {string} leagueSlug - Slug della lega
 * @returns {Promise<string>} Contesto storico formattato
 */
async function getAccuracyContext(leagueSlug) {
  try {
    const { data, error } = await supabase.rpc('get_prediction_accuracy', {
      p_league: leagueSlug,
    });

    // Se la RPC non esiste, fallback a query diretta
    if (error) {
      return await getAccuracyContextFallback(leagueSlug);
    }

    return formatAccuracyData(data, leagueSlug);
  } catch (err) {
    console.warn('[getAccuracyContext] RPC failed, using fallback:', err.message);
    return await getAccuracyContextFallback(leagueSlug);
  }
}

/**
 * Fallback: query diretta alla tabella tips per calcolare accuratezza.
 * @param {string} leagueSlug - Slug della lega
 * @returns {Promise<string>} Contesto storico formattato
 */
async function getAccuracyContextFallback(leagueSlug) {
  try {
    const { data } = await supabase
      .from('tips')
      .select('prediction, status')
      .eq('league', leagueSlug)
      .in('status', ['won', 'lost']);

    if (!data || data.length < 20) return '';

    // Raggruppa per tipo di pronostico
    const grouped = {};
    for (const tip of data) {
      if (!grouped[tip.prediction]) {
        grouped[tip.prediction] = { won: 0, total: 0 };
      }
      grouped[tip.prediction].total++;
      if (tip.status === 'won') grouped[tip.prediction].won++;
    }

    return formatAccuracyData(
      Object.entries(grouped).map(([prediction, stats]) => ({
        prediction,
        won: stats.won,
        total: stats.total,
      })),
      leagueSlug,
    );
  } catch (err) {
    console.warn('[getAccuracyContextFallback]', err.message);
    return '';
  }
}

/**
 * Formatta i dati di accuratezza in una stringa per il prompt.
 * @param {Array<Object>} data - Array di { prediction, won, total }
 * @param {string} leagueSlug - Slug della lega
 * @returns {string} Contesto formattato
 */
function formatAccuracyData(data, leagueSlug) {
  if (!data || data.length === 0) return '';

  const totalTips = data.reduce((sum, d) => sum + (d.total || 0), 0);
  if (totalTips < 20) return '';

  const leagueName = getLeague(leagueSlug).name;
  const lines = data
    .filter((d) => d.total >= 5)
    .sort((a, b) => b.total - a.total)
    .map((d) => {
      const pct = Math.round(((d.won || 0) / d.total) * 100);
      return `${d.prediction}: ${pct}% (${d.total} pronostici)`;
    });

  if (lines.length === 0) return '';

  return `STORICO ACCURATEZZA ${leagueName}:\n${lines.join('\n')}`;
}

// ─── generateForLeague (callable internamente) ─────────────────────────────

async function generateForLeague(leagueSlug) {
  const league = getLeague(leagueSlug);

  // 1. Recupera le prossime partite
  let matches;
  try {
    matches = await apiFootball.getUpcomingMatches(leagueSlug, 10);
  } catch (_primaryErr) {
    matches = await footballData.getUpcomingMatches(leagueSlug, 10);
  }

  if (!matches || matches.length === 0) {
    return { generated: 0, league: leagueSlug };
  }

  // 2. Recupera classifica completa (totale + casa + trasferta)
  let fullStandings;
  try {
    fullStandings = await apiFootball.getFullStandings(leagueSlug);
  } catch (_primaryErr) {
    fullStandings = await footballData.getFullStandings(leagueSlug);
  }

  // 3. Recupera risultati recenti (ultime 30 partite della lega)
  let recentResults = [];
  try {
    recentResults = await footballData.getRecentResults(leagueSlug, 30);
  } catch (_err) {
    try {
      recentResults = await apiFootball.getRecentResults(leagueSlug, 30);
    } catch (_fallbackErr) {
      console.warn('Could not fetch recent results for ' + leagueSlug);
    }
  }

  // 4. Controlla se ci sono gia' tips per queste partite (evita duplicati)
  const matchIds = matches.map((m) => String(m.id));
  const { data: existingTips } = await supabase
    .from('tips')
    .select('match_id')
    .eq('league', leagueSlug)
    .in('match_id', matchIds);

  const existingMatchIds = new Set((existingTips || []).map((t) => t.match_id));
  const newMatches = matches.filter((m) => !existingMatchIds.has(String(m.id)));

  if (newMatches.length === 0) {
    return { generated: 0, league: leagueSlug };
  }

  // 5. Recupera storico accuratezza
  const accuracyContext = await getAccuracyContext(leagueSlug);

  // 6. Funzione per recuperare tutte le quote di una partita (tutti i mercati)
  async function getAllOddsForMatch(fixtureId) {
    try {
      return await apiFootball.getAllOdds(fixtureId);
    } catch (_err) {
      return null;
    }
  }

  // 7. Genera i pronostici con Claude (pipeline V2)
  const predictions = await generateBatchPredictions({
    matches: newMatches,
    standings: fullStandings.total,
    homeStandings: fullStandings.home,
    awayStandings: fullStandings.away,
    recentResults,
    getAllOdds: getAllOddsForMatch,
    leagueName: league.name,
    accuracyContext,
  });

  // 8. Salva in Supabase (aggiunge il campo league)
  if (predictions.length > 0) {
    const tipsWithLeague = predictions.map((p) => ({ ...p, league: leagueSlug }));
    const { error: insertError } = await supabase.from('tips').insert(tipsWithLeague);
    if (insertError) {
      throw new Error('Errore nel salvataggio dei pronostici: ' + insertError.message);
    }
  }

  return {
    generated: predictions.length,
    league: leagueSlug,
    tips: predictions.map((t) => ({
      match: `${t.home_team} vs ${t.away_team}`,
      prediction: t.prediction,
      tier: t.tier,
      confidence: t.confidence,
    })),
  };
}

module.exports.generateForLeague = generateForLeague;
