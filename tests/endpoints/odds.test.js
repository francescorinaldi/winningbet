const handler = require('../../api/odds');
const { createMockReq, createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/api-football', () => ({
  getOdds: jest.fn(),
}));
jest.mock('../../api/_lib/cache', () => ({
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
}));

const { getOdds } = require('../../api/_lib/api-football');
const cache = require('../../api/_lib/cache');

describe('GET /api/odds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockReturnValue(null);
  });

  test('Non-GET method returns 405', async () => {
    const req = createMockReq({ method: 'POST' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  test('Missing fixture parameter returns 400', async () => {
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing "fixture" query parameter',
    });
  });

  test('Fixture found returns odds', async () => {
    const mockOdds = {
      fixture_id: '12345',
      bookmakers: [
        {
          name: 'Bet365',
          bets: [
            {
              name: 'Match Winner',
              values: [
                { value: '1', odd: '2.10' },
                { value: 'X', odd: '3.40' },
                { value: '2', odd: '3.20' },
              ],
            },
          ],
        },
      ],
    };
    getOdds.mockResolvedValueOnce(mockOdds);

    const req = createMockReq({ method: 'GET', query: { fixture: '12345' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getOdds).toHaveBeenCalledWith('12345');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockOdds);
  });

  test('No odds available returns null', async () => {
    getOdds.mockResolvedValueOnce(null);

    const req = createMockReq({ method: 'GET', query: { fixture: '12345' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(null);
  });

  test('API error returns 502', async () => {
    getOdds.mockRejectedValueOnce(new Error('API unavailable'));

    const req = createMockReq({ method: 'GET', query: { fixture: '12345' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unable to fetch odds',
    });
  });

  test('Cache hit returns cached data', async () => {
    const cachedOdds = {
      fixture_id: '12345',
      bookmakers: [
        {
          name: 'Bet365',
          bets: [
            {
              name: 'Match Winner',
              values: [
                { value: '1', odd: '2.10' },
                { value: 'X', odd: '3.40' },
                { value: '2', odd: '3.20' },
              ],
            },
          ],
        },
      ],
    };
    cache.get.mockReturnValueOnce(cachedOdds);

    const req = createMockReq({ method: 'GET', query: { fixture: '12345' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getOdds).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(cachedOdds);
  });

  test('Cache miss queries API and caches result', async () => {
    const mockOdds = {
      fixture_id: '12345',
      bookmakers: [
        {
          name: 'Bet365',
          bets: [
            {
              name: 'Match Winner',
              values: [
                { value: '1', odd: '2.10' },
                { value: 'X', odd: '3.40' },
                { value: '2', odd: '3.20' },
              ],
            },
          ],
        },
      ],
    };
    getOdds.mockResolvedValueOnce(mockOdds);

    const req = createMockReq({ method: 'GET', query: { fixture: '12345' } });
    const res = createMockRes();

    await handler(req, res);

    expect(getOdds).toHaveBeenCalledWith('12345');
    expect(cache.set).toHaveBeenCalled();
    const cacheKey = cache.set.mock.calls[0][0];
    expect(cacheKey).toContain('odds');
    expect(cacheKey).toContain('12345');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('Sets Cache-Control headers', async () => {
    const mockOdds = {
      fixture_id: '12345',
      bookmakers: [],
    };
    getOdds.mockResolvedValueOnce(mockOdds);

    const req = createMockReq({ method: 'GET', query: { fixture: '12345' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      expect.any(String)
    );
  });
});
