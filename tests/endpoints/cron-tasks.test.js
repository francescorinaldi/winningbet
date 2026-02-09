/**
 * Tests for api/cron-tasks.js
 *
 * Tests the core prediction evaluation and result building logic:
 * - evaluatePrediction (all prediction types)
 * - buildActualResult (score formatting)
 */

// Mock all dependencies before requiring the module
jest.mock('../../api/_lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      single: jest.fn(),
      then: jest.fn((resolve) => resolve({ data: [], error: null })),
    }),
    auth: { admin: { listUsers: jest.fn().mockResolvedValue({ data: { users: [] } }) } },
  },
}));

jest.mock('../../api/_lib/api-football', () => ({
  getRecentResults: jest.fn(),
}));

jest.mock('../../api/_lib/football-data', () => ({
  getRecentResults: jest.fn(),
}));

jest.mock('../../api/_lib/telegram', () => ({
  sendPublicTips: jest.fn().mockResolvedValue(0),
  sendPrivateTips: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../api/_lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  buildDailyDigest: jest
    .fn()
    .mockReturnValue({ subject: 'Test', html: '<p>Test</p>', text: 'Test' }),
}));

jest.mock('../../api/_lib/auth-middleware', () => ({
  verifyCronSecret: jest.fn().mockReturnValue({ authorized: true, error: null }),
  hasAccess: jest.fn().mockReturnValue(true),
}));

const { evaluatePrediction, buildActualResult } = require('../../api/cron-tasks');

describe('cron-tasks module', () => {
  describe('evaluatePrediction', () => {
    describe('1X2 predictions', () => {
      it('should return won for 1 when home wins', () => {
        const result = { goalsHome: 2, goalsAway: 1 };
        expect(evaluatePrediction('1', result, 3)).toBe('won');
      });

      it('should return lost for 1 when draw', () => {
        const result = { goalsHome: 1, goalsAway: 1 };
        expect(evaluatePrediction('1', result, 2)).toBe('lost');
      });

      it('should return lost for 1 when away wins', () => {
        const result = { goalsHome: 0, goalsAway: 1 };
        expect(evaluatePrediction('1', result, 1)).toBe('lost');
      });

      it('should return won for X when draw', () => {
        const result = { goalsHome: 1, goalsAway: 1 };
        expect(evaluatePrediction('X', result, 2)).toBe('won');
      });

      it('should return lost for X when home wins', () => {
        const result = { goalsHome: 2, goalsAway: 1 };
        expect(evaluatePrediction('X', result, 3)).toBe('lost');
      });

      it('should return lost for X when away wins', () => {
        const result = { goalsHome: 0, goalsAway: 1 };
        expect(evaluatePrediction('X', result, 1)).toBe('lost');
      });

      it('should return won for 2 when away wins', () => {
        const result = { goalsHome: 1, goalsAway: 2 };
        expect(evaluatePrediction('2', result, 3)).toBe('won');
      });

      it('should return lost for 2 when draw', () => {
        const result = { goalsHome: 1, goalsAway: 1 };
        expect(evaluatePrediction('2', result, 2)).toBe('lost');
      });

      it('should return lost for 2 when home wins', () => {
        const result = { goalsHome: 2, goalsAway: 1 };
        expect(evaluatePrediction('2', result, 3)).toBe('lost');
      });
    });

    describe('double chance predictions', () => {
      it('should return won for 1X when home wins', () => {
        const result = { goalsHome: 2, goalsAway: 1 };
        expect(evaluatePrediction('1X', result, 3)).toBe('won');
      });

      it('should return won for 1X when draw', () => {
        const result = { goalsHome: 1, goalsAway: 1 };
        expect(evaluatePrediction('1X', result, 2)).toBe('won');
      });

      it('should return lost for 1X when away wins', () => {
        const result = { goalsHome: 1, goalsAway: 2 };
        expect(evaluatePrediction('1X', result, 3)).toBe('lost');
      });

      it('should return won for X2 when draw', () => {
        const result = { goalsHome: 1, goalsAway: 1 };
        expect(evaluatePrediction('X2', result, 2)).toBe('won');
      });

      it('should return won for X2 when away wins', () => {
        const result = { goalsHome: 1, goalsAway: 2 };
        expect(evaluatePrediction('X2', result, 3)).toBe('won');
      });

      it('should return lost for X2 when home wins', () => {
        const result = { goalsHome: 2, goalsAway: 1 };
        expect(evaluatePrediction('X2', result, 3)).toBe('lost');
      });

      it('should return won for 12 when home wins', () => {
        const result = { goalsHome: 2, goalsAway: 1 };
        expect(evaluatePrediction('12', result, 3)).toBe('won');
      });

      it('should return won for 12 when away wins', () => {
        const result = { goalsHome: 1, goalsAway: 2 };
        expect(evaluatePrediction('12', result, 3)).toBe('won');
      });

      it('should return lost for 12 when draw', () => {
        const result = { goalsHome: 1, goalsAway: 1 };
        expect(evaluatePrediction('12', result, 2)).toBe('lost');
      });
    });

    describe('over/under predictions', () => {
      it('should return won for Over 2.5 when total > 2', () => {
        const result = { goalsHome: 2, goalsAway: 1 };
        expect(evaluatePrediction('Over 2.5', result, 3)).toBe('won');
      });

      it('should return lost for Over 2.5 when total = 2', () => {
        const result = { goalsHome: 2, goalsAway: 0 };
        expect(evaluatePrediction('Over 2.5', result, 2)).toBe('lost');
      });

      it('should return lost for Over 2.5 when total < 2', () => {
        const result = { goalsHome: 1, goalsAway: 0 };
        expect(evaluatePrediction('Over 2.5', result, 1)).toBe('lost');
      });

      it('should return won for Under 2.5 when total < 3', () => {
        const result = { goalsHome: 1, goalsAway: 1 };
        expect(evaluatePrediction('Under 2.5', result, 2)).toBe('won');
      });

      it('should return lost for Under 2.5 when total >= 3', () => {
        const result = { goalsHome: 2, goalsAway: 1 };
        expect(evaluatePrediction('Under 2.5', result, 3)).toBe('lost');
      });

      it('should return won for Over 1.5 when total > 1', () => {
        const result = { goalsHome: 1, goalsAway: 1 };
        expect(evaluatePrediction('Over 1.5', result, 2)).toBe('won');
      });

      it('should return lost for Over 1.5 when total = 1', () => {
        const result = { goalsHome: 1, goalsAway: 0 };
        expect(evaluatePrediction('Over 1.5', result, 1)).toBe('lost');
      });

      it('should return won for Under 3.5 when total < 4', () => {
        const result = { goalsHome: 2, goalsAway: 1 };
        expect(evaluatePrediction('Under 3.5', result, 3)).toBe('won');
      });

      it('should return lost for Under 3.5 when total >= 4', () => {
        const result = { goalsHome: 2, goalsAway: 2 };
        expect(evaluatePrediction('Under 3.5', result, 4)).toBe('lost');
      });
    });

    describe('goal/no goal predictions', () => {
      it('should return won for Goal when both teams scored', () => {
        const result = { goalsHome: 2, goalsAway: 1 };
        expect(evaluatePrediction('Goal', result, 3)).toBe('won');
      });

      it('should return lost for Goal when one team did not score', () => {
        const result = { goalsHome: 2, goalsAway: 0 };
        expect(evaluatePrediction('Goal', result, 2)).toBe('lost');
      });

      it('should return lost for Goal when neither team scored', () => {
        const result = { goalsHome: 0, goalsAway: 0 };
        expect(evaluatePrediction('Goal', result, 0)).toBe('lost');
      });

      it('should return won for No Goal when one team did not score', () => {
        const result = { goalsHome: 2, goalsAway: 0 };
        expect(evaluatePrediction('No Goal', result, 2)).toBe('won');
      });

      it('should return won for No Goal when neither team scored', () => {
        const result = { goalsHome: 0, goalsAway: 0 };
        expect(evaluatePrediction('No Goal', result, 0)).toBe('won');
      });

      it('should return lost for No Goal when both teams scored', () => {
        const result = { goalsHome: 1, goalsAway: 1 };
        expect(evaluatePrediction('No Goal', result, 2)).toBe('lost');
      });
    });

    describe('combo predictions', () => {
      it('should return won for 1 + Over 1.5 when home wins and total > 1', () => {
        const result = { goalsHome: 2, goalsAway: 1 };
        expect(evaluatePrediction('1 + Over 1.5', result, 3)).toBe('won');
      });

      it('should return lost for 1 + Over 1.5 when home wins but total = 1', () => {
        const result = { goalsHome: 1, goalsAway: 0 };
        expect(evaluatePrediction('1 + Over 1.5', result, 1)).toBe('lost');
      });

      it('should return lost for 1 + Over 1.5 when draw even if total > 1', () => {
        const result = { goalsHome: 1, goalsAway: 1 };
        expect(evaluatePrediction('1 + Over 1.5', result, 2)).toBe('lost');
      });

      it('should return won for 2 + Over 1.5 when away wins and total > 1', () => {
        const result = { goalsHome: 1, goalsAway: 2 };
        expect(evaluatePrediction('2 + Over 1.5', result, 3)).toBe('won');
      });

      it('should return lost for 2 + Over 1.5 when away wins but total = 1', () => {
        const result = { goalsHome: 0, goalsAway: 1 };
        expect(evaluatePrediction('2 + Over 1.5', result, 1)).toBe('lost');
      });

      it('should return lost for 2 + Over 1.5 when draw even if total > 1', () => {
        const result = { goalsHome: 1, goalsAway: 1 };
        expect(evaluatePrediction('2 + Over 1.5', result, 2)).toBe('lost');
      });
    });

    describe('unknown predictions', () => {
      it('should return void for unknown prediction type', () => {
        const result = { goalsHome: 2, goalsAway: 1 };
        expect(evaluatePrediction('Unknown Prediction', result, 3)).toBe('void');
      });
    });
  });

  describe('buildActualResult', () => {
    it('should format 2-1 correctly (home win, O2.5, O1.5, Goal)', () => {
      const result = { goalsHome: 2, goalsAway: 1 };
      expect(buildActualResult(result)).toBe('2-1, 1, O2.5, O1.5, Goal');
    });

    it('should format 0-0 correctly (draw, U2.5, U1.5, NoGoal)', () => {
      const result = { goalsHome: 0, goalsAway: 0 };
      expect(buildActualResult(result)).toBe('0-0, X, U2.5, U1.5, NoGoal');
    });

    it('should format 0-1 correctly (away win, U2.5, U1.5, NoGoal)', () => {
      const result = { goalsHome: 0, goalsAway: 1 };
      expect(buildActualResult(result)).toBe('0-1, 2, U2.5, U1.5, NoGoal');
    });

    it('should format 3-3 correctly (draw, O2.5, O1.5, Goal)', () => {
      const result = { goalsHome: 3, goalsAway: 3 };
      expect(buildActualResult(result)).toBe('3-3, X, O2.5, O1.5, Goal');
    });

    it('should format 1-0 correctly (home win, U2.5, U1.5, NoGoal)', () => {
      const result = { goalsHome: 1, goalsAway: 0 };
      expect(buildActualResult(result)).toBe('1-0, 1, U2.5, U1.5, NoGoal');
    });

    it('should format 2-0 correctly (home win, U2.5, O1.5, NoGoal)', () => {
      const result = { goalsHome: 2, goalsAway: 0 };
      // Total = 2, which is NOT > 2, so U2.5
      expect(buildActualResult(result)).toBe('2-0, 1, U2.5, O1.5, NoGoal');
    });

    it('should format 1-1 correctly (draw, U2.5, O1.5, Goal)', () => {
      const result = { goalsHome: 1, goalsAway: 1 };
      expect(buildActualResult(result)).toBe('1-1, X, U2.5, O1.5, Goal');
    });

    it('should format 0-2 correctly (away win, U2.5, O1.5, NoGoal)', () => {
      const result = { goalsHome: 0, goalsAway: 2 };
      expect(buildActualResult(result)).toBe('0-2, 2, U2.5, O1.5, NoGoal');
    });
  });
});
