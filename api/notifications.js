/**
 * Notifications API — GET/PUT
 *
 * GET /api/notifications?limit=20&unread=true — List notifications
 * PUT /api/notifications — Mark notification(s) as read
 *
 * Requires JWT authentication.
 */

const { authenticate } = require('./_lib/auth-middleware');
const { supabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, error: authError } = await authenticate(req);
  if (authError) return res.status(401).json({ error: authError });

  if (req.method === 'GET') {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const unreadOnly = req.query.unread === 'true';

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('read', false);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Get unread count
    const { count, error: countError } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false);

    return res.status(200).json({
      notifications: data,
      unread_count: countError ? 0 : count,
    });
  }

  // PUT — mark as read
  const body = req.body || {};

  if (body.markAll) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (body.id) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', body.id)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Specificare id o markAll' });
};
