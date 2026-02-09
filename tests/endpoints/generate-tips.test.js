const handler = require('../../api/generate-tips');
const { createMockReq, createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: [], error: null })),
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
  },
}));
jest.mock('../../api/_lib/api-football', () => ({
  getUpcomingMatches: jest.fn(),
  getFullStandings: jest.fn(),
  getRecentResults: jest.fn(),
  getAllOdds: jest.fn(),
}));
jest.mock('../../api/_lib/football-data', () => ({
  getUpcomingMatches: jest.fn(),
  getFullStandings: jest.fn(),
  getRecentResults: jest.fn(),
}));
jest.mock('../../api/_lib/prediction-engine', () => ({
  generateBatchPredictions: jest.fn(),
}));
jest.mock('../../api/_lib/auth-middleware', () => ({
  verifyCronSecret: jest.fn(),
}));
jest.mock('../../api/_lib/leagues', () => ({
  resolveLeagueSlug: jest.fn((s) => s || 'serie-a'),
  getLeague: jest.fn().mockReturnValue({ name: 'Serie A', apiFootballId: 135, season: 2025 }),
}));

const { supabase } = require('../../api/_lib/supabase');
const apiFootball = require('../../api/_lib/api-football');
const footballData = require('../../api/_lib/football-data');
const { generateBatchPredictions } = require('../../api/_lib/prediction-engine');
const { verifyCronSecret } = require('../../api/_lib/auth-middleware');
const { resolveLeagueSlug, getLeague } = require('../../api/_lib/leagues');

/**
 * Creates a chainable Supabase query mock that is also thenable (awaitable).
 * All chain methods return `this`, and a non-enumerable `then` makes it awaitable.
 */
function createThenableChain(result) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
  };
  Object.defineProperty(chain, 'then', {
    value: (resolve) => resolve(result),
    enumerable: false,
    configurable: true,
  });
  return chain;
}

describe('POST /api/generate-tips', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.from.mockReset();
    supabase.rpc.mockReset();
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'not found' } });
    verifyCronSecret.mockReturnValue({ authorized: true, error: null });
    resolveLeagueSlug.mockImplementation((s) => s || 'serie-a');
    getLeague.mockReturnValue({ name: 'Serie A', apiFootballId: 135, season: 2025 });
  });

  test('Non-GET/POST method returns 405', async () => {
    const req = createMockReq({ method: 'PUT' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  test('Unauthorized POST returns 401', async () => {
    verifyCronSecret.mockReturnValueOnce({
      authorized: false,
      error: 'Invalid CRON_SECRET',
    });

    const req = createMockReq({ method: 'POST', body: { league: 'serie-a' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid CRON_SECRET' });
  });

  test('Generates tips for specified league', async () => {
    const mockMatches = [
      { id: 1, home: 'Inter', away: 'Milan', date: '2026-02-10T20:00:00Z' },
      { id: 2, home: 'Juventus', away: 'Roma', date: '2026-02-10T18:00:00Z' },
    ];
    const mockStandings = {
      total: [{ team: 'Inter', position: 1 }],
      home: [{ team: 'Inter', position: 1 }],
      away: [{ team: 'Milan', position: 2 }],
    };
    const mockResults = [{ home: 'Inter', away: 'Napoli', homeGoals: 2, awayGoals: 1 }];
    const mockPredictions = [
      {
        match_id: '1',
        home_team: 'Inter',
        away_team: 'Milan',
        prediction: '1',
        odds: 2.1,
        confidence: 75,
        tier: 'pro',
      },
      {
        match_id: '2',
        home_team: 'Juventus',
        away_team: 'Roma',
        prediction: 'X',
        odds: 3.2,
        confidence: 65,
        tier: 'free',
      },
    ];

    apiFootball.getUpcomingMatches.mockResolvedValue(mockMatches);
    apiFootball.getFullStandings.mockResolvedValue(mockStandings);
    footballData.getRecentResults.mockResolvedValue(mockResults);
    apiFootball.getAllOdds.mockResolvedValue(null);
    generateBatchPredictions.mockResolvedValue(mockPredictions);

    // Source makes 3 sequential supabase.from('tips') calls:
    // 1. Existing tips check: .select('match_id').eq('league', ...).in('match_id', ...)
    // 2. Accuracy fallback:   .select('prediction, status').eq('league', ...).in('status', ...)
    // 3. Insert:              .insert(tipsWithLeague)
    const insertMock = jest.fn().mockReturnThis();
    const mockInsertChain = createThenableChain({ error: null });
    mockInsertChain.insert = insertMock;
    Object.defineProperty(mockInsertChain, 'then', {
      value: (resolve) => resolve({ error: null }),
      enumerable: false,
      configurable: true,
    });

    supabase.from
      .mockReturnValueOnce(createThenableChain({ data: [], error: null }))
      .mockReturnValueOnce(createThenableChain({ data: [], error: null }))
      .mockReturnValueOnce(mockInsertChain);

    const req = createMockReq({
      method: 'POST',
      body: { league: 'serie-a' },
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(apiFootball.getUpcomingMatches).toHaveBeenCalledWith('serie-a', 10);
    expect(generateBatchPredictions).toHaveBeenCalledWith(
      expect.objectContaining({
        matches: mockMatches,
        standings: mockStandings.total,
        homeStandings: mockStandings.home,
        awayStandings: mockStandings.away,
        recentResults: mockResults,
        leagueName: 'Serie A',
      }),
    );
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          match_id: '1',
          league: 'serie-a',
        }),
        expect.objectContaining({
          match_id: '2',
          league: 'serie-a',
        }),
      ]),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        generated: 2,
        league: 'serie-a',
      }),
    );
  });

  test('No upcoming matches returns generated: 0', async () => {
    apiFootball.getUpcomingMatches.mockResolvedValue([]);

    const req = createMockReq({
      method: 'POST',
      body: { league: 'serie-a' },
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      generated: 0,
      league: 'serie-a',
      tips: [],
    });
  });

  test('All matches already have tips returns generated: 0', async () => {
    const mockMatches = [
      { id: 1, home: 'Inter', away: 'Milan', date: '2026-02-10T20:00:00Z' },
    ];

    apiFootball.getUpcomingMatches.mockResolvedValue(mockMatches);
    apiFootball.getFullStandings.mockResolvedValue({
      total: [],
      home: [],
      away: [],
    });
    footballData.getRecentResults.mockResolvedValue([]);

    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: [{ match_id: '1' }], error: null })),
    });

    const req = createMockReq({
      method: 'POST',
      body: { league: 'serie-a' },
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      generated: 0,
      league: 'serie-a',
      tips: [],
    });
  });

  test('Error in generation returns 500', async () => {
    apiFootball.getUpcomingMatches.mockRejectedValue(new Error('API error'));
    footballData.getUpcomingMatches.mockRejectedValue(new Error('Fallback error'));

    const req = createMockReq({
      method: 'POST',
      body: { league: 'serie-a' },
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Errore nella generazione dei pronostici',
    });
  });

  test('Primary API fails, fallback succeeds', async () => {
    const mockMatches = [{ id: 1, home: 'Inter', away: 'Milan' }];
    const mockStandings = { total: [], home: [], away: [] };

    apiFootball.getUpcomingMatches.mockRejectedValue(new Error('Primary API down'));
    footballData.getUpcomingMatches.mockResolvedValue(mockMatches);
    apiFootball.getFullStandings.mockRejectedValue(new Error('Primary API down'));
    footballData.getFullStandings.mockResolvedValue(mockStandings);
    footballData.getRecentResults.mockResolvedValue([]);
    generateBatchPredictions.mockResolvedValue([]);

    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: [], error: null })),
    });

    supabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: [], error: null })),
    });

    const req = createMockReq({
      method: 'POST',
      body: { league: 'serie-a' },
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(footballData.getUpcomingMatches).toHaveBeenCalled();
    expect(footballData.getFullStandings).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('Predictions saved to Supabase with league field', async () => {
    const mockMatches = [{ id: 1, home: 'Inter', away: 'Milan' }];
    const mockStandings = { total: [], home: [], away: [] };
    const mockPredictions = [
      {
        match_id: '1',
        home_team: 'Inter',
        away_team: 'Milan',
        prediction: '1',
        odds: 2.0,
      },
    ];

    resolveLeagueSlug.mockReturnValue('la-liga');
    getLeague.mockReturnValue({ name: 'La Liga', apiFootballId: 140, season: 2025 });
    apiFootball.getUpcomingMatches.mockResolvedValue(mockMatches);
    apiFootball.getFullStandings.mockResolvedValue(mockStandings);
    footballData.getRecentResults.mockResolvedValue([]);
    generateBatchPredictions.mockResolvedValue(mockPredictions);

    // 3 sequential from calls: existing tips, accuracy fallback, insert
    const insertMock = jest.fn().mockReturnThis();
    const mockInsertChain = createThenableChain({ error: null });
    mockInsertChain.insert = insertMock;
    Object.defineProperty(mockInsertChain, 'then', {
      value: (resolve) => resolve({ error: null }),
      enumerable: false,
      configurable: true,
    });

    supabase.from
      .mockReturnValueOnce(createThenableChain({ data: [], error: null }))
      .mockReturnValueOnce(createThenableChain({ data: [], error: null }))
      .mockReturnValueOnce(mockInsertChain);

    const req = createMockReq({
      method: 'POST',
      body: { league: 'la-liga' },
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({
        match_id: '1',
        league: 'la-liga',
      }),
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('GET /api/generate-tips (cron orchestrator)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyCronSecret.mockReturnValue({ authorized: true, error: null });
  });

  test('Unauthorized GET returns 401', async () => {
    verifyCronSecret.mockReturnValueOnce({
      authorized: false,
      error: 'Missing CRON_SECRET',
    });

    const req = createMockReq({
      method: 'GET',
      headers: {},
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing CRON_SECRET' });
  });

  test('Runs settle → generate → send pipeline', async () => {
    // Mock cron-tasks module
    const mockCronTasks = jest.fn((req, res) => {
      res.status(200).json({ ok: true });
    });
    jest.mock('../../api/cron-tasks', () => mockCronTasks, { virtual: true });

    // Mock generateForLeague via module
    const { generateForLeague } = require('../../api/generate-tips');
    if (generateForLeague) {
      jest
        .spyOn(require('../../api/generate-tips'), 'generateForLeague')
        .mockResolvedValue({ generated: 1, league: 'serie-a' });
    }

    apiFootball.getUpcomingMatches.mockResolvedValue([]);
    apiFootball.getFullStandings.mockResolvedValue({ total: [], home: [], away: [] });
    footballData.getRecentResults.mockResolvedValue([]);
    generateBatchPredictions.mockResolvedValue([]);

    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      then: jest.fn((r) => r({ data: [], error: null })),
    });

    const req = createMockReq({
      method: 'GET',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        settle: expect.anything(),
        generate: expect.any(Array),
        send: expect.anything(),
      }),
    );
  });
});
