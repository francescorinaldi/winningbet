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
const { resolveLeagueSlug, getLeague } = require('./_lib/leagues');
const { verifyCronSecret } = require('./_lib/auth-middleware');

const LEAGUE_SLUGS = ['serie-a', 'serie-b', 'champions-league', 'la-liga', 'premier-league'];

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
  const league = getLeague(leagueSlug);

  try {
    // 1. Recupera le prossime partite
    let matches;
    try {
      matches = await apiFootball.getUpcomingMatches(leagueSlug, 10);
    } catch (_primaryErr) {
      matches = await footballData.getUpcomingMatches(leagueSlug, 10);
    }

    if (!matches || matches.length === 0) {
      return res.status(200).json({ generated: 0, message: 'Nessuna partita in programma' });
    }

    // 2. Recupera la classifica
    let standings;
    try {
      standings = await apiFootball.getStandings(leagueSlug);
    } catch (_primaryErr) {
      standings = await footballData.getStandings(leagueSlug);
    }

    // 3. Controlla se ci sono gia' tips per queste partite (evita duplicati)
    const matchIds = matches.map((m) => String(m.id));
    const { data: existingTips } = await supabase
      .from('tips')
      .select('match_id')
      .eq('league', leagueSlug)
      .in('match_id', matchIds);

    const existingMatchIds = new Set((existingTips || []).map((t) => t.match_id));
    const newMatches = matches.filter((m) => !existingMatchIds.has(String(m.id)));

    if (newMatches.length === 0) {
      return res.status(200).json({
        generated: 0,
        message: "Tutti i pronostici per queste partite sono gia' stati generati",
      });
    }

    // 4. Funzione per recuperare le quote di una partita
    async function getOddsForMatch(fixtureId) {
      try {
        return await apiFootball.getOdds(fixtureId);
      } catch (_err) {
        return null;
      }
    }

    // 5. Genera i pronostici con Claude
    const predictions = await generateBatchPredictions({
      matches: newMatches,
      standings,
      getOdds: getOddsForMatch,
      leagueName: league.name,
    });

    // 6. Salva in Supabase (aggiunge il campo league)
    if (predictions.length > 0) {
      const tipsWithLeague = predictions.map((p) => ({ ...p, league: leagueSlug }));
      const { error: insertError } = await supabase.from('tips').insert(tipsWithLeague);
      if (insertError) {
        console.error('Failed to insert tips:', insertError.message);
        return res.status(500).json({ error: 'Errore nel salvataggio dei pronostici' });
      }
    }

    return res.status(200).json({
      generated: predictions.length,
      league: leagueSlug,
      tips: predictions.map((t) => ({
        match: `${t.home_team} vs ${t.away_team}`,
        prediction: t.prediction,
        tier: t.tier,
        confidence: t.confidence,
      })),
    });
  } catch (err) {
    console.error('generate-tips error:', err);
    return res.status(500).json({ error: 'Errore nella generazione dei pronostici' });
  }
};

// ─── Cron Handler (GET) ─────────────────────────────────────────────────────

function callHandler(handler, method, query) {
  return new Promise(function (resolve, reject) {
    const fakeReq = {
      method: method,
      headers: { authorization: 'Bearer ' + process.env.CRON_SECRET },
      query: query || {},
      body: {},
    };

    let statusCode = 200;
    const fakeRes = {
      status: function (code) {
        statusCode = code;
        return fakeRes;
      },
      json: function (data) {
        if (statusCode >= 200 && statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(JSON.stringify(data)));
        }
      },
    };

    Promise.resolve(handler(fakeReq, fakeRes)).catch(reject);
  });
}

async function handleCron(req, res) {
  const { authorized, error: cronError } = verifyCronSecret(req);
  if (!authorized) {
    return res.status(401).json({ error: cronError });
  }

  const cronTasks = require('./cron-tasks');

  const results = { settle: null, generate: [], send: null };

  try {
    // Step 1 — Settle
    try {
      results.settle = await callHandler(cronTasks, 'POST', { task: 'settle' });
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

    // Step 3 — Send
    try {
      results.send = await callHandler(cronTasks, 'POST', { task: 'send' });
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

// ─── generateForLeague (callable internamente) ─────────────────────────────

async function generateForLeague(leagueSlug) {
  const league = getLeague(leagueSlug);

  let matches;
  try {
    matches = await apiFootball.getUpcomingMatches(leagueSlug, 10);
  } catch (_primaryErr) {
    matches = await footballData.getUpcomingMatches(leagueSlug, 10);
  }

  if (!matches || matches.length === 0) {
    return { generated: 0, league: leagueSlug };
  }

  let standings;
  try {
    standings = await apiFootball.getStandings(leagueSlug);
  } catch (_primaryErr) {
    standings = await footballData.getStandings(leagueSlug);
  }

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

  async function getOddsForMatch(fixtureId) {
    try {
      return await apiFootball.getOdds(fixtureId);
    } catch (_err) {
      return null;
    }
  }

  const predictions = await generateBatchPredictions({
    matches: newMatches,
    standings,
    getOdds: getOddsForMatch,
    leagueName: league.name,
  });

  if (predictions.length > 0) {
    const tipsWithLeague = predictions.map((p) => ({ ...p, league: leagueSlug }));
    const { error: insertError } = await supabase.from('tips').insert(tipsWithLeague);
    if (insertError) {
      throw new Error('Errore nel salvataggio dei pronostici: ' + insertError.message);
    }
  }

  return { generated: predictions.length, league: leagueSlug };
}

module.exports.generateForLeague = generateForLeague;
