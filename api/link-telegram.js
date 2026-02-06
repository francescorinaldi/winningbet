/**
 * POST /api/link-telegram
 *
 * Genera un deep link Telegram per collegare l'account utente al bot.
 * Crea un token univoco, lo salva nel profilo e restituisce l'URL
 * di deep link da aprire nell'app Telegram.
 *
 * Richiede autenticazione (JWT nell'header Authorization).
 *
 * Flusso:
 *   1. Autentica l'utente via JWT
 *   2. Verifica se l'account e' gia' collegato a Telegram
 *   3. Genera un token URL-safe e lo salva nel profilo
 *   4. Restituisce l'URL di deep link al bot
 *
 * Risposta 200:
 *   { already_linked: boolean, url: string|null }
 *
 * Errori:
 *   401 — Non autenticato
 *   405 — Metodo non consentito
 *   500 — Configurazione mancante o errore database
 */

const crypto = require('crypto');
const { supabase } = require('./_lib/supabase');
const { authenticate } = require('./_lib/auth-middleware');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, error: authError } = await authenticate(req);
  if (authError) {
    return res.status(401).json({ error: authError });
  }

  // Verifica configurazione bot
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    console.error('TELEGRAM_BOT_USERNAME environment variable is not set');
    return res.status(500).json({ error: 'Configurazione Telegram mancante' });
  }

  try {
    // 1. Verifica se l'utente ha gia' un account Telegram collegato
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

    // 2. Genera token URL-safe (max 64 char per limite deep link Telegram)
    const token = crypto.randomBytes(24).toString('base64url');

    // 3. Salva il token nel profilo
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ telegram_link_token: token })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Token save error:', updateError.message);
      return res.status(500).json({ error: 'Errore nel salvataggio del token' });
    }

    // 4. Restituisce il deep link
    const url = 'https://t.me/' + botUsername + '?start=' + token;

    return res.status(200).json({ already_linked: false, url: url });
  } catch (err) {
    console.error('link-telegram error:', err);
    return res.status(500).json({ error: 'Errore nella generazione del link Telegram' });
  }
};
