/**
 * POST /api/stripe-webhook
 *
 * Gestisce gli eventi webhook di Stripe per gli abbonamenti.
 *
 * Eventi gestiti:
 *   - checkout.session.completed — Nuovo abbonamento creato
 *   - customer.subscription.updated — Abbonamento aggiornato (upgrade/downgrade)
 *   - customer.subscription.deleted — Abbonamento cancellato
 *   - invoice.payment_failed — Pagamento fallito
 *
 * Sicurezza: verifica la firma webhook di Stripe (STRIPE_WEBHOOK_SECRET).
 *
 * IMPORTANTE: Questo endpoint richiede il body raw (non parsato)
 * per la verifica della firma. Vercel fornisce req.body come Buffer
 * quando il Content-Type e' application/json e il body non e' parsato.
 *
 * Risposta 200: { received: true }
 *
 * Errori:
 *   400 — Firma webhook non valida
 *   405 — Metodo non consentito
 */

const { stripe } = require('./_lib/stripe');
const { supabase } = require('./_lib/supabase');
const telegram = require('./_lib/telegram');

/**
 * Vercel config: disabilita il body parsing per ricevere il raw body.
 * Necessario per la verifica della firma Stripe.
 */
module.exports.config = {
  api: { bodyParser: false },
};

/**
 * Legge il body raw dalla request stream.
 * @param {Object} req - Request object
 * @returns {Promise<Buffer>}
 */
function getRawBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on('data', function (chunk) {
      chunks.push(chunk);
    });
    req.on('end', function () {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Firma webhook non valida' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log('Unhandled webhook event:', event.type);
    }
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    // Restituisci 500 per errori transitori cosi' Stripe riprova.
    // Stripe ha un backoff esponenziale fino a 3 giorni di retry.
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  return res.status(200).json({ received: true });
};

/**
 * Gestisce il completamento di una sessione Checkout.
 * Crea il record di abbonamento e aggiorna il tier del profilo.
 *
 * @param {Object} session - Stripe Checkout Session object
 */
async function handleCheckoutCompleted(session) {
  const userId = session.metadata.supabase_user_id;
  const tier = session.metadata.tier;
  const subscriptionId = session.subscription;

  if (!userId || !tier || !subscriptionId) {
    console.error('Missing metadata in checkout session:', session.id);
    return;
  }

  // Recupera i dettagli dell'abbonamento
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Crea il record di abbonamento
  const { error: subError } = await supabase.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscriptionId,
      tier: tier,
      status: 'active',
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    },
    { onConflict: 'stripe_subscription_id' },
  );

  if (subError) {
    throw new Error(`Failed to upsert subscription: ${subError.message}`);
  }

  // Aggiorna il tier del profilo
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ tier: tier })
    .eq('user_id', userId);

  if (profileError) {
    throw new Error(`Failed to update profile tier: ${profileError.message}`);
  }

  console.log(`Subscription created: user=${userId}, tier=${tier}`);

  await manageTelegramAccess(userId, 'grant');
}

/**
 * Gestisce l'aggiornamento di un abbonamento (cambio piano, rinnovo).
 * @param {Object} subscription - Stripe Subscription object
 */
async function handleSubscriptionUpdated(subscription) {
  const userId = subscription.metadata.supabase_user_id;
  const tier = subscription.metadata.tier;

  if (!userId) {
    console.error('Missing user_id in subscription metadata:', subscription.id);
    return;
  }

  // Se cancel_at_period_end è true il portale ha schedulato la cancellazione
  // a fine periodo: trattiamo come cancellazione immediata per semplicità
  // (l'utente ha espresso l'intento di disdire e lo stato Stripe diventerà
  // "canceled" a fine periodo — il webhook customer.subscription.deleted
  // lo confermerà, ma aggiorniamo già qui per UX coerente).
  if (subscription.cancel_at_period_end) {
    await supabase
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('stripe_subscription_id', subscription.id);

    const { data: activeSubs } = await supabase
      .from('subscriptions')
      .select('tier')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (!activeSubs || activeSubs.length === 0) {
      await supabase.from('profiles').update({ tier: 'free' }).eq('user_id', userId);
      await manageTelegramAccess(userId, 'revoke');
    }

    console.log(`Subscription cancel_at_period_end: user=${userId}, treated as cancelled`);
    return;
  }

  const status = mapStripeStatus(subscription.status);

  // Aggiorna il record di abbonamento
  await supabase
    .from('subscriptions')
    .update({
      status: status,
      tier: tier || undefined,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  // Aggiorna il tier del profilo solo se l'abbonamento e' attivo
  if (status === 'active' && tier) {
    await supabase.from('profiles').update({ tier: tier }).eq('user_id', userId);
  }

  console.log(`Subscription updated: user=${userId}, status=${status}`);
}

/**
 * Gestisce la cancellazione di un abbonamento.
 * Riporta il tier dell'utente a 'free'.
 * @param {Object} subscription - Stripe Subscription object
 */
async function handleSubscriptionDeleted(subscription) {
  const userId = subscription.metadata.supabase_user_id;

  if (!userId) {
    console.error('Missing user_id in subscription metadata:', subscription.id);
    return;
  }

  // Aggiorna il record di abbonamento
  await supabase
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('stripe_subscription_id', subscription.id);

  // Verifica se l'utente ha altri abbonamenti attivi
  const { data: activeSubscriptions } = await supabase
    .from('subscriptions')
    .select('tier')
    .eq('user_id', userId)
    .eq('status', 'active');

  // Se non ha altri abbonamenti attivi, riporta a free
  if (!activeSubscriptions || activeSubscriptions.length === 0) {
    await supabase.from('profiles').update({ tier: 'free' }).eq('user_id', userId);

    await manageTelegramAccess(userId, 'revoke');
  }

  console.log(`Subscription deleted: user=${userId}`);
}

/**
 * Gestisce un pagamento fallito.
 * Aggiorna lo stato dell'abbonamento a 'past_due'.
 * @param {Object} invoice - Stripe Invoice object
 */
async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  await supabase
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subscriptionId);

  console.log(`Payment failed for subscription: ${subscriptionId}`);
}

/**
 * Gestisce l'accesso al canale Telegram privato in base al tier.
 * Invia un link di invito se l'utente ha un abbonamento attivo,
 * oppure lo rimuove dal canale se l'abbonamento e' stato cancellato.
 *
 * @param {string} userId - Supabase user ID
 * @param {'grant'|'revoke'} action - Azione da eseguire
 */
async function manageTelegramAccess(userId, action) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('telegram_user_id')
    .eq('user_id', userId)
    .single();

  if (!profile || !profile.telegram_user_id) {
    return; // Utente non ha collegato Telegram
  }

  try {
    if (action === 'grant') {
      const inviteLink = await telegram.createPrivateInviteLink('Sub ' + userId.slice(0, 8));
      const msg =
        "Il tuo abbonamento WinningBet e' attivo! Unisciti al canale privato: " + inviteLink;
      await telegram.sendDirectMessage(profile.telegram_user_id, msg);
      console.log('Telegram invite sent to user:', userId);
    } else if (action === 'revoke') {
      await telegram.removeFromPrivateChannel(profile.telegram_user_id);
      await telegram.sendDirectMessage(
        profile.telegram_user_id,
        "Il tuo abbonamento WinningBet e' scaduto. Rinnova per riottenere l'accesso al canale privato.",
      );
      console.log('Telegram access revoked for user:', userId);
    }
  } catch (err) {
    // Non-fatal: non bloccare il webhook per errori Telegram
    // [CRITICAL] prefix for monitoring/alerting — failed invites need manual retry
    console.error(
      '[CRITICAL] Telegram access management failed:',
      'user=' + userId,
      'action=' + action,
      'error=' + err.message,
    );
  }
}

/**
 * Mappa lo stato Stripe nello stato interno dell'app.
 * @param {string} stripeStatus - Stato Stripe
 * @returns {string} Stato interno: 'active', 'cancelled', 'past_due', 'incomplete'
 */
function mapStripeStatus(stripeStatus) {
  const statusMap = {
    active: 'active',
    canceled: 'cancelled',
    past_due: 'past_due',
    incomplete: 'incomplete',
    incomplete_expired: 'cancelled',
    trialing: 'active',
    unpaid: 'past_due',
  };
  return statusMap[stripeStatus] || 'incomplete';
}
