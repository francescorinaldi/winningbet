/**
 * GET /api/fixtures?type=matches|results&league={slug}
 *
 * Endpoint unificato per partite e risultati.
 *
 * type=matches — Prossime 10 partite (cache 2h)
 * type=results — Ultimi 10 risultati (cache 1h)
 *
 * Default league: serie-a se omesso.
 *
 * Provider primario: api-football.com (api-sports.io)
 * Fallback: football-data.org
 */

const cache = require('./_lib/cache');
const apiFootball = require('./_lib/api-football');
const footballData = require('./_lib/football-data');
const { resolveLeagueSlug } = require('./_lib/leagues');
const { supabase } = require('./_lib/supabase');
const { evaluatePrediction, buildActualResult } = require('./cron-tasks');

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

  return res.status(400).json({ error: 'Parametro type richiesto: matches o results' });
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
    settlePendingTips(results, leagueSlug);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    return res.status(200).json(results);
  } catch (primaryErr) {
    console.error('API-Football results failed:', primaryErr.message);
    try {
      const results = await footballData.getRecentResults(leagueSlug, 10);
      cache.set(cacheKey, results, CACHE_TTL);
      // Fire-and-forget: settle pending tips using fresh results
      settlePendingTips(results, leagueSlug);
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
      return res.status(200).json(results);
    } catch (fallbackErr) {
      console.error('football-data.org results failed:', fallbackErr.message);
      return res.status(502).json({ error: 'Unable to fetch results from any source' });
    }
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

    let settled = 0;

    for (const tip of pendingTips) {
      const result = resultsMap.get(tip.match_id);
      if (!result || result.goalsHome === null || result.goalsAway === null) continue;

      const totalGoals = result.goalsHome + result.goalsAway;
      const actualResult = buildActualResult(result);
      const score = result.goalsHome + '-' + result.goalsAway;
      const status = evaluatePrediction(tip.prediction, result, totalGoals);

      // Idempotent: WHERE status='pending' ensures no double-update
      const { error: updateError } = await supabase
        .from('tips')
        .update({ status: status, result: score })
        .eq('id', tip.id)
        .eq('status', 'pending');

      if (updateError) {
        console.error(`[settle] Failed to update tip ${tip.id}:`, updateError.message);
        continue;
      }

      await supabase
        .from('tip_outcomes')
        .upsert({ tip_id: tip.id, actual_result: actualResult }, { onConflict: 'tip_id' });

      settled++;
    }

    if (settled > 0) {
      console.log(`[settle] Settled ${settled} tips for ${leagueSlug} opportunistically`);
    }
  } catch (err) {
    // Silent: settlement errors must never affect the main response
    console.error('[settle] Opportunistic settlement error:', err.message);
  }
}
