/**
 * User Bets API — GET/POST/PUT/DELETE
 *
 * GET    /api/user-bets           — List all followed tips
 * GET    /api/user-bets?tipId=X   — Get single bet
 * POST   /api/user-bets           — Follow a tip
 * PUT    /api/user-bets           — Update a bet (stake, notes)
 * DELETE /api/user-bets?tipId=X   — Unfollow a tip
 *
 * Requires JWT authentication.
 */

const { authenticate } = require('./_lib/auth-middleware');
const { supabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  const allowed = ['GET', 'POST', 'PUT', 'DELETE'];
  if (allowed.indexOf(req.method) === -1) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, error: authError } = await authenticate(req);
  if (authError) return res.status(401).json({ error: authError });

  // GET — list or single
  if (req.method === 'GET') {
    const tipId = req.query.tipId;

    if (tipId) {
      const { data, error } = await supabase
        .from('user_bets')
        .select('*, tips(*)')
        .eq('user_id', user.id)
        .eq('tip_id', tipId)
        .single();

      if (error && error.code === 'PGRST116') return res.status(404).json({ error: 'Not found' });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    const { data, error } = await supabase
      .from('user_bets')
      .select('*, tips(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST — follow a tip
  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.tip_id) return res.status(400).json({ error: 'tip_id richiesto' });

    const { data, error } = await supabase
      .from('user_bets')
      .insert({
        user_id: user.id,
        tip_id: body.tip_id,
        followed: body.followed !== false,
        stake: body.stake || null,
        notes: body.notes || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Tip gi\u00E0 seguito' });
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
  }

  // PUT — update a bet
  if (req.method === 'PUT') {
    const body = req.body || {};
    if (!body.tip_id) return res.status(400).json({ error: 'tip_id richiesto' });

    const updates = { updated_at: new Date().toISOString() };
    if (body.stake !== undefined) updates.stake = body.stake;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.followed !== undefined) updates.followed = body.followed;

    const { data, error } = await supabase
      .from('user_bets')
      .update(updates)
      .eq('user_id', user.id)
      .eq('tip_id', body.tip_id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE — unfollow a tip
  if (req.method === 'DELETE') {
    const tipId = req.query.tipId;
    if (!tipId) return res.status(400).json({ error: 'tipId query parameter richiesto' });

    const { error } = await supabase
      .from('user_bets')
      .delete()
      .eq('user_id', user.id)
      .eq('tip_id', tipId);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }
};
