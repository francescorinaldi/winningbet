/**
 * /api/telegram
 *
 * Endpoint unificato per le operazioni Telegram:
 *
 * 1. POST con header X-Telegram-Bot-Api-Secret-Token → Webhook handler
 *    Gestisce gli aggiornamenti dal bot Telegram (deep link /start).
 *
 * 2. POST con header Authorization (JWT) → Link handler
 *    Genera un deep link Telegram per collegare l'account utente al bot.
 *
 * Routing: se presente l'header X-Telegram-Bot-Api-Secret-Token, gestisce
 * come webhook Telegram; altrimenti come richiesta di link dal dashboard.
 */

const crypto = require('crypto');
const { supabase } = require('./_lib/supabase');
const { authenticate } = require('./_lib/auth-middleware');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Route: se c'e' l'header Telegram secret → webhook, altrimenti → link
  const telegramSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (telegramSecret !== undefined) {
    return handleWebhook(req, res);
  }
  return handleLink(req, res);
};

// ─── Webhook Handler ────────────────────────────────────────────────────────

async function handleWebhook(req, res) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== webhookSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const update = req.body;

  if (!update || !update.message || !update.message.text) {
    return res.status(200).json({ ok: true });
  }

  const text = update.message.text;
  const chatId = update.message.chat.id;
  const telegramUserId = update.message.from.id;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const baseUrl = 'https://api.telegram.org/bot' + botToken;

  if (text.startsWith('/start ')) {
    const token = text.slice('/start '.length).trim();

    if (!token) {
      return res.status(200).json({ ok: true });
    }

    const { data: profile, error: lookupError } = await supabase
      .from('profiles')
      .select('user_id, telegram_user_id')
      .eq('telegram_link_token', token)
      .single();

    if (lookupError || !profile) {
      await sendReply(baseUrl, chatId, 'Token non valido o scaduto. Riprova dalla dashboard.');
      return res.status(200).json({ ok: true });
    }

    if (profile.telegram_user_id && String(profile.telegram_user_id) === String(telegramUserId)) {
      await sendReply(baseUrl, chatId, "Il tuo account Telegram e' gia' collegato a WinningBet!");
      return res.status(200).json({ ok: true });
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        telegram_user_id: telegramUserId,
        telegram_link_token: null,
      })
      .eq('user_id', profile.user_id);

    if (updateError) {
      console.error('Failed to link Telegram account:', updateError.message);
      await sendReply(baseUrl, chatId, 'Errore durante il collegamento. Riprova.');
      return res.status(200).json({ ok: true });
    }

    await sendReply(
      baseUrl,
      chatId,
      'Account collegato con successo! Riceverai i pronostici direttamente qui.',
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}

async function sendReply(baseUrl, chatId, text) {
  try {
    const response = await fetch(baseUrl + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('Telegram sendReply error:', data.description);
    }
  } catch (err) {
    console.error('Telegram sendReply failed:', err.message);
  }
}

// ─── Link Handler ───────────────────────────────────────────────────────────

async function handleLink(req, res) {
  const { user, error: authError } = await authenticate(req);
  if (authError) {
    return res.status(401).json({ error: authError });
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    console.error('TELEGRAM_BOT_USERNAME environment variable is not set');
    return res.status(500).json({ error: 'Configurazione Telegram mancante' });
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('telegram_user_id')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError.message);
      return res.status(500).json({ error: 'Errore nel recupero del profilo' });
    }

    if (profile.telegram_user_id) {
      return res.status(200).json({ already_linked: true, url: null });
    }

    const token = crypto.randomBytes(24).toString('base64url');

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ telegram_link_token: token })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Token save error:', updateError.message);
      return res.status(500).json({ error: 'Errore nel salvataggio del token' });
    }

    const url = 'https://t.me/' + botUsername + '?start=' + token;
    return res.status(200).json({ already_linked: false, url: url });
  } catch (err) {
    console.error('link-telegram error:', err);
    return res.status(500).json({ error: 'Errore nella generazione del link Telegram' });
  }
}
