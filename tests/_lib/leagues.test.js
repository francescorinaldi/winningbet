/**
 * Test suite for api/_lib/leagues.js
 *
 * Tests getLeague(), resolveLeagueSlug(), and VALID_SLUGS export.
 */

const { getLeague, resolveLeagueSlug, VALID_SLUGS } = require('../../api/_lib/leagues');

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

  test('returns Ligue 1 configuration for "ligue-1" slug', () => {
    const league = getLeague('ligue-1');
    expect(league).toEqual({
      apiFootballId: 61,
      footballDataCode: 'FL1',
      season: 2025,
      name: 'Ligue 1',
      nameShort: 'Ligue 1',
    });
  });

  test('returns Bundesliga configuration for "bundesliga" slug', () => {
    const league = getLeague('bundesliga');
    expect(league).toEqual({
      apiFootballId: 78,
      footballDataCode: 'BL1',
      season: 2025,
      name: 'Bundesliga',
      nameShort: 'Bundesliga',
    });
  });

  test('returns Eredivisie configuration for "eredivisie" slug', () => {
    const league = getLeague('eredivisie');
    expect(league).toEqual({
      apiFootballId: 88,
      footballDataCode: 'DED',
      season: 2025,
      name: 'Eredivisie',
      nameShort: 'Eredivisie',
    });
  });

  test('throws error for invalid slug', () => {
    expect(() => getLeague('invalid-league')).toThrow('Lega non valida');
  });

  test('throws error message containing valid slugs', () => {
    expect(() => getLeague('mls')).toThrow(
      /serie-a.*champions-league.*la-liga.*premier-league.*ligue-1.*bundesliga.*eredivisie/,
    );
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

  test('returns valid slug as-is for "ligue-1"', () => {
    expect(resolveLeagueSlug('ligue-1')).toBe('ligue-1');
  });

  test('returns valid slug as-is for "bundesliga"', () => {
    expect(resolveLeagueSlug('bundesliga')).toBe('bundesliga');
  });

  test('returns valid slug as-is for "eredivisie"', () => {
    expect(resolveLeagueSlug('eredivisie')).toBe('eredivisie');
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
    expect(resolveLeagueSlug('mls')).toBe('serie-a');
  });
});

describe('VALID_SLUGS', () => {
  test('exports all 7 league slugs', () => {
    expect(VALID_SLUGS).toEqual([
      'serie-a',
      'champions-league',
      'la-liga',
      'premier-league',
      'ligue-1',
      'bundesliga',
      'eredivisie',
    ]);
  });
});
