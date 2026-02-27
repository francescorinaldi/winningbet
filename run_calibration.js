process.loadEnvFile('.env.local');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function main() {
  const results = {};

  // Query 1: Per-prediction-type accuracy
  const { data: q1 } = await sb.from('tips')
    .select('prediction, status')
    .in('status', ['won', 'lost']);
  
  // Aggregate manually
  const predStats = {};
  (q1 || []).forEach(t => {
    if (!predStats[t.prediction]) predStats[t.prediction] = { total: 0, won: 0 };
    predStats[t.prediction].total++;
    if (t.status === 'won') predStats[t.prediction].won++;
  });
  const predAccuracy = Object.entries(predStats)
    .filter(([, s]) => s.total >= 3)
    .map(([pred, s]) => ({ prediction: pred, total: s.total, won: s.won, win_pct: Math.round(100 * s.won / s.total) }))
    .sort((a, b) => b.total - a.total);
  results.predictionAccuracy = predAccuracy;

  // Query 2: Confidence calibration
  const { data: q2 } = await sb.from('tips')
    .select('confidence, status')
    .in('status', ['won', 'lost']);
  
  const bands = { '60-69': { total: 0, won: 0, confSum: 0 }, '70-79': { total: 0, won: 0, confSum: 0 }, '80-95': { total: 0, won: 0, confSum: 0 } };
  (q2 || []).forEach(t => {
    let band;
    if (t.confidence >= 60 && t.confidence <= 69) band = '60-69';
    else if (t.confidence >= 70 && t.confidence <= 79) band = '70-79';
    else if (t.confidence >= 80 && t.confidence <= 95) band = '80-95';
    if (band) { bands[band].total++; bands[band].confSum += t.confidence; if (t.status === 'won') bands[band].won++; }
  });
  results.calibration = Object.entries(bands)
    .filter(([, b]) => b.total >= 5)
    .map(([band, b]) => ({ band, total: b.total, actual_pct: Math.round(100 * b.won / b.total), claimed_pct: Math.round(b.confSum / b.total) }));

  // Query 3: Active insights
  const { data: q3 } = await sb.from('prediction_insights')
    .select('scope, scope_value, insight_type, insight_text, sample_size')
    .eq('is_active', true)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('confidence_level', { ascending: false })
    .order('sample_size', { ascending: false })
    .limit(20);
  results.insights = q3 || [];

  // Query 4: Per-league accuracy from retrospectives
  const { data: q4 } = await sb.from('tip_retrospectives')
    .select('tip_id, actual_goals_total, edge_at_prediction, tips(league, status, predicted_probability)')
    .limit(500);
  
  const leagueStats = {};
  (q4 || []).forEach(r => {
    const t = r.tips;
    if (!t || !['won', 'lost'].includes(t.status)) return;
    const l = t.league;
    if (!leagueStats[l]) leagueStats[l] = { errors: [], edges: [], count: 0 };
    leagueStats[l].count++;
    if (r.actual_goals_total != null && t.predicted_probability) {
      leagueStats[l].errors.push(Math.abs(r.actual_goals_total - t.predicted_probability / 20.0));
    }
    if (t.status === 'won' && r.edge_at_prediction != null) leagueStats[l].edges.push(r.edge_at_prediction);
  });
  results.leagueAccuracy = Object.entries(leagueStats)
    .filter(([, s]) => s.count >= 5)
    .map(([league, s]) => ({
      league,
      avg_goal_error: s.errors.length ? (s.errors.reduce((a,b) => a+b, 0) / s.errors.length).toFixed(2) : null,
      avg_winning_edge: s.edges.length ? (s.edges.reduce((a,b) => a+b, 0) / s.edges.length).toFixed(2) : null,
      sample: s.count
    }));

  // Query 5: Lessons from recent losses
  const cutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  const { data: q5 } = await sb.from('tip_retrospectives')
    .select('lesson_learned, what_we_missed, error_category, tips(league, prediction)')
    .not('lesson_learned', 'is', null)
    .gt('created_at', cutoff)
    .limit(10);
  results.lessons = (q5 || []).filter(r => r.tips && r.tips.status === 'lost' || true).slice(0, 10);

  // Query 6: Strategy directives
  const { data: q6 } = await sb.from('strategy_directives')
    .select('directive_type, directive_text, parameters, impact_estimate')
    .eq('is_active', true)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(15);
  results.directives = q6 || [];

  // Query 7: Latest performance snapshot
  const { data: q7 } = await sb.from('performance_snapshots')
    .select('recommendations, snapshot_date, hit_rate, roi_flat, avg_odds')
    .order('created_at', { ascending: false })
    .limit(1);
  results.snapshot = q7 && q7[0] ? q7[0] : null;

  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
