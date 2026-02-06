/**
 * POST /api/telegram-webhook
 *
 * Gestisce gli aggiornamenti in arrivo dal bot Telegram (webhook).
 * Usato per il collegamento account tramite deep link /start.
 *
 * Flusso:
 *   1. Verifica metodo POST
 *   2. Verifica secret token (se configurato)
 *   3. Parsa il body dell'update Telegram
 *   4. Gestisce il comando /start <token> per collegare l'account
 *
 * Sicurezza: verifica X-Telegram-Bot-Api-Secret-Token header
 * contro TELEGRAM_WEBHOOK_SECRET (opzionale in dev).
 *
 * Risposta: sempre 200 (requisito Telegram per i webhook).
 *
 * Errori:
 *   401 — Secret token non valido
 *   405 — Metodo non consentito
 */

const { supabase } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verifica secret token (se configurato)
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== webhookSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const update = req.body;

  // Se non c'e' un messaggio di testo, ignora (Telegram richiede sempre 200)
  if (!update || !update.message || !update.message.text) {
    return res.status(200).json({ ok: true });
  }

  const text = update.message.text;
  const chatId = update.message.chat.id;
  const telegramUserId = update.message.from.id;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const baseUrl = 'https://api.telegram.org/bot' + botToken;

  // Gestione comando /start <token>
  if (text.startsWith('/start ')) {
    const token = text.slice('/start '.length).trim();

    if (!token) {
      return res.status(200).json({ ok: true });
    }

    // Cerca il profilo con questo token di collegamento
    const { data: profile, error: lookupError } = await supabase
      .from('profiles')
      .select('user_id, telegram_user_id')
      .eq('telegram_link_token', token)
      .single();

    if (lookupError || !profile) {
      await sendReply(baseUrl, chatId, 'Token non valido o scaduto. Riprova dalla dashboard.');
      return res.status(200).json({ ok: true });
    }

    // Se gia' collegato allo stesso utente Telegram
    if (profile.telegram_user_id && String(profile.telegram_user_id) === String(telegramUserId)) {
      await sendReply(baseUrl, chatId, "Il tuo account Telegram e' gia' collegato a WinningBet!");
      return res.status(200).json({ ok: true });
    }

    // Collega l'account: imposta telegram_user_id e consuma il token
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

  // Comando non riconosciuto — ignora
  return res.status(200).json({ ok: true });
};

/**
 * Invia una risposta testuale a una chat Telegram.
 *
 * Helper locale per evitare dipendenze circolari con telegram.js.
 * Usa l'API sendMessage di Telegram direttamente.
 *
 * @param {string} baseUrl - URL base dell'API Telegram (con bot token)
 * @param {number|string} chatId - ID della chat di destinazione
 * @param {string} text - Testo del messaggio da inviare
 * @returns {Promise<void>}
 */
async function sendReply(baseUrl, chatId, text) {
  try {
    const response = await fetch(baseUrl + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('Telegram sendReply error:', data.description);
    }
  } catch (err) {
    console.error('Telegram sendReply failed:', err.message);
  }
}
