/**
 * POST /api/generate-tips
 *
 * Genera pronostici AI per le prossime partite di una lega.
 * Questo endpoint e' progettato per essere chiamato:
 *   - Manualmente (con header Authorization: Bearer <CRON_SECRET>)
 *   - Da un cron job (Vercel Cron o servizio esterno)
 *
 * Body (JSON):
 *   league (optional) — Slug della lega (default: 'serie-a')
 *
 * Flusso:
 *   1. Recupera le prossime partite (api-football -> fallback)
 *   2. Recupera la classifica per i dati di forma
 *   3. Per ogni partita, chiama il prediction engine (Claude API)
 *   4. Salva i pronostici nella tabella tips di Supabase con la lega
 *
 * Sicurezza: richiede CRON_SECRET nell'header Authorization.
 *
 * Risposta 200: { generated: number, tips: Array }
 *
 * Errori:
 *   401 — Segreto cron non valido
 *   405 — Metodo non consentito (solo POST)
 *   500 — Errore durante la generazione
 */

const { supabase } = require('./_lib/supabase');
const apiFootball = require('./_lib/api-football');
const footballData = require('./_lib/football-data');
const { generateBatchPredictions } = require('./_lib/prediction-engine');
const { resolveLeagueSlug, getLeague } = require('./_lib/leagues');
const { verifyCronSecret } = require('./_lib/auth-middleware');

module.exports = async function handler(req, res) {
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

/**
 * Genera pronostici per una lega specifica.
 * Funzione callable internamente (senza req/res) — usata dal cron orchestrator.
 *
 * @param {string} leagueSlug - Slug della lega (es. "serie-a", "premier-league")
 * @returns {Promise<{generated: number, league: string}>}
 */
module.exports.generateForLeague = async function generateForLeague(leagueSlug) {
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
    return { generated: 0, league: leagueSlug };
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
      throw new Error('Errore nel salvataggio dei pronostici: ' + insertError.message);
    }
  }

  return { generated: predictions.length, league: leagueSlug };
};
