// Client for API-Football (api-football.com) — v3
// Serie A league ID: 135, season: 2025
const BASE = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 135;
const SEASON = 2025;

function headers() {
  return {
    'x-apisports-key': process.env.API_FOOTBALL_KEY,
  };
}

async function request(path, params = {}) {
  const url = new URL(path, BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) {
    throw new Error(`API-Football error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(json.errors)}`);
  }
  return json.response;
}

/** Prossime partite Serie A (max `count`) */
async function getUpcomingMatches(count = 10) {
  const data = await request('/fixtures', {
    league: LEAGUE_ID,
    season: SEASON,
    next: count,
  });
  return data.map((item) => ({
    id: item.fixture.id,
    date: item.fixture.date,
    status: item.fixture.status.short,
    home: item.teams.home.name,
    homeLogo: item.teams.home.logo,
    away: item.teams.away.name,
    awayLogo: item.teams.away.logo,
    goalsHome: item.goals.home,
    goalsAway: item.goals.away,
  }));
}

/** Ultimi risultati Serie A (last `count` finished matches) */
async function getRecentResults(count = 10) {
  const data = await request('/fixtures', {
    league: LEAGUE_ID,
    season: SEASON,
    last: count,
  });
  return data.map((item) => ({
    id: item.fixture.id,
    date: item.fixture.date,
    home: item.teams.home.name,
    homeLogo: item.teams.home.logo,
    away: item.teams.away.name,
    awayLogo: item.teams.away.logo,
    goalsHome: item.goals.home,
    goalsAway: item.goals.away,
    status: item.fixture.status.short,
  }));
}

/** Quote pre-match per una lista di fixture IDs */
async function getOdds(fixtureId) {
  const data = await request('/odds', {
    fixture: fixtureId,
    bookmaker: 8, // Bet365
  });
  if (!data || data.length === 0) return null;
  const bookmaker = data[0].bookmakers[0];
  if (!bookmaker) return null;
  // Return the "Match Winner" bet (id: 1)
  const matchWinner = bookmaker.bets.find((b) => b.id === 1);
  if (!matchWinner) return null;
  return {
    fixtureId,
    bookmaker: bookmaker.name,
    values: matchWinner.values.map((v) => ({
      outcome: v.value, // "Home", "Draw", "Away"
      odd: v.odd,
    })),
  };
}

/** Classifica Serie A */
async function getStandings() {
  const data = await request('/standings', {
    league: LEAGUE_ID,
    season: SEASON,
  });
  if (!data || data.length === 0) return [];
  const standings = data[0].league.standings[0];
  return standings.map((team) => ({
    rank: team.rank,
    name: team.team.name,
    logo: team.team.logo,
    points: team.points,
    played: team.all.played,
    win: team.all.win,
    draw: team.all.draw,
    lose: team.all.lose,
    goalsFor: team.all.goals.for,
    goalsAgainst: team.all.goals.against,
    goalDiff: team.goalsDiff,
    form: team.form,
  }));
}

module.exports = { getUpcomingMatches, getRecentResults, getOdds, getStandings };
