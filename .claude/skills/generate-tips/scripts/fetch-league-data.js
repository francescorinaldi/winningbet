#!/usr/bin/env node
/**
 * Fetches all football data needed for tip generation.
 *
 * Usage: node fetch-league-data.js <league-slug>
 * Output: JSON to stdout (compact)
 *
 * Data sources:
 *   Primary: api-football.com (fixtures, standings, odds)
 *   Fallback: football-data.org (fixtures, standings, results)
 *
 * Env vars loaded from project .env file automatically.
 */

const fs = require('fs');
const path = require('path');

// Resolve project root (4 levels up from .claude/skills/generate-tips/scripts/)
const ROOT = path.resolve(__dirname, '../../../..');

// Load .env if API keys not already in environment
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#\s=]+)\s*=\s*(.*)$/);
    if (m) {
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  }
}

const apiFootball = require(path.join(ROOT, 'api/_lib/api-football'));
const footballData = require(path.join(ROOT, 'api/_lib/football-data'));
const { getLeague } = require(path.join(ROOT, 'api/_lib/leagues'));

const slug = process.argv[2];
if (!slug) {
  process.stdout.write(JSON.stringify({ error: 'Usage: node fetch-league-data.js <league-slug>' }));
  process.exit(1);
}

// Strip logo URLs to reduce output size
function stripLogos(arr) {
  return (arr || []).map((item) => {
    const copy = { ...item };
    delete copy.homeLogo;
    delete copy.awayLogo;
    delete copy.logo;
    return copy;
  });
}

async function main() {
  const league = getLeague(slug);
  const result = {
    league: slug,
    leagueName: league.name,
    matches: [],
    standings: { total: [], home: [], away: [] },
    recentResults: [],
  };

  // 1. Upcoming matches (primary → fallback)
  try {
    result.matches = await apiFootball.getUpcomingMatches(slug, 10);
  } catch (_err) {
    try {
      result.matches = await footballData.getUpcomingMatches(slug, 10);
    } catch (_err2) {
      console.error('Failed to fetch matches for ' + slug);
    }
  }

  // 2. Full standings: total + home + away (primary → fallback)
  try {
    result.standings = await apiFootball.getFullStandings(slug);
  } catch (_err) {
    try {
      result.standings = await footballData.getFullStandings(slug);
    } catch (_err2) {
      console.error('Failed to fetch standings for ' + slug);
    }
  }

  // 3. Recent results — last 30 (fallback-first: football-data is free tier friendly)
  try {
    result.recentResults = await footballData.getRecentResults(slug, 30);
  } catch (_err) {
    try {
      result.recentResults = await apiFootball.getRecentResults(slug, 30);
    } catch (_err2) {
      console.error('Failed to fetch recent results for ' + slug);
    }
  }

  // 4. Odds for each match (parallel, api-football only)
  if (result.matches.length > 0) {
    const oddsResults = await Promise.allSettled(
      result.matches.map((m) => apiFootball.getOdds(m.id)),
    );
    result.matches.forEach((match, i) => {
      if (
        oddsResults[i].status === 'fulfilled' &&
        oddsResults[i].value &&
        oddsResults[i].value.values
      ) {
        const v = oddsResults[i].value.values;
        match.odds = {
          home: (v[0] && v[0].odd) || null,
          draw: (v[1] && v[1].odd) || null,
          away: (v[2] && v[2].odd) || null,
        };
      }
    });
  }

  // Strip logo URLs to reduce output size
  result.matches = stripLogos(result.matches);
  result.standings.total = stripLogos(result.standings.total);
  result.standings.home = stripLogos(result.standings.home);
  result.standings.away = stripLogos(result.standings.away);
  result.recentResults = stripLogos(result.recentResults);

  // Output compact JSON to stdout
  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ error: err.message }));
  process.exit(1);
});
