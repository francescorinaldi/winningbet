const cache = require('./_lib/cache');
const apiFootball = require('./_lib/api-football');

const CACHE_TTL = 1800; // 30 minutes

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const fixtureId = req.query.fixture;
  if (!fixtureId) {
    return res.status(400).json({ error: 'Missing "fixture" query parameter' });
  }

  const cacheKey = `odds_${fixtureId}`;
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
    cache.set(cacheKey, odds, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=900');
    return res.status(200).json(odds);
  } catch (err) {
    console.error('API-Football odds failed:', err.message);
    return res.status(502).json({ error: 'Unable to fetch odds' });
  }
};
