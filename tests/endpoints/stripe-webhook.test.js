const handler = require('../../api/stripe-webhook');
const { createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: jest.fn() },
    subscriptions: { retrieve: jest.fn() },
  },
}));
jest.mock('../../api/_lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      then: jest.fn((r) => r({ data: null, error: null })),
    }),
  },
}));
jest.mock('../../api/_lib/telegram', () => ({
  createPrivateInviteLink: jest.fn().mockResolvedValue('https://t.me/+test'),
  sendDirectMessage: jest.fn().mockResolvedValue({}),
  removeFromPrivateChannel: jest.fn().mockResolvedValue(),
}));

const { stripe } = require('../../api/_lib/stripe');
const { supabase } = require('../../api/_lib/supabase');
const {
  createPrivateInviteLink,
  sendDirectMessage,
  removeFromPrivateChannel,
} = require('../../api/_lib/telegram');

function createStreamReq(body, headers = {}) {
  const EventEmitter = require('events');
  const req = new EventEmitter();
  req.method = 'POST';
  req.headers = { 'stripe-signature': 'sig_test', ...headers };
  req.query = {};
  req.body = {};
  // Simulate stream
  process.nextTick(() => {
    req.emit('data', Buffer.from(body));
    req.emit('end');
  });
  return req;
}

describe('POST /api/stripe-webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-POST methods', async () => {
    const EventEmitter = require('events');
    const req = new EventEmitter();
    req.method = 'GET';
    req.headers = {};
    req.query = {};
    req.body = {};

    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('should return 400 for invalid signature', async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const req = createStreamReq(JSON.stringify({ type: 'test' }));
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Firma webhook non valida' });
  });

  it('should handle checkout.session.completed and create subscription', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { supabase_user_id: 'u1', tier: 'pro' },
        },
      },
    };

    stripe.webhooks.constructEvent.mockReturnValue(event);
    stripe.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      current_period_end: 1735689600,
    });

    const mockUpsertChain = {
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    const mockUpdateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    supabase.from
      .mockReturnValueOnce(mockUpsertChain)
      .mockReturnValueOnce(mockUpdateChain);

    const req = createStreamReq(JSON.stringify(event));
    const res = createMockRes();

    await handler(req, res);

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123');
    expect(supabase.from).toHaveBeenCalledWith('subscriptions');
    expect(mockUpsertChain.upsert).toHaveBeenCalledWith(
      {
        user_id: 'u1',
        stripe_subscription_id: 'sub_123',
        tier: 'pro',
        status: 'active',
        current_period_end: new Date(1735689600 * 1000).toISOString(),
      },
      { onConflict: 'stripe_subscription_id' },
    );
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(mockUpdateChain.update).toHaveBeenCalledWith({ tier: 'pro' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('should return 200 and log error when checkout.session.completed has missing metadata', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: {},
        },
      },
    };

    stripe.webhooks.constructEvent.mockReturnValue(event);

    const req = createStreamReq(JSON.stringify(event));
    const res = createMockRes();

    await handler(req, res);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Missing metadata in checkout session:',
      undefined,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });

    consoleErrorSpy.mockRestore();
  });

  it('should handle customer.subscription.updated', async () => {
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          current_period_end: 1735689600,
          metadata: { supabase_user_id: 'u1', tier: 'vip' },
        },
      },
    };

    stripe.webhooks.constructEvent.mockReturnValue(event);

    const mockChain = {
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      then: jest.fn((r) => r({ data: null, error: null })),
    };
    supabase.from.mockReturnValue(mockChain);

    const req = createStreamReq(JSON.stringify(event));
    const res = createMockRes();

    await handler(req, res);

    expect(supabase.from).toHaveBeenCalledWith('subscriptions');
    expect(mockChain.update).toHaveBeenCalledWith({
      status: 'active',
      tier: 'vip',
      current_period_end: new Date(1735689600 * 1000).toISOString(),
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should handle customer.subscription.deleted and set tier to free when no other active subs', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          metadata: { supabase_user_id: 'u1' },
        },
      },
    };

    stripe.webhooks.constructEvent.mockReturnValue(event);

    const mockSelectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: [], error: null })),
    };

    const mockUpdateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: null, error: null })),
    };

    supabase.from
      .mockReturnValueOnce(mockUpdateChain) // subscriptions update
      .mockReturnValueOnce(mockSelectChain) // subscriptions select
      .mockReturnValueOnce(mockUpdateChain); // profiles update

    const req = createStreamReq(JSON.stringify(event));
    const res = createMockRes();

    await handler(req, res);

    expect(mockUpdateChain.update).toHaveBeenCalledWith({ tier: 'free' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should keep tier when customer.subscription.deleted but other active subs exist', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          metadata: { supabase_user_id: 'u1' },
        },
      },
    };

    stripe.webhooks.constructEvent.mockReturnValue(event);

    const mockSelectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn((r) =>
        r({ data: [{ id: 'sub_456', status: 'active', tier: 'vip' }], error: null }),
      ),
    };

    const mockUpdateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: null, error: null })),
    };

    supabase.from
      .mockReturnValueOnce(mockUpdateChain) // subscriptions update
      .mockReturnValueOnce(mockSelectChain); // subscriptions select

    const req = createStreamReq(JSON.stringify(event));
    const res = createMockRes();

    await handler(req, res);

    expect(supabase.from).not.toHaveBeenCalledWith('profiles');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should handle invoice.payment_failed and update status to past_due', async () => {
    const event = {
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription: 'sub_123',
        },
      },
    };

    stripe.webhooks.constructEvent.mockReturnValue(event);

    const mockChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: null, error: null })),
    };
    supabase.from.mockReturnValue(mockChain);

    const req = createStreamReq(JSON.stringify(event));
    const res = createMockRes();

    await handler(req, res);

    expect(supabase.from).toHaveBeenCalledWith('subscriptions');
    expect(mockChain.update).toHaveBeenCalledWith({ status: 'past_due' });
    expect(mockChain.eq).toHaveBeenCalledWith('stripe_subscription_id', 'sub_123');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should return 200 for unknown event types', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const event = {
      type: 'unknown.event.type',
      data: { object: {} },
    };

    stripe.webhooks.constructEvent.mockReturnValue(event);

    const req = createStreamReq(JSON.stringify(event));
    const res = createMockRes();

    await handler(req, res);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Unhandled webhook event:',
      'unknown.event.type',
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });

    consoleLogSpy.mockRestore();
  });

  it('should return 500 when webhook handler encounters an error', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          current_period_end: 1735689600,
          metadata: { supabase_user_id: 'u1', tier: 'pro' },
        },
      },
    };

    stripe.webhooks.constructEvent.mockReturnValue(event);
    supabase.from.mockImplementation(() => {
      throw new Error('Database error');
    });

    const req = createStreamReq(JSON.stringify(event));
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Webhook handler failed' });

    consoleErrorSpy.mockRestore();
  });

  it('should send invite link via DM when granting telegram access', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { supabase_user_id: 'u1', tier: 'pro' },
        },
      },
    };

    stripe.webhooks.constructEvent.mockReturnValue(event);
    stripe.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      current_period_end: 1735689600,
    });

    const mockUpsertChain = {
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    const mockUpdateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: null, error: null })),
    };

    const mockProfileChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { telegram_user_id: 'tg_123' },
        error: null,
      }),
    };

    supabase.from
      .mockReturnValueOnce(mockUpsertChain) // subscriptions upsert
      .mockReturnValueOnce(mockUpdateChain) // profiles update (tier)
      .mockReturnValueOnce(mockProfileChain); // profiles select (telegram)

    const req = createStreamReq(JSON.stringify(event));
    const res = createMockRes();

    await handler(req, res);

    expect(createPrivateInviteLink).toHaveBeenCalled();
    expect(sendDirectMessage).toHaveBeenCalledWith(
      'tg_123',
      expect.stringContaining('https://t.me/+test'),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should remove from channel and send notification when revoking telegram access', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          metadata: { supabase_user_id: 'u1' },
        },
      },
    };

    stripe.webhooks.constructEvent.mockReturnValue(event);

    const mockProfileChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest
        .fn()
        .mockResolvedValue({
          data: { telegram_user_id: 'tg_123', tier: 'free' },
          error: null,
        }),
    };

    const mockSelectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: [], error: null })),
    };

    const mockUpdateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: null, error: null })),
    };

    supabase.from
      .mockReturnValueOnce(mockUpdateChain) // subscriptions update
      .mockReturnValueOnce(mockSelectChain) // subscriptions select
      .mockReturnValueOnce(mockUpdateChain) // profiles update
      .mockReturnValueOnce(mockProfileChain); // profiles select for telegram

    const req = createStreamReq(JSON.stringify(event));
    const res = createMockRes();

    await handler(req, res);

    expect(removeFromPrivateChannel).toHaveBeenCalledWith('tg_123');
    expect(sendDirectMessage).toHaveBeenCalledWith(
      'tg_123',
      expect.stringContaining("e' scaduto"),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should map status correctly: canceled to cancelled, trialing to active, unpaid to past_due', async () => {
    const testCases = [
      { input: 'canceled', expected: 'cancelled' },
      { input: 'trialing', expected: 'active' },
      { input: 'unpaid', expected: 'past_due' },
    ];

    for (const { input, expected } of testCases) {
      jest.clearAllMocks();

      const event = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test',
            customer: 'cus_test',
            status: input,
            current_period_end: 1735689600,
            metadata: { supabase_user_id: 'u1', tier: 'pro' },
          },
        },
      };

      stripe.webhooks.constructEvent.mockReturnValue(event);

      const mockChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: jest.fn((r) => r({ data: null, error: null })),
      };
      supabase.from.mockReturnValue(mockChain);

      const req = createStreamReq(JSON.stringify(event));
      const res = createMockRes();

      await handler(req, res);

      expect(mockChain.update).toHaveBeenCalledWith({
        status: expected,
        tier: 'pro',
        current_period_end: expect.any(String),
      });
    }
  });

  it('should return early when invoice.payment_failed has no subscriptionId', async () => {
    const event = {
      type: 'invoice.payment_failed',
      data: {
        object: {},
      },
    };

    stripe.webhooks.constructEvent.mockReturnValue(event);

    const req = createStreamReq(JSON.stringify(event));
    const res = createMockRes();

    await handler(req, res);

    expect(supabase.from).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});
