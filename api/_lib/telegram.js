/**
 * Telegram Bot API client.
 *
 * Invia messaggi ai canali Telegram configurati.
 * Supporta testo formattato in MarkdownV2.
 *
 * Variabili d'ambiente richieste:
 *   TELEGRAM_BOT_TOKEN — Token del bot (@BotFather)
 *   TELEGRAM_PUBLIC_CHANNEL_ID — Chat ID canale pubblico (tips free)
 *   TELEGRAM_PRIVATE_CHANNEL_ID — Chat ID canale privato (tips pro/vip)
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PUBLIC_CHANNEL = process.env.TELEGRAM_PUBLIC_CHANNEL_ID;
const PRIVATE_CHANNEL = process.env.TELEGRAM_PRIVATE_CHANNEL_ID;

const BASE_URL = 'https://api.telegram.org/bot' + BOT_TOKEN;

/**
 * Invia un messaggio a un chat/canale Telegram.
 *
 * @param {string} chatId - ID della chat o del canale
 * @param {string} text - Testo del messaggio (MarkdownV2)
 * @param {Object} [options] - Opzioni aggiuntive
 * @param {string} [options.parseMode='MarkdownV2'] - Modalita' di parsing
 * @returns {Promise<Object>} Risposta dell'API Telegram
 */
async function sendMessage(chatId, text, options) {
  const parseMode = (options && options.parseMode) || 'MarkdownV2';

  const response = await fetch(BASE_URL + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    console.error('Telegram API error:', data.description);
    throw new Error('Telegram: ' + data.description);
  }

  return data;
}

/**
 * Escape dei caratteri speciali per MarkdownV2.
 * Telegram richiede l'escape di: _ * [ ] ( ) ~ ` > # + - = | { } . !
 *
 * @param {string} text - Testo da escapare
 * @returns {string} Testo con escape
 */
function escapeMarkdown(text) {
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Formatta un tip come messaggio Telegram.
 *
 * @param {Object} tip - Oggetto tip dal database
 * @returns {string} Messaggio formattato in MarkdownV2
 */
function formatTipMessage(tip) {
  const home = escapeMarkdown(tip.home_team);
  const away = escapeMarkdown(tip.away_team);
  const prediction = escapeMarkdown(tip.prediction);
  const odds = escapeMarkdown(parseFloat(tip.odds).toFixed(2));
  const confidence = escapeMarkdown(tip.confidence + '%');
  const tier = tip.tier.toUpperCase();

  const lines = [
    '\u26BD *' + home + ' vs ' + away + '*',
    '',
    '\uD83C\uDFAF *Pronostico:* ' + prediction,
    '\uD83D\uDCCA *Quota:* ' + odds,
    '\uD83D\uDD25 *Fiducia:* ' + confidence,
  ];

  if (tip.analysis) {
    lines.push('');
    lines.push('\uD83D\uDCDD ' + escapeMarkdown(tip.analysis));
  }

  lines.push('');
  lines.push('\\[' + escapeMarkdown(tier) + '\\] \\| WinningBet');

  return lines.join('\n');
}

/**
 * Invia tips al canale pubblico (solo tips free).
 *
 * @param {Array<Object>} tips - Array di tips da inviare
 * @returns {Promise<number>} Numero di messaggi inviati
 */
async function sendPublicTips(tips) {
  if (!BOT_TOKEN || !PUBLIC_CHANNEL) {
    console.warn('Telegram public channel not configured, skipping');
    return 0;
  }

  const freeTips = tips.filter(function (t) {
    return t.tier === 'free';
  });
  let sent = 0;

  for (const tip of freeTips) {
    try {
      await sendMessage(PUBLIC_CHANNEL, formatTipMessage(tip));
      sent++;
      // Rate limiting: max 20 messaggi/minuto per canale
      await delay(3000);
    } catch (err) {
      console.error('Failed to send public tip:', err.message);
    }
  }

  return sent;
}

/**
 * Invia tips al canale privato (tips pro + vip).
 *
 * @param {Array<Object>} tips - Array di tips da inviare
 * @returns {Promise<number>} Numero di messaggi inviati
 */
async function sendPrivateTips(tips) {
  if (!BOT_TOKEN || !PRIVATE_CHANNEL) {
    console.warn('Telegram private channel not configured, skipping');
    return 0;
  }

  const premiumTips = tips.filter(function (t) {
    return t.tier === 'pro' || t.tier === 'vip';
  });
  let sent = 0;

  for (const tip of premiumTips) {
    try {
      await sendMessage(PRIVATE_CHANNEL, formatTipMessage(tip));
      sent++;
      await delay(3000);
    } catch (err) {
      console.error('Failed to send private tip:', err.message);
    }
  }

  return sent;
}

/**
 * Utility per delay (rate limiting Telegram).
 * @param {number} ms - Millisecondi di attesa
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * Invia un messaggio diretto a un utente Telegram.
 *
 * @param {number|string} userId - ID Telegram dell'utente
 * @param {string} text - Testo del messaggio (MarkdownV2)
 * @returns {Promise<Object>} Risposta dell'API Telegram
 */
async function sendDirectMessage(userId, text) {
  return sendMessage(String(userId), text);
}

/**
 * Crea un link di invito monouso per il canale privato.
 *
 * Utilizza `createChatInviteLink` con `member_limit: 1` per garantire
 * che ogni link possa essere usato da un solo utente.
 *
 * @param {string} name - Nome descrittivo del link (es. nome utente)
 * @returns {Promise<string>} URL del link di invito
 * @throws {Error} Se BOT_TOKEN o PRIVATE_CHANNEL non sono configurati
 */
async function createPrivateInviteLink(name) {
  if (!BOT_TOKEN || !PRIVATE_CHANNEL) {
    throw new Error('Telegram: BOT_TOKEN or PRIVATE_CHANNEL not configured');
  }

  const response = await fetch(BASE_URL + '/createChatInviteLink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: PRIVATE_CHANNEL,
      name: name,
      member_limit: 1,
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    console.error('Telegram API error:', data.description);
    throw new Error('Telegram: ' + data.description);
  }

  return data.result.invite_link;
}

/**
 * Rimuove un utente dal canale privato.
 *
 * Esegue `banChatMember` seguito da `unbanChatMember` (con `only_if_banned: true`)
 * per rimuovere l'utente senza applicare un ban permanente.
 *
 * @param {number|string} userId - ID Telegram dell'utente da rimuovere
 * @returns {Promise<void>}
 * @throws {Error} Se BOT_TOKEN o PRIVATE_CHANNEL non sono configurati
 */
async function removeFromPrivateChannel(userId) {
  if (!BOT_TOKEN || !PRIVATE_CHANNEL) {
    throw new Error('Telegram: BOT_TOKEN or PRIVATE_CHANNEL not configured');
  }

  const banResponse = await fetch(BASE_URL + '/banChatMember', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: PRIVATE_CHANNEL,
      user_id: Number(userId),
    }),
  });

  const banData = await banResponse.json();

  if (!banData.ok) {
    console.error('Telegram API error (ban):', banData.description);
    throw new Error('Telegram: ' + banData.description);
  }

  const unbanResponse = await fetch(BASE_URL + '/unbanChatMember', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: PRIVATE_CHANNEL,
      user_id: Number(userId),
      only_if_banned: true,
    }),
  });

  const unbanData = await unbanResponse.json();

  if (!unbanData.ok) {
    console.error('Telegram API error (unban):', unbanData.description);
    throw new Error('Telegram: ' + unbanData.description);
  }
}

module.exports = {
  sendPublicTips,
  sendPrivateTips,
  sendDirectMessage,
  createPrivateInviteLink,
  removeFromPrivateChannel,
};
