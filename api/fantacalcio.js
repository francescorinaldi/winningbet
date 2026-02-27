/**
 * GET /api/fantacalcio?league={slug}
 *
 * Restituisce i consigli Fantacalcio della settimana corrente.
 * I picks sono generati dalla skill /fr3-generate-fantacalcio e
 * memorizzati nella tabella fantacalcio_picks.
 *
 * Parametri query:
 *   league (optional) — 'serie-a' | 'premier-league' (default: 'serie-a')
 *
 * Risposta 200:
 *   {
 *     league: 'serie-a',
 *     week: '2026-02-24',
 *     captains: [...],        — sempre visibili (free)
 *     differentials: [...],   — solo PRO/VIP (null per free con upgrade_required)
 *     transfers: {            — solo VIP (null per free/pro con upgrade_required)
 *       buy: [...],
 *       sell: [...]
 *     }
 *   }
 *
 * Comportamento tier:
 *   free  → captains visibili, differentials + transfers con upgrade_required
 *   pro   → captains + differentials visibili, transfers con upgrade_required
 *   vip   → tutto visibile
 *
 * Errori:
 *   401 — Non autenticato
 *   405 — Metodo non consentito
 */

const { supabase } = require('./_lib/supabase');
const { authenticate } = require('./_lib/auth-middleware');

const VALID_LEAGUES = ['serie-a', 'premier-league'];

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, profile, error: authError } = await authenticate(req);
  if (authError || !user) {
    return res.status(401).json({ error: 'Autenticazione richiesta' });
  }

  const userTier = (profile && profile.tier) || 'free';
  const league = VALID_LEAGUES.includes(req.query.league) ? req.query.league : 'serie-a';

  // Calcola il lunedì della settimana corrente (ISO week: lun=1)
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=dom, 1=lun, ..., 6=sab
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysToMonday);
  const weekDate = monday.toISOString().slice(0, 10);

  // Fetch picks della settimana corrente (RLS filtra per tier utente)
  const { data: picks, error } = await supabase
    .from('fantacalcio_picks')
    .select('pick_type, player_name, team_name, role, reasoning, tier, confidence, expected_points, ownership_pct, rank')
    .eq('league', league)
    .eq('week_date', weekDate)
    .order('pick_type')
    .order('rank');

  if (error) {
    console.error('Error fetching fantacalcio picks:', error.message);
    return res.status(500).json({ error: 'Errore nel recupero dei picks' });
  }

  // Raggruppa per tipo
  const byType = { captain: [], differential: [], buy: [], sell: [] };
  (picks || []).forEach((p) => {
    if (byType[p.pick_type]) byType[p.pick_type].push(p);
  });

  const canSeeDifferential = userTier === 'pro' || userTier === 'vip';
  const canSeeTransfers = userTier === 'vip';

  const response = {
    league,
    week: weekDate,
    captains: byType.captain,
    differentials: canSeeDifferential
      ? byType.differential
      : { upgrade_required: true, tier_needed: 'pro' },
    transfers: canSeeTransfers
      ? { buy: byType.buy, sell: byType.sell }
      : { upgrade_required: true, tier_needed: 'vip' },
  };

  // Cache 6 ore (picks cambiano solo una volta a settimana)
  res.setHeader('Cache-Control', 'private, s-maxage=21600, stale-while-revalidate=3600');
  return res.status(200).json(response);
};
