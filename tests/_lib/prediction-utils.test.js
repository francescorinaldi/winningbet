const { evaluatePrediction, buildActualResult } = require('../../api/_lib/prediction-utils');

describe('buildActualResult', () => {
  test('formats a home win with goals', () => {
    const result = { goalsHome: 3, goalsAway: 1 };
    expect(buildActualResult(result)).toBe('3-1, 1, O2.5, O1.5, Goal');
  });

  test('formats a draw with no goals', () => {
    const result = { goalsHome: 0, goalsAway: 0 };
    expect(buildActualResult(result)).toBe('0-0, X, U2.5, U1.5, NoGoal');
  });

  test('formats an away win', () => {
    const result = { goalsHome: 0, goalsAway: 1 };
    expect(buildActualResult(result)).toBe('0-1, 2, U2.5, U1.5, NoGoal');
  });
});

describe('evaluatePrediction — standard markets', () => {
  const result = { goalsHome: 2, goalsAway: 1 };
  const totalGoals = 3;

  test('1 (home win)', () => {
    expect(evaluatePrediction('1', result, totalGoals)).toBe('won');
    expect(evaluatePrediction('2', result, totalGoals)).toBe('lost');
  });

  test('X (draw)', () => {
    const drawResult = { goalsHome: 1, goalsAway: 1 };
    expect(evaluatePrediction('X', drawResult, 2)).toBe('won');
    expect(evaluatePrediction('X', result, totalGoals)).toBe('lost');
  });

  test('double chance', () => {
    expect(evaluatePrediction('1X', result, totalGoals)).toBe('won');
    expect(evaluatePrediction('X2', result, totalGoals)).toBe('lost');
    expect(evaluatePrediction('12', result, totalGoals)).toBe('won');
  });

  test('over/under', () => {
    expect(evaluatePrediction('Over 2.5', result, totalGoals)).toBe('won');
    expect(evaluatePrediction('Under 2.5', result, totalGoals)).toBe('lost');
    expect(evaluatePrediction('Over 1.5', result, totalGoals)).toBe('won');
    expect(evaluatePrediction('Under 3.5', result, totalGoals)).toBe('won');
  });

  test('goal / no goal', () => {
    expect(evaluatePrediction('Goal', result, totalGoals)).toBe('won');
    expect(evaluatePrediction('No Goal', result, totalGoals)).toBe('lost');
  });

  test('combo predictions', () => {
    expect(evaluatePrediction('1 + Over 1.5', result, totalGoals)).toBe('won');
    expect(evaluatePrediction('2 + Over 1.5', result, totalGoals)).toBe('lost');
  });
});

describe('evaluatePrediction — corner markets', () => {
  const result = { goalsHome: 1, goalsAway: 0 };

  test('Corners Over — won', () => {
    expect(evaluatePrediction('Corners Over 9.5', result, 1, { corners: 11 })).toBe('won');
  });

  test('Corners Over — lost', () => {
    expect(evaluatePrediction('Corners Over 9.5', result, 1, { corners: 8 })).toBe('lost');
  });

  test('Corners Under — won', () => {
    expect(evaluatePrediction('Corners Under 9.5', result, 1, { corners: 7 })).toBe('won');
  });

  test('Corners Under — lost', () => {
    expect(evaluatePrediction('Corners Under 9.5', result, 1, { corners: 12 })).toBe('lost');
  });

  test('returns null without extras (cron path)', () => {
    expect(evaluatePrediction('Corners Over 9.5', result, 1)).toBeNull();
    expect(evaluatePrediction('Corners Over 9.5', result, 1, {})).toBeNull();
    expect(evaluatePrediction('Corners Over 9.5', result, 1, { corners: null })).toBeNull();
  });
});

describe('evaluatePrediction — card markets', () => {
  const result = { goalsHome: 1, goalsAway: 1 };

  test('Cards Over — won', () => {
    expect(evaluatePrediction('Cards Over 3.5', result, 2, { cards: 5 })).toBe('won');
  });

  test('Cards Over — lost', () => {
    expect(evaluatePrediction('Cards Over 4.5', result, 2, { cards: 3 })).toBe('lost');
  });

  test('Cards Under — won', () => {
    expect(evaluatePrediction('Cards Under 4.5', result, 2, { cards: 3 })).toBe('won');
  });

  test('Cards Under — lost', () => {
    expect(evaluatePrediction('Cards Under 3.5', result, 2, { cards: 5 })).toBe('lost');
  });

  test('returns null without extras (cron path)', () => {
    expect(evaluatePrediction('Cards Over 3.5', result, 2)).toBeNull();
    expect(evaluatePrediction('Cards Over 3.5', result, 2, { cards: undefined })).toBeNull();
  });
});

describe('evaluatePrediction — unrecognized prediction', () => {
  test('returns void for unknown format', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    expect(evaluatePrediction('FooBar 123', { goalsHome: 1, goalsAway: 0 }, 1)).toBe('void');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('unrecognized prediction format'),
      'FooBar 123',
    );
    spy.mockRestore();
  });
});
