const handler = require('../../api/stats');
const { buildMonthlyBreakdown } = require('../../api/stats');
const { createMockReq, createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../api/_lib/api-football', () => ({
  getStandings: jest.fn(),
}));
jest.mock('../../api/_lib/football-data', () => ({
  getStandings: jest.fn(),
}));
jest.mock('../../api/_lib/cache', () => ({
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
}));
jest.mock('../../api/_lib/leagues', () => ({
  resolveLeagueSlug: jest.fn((s) => s || 'serie-a'),
}));

const { supabase } = require('../../api/_lib/supabase');
const { getStandings: getStandingsApiFootball } =
  require('../../api/_lib/api-football');
const { getStandings: getStandingsFootballData } =
  require('../../api/_lib/football-data');
const cache = require('../../api/_lib/cache');
const { resolveLeagueSlug } = require('../../api/_lib/leagues');

function mockChain(result) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    then: jest.fn((cb) => cb(result)),
  };
  supabase.from.mockReturnValue(chain);
  return chain;
}

describe('GET /api/stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockReturnValue(null);
    resolveLeagueSlug.mockImplementation((s) => s || 'serie-a');
  });

  test('Non-GET method returns 405', async () => {
    const req = createMockReq({ method: 'POST' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  test('Missing type parameter returns 400', async () => {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Parametro type richiesto: standings o track-record',
    });
  });

  test('type=standings: primary success returns standings', async () => {
    const mockStandings = [
      { position: 1, team: 'Inter', points: 60 },
      { position: 2, team: 'Milan', points: 58 },
    ];
    getStandingsApiFootball.mockResolvedValueOnce(mockStandings);

    const req = createMockReq({ method: 'GET', query: { type: 'standings' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getStandingsApiFootball).toHaveBeenCalledWith('serie-a');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockStandings);
  });

  test('type=standings: primary fails, fallback succeeds', async () => {
    const mockStandings = [{ position: 1, team: 'Inter', points: 60 }];
    getStandingsApiFootball.mockRejectedValueOnce(new Error('Primary fail'));
    getStandingsFootballData.mockResolvedValueOnce(mockStandings);

    const req = createMockReq({ method: 'GET', query: { type: 'standings' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getStandingsApiFootball).toHaveBeenCalled();
    expect(getStandingsFootballData).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockStandings);
  });

  test('type=standings: both fail returns 502', async () => {
    getStandingsApiFootball.mockRejectedValueOnce(new Error('Primary fail'));
    getStandingsFootballData.mockRejectedValueOnce(new Error('Fallback fail'));

    const req = createMockReq({ method: 'GET', query: { type: 'standings' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unable to fetch standings from any source',
    });
  });

  test('type=standings: caches result', async () => {
    const mockStandings = [{ position: 1, team: 'Inter', points: 60 }];
    getStandingsApiFootball.mockResolvedValueOnce(mockStandings);

    const req = createMockReq({ method: 'GET', query: { type: 'standings' } });
    const res = createMockRes();

    await handler(req, res);

    expect(cache.set).toHaveBeenCalled();
    const cacheKey = cache.set.mock.calls[0][0];
    expect(cacheKey).toContain('standings');
    expect(cacheKey).toContain('serie-a');
  });

  test('type=track-record: computes stats correctly', async () => {
    const mockTips = [
      {
        status: 'won',
        odds: 2.0,
        match_id: '1',
        match_date: '2026-01-15T00:00:00Z',
        home_team: 'A',
        away_team: 'B',
        prediction: '1',
        result: '2-1',
      },
      {
        status: 'lost',
        odds: 1.5,
        match_id: '2',
        match_date: '2026-01-20T00:00:00Z',
        home_team: 'C',
        away_team: 'D',
        prediction: '2',
        result: '1-0',
      },
      {
        status: 'won',
        odds: 3.0,
        match_id: '3',
        match_date: '2026-01-25T00:00:00Z',
        home_team: 'E',
        away_team: 'F',
        prediction: 'X',
        result: '1-1',
      },
    ];
    mockChain({ data: mockTips, error: null });

    const req = createMockReq({
      method: 'GET',
      query: { type: 'track-record' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const stats = res.json.mock.calls[0][0];
    expect(stats.total_tips).toBe(3);
    expect(stats.won).toBe(2);
    expect(stats.lost).toBe(1);
    expect(stats.win_rate).toBeCloseTo(66.7, 1);
    expect(stats.avg_odds).toBeCloseTo(2.5, 1);
  });

  test('type=track-record: empty tips returns zeroes', async () => {
    mockChain({ data: [], error: null });

    const req = createMockReq({
      method: 'GET',
      query: { type: 'track-record' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const stats = res.json.mock.calls[0][0];
    expect(stats.total_tips).toBe(0);
    expect(stats.won).toBe(0);
    expect(stats.lost).toBe(0);
    expect(stats.win_rate).toBe(0);
    expect(stats.roi).toBe(0);
    expect(stats.avg_odds).toBe(0);
  });

  test('type=track-record: monthly breakdown computed', async () => {
    const mockTips = [
      {
        status: 'won',
        odds: 2.0,
        match_date: '2026-01-15T00:00:00Z',
      },
      {
        status: 'lost',
        odds: 1.5,
        match_date: '2026-01-20T00:00:00Z',
      },
    ];
    mockChain({ data: mockTips, error: null });

    const req = createMockReq({
      method: 'GET',
      query: { type: 'track-record' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const stats = res.json.mock.calls[0][0];
    expect(stats.monthly).toBeDefined();
    expect(Array.isArray(stats.monthly)).toBe(true);
  });

  test('type=track-record: caches result', async () => {
    const mockTips = [{ status: 'won', odds: 2.0 }];
    mockChain({ data: mockTips, error: null });

    const req = createMockReq({
      method: 'GET',
      query: { type: 'track-record' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(cache.set).toHaveBeenCalled();
    const cacheKey = cache.set.mock.calls[0][0];
    expect(cacheKey).toContain('track_record');
  });

  test('type=track-record: DB error returns 500', async () => {
    mockChain({ data: null, error: { message: 'DB error' } });

    const req = createMockReq({
      method: 'GET',
      query: { type: 'track-record' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Errore nel recupero delle statistiche',
    });
  });
});

describe('buildMonthlyBreakdown', () => {
  test('groups tips by month', () => {
    const tips = [
      {
        status: 'won',
        odds: 2.0,
        match_date: '2026-01-15T00:00:00Z',
      },
      {
        status: 'lost',
        odds: 1.5,
        match_date: '2026-01-20T00:00:00Z',
      },
      {
        status: 'won',
        odds: 3.0,
        match_date: '2026-02-05T00:00:00Z',
      },
    ];

    const breakdown = buildMonthlyBreakdown(tips);

    expect(breakdown).toBeDefined();
    expect(breakdown.some((m) => m.label === 'Gen')).toBe(true);
    expect(breakdown.some((m) => m.label === 'Feb')).toBe(true);
  });

  test('calculates profit correctly', () => {
    const tips = [
      { status: 'won', odds: 2.0, match_date: '2026-01-15T00:00:00Z' },
      { status: 'lost', odds: 1.5, match_date: '2026-01-20T00:00:00Z' },
    ];

    const breakdown = buildMonthlyBreakdown(tips);

    const jan = breakdown.find((m) => m.label === 'Gen');
    expect(jan).toBeDefined();
    // Won: (2.0 - 1) = +1.0, Lost: -1.0 → Total: 0.0
    expect(jan.profit).toBeCloseTo(0.0, 1);
  });

  test('returns last 6 months', () => {
    const tips = [];
    for (let i = 0; i < 12; i++) {
      tips.push({
        status: 'won',
        odds: 2.0,
        match_date: new Date(2026, i, 15).toISOString(),
      });
    }

    const breakdown = buildMonthlyBreakdown(tips);

    expect(breakdown.length).toBeLessThanOrEqual(6);
  });
});
