/**
 * Activity Tracking API — GET/POST
 *
 * POST /api/activity — Registers today's visit, updates streak
 * GET  /api/activity — Returns activity stats
 *
 * Requires JWT authentication.
 */

const { authenticate } = require('./_lib/auth-middleware');
const { supabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, error: authError } = await authenticate(req);
  if (authError) return res.status(401).json({ error: authError });

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
};
