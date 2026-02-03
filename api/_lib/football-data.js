// Fallback client for football-data.org — v4
// Serie A competition code: SA (id 2019)
const BASE = 'https://api.football-data.org/v4';

function headers() {
  return {
    'X-Auth-Token': process.env.FOOTBALL_DATA_KEY,
  };
}

async function request(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`football-data.org error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** Prossime partite Serie A */
async function getUpcomingMatches(count = 10) {
  const data = await request(`/competitions/SA/matches?status=SCHEDULED&limit=${count}`);
  return (data.matches || []).slice(0, count).map((m) => ({
    id: m.id,
    date: m.utcDate,
    status: m.status,
    home: m.homeTeam.shortName || m.homeTeam.name,
    homeLogo: m.homeTeam.crest,
    away: m.awayTeam.shortName || m.awayTeam.name,
    awayLogo: m.awayTeam.crest,
    goalsHome: m.score.fullTime.home,
    goalsAway: m.score.fullTime.away,
  }));
}

/** Ultimi risultati Serie A */
async function getRecentResults(count = 10) {
  const data = await request(`/competitions/SA/matches?status=FINISHED&limit=${count}`);
  const matches = data.matches || [];
  // football-data.org returns oldest first, reverse to get most recent
  return matches.slice(-count).reverse().map((m) => ({
    id: m.id,
    date: m.utcDate,
    home: m.homeTeam.shortName || m.homeTeam.name,
    homeLogo: m.homeTeam.crest,
    away: m.awayTeam.shortName || m.awayTeam.name,
    awayLogo: m.awayTeam.crest,
    goalsHome: m.score.fullTime.home,
    goalsAway: m.score.fullTime.away,
    status: m.status,
  }));
}

/** Classifica Serie A */
async function getStandings() {
  const data = await request('/competitions/SA/standings');
  const table = data.standings.find((s) => s.type === 'TOTAL');
  if (!table) return [];
  return table.table.map((team) => ({
    rank: team.position,
    name: team.team.shortName || team.team.name,
    logo: team.team.crest,
    points: team.points,
    played: team.playedGames,
    win: team.won,
    draw: team.draw,
    lose: team.lost,
    goalsFor: team.goalsFor,
    goalsAgainst: team.goalsAgainst,
    goalDiff: team.goalDifference,
    form: team.form,
  }));
}

module.exports = { getUpcomingMatches, getRecentResults, getStandings };
