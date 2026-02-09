/**
 * Test suite for api/_lib/api-football.js
 * Tests API-Football client functions and odds prediction logic.
 */

const {
  getUpcomingMatches,
  getRecentResults,
  getOdds,
  getAllOdds,
  findOddsForPrediction,
  getStandings,
  getFullStandings,
} = require('../../api/_lib/api-football');

// Mock leagues module
jest.mock('../../api/_lib/leagues', () => ({
  getLeague: jest
    .fn()
    .mockReturnValue({ apiFootballId: 135, footballDataCode: 'SA', season: 2025, name: 'Serie A' }),
}));

describe('api-football', () => {
  describe('findOddsForPrediction', () => {
    const allOdds = {
      matchWinner: [
        { outcome: 'Home', odd: '1.85' },
        { outcome: 'Draw', odd: '3.50' },
        { outcome: 'Away', odd: '4.20' },
      ],
      overUnder: [
        { outcome: 'Over 2.5', odd: '1.95' },
        { outcome: 'Under 2.5', odd: '1.85' },
        { outcome: 'Over 1.5', odd: '1.30' },
        { outcome: 'Under 3.5', odd: '1.35' },
      ],
      bothTeamsScore: [
        { outcome: 'Yes', odd: '1.72' },
        { outcome: 'No', odd: '2.05' },
      ],
      doubleChance: [
        { outcome: 'Home/Draw', odd: '1.20' },
        { outcome: 'Home/Away', odd: '1.25' },
        { outcome: 'Draw/Away', odd: '1.65' },
      ],
    };

    // Match Winner tests
    test('finds Home matchWinner and returns parsed float', () => {
      expect(findOddsForPrediction(allOdds, '1')).toBe(1.85);
    });

    test('finds Draw matchWinner', () => {
      expect(findOddsForPrediction(allOdds, 'X')).toBe(3.5);
    });

    test('finds Away matchWinner', () => {
      expect(findOddsForPrediction(allOdds, '2')).toBe(4.2);
    });

    // Double Chance tests
    test('finds Home/Draw in doubleChance', () => {
      expect(findOddsForPrediction(allOdds, '1X')).toBe(1.2);
    });

    test('finds Draw/Away in doubleChance', () => {
      expect(findOddsForPrediction(allOdds, 'X2')).toBe(1.65);
    });

    test('finds Home/Away in doubleChance', () => {
      expect(findOddsForPrediction(allOdds, '12')).toBe(1.25);
    });

    // Over/Under tests
    test('finds Over 2.5 in overUnder (case-insensitive)', () => {
      expect(findOddsForPrediction(allOdds, 'Over 2.5')).toBe(1.95);
    });

    test('finds Under 2.5 in overUnder', () => {
      expect(findOddsForPrediction(allOdds, 'Under 2.5')).toBe(1.85);
    });

    test('finds Over 1.5 with different threshold', () => {
      expect(findOddsForPrediction(allOdds, 'Over 1.5')).toBe(1.3);
    });

    test('finds Under 3.5 with different threshold', () => {
      expect(findOddsForPrediction(allOdds, 'Under 3.5')).toBe(1.35);
    });

    // Both Teams Score tests
    test('finds Yes (Goal) in bothTeamsScore', () => {
      expect(findOddsForPrediction(allOdds, 'Goal')).toBe(1.72);
    });

    test('finds No (No Goal) in bothTeamsScore', () => {
      expect(findOddsForPrediction(allOdds, 'No Goal')).toBe(2.05);
    });

    // Combo predictions tests
    test('calculates combo 1 + Over 1.5 with correlation factor', () => {
      const result = findOddsForPrediction(allOdds, '1 + Over 1.5');
      // 1.85 * 1.30 * 0.92 = 2.2126, rounded to 2.21
      expect(result).toBe(2.21);
    });

    test('calculates combo 2 + Over 1.5 with away odds', () => {
      const result = findOddsForPrediction(allOdds, '2 + Over 1.5');
      // 4.20 * 1.30 * 0.92 = 5.0232, rounded to 5.02
      expect(result).toBe(5.02);
    });

    // Edge cases
    test('returns null for null prediction', () => {
      expect(findOddsForPrediction(allOdds, null)).toBeNull();
    });

    test('returns null for null allOdds', () => {
      expect(findOddsForPrediction(null, '1')).toBeNull();
    });

    test('returns null for missing market', () => {
      const incompleteOdds = { matchWinner: allOdds.matchWinner };
      expect(findOddsForPrediction(incompleteOdds, 'Goal')).toBeNull();
    });

    test('handles whitespace in prediction (trimmed to 1)', () => {
      expect(findOddsForPrediction(allOdds, ' 1 ')).toBe(1.85);
    });
  });

  describe('async functions', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    test('getUpcomingMatches normalizes response correctly', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: [
              {
                fixture: { id: 12345, date: '2025-01-15T20:00:00Z', status: { short: 'NS' } },
                teams: {
                  home: { name: 'Inter', logo: 'https://example.com/inter.png' },
                  away: { name: 'Milan', logo: 'https://example.com/milan.png' },
                },
                goals: { home: null, away: null },
              },
            ],
            errors: {},
          }),
      });

      const result = await getUpcomingMatches('serie-a', 10);

      expect(result).toEqual([
        {
          id: 12345,
          date: '2025-01-15T20:00:00Z',
          status: 'NS',
          home: 'Inter',
          homeLogo: 'https://example.com/inter.png',
          away: 'Milan',
          awayLogo: 'https://example.com/milan.png',
          goalsHome: null,
          goalsAway: null,
        },
      ]);
    });

    test('getRecentResults normalizes response correctly', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: [
              {
                fixture: { id: 54321, date: '2025-01-10T18:00:00Z', status: { short: 'FT' } },
                teams: {
                  home: { name: 'Juventus', logo: 'https://example.com/juve.png' },
                  away: { name: 'Roma', logo: 'https://example.com/roma.png' },
                },
                goals: { home: 2, away: 1 },
              },
            ],
            errors: {},
          }),
      });

      const result = await getRecentResults('serie-a', 10);

      expect(result).toEqual([
        {
          id: 54321,
          date: '2025-01-10T18:00:00Z',
          status: 'FT',
          home: 'Juventus',
          homeLogo: 'https://example.com/juve.png',
          away: 'Roma',
          awayLogo: 'https://example.com/roma.png',
          goalsHome: 2,
          goalsAway: 1,
        },
      ]);
    });

    test('getOdds returns null when no data', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: [], errors: {} }),
      });

      const result = await getOdds(12345);
      expect(result).toBeNull();
    });

    test('getOdds returns fixtureId + bookmaker + values', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: [
              {
                bookmakers: [
                  {
                    name: 'Bet365',
                    bets: [
                      {
                        id: 1,
                        values: [
                          { value: 'Home', odd: '1.85' },
                          { value: 'Draw', odd: '3.50' },
                          { value: 'Away', odd: '4.20' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            errors: {},
          }),
      });

      const result = await getOdds(12345);
      expect(result).toEqual({
        fixtureId: 12345,
        bookmaker: 'Bet365',
        values: [
          { outcome: 'Home', odd: '1.85' },
          { outcome: 'Draw', odd: '3.50' },
          { outcome: 'Away', odd: '4.20' },
        ],
      });
    });

    test('getAllOdds returns all market types', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: [
              {
                bookmakers: [
                  {
                    name: 'Bet365',
                    bets: [
                      {
                        id: 1,
                        values: [
                          { value: 'Home', odd: '1.85' },
                          { value: 'Draw', odd: '3.50' },
                          { value: 'Away', odd: '4.20' },
                        ],
                      },
                      {
                        id: 5,
                        values: [
                          { value: 'Over 2.5', odd: '1.95' },
                          { value: 'Under 2.5', odd: '1.85' },
                        ],
                      },
                      {
                        id: 8,
                        values: [
                          { value: 'Yes', odd: '1.72' },
                          { value: 'No', odd: '2.05' },
                        ],
                      },
                      {
                        id: 12,
                        values: [
                          { value: 'Home/Draw', odd: '1.20' },
                          { value: 'Home/Away', odd: '1.25' },
                          { value: 'Draw/Away', odd: '1.65' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            errors: {},
          }),
      });

      const result = await getAllOdds(12345);
      expect(result).toHaveProperty('matchWinner');
      expect(result).toHaveProperty('overUnder');
      expect(result).toHaveProperty('bothTeamsScore');
      expect(result).toHaveProperty('doubleChance');
    });

    test('getStandings returns normalized array', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: [
              {
                league: {
                  standings: [
                    [
                      {
                        rank: 1,
                        team: { name: 'Inter', logo: 'https://example.com/inter.png' },
                        points: 50,
                        all: {
                          played: 20,
                          win: 15,
                          draw: 5,
                          lose: 0,
                          goals: { for: 45, against: 10 },
                        },
                        goalsDiff: 35,
                        form: 'WWDWW',
                      },
                    ],
                  ],
                },
              },
            ],
            errors: {},
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

    test('getFullStandings returns { total, home, away }', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: [
              {
                league: {
                  standings: [
                    [
                      {
                        rank: 1,
                        team: { name: 'Inter', logo: 'https://example.com/inter.png' },
                        points: 50,
                        all: {
                          played: 20,
                          win: 15,
                          draw: 5,
                          lose: 0,
                          goals: { for: 45, against: 10 },
                        },
                        home: {
                          played: 10,
                          win: 8,
                          draw: 2,
                          lose: 0,
                          goals: { for: 25, against: 5 },
                        },
                        away: {
                          played: 10,
                          win: 7,
                          draw: 3,
                          lose: 0,
                          goals: { for: 20, against: 5 },
                        },
                        goalsDiff: 35,
                        form: 'WWDWW',
                      },
                    ],
                  ],
                },
              },
            ],
            errors: {},
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

    test('request error throws', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(getUpcomingMatches('serie-a')).rejects.toThrow(
        'API-Football error: 500 Internal Server Error',
      );
    });

    test('API errors field throws', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            response: [],
            errors: { rateLimit: 'Too many requests' },
          }),
      });

      await expect(getUpcomingMatches('serie-a')).rejects.toThrow('API-Football error:');
    });
  });
});
