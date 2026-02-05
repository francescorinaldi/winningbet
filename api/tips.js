/**
 * GET /api/tips?league={slug}
 *
 * Restituisce i pronostici attivi (prossime partite).
 * Default: serie-a se il parametro league e' omesso.
 *
 * Comportamento:
 *   - Senza auth: restituisce solo tips FREE (pronostici base)
 *   - Con auth (JWT): restituisce tips in base al tier dell'utente
 *     - free: solo tips free
 *     - pro: tips free + pro
 *     - vip: tutti i tips (free + pro + vip)
 *
 * Query parameters:
 *   league (optional) — Slug della lega (default: 'serie-a')
 *   status (optional) — Filtra per stato: 'pending', 'won', 'lost', 'void' (default: 'pending')
 *   limit (optional) — Numero massimo di tips (default: 10, max: 50)
 *
 * Cache: 15 minuti in-memory + CDN s-maxage=900
 *
 * Risposta 200: Array di oggetti tip
 *   [{ id, match_id, home_team, away_team, match_date, prediction, odds,
 *      confidence, analysis, tier, status, created_at }]
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

  const leagueSlug = resolveLeagueSlug(req.query.league);
  const status = req.query.status || 'pending';
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

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
    res.setHeader('Cache-Control', 'private, s-maxage=900, stale-while-revalidate=300');
    return res.status(200).json(cached);
  }

  try {
    // Costruisce la query per i tips accessibili al tier dell'utente
    const accessibleTiers = [];
    if (hasAccess(userTier, 'free')) accessibleTiers.push('free');
    if (hasAccess(userTier, 'pro')) accessibleTiers.push('pro');
    if (hasAccess(userTier, 'vip')) accessibleTiers.push('vip');

    const { data: tips, error } = await supabase
      .from('tips')
      .select('*')
      .eq('league', leagueSlug)
      .in('tier', accessibleTiers)
      .eq('status', status)
      .gte('match_date', new Date().toISOString())
      .order('match_date', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Tips query error:', error.message);
      return res.status(500).json({ error: 'Errore nel recupero dei pronostici' });
    }

    // Per utenti non autenticati o free, oscura analisi dei tips pro/vip
    const sanitizedTips = (tips || []).map((tip) => {
      if (tip.tier === 'free' || hasAccess(userTier, tip.tier)) {
        return tip;
      }
      // Questo non dovrebbe succedere con la query .in() sopra,
      // ma e' un livello extra di sicurezza
      return {
        ...tip,
        prediction: null,
        odds: null,
        analysis: null,
      };
    });

    cache.set(cacheKey, sanitizedTips, CACHE_TTL);
    res.setHeader('Cache-Control', 'private, s-maxage=900, stale-while-revalidate=300');
    return res.status(200).json(sanitizedTips);
  } catch (err) {
    console.error('Tips endpoint error:', err);
    return res.status(500).json({ error: 'Errore nel recupero dei pronostici' });
  }
};
