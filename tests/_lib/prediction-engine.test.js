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
  deduplicateByBestEV,
  MARKET_WATERFALL_ORDER,
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

  describe('MARKET_WATERFALL_ORDER', () => {
    test('contains all 14 prediction types', () => {
      expect(MARKET_WATERFALL_ORDER).toHaveLength(14);
    });

    test('starts with double chance markets (highest priority)', () => {
      expect(MARKET_WATERFALL_ORDER.slice(0, 3)).toEqual(['1X', 'X2', '12']);
    });

    test('ends with combo markets (lowest priority)', () => {
      expect(MARKET_WATERFALL_ORDER.slice(-2)).toEqual(['1 + Over 1.5', '2 + Over 1.5']);
    });

    test('exact win markets come after BTTS and all O/U markets', () => {
      const exactWin1Index = MARKET_WATERFALL_ORDER.indexOf('1');
      const exactWin2Index = MARKET_WATERFALL_ORDER.indexOf('2');
      const bttsIndex = MARKET_WATERFALL_ORDER.indexOf('Goal');
      const noGoalIndex = MARKET_WATERFALL_ORDER.indexOf('No Goal');
      const over25Index = MARKET_WATERFALL_ORDER.indexOf('Over 2.5');
      const under25Index = MARKET_WATERFALL_ORDER.indexOf('Under 2.5');
      const over15Index = MARKET_WATERFALL_ORDER.indexOf('Over 1.5');
      const under35Index = MARKET_WATERFALL_ORDER.indexOf('Under 3.5');

      // Both exact wins come after all BTTS and O/U markets
      for (const exactIdx of [exactWin1Index, exactWin2Index]) {
        expect(exactIdx).toBeGreaterThan(bttsIndex);
        expect(exactIdx).toBeGreaterThan(noGoalIndex);
        expect(exactIdx).toBeGreaterThan(over25Index);
        expect(exactIdx).toBeGreaterThan(under25Index);
        expect(exactIdx).toBeGreaterThan(over15Index);
        expect(exactIdx).toBeGreaterThan(under35Index);
      }
    });
  });

  describe('deduplicateByBestEV', () => {
    test('empty array → empty array', () => {
      expect(deduplicateByBestEV([])).toEqual([]);
    });

    test('single prediction → returns as-is', () => {
      const input = [
        { match_id: '100', prediction: '1X', odds: 1.5, predicted_probability: 0.75, confidence: 72, tier: 'free' },
      ];
      expect(deduplicateByBestEV(input)).toEqual(input);
    });

    test('different matches → keeps all', () => {
      const input = [
        { match_id: '100', prediction: '1X', odds: 1.5, predicted_probability: 0.75, confidence: 72, tier: 'free' },
        { match_id: '200', prediction: 'Over 2.5', odds: 2.0, predicted_probability: 0.65, confidence: 68, tier: 'pro' },
      ];
      expect(deduplicateByBestEV(input)).toHaveLength(2);
    });

    test('same match, two predictions → keeps higher EV', () => {
      const input = [
        { match_id: '100', prediction: '1', odds: 1.22, predicted_probability: 0.85, confidence: 80, tier: 'free' },
        { match_id: '100', prediction: 'Goal', odds: 1.70, predicted_probability: 0.72, confidence: 70, tier: 'pro' },
      ];
      const result = deduplicateByBestEV(input);
      expect(result).toHaveLength(1);
      // EV for '1': 0.85 * 1.22 - 1 = 0.037
      // EV for 'Goal': 0.72 * 1.70 - 1 = 0.224
      expect(result[0].prediction).toBe('Goal');
    });

    test('same match, three predictions → keeps highest EV', () => {
      const input = [
        { match_id: '100', prediction: '1X', odds: 1.30, predicted_probability: 0.90, confidence: 85, tier: 'free' },
        { match_id: '100', prediction: 'Under 3.5', odds: 1.45, predicted_probability: 0.82, confidence: 78, tier: 'free' },
        { match_id: '100', prediction: 'Goal', odds: 1.80, predicted_probability: 0.70, confidence: 70, tier: 'pro' },
      ];
      const result = deduplicateByBestEV(input);
      expect(result).toHaveLength(1);
      // EV for 'Goal': 0.70 * 1.80 - 1 = 0.26 (highest)
      expect(result[0].prediction).toBe('Goal');
    });

    test('preserves all fields of the winning prediction', () => {
      const input = [
        { match_id: '100', prediction: '1', odds: 1.22, predicted_probability: 0.85, confidence: 80, tier: 'free', analysis: 'low EV', home_team: 'Inter', away_team: 'Bodø/Glimt' },
        { match_id: '100', prediction: 'Goal', odds: 1.70, predicted_probability: 0.72, confidence: 70, tier: 'pro', analysis: 'BTTS value', home_team: 'Inter', away_team: 'Bodø/Glimt' },
      ];
      const result = deduplicateByBestEV(input);
      expect(result[0]).toEqual(input[1]);
    });
  });
});
