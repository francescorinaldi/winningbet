/**
 * POST /api/cron-tasks?task=settle|send
 *
 * Endpoint unificato per i task del cron job giornaliero.
 *
 * task=settle — Chiude i pronostici confrontando le previsioni con i risultati reali.
 *   Raggruppa i tips pendenti per lega e recupera i risultati di ciascuna.
 *
 * task=send — Invia i tips del giorno via Telegram ed email.
 *   Recupera i tips pendenti per oggi, li invia su Telegram e via email agli abbonati.
 *
 * Sicurezza: richiede CRON_SECRET nell'header Authorization.
 */

const { supabase } = require('./_lib/supabase');
const apiFootball = require('./_lib/api-football');
const footballData = require('./_lib/football-data');
const telegram = require('./_lib/telegram');
const { sendEmail, buildDailyDigest } = require('./_lib/email');
const { verifyCronSecret, hasAccess } = require('./_lib/auth-middleware');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { authorized, error: cronError } = verifyCronSecret(req);
  if (!authorized) {
    return res.status(401).json({ error: cronError });
  }

  const task = req.query.task;

  if (task === 'settle') {
    return handleSettle(req, res);
  }
  if (task === 'send') {
    return handleSend(req, res);
  }

  return res.status(400).json({ error: 'Parametro task richiesto: settle o send' });
};

// ─── Settle Handler ─────────────────────────────────────────────────────────

async function handleSettle(_req, res) {
  try {
    // 1. Recupera tips pendenti con partite gia' giocate
    const { data: pendingTips, error: fetchError } = await supabase
      .from('tips')
      .select('*')
      .eq('status', 'pending')
      .lt('match_date', new Date().toISOString())
      .order('match_date', { ascending: true });

    if (fetchError) {
      console.error('Failed to fetch pending tips:', fetchError.message);
      return res.status(500).json({ error: 'Errore nel recupero dei pronostici pendenti' });
    }

    if (!pendingTips || pendingTips.length === 0) {
      return res.status(200).json({ settled: 0, message: 'Nessun pronostico da chiudere' });
    }

    // 2. Raggruppa tips per lega
    const tipsByLeague = {};
    pendingTips.forEach(function (tip) {
      const league = tip.league || 'serie-a';
      if (!tipsByLeague[league]) tipsByLeague[league] = [];
      tipsByLeague[league].push(tip);
    });

    // 3. Per ogni lega, recupera risultati e chiudi i tips
    const settledResults = [];

    for (const [leagueSlug, tips] of Object.entries(tipsByLeague)) {
      let results;
      try {
        results = await apiFootball.getRecentResults(leagueSlug, 30);
      } catch (_primaryErr) {
        try {
          results = await footballData.getRecentResults(leagueSlug, 30);
        } catch (_fallbackErr) {
          console.error(`Could not fetch results for ${leagueSlug}, skipping`);
          continue;
        }
      }

      // Mappa risultati per match_id
      const resultsMap = new Map();
      results.forEach(function (r) {
        resultsMap.set(String(r.id), r);
      });

      // Confronta e chiudi ogni tip di questa lega
      for (const tip of tips) {
        const result = resultsMap.get(tip.match_id);

        if (!result || result.goalsHome === null || result.goalsAway === null) {
          continue;
        }

        const totalGoals = result.goalsHome + result.goalsAway;
        const actualResult = buildActualResult(result);
        const score = result.goalsHome + '-' + result.goalsAway;
        const status = evaluatePrediction(tip.prediction, result, totalGoals);

        const { error: updateError } = await supabase
          .from('tips')
          .update({ status: status, result: score })
          .eq('id', tip.id);

        if (updateError) {
          console.error(`Failed to update tip ${tip.id}:`, updateError.message);
          continue;
        }

        const { error: upsertError } = await supabase.from('tip_outcomes').upsert(
          {
            tip_id: tip.id,
            actual_result: actualResult,
          },
          { onConflict: 'tip_id' },
        );

        if (upsertError) {
          console.error(`Failed to upsert outcome for tip ${tip.id}:`, upsertError.message);
        }

        settledResults.push({
          match: tip.home_team + ' vs ' + tip.away_team,
          league: leagueSlug,
          prediction: tip.prediction,
          actual: actualResult,
          status: status,
        });
      }
    }

    // Settle schedine based on their tips' statuses
    let schedineSettled = 0;
    try {
      schedineSettled = await settleSchedule();
    } catch (schedErr) {
      console.error('settle-schedine error:', schedErr.message);
    }

    return res.status(200).json({
      settled: settledResults.length,
      results: settledResults,
      schedine_settled: schedineSettled,
    });
  } catch (err) {
    console.error('settle-tips error:', err);
    return res.status(500).json({ error: 'Errore nella chiusura dei pronostici' });
  }
}

/**
 * Settle schedine: una schedina e' vinta se TUTTI i suoi tips sono vinti,
 * persa se ALMENO uno e' perso, void se tutti sono void.
 * Resta pending se ci sono ancora tips non chiusi.
 */
async function settleSchedule() {
  let settled = 0;

  // Get all pending schedine
  const schedineResult = await supabase.from('schedine').select('id').eq('status', 'pending');

  if (schedineResult.error || !schedineResult.data || schedineResult.data.length === 0) {
    return 0;
  }

  for (const schedina of schedineResult.data) {
    // Get all tip statuses for this schedina
    const linksResult = await supabase
      .from('schedina_tips')
      .select('tip_id')
      .eq('schedina_id', schedina.id);

    if (linksResult.error || !linksResult.data || linksResult.data.length === 0) continue;

    const tipIds = linksResult.data.map(function (l) {
      return l.tip_id;
    });

    const tipsResult = await supabase.from('tips').select('status').in('id', tipIds);

    if (tipsResult.error || !tipsResult.data) continue;

    const statuses = tipsResult.data.map(function (t) {
      return t.status;
    });
    const hasPending = statuses.indexOf('pending') !== -1;
    const hasLost = statuses.indexOf('lost') !== -1;
    const allWon = statuses.every(function (s) {
      return s === 'won';
    });
    const allVoid = statuses.every(function (s) {
      return s === 'void';
    });
    const allWonOrVoid = statuses.every(function (s) {
      return s === 'won' || s === 'void';
    });

    let newStatus = null;

    if (hasLost) {
      newStatus = 'lost';
    } else if (allWon) {
      newStatus = 'won';
    } else if (allVoid) {
      newStatus = 'void';
    } else if (allWonOrVoid && !hasPending) {
      // Mix of won + void (no lost, no pending) — treat as won with reduced odds
      newStatus = 'won';
    }

    if (newStatus) {
      const updateResult = await supabase
        .from('schedine')
        .update({ status: newStatus })
        .eq('id', schedina.id);

      if (!updateResult.error) settled++;
    }
  }

  return settled;
}

// ─── Send Handler ───────────────────────────────────────────────────────────

async function handleSend(_req, res) {
  try {
    // 1. Recupera i tips di oggi
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0];

    const { data: tips, error: tipsError } = await supabase
      .from('tips')
      .select('*')
      .eq('status', 'pending')
      .gte('match_date', todayStr)
      .lt('match_date', tomorrowStr)
      .order('match_date', { ascending: true });

    if (tipsError) {
      console.error('Failed to fetch tips:', tipsError.message);
      return res.status(500).json({ error: 'Errore nel recupero dei pronostici' });
    }

    if (!tips || tips.length === 0) {
      return res.status(200).json({
        message: 'Nessun tip da inviare per oggi',
        telegram: { public: 0, private: 0 },
        email: { sent: 0, failed: 0 },
      });
    }

    // 2. Invia su Telegram
    const publicSent = await telegram.sendPublicTips(tips);
    const privateSent = await telegram.sendPrivateTips(tips);

    // 3. Invia email agli abbonati attivi
    const emailResult = await sendEmailDigest(tips);

    return res.status(200).json({
      tips_count: tips.length,
      telegram: { public: publicSent, private: privateSent },
      email: emailResult,
    });
  } catch (err) {
    console.error('send-tips error:', err);
    return res.status(500).json({ error: "Errore nell'invio dei pronostici" });
  }
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

async function sendEmailDigest(tips) {
  const { data: subscribers, error: subError } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('status', 'active');

  if (subError || !subscribers || subscribers.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const userIds = subscribers.map(function (s) {
    return s.user_id;
  });
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, tier')
    .in('user_id', userIds);

  const profileMap = new Map();
  (profiles || []).forEach(function (p) {
    profileMap.set(p.user_id, p);
  });

  const { data: authUsers } = await supabase.auth.admin.listUsers();

  const emailMap = new Map();
  if (authUsers && authUsers.users) {
    authUsers.users.forEach(function (u) {
      emailMap.set(u.id, u.email);
    });
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    const email = emailMap.get(sub.user_id);
    const userProfile = profileMap.get(sub.user_id);
    if (!email) continue;

    const userTier = (userProfile && userProfile.tier) || 'free';

    const accessibleTips = tips.filter(function (t) {
      return hasAccess(userTier, t.tier);
    });

    if (accessibleTips.length === 0) continue;

    const digest = buildDailyDigest(accessibleTips);

    try {
      const success = await sendEmail({
        to: email,
        subject: digest.subject,
        html: digest.html,
        text: digest.text,
      });

      if (success) sent++;
      else failed++;
    } catch (_err) {
      failed++;
    }
  }

  return { sent: sent, failed: failed };
}

function buildActualResult(result) {
  const score = result.goalsHome + '-' + result.goalsAway;
  const totalGoals = result.goalsHome + result.goalsAway;
  const parts = [score];

  if (result.goalsHome > result.goalsAway) parts.push('1');
  else if (result.goalsHome === result.goalsAway) parts.push('X');
  else parts.push('2');

  parts.push(totalGoals > 2 ? 'O2.5' : 'U2.5');
  parts.push(totalGoals > 1 ? 'O1.5' : 'U1.5');
  parts.push(result.goalsHome > 0 && result.goalsAway > 0 ? 'Goal' : 'NoGoal');

  return parts.join(', ');
}

function evaluatePrediction(prediction, result, totalGoals) {
  const homeWin = result.goalsHome > result.goalsAway;
  const draw = result.goalsHome === result.goalsAway;
  const awayWin = result.goalsAway > result.goalsHome;
  const bothScored = result.goalsHome > 0 && result.goalsAway > 0;

  switch (prediction) {
    case '1':
      return homeWin ? 'won' : 'lost';
    case 'X':
      return draw ? 'won' : 'lost';
    case '2':
      return awayWin ? 'won' : 'lost';
    case '1X':
      return homeWin || draw ? 'won' : 'lost';
    case 'X2':
      return draw || awayWin ? 'won' : 'lost';
    case '12':
      return homeWin || awayWin ? 'won' : 'lost';
    case 'Over 2.5':
      return totalGoals > 2 ? 'won' : 'lost';
    case 'Under 2.5':
      return totalGoals < 3 ? 'won' : 'lost';
    case 'Over 1.5':
      return totalGoals > 1 ? 'won' : 'lost';
    case 'Under 3.5':
      return totalGoals < 4 ? 'won' : 'lost';
    case 'Goal':
      return bothScored ? 'won' : 'lost';
    case 'No Goal':
      return !bothScored ? 'won' : 'lost';
    case '1 + Over 1.5':
      return homeWin && totalGoals > 1 ? 'won' : 'lost';
    case '2 + Over 1.5':
      return awayWin && totalGoals > 1 ? 'won' : 'lost';
    default:
      return 'void';
  }
}

// Named exports for direct require by generate-tips.js and fixtures.js
module.exports.handleSettle = handleSettle;
module.exports.handleSend = handleSend;
module.exports.evaluatePrediction = evaluatePrediction;
module.exports.buildActualResult = buildActualResult;
