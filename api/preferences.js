/**
 * User Preferences API — GET/PUT
 *
 * GET  /api/preferences — Returns user preferences (auto-creates on first access)
 * PUT  /api/preferences — Updates user preferences
 *
 * Requires JWT authentication.
 */

const { authenticate } = require('./_lib/auth-middleware');
const { supabase } = require('./_lib/supabase');

const VALID_LEAGUES = ['serie-a', 'serie-b', 'champions-league', 'la-liga', 'premier-league'];

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, error: authError } = await authenticate(req);
  if (authError) return res.status(401).json({ error: authError });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Auto-create default preferences on first access (PGRST116 = no rows)
    if (error && error.code === 'PGRST116') {
      const { data: newPrefs, error: insertError } = await supabase
        .from('user_preferences')
        .insert({ user_id: user.id })
        .select()
        .single();

      if (insertError) return res.status(500).json({ error: insertError.message });
      return res.status(200).json(newPrefs);
    }

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // PUT — update preferences
  const body = req.body || {};
  const updates = { updated_at: new Date().toISOString() };

  if (body.preferred_league !== undefined) {
    if (VALID_LEAGUES.indexOf(body.preferred_league) === -1) {
      return res.status(400).json({ error: 'Lega non valida' });
    }
    updates.preferred_league = body.preferred_league;
  }

  if (body.favorite_teams !== undefined) {
    if (!Array.isArray(body.favorite_teams)) {
      return res.status(400).json({ error: 'favorite_teams deve essere un array' });
    }
    if (body.favorite_teams.length > 20) {
      return res.status(400).json({ error: 'Massimo 20 squadre preferite' });
    }
    // Sanitize team names
    updates.favorite_teams = body.favorite_teams
      .filter(function (t) {
        return typeof t === 'string' && t.trim().length > 0;
      })
      .map(function (t) {
        return t.trim().slice(0, 100);
      });
  }

  if (body.notification_tips !== undefined) {
    if (typeof body.notification_tips !== 'boolean') {
      return res.status(400).json({ error: 'notification_tips deve essere booleano' });
    }
    updates.notification_tips = body.notification_tips;
  }

  if (body.notification_results !== undefined) {
    if (typeof body.notification_results !== 'boolean') {
      return res.status(400).json({ error: 'notification_results deve essere booleano' });
    }
    updates.notification_results = body.notification_results;
  }

  const { data, error } = await supabase
    .from('user_preferences')
    .update(updates)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data);
};
