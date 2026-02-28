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

        // Corners Over/Under
        if (allOdds.corners) {
          match.odds.corners = {};
          allOdds.corners.forEach((v) => {
            match.odds.corners[v.outcome] = v.odd;
          });
        }

        // Cards/Bookings Over/Under
        if (allOdds.cards) {
          match.odds.cards = {};
          allOdds.cards.forEach((v) => {
            match.odds.cards[v.outcome] = v.odd;
          });
        }
      }
    });
  }

  // 5. Head-to-head for each match (parallel, api-football only)
  if (result.matches.length > 0) {
    const h2hResults = await Promise.allSettled(
      result.matches.map((m) => apiFootball.getHeadToHead(slug, m.home, m.away, 10)),
    );
    result.matches.forEach((match, i) => {
      if (h2hResults[i].status === 'fulfilled' && h2hResults[i].value) {
        match.h2h = h2hResults[i].value;
      }
    });
  }

  // 6. Injuries per match (parallel, api-football only)
  // Returns structured list of confirmed-out and doubtful players with type/reason.
  if (result.matches.length > 0) {
    const injuryResults = await Promise.allSettled(
      result.matches.map((m) => apiFootball.getFixtureInjuries(m.id)),
    );
    result.matches.forEach((match, i) => {
      match.injuries = injuryResults[i].status === 'fulfilled' ? (injuryResults[i].value || []) : [];
    });
  }

  // 7. Player stats for teams with injuries — compute impact level and backup quality.
  // Uses an in-memory cache to avoid fetching the same team twice.
  // Only fetches teams that actually have injured/suspended players listed.
  if (result.matches.length > 0) {
    const season = getLeague(slug).season;
    const playerStatsCache = new Map(); // teamId → [playerStats]

    async function fetchPlayerStatsWithCache(teamId) {
      if (!playerStatsCache.has(teamId)) {
        try {
          const stats = await apiFootball.getTeamPlayerStats(teamId, season, 20);
          playerStatsCache.set(teamId, stats || []);
        } catch (_err) {
          playerStatsCache.set(teamId, []);
        }
      }
      return playerStatsCache.get(teamId);
    }

    // Collect unique team IDs that have at least one injury entry
    const teamsWithInjuries = new Set();
    result.matches.forEach((match) => {
      if (match.injuries && match.injuries.length > 0) {
        match.injuries.forEach((inj) => teamsWithInjuries.add(inj.teamId));
      }
    });

    // Pre-fetch all needed team stats in parallel
    await Promise.allSettled(
      [...teamsWithInjuries].map((teamId) => fetchPlayerStatsWithCache(teamId)),
    );

    // Build a standing lookup: teamName → { goalsFor, played }
    const standingLookup = {};
    result.standings.total.forEach((s) => {
      standingLookup[s.name.toLowerCase()] = { goalsFor: s.goalsFor, played: s.played };
    });

    // Compute impact level for each injured player
    result.matches.forEach((match) => {
      if (!match.injuries || match.injuries.length === 0) return;

      match.injuries = match.injuries.map((inj) => {
        const allPlayers = playerStatsCache.get(inj.teamId) || [];
        const player = allPlayers.find((p) => p.id === inj.playerId);

        // Availability: Suspension = always confirmed; Injury type = confirmed out
        const availability = inj.type === 'Suspension' ? 'SUSPENDED' : 'CONFIRMED_OUT';

        if (!player) {
          return { ...inj, availability, position: 'Unknown', impactLevel: 'UNKNOWN', backupQuality: 'UNKNOWN' };
        }

        const teamStanding = standingLookup[inj.teamName.toLowerCase()] ||
          { goalsFor: 30, played: 20 }; // fallback estimates
        const teamTotalGoals = teamStanding.goalsFor || 1;
        const teamTotalMatches = teamStanding.played || 1;

        const gAndA = (player.goals || 0) + (player.assists || 0);
        const participationRate = player.appearances / teamTotalMatches;

        // Find best backup at same position
        const samePos = allPlayers
          .filter((p) => p.id !== player.id && p.position === player.position)
          .sort((a, b) => b.appearances - a.appearances);
        const backup = samePos[0];
        const backupGandA = backup ? (backup.goals || 0) + (backup.assists || 0) : 0;
        const backupParticipation = backup ? backup.appearances / teamTotalMatches : 0;

        // backupRatio: how close backup is to injured player in contribution
        const backupRatio = gAndA > 0
          ? Math.min(1, backupGandA / gAndA)
          : backupParticipation > 0.5 ? 0.7 : 0.2;

        const backupQuality = backupRatio >= 0.80 ? 'ADEQUATE' : backupRatio >= 0.50 ? 'PARTIAL' : 'WEAK';

        // Impact level calculation
        const isGK = player.position === 'Goalkeeper';
        const isRegularStarter = participationRate > 0.60;
        const isTopContributor = gAndA / teamTotalGoals > 0.20;
        const isMediumContributor = gAndA / teamTotalGoals > 0.08 || (gAndA >= 4 && isRegularStarter);

        let impactLevel;
        if (isGK && isRegularStarter) {
          impactLevel = 'HIGH_GK'; // Main keeper out → opponent xGA +15%
        } else if (isTopContributor || (gAndA >= 8 && isRegularStarter)) {
          impactLevel = 'HIGH'; // Top goal contributor → team xGoals –20%
        } else if (isMediumContributor || isRegularStarter) {
          impactLevel = 'MEDIUM'; // Regular starter / moderate contributor → –10%
        } else {
          impactLevel = 'LOW'; // Squad player → –3%
        }

        return {
          ...inj,
          availability,
          position: player.position,
          appearances: player.appearances,
          goals: player.goals,
          assists: player.assists,
          rating: player.rating,
          participationRate: Math.round(participationRate * 100),
          gAndA,
          impactLevel,
          backupQuality,
          // xGoals adjustment hint for the analyst
          xGoalsHint: impactLevel === 'HIGH_GK'
            ? 'opponent_xGA +15% (reduced by 50% if backup ADEQUATE)'
            : impactLevel === 'HIGH'
              ? 'team_xGoals –20% (reduced by 50% if backup ADEQUATE)'
              : impactLevel === 'MEDIUM'
                ? 'team_xGoals –10% (reduced by 50% if backup ADEQUATE)'
                : 'team_xGoals –3%',
        };
      });
    });
  }

  // 8. Team statistics for corner/card predictions — one call per unique team (parallel)
  // Uses shots-per-game as proxy for corners (coefficient 0.42) and direct cards data.
  if (result.matches.length > 0) {
    const league = getLeague(slug);
    const teamStatsCache = new Map(); // teamId → stats

    async function fetchTeamStatsWithCache(teamId) {
      if (!teamStatsCache.has(teamId)) {
        try {
          const stats = await apiFootball.getTeamStatistics(teamId, league.apiFootballId, league.season);
          teamStatsCache.set(teamId, stats || null);
        } catch (_err) {
          teamStatsCache.set(teamId, null);
        }
      }
      return teamStatsCache.get(teamId);
    }

    // Collect unique team IDs from all upcoming matches
    const uniqueTeamIds = new Set();
    result.matches.forEach((m) => {
      if (m.homeId) uniqueTeamIds.add(m.homeId);
      if (m.awayId) uniqueTeamIds.add(m.awayId);
    });

    // Fetch in parallel (one call per unique team)
    await Promise.allSettled(
      [...uniqueTeamIds].map((teamId) => fetchTeamStatsWithCache(teamId)),
    );

    // Attach to each match
    result.matches.forEach((match) => {
      match.homeStats = teamStatsCache.get(match.homeId) || null;
      match.awayStats = teamStatsCache.get(match.awayId) || null;
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
