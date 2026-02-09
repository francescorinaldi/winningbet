const handler = require('../../api/tips');
const { createMockReq, createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../api/_lib/auth-middleware', () => ({
  authenticate: jest.fn(),
  hasAccess: jest.fn(),
}));
jest.mock('../../api/_lib/cache', () => ({
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
}));
jest.mock('../../api/_lib/leagues', () => ({
  resolveLeagueSlug: jest.fn((s) => s || 'serie-a'),
}));

const { supabase } = require('../../api/_lib/supabase');
const { authenticate, hasAccess } = require('../../api/_lib/auth-middleware');
const cache = require('../../api/_lib/cache');
const { resolveLeagueSlug } = require('../../api/_lib/leagues');

function mockChain(result) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockImplementation(() => Promise.resolve(result)),
  };
  supabase.from.mockReturnValue(chain);
  return chain;
}

describe('GET /api/tips', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockReturnValue(null);
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      profile: { tier: 'free' },
      error: null,
    });
    hasAccess.mockImplementation((userTier, required) => {
      const levels = { free: 0, pro: 1, vip: 2 };
      return (levels[userTier] || 0) >= (levels[required] || 0);
    });
    resolveLeagueSlug.mockImplementation((s) => s || 'serie-a');
  });

  test('Non-GET method returns 405', async () => {
    const req = createMockReq({ method: 'POST' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  test('Unauthenticated user returns free tips only', async () => {
    authenticate.mockResolvedValueOnce({
      user: null,
      profile: null,
      error: null,
    });

    const mockTips = [
      {
        id: '1',
        league: 'serie-a',
        tier_required: 'free',
        status: 'pending',
      },
    ];
    const chain = mockChain({ data: mockTips, error: null });

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(authenticate).toHaveBeenCalledWith(req);
    expect(chain.in).toHaveBeenCalledWith('tier', ['free']);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockTips);
  });

  test('Authenticated pro user can access pro tips', async () => {
    authenticate.mockResolvedValueOnce({
      user: { id: 'u1' },
      profile: { tier: 'pro' },
      error: null,
    });

    const mockTips = [
      { id: '1', tier_required: 'pro', status: 'pending' },
    ];
    const chain = mockChain({ data: mockTips, error: null });

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(hasAccess).toHaveBeenCalled();
    expect(chain.in).toHaveBeenCalledWith('tier', ['free', 'pro']);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockTips);
  });

  test('Returns tips from database', async () => {
    const mockTips = [
      {
        id: '1',
        league: 'serie-a',
        home_team: 'Inter',
        away_team: 'Milan',
        prediction: '1',
        odds: 2.0,
        status: 'pending',
      },
      {
        id: '2',
        league: 'serie-a',
        home_team: 'Juventus',
        away_team: 'Roma',
        prediction: 'X',
        odds: 3.5,
        status: 'pending',
      },
    ];
    mockChain({ data: mockTips, error: null });

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockTips);
  });

  test('Cache hit returns cached data', async () => {
    const cachedTips = [{ id: 'cached', league: 'serie-a' }];
    cache.get.mockReturnValueOnce(cachedTips);

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(supabase.from).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(cachedTips);
  });

  test('Cache miss queries DB and caches result', async () => {
    const mockTips = [{ id: '1', league: 'serie-a' }];
    mockChain({ data: mockTips, error: null });

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(supabase.from).toHaveBeenCalledWith('tips');
    expect(cache.set).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockTips);
  });

  test('league=all skips league filter', async () => {
    const mockTips = [
      { id: '1', league: 'serie-a' },
      { id: '2', league: 'la-liga' },
    ];
    const chain = mockChain({ data: mockTips, error: null });

    const req = createMockReq({ method: 'GET', query: { league: 'all' } });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.eq).not.toHaveBeenCalledWith('league', expect.anything());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockTips);
  });

  test('status=today uses gte match_date filter', async () => {
    const mockTips = [{ id: '1', match_date: '2026-02-08T18:00:00Z' }];
    const chain = mockChain({ data: mockTips, error: null });

    const req = createMockReq({ method: 'GET', query: { status: 'today' } });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.gte).toHaveBeenCalledWith('match_date', expect.any(String));
    expect(chain.eq).not.toHaveBeenCalledWith('status', expect.anything());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('Invalid status defaults to pending', async () => {
    const mockTips = [{ id: '1', status: 'pending' }];
    const chain = mockChain({ data: mockTips, error: null });

    const req = createMockReq({
      method: 'GET',
      query: { status: 'invalid-status' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.eq).toHaveBeenCalledWith('status', 'pending');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('limit parameter clamped between 1-50', async () => {
    const mockTips = [{ id: '1' }];
    const chain = mockChain({ data: mockTips, error: null });

    const req = createMockReq({ method: 'GET', query: { limit: '100' } });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('Database error returns 500', async () => {
    mockChain({ data: null, error: { message: 'DB connection failed' } });

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Errore nel recupero dei pronostici',
    });
  });

  test('Sets Cache-Control: no-store header', async () => {
    const mockTips = [{ id: '1' }];
    mockChain({ data: mockTips, error: null });

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
