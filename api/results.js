const cache = require('./_lib/cache');
const apiFootball = require('./_lib/api-football');
const footballData = require('./_lib/football-data');

const CACHE_KEY = 'results';
const CACHE_TTL = 3600; // 1 hour

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cached = cache.get(CACHE_KEY);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    return res.status(200).json(cached);
  }

  try {
    const results = await apiFootball.getRecentResults(10);
    cache.set(CACHE_KEY, results, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    return res.status(200).json(results);
  } catch (primaryErr) {
    console.error('API-Football results failed:', primaryErr.message);
    try {
      const results = await footballData.getRecentResults(10);
      cache.set(CACHE_KEY, results, CACHE_TTL);
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
      return res.status(200).json(results);
    } catch (fallbackErr) {
      console.error('football-data.org results failed:', fallbackErr.message);
      return res.status(502).json({ error: 'Unable to fetch results from any source' });
    }
  }
};
