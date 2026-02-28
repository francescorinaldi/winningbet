const handler = require('../../api/fixtures');
const { createMockReq, createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/api-football', () => ({
  getHeadToHead: jest.fn(),
  getStandings: jest.fn(),
  getUpcomingMatches: jest.fn(),
  getRecentResults: jest.fn(),
  getOdds: jest.fn(),
  getMultipleBookmakerOdds: jest.fn(),
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
jest.mock('../../api/_lib/supabase', () => ({
  supabase: { from: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), lt: jest.fn().mockReturnThis(), in: jest.fn().mockResolvedValue({ data: [] }) },
}));
jest.mock('../../api/_lib/prediction-utils', () => ({
  evaluatePrediction: jest.fn(),
  buildActualResult: jest.fn(),
}));
jest.mock('../../api/_lib/auth-middleware', () => ({
  authenticate: jest.fn(),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis() })),
}));

const { getHeadToHead, getStandings } = require('../../api/_lib/api-football');
const cache = require('../../api/_lib/cache');

describe('GET /api/fixtures (h2h + form types)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-GET methods', async () => {
    const req = createMockReq({ method: 'POST', query: { type: 'h2h' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('should return 400 when type parameter is missing', async () => {
    const req = createMockReq({ method: 'GET', query: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Parametro type richiesto: matches, results, odds, h2h, form o odds-compare',
    });
  });

  it('should return 400 for type=h2h without home/away parameters', async () => {
    const req = createMockReq({ method: 'GET', query: { type: 'h2h' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Parametri home e away richiesti',
    });
  });

  it('should return H2H data for type=h2h with valid parameters', async () => {
    const mockH2HData = {
      fixtures: [{ id: 1, teams: { home: { name: 'Inter' }, away: { name: 'Milan' } } }],
    };
    getHeadToHead.mockResolvedValue(mockH2HData);

    const req = createMockReq({
      method: 'GET',
      query: { type: 'h2h', home: '505', away: '489', league: 'serie-a' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(getHeadToHead).toHaveBeenCalledWith('serie-a', '505', '489', 10);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockH2HData);
  });

  it('should return 500 when type=h2h encounters an error', async () => {
    getHeadToHead.mockRejectedValue(new Error('API error'));

    const req = createMockReq({
      method: 'GET',
      query: { type: 'h2h', home: '505', away: '489' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Errore nel recupero H2H: API error',
    });
  });

  it('should return cached H2H data when available', async () => {
    const cachedData = {
      fixtures: [{ id: 2, teams: { home: { name: 'Juventus' }, away: { name: 'Roma' } } }],
    };
    cache.get.mockReturnValueOnce(cachedData);

    const req = createMockReq({
      method: 'GET',
      query: { type: 'h2h', home: '496', away: '497' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(cache.get).toHaveBeenCalledWith('h2h:serie-a:496:497');
    expect(getHeadToHead).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(cachedData);
  });

  it('should return 400 for type=form without teams parameter', async () => {
    const req = createMockReq({ method: 'GET', query: { type: 'form' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Parametro teams richiesto',
    });
  });

  it('should return form data for type=form with valid parameters', async () => {
    const mockStandings = [
      {
        name: 'Inter',
        form: 'WWWDL',
        rank: 1,
        points: 60,
      },
    ];
    getStandings.mockResolvedValue(mockStandings);

    const req = createMockReq({
      method: 'GET',
      query: { type: 'form', teams: 'Inter', league: 'serie-a' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(getStandings).toHaveBeenCalledWith('serie-a');
    expect(res.status).toHaveBeenCalledWith(200);
    const result = res.json.mock.calls[0][0];
    expect(result).toHaveProperty('Inter');
    expect(result.Inter.form).toBe('WWWDL');
  });

  it('should return 500 when type=form encounters an error', async () => {
    getStandings.mockRejectedValue(new Error('Standings API error'));

    const req = createMockReq({
      method: 'GET',
      query: { type: 'form', teams: '505,489' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Errore nel recupero classifica: Standings API error',
    });
  });

  it('should return cached standings for type=form when available', async () => {
    const cachedStandings = [
      {
        name: 'Juventus',
        form: 'WWDWW',
        rank: 2,
        points: 58,
      },
    ];
    cache.get.mockReturnValueOnce(cachedStandings);

    const req = createMockReq({
      method: 'GET',
      query: { type: 'form', teams: 'Juventus', league: 'serie-a' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(cache.get).toHaveBeenCalledWith('team-form:serie-a');
    expect(getStandings).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const result = res.json.mock.calls[0][0];
    expect(result).toHaveProperty('Juventus');
  });
});
