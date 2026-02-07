/**
 * /api/user-settings?resource=activity|notifications|preferences
 *
 * Endpoint unificato per le impostazioni e i dati utente.
 *
 * resource=activity    — GET/POST: statistiche attivita' e streak
 * resource=notifications — GET/PUT: lista notifiche e mark-as-read
 * resource=preferences — GET/PUT: preferenze utente (lega, squadre, toggle)
 *
 * Richiede JWT authentication per tutte le risorse.
 */

const { authenticate } = require('./_lib/auth-middleware');
const { supabase } = require('./_lib/supabase');

const VALID_LEAGUES = ['serie-a', 'champions-league', 'la-liga', 'premier-league'];

module.exports = async function handler(req, res) {
  const { user, error: authError } = await authenticate(req);
  if (authError) return res.status(401).json({ error: authError });

  const resource = req.query.resource;

  if (resource === 'activity') {
    return handleActivity(req, res, user);
  }
  if (resource === 'notifications') {
    return handleNotifications(req, res, user);
  }
  if (resource === 'preferences') {
    return handlePreferences(req, res, user);
  }

  return res
    .status(400)
    .json({ error: 'Parametro resource richiesto: activity, notifications o preferences' });
};

// ─── Activity ───────────────────────────────────────────────────────────────

async function handleActivity(req, res, user) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('profiles')
      .select('current_streak, longest_streak, last_visit_date, total_visits')
      .eq('user_id', user.id)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST — register visit and update streak
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('current_streak, longest_streak, last_visit_date, total_visits')
    .eq('user_id', user.id)
    .single();

  if (fetchError) return res.status(500).json({ error: fetchError.message });

  const today = new Date().toISOString().split('T')[0];
  const lastVisit = profile.last_visit_date;

  // Already visited today
  if (lastVisit === today) {
    return res.status(200).json({
      current_streak: profile.current_streak,
      longest_streak: profile.longest_streak,
      total_visits: profile.total_visits,
      last_visit_date: lastVisit,
      is_new_day: false,
    });
  }

  // Calculate streak
  let newStreak = 1;
  if (lastVisit) {
    const lastDate = new Date(lastVisit);
    const todayDate = new Date(today);
    const diffDays = Math.round((todayDate - lastDate) / 86400000);

    if (diffDays === 1) {
      // Yesterday — increment streak
      newStreak = (profile.current_streak || 0) + 1;
    }
    // If > 1 day gap, streak resets to 1
  }

  const newLongest = Math.max(newStreak, profile.longest_streak || 0);
  const newVisits = (profile.total_visits || 0) + 1;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      current_streak: newStreak,
      longest_streak: newLongest,
      last_visit_date: today,
      total_visits: newVisits,
    })
    .eq('user_id', user.id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  return res.status(200).json({
    current_streak: newStreak,
    longest_streak: newLongest,
    total_visits: newVisits,
    last_visit_date: today,
    is_new_day: true,
  });
}

// ─── Notifications ──────────────────────────────────────────────────────────

async function handleNotifications(req, res, user) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}

// ─── Preferences ────────────────────────────────────────────────────────────

async function handlePreferences(req, res, user) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}
