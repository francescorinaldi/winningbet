/**
 * POST /api/create-portal
 *
 * Crea una sessione Stripe Customer Portal per la gestione abbonamento.
 * L'utente puo' cancellare, aggiornare il piano o cambiare metodo di pagamento.
 *
 * Richiede autenticazione (JWT nell'header Authorization).
 *
 * Risposta 200: { url: string }
 *
 * Errori:
 *   401 — Non autenticato o nessun customer Stripe
 *   405 — Metodo non consentito
 *   500 — Errore Stripe
 */

const { stripe } = require('./_lib/stripe');
const { authenticate } = require('./_lib/auth-middleware');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { profile, error: authError } = await authenticate(req);
  if (authError || !profile) {
    return res.status(401).json({ error: authError || 'Non autenticato' });
  }

  if (!profile.stripe_customer_id) {
    return res.status(401).json({ error: 'Nessun abbonamento attivo' });
  }

  try {
    const origin = req.headers.origin || req.headers.referer || 'https://winningbet.it';
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: origin + '/dashboard.html',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe portal error:', err.message);
    return res.status(500).json({ error: "Errore nell'apertura del portale di gestione" });
  }
};
