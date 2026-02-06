/**
 * GET /api/match-insights?type=h2h|form
 *
 * Endpoint unificato per dati di analisi partita.
 *
 * type=h2h  — Head-to-head storico (richiede home, away, league)
 *             Cache: 24h in-memory + CDN s-maxage=86400
 * type=form — Form recente delle squadre (richiede teams, league)
 *             Cache: 6h in-memory + CDN s-maxage=21600
 */

const cache = require('./_lib/cache');
const { getHeadToHead, getStandings } = require('./_lib/api-football');
const { resolveLeagueSlug } = require('./_lib/leagues');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const type = req.query.type;

  if (type === 'h2h') {
    return handleH2H(req, res);
  }
  if (type === 'form') {
    return handleForm(req, res);
  }

  return res.status(400).json({ error: 'Parametro type richiesto: h2h o form' });
};

// ─── Head-to-Head ───────────────────────────────────────────────────────────

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
    const data = await getHeadToHead(leagueSlug, homeTeam, awayTeam, 10);
    cache.set(cacheKey, data, 86400); // 24h
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Errore nel recupero H2H: ' + err.message });
  }
}

// ─── Team Form ──────────────────────────────────────────────────────────────

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
      standings = await getStandings(leagueSlug);
      cache.set(cacheKey, standings, 21600); // 6h
    } catch (err) {
      return res.status(500).json({ error: 'Errore nel recupero classifica: ' + err.message });
    }
  }

  // Build response: map team name -> { form, rank, points }
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
