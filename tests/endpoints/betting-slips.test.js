const handler = require('../../api/betting-slips');
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

const { authenticate, hasAccess } = require('../../api/_lib/auth-middleware');
const { supabase } = require('../../api/_lib/supabase');
const cache = require('../../api/_lib/cache');

/**
 * Creates a chainable Supabase query mock that is also thenable (awaitable).
 * All chain methods (select, eq, in, order) return `this`, and a non-enumerable
 * `then` property allows the chain to be awaited to resolve with `result`.
 *
 * This is necessary because the source code builds a query chain like:
 *   let query = supabase.from('t').select('*').eq(...).in(...).order(...)
 *   if (cond) query = query.eq('status', val)   // called AFTER .order()
 *   const result = await query                   // chain must be thenable
 */
function createThenableChain(result) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
  };
  Object.defineProperty(chain, 'then', {
    value: (resolve) => resolve(result),
    enumerable: false,
    configurable: true,
  });
  return chain;
}

describe('GET /api/schedina', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from.mockReset();
    cache.get.mockReturnValue(null);
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      profile: { tier: 'pro' },
      error: null,
    });
    hasAccess.mockImplementation((userTier, requiredTier) => {
      const levels = { free: 0, pro: 1, vip: 2 };
      return (levels[userTier] || 0) >= (levels[requiredTier] || 0);
    });
  });

  test('Non-GET method returns 405', async () => {
    const req = createMockReq({ method: 'POST' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  test('Not authenticated returns 401', async () => {
    authenticate.mockResolvedValueOnce({
      user: null,
      profile: null,
      error: 'Autenticazione richiesta',
    });

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Autenticazione richiesta' });
  });

  test('Free tier returns 403 (upgrade required)', async () => {
    authenticate.mockResolvedValueOnce({
      user: { id: 'u1' },
      profile: { tier: 'free' },
      error: null,
    });

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Upgrade richiesto',
      message: 'Le schedine intelligenti sono disponibili per abbonati PRO e VIP.',
    });
  });

  test('Pro tier returns only pro schedine', async () => {
    authenticate.mockResolvedValueOnce({
      user: { id: 'u1' },
      profile: { tier: 'pro' },
      error: null,
    });
    hasAccess.mockImplementation((userTier, requiredTier) => {
      if (requiredTier === 'pro') return true;
      if (requiredTier === 'vip') return false;
      return false;
    });

    const mockSchedine = [
      {
        id: 1,
        name: 'Schedina Sicura',
        tier: 'pro',
        risk_level: 'low',
        combined_odds: 3.5,
        suggested_stake: 30,
        expected_return: 105,
        confidence_avg: 80,
        strategy: 'Sicurezza massima',
        status: 'pending',
        match_date: '2026-02-08',
        budget_reference: 50,
        created_at: '2026-02-08T10:00:00Z',
      },
    ];

    // Mock: schedine query (1st) -> schedina_tips (2nd) -> tips (3rd, skipped if no links)
    supabase.from
      .mockReturnValueOnce(createThenableChain({ data: mockSchedine, error: null }))
      .mockReturnValueOnce(createThenableChain({ data: [], error: null }))
      .mockReturnValueOnce(createThenableChain({ data: [], error: null }));

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        schedine: expect.arrayContaining([
          expect.objectContaining({
            tier: 'pro',
          }),
        ]),
      }),
    );
  });

  test('VIP tier returns all schedine', async () => {
    authenticate.mockResolvedValueOnce({
      user: { id: 'u1' },
      profile: { tier: 'vip' },
      error: null,
    });
    hasAccess.mockReturnValue(true);

    const mockSchedine = [
      {
        id: 1,
        name: 'Schedina Sicura',
        tier: 'pro',
        risk_level: 'low',
        combined_odds: 3.5,
        suggested_stake: 30,
        expected_return: 105,
        confidence_avg: 80,
        strategy: 'Sicurezza massima',
        status: 'pending',
        match_date: '2026-02-08',
        budget_reference: 50,
        created_at: '2026-02-08T10:00:00Z',
      },
      {
        id: 2,
        name: 'Schedina Azzardo',
        tier: 'vip',
        risk_level: 'high',
        combined_odds: 12.0,
        suggested_stake: 10,
        expected_return: 120,
        confidence_avg: 50,
        strategy: 'Alto rischio, alto rendimento',
        status: 'pending',
        match_date: '2026-02-08',
        budget_reference: 50,
        created_at: '2026-02-08T10:00:00Z',
      },
    ];

    // Mock: schedine query (1st) -> schedina_tips (2nd) -> tips (3rd, skipped if no links)
    supabase.from
      .mockReturnValueOnce(createThenableChain({ data: mockSchedine, error: null }))
      .mockReturnValueOnce(createThenableChain({ data: [], error: null }))
      .mockReturnValueOnce(createThenableChain({ data: [], error: null }));

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        schedine: expect.arrayContaining([
          expect.objectContaining({ tier: 'pro' }),
          expect.objectContaining({ tier: 'vip' }),
        ]),
      }),
    );
  });

  test('date parameter parsed correctly (YYYY-MM-DD format)', async () => {
    const mockChain = createThenableChain({ data: [], error: null });

    supabase.from.mockReturnValue(mockChain);

    const req = createMockReq({
      method: 'GET',
      query: { date: '2026-02-15' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(mockChain.eq).toHaveBeenCalledWith('match_date', '2026-02-15');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('Invalid date uses today', async () => {
    const today = new Date().toISOString().split('T')[0];
    const mockChain = createThenableChain({ data: [], error: null });

    supabase.from.mockReturnValue(mockChain);

    const req = createMockReq({
      method: 'GET',
      query: { date: 'invalid-date' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(mockChain.eq).toHaveBeenCalledWith('match_date', today);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('status filter works', async () => {
    const mockChain = createThenableChain({ data: [], error: null });

    supabase.from.mockReturnValue(mockChain);

    const req = createMockReq({
      method: 'GET',
      query: { status: 'won' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(mockChain.eq).toHaveBeenCalledWith('status', 'won');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('Returns enriched schedine with tips', async () => {
    const mockSchedine = [
      {
        id: 1,
        name: 'Schedina Sicura',
        tier: 'pro',
        risk_level: 'low',
        combined_odds: 3.5,
        suggested_stake: 30,
        expected_return: 105,
        confidence_avg: 80,
        strategy: 'Test',
        status: 'pending',
        match_date: '2026-02-08',
        budget_reference: 50,
        created_at: '2026-02-08T10:00:00Z',
      },
    ];

    const mockLinks = [
      { schedina_id: 1, tip_id: 101, position: 1 },
      { schedina_id: 1, tip_id: 102, position: 2 },
    ];

    const mockTips = [
      {
        id: 101,
        match_id: '1',
        home_team: 'Inter',
        away_team: 'Milan',
        match_date: '2026-02-08T20:00:00Z',
        prediction: '1',
        odds: 2.0,
        confidence: 75,
        analysis: 'Strong home form',
        tier: 'pro',
        status: 'pending',
        league: 'serie-a',
      },
      {
        id: 102,
        match_id: '2',
        home_team: 'Juventus',
        away_team: 'Roma',
        match_date: '2026-02-08T18:00:00Z',
        prediction: 'X',
        odds: 3.2,
        confidence: 65,
        analysis: 'Even matchup',
        tier: 'pro',
        status: 'pending',
        league: 'serie-a',
      },
    ];

    supabase.from
      .mockReturnValueOnce(createThenableChain({ data: mockSchedine, error: null }))
      .mockReturnValueOnce(createThenableChain({ data: mockLinks, error: null }))
      .mockReturnValueOnce(createThenableChain({ data: mockTips, error: null }));

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        schedine: [
          expect.objectContaining({
            id: 1,
            name: 'Schedina Sicura',
            tips: expect.arrayContaining([
              expect.objectContaining({
                position: 1,
                id: 101,
                home_team: 'Inter',
                away_team: 'Milan',
                prediction: '1',
                odds: 2.0,
                confidence: 75,
                analysis: 'Strong home form',
                status: 'pending',
                league: 'serie-a',
              }),
              expect.objectContaining({
                position: 2,
                id: 102,
                home_team: 'Juventus',
                away_team: 'Roma',
                prediction: 'X',
                odds: 3.2,
                confidence: 65,
                analysis: 'Even matchup',
                status: 'pending',
                league: 'serie-a',
              }),
            ]),
          }),
        ],
      }),
    );
  });

  test('Returns budget_summary', async () => {
    const mockSchedine = [
      {
        id: 1,
        name: 'Schedina 1',
        tier: 'pro',
        risk_level: 'low',
        combined_odds: 3.5,
        suggested_stake: 30,
        expected_return: 105,
        confidence_avg: 80,
        strategy: 'Test',
        status: 'pending',
        match_date: '2026-02-08',
        budget_reference: 100,
        created_at: '2026-02-08T10:00:00Z',
      },
      {
        id: 2,
        name: 'Schedina 2',
        tier: 'pro',
        risk_level: 'medium',
        combined_odds: 5.0,
        suggested_stake: 20,
        expected_return: 100,
        confidence_avg: 70,
        strategy: 'Test',
        status: 'pending',
        match_date: '2026-02-08',
        budget_reference: 100,
        created_at: '2026-02-08T10:00:00Z',
      },
    ];

    supabase.from
      .mockReturnValueOnce(createThenableChain({ data: mockSchedine, error: null }))
      .mockReturnValueOnce(createThenableChain({ data: [], error: null }))
      .mockReturnValueOnce(createThenableChain({ data: [], error: null }));

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseData = res.json.mock.calls[0][0];
    expect(responseData).toMatchObject({
      budget_summary: {
        budget: 100,
        total_stake: 50,
        reserve: 50,
        schedine_count: 2,
      },
    });
  });

  test('Empty result returns empty schedine and null budget_summary', async () => {
    supabase.from.mockReturnValue(createThenableChain({ data: [], error: null }));

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      schedine: [],
      budget_summary: null,
    });
  });

  test('Cache hit returns cached data', async () => {
    const cachedData = {
      schedine: [{ id: 1, name: 'Cached' }],
      budget_summary: { budget: 100 },
    };
    cache.get.mockReturnValueOnce(cachedData);

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(supabase.from).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(cachedData);
  });

  test('DB error returns 500', async () => {
    supabase.from.mockReturnValue(
      createThenableChain({
        data: null,
        error: { message: 'Database connection failed' },
      }),
    );

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Errore nel recupero delle schedine',
    });
  });
});
