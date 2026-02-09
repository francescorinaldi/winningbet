/**
 * Test suite for api/_lib/leagues.js
 *
 * Tests getLeague() and resolveLeagueSlug() functions.
 */

const { getLeague, resolveLeagueSlug } = require('../../api/_lib/leagues');

describe('getLeague', () => {
  test('returns Serie A configuration for "serie-a" slug', () => {
    const league = getLeague('serie-a');
    expect(league).toEqual({
      apiFootballId: 135,
      footballDataCode: 'SA',
      season: 2025,
      name: 'Serie A',
      nameShort: 'Serie A',
    });
  });

  test('returns Champions League configuration for "champions-league" slug', () => {
    const league = getLeague('champions-league');
    expect(league).toEqual({
      apiFootballId: 2,
      footballDataCode: 'CL',
      season: 2025,
      name: 'Champions League',
      nameShort: 'UCL',
    });
  });

  test('returns La Liga configuration for "la-liga" slug', () => {
    const league = getLeague('la-liga');
    expect(league).toEqual({
      apiFootballId: 140,
      footballDataCode: 'PD',
      season: 2025,
      name: 'La Liga',
      nameShort: 'La Liga',
    });
  });

  test('returns Premier League configuration for "premier-league" slug', () => {
    const league = getLeague('premier-league');
    expect(league).toEqual({
      apiFootballId: 39,
      footballDataCode: 'PL',
      season: 2025,
      name: 'Premier League',
      nameShort: 'PL',
    });
  });

  test('throws error for invalid slug', () => {
    expect(() => getLeague('invalid-league')).toThrow('Lega non valida');
  });

  test('throws error message containing valid slugs', () => {
    expect(() => getLeague('bundesliga')).toThrow(/serie-a.*champions-league.*la-liga.*premier-league/);
  });

  test('throws error for null slug', () => {
    expect(() => getLeague(null)).toThrow('Lega non valida');
  });

  test('throws error for undefined slug', () => {
    expect(() => getLeague(undefined)).toThrow('Lega non valida');
  });
});

describe('resolveLeagueSlug', () => {
  test('returns valid slug as-is for "serie-a"', () => {
    expect(resolveLeagueSlug('serie-a')).toBe('serie-a');
  });

  test('returns valid slug as-is for "champions-league"', () => {
    expect(resolveLeagueSlug('champions-league')).toBe('champions-league');
  });

  test('returns valid slug as-is for "la-liga"', () => {
    expect(resolveLeagueSlug('la-liga')).toBe('la-liga');
  });

  test('returns valid slug as-is for "premier-league"', () => {
    expect(resolveLeagueSlug('premier-league')).toBe('premier-league');
  });

  test('returns "serie-a" for null slug', () => {
    expect(resolveLeagueSlug(null)).toBe('serie-a');
  });

  test('returns "serie-a" for undefined slug', () => {
    expect(resolveLeagueSlug(undefined)).toBe('serie-a');
  });

  test('returns "serie-a" for empty string', () => {
    expect(resolveLeagueSlug('')).toBe('serie-a');
  });

  test('returns "serie-a" for invalid slug', () => {
    expect(resolveLeagueSlug('bundesliga')).toBe('serie-a');
  });
});
