#!/usr/bin/env node
/**
 * Wrapper that loads .env.local before running fetch-league-data.js
 * Usage: node fetch-with-env.js <league-slug>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');

// Load .env.local (Vercel dev convention)
const envLocal = path.join(ROOT, '.env.local');
if (fs.existsSync(envLocal)) {
  const lines = fs.readFileSync(envLocal, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
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

// Also try .env
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
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
  process.stdout.write(JSON.stringify({ error: 'Usage: node fetch-with-env.js <league-slug>' }));
  process.exit(1);
}

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

  try {
    result.matches = await apiFootball.getUpcomingMatches(slug, 10);
  } catch (_err) {
    try {
      result.matches = await footballData.getUpcomingMatches(slug, 10);
    } catch (_err2) {
      process.stderr.write('Failed to fetch matches for ' + slug + '\n');
    }
  }

  try {
    result.standings = await apiFootball.getFullStandings(slug);
  } catch (_err) {
    try {
      result.standings = await footballData.getFullStandings(slug);
    } catch (_err2) {
      process.stderr.write('Failed to fetch standings for ' + slug + '\n');
    }
  }

  try {
    result.recentResults = await footballData.getRecentResults(slug, 30);
  } catch (_err) {
    try {
      result.recentResults = await apiFootball.getRecentResults(slug, 30);
    } catch (_err2) {
      process.stderr.write('Failed to fetch recent results for ' + slug + '\n');
    }
  }

  if (result.matches.length > 0) {
    const oddsResults = await Promise.allSettled(
      result.matches.map((m) => apiFootball.getAllOdds(m.id))
    );
    result.matches.forEach((match, i) => {
      if (oddsResults[i].status === 'fulfilled' && oddsResults[i].value) {
        const allOdds = oddsResults[i].value;
        match.odds = {};
        if (allOdds.matchWinner) {
          const h = allOdds.matchWinner.find((v) => v.outcome === 'Home');
          const d = allOdds.matchWinner.find((v) => v.outcome === 'Draw');
          const a = allOdds.matchWinner.find((v) => v.outcome === 'Away');
          match.odds.home = h ? h.odd : null;
          match.odds.draw = d ? d.odd : null;
          match.odds.away = a ? a.odd : null;
        }
        if (allOdds.overUnder) {
          match.odds.overUnder = {};
          allOdds.overUnder.forEach((v) => { match.odds.overUnder[v.outcome] = v.odd; });
        }
        if (allOdds.bothTeamsScore) {
          const yes = allOdds.bothTeamsScore.find((v) => v.outcome === 'Yes');
          const no = allOdds.bothTeamsScore.find((v) => v.outcome === 'No');
          match.odds.goal = yes ? yes.odd : null;
          match.odds.noGoal = no ? no.odd : null;
        }
        if (allOdds.doubleChance) {
          match.odds.doubleChance = {};
          allOdds.doubleChance.forEach((v) => { match.odds.doubleChance[v.outcome] = v.odd; });
        }
      }
    });
  }

  if (result.matches.length > 0) {
    const h2hResults = await Promise.allSettled(
      result.matches.map((m) => apiFootball.getHeadToHead(slug, m.home, m.away, 10))
    );
    result.matches.forEach((match, i) => {
      if (h2hResults[i].status === 'fulfilled' && h2hResults[i].value) {
        match.h2h = h2hResults[i].value;
      }
    });
  }

  if (result.matches.length > 0) {
    const injuryResults = await Promise.allSettled(
      result.matches.map((m) => apiFootball.getFixtureInjuries(m.id))
    );
    result.matches.forEach((match, i) => {
      match.injuries = injuryResults[i].status === 'fulfilled' ? (injuryResults[i].value || []) : [];
    });
  }

  result.matches = stripLogos(result.matches);
  result.standings.total = stripLogos(result.standings.total);
  result.standings.home = stripLogos(result.standings.home);
  result.standings.away = stripLogos(result.standings.away);
  result.recentResults = stripLogos(result.recentResults);

  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ error: err.message }));
  process.exit(1);
});
