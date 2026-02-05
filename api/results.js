/**
 * GET /api/results?league={slug}
 *
 * Restituisce gli ultimi 10 risultati della lega selezionata (partite concluse).
 * Default: serie-a se il parametro league e' omesso.
 *
 * Provider primario: api-football.com (api-sports.io)
 * Fallback: football-data.org
 *
 * Cache: 1 ora in-memory + CDN s-maxage=3600
 *
 * Risposta 200: Array di oggetti risultato
 *   [{ id, date, home, homeLogo, away, awayLogo, goalsHome, goalsAway, status }]
 *
 * Errori:
 *   405 — Metodo non consentito (solo GET)
 *   502 — Entrambi i provider non disponibili
 */

const cache = require('./_lib/cache');
const apiFootball = require('./_lib/api-football');
const footballData = require('./_lib/football-data');
const { resolveLeagueSlug } = require('./_lib/leagues');

const CACHE_TTL = 3600; // 1 ora

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const leagueSlug = resolveLeagueSlug(req.query.league);
  const cacheKey = `results_${leagueSlug}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    return res.status(200).json(cached);
  }

  try {
    // Provider primario: API-Football
    const results = await apiFootball.getRecentResults(leagueSlug, 10);
    cache.set(cacheKey, results, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    return res.status(200).json(results);
  } catch (primaryErr) {
    console.error('API-Football results failed:', primaryErr.message);
    try {
      // Fallback: football-data.org
      const results = await footballData.getRecentResults(leagueSlug, 10);
      cache.set(cacheKey, results, CACHE_TTL);
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
      return res.status(200).json(results);
    } catch (fallbackErr) {
      console.error('football-data.org results failed:', fallbackErr.message);
      return res.status(502).json({ error: 'Unable to fetch results from any source' });
    }
  }
};
