/**
 * GET /api/odds?fixture={id}
 *
 * Restituisce le quote Match Winner (1X2) per una partita specifica.
 * Fonte: Bet365 via api-football.com.
 *
 * Nessun fallback — solo api-football.com fornisce le quote.
 *
 * Query parameters:
 *   fixture (required) — ID della partita (ottenuto da /api/matches)
 *
 * Cache: 30 minuti in-memory + CDN s-maxage=1800
 *
 * Risposta 200: Oggetto quote o null se non disponibili
 *   { fixtureId, bookmaker, values: [{ outcome, odd }] }
 *
 * Errori:
 *   400 — Parametro "fixture" mancante
 *   405 — Metodo non consentito (solo GET)
 *   502 — Provider non disponibile
 */

const cache = require('./_lib/cache');
const apiFootball = require('./_lib/api-football');

const CACHE_TTL = 1800; // 30 minuti

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const fixtureId = req.query.fixture;
  if (!fixtureId) {
    return res.status(400).json({ error: 'Missing "fixture" query parameter' });
  }

  // Cache per fixture ID (ogni partita ha la sua entry)
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
