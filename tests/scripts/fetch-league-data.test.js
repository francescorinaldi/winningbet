/**
 * Tests for .claude/skills/generate-tips/scripts/fetch-league-data.js
 *
 * The script is a CLI tool, so we test the stripLogos function logic
 * by reimplementing it here (the function is not exported).
 */

describe('stripLogos', () => {
  // Reimplementation for testing (same logic as in script)
  function stripLogos(arr) {
    return (arr || []).map((item) => {
      const copy = { ...item };
      delete copy.homeLogo;
      delete copy.awayLogo;
      delete copy.logo;
      return copy;
    });
  }

  test('Removes homeLogo, awayLogo, and logo keys', () => {
    const input = [
      {
        id: 1,
        home: 'Inter',
        homeLogo: 'https://example.com/inter.png',
        away: 'Milan',
        awayLogo: 'https://example.com/milan.png',
      },
    ];
    const result = stripLogos(input);
    expect(result[0]).toEqual({ id: 1, home: 'Inter', away: 'Milan' });
    expect(result[0]).not.toHaveProperty('homeLogo');
    expect(result[0]).not.toHaveProperty('awayLogo');
  });

  test('Removes logo key from standings', () => {
    const input = [
      {
        team: 'Inter',
        position: 1,
        logo: 'https://example.com/inter.png',
        points: 50,
      },
    ];
    const result = stripLogos(input);
    expect(result[0]).toEqual({ team: 'Inter', position: 1, points: 50 });
    expect(result[0]).not.toHaveProperty('logo');
  });

  test('Preserves all other fields', () => {
    const input = [
      {
        id: 1,
        home: 'Inter',
        away: 'Milan',
        homeLogo: 'https://example.com/inter.png',
        awayLogo: 'https://example.com/milan.png',
        date: '2026-02-08T20:00:00Z',
        status: 'scheduled',
        homeGoals: null,
        awayGoals: null,
      },
    ];
    const result = stripLogos(input);
    expect(result[0]).toEqual({
      id: 1,
      home: 'Inter',
      away: 'Milan',
      date: '2026-02-08T20:00:00Z',
      status: 'scheduled',
      homeGoals: null,
      awayGoals: null,
    });
    expect(result[0]).not.toHaveProperty('homeLogo');
    expect(result[0]).not.toHaveProperty('awayLogo');
  });

  test('null/undefined array returns empty array', () => {
    expect(stripLogos(null)).toEqual([]);
    expect(stripLogos(undefined)).toEqual([]);
  });

  test('Empty array returns empty array', () => {
    const result = stripLogos([]);
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  test('Items without logo fields remain unchanged', () => {
    const input = [
      { id: 1, home: 'Inter', away: 'Milan' },
      { id: 2, home: 'Juventus', away: 'Roma' },
    ];
    const result = stripLogos(input);
    expect(result).toEqual(input);
    expect(result[0]).not.toHaveProperty('logo');
    expect(result[0]).not.toHaveProperty('homeLogo');
    expect(result[0]).not.toHaveProperty('awayLogo');
  });

  test('Does not mutate original array', () => {
    const input = [
      {
        id: 1,
        home: 'Inter',
        homeLogo: 'https://example.com/inter.png',
        away: 'Milan',
        awayLogo: 'https://example.com/milan.png',
      },
    ];
    const inputCopy = JSON.parse(JSON.stringify(input));
    stripLogos(input);

    // Original should be unchanged
    expect(input).toEqual(inputCopy);
    expect(input[0]).toHaveProperty('homeLogo');
    expect(input[0]).toHaveProperty('awayLogo');
  });

  test('Works with mixed data (some with logos, some without)', () => {
    const input = [
      { id: 1, home: 'Inter', homeLogo: 'url1', away: 'Milan' },
      { id: 2, home: 'Juventus', away: 'Roma' },
      { id: 3, team: 'Napoli', logo: 'url2', position: 1 },
    ];
    const result = stripLogos(input);

    expect(result[0]).not.toHaveProperty('homeLogo');
    expect(result[1]).toEqual({ id: 2, home: 'Juventus', away: 'Roma' });
    expect(result[2]).not.toHaveProperty('logo');
    expect(result[2]).toEqual({ id: 3, team: 'Napoli', position: 1 });
  });

  test('Handles objects with all three logo fields', () => {
    const input = [
      {
        id: 1,
        name: 'Match',
        logo: 'logo1',
        homeLogo: 'logo2',
        awayLogo: 'logo3',
      },
    ];
    const result = stripLogos(input);

    expect(result[0]).toEqual({ id: 1, name: 'Match' });
    expect(result[0]).not.toHaveProperty('logo');
    expect(result[0]).not.toHaveProperty('homeLogo');
    expect(result[0]).not.toHaveProperty('awayLogo');
  });
});
