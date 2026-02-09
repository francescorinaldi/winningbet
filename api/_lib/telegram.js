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

const { LEAGUES } = require('./leagues');

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

const LEAGUE_FLAGS = {
  'serie-a': '\uD83C\uDDEE\uD83C\uDDF9',
  'champions-league': '\uD83C\uDFC6',
  'la-liga': '\uD83C\uDDEA\uD83C\uDDF8',
  'premier-league':
    '\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F',
  'ligue-1': '\uD83C\uDDEB\uD83C\uDDF7',
  bundesliga: '\uD83C\uDDE9\uD83C\uDDEA',
  eredivisie: '\uD83C\uDDF3\uD83C\uDDF1',
};

// Derived from centralized leagues config (uppercase for Telegram formatting)
const LEAGUE_NAMES = {};
for (const slug of Object.keys(LEAGUES)) {
  LEAGUE_NAMES[slug] = LEAGUES[slug].name.toUpperCase();
}

/**
 * Formatta la data odierna in italiano.
 * @returns {string} Es. "Venerdi 7 Febbraio 2026"
 */
function formatItalianDate() {
  const days = ['Domenica', 'Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato'];
  const months = [
    'Gennaio',
    'Febbraio',
    'Marzo',
    'Aprile',
    'Maggio',
    'Giugno',
    'Luglio',
    'Agosto',
    'Settembre',
    'Ottobre',
    'Novembre',
    'Dicembre',
  ];
  const now = new Date();
  return (
    days[now.getDay()] +
    ' ' +
    now.getDate() +
    ' ' +
    months[now.getMonth()] +
    ' ' +
    now.getFullYear()
  );
}

/**
 * Formatta un singolo tip come blocco nel digest.
 * @param {Object} tip - Oggetto tip dal database
 * @returns {string} Blocco MarkdownV2 per il tip
 */
function formatTipBlock(tip) {
  const home = escapeMarkdown(tip.home_team);
  const away = escapeMarkdown(tip.away_team);
  const prediction = escapeMarkdown(tip.prediction);
  const odds = escapeMarkdown(parseFloat(tip.odds).toFixed(2));
  const confidence = escapeMarkdown(tip.confidence + '%');

  const lines = [
    '\u26BD *' + home + ' vs ' + away + '*',
    '\u251C \uD83C\uDFAF ' + prediction,
    '\u251C \uD83D\uDCCA Quota: ' + odds,
    '\u251C \uD83D\uDD25 Fiducia: ' + confidence,
  ];

  if (tip.analysis) {
    lines.push('\u2514 \uD83D\uDCDD _' + escapeMarkdown(tip.analysis) + '_');
  } else {
    // Replace last ├ with └
    lines[lines.length - 1] = lines[lines.length - 1].replace('\u251C', '\u2514');
  }

  return lines.join('\n');
}

/**
 * Formatta un array di tips come digest giornaliero (Format A).
 * Raggruppa i tips per lega con header, separatori e quota combinata.
 *
 * @param {Array<Object>} tips - Array di tips dal database
 * @returns {string} Messaggio digest formattato in MarkdownV2
 */
function formatDigest(tips) {
  if (!tips || tips.length === 0) {
    return '';
  }

  const lines = [
    '\uD83C\uDFC6 *PRONOSTICI DEL GIORNO*',
    '_' + escapeMarkdown(formatItalianDate()) + '_',
    '',
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
  ];

  // Group tips by league
  const byLeague = {};
  for (const tip of tips) {
    const league = tip.league || 'serie-a';
    if (!byLeague[league]) {
      byLeague[league] = [];
    }
    byLeague[league].push(tip);
  }

  let comboOdds = 1;
  let tipCount = 0;

  for (const leagueSlug of Object.keys(byLeague)) {
    const leagueTips = byLeague[leagueSlug];
    const flag = LEAGUE_FLAGS[leagueSlug] || '\u26BD';
    const name = LEAGUE_NAMES[leagueSlug] || leagueSlug.toUpperCase();

    lines.push('');
    lines.push(flag + ' *' + escapeMarkdown(name) + '*');
    lines.push('');

    for (const tip of leagueTips) {
      lines.push(formatTipBlock(tip));
      lines.push('');
      comboOdds *= parseFloat(tip.odds) || 1;
      tipCount++;
    }

    lines.push(
      '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501',
    );
  }

  lines.push('');
  lines.push(
    '_' + escapeMarkdown(tipCount + ' pronostici | Quota combinata: ' + comboOdds.toFixed(2)) + '_',
  );
  lines.push('\uD83D\uDC51 *WinningBet* \u2014 Pronostici Calcio Premium');

  return lines.join('\n');
}

/**
 * Invia tips al canale pubblico (solo tips free) come digest giornaliero.
 *
 * @param {Array<Object>} tips - Array di tips da inviare
 * @returns {Promise<number>} Numero di tips inclusi nel digest
 */
async function sendPublicTips(tips) {
  if (!BOT_TOKEN || !PUBLIC_CHANNEL) {
    console.warn('Telegram public channel not configured, skipping');
    return 0;
  }

  const freeTips = tips.filter(function (t) {
    return t.tier === 'free';
  });

  if (freeTips.length === 0) {
    return 0;
  }

  try {
    await sendMessage(PUBLIC_CHANNEL, formatDigest(freeTips));
    return freeTips.length;
  } catch (err) {
    console.error('Failed to send public digest:', err.message);
    return 0;
  }
}

/**
 * Invia tips al canale privato (tips pro + vip) come digest giornaliero.
 *
 * @param {Array<Object>} tips - Array di tips da inviare
 * @returns {Promise<number>} Numero di tips inclusi nel digest
 */
async function sendPrivateTips(tips) {
  if (!BOT_TOKEN || !PRIVATE_CHANNEL) {
    console.warn('Telegram private channel not configured, skipping');
    return 0;
  }

  const premiumTips = tips.filter(function (t) {
    return t.tier === 'pro' || t.tier === 'vip';
  });

  if (premiumTips.length === 0) {
    return 0;
  }

  try {
    await sendMessage(PRIVATE_CHANNEL, formatDigest(premiumTips));
    return premiumTips.length;
  } catch (err) {
    console.error('Failed to send private digest:', err.message);
    return 0;
  }
}

/**
 * Invia un messaggio diretto a un utente Telegram.
 *
 * @param {number|string} userId - ID Telegram dell'utente
 * @param {string} text - Testo del messaggio (MarkdownV2)
 * @returns {Promise<Object>} Risposta dell'API Telegram
 */
async function sendDirectMessage(userId, text) {
  if (!BOT_TOKEN) {
    throw new Error('Telegram: BOT_TOKEN not configured');
  }
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

  // Unban per permettere un futuro re-join (senza ban permanente).
  // Se l'unban fallisce, l'utente resta bannato — log critico per recovery manuale.
  try {
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
      console.error(
        'CRITICAL: User ' + userId + ' banned but unban failed:',
        unbanData.description,
      );
    }
  } catch (err) {
    console.error('CRITICAL: User ' + userId + ' banned but unban request failed:', err.message);
  }
}

module.exports = {
  sendPublicTips,
  sendPrivateTips,
  sendDirectMessage,
  createPrivateInviteLink,
  removeFromPrivateChannel,
};
