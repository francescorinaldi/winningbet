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

  // 4. Odds for each match — all markets (parallel, api-football only)
  if (result.matches.length > 0) {
    const oddsResults = await Promise.allSettled(
      result.matches.map((m) => apiFootball.getAllOdds(m.id)),
    );
    result.matches.forEach((match, i) => {
      if (oddsResults[i].status === 'fulfilled' && oddsResults[i].value) {
        const allOdds = oddsResults[i].value;
        match.odds = {};

        // 1X2
        if (allOdds.matchWinner) {
          const h = allOdds.matchWinner.find((v) => v.outcome === 'Home');
          const d = allOdds.matchWinner.find((v) => v.outcome === 'Draw');
          const a = allOdds.matchWinner.find((v) => v.outcome === 'Away');
          match.odds.home = h ? h.odd : null;
          match.odds.draw = d ? d.odd : null;
          match.odds.away = a ? a.odd : null;
        }

        // Over/Under
        if (allOdds.overUnder) {
          match.odds.overUnder = {};
          allOdds.overUnder.forEach((v) => {
            match.odds.overUnder[v.outcome] = v.odd;
          });
        }

        // Both Teams Score (Goal / No Goal)
        if (allOdds.bothTeamsScore) {
          const yes = allOdds.bothTeamsScore.find((v) => v.outcome === 'Yes');
          const no = allOdds.bothTeamsScore.find((v) => v.outcome === 'No');
          match.odds.goal = yes ? yes.odd : null;
          match.odds.noGoal = no ? no.odd : null;
        }

        // Double Chance
        if (allOdds.doubleChance) {
          match.odds.doubleChance = {};
          allOdds.doubleChance.forEach((v) => {
            match.odds.doubleChance[v.outcome] = v.odd;
          });
        }
      }
    });
  }

  // 5. Head-to-head for each match (parallel, api-football only)
  if (result.matches.length > 0) {
    const h2hResults = await Promise.allSettled(
      result.matches.map((m) =>
        apiFootball.getHeadToHead(slug, m.home, m.away, 10),
      ),
    );
    result.matches.forEach((match, i) => {
      if (h2hResults[i].status === 'fulfilled' && h2hResults[i].value) {
        match.h2h = h2hResults[i].value;
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
