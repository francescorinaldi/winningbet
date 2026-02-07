/**
 * GET /api/tips?league={slug}
 *
 * Restituisce i pronostici filtrati per lega e tier utente.
 *
 * Comportamento:
 *   - Senza auth: restituisce solo tips FREE (pronostici base)
 *   - Con auth (JWT): restituisce tips in base al tier dell'utente
 *     - free: solo tips free
 *     - pro: tips free + pro
 *     - vip: tutti i tips (free + pro + vip)
 *
 * Query parameters:
 *   league (optional) — Slug della lega o 'all' per tutte (default: 'serie-a')
 *   status (optional) — 'pending', 'won', 'lost', 'void', o 'today' per tutti da oggi (default: 'pending')
 *   limit (optional) — Numero massimo di tips (default: 10, max: 50)
 *
 * Per status=pending, include anche match gia' iniziati (da inizio giornata UTC).
 *
 * Risposta 200: Array di oggetti tip
 *   [{ id, match_id, home_team, away_team, match_date, prediction, odds,
 *      confidence, analysis, tier, status, league, created_at }]
 *
 * Errori:
 *   405 — Metodo non consentito (solo GET)
 */

const cache = require('./_lib/cache');
const { supabase } = require('./_lib/supabase');
const { authenticate, hasAccess } = require('./_lib/auth-middleware');
const { resolveLeagueSlug } = require('./_lib/leagues');

const CACHE_TTL = 900; // 15 minuti

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isAllLeagues = req.query.league === 'all';
  const leagueSlug = isAllLeagues ? 'all' : resolveLeagueSlug(req.query.league);
  const validStatuses = ['pending', 'won', 'lost', 'void', 'today'];
  const status = validStatuses.includes(req.query.status) ? req.query.status : 'pending';
  const isToday = status === 'today';
  const parsedLimit = parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(parsedLimit > 0 ? parsedLimit : 10, 1), 50);

  // Determina il tier dell'utente (se autenticato)
  let userTier = 'free';
  const { profile } = await authenticate(req);
  if (profile) {
    userTier = profile.tier;
  }

  // Cache key include tier e lega per evitare di servire dati sbagliati
  const cacheKey = `tips_${leagueSlug}_${userTier}_${status}_${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(cached);
  }

  try {
    // Costruisce la query per i tips accessibili al tier dell'utente
    const accessibleTiers = [];
    if (hasAccess(userTier, 'free')) accessibleTiers.push('free');
    if (hasAccess(userTier, 'pro')) accessibleTiers.push('pro');
    if (hasAccess(userTier, 'vip')) accessibleTiers.push('vip');

    let query = supabase
      .from('tips')
      .select('*')
      .in('tier', accessibleTiers);

    // status=today: tutti gli status da inizio giornata (pending + settled)
    if (!isToday) {
      query = query.eq('status', status);
    }

    // Filtra per lega (skip per 'all')
    if (!isAllLeagues) {
      query = query.eq('league', leagueSlug);
    }

    // Per pending e today: filtra da inizio giornata
    if (status === 'pending' || isToday) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      query = query.gte('match_date', today.toISOString());
    }

    const { data: tips, error } = await query
      .order('match_date', { ascending: status === 'pending' || isToday })
      .limit(limit);

    if (error) {
      console.error('Tips query error:', error.message);
      return res.status(500).json({ error: 'Errore nel recupero dei pronostici' });
    }

    const result = tips || [];

    cache.set(cacheKey, result, CACHE_TTL);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (err) {
    console.error('Tips endpoint error:', err);
    return res.status(500).json({ error: 'Errore nel recupero dei pronostici' });
  }
};
