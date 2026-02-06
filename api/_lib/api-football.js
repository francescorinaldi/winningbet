/**
 * Client per API-Football (api-football.com) — v3
 * Provider primario per tutti i dati calcistici del sito.
 *
 * Documentazione API: https://www.api-football.com/documentation-v3
 * Base URL: https://v3.football.api-sports.io
 * Autenticazione: header x-apisports-key
 *
 * Configurazione leghe: centralizzata in leagues.js
 * Bookmaker per le quote: Bet365 (ID 8)
 *
 * Variabile d'ambiente richiesta: API_FOOTBALL_KEY
 */

const { getLeague } = require('./leagues');

const BASE = 'https://v3.football.api-sports.io';

/**
 * Genera gli header di autenticazione per le richieste API.
 * @returns {Object} Header con API key
 */
function headers() {
  return {
    'x-apisports-key': process.env.API_FOOTBALL_KEY,
  };
}

/**
 * Esegue una richiesta GET autenticata all'API.
 * @param {string} path - Percorso dell'endpoint (es. "/fixtures")
 * @param {Object} params - Query parameters da aggiungere all'URL
 * @returns {Promise<Array>} Campo "response" dal JSON restituito
 * @throws {Error} Se la richiesta fallisce o il body contiene errori
 */
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

/**
 * Recupera le prossime partite di una lega.
 * @param {string} leagueSlug - Slug della lega
 * @param {number} count - Numero massimo di partite (default: 10)
 * @returns {Promise<Array<Object>>} Array di oggetti partita normalizzati
 */
async function getUpcomingMatches(leagueSlug, count = 10) {
  const league = getLeague(leagueSlug);
  const data = await request('/fixtures', {
    league: league.apiFootballId,
    season: league.season,
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

/**
 * Recupera gli ultimi risultati di una lega (partite concluse).
 * @param {string} leagueSlug - Slug della lega
 * @param {number} count - Numero massimo di risultati (default: 10)
 * @returns {Promise<Array<Object>>} Array di oggetti risultato
 */
async function getRecentResults(leagueSlug, count = 10) {
  const league = getLeague(leagueSlug);
  const data = await request('/fixtures', {
    league: league.apiFootballId,
    season: league.season,
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

/**
 * Recupera le quote pre-match Match Winner (1X2) per una partita.
 * @param {number|string} fixtureId - ID della partita
 * @returns {Promise<Object|null>} Oggetto quote o null se non disponibili
 */
async function getOdds(fixtureId) {
  const data = await request('/odds', {
    fixture: fixtureId,
    bookmaker: 8, // Bet365 (ID 8)
  });
  if (!data || data.length === 0) return null;
  if (!data[0].bookmakers || data[0].bookmakers.length === 0) return null;
  const bookmaker = data[0].bookmakers[0];
  const matchWinner = bookmaker.bets.find((b) => b.id === 1);
  if (!matchWinner) return null;
  return {
    fixtureId,
    bookmaker: bookmaker.name,
    values: matchWinner.values.map((v) => ({
      outcome: v.value,
      odd: v.odd,
    })),
  };
}

/**
 * Recupera la classifica completa di una lega.
 * @param {string} leagueSlug - Slug della lega
 * @returns {Promise<Array<Object>>} Array ordinato per rank
 */
async function getStandings(leagueSlug) {
  const league = getLeague(leagueSlug);
  const data = await request('/standings', {
    league: league.apiFootballId,
    season: league.season,
  });
  if (!data || data.length === 0) return [];
  if (!data[0].league || !data[0].league.standings || data[0].league.standings.length === 0) {
    return [];
  }
  const allStandings = data[0].league.standings.flat();
  return allStandings.map((team) => ({
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

/**
 * Looks up team IDs from standings data for a given league.
 * @param {string} leagueSlug - Slug della lega
 * @returns {Promise<Object>} Map of lowercase team name to { id, name }
 */
async function getTeamIds(leagueSlug) {
  const league = getLeague(leagueSlug);
  const data = await request('/standings', {
    league: league.apiFootballId,
    season: league.season,
  });
  if (!data || data.length === 0 || !data[0].league || !data[0].league.standings) {
    return {};
  }
  const teams = {};
  data[0].league.standings.flat().forEach((entry) => {
    teams[entry.team.name.toLowerCase()] = {
      id: entry.team.id,
      name: entry.team.name,
    };
  });
  return teams;
}

/**
 * Recupera lo storico scontri diretti tra due squadre.
 * @param {string} leagueSlug - Slug della lega
 * @param {string} homeTeamName - Nome squadra di casa
 * @param {string} awayTeamName - Nome squadra ospite
 * @param {number} lastN - Numero di scontri (default: 10)
 * @returns {Promise<Object>} { home, away, draws, total, matches }
 */
async function getHeadToHead(leagueSlug, homeTeamName, awayTeamName, lastN = 10) {
  const teamMap = await getTeamIds(leagueSlug);
  const homeTeam = teamMap[homeTeamName.toLowerCase()];
  const awayTeam = teamMap[awayTeamName.toLowerCase()];

  if (!homeTeam || !awayTeam) {
    return {
      home: { name: homeTeamName, wins: 0 },
      away: { name: awayTeamName, wins: 0 },
      draws: 0,
      total: 0,
      matches: [],
    };
  }

  const data = await request('/fixtures/headtohead', {
    h2h: homeTeam.id + '-' + awayTeam.id,
    last: lastN,
  });

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  const matches = [];

  (data || []).forEach((item) => {
    const gh = item.goals.home;
    const ga = item.goals.away;
    const isHome = item.teams.home.id === homeTeam.id;

    if (gh === ga) {
      draws++;
    } else if ((gh > ga && isHome) || (ga > gh && !isHome)) {
      homeWins++;
    } else {
      awayWins++;
    }

    matches.push({
      date: item.fixture.date,
      home: item.teams.home.name,
      away: item.teams.away.name,
      goalsHome: gh,
      goalsAway: ga,
    });
  });

  return {
    home: { name: homeTeam.name, wins: homeWins },
    away: { name: awayTeam.name, wins: awayWins },
    draws,
    total: homeWins + awayWins + draws,
    matches,
  };
}

module.exports = { getUpcomingMatches, getRecentResults, getOdds, getStandings, getHeadToHead };
