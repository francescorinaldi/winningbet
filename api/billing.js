/**
 * POST /api/billing
 *
 * Endpoint unificato per le operazioni di billing Stripe.
 *
 * Body (JSON):
 *   { "action": "checkout", "tier": "pro" | "vip" }  — Crea sessione Checkout
 *   { "action": "portal" }                            — Crea sessione Customer Portal
 *
 * Richiede autenticazione (JWT nell'header Authorization).
 */

const { stripe, PRICE_IDS } = require('./_lib/stripe');
const { supabase } = require('./_lib/supabase');
const { authenticate } = require('./_lib/auth-middleware');

const SITE_URL = process.env.SITE_URL || 'https://winningbet.it';

const ALLOWED_ORIGINS = [
  SITE_URL,
  SITE_URL.replace('https://', 'https://www.'),
  'https://winningbet.vercel.app',
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body || {};

  if (action === 'checkout') {
    return handleCheckout(req, res);
  }
  if (action === 'portal') {
    return handlePortal(req, res);
  }

  return res.status(400).json({ error: 'Azione non valida. Usa "checkout" o "portal".' });
};

function getOrigin(req) {
  const rawOrigin = req.headers.origin || req.headers.referer || '';
  return ALLOWED_ORIGINS.includes(rawOrigin) ? rawOrigin : SITE_URL;
}

// ─── Checkout Handler ───────────────────────────────────────────────────────

async function handleCheckout(req, res) {
  const { user, profile, error: authError } = await authenticate(req);
  if (authError || !user) {
    return res.status(401).json({ error: authError || 'Non autenticato' });
  }

  const { tier } = req.body || {};
  if (!tier || !PRICE_IDS[tier]) {
    return res.status(400).json({ error: 'Tier non valido. Usa "pro" o "vip".' });
  }

  try {
    let customerId = profile ? profile.stripe_customer_id : null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id);
    }

    const origin = getOrigin(req);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: PRICE_IDS[tier], quantity: 1 }],
      success_url: origin + '/dashboard.html?checkout=success',
      cancel_url: origin + '/dashboard.html?checkout=cancelled',
      metadata: {
        supabase_user_id: user.id,
        tier: tier,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          tier: tier,
        },
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message, err.type || '', err.code || '');
    console.error('Price IDs:', JSON.stringify(PRICE_IDS));
    return res
      .status(500)
      .json({ error: 'Errore nella creazione della sessione di pagamento' });
  }
}

// ─── Portal Handler ─────────────────────────────────────────────────────────

async function handlePortal(req, res) {
  const { profile, error: authError } = await authenticate(req);
  if (authError || !profile) {
    return res.status(401).json({ error: authError || 'Non autenticato' });
  }

  if (!profile.stripe_customer_id) {
    return res.status(401).json({ error: 'Nessun abbonamento attivo' });
  }

  try {
    const origin = getOrigin(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: origin + '/dashboard.html',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe portal error:', err.message);
    return res.status(500).json({ error: "Errore nell'apertura del portale di gestione" });
  }
}
