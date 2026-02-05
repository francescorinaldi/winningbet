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
 * Gestisce sia errori HTTP che errori nel body della risposta
 * (l'API restituisce status 200 con campo "errors" in caso di problemi).
 *
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
 * Usa il parametro "next" dell'API per ottenere i prossimi N match schedulati.
 *
 * @param {string} leagueSlug - Slug della lega (es. "serie-a", "premier-league")
 * @param {number} count - Numero massimo di partite da restituire (default: 10)
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
 * Usa il parametro "last" dell'API per ottenere gli ultimi N match terminati.
 *
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
 * Filtra per Bet365 (bookmaker ID 8) e restituisce solo la scommessa
 * "Match Winner" (bet ID 1) con i tre esiti: Home, Draw, Away.
 *
 * @param {number|string} fixtureId - ID della partita
 * @returns {Promise<Object|null>} Oggetto quote o null se non disponibili
 */
async function getOdds(fixtureId) {
  const data = await request('/odds', {
    fixture: fixtureId,
    bookmaker: 8, // Bet365 (ID 8)
  });
  if (!data || data.length === 0) return null;
  const bookmaker = data[0].bookmakers[0];
  if (!bookmaker) return null;
  // Estrae solo la scommessa "Match Winner" (1X2, bet ID 1)
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

/**
 * Recupera la classifica completa di una lega.
 * Restituisce un array ordinato per posizione con statistiche complete
 * per ogni squadra, inclusa la forma recente (ultimi 5 risultati).
 *
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
