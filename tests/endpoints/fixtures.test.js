const handler = require('../../api/fixtures');
const { createMockReq, createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: [], error: null })),
    }),
  },
}));
jest.mock('../../api/_lib/api-football', () => ({
  getUpcomingMatches: jest.fn(),
  getRecentResults: jest.fn(),
  getOdds: jest.fn(),
}));
jest.mock('../../api/_lib/football-data', () => ({
  getUpcomingMatches: jest.fn(),
  getRecentResults: jest.fn(),
}));
jest.mock('../../api/_lib/cache', () => ({
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
}));
jest.mock('../../api/_lib/leagues', () => ({
  resolveLeagueSlug: jest.fn((s) => s || 'serie-a'),
}));
jest.mock('../../api/cron-tasks', () => ({
  evaluatePrediction: jest.fn(),
  buildActualResult: jest.fn(),
}));

const { getUpcomingMatches: getUpcomingApiFootball } = require('../../api/_lib/api-football');
const { getRecentResults: getRecentApiFootball } = require('../../api/_lib/api-football');
const { getUpcomingMatches: getUpcomingFootballData } = require('../../api/_lib/football-data');
const { getRecentResults: getRecentFootballData } = require('../../api/_lib/football-data');
const { getOdds } = require('../../api/_lib/api-football');
const cache = require('../../api/_lib/cache');
const { resolveLeagueSlug } = require('../../api/_lib/leagues');

describe('GET /api/fixtures', () => {
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
      error: 'Parametro type richiesto: matches, results, odds, h2h, form o odds-compare',
    });
  });

  test('type=matches: primary success returns matches', async () => {
    const mockMatches = [
      {
        id: '1',
        date: '2026-02-10T18:00:00Z',
        home_team: 'Inter',
        away_team: 'Milan',
      },
      {
        id: '2',
        date: '2026-02-11T20:45:00Z',
        home_team: 'Juventus',
        away_team: 'Roma',
      },
    ];
    getUpcomingApiFootball.mockResolvedValueOnce(mockMatches);

    const req = createMockReq({ method: 'GET', query: { type: 'matches' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getUpcomingApiFootball).toHaveBeenCalledWith('serie-a', 10);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockMatches);
  });

  test('type=matches: primary fails, fallback succeeds', async () => {
    const mockMatches = [
      {
        id: '1',
        date: '2026-02-10T18:00:00Z',
        home_team: 'Inter',
        away_team: 'Milan',
      },
    ];
    getUpcomingApiFootball.mockRejectedValueOnce(new Error('Primary fail'));
    getUpcomingFootballData.mockResolvedValueOnce(mockMatches);

    const req = createMockReq({ method: 'GET', query: { type: 'matches' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getUpcomingApiFootball).toHaveBeenCalled();
    expect(getUpcomingFootballData).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockMatches);
  });

  test('type=matches: both fail returns 502', async () => {
    getUpcomingApiFootball.mockRejectedValueOnce(new Error('Primary fail'));
    getUpcomingFootballData.mockRejectedValueOnce(new Error('Fallback fail'));

    const req = createMockReq({ method: 'GET', query: { type: 'matches' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unable to fetch matches from any source',
    });
  });

  test('type=results: primary success returns results', async () => {
    const mockResults = [
      {
        id: '1',
        date: '2026-02-07T18:00:00Z',
        home_team: 'Inter',
        away_team: 'Milan',
        score: '2-1',
      },
      {
        id: '2',
        date: '2026-02-06T20:45:00Z',
        home_team: 'Juventus',
        away_team: 'Roma',
        score: '1-1',
      },
    ];
    getRecentApiFootball.mockResolvedValueOnce(mockResults);

    const req = createMockReq({ method: 'GET', query: { type: 'results' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getRecentApiFootball).toHaveBeenCalledWith('serie-a', 10);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockResults);
  });

  test('type=results: primary fails, fallback succeeds', async () => {
    const mockResults = [
      {
        id: '1',
        date: '2026-02-07T18:00:00Z',
        home_team: 'Inter',
        away_team: 'Milan',
        score: '2-1',
      },
    ];
    getRecentApiFootball.mockRejectedValueOnce(new Error('Primary fail'));
    getRecentFootballData.mockResolvedValueOnce(mockResults);

    const req = createMockReq({ method: 'GET', query: { type: 'results' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getRecentApiFootball).toHaveBeenCalled();
    expect(getRecentFootballData).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockResults);
  });

  test('type=results: both fail returns 502', async () => {
    getRecentApiFootball.mockRejectedValueOnce(new Error('Primary fail'));
    getRecentFootballData.mockRejectedValueOnce(new Error('Fallback fail'));

    const req = createMockReq({ method: 'GET', query: { type: 'results' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unable to fetch results from any source',
    });
  });

  test('Cache hit for matches returns cached data', async () => {
    const cachedMatches = [
      {
        id: 'cached',
        home_team: 'Cached',
        away_team: 'Team',
      },
    ];
    cache.get.mockReturnValueOnce(cachedMatches);

    const req = createMockReq({ method: 'GET', query: { type: 'matches' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getUpcomingApiFootball).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(cachedMatches);
  });

  test('Cache hit for results returns cached data', async () => {
    const cachedResults = [
      {
        id: 'cached',
        home_team: 'Cached',
        away_team: 'Team',
        score: '2-1',
      },
    ];
    cache.get.mockReturnValueOnce(cachedResults);

    const req = createMockReq({ method: 'GET', query: { type: 'results' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getRecentApiFootball).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(cachedResults);
  });

  test('Sets Cache-Control headers', async () => {
    const mockMatches = [{ id: '1', home_team: 'Inter', away_team: 'Milan' }];
    getUpcomingApiFootball.mockResolvedValueOnce(mockMatches);

    const req = createMockReq({ method: 'GET', query: { type: 'matches' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', expect.any(String));
  });

  test('Caches the result', async () => {
    const mockMatches = [{ id: '1', home_team: 'Inter', away_team: 'Milan' }];
    getUpcomingApiFootball.mockResolvedValueOnce(mockMatches);

    const req = createMockReq({ method: 'GET', query: { type: 'matches' } });
    const res = createMockRes();

    await handler(req, res);

    expect(cache.set).toHaveBeenCalled();
    const cacheKey = cache.set.mock.calls[0][0];
    expect(cacheKey).toContain('matches');
    expect(cacheKey).toContain('serie-a');
  });

  // ─── type=odds ───────────────────────────────────────────────────────────

  test('type=odds: missing fixture returns 400', async () => {
    const req = createMockReq({ method: 'GET', query: { type: 'odds' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing "fixture" query parameter' });
  });

  test('type=odds: returns odds for fixture', async () => {
    const mockOdds = { fixture_id: '12345', bookmakers: [{ name: 'Bet365' }] };
    getOdds.mockResolvedValueOnce(mockOdds);

    const req = createMockReq({ method: 'GET', query: { type: 'odds', fixture: '12345' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getOdds).toHaveBeenCalledWith('12345');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockOdds);
  });

  test('type=odds: no odds returns null', async () => {
    getOdds.mockResolvedValueOnce(null);

    const req = createMockReq({ method: 'GET', query: { type: 'odds', fixture: '12345' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(null);
  });

  test('type=odds: API error returns 502', async () => {
    getOdds.mockRejectedValueOnce(new Error('API unavailable'));

    const req = createMockReq({ method: 'GET', query: { type: 'odds', fixture: '12345' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unable to fetch odds' });
  });

  test('type=odds: cache hit returns cached data', async () => {
    const cachedOdds = { fixture_id: '12345', bookmakers: [] };
    cache.get.mockReturnValueOnce(cachedOdds);

    const req = createMockReq({ method: 'GET', query: { type: 'odds', fixture: '12345' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getOdds).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(cachedOdds);
  });
});
