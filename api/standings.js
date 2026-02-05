/**
 * GET /api/standings?league={slug}
 *
 * Restituisce la classifica completa della lega selezionata.
 * Default: serie-a se il parametro league e' omesso.
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
 */

const cache = require('./_lib/cache');
const apiFootball = require('./_lib/api-football');
const footballData = require('./_lib/football-data');
const { resolveLeagueSlug } = require('./_lib/leagues');

const CACHE_TTL = 21600; // 6 ore

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const leagueSlug = resolveLeagueSlug(req.query.league);
  const cacheKey = `standings_${leagueSlug}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
    return res.status(200).json(cached);
  }

  try {
    // Provider primario: API-Football
    const standings = await apiFootball.getStandings(leagueSlug);
    cache.set(cacheKey, standings, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
    return res.status(200).json(standings);
  } catch (primaryErr) {
    console.error('API-Football standings failed:', primaryErr.message);
    try {
      // Fallback: football-data.org
      const standings = await footballData.getStandings(leagueSlug);
      cache.set(cacheKey, standings, CACHE_TTL);
      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
      return res.status(200).json(standings);
    } catch (fallbackErr) {
      console.error('football-data.org standings failed:', fallbackErr.message);
      return res.status(502).json({ error: 'Unable to fetch standings from any source' });
    }
  }
};
