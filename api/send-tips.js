/**
 * POST /api/send-tips
 *
 * Invia i tips del giorno via Telegram ed email.
 * Progettato per essere chiamato dopo /api/generate-tips,
 * tipicamente come step di un cron job.
 *
 * Flusso:
 *   1. Recupera i tips pendenti per oggi da Supabase
 *   2. Invia tips free al canale Telegram pubblico
 *   3. Invia tips pro/vip al canale Telegram privato
 *   4. Invia riepilogo email agli abbonati attivi
 *
 * Sicurezza: richiede CRON_SECRET nell'header Authorization.
 *
 * Risposta 200:
 *   {
 *     telegram: { public: number, private: number },
 *     email: { sent: number, failed: number }
 *   }
 *
 * Errori:
 *   401 — Segreto cron non valido
 *   405 — Metodo non consentito
 *   500 — Errore durante l'invio
 */

const { supabase } = require('./_lib/supabase');
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
};

/**
 * Invia il riepilogo email a tutti gli abbonati attivi.
 *
 * @param {Array<Object>} tips - Tips da includere nel digest
 * @returns {Promise<{sent: number, failed: number}>}
 */
async function sendEmailDigest(tips) {
  // Recupera gli abbonati attivi con le email
  const { data: subscribers, error: subError } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('status', 'active');

  if (subError || !subscribers || subscribers.length === 0) {
    return { sent: 0, failed: 0 };
  }

  // Recupera le email degli utenti
  const userIds = subscribers.map(function (s) {
    return s.user_id;
  });
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, tier')
    .in('user_id', userIds);

  // Mappa profili per user_id
  const profileMap = new Map();
  (profiles || []).forEach(function (p) {
    profileMap.set(p.user_id, p);
  });

  // Recupera le email da Supabase Auth (admin API)
  // Nota: nel MVP usiamo la lista utenti dal service role
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

    // Filtra tips in base al tier dell'utente
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
