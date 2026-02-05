/**
 * GET /api/matches?league={slug}
 *
 * Restituisce le prossime 10 partite della lega selezionata.
 * Default: serie-a se il parametro league e' omesso.
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
const { resolveLeagueSlug } = require('./_lib/leagues');

const CACHE_TTL = 7200; // 2 ore

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const leagueSlug = resolveLeagueSlug(req.query.league);
  const cacheKey = `matches_${leagueSlug}`;

  // Controlla la cache in-memory (sopravvive tra invocazioni warm)
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');
    return res.status(200).json(cached);
  }

  try {
    // Provider primario: API-Football
    const matches = await apiFootball.getUpcomingMatches(leagueSlug, 10);
    cache.set(cacheKey, matches, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');
    return res.status(200).json(matches);
  } catch (primaryErr) {
    console.error('API-Football matches failed:', primaryErr.message);
    try {
      // Fallback: football-data.org
      const matches = await footballData.getUpcomingMatches(leagueSlug, 10);
      cache.set(cacheKey, matches, CACHE_TTL);
      res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');
      return res.status(200).json(matches);
    } catch (fallbackErr) {
      console.error('football-data.org matches failed:', fallbackErr.message);
      return res.status(502).json({ error: 'Unable to fetch matches from any source' });
    }
  }
};
