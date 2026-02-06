/**
 * POST /api/create-checkout
 *
 * Crea una sessione Stripe Checkout per l'abbonamento PRO o VIP.
 *
 * Body (JSON):
 *   { "tier": "pro" | "vip" }
 *
 * Richiede autenticazione (JWT nell'header Authorization).
 *
 * Flusso:
 *   1. Verifica l'autenticazione dell'utente
 *   2. Trova o crea un Stripe Customer collegato all'utente
 *   3. Crea una sessione Checkout con il Price ID corretto
 *   4. Restituisce l'URL della sessione per il redirect
 *
 * Risposta 200: { url: string }
 *
 * Errori:
 *   400 — Tier non valido
 *   401 — Non autenticato
 *   405 — Metodo non consentito
 *   500 — Errore Stripe
 */

const { stripe, PRICE_IDS } = require('./_lib/stripe');
const { supabase } = require('./_lib/supabase');
const { authenticate } = require('./_lib/auth-middleware');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verifica autenticazione
  const { user, profile, error: authError } = await authenticate(req);
  if (authError || !user) {
    return res.status(401).json({ error: authError || 'Non autenticato' });
  }

  const { tier } = req.body || {};
  if (!tier || !PRICE_IDS[tier]) {
    return res.status(400).json({ error: 'Tier non valido. Usa "pro" o "vip".' });
  }

  try {
    // Trova o crea il Stripe Customer
    let customerId = profile ? profile.stripe_customer_id : null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Salva il customer ID nel profilo
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id);
    }

    // Crea la sessione Checkout
    const ALLOWED_ORIGINS = ['https://winningbet.it', 'https://www.winningbet.it'];
    const rawOrigin = req.headers.origin || req.headers.referer || '';
    const origin = ALLOWED_ORIGINS.includes(rawOrigin) ? rawOrigin : 'https://winningbet.it';
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
    console.error('Stripe checkout error:', err.message);
    return res.status(500).json({ error: 'Errore nella creazione della sessione di pagamento' });
  }
};
