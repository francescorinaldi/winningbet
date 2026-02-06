/**
 * Head-to-Head API — GET
 *
 * GET /api/h2h?home=TeamA&away=TeamB&league=serie-a
 *
 * Returns historical head-to-head record.
 * Cache: 24 hours (set in vercel.json).
 */

const { getHeadToHead } = require('./_lib/api-football');
const { resolveLeagueSlug } = require('./_lib/leagues');
const { getCached, setCached } = require('./_lib/cache');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const homeTeam = req.query.home;
  const awayTeam = req.query.away;
  const leagueSlug = resolveLeagueSlug(req.query.league);

  if (!homeTeam || !awayTeam) {
    return res.status(400).json({ error: 'Parametri home e away richiesti' });
  }

  const cacheKey =
    'h2h:' + leagueSlug + ':' + homeTeam.toLowerCase() + ':' + awayTeam.toLowerCase();
  const cached = getCached(cacheKey);
  if (cached) return res.status(200).json(cached);

  try {
    const data = await getHeadToHead(leagueSlug, homeTeam, awayTeam, 10);
    setCached(cacheKey, data, 86400000); // 24h
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Errore nel recupero H2H: ' + err.message });
  }
};
