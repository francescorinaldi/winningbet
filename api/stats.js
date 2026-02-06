/**
 * GET /api/stats?type=standings|track-record
 *
 * Endpoint unificato per statistiche e classifiche.
 *
 * type=standings    — Classifica completa della lega (cache 6h)
 *                     Param: league={slug} (default: serie-a)
 * type=track-record — Statistiche aggregate dei pronostici (cache 1h)
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

async function handleTrackRecord(_req, res) {
  const CACHE_KEY = 'track_record';
  const CACHE_TTL = 3600; // 1 ora

  const cached = cache.get(CACHE_KEY);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    return res.status(200).json(cached);
  }

  try {
    const { data: tips, error } = await supabase
      .from('tips')
      .select(
        'id, prediction, odds, confidence, status, tier, match_date, home_team, away_team, created_at',
      )
      .in('status', ['won', 'lost', 'void'])
      .order('match_date', { ascending: false });

    if (error) {
      console.error('Track record query error:', error.message);
      return res.status(500).json({ error: 'Errore nel recupero delle statistiche' });
    }

    const { count: pendingCount } = await supabase
      .from('tips')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

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

    const recent = allTips.slice(0, 10).map(function (t) {
      return {
        home_team: t.home_team,
        away_team: t.away_team,
        prediction: t.prediction,
        odds: t.odds,
        status: t.status,
        match_date: t.match_date,
      };
    });

    const monthly = buildMonthlyBreakdown(allTips);

    const result = {
      total_tips: allTips.length + (pendingCount || 0),
      won: won,
      lost: lost,
      void: voidCount,
      pending: pendingCount || 0,
      win_rate: winRate,
      avg_odds: avgOdds,
      roi: roi,
      recent: recent,
      monthly: monthly,
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
