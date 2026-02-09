/**
 * GET /api/betting-slips?date={YYYY-MM-DD}
 *
 * Restituisce le schedine del giorno con i tips associati.
 *
 * Comportamento:
 *   - Senza auth: 401
 *   - Con auth (JWT): restituisce schedine in base al tier dell'utente
 *     - free: nessuna schedina (upgrade prompt)
 *     - pro: solo schedina Sicura (tier=pro)
 *     - vip: tutte le schedine (Sicura + Equilibrata + Azzardo)
 *
 * Query parameters:
 *   date (optional) — Data in formato YYYY-MM-DD (default: oggi)
 *   status (optional) — 'pending', 'won', 'lost', 'void' (default: tutti)
 *
 * Risposta 200:
 *   { schedine: [{ ...schedina, tips: [{ ...tip, position }] }], budget_summary: { ... } }
 *
 * Errori:
 *   401 — Non autenticato
 *   403 — Tier insufficiente (free)
 *   405 — Metodo non consentito
 */

const cache = require('./_lib/cache');
const { supabase } = require('./_lib/supabase');
const { authenticate, hasAccess } = require('./_lib/auth-middleware');

const CACHE_TTL = 900; // 15 minuti

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth required
  const { user, profile, error: authError } = await authenticate(req);
  if (authError || !user) {
    return res.status(401).json({ error: 'Autenticazione richiesta' });
  }

  const userTier = (profile && profile.tier) || 'free';

  if (userTier === 'free') {
    return res.status(403).json({
      error: 'Upgrade richiesto',
      message: 'Le schedine intelligenti sono disponibili per abbonati PRO e VIP.',
    });
  }

  // Parse date parameter
  const dateParam = req.query.date;
  let targetDate;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    targetDate = dateParam;
  } else {
    targetDate = new Date().toISOString().split('T')[0];
  }

  const statusFilter = req.query.status;
  const validStatuses = ['pending', 'won', 'lost', 'void'];

  // Cache key include tier e data
  const cacheKey = 'schedine_' + targetDate + '_' + userTier + '_' + (statusFilter || 'all');
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(cached);
  }

  try {
    // Determine accessible tiers for schedine
    const accessibleTiers = [];
    if (hasAccess(userTier, 'pro')) accessibleTiers.push('pro');
    if (hasAccess(userTier, 'vip')) accessibleTiers.push('vip');

    // Query schedine for the target date
    let query = supabase
      .from('schedine')
      .select('*')
      .eq('match_date', targetDate)
      .in('tier', accessibleTiers)
      .order('risk_level', { ascending: true });

    if (statusFilter && validStatuses.indexOf(statusFilter) !== -1) {
      query = query.eq('status', statusFilter);
    }

    const schedineResult = await query;

    if (schedineResult.error) {
      console.error('Schedine query error:', schedineResult.error.message);
      return res.status(500).json({ error: 'Errore nel recupero delle schedine' });
    }

    const schedine = schedineResult.data || [];

    if (schedine.length === 0) {
      const emptyResult = { schedine: [], budget_summary: null };
      cache.set(cacheKey, emptyResult, CACHE_TTL);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(emptyResult);
    }

    // Fetch associated tips for each schedina
    const schedineIds = schedine.map(function (s) {
      return s.id;
    });

    const linksResult = await supabase
      .from('schedina_tips')
      .select('schedina_id, tip_id, position')
      .in('schedina_id', schedineIds)
      .order('position', { ascending: true });

    if (linksResult.error) {
      console.error('Schedina tips query error:', linksResult.error.message);
      return res.status(500).json({ error: 'Errore nel recupero dei tips della schedina' });
    }

    const links = linksResult.data || [];

    // Fetch full tip data
    const tipIds = links.map(function (l) {
      return l.tip_id;
    });
    const uniqueTipIds = tipIds.filter(function (id, i) {
      return tipIds.indexOf(id) === i;
    });

    let tipsData = [];
    if (uniqueTipIds.length > 0) {
      const tipsResult = await supabase
        .from('tips')
        .select(
          'id, match_id, home_team, away_team, match_date, prediction, odds, confidence, analysis, tier, status, league',
        )
        .in('id', uniqueTipIds);

      if (!tipsResult.error && tipsResult.data) {
        tipsData = tipsResult.data;
      }
    }

    // Build tips map
    const tipsMap = {};
    tipsData.forEach(function (t) {
      tipsMap[t.id] = t;
    });

    // Build links map (schedina_id -> tips[])
    const linksMap = {};
    links.forEach(function (l) {
      if (!linksMap[l.schedina_id]) linksMap[l.schedina_id] = [];
      const tip = tipsMap[l.tip_id];
      if (tip) {
        linksMap[l.schedina_id].push({
          position: l.position,
          id: tip.id,
          home_team: tip.home_team,
          away_team: tip.away_team,
          match_date: tip.match_date,
          prediction: tip.prediction,
          odds: tip.odds,
          confidence: tip.confidence,
          analysis: tip.analysis,
          status: tip.status,
          league: tip.league,
        });
      }
    });

    // Assemble final response
    const enrichedSchedule = schedine.map(function (s) {
      return {
        id: s.id,
        name: s.name,
        risk_level: s.risk_level,
        combined_odds: s.combined_odds,
        suggested_stake: s.suggested_stake,
        expected_return: s.expected_return,
        confidence_avg: s.confidence_avg,
        strategy: s.strategy,
        status: s.status,
        match_date: s.match_date,
        tier: s.tier,
        budget_reference: s.budget_reference,
        created_at: s.created_at,
        tips: linksMap[s.id] || [],
      };
    });

    // Budget summary
    const totalStake = schedine.reduce(function (sum, s) {
      return sum + parseFloat(s.suggested_stake);
    }, 0);
    const budgetRef = schedine[0] ? parseFloat(schedine[0].budget_reference) : 0;

    const result = {
      schedine: enrichedSchedule,
      budget_summary: {
        budget: budgetRef,
        total_stake: parseFloat(totalStake.toFixed(2)),
        reserve: parseFloat((budgetRef - totalStake).toFixed(2)),
        schedine_count: schedine.length,
      },
    };

    cache.set(cacheKey, result, CACHE_TTL);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (err) {
    console.error('Schedina endpoint error:', err);
    return res.status(500).json({ error: 'Errore nel recupero delle schedine' });
  }
};
