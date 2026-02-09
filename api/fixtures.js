/**
 * GET /api/fixtures?type=matches|results|odds&league={slug}
 *
 * Endpoint unificato per partite, risultati e quote.
 *
 * type=matches — Prossime 10 partite (cache 2h)
 * type=results — Ultimi 10 risultati (cache 1h)
 * type=odds    — Quote per una partita (cache 30min, richiede &fixture={id})
 *
 * Default league: serie-a se omesso.
 *
 * Provider primario: api-football.com (api-sports.io)
 * Fallback: football-data.org (no odds)
 */

const cache = require('./_lib/cache');
const apiFootball = require('./_lib/api-football');
const footballData = require('./_lib/football-data');
const { resolveLeagueSlug } = require('./_lib/leagues');
const { supabase } = require('./_lib/supabase');
const { evaluatePrediction, buildActualResult } = require('./_lib/prediction-utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const type = req.query.type;

  if (type === 'matches') {
    return handleMatches(req, res);
  }
  if (type === 'results') {
    return handleResults(req, res);
  }
  if (type === 'odds') {
    return handleOdds(req, res);
  }

  return res.status(400).json({ error: 'Parametro type richiesto: matches, results o odds' });
};

// ─── Matches ────────────────────────────────────────────────────────────────

async function handleMatches(req, res) {
  const leagueSlug = resolveLeagueSlug(req.query.league);
  const cacheKey = `matches_${leagueSlug}`;
  const CACHE_TTL = 7200; // 2 ore

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');
    return res.status(200).json(cached);
  }

  try {
    const matches = await apiFootball.getUpcomingMatches(leagueSlug, 10);
    cache.set(cacheKey, matches, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');
    return res.status(200).json(matches);
  } catch (primaryErr) {
    console.error('API-Football matches failed:', primaryErr.message);
    try {
      const matches = await footballData.getUpcomingMatches(leagueSlug, 10);
      cache.set(cacheKey, matches, CACHE_TTL);
      res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');
      return res.status(200).json(matches);
    } catch (fallbackErr) {
      console.error('football-data.org matches failed:', fallbackErr.message);
      return res.status(502).json({ error: 'Unable to fetch matches from any source' });
    }
  }
}

// ─── Results ────────────────────────────────────────────────────────────────

async function handleResults(req, res) {
  const leagueSlug = resolveLeagueSlug(req.query.league);
  const cacheKey = `results_${leagueSlug}`;
  const CACHE_TTL = 3600; // 1 ora

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    return res.status(200).json(cached);
  }

  try {
    const results = await apiFootball.getRecentResults(leagueSlug, 10);
    cache.set(cacheKey, results, CACHE_TTL);
    // Fire-and-forget: settle pending tips using fresh results
    settlePendingTips(results, leagueSlug).catch(function (err) {
      console.error('[settle] fire-and-forget error:', err.message);
    });
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    return res.status(200).json(results);
  } catch (primaryErr) {
    console.error('API-Football results failed:', primaryErr.message);
    try {
      const results = await footballData.getRecentResults(leagueSlug, 10);
      cache.set(cacheKey, results, CACHE_TTL);
      // Fire-and-forget: settle pending tips using fresh results
      settlePendingTips(results, leagueSlug).catch(function (err) {
        console.error('[settle] fire-and-forget error:', err.message);
      });
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
      return res.status(200).json(results);
    } catch (fallbackErr) {
      console.error('football-data.org results failed:', fallbackErr.message);
      return res.status(502).json({ error: 'Unable to fetch results from any source' });
    }
  }
}

// ─── Odds ──────────────────────────────────────────────────────────────────

async function handleOdds(req, res) {
  const fixtureId = req.query.fixture;
  if (!fixtureId) {
    return res.status(400).json({ error: 'Missing "fixture" query parameter' });
  }

  const cacheKey = `odds_${fixtureId}`;
  const ODDS_CACHE_TTL = 1800; // 30 minuti

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=900');
    return res.status(200).json(cached);
  }

  try {
    const odds = await apiFootball.getOdds(fixtureId);
    if (!odds) {
      return res.status(200).json(null);
    }
    cache.set(cacheKey, odds, ODDS_CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=900');
    return res.status(200).json(odds);
  } catch (err) {
    console.error('API-Football odds failed:', err.message);
    return res.status(502).json({ error: 'Unable to fetch odds' });
  }
}

// ─── Opportunistic Settlement ───────────────────────────────────────────────
// When fresh results are fetched (not cached), check if any pending tips
// can be settled. Runs fire-and-forget — does not block the response.
// Idempotent: only updates tips that are still pending.

async function settlePendingTips(results, leagueSlug) {
  try {
    if (!results || results.length === 0) return;

    // Fetch pending tips for this league with match dates in the past
    const { data: pendingTips, error: fetchError } = await supabase
      .from('tips')
      .select('id, match_id, prediction')
      .eq('status', 'pending')
      .eq('league', leagueSlug)
      .lt('match_date', new Date().toISOString());

    if (fetchError || !pendingTips || pendingTips.length === 0) return;

    // Map results by match_id for quick lookup
    const resultsMap = new Map();
    results.forEach(function (r) {
      resultsMap.set(String(r.id), r);
    });

    // Collect all updates first (avoid N+1 individual queries)
    const tipUpdates = [];
    const outcomeUpserts = [];

    for (const tip of pendingTips) {
      const result = resultsMap.get(tip.match_id);
      if (!result || result.goalsHome === null || result.goalsAway === null) continue;

      const totalGoals = result.goalsHome + result.goalsAway;
      const actualResult = buildActualResult(result);
      const score = result.goalsHome + '-' + result.goalsAway;
      const status = evaluatePrediction(tip.prediction, result, totalGoals);

      tipUpdates.push({ id: tip.id, status: status, result: score });
      outcomeUpserts.push({ tip_id: tip.id, actual_result: actualResult });
    }

    if (tipUpdates.length === 0) return;

    // Batch tip updates grouped by (status, result) — idempotent via status='pending' guard
    const updateGroups = {};
    tipUpdates.forEach(function (u) {
      const key = u.status + '|' + u.result;
      if (!updateGroups[key]) updateGroups[key] = [];
      updateGroups[key].push(u.id);
    });

    const batchOps = Object.entries(updateGroups).map(function (entry) {
      const parts = entry[0].split('|');
      return supabase
        .from('tips')
        .update({ status: parts[0], result: parts[1] })
        .in('id', entry[1])
        .eq('status', 'pending');
    });

    // Bulk upsert outcomes in single call
    if (outcomeUpserts.length > 0) {
      batchOps.push(supabase.from('tip_outcomes').upsert(outcomeUpserts, { onConflict: 'tip_id' }));
    }

    await Promise.allSettled(batchOps);

    console.log(`[settle] Settled ${tipUpdates.length} tips for ${leagueSlug} opportunistically`);
  } catch (err) {
    // Silent: settlement errors must never affect the main response
    console.error('[settle] Opportunistic settlement error:', err.message);
  }
}
