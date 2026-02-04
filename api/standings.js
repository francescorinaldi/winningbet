/**
 * GET /api/standings
 *
 * Restituisce la classifica completa della Serie A.
 *
 * Provider primario: api-football.com (api-sports.io)
 * Fallback: football-data.org
 *
 * Cache: 6 ore in-memory + CDN s-maxage=21600
 *
 * Risposta 200: Array ordinato per posizione
 *   [{ rank, name, logo, points, played, win, draw, lose,
 *      goalsFor, goalsAgainst, goalDiff, form }]
 *
 * Errori:
 *   405 — Metodo non consentito (solo GET)
 *   502 — Entrambi i provider non disponibili
 *
 * Nota: questo endpoint e' attivo ma non ancora utilizzato dal frontend.
 */

const cache = require('./_lib/cache');
const apiFootball = require('./_lib/api-football');
const footballData = require('./_lib/football-data');

const CACHE_KEY = 'standings';
const CACHE_TTL = 21600; // 6 ore

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cached = cache.get(CACHE_KEY);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
    return res.status(200).json(cached);
  }

  try {
    // Provider primario: API-Football
    const standings = await apiFootball.getStandings();
    cache.set(CACHE_KEY, standings, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
    return res.status(200).json(standings);
  } catch (primaryErr) {
    console.error('API-Football standings failed:', primaryErr.message);
    try {
      // Fallback: football-data.org
      const standings = await footballData.getStandings();
      cache.set(CACHE_KEY, standings, CACHE_TTL);
      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
      return res.status(200).json(standings);
    } catch (fallbackErr) {
      console.error('football-data.org standings failed:', fallbackErr.message);
      return res.status(502).json({ error: 'Unable to fetch standings from any source' });
    }
  }
};
