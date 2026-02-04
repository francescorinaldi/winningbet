/**
 * Client di fallback per football-data.org — v4
 * Usato quando api-football.com non e' disponibile.
 *
 * Documentazione API: https://www.football-data.org/documentation/v4
 * Base URL: https://api.football-data.org/v4
 * Autenticazione: header X-Auth-Token
 *
 * Configurazione:
 *   - Competizione: Serie A (codice "SA", ID 2019)
 *
 * Limiti piano free:
 *   - 10 richieste/minuto
 *   - Dati aggiornati ogni ~1 minuto
 *   - Non fornisce quote scommesse (nessun equivalente di getOdds)
 *
 * Variabile d'ambiente richiesta: FOOTBALL_DATA_KEY
 */

const BASE = 'https://api.football-data.org/v4';

/**
 * Genera gli header di autenticazione per le richieste API.
 * @returns {Object} Header con API token
 */
function headers() {
  return {
    'X-Auth-Token': process.env.FOOTBALL_DATA_KEY,
  };
}

/**
 * Esegue una richiesta GET autenticata all'API.
 *
 * @param {string} path - Percorso completo dell'endpoint (es. "/competitions/SA/matches?status=SCHEDULED")
 * @returns {Promise<Object>} Risposta JSON completa
 * @throws {Error} Se la richiesta fallisce (status != 2xx)
 */
async function request(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`football-data.org error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Recupera le prossime partite di Serie A (stato SCHEDULED).
 * Il formato di risposta e' normalizzato per essere compatibile
 * con il formato di api-football.js (stesso contratto dati).
 *
 * @param {number} count - Numero massimo di partite (default: 10)
 * @returns {Promise<Array<Object>>} Array di oggetti partita normalizzati
 */
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

/**
 * Recupera gli ultimi risultati di Serie A (stato FINISHED).
 * L'API restituisce le partite in ordine cronologico (piu' vecchia prima),
 * quindi il risultato viene invertito per avere i piu' recenti in cima.
 *
 * @param {number} count - Numero massimo di risultati (default: 10)
 * @returns {Promise<Array<Object>>} Array di risultati (piu' recenti prima)
 */
async function getRecentResults(count = 10) {
  const data = await request(`/competitions/SA/matches?status=FINISHED&limit=${count}`);
  const matches = data.matches || [];
  // football-data.org restituisce in ordine cronologico, invertiamo
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

/**
 * Recupera la classifica completa della Serie A.
 * Filtra per il tipo "TOTAL" (classifica generale, non casa/trasferta).
 * Formato normalizzato compatibile con api-football.js.
 *
 * @returns {Promise<Array<Object>>} Array ordinato per posizione
 */
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
