/**
 * GET /api/fixtures?type=matches|results|odds|h2h|form|odds-compare&league={slug}
 *
 * Endpoint unificato per partite, risultati, quote e analisi.
 *
 * type=matches      — Prossime 10 partite (cache 2h)
 * type=results      — Ultimi 10 risultati (cache 1h)
 * type=odds         — Quote per una partita (cache 30min, richiede &fixture={id})
 * type=h2h          — Head-to-head storico (cache 24h, richiede &home, &away, &league)
 * type=form         — Form recente delle squadre (cache 6h, richiede &teams, &league)
 * type=odds-compare — Quote multi-bookmaker (cache 30min, JWT + role=partner)
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
const { authenticate } = require('./_lib/auth-middleware');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

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
  if (type === 'h2h') {
    return handleH2H(req, res);
  }
  if (type === 'form') {
    return handleForm(req, res);
  }
  if (type === 'odds-compare') {
    return handleOddsCompare(req, res);
  }

  return res
    .status(400)
    .json({ error: 'Parametro type richiesto: matches, results, odds, h2h, form o odds-compare' });
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

// ─── Head-to-Head ──────────────────────────────────────────────────────────

async function handleH2H(req, res) {
  const homeTeam = req.query.home;
  const awayTeam = req.query.away;
  const leagueSlug = resolveLeagueSlug(req.query.league);

  if (!homeTeam || !awayTeam) {
    return res.status(400).json({ error: 'Parametri home e away richiesti' });
  }

  const cacheKey =
    'h2h:' + leagueSlug + ':' + homeTeam.toLowerCase() + ':' + awayTeam.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json(cached);
  }

  try {
    const data = await apiFootball.getHeadToHead(leagueSlug, homeTeam, awayTeam, 10);
    cache.set(cacheKey, data, 86400); // 24h
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Errore nel recupero H2H: ' + err.message });
  }
}

// ─── Team Form ─────────────────────────────────────────────────────────────

async function handleForm(req, res) {
  const teamsParam = req.query.teams;
  const leagueSlug = resolveLeagueSlug(req.query.league);

  if (!teamsParam) {
    return res.status(400).json({ error: 'Parametro teams richiesto' });
  }

  const requestedTeams = teamsParam.split(',').map(function (t) {
    return t.trim();
  });

  const cacheKey = 'team-form:' + leagueSlug;
  let standings = cache.get(cacheKey);

  if (!standings) {
    try {
      standings = await apiFootball.getStandings(leagueSlug);
      cache.set(cacheKey, standings, 21600); // 6h
    } catch (err) {
      return res.status(500).json({ error: 'Errore nel recupero classifica: ' + err.message });
    }
  }

  const result = {};
  requestedTeams.forEach(function (teamName) {
    const teamLC = teamName.toLowerCase();
    const team = standings.find(function (s) {
      return s.name.toLowerCase() === teamLC;
    });

    if (team && team.form) {
      result[teamName] = {
        form: team.form,
        rank: team.rank,
        points: team.points,
      };
    }
  });

  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
  return res.status(200).json(result);
}

// ─── Odds Compare (JWT + partner role) ─────────────────────────────────────

const ODDS_COMPARE_CACHE_TTL = 1800; // 30 minuti
const DAYS_AHEAD = 7;
const ODDS_KEYS = ['home', 'draw', 'away', 'over25', 'under25', 'btts_yes', 'btts_no'];

async function handleOddsCompare(req, res) {
  const { user, profile, error: authError } = await authenticate(req);
  if (authError || !user) {
    return res.status(401).json({ error: 'Autenticazione richiesta' });
  }

  if (!profile || profile.role !== 'partner') {
    return res.status(403).json({ error: 'Accesso riservato — solo partner Centro Scommesse' });
  }

  const leagueSlug = resolveLeagueSlug(req.query.league);

  const cachedCompare = cache.get('odds_compare_' + leagueSlug);
  if (cachedCompare) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(cachedCompare);
  }

  try {
    const upcoming = await apiFootball.getUpcomingMatches(leagueSlug, 15);
    const cutoff = new Date(Date.now() + DAYS_AHEAD * 86400_000);
    const fixtures = (upcoming || []).filter((f) => new Date(f.date) <= cutoff);

    // Recupera tips Supabase per i fixture in arrivo
    const matchIds = fixtures.map((f) => String(f.id));
    const tipsMap = {};
    if (matchIds.length > 0) {
      const { data: tips } = await supabaseAdmin
        .from('tips')
        .select('match_id, prediction, odds, confidence')
        .in('match_id', matchIds)
        .eq('status', 'pending')
        .eq('league', leagueSlug);

      (tips || []).forEach((t) => {
        if (!tipsMap[t.match_id] || t.confidence > tipsMap[t.match_id].confidence) {
          tipsMap[t.match_id] = t;
        }
      });
    }

    // Recupera odds multi-bookmaker in parallelo
    const oddsResults = await Promise.allSettled(
      fixtures.map((f) => apiFootball.getMultipleBookmakerOdds(f.id)),
    );

    const compareResult = {
      league: leagueSlug,
      fixtures: fixtures.map((f, i) => {
        const multi = oddsResults[i].status === 'fulfilled' ? oddsResults[i].value : null;
        const bookmakers = (multi && multi.bookmakers) || [];

        // Calcola best odds per ogni mercato
        const bestOdds = {};
        ODDS_KEYS.forEach((k) => {
          let best = null;
          bookmakers.forEach((bk) => {
            const v = bk.odds[k];
            if (v !== null && (best === null || parseFloat(v) > parseFloat(best))) {
              best = v;
            }
          });
          bestOdds[k] = best;
        });

        return {
          fixtureId: f.id,
          date: f.date,
          home: f.home,
          away: f.away,
          tip: tipsMap[String(f.id)] || null,
          bookmakers,
          bestOdds,
        };
      }),
    };

    cache.set('odds_compare_' + leagueSlug, compareResult, ODDS_COMPARE_CACHE_TTL);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(compareResult);
  } catch (err) {
    console.error('[odds-compare]', err.message);
    return res.status(502).json({ error: 'Impossibile recuperare le quote' });
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
