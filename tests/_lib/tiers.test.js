/**
 * Test suite for api/_lib/tiers.js
 */

const { TIER_LEVELS } = require('../../api/_lib/tiers');

describe('TIER_LEVELS', () => {
  test('exports an object with free, pro, vip keys', () => {
    expect(TIER_LEVELS).toEqual({ free: 0, pro: 1, vip: 2 });
  });

  test('free < pro < vip ordering', () => {
    expect(TIER_LEVELS.free).toBeLessThan(TIER_LEVELS.pro);
    expect(TIER_LEVELS.pro).toBeLessThan(TIER_LEVELS.vip);
  });

  test('contains exactly 3 tiers', () => {
    expect(Object.keys(TIER_LEVELS)).toHaveLength(3);
  });
});
