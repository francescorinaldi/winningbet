/**
 * GET /api/stats?type=standings|track-record
 *
 * Endpoint unificato per statistiche e classifiche.
 *
 * type=standings    — Classifica completa della lega (cache 6h)
 *                     Param: league={slug} (default: serie-a)
 * type=track-record — Statistiche aggregate dei pronostici (cache 1h)
 *                     Param: league={slug} (optional, default: all leagues)
 *
 * Provider primario: api-football.com (api-sports.io)
 * Fallback: football-data.org (solo standings)
 */

const cache = require('./_lib/cache');
const apiFootball = require('./_lib/api-football');
const footballData = require('./_lib/football-data');
const { resolveLeagueSlug } = require('./_lib/leagues');
const { supabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const type = req.query.type;

  if (type === 'standings') {
    return handleStandings(req, res);
  }
  if (type === 'track-record') {
    return handleTrackRecord(req, res);
  }

  return res.status(400).json({ error: 'Parametro type richiesto: standings o track-record' });
};

// ─── Standings ──────────────────────────────────────────────────────────────

async function handleStandings(req, res) {
  const leagueSlug = resolveLeagueSlug(req.query.league);
  const cacheKey = `standings_${leagueSlug}`;
  const CACHE_TTL = 21600; // 6 ore

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
    return res.status(200).json(cached);
  }

  try {
    const standings = await apiFootball.getStandings(leagueSlug);
    cache.set(cacheKey, standings, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
    return res.status(200).json(standings);
  } catch (primaryErr) {
    console.error('API-Football standings failed:', primaryErr.message);
    try {
      const standings = await footballData.getStandings(leagueSlug);
      cache.set(cacheKey, standings, CACHE_TTL);
      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
      return res.status(200).json(standings);
    } catch (fallbackErr) {
      console.error('football-data.org standings failed:', fallbackErr.message);
      return res.status(502).json({ error: 'Unable to fetch standings from any source' });
    }
  }
}

// ─── Track Record ───────────────────────────────────────────────────────────

async function handleTrackRecord(req, res) {
  const rawLeague = req.query.league;
  const leagueSlug = rawLeague && rawLeague !== 'all' ? rawLeague : null;
  const CACHE_KEY = leagueSlug ? `track_record_${leagueSlug}` : 'track_record';
  const CACHE_TTL = 3600; // 1 ora

  const cached = cache.get(CACHE_KEY);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    return res.status(200).json(cached);
  }

  try {
    let settledQuery = supabase
      .from('tips')
      .select(
        'id, match_id, prediction, odds, confidence, status, tier, match_date, home_team, away_team, result, created_at',
      )
      .in('status', ['won', 'lost', 'void'])
      .order('match_date', { ascending: false });

    if (leagueSlug) {
      settledQuery = settledQuery.eq('league', leagueSlug);
    }

    const { data: tips, error } = await settledQuery;

    if (error) {
      console.error('Track record query error:', error.message);
      return res.status(500).json({ error: 'Errore nel recupero delle statistiche' });
    }

    let pendingQuery = supabase
      .from('tips')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (leagueSlug) {
      pendingQuery = pendingQuery.eq('league', leagueSlug);
    }

    const { count: pendingCount } = await pendingQuery;

    const allTips = tips || [];
    const won = allTips.filter(function (t) {
      return t.status === 'won';
    }).length;
    const lost = allTips.filter(function (t) {
      return t.status === 'lost';
    }).length;
    const voidCount = allTips.filter(function (t) {
      return t.status === 'void';
    }).length;
    const settled = won + lost;

    const winRate = settled > 0 ? parseFloat(((won / settled) * 100).toFixed(1)) : 0;

    const wonTips = allTips.filter(function (t) {
      return t.status === 'won' && t.odds;
    });
    const avgOdds =
      wonTips.length > 0
        ? parseFloat(
            (
              wonTips.reduce(function (sum, t) {
                return sum + parseFloat(t.odds);
              }, 0) / wonTips.length
            ).toFixed(2),
          )
        : 0;

    const profit =
      wonTips.reduce(function (sum, t) {
        return sum + (parseFloat(t.odds) - 1);
      }, 0) - lost;
    const roi = settled > 0 ? parseFloat(((profit / settled) * 100).toFixed(1)) : 0;

    const recent = allTips
      .filter(function (t) {
        return t.status === 'won' || t.status === 'lost';
      })
      .slice(0, 10)
      .map(function (t) {
        return {
          home_team: t.home_team,
          away_team: t.away_team,
          prediction: t.prediction,
          odds: t.odds,
          status: t.status,
          match_date: t.match_date,
          result: t.result,
        };
      });

    const monthly = buildMonthlyBreakdown(allTips);
    const byLeague = buildLeagueBreakdown(allTips);
    const byOddsRange = buildOddsRangeBreakdown(allTips);

    // Distinct matches analyzed
    const matchIds = new Set();
    allTips.forEach(function (t) {
      if (t.match_id) matchIds.add(t.match_id);
    });
    const matchesAnalyzed = matchIds.size;
    const dataPoints = matchesAnalyzed * 147;

    const oldestTip = allTips.length > 0 ? allTips[allTips.length - 1] : null;
    const trackRecordSince = oldestTip ? oldestTip.created_at.split('T')[0] : null;

    const result = {
      total_tips: allTips.length + (pendingCount || 0),
      won: won,
      lost: lost,
      void: voidCount,
      pending: pendingCount || 0,
      win_rate: winRate,
      avg_odds: avgOdds,
      roi: roi,
      matches_analyzed: matchesAnalyzed,
      data_points: dataPoints,
      recent: recent,
      monthly: monthly,
      by_league: byLeague,
      by_odds_range: byOddsRange,
      track_record_since: trackRecordSince,
    };

    cache.set(CACHE_KEY, result, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    return res.status(200).json(result);
  } catch (err) {
    console.error('Track record error:', err);
    return res.status(500).json({ error: 'Errore nel recupero delle statistiche' });
  }
}

function buildMonthlyBreakdown(tips) {
  const months = {};
  const monthNames = [
    'Gen',
    'Feb',
    'Mar',
    'Apr',
    'Mag',
    'Giu',
    'Lug',
    'Ago',
    'Set',
    'Ott',
    'Nov',
    'Dic',
  ];

  tips.forEach(function (tip) {
    const d = new Date(tip.match_date);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

    if (!months[key]) {
      months[key] = {
        month: monthNames[d.getMonth()],
        year: d.getFullYear(),
        won: 0,
        lost: 0,
        profit: 0,
      };
    }

    if (tip.status === 'won') {
      months[key].won++;
      months[key].profit += tip.odds ? parseFloat(tip.odds) - 1 : 0;
    } else if (tip.status === 'lost') {
      months[key].lost++;
      months[key].profit -= 1;
    }
  });

  return Object.keys(months)
    .sort()
    .slice(-6)
    .map(function (key) {
      const m = months[key];
      const settled = m.won + m.lost;
      return {
        label: m.month,
        won: m.won,
        lost: m.lost,
        win_rate: settled > 0 ? parseFloat(((m.won / settled) * 100).toFixed(1)) : 0,
        profit: parseFloat(m.profit.toFixed(1)),
      };
    });
}

/**
 * Breakdown dei tip settati per campionato.
 * Restituisce win rate e ROI per ogni lega presente nei dati.
 */
function buildLeagueBreakdown(tips) {
  const leagues = {};

  tips.forEach(function (tip) {
    if (tip.status !== 'won' && tip.status !== 'lost') return;
    const league = tip.league || 'serie-a';
    if (!leagues[league]) {
      leagues[league] = { league: league, won: 0, lost: 0, profit: 0 };
    }
    if (tip.status === 'won') {
      leagues[league].won++;
      leagues[league].profit += tip.odds ? parseFloat(tip.odds) - 1 : 0;
    } else {
      leagues[league].lost++;
      leagues[league].profit -= 1;
    }
  });

  return Object.values(leagues)
    .map(function (l) {
      const settled = l.won + l.lost;
      return {
        league: l.league,
        won: l.won,
        lost: l.lost,
        win_rate: settled > 0 ? parseFloat(((l.won / settled) * 100).toFixed(1)) : 0,
        roi: settled > 0 ? parseFloat(((l.profit / settled) * 100).toFixed(1)) : 0,
      };
    })
    .sort(function (a, b) { return (b.won + b.lost) - (a.won + a.lost); });
}

/**
 * Breakdown dei tip settati per fascia di quota.
 * Fasce: 1.20-1.50, 1.50-2.00, 2.00-3.00, 3.00+
 */
function buildOddsRangeBreakdown(tips) {
  const ranges = [
    { label: '1.20 – 1.50', min: 1.2, max: 1.5, won: 0, lost: 0, profit: 0 },
    { label: '1.50 – 2.00', min: 1.5, max: 2.0, won: 0, lost: 0, profit: 0 },
    { label: '2.00 – 3.00', min: 2.0, max: 3.0, won: 0, lost: 0, profit: 0 },
    { label: '3.00+',       min: 3.0, max: Infinity, won: 0, lost: 0, profit: 0 },
  ];

  tips.forEach(function (tip) {
    if (tip.status !== 'won' && tip.status !== 'lost') return;
    const odds = tip.odds ? parseFloat(tip.odds) : 0;
    if (!odds) return;
    const range = ranges.find(function (r) { return odds >= r.min && odds < r.max; });
    if (!range) return;
    if (tip.status === 'won') {
      range.won++;
      range.profit += odds - 1;
    } else {
      range.lost++;
      range.profit -= 1;
    }
  });

  return ranges.map(function (r) {
    const settled = r.won + r.lost;
    return {
      label: r.label,
      won: r.won,
      lost: r.lost,
      win_rate: settled > 0 ? parseFloat(((r.won / settled) * 100).toFixed(1)) : 0,
      roi: settled > 0 ? parseFloat(((r.profit / settled) * 100).toFixed(1)) : 0,
    };
  }).filter(function (r) { return (r.won + r.lost) > 0; });
}

module.exports.buildMonthlyBreakdown = buildMonthlyBreakdown;
module.exports.buildLeagueBreakdown = buildLeagueBreakdown;
module.exports.buildOddsRangeBreakdown = buildOddsRangeBreakdown;
