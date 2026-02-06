/**
 * Team Form API — GET
 *
 * GET /api/team-form?teams=TeamA,TeamB&league=serie-a
 *
 * Returns W/D/L form string from standings data.
 * Cache: 6 hours (set in vercel.json).
 */

const { getStandings } = require('./_lib/api-football');
const { resolveLeagueSlug } = require('./_lib/leagues');
const { getCached, setCached } = require('./_lib/cache');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const teamsParam = req.query.teams;
  const leagueSlug = resolveLeagueSlug(req.query.league);

  if (!teamsParam) {
    return res.status(400).json({ error: 'Parametro teams richiesto' });
  }

  const requestedTeams = teamsParam.split(',').map(function (t) {
    return t.trim();
  });

  const cacheKey = 'team-form:' + leagueSlug;
  let standings = getCached(cacheKey);

  if (!standings) {
    try {
      standings = await getStandings(leagueSlug);
      setCached(cacheKey, standings, 21600000); // 6h
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

  return res.status(200).json(result);
};
