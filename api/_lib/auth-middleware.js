/**
 * Middleware di autenticazione per le serverless functions.
 *
 * Verifica il JWT dall'header Authorization e restituisce
 * l'utente autenticato e il suo profilo con tier.
 *
 * Uso:
 *   const { user, profile, error } = await authenticate(req);
 *   if (error) return res.status(401).json({ error });
 */

const { supabase } = require('./supabase');

/**
 * Estrae e verifica il JWT dall'header Authorization.
 * Recupera anche il profilo utente con il tier corrente.
 *
 * @param {Object} req - Request object di Vercel
 * @returns {Promise<{user: Object|null, profile: Object|null, error: string|null}>}
 */
async function authenticate(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, profile: null, error: 'Token di autenticazione mancante' };
  }

  const token = authHeader.replace('Bearer ', '');

  // Verifica il JWT con Supabase
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { user: null, profile: null, error: 'Token non valido o scaduto' };
  }

  // Recupera il profilo con il tier
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, tier, stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  if (profileError) {
    console.error('Profile fetch error:', profileError.message);
    return { user, profile: null, error: null };
  }

  return { user, profile, error: null };
}

/**
 * Verifica se un utente ha accesso a un determinato tier.
 * Il tier VIP include l'accesso a tutto.
 * Il tier PRO include l'accesso a pro e free.
 * Il tier free include solo free.
 *
 * @param {string} userTier - Tier dell'utente ('free', 'pro', 'vip')
 * @param {string} requiredTier - Tier richiesto
 * @returns {boolean}
 */
function hasAccess(userTier, requiredTier) {
  const tierLevels = { free: 0, pro: 1, vip: 2 };
  return (tierLevels[userTier] || 0) >= (tierLevels[requiredTier] || 0);
}

/**
 * Verifica il CRON_SECRET nell'header Authorization.
 * Usa confronto a tempo costante per prevenire timing attacks.
 *
 * @param {Object} req - Request object di Vercel
 * @returns {{ authorized: boolean, error: string|null }}
 */
function verifyCronSecret(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET environment variable is not set');
    return { authorized: false, error: 'Server misconfigured' };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false, error: 'Unauthorized' };
  }

  const token = authHeader.replace('Bearer ', '');

  // Confronto a tempo costante per prevenire timing attacks
  const crypto = require('crypto');
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);

  if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
    return { authorized: false, error: 'Unauthorized' };
  }

  return { authorized: true, error: null };
}

module.exports = { authenticate, hasAccess, verifyCronSecret };
