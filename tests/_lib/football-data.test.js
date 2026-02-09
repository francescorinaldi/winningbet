/**
 * Test suite for api/_lib/football-data.js
 * Tests football-data.org fallback client.
 */

const {
  getUpcomingMatches,
  getRecentResults,
  getStandings,
  getFullStandings,
} = require('../../api/_lib/football-data');

// Mock leagues module
jest.mock('../../api/_lib/leagues', () => ({
  getLeague: jest.fn().mockReturnValue({ footballDataCode: 'SA', season: 2025, name: 'Serie A' }),
}));

describe('football-data', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUpcomingMatches', () => {
    test('normalizes matches correctly', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            matches: [
              {
                id: 12345,
                utcDate: '2025-01-15T20:00:00Z',
                status: 'SCHEDULED',
                homeTeam: {
                  shortName: 'Inter',
                  name: 'FC Internazionale Milano',
                  crest: 'https://example.com/inter.png',
                },
                awayTeam: {
                  shortName: 'Milan',
                  name: 'AC Milan',
                  crest: 'https://example.com/milan.png',
                },
                score: { fullTime: { home: null, away: null } },
              },
            ],
          }),
      });

      const result = await getUpcomingMatches('serie-a', 10);

      expect(result).toEqual([
        {
          id: 12345,
          date: '2025-01-15T20:00:00Z',
          status: 'SCHEDULED',
          home: 'Inter',
          homeLogo: 'https://example.com/inter.png',
          away: 'Milan',
          awayLogo: 'https://example.com/milan.png',
          goalsHome: null,
          goalsAway: null,
        },
      ]);
    });

    test('slices to count parameter', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            matches: Array(15)
              .fill(null)
              .map((_, i) => ({
                id: i,
                utcDate: '2025-01-15T20:00:00Z',
                status: 'SCHEDULED',
                homeTeam: { shortName: 'Team A', name: 'Team A', crest: '' },
                awayTeam: { shortName: 'Team B', name: 'Team B', crest: '' },
                score: { fullTime: { home: null, away: null } },
              })),
          }),
      });

      const result = await getUpcomingMatches('serie-a', 5);
      expect(result).toHaveLength(5);
    });

    test('throws on HTTP error', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(getUpcomingMatches('serie-a')).rejects.toThrow(
        'football-data.org error: 404 Not Found',
      );
    });

    test('uses name when shortName is missing', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            matches: [
              {
                id: 12345,
                utcDate: '2025-01-15T20:00:00Z',
                status: 'SCHEDULED',
                homeTeam: {
                  name: 'FC Internazionale Milano',
                  crest: 'https://example.com/inter.png',
                },
                awayTeam: {
                  name: 'AC Milan',
                  crest: 'https://example.com/milan.png',
                },
                score: { fullTime: { home: null, away: null } },
              },
            ],
          }),
      });

      const result = await getUpcomingMatches('serie-a', 10);
      expect(result[0].home).toBe('FC Internazionale Milano');
      expect(result[0].away).toBe('AC Milan');
    });

    test('returns empty array when no matches', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ matches: [] }),
      });

      const result = await getUpcomingMatches('serie-a', 10);
      expect(result).toEqual([]);
    });
  });

  describe('getRecentResults', () => {
    test('reverses results (most recent first)', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            matches: [
              {
                id: 1,
                utcDate: '2025-01-01T20:00:00Z',
                status: 'FINISHED',
                homeTeam: { shortName: 'A', name: 'A', crest: '' },
                awayTeam: { shortName: 'B', name: 'B', crest: '' },
                score: { fullTime: { home: 1, away: 0 } },
              },
              {
                id: 2,
                utcDate: '2025-01-02T20:00:00Z',
                status: 'FINISHED',
                homeTeam: { shortName: 'C', name: 'C', crest: '' },
                awayTeam: { shortName: 'D', name: 'D', crest: '' },
                score: { fullTime: { home: 2, away: 1 } },
              },
            ],
          }),
      });

      const result = await getRecentResults('serie-a', 10);
      // Should be reversed, so ID 2 comes first
      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(1);
    });

    test('normalizes fields correctly', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            matches: [
              {
                id: 54321,
                utcDate: '2025-01-10T18:00:00Z',
                status: 'FINISHED',
                homeTeam: {
                  shortName: 'Juve',
                  name: 'Juventus',
                  crest: 'https://example.com/juve.png',
                },
                awayTeam: {
                  shortName: 'Roma',
                  name: 'AS Roma',
                  crest: 'https://example.com/roma.png',
                },
                score: { fullTime: { home: 2, away: 1 } },
              },
            ],
          }),
      });

      const result = await getRecentResults('serie-a', 10);
      expect(result).toEqual([
        {
          id: 54321,
          date: '2025-01-10T18:00:00Z',
          status: 'FINISHED',
          home: 'Juve',
          homeLogo: 'https://example.com/juve.png',
          away: 'Roma',
          awayLogo: 'https://example.com/roma.png',
          goalsHome: 2,
          goalsAway: 1,
        },
      ]);
    });
  });

  describe('getStandings', () => {
    test('finds TOTAL type and normalizes', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            standings: [
              {
                type: 'TOTAL',
                table: [
                  {
                    position: 1,
                    team: {
                      shortName: 'Inter',
                      name: 'FC Internazionale',
                      crest: 'https://example.com/inter.png',
                    },
                    points: 50,
                    playedGames: 20,
                    won: 15,
                    draw: 5,
                    lost: 0,
                    goalsFor: 45,
                    goalsAgainst: 10,
                    goalDifference: 35,
                    form: 'WWDWW',
                  },
                ],
              },
            ],
          }),
      });

      const result = await getStandings('serie-a');
      expect(result).toEqual([
        {
          rank: 1,
          name: 'Inter',
          logo: 'https://example.com/inter.png',
          points: 50,
          played: 20,
          win: 15,
          draw: 5,
          lose: 0,
          goalsFor: 45,
          goalsAgainst: 10,
          goalDiff: 35,
          form: 'WWDWW',
        },
      ]);
    });

    test('returns empty array if no standings data', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ standings: [] }),
      });

      const result = await getStandings('serie-a');
      expect(result).toEqual([]);
    });
  });

  describe('getFullStandings', () => {
    test('returns { total, home, away } from TOTAL, HOME, AWAY types', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            standings: [
              {
                type: 'TOTAL',
                table: [
                  {
                    position: 1,
                    team: { shortName: 'Inter', name: 'Inter', crest: '' },
                    points: 50,
                    playedGames: 20,
                    won: 15,
                    draw: 5,
                    lost: 0,
                    goalsFor: 45,
                    goalsAgainst: 10,
                    goalDifference: 35,
                    form: 'WWDWW',
                  },
                ],
              },
              {
                type: 'HOME',
                table: [
                  {
                    position: 1,
                    team: { shortName: 'Inter', name: 'Inter', crest: '' },
                    points: 27,
                    playedGames: 10,
                    won: 8,
                    draw: 3,
                    lost: 0,
                    goalsFor: 25,
                    goalsAgainst: 5,
                    goalDifference: 20,
                    form: 'WWDWW',
                  },
                ],
              },
              {
                type: 'AWAY',
                table: [
                  {
                    position: 2,
                    team: { shortName: 'Inter', name: 'Inter', crest: '' },
                    points: 23,
                    playedGames: 10,
                    won: 7,
                    draw: 2,
                    lost: 1,
                    goalsFor: 20,
                    goalsAgainst: 5,
                    goalDifference: 15,
                    form: 'WWDWL',
                  },
                ],
              },
            ],
          }),
      });

      const result = await getFullStandings('serie-a');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('home');
      expect(result).toHaveProperty('away');
      expect(result.total).toHaveLength(1);
      expect(result.home).toHaveLength(1);
      expect(result.away).toHaveLength(1);
    });

    test('returns empty arrays if null', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ standings: [] }),
      });

      const result = await getFullStandings('serie-a');
      expect(result).toEqual({ total: [], home: [], away: [] });
    });
  });
});
