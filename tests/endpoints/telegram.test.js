const handler = require('../../api/telegram');
const { createMockReq, createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      then: jest.fn((r) => r({ data: null, error: null })),
    }),
  },
}));
jest.mock('../../api/_lib/auth-middleware', () => ({
  authenticate: jest.fn(),
}));

const { supabase } = require('../../api/_lib/supabase');
const { authenticate } = require('../../api/_lib/auth-middleware');

// Mock global fetch for Telegram API calls
global.fetch = jest.fn();

describe('POST /api/telegram', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test_secret';
    process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token';
    process.env.TELEGRAM_BOT_USERNAME = 'test_bot';
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
  });

  afterEach(() => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_USERNAME;
  });

  it('should return 405 for non-POST methods', async () => {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('should process webhook with valid secret', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test_secret' },
      body: { message: { chat: { id: 123 }, text: '/help', from: { id: 123 } } },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('should return 401 for webhook with invalid secret', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong_secret' },
      body: { message: { chat: { id: 123 }, text: '/start' } },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should link account with valid /start token', async () => {
    const mockChain = {
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { user_id: 'u1', telegram_link_token: 'valid_token', telegram_user_id: null },
        error: null,
      }),
      then: jest.fn((r) => r({ data: null, error: null })),
    };
    supabase.from.mockReturnValue(mockChain);

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test_secret' },
      body: {
        message: {
          chat: { id: 123456 },
          text: '/start valid_token',
          from: { id: 123456 },
        },
      },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(mockChain.select).toHaveBeenCalledWith('user_id, telegram_user_id');
    expect(mockChain.eq).toHaveBeenCalledWith('telegram_link_token', 'valid_token');
    expect(mockChain.update).toHaveBeenCalledWith({
      telegram_user_id: 123456,
      telegram_link_token: null,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Account collegato con successo'),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should send error message for /start with invalid token', async () => {
    const mockChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      }),
    };
    supabase.from.mockReturnValue(mockChain);

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test_secret' },
      body: {
        message: {
          chat: { id: 123456 },
          text: '/start invalid_token',
          from: { id: 123456 },
        },
      },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Token non valido'),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should send welcome message for /start without token', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test_secret' },
      body: {
        message: {
          chat: { id: 123456 },
          text: '/start',
          from: { id: 123456 },
        },
      },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Benvenuto'),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should handle already linked account', async () => {
    const mockChain = {
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          user_id: 'u1',
          telegram_link_token: 'valid_token',
          telegram_user_id: '123456',
        },
        error: null,
      }),
      then: jest.fn((r) => r({ data: null, error: null })),
    };
    supabase.from.mockReturnValue(mockChain);

    const req = createMockReq({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test_secret' },
      body: {
        message: {
          chat: { id: 123456 },
          text: '/start valid_token',
          from: { id: 123456 },
        },
      },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining("gia' collegato"),
      }),
    );
    expect(mockChain.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should return 200 when update has no message', async () => {
    const req = createMockReq({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test_secret' },
      body: { update_id: 123 },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('should return 401 for link when not authenticated', async () => {
    authenticate.mockResolvedValue({
      user: null,
      profile: null,
      error: 'Unauthorized',
    });

    const req = createMockReq({
      method: 'POST',
      body: { action: 'link' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should return already_linked when user already has telegram_user_id', async () => {
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      profile: { telegram_user_id: 'tg_123' },
      error: null,
    });

    const req = createMockReq({
      method: 'POST',
      body: { action: 'link' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ already_linked: true, url: null });
  });

  it('should generate token and return deep link URL', async () => {
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      profile: { telegram_user_id: null },
      error: null,
    });

    const mockSelectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { telegram_user_id: null },
        error: null,
      }),
    };

    const mockUpdateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    supabase.from.mockReturnValueOnce(mockSelectChain).mockReturnValueOnce(mockUpdateChain);

    const req = createMockReq({
      method: 'POST',
      body: { action: 'link' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(mockUpdateChain.update).toHaveBeenCalledWith({
      telegram_link_token: expect.any(String),
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      already_linked: false,
      url: expect.stringContaining('https://t.me/test_bot?start='),
    });
  });

  it('should return 500 when TELEGRAM_BOT_USERNAME is not set', async () => {
    delete process.env.TELEGRAM_BOT_USERNAME;

    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      profile: { telegram_user_id: null },
      error: null,
    });

    const req = createMockReq({
      method: 'POST',
      body: { action: 'link' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Configurazione Telegram mancante',
    });
  });

  it('should return 500 when profile fetch fails', async () => {
    authenticate.mockResolvedValue({
      user: null,
      profile: null,
      error: 'Database error',
    });

    const req = createMockReq({
      method: 'POST',
      body: { action: 'link' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Database error' });
  });

  it('should return 500 when token save fails', async () => {
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      profile: { telegram_user_id: null },
      error: null,
    });

    const mockSelectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { telegram_user_id: null },
        error: null,
      }),
    };

    const mockUpdateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'Update failed' } }),
    };

    supabase.from.mockReturnValueOnce(mockSelectChain).mockReturnValueOnce(mockUpdateChain);

    const req = createMockReq({
      method: 'POST',
      body: { action: 'link' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Errore nel salvataggio del token',
    });
  });
});
