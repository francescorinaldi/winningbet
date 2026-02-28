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
const { evaluatePrediction, buildActualResult } = require('./_lib/prediction-utils');

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
      return res
        .status(200)
        .json({ settled: 0, skipped_manual: 0, message: 'Nessun pronostico da chiudere' });
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
    let skippedManual = 0;
    // Raccoglie gli ID dei tip appena chiusi come 'lost' (cross-league) per l'anti-churn
    const allSettledLostIds = new Set();

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

      // Confronta e prepara aggiornamenti per ogni tip di questa lega
      const tipUpdates = [];
      const outcomeUpserts = [];

      for (const tip of tips) {
        const result = resultsMap.get(tip.match_id);

        if (!result || result.goalsHome === null || result.goalsAway === null) {
          continue;
        }

        const totalGoals = result.goalsHome + result.goalsAway;
        const actualResult = buildActualResult(result);
        const score = result.goalsHome + '-' + result.goalsAway;
        // null = prediction requires extras (corners/cards) not available via cron
        // These tips must be settled manually via /fr3-settle-tips skill
        const status = evaluatePrediction(tip.prediction, result, totalGoals);
        if (status === null) {
          skippedManual++;
          continue;
        }

        tipUpdates.push({ id: tip.id, status: status, result: score });
        outcomeUpserts.push({ tip_id: tip.id, actual_result: actualResult });
        if (status === 'lost') allSettledLostIds.add(tip.id);

        settledResults.push({
          match: tip.home_team + ' vs ' + tip.away_team,
          league: leagueSlug,
          prediction: tip.prediction,
          actual: actualResult,
          status: status,
        });
      }

      // Batch tip updates grouped by (status, result) — avoids N+1
      const updateGroups = {};
      tipUpdates.forEach(function (u) {
        const key = u.status + '|' + u.result;
        if (!updateGroups[key]) updateGroups[key] = [];
        updateGroups[key].push(u.id);
      });

      for (const [key, ids] of Object.entries(updateGroups)) {
        const [status, result] = key.split('|');
        const { error: updateError } = await supabase
          .from('tips')
          .update({ status: status, result: result })
          .in('id', ids);

        if (updateError) {
          console.error('Failed to batch update tips:', updateError.message);
        }
      }

      // Bulk upsert tip outcomes in a single call
      if (outcomeUpserts.length > 0) {
        const { error: upsertError } = await supabase
          .from('tip_outcomes')
          .upsert(outcomeUpserts, { onConflict: 'tip_id' });

        if (upsertError) {
          console.error('Failed to batch upsert outcomes:', upsertError.message);
        }
      }
    }

    // Settle schedine based on their tips' statuses
    let schedineSettled = 0;
    try {
      schedineSettled = await settleSchedule();
    } catch (schedErr) {
      console.error('settle-schedine error:', schedErr.message);
    }

    // Anti-churn: invia DM proattivo agli utenti PRO/VIP con 5 tip negative consecutive.
    // Si attiva solo quando il tip appena chiuso è quello che causa la 5a perdita di fila,
    // evitando di rispedire il DM nei giorni successivi di una stessa streak.
    let antiChurnDmsSent = 0;
    try {
      antiChurnDmsSent = await triggerAntiChurnDMs(allSettledLostIds);
    } catch (antiChurnErr) {
      console.error('anti-churn error:', antiChurnErr.message);
    }

    return res.status(200).json({
      settled: settledResults.length,
      skipped_manual: skippedManual,
      results: settledResults,
      schedine_settled: schedineSettled,
      anti_churn_dms_sent: antiChurnDmsSent,
    });
  } catch (err) {
    console.error('settle-tips error:', err);
    return res.status(500).json({ error: 'Errore nella chiusura dei pronostici' });
  }
}

// ─── Anti-churn ─────────────────────────────────────────────────────────────

/**
 * Escape dei caratteri speciali per MarkdownV2 (locale a questo modulo).
 * @param {string|number} s
 * @returns {string}
 */
function escapeMd(s) {
  return String(s).replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Costruisce il messaggio DM di contestualizzazione per l'anti-churn.
 *
 * @param {number} winRate - Win rate storico aggregato (0-100)
 * @param {number} totalSettled - Numero totale di tip chiusi storicamente
 * @returns {string} Messaggio formattato in MarkdownV2
 */
function buildAntiChurnMessage(winRate, totalSettled) {
  return [
    '\uD83D\uDCCA *Una nota sul lungo periodo*',
    '',
    'Hai attraversato un momento negativo\\. Nel betting professionale, anche i migliori sistemi attraversano drawdown\\.',
    '',
    'Ci\u00F2 che conta \u00e8 il *ROI su 100\\+ tip*, non la settimana corrente\\.',
    '',
    '\uD83D\uDCC8 *I nostri dati storici aggregati:*',
    '\u251C Win Rate: *' + escapeMd(winRate) + '%*',
    '\u2514 Tip analizzati: *' + escapeMd(totalSettled) + '*',
    '',
    '_Il momento difficile fa parte della strategia\\. I trader disciplinati lo attraversano senza cambiare rotta\\._',
    '',
    'Vuoi mettere in pausa l\'abbonamento per 2 settimane invece di cancellare\\? Scrivici \\-\\- nessun problema\\. \uD83D\uDE4F',
  ].join('\n');
}

/**
 * Invia un DM di contestualizzazione agli utenti PRO/VIP che hanno subito
 * 5 tip negative consecutive, ma SOLO quando l'ultimo tip perso è stato
 * appena chiuso in questo cron run (evita di rispedire DM identici il giorno dopo).
 *
 * Logica: per ogni utente PRO/VIP con telegram_user_id, recupera gli ultimi 6
 * tip chiusi accessibili al suo tier, ordinati per match_date DESC.
 * Se i primi 5 sono tutti 'lost' E il più recente è in justSettledLostIds
 * (appena chiuso), il trigger è scattato → invia DM.
 * Se anche il 6° è 'lost', la streak è già > 5 e il DM fu già inviato ieri.
 *
 * @param {Set<string>} justSettledLostIds - ID dei tip appena chiusi come 'lost'
 * @returns {Promise<number>} Numero di DM inviati
 */
async function triggerAntiChurnDMs(justSettledLostIds) {
  if (!justSettledLostIds || justSettledLostIds.size === 0) return 0;

  // Utenti PRO/VIP con telegram_user_id configurato
  const { data: premiumUsers, error: usersError } = await supabase
    .from('profiles')
    .select('user_id, tier, telegram_user_id')
    .in('tier', ['pro', 'vip'])
    .not('telegram_user_id', 'is', null);

  if (usersError || !premiumUsers || premiumUsers.length === 0) return 0;

  // Recupera i dati aggregati globali per il messaggio (unica query per tutti gli utenti)
  const { data: allSettled } = await supabase
    .from('tips')
    .select('status, odds')
    .in('status', ['won', 'lost']);

  const globalWon = (allSettled || []).filter(function (t) { return t.status === 'won'; }).length;
  const globalTotal = (allSettled || []).length;
  const globalWinRate = globalTotal > 0 ? Math.round((globalWon / globalTotal) * 100) : 0;

  let dmsSent = 0;

  for (const profile of premiumUsers) {
    try {
      // Tier VIP vede tutti i tier; PRO vede free + pro
      const tierFilter = profile.tier === 'vip' ? ['free', 'pro', 'vip'] : ['free', 'pro'];

      // Ultimi 6 tip chiusi per questo tier, più recenti prima
      const { data: recentTips } = await supabase
        .from('tips')
        .select('id, status, match_date')
        .in('status', ['won', 'lost', 'void'])
        .in('tier', tierFilter)
        .order('match_date', { ascending: false })
        .limit(6);

      if (!recentTips || recentTips.length < 5) continue;

      const last5 = recentTips.slice(0, 5);
      const allLost = last5.every(function (t) { return t.status === 'lost'; });

      // Il tip più recente deve essere appena stato chiuso in questo cron run
      const latestIsNew = justSettledLostIds.has(last5[0].id);

      // Se il 6° esiste ed è anch'esso 'lost', la streak era già >= 5 ieri → non rinviare
      const sixthIsLost = recentTips.length >= 6 && recentTips[5].status === 'lost';

      if (!allLost || !latestIsNew || sixthIsLost) continue;

      const message = buildAntiChurnMessage(globalWinRate, globalTotal);
      await telegram.sendDirectMessage(profile.telegram_user_id, message);
      dmsSent++;

      console.log('[anti-churn] DM inviato a utente', profile.user_id, '(5 tip perse consecutive)');
    } catch (userErr) {
      console.error('[anti-churn] errore per utente', profile.user_id, ':', userErr.message);
    }
  }

  return dmsSent;
}

/**
 * Settle schedine: una schedina e' vinta se TUTTI i suoi tips sono vinti,
 * persa se ALMENO uno e' perso, void se tutti sono void.
 * Resta pending se ci sono ancora tips non chiusi.
 */
async function settleSchedule() {
  // Single join query: schedine → schedina_tips → tips (avoids N+1)
  const { data: schedine, error: schedineError } = await supabase
    .from('schedine')
    .select('id, schedina_tips(tip_id, tips(status))')
    .eq('status', 'pending');

  if (schedineError || !schedine || schedine.length === 0) {
    return 0;
  }

  // Determine new status for each schedina in memory
  const statusGroups = {}; // { newStatus: [schedina_ids] }

  for (const schedina of schedine) {
    const tipLinks = schedina.schedina_tips || [];
    if (tipLinks.length === 0) continue;

    const statuses = tipLinks.map(function (link) {
      return link.tips ? link.tips.status : 'pending';
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
      if (!statusGroups[newStatus]) statusGroups[newStatus] = [];
      statusGroups[newStatus].push(schedina.id);
    }
  }

  // Batch update schedine grouped by new status
  let settled = 0;

  for (const [status, ids] of Object.entries(statusGroups)) {
    const { error: updateError } = await supabase
      .from('schedine')
      .update({ status: status })
      .in('id', ids);

    if (!updateError) {
      settled += ids.length;
    } else {
      console.error('Failed to batch update schedine to ' + status + ':', updateError.message);
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
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, tier')
    .in('user_id', userIds);

  if (profilesError) {
    console.error('[sendEmailDigest] profiles query error:', profilesError.message);
  }

  const profileMap = new Map();
  (profiles || []).forEach(function (p) {
    profileMap.set(p.user_id, p);
  });

  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });

  if (authError) {
    console.error('[sendEmailDigest] listUsers error:', authError.message);
    return { sent: 0, failed: 0 };
  }

  const emailMap = new Map();
  if (authUsers && authUsers.users) {
    authUsers.users.forEach(function (u) {
      emailMap.set(u.id, u.email);
    });
  }

  // Build email tasks (filter out users without email or tips)
  const emailTasks = [];
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
    emailTasks.push({ email, digest });
  }

  // Send in parallel batches of 10
  let sent = 0;
  let failed = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < emailTasks.length; i += BATCH_SIZE) {
    const batch = emailTasks.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(function (task) {
        return sendEmail({
          to: task.email,
          subject: task.digest.subject,
          html: task.digest.html,
          text: task.digest.text,
        });
      }),
    );

    results.forEach(function (result) {
      if (result.status === 'fulfilled' && result.value) {
        sent++;
      } else {
        if (result.status === 'rejected') {
          console.warn('[sendEmailDigest] email failed:', result.reason.message);
        }
        failed++;
      }
    });
  }

  return { sent: sent, failed: failed };
}

// Named exports for direct require by generate-tips.js
module.exports.handleSettle = handleSettle;
module.exports.handleSend = handleSend;
// Re-export for backward compatibility (generate-tips.js uses callHandler on this module)
module.exports.evaluatePrediction = evaluatePrediction;
module.exports.buildActualResult = buildActualResult;
