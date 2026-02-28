const handler = require('../../api/fantacalcio');
const { createMockReq, createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../api/_lib/auth-middleware', () => ({
  authenticate: jest.fn(),
}));

const { authenticate } = require('../../api/_lib/auth-middleware');
const { supabase } = require('../../api/_lib/supabase');

/**
 * Creates a chainable Supabase query mock that resolves when awaited.
 */
function createThenableChain(result) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
  };
  Object.defineProperty(chain, 'then', {
    value: (resolve) => resolve(result),
    enumerable: false,
    configurable: true,
  });
  return chain;
}

const mockPicks = [
  {
    pick_type: 'captain',
    player_name: 'Lautaro',
    team_name: 'Inter',
    role: 'ATT',
    reasoning: 'Top form',
    tier: 'free',
    confidence: 90,
    expected_points: 12,
    ownership_pct: 45,
    rank: 1,
  },
  {
    pick_type: 'captain',
    player_name: 'Vlahovic',
    team_name: 'Juventus',
    role: 'ATT',
    reasoning: 'Pen taker',
    tier: 'free',
    confidence: 80,
    expected_points: 10,
    ownership_pct: 30,
    rank: 2,
  },
  {
    pick_type: 'differential',
    player_name: 'Lookman',
    team_name: 'Atalanta',
    role: 'ATT',
    reasoning: 'Low owned',
    tier: 'pro',
    confidence: 75,
    expected_points: 9,
    ownership_pct: 8,
    rank: 1,
  },
  {
    pick_type: 'buy',
    player_name: 'Kean',
    team_name: 'Fiorentina',
    role: 'ATT',
    reasoning: 'Rising form',
    tier: 'vip',
    confidence: 70,
    expected_points: 8,
    ownership_pct: 12,
    rank: 1,
  },
  {
    pick_type: 'sell',
    player_name: 'Immobile',
    team_name: 'Lazio',
    role: 'ATT',
    reasoning: 'Injured',
    tier: 'vip',
    confidence: 85,
    expected_points: 3,
    ownership_pct: 40,
    rank: 1,
  },
];

describe('GET /api/fantacalcio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from.mockReset();
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      profile: { tier: 'vip' },
      error: null,
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

  test('Free tier sees captains but not differentials or transfers', async () => {
    authenticate.mockResolvedValueOnce({
      user: { id: 'u1' },
      profile: { tier: 'free' },
      error: null,
    });

    supabase.from.mockReturnValue(createThenableChain({ data: mockPicks, error: null }));

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.captains).toHaveLength(2);
    expect(body.differentials).toEqual({ upgrade_required: true, tier_needed: 'pro' });
    expect(body.transfers).toEqual({ upgrade_required: true, tier_needed: 'vip' });
  });

  test('Pro tier sees captains + differentials but not transfers', async () => {
    authenticate.mockResolvedValueOnce({
      user: { id: 'u1' },
      profile: { tier: 'pro' },
      error: null,
    });

    supabase.from.mockReturnValue(createThenableChain({ data: mockPicks, error: null }));

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.captains).toHaveLength(2);
    expect(body.differentials).toHaveLength(1);
    expect(body.differentials[0].player_name).toBe('Lookman');
    expect(body.transfers).toEqual({ upgrade_required: true, tier_needed: 'vip' });
  });

  test('VIP tier sees everything', async () => {
    supabase.from.mockReturnValue(createThenableChain({ data: mockPicks, error: null }));

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.captains).toHaveLength(2);
    expect(body.differentials).toHaveLength(1);
    expect(body.transfers.buy).toHaveLength(1);
    expect(body.transfers.sell).toHaveLength(1);
    expect(body.transfers.buy[0].player_name).toBe('Kean');
    expect(body.transfers.sell[0].player_name).toBe('Immobile');
  });

  test('Response includes league and week fields', async () => {
    supabase.from.mockReturnValue(createThenableChain({ data: [], error: null }));

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.league).toBe('serie-a');
    expect(body.week).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('Invalid league falls back to serie-a', async () => {
    supabase.from.mockReturnValue(createThenableChain({ data: [], error: null }));

    const req = createMockReq({ method: 'GET', query: { league: 'bundesliga' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.league).toBe('serie-a');
  });

  test('Valid league premier-league is accepted', async () => {
    const chain = createThenableChain({ data: [], error: null });
    supabase.from.mockReturnValue(chain);

    const req = createMockReq({ method: 'GET', query: { league: 'premier-league' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.league).toBe('premier-league');
    expect(chain.eq).toHaveBeenCalledWith('league', 'premier-league');
  });

  test('DB error returns 500', async () => {
    supabase.from.mockReturnValue(
      createThenableChain({ data: null, error: { message: 'Connection failed' } }),
    );

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Errore nel recupero dei picks' });
  });

  test('Sets Cache-Control header', async () => {
    supabase.from.mockReturnValue(createThenableChain({ data: [], error: null }));

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, s-maxage=21600, stale-while-revalidate=3600',
    );
  });
});
