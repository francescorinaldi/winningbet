/**
 * Tier hierarchy — single source of truth for tier ordering.
 *
 * Used by auth-middleware and any backend logic that compares tiers.
 * Frontend equivalent: TIER_LEVELS in public/shared.js
 */

const TIER_LEVELS = { free: 0, pro: 1, vip: 2 };

module.exports = { TIER_LEVELS };
