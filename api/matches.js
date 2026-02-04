/**
 * GET /api/matches
 *
 * Restituisce le prossime 10 partite di Serie A.
 *
 * Provider primario: api-football.com (api-sports.io)
 * Fallback: football-data.org
 *
 * Cache: 2 ore in-memory + CDN s-maxage=7200
 *
 * Risposta 200: Array di oggetti partita
 *   [{ id, date, status, home, homeLogo, away, awayLogo, goalsHome, goalsAway }]
 *
 * Errori:
 *   405 — Metodo non consentito (solo GET)
 *   502 — Entrambi i provider non disponibili
 */

const cache = require('./_lib/cache');
const apiFootball = require('./_lib/api-football');
const footballData = require('./_lib/football-data');

const CACHE_KEY = 'matches';
const CACHE_TTL = 7200; // 2 ore

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Controlla la cache in-memory (sopravvive tra invocazioni warm)
  const cached = cache.get(CACHE_KEY);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');
    return res.status(200).json(cached);
  }

  try {
    // Provider primario: API-Football
    const matches = await apiFootball.getUpcomingMatches(10);
    cache.set(CACHE_KEY, matches, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');
    return res.status(200).json(matches);
  } catch (primaryErr) {
    console.error('API-Football matches failed:', primaryErr.message);
    try {
      // Fallback: football-data.org
      const matches = await footballData.getUpcomingMatches(10);
      cache.set(CACHE_KEY, matches, CACHE_TTL);
      res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');
      return res.status(200).json(matches);
    } catch (fallbackErr) {
      console.error('football-data.org matches failed:', fallbackErr.message);
      return res.status(502).json({ error: 'Unable to fetch matches from any source' });
    }
  }
};
