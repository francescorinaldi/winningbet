const handler = require('../../api/billing');
const { createMockReq, createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/stripe', () => ({
  stripe: {
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
  },
  PRICE_IDS: { pro: 'price_pro_test', vip: 'price_vip_test' },
}));
jest.mock('../../api/_lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ error: null })),
    }),
  },
}));
jest.mock('../../api/_lib/auth-middleware', () => ({
  authenticate: jest.fn(),
}));

const { stripe, PRICE_IDS } = require('../../api/_lib/stripe');
const { authenticate } = require('../../api/_lib/auth-middleware');

describe('POST /api/billing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue({
      user: { id: 'u1', email: 'test@test.com' },
      profile: { tier: 'free', stripe_customer_id: null },
      error: null,
    });
  });

  it('should return 405 for non-POST methods', async () => {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('should return 400 when action parameter is missing', async () => {
    const req = createMockReq({ method: 'POST', body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Azione non valida. Usa "checkout" o "portal".',
    });
  });

  it('should return 401 for action=checkout when not authenticated', async () => {
    authenticate.mockResolvedValueOnce({
      user: null,
      profile: null,
      error: 'Unauthorized',
    });

    const req = createMockReq({
      method: 'POST',
      body: { action: 'checkout', tier: 'pro' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should create customer then checkout session when no stripe customer exists', async () => {
    stripe.customers.create.mockResolvedValue({ id: 'cus_new' });
    stripe.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.com/test',
    });

    const req = createMockReq({
      method: 'POST',
      body: { action: 'checkout', tier: 'pro' },
      headers: { origin: 'https://winningbet.it' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'test@test.com',
      metadata: { supabase_user_id: 'u1' },
    });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_new',
      mode: 'subscription',
      line_items: [{ price: PRICE_IDS.pro, quantity: 1 }],
      success_url: 'https://winningbet.it/dashboard.html?checkout=success',
      cancel_url: 'https://winningbet.it/dashboard.html?checkout=cancelled',
      metadata: { supabase_user_id: 'u1', tier: 'pro' },
      subscription_data: {
        metadata: { supabase_user_id: 'u1', tier: 'pro' },
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      url: 'https://checkout.stripe.com/test',
    });
  });

  it('should create checkout session directly when customer exists', async () => {
    authenticate.mockResolvedValueOnce({
      user: { id: 'u1', email: 'test@test.com' },
      profile: { tier: 'free', stripe_customer_id: 'cus_existing' },
      error: null,
    });
    stripe.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.com/test2',
    });

    const req = createMockReq({
      method: 'POST',
      body: { action: 'checkout', tier: 'vip' },
      headers: { origin: 'https://winningbet.it' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_existing',
      mode: 'subscription',
      line_items: [{ price: PRICE_IDS.vip, quantity: 1 }],
      success_url: 'https://winningbet.it/dashboard.html?checkout=success',
      cancel_url: 'https://winningbet.it/dashboard.html?checkout=cancelled',
      metadata: { supabase_user_id: 'u1', tier: 'vip' },
      subscription_data: {
        metadata: { supabase_user_id: 'u1', tier: 'vip' },
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      url: 'https://checkout.stripe.com/test2',
    });
  });

  it('should return 400 for action=checkout with invalid tier', async () => {
    const req = createMockReq({
      method: 'POST',
      body: { action: 'checkout', tier: 'invalid' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Tier non valido. Usa "pro" o "vip".',
    });
  });

  it('should return 500 when stripe checkout fails', async () => {
    stripe.customers.create.mockResolvedValue({ id: 'cus_new' });
    stripe.checkout.sessions.create.mockRejectedValue(new Error('Stripe error'));

    const req = createMockReq({
      method: 'POST',
      body: { action: 'checkout', tier: 'pro' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Errore nella creazione della sessione di pagamento',
    });
  });

  it('should return 401 for action=portal when not authenticated', async () => {
    authenticate.mockResolvedValueOnce({
      user: null,
      profile: null,
      error: 'Unauthorized',
    });

    const req = createMockReq({
      method: 'POST',
      body: { action: 'portal' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should return 401 for action=portal without stripe_customer_id', async () => {
    const req = createMockReq({
      method: 'POST',
      body: { action: 'portal' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Nessun abbonamento attivo',
    });
  });

  it('should return portal URL for action=portal with valid customer', async () => {
    authenticate.mockResolvedValueOnce({
      user: { id: 'u1', email: 'test@test.com' },
      profile: { tier: 'pro', stripe_customer_id: 'cus_existing' },
      error: null,
    });
    stripe.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/portal',
    });

    const req = createMockReq({
      method: 'POST',
      body: { action: 'portal' },
      headers: { origin: 'https://winningbet.it' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_existing',
      return_url: 'https://winningbet.it/dashboard.html',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      url: 'https://billing.stripe.com/portal',
    });
  });

  it('should return 500 when portal creation fails', async () => {
    authenticate.mockResolvedValueOnce({
      user: { id: 'u1', email: 'test@test.com' },
      profile: { tier: 'pro', stripe_customer_id: 'cus_existing' },
      error: null,
    });
    stripe.billingPortal.sessions.create.mockRejectedValue(new Error('Portal error'));

    const req = createMockReq({
      method: 'POST',
      body: { action: 'portal' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: "Errore nell'apertura del portale di gestione",
    });
  });

  it('should use default origin when header is missing', async () => {
    stripe.customers.create.mockResolvedValue({ id: 'cus_new' });
    stripe.checkout.sessions.create.mockResolvedValue({
      url: 'https://checkout.stripe.com/test',
    });

    const req = createMockReq({
      method: 'POST',
      body: { action: 'checkout', tier: 'pro' },
      headers: {},
    });
    const res = createMockRes();

    await handler(req, res);

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: 'https://winningbet.it/dashboard.html?checkout=success',
        cancel_url: 'https://winningbet.it/dashboard.html?checkout=cancelled',
      }),
    );
  });
});
