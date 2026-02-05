/**
 * Stripe server-side client.
 *
 * Inizializza il client Stripe con la secret key.
 * Usato da create-checkout.js e stripe-webhook.js.
 *
 * Variabile d'ambiente richiesta: STRIPE_SECRET_KEY
 */

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Mappa tier → Stripe Price ID.
 * I Price ID vengono configurati nella dashboard Stripe
 * e passati come variabili d'ambiente.
 *
 * @type {Object<string, string>}
 */
const PRICE_IDS = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  vip: process.env.STRIPE_VIP_PRICE_ID,
};

/**
 * URL del Stripe Customer Portal per la gestione abbonamento.
 * Configurato in Stripe Dashboard > Settings > Customer Portal.
 */
const CUSTOMER_PORTAL_URL = process.env.STRIPE_CUSTOMER_PORTAL_URL || '';

module.exports = { stripe, PRICE_IDS, CUSTOMER_PORTAL_URL };
