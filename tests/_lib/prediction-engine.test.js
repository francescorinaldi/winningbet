/**
 * Test suite for api/_lib/prediction-engine.js
 * Tests prediction engine pure functions (tier assignment, balancing, derived stats, etc.)
 */

const {
  assignTier,
  balanceTiers,
  computeDerivedStats,
  getTeamRecentMatches,
  formatRecentResults,
} = require('../../api/_lib/prediction-engine');

// Mock api-football module
jest.mock('../../api/_lib/api-football', () => ({
  findOddsForPrediction: jest.fn(),
}));

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: jest.fn() },
  }));
});

describe('prediction-engine', () => {
  describe('assignTier', () => {
    test('confidence >= 80, odds <= 1.8 → free', () => {
      expect(assignTier({ confidence: 80, odds: 1.8, prediction: '1' })).toBe('free');
    });

    test('confidence >= 75, odds <= 2.5 → pro', () => {
      expect(assignTier({ confidence: 75, odds: 2.0, prediction: 'X' })).toBe('pro');
    });

    test('odds >= 2.5 → vip', () => {
      expect(assignTier({ confidence: 70, odds: 2.5, prediction: '2' })).toBe('vip');
    });

    test('prediction includes + → vip (combo)', () => {
      expect(assignTier({ confidence: 70, odds: 2.0, prediction: '1 + Over 1.5' })).toBe('vip');
    });

    test('confidence >= 70, odds < 2.5 → pro', () => {
      expect(assignTier({ confidence: 70, odds: 2.0, prediction: 'X2' })).toBe('pro');
    });

    test('confidence 65, odds 1.5 → free (confidence < 70 falls through)', () => {
      expect(assignTier({ confidence: 65, odds: 1.5, prediction: '1' })).toBe('free');
    });

    test('edge: confidence 80, odds 1.8 → free (boundary)', () => {
      expect(assignTier({ confidence: 80, odds: 1.8, prediction: '1X' })).toBe('free');
    });
  });

  describe('balanceTiers', () => {
    test('less than 3 predictions → returns as-is', () => {
      const input = [
        { match_id: '1', tier: 'free', confidence: 80, odds: 1.5 },
        { match_id: '2', tier: 'free', confidence: 78, odds: 1.6 },
      ];
      expect(balanceTiers(input)).toEqual(input);
    });

    test('already balanced (1+ of each tier) → returns unchanged', () => {
      const input = [
        { match_id: '1', tier: 'free', confidence: 80, odds: 1.5 },
        { match_id: '2', tier: 'pro', confidence: 75, odds: 2.0 },
        { match_id: '3', tier: 'vip', confidence: 70, odds: 3.0 },
      ];
      expect(balanceTiers(input)).toEqual(input);
    });

    test('all same tier → redistributes into thirds', () => {
      const input = [
        { match_id: '1', tier: 'pro', confidence: 80, odds: 1.5 },
        { match_id: '2', tier: 'pro', confidence: 75, odds: 2.0 },
        { match_id: '3', tier: 'pro', confidence: 70, odds: 2.5 },
      ];
      const result = balanceTiers(input);
      // Should redistribute: one free, one pro, one vip
      const tiers = result.map((p) => p.tier);
      expect(tiers.includes('free')).toBe(true);
      expect(tiers.includes('pro')).toBe(true);
      expect(tiers.includes('vip')).toBe(true);
    });

    test('sorted by confidence*odds ascending → first third free, second pro, third vip', () => {
      const input = [
        { match_id: '1', tier: 'pro', confidence: 80, odds: 1.5 }, // 120
        { match_id: '2', tier: 'pro', confidence: 75, odds: 2.0 }, // 150
        { match_id: '3', tier: 'pro', confidence: 70, odds: 3.0 }, // 210
      ];
      const result = balanceTiers(input);
      // After sorting by confidence*odds: match_id 1 (120), 2 (150), 3 (210)
      // First third = match_id 1 → free
      const match1 = result.find((p) => p.match_id === '1');
      expect(match1.tier).toBe('free');
    });
  });

  describe('computeDerivedStats', () => {
    test('computes avgGoalsFor and avgGoalsAgainst', () => {
      const standing = {
        played: 10,
        goalsFor: 20,
        goalsAgainst: 10,
        rank: 5,
      };
      const recentMatches = [];
      const result = computeDerivedStats(standing, recentMatches, 'Inter', 20);
      expect(result.avgGoalsFor).toBe('2.00');
      expect(result.avgGoalsAgainst).toBe('1.00');
    });

    test('computes BTTS% from recent matches', () => {
      const standing = { played: 10, goalsFor: 20, goalsAgainst: 10, rank: 5 };
      const recentMatches = [
        { home: 'Inter', away: 'Milan', goalsHome: 2, goalsAway: 1 }, // BTTS
        { home: 'Juventus', away: 'Inter', goalsHome: 1, goalsAway: 1 }, // BTTS
        { home: 'Inter', away: 'Roma', goalsHome: 3, goalsAway: 0 }, // Not BTTS
      ];
      const result = computeDerivedStats(standing, recentMatches, 'Inter', 20);
      expect(result.bttsPercent).toBe(67); // 2/3 = 67%
    });

    test('computes clean sheet %', () => {
      const standing = { played: 10, goalsFor: 20, goalsAgainst: 10, rank: 5 };
      const recentMatches = [
        { home: 'Inter', away: 'Milan', goalsHome: 2, goalsAway: 0 }, // Clean sheet (away)
        { home: 'Juventus', away: 'Inter', goalsHome: 0, goalsAway: 1 }, // Clean sheet (home)
        { home: 'Inter', away: 'Roma', goalsHome: 1, goalsAway: 1 }, // Not clean sheet
      ];
      const result = computeDerivedStats(standing, recentMatches, 'Inter', 20);
      expect(result.cleanSheetPercent).toBe(67); // 2/3 = 67%
    });

    test('zone: rank <= 4 → Zona Champions', () => {
      const standing = { played: 10, goalsFor: 20, goalsAgainst: 10, rank: 3 };
      const result = computeDerivedStats(standing, [], 'Inter', 20);
      expect(result.zoneContext).toBe('Zona Champions');
    });

    test('zone: rank <= 6 → Zona Europa', () => {
      const standing = { played: 10, goalsFor: 20, goalsAgainst: 10, rank: 6 };
      const result = computeDerivedStats(standing, [], 'Inter', 20);
      expect(result.zoneContext).toBe('Zona Europa');
    });

    test('zone: rank > totalTeams-3 → Zona retrocessione', () => {
      const standing = { played: 10, goalsFor: 10, goalsAgainst: 20, rank: 18 };
      const result = computeDerivedStats(standing, [], 'Inter', 20);
      expect(result.zoneContext).toBe('Zona retrocessione');
    });

    test('empty recent matches → 0% btts, 0% clean sheet', () => {
      const standing = { played: 10, goalsFor: 20, goalsAgainst: 10, rank: 5 };
      const result = computeDerivedStats(standing, [], 'Inter', 20);
      expect(result.bttsPercent).toBe(0);
      expect(result.cleanSheetPercent).toBe(0);
    });
  });

  describe('getTeamRecentMatches', () => {
    const results = [
      { home: 'Inter', away: 'Milan', goalsHome: 2, goalsAway: 1 },
      { home: 'Juventus', away: 'Inter', goalsHome: 0, goalsAway: 1 },
      { home: 'Inter', away: 'Roma', goalsHome: 3, goalsAway: 0 },
      { home: 'Napoli', away: 'Milan', goalsHome: 2, goalsAway: 2 },
    ];

    test('filters by team name (case-insensitive)', () => {
      const result = getTeamRecentMatches('inter', results);
      expect(result).toHaveLength(3);
      expect(result.every((m) => m.home === 'Inter' || m.away === 'Inter')).toBe(true);
    });

    test('limits to count', () => {
      const result = getTeamRecentMatches('Inter', results, 2);
      expect(result).toHaveLength(2);
    });

    test('returns empty array for no matches', () => {
      const result = getTeamRecentMatches('Barcelona', results);
      expect(result).toEqual([]);
    });
  });

  describe('formatRecentResults', () => {
    test('empty array → "Nessun risultato recente"', () => {
      expect(formatRecentResults('Inter', [])).toBe('Nessun risultato recente');
    });

    test('formats as "Home goalsHome-goalsAway Away, ..."', () => {
      const matches = [
        { home: 'Inter', away: 'Milan', goalsHome: 2, goalsAway: 1 },
        { home: 'Juventus', away: 'Inter', goalsHome: 0, goalsAway: 1 },
      ];
      expect(formatRecentResults('Inter', matches)).toBe('Inter 2-1 Milan, Juventus 0-1 Inter');
    });
  });
});
