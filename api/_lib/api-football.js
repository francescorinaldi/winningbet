/**
 * Client per API-Football (api-football.com) — v3
 * Provider primario per tutti i dati calcistici del sito.
 *
 * Documentazione API: https://www.api-football.com/documentation-v3
 * Base URL: https://v3.football.api-sports.io
 * Autenticazione: header x-apisports-key
 *
 * Configurazione:
 *   - Liga: Serie A (ID 135)
 *   - Stagione: 2025
 *   - Bookmaker per le quote: Bet365 (ID 8)
 *
 * Variabile d'ambiente richiesta: API_FOOTBALL_KEY
 */

const BASE = 'https://v3.football.api-sports.io';
const LEAGUE_ID = 135;  // Serie A
const SEASON = 2025;

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
 * Recupera le prossime partite di Serie A.
 * Usa il parametro "next" dell'API per ottenere i prossimi N match schedulati.
 *
 * @param {number} count - Numero massimo di partite da restituire (default: 10)
 * @returns {Promise<Array<Object>>} Array di oggetti partita normalizzati
 * @returns {number} return[].id - ID fixture univoco
 * @returns {string} return[].date - Data ISO 8601
 * @returns {string} return[].status - Stato breve (NS=non iniziata, FT=terminata, ecc.)
 * @returns {string} return[].home - Nome squadra di casa
 * @returns {string} return[].homeLogo - URL logo squadra di casa
 * @returns {string} return[].away - Nome squadra ospite
 * @returns {string} return[].awayLogo - URL logo squadra ospite
 * @returns {number|null} return[].goalsHome - Gol casa (null se non iniziata)
 * @returns {number|null} return[].goalsAway - Gol ospite (null se non iniziata)
 */
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

/**
 * Recupera gli ultimi risultati di Serie A (partite concluse).
 * Usa il parametro "last" dell'API per ottenere gli ultimi N match terminati.
 *
 * @param {number} count - Numero massimo di risultati (default: 10)
 * @returns {Promise<Array<Object>>} Array di oggetti risultato (stesso formato di getUpcomingMatches)
 */
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

/**
 * Recupera le quote pre-match Match Winner (1X2) per una partita.
 * Filtra per Bet365 (bookmaker ID 8) e restituisce solo la scommessa
 * "Match Winner" (bet ID 1) con i tre esiti: Home, Draw, Away.
 *
 * @param {number|string} fixtureId - ID della partita
 * @returns {Promise<Object|null>} Oggetto quote o null se non disponibili
 * @returns {string} return.fixtureId - ID della partita
 * @returns {string} return.bookmaker - Nome del bookmaker (Bet365)
 * @returns {Array<Object>} return.values - Esiti con quote
 * @returns {string} return.values[].outcome - "Home", "Draw", o "Away"
 * @returns {string} return.values[].odd - Quota decimale come stringa
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
 * Recupera la classifica completa della Serie A.
 * Restituisce un array ordinato per posizione con statistiche complete
 * per ogni squadra, inclusa la forma recente (ultimi 5 risultati).
 *
 * @returns {Promise<Array<Object>>} Array ordinato per rank
 * @returns {number} return[].rank - Posizione in classifica
 * @returns {string} return[].name - Nome squadra
 * @returns {string} return[].logo - URL logo squadra
 * @returns {number} return[].points - Punti totali
 * @returns {number} return[].played - Partite giocate
 * @returns {number} return[].win - Vittorie
 * @returns {number} return[].draw - Pareggi
 * @returns {number} return[].lose - Sconfitte
 * @returns {number} return[].goalsFor - Gol fatti
 * @returns {number} return[].goalsAgainst - Gol subiti
 * @returns {number} return[].goalDiff - Differenza reti
 * @returns {string} return[].form - Ultimi 5 risultati (es. "WWDLW")
 */
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
