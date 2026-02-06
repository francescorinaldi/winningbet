/**
 * Client di fallback per football-data.org — v4
 * Usato quando api-football.com non e' disponibile.
 *
 * Documentazione API: https://www.football-data.org/documentation/v4
 * Base URL: https://api.football-data.org/v4
 * Autenticazione: header X-Auth-Token
 *
 * Configurazione leghe: centralizzata in leagues.js
 *
 * Limiti piano free:
 *   - 10 richieste/minuto
 *   - Dati aggiornati ogni ~1 minuto
 *   - Non fornisce quote scommesse (nessun equivalente di getOdds)
 *   - Non copre Serie B (SB) — il fallback fallira' silenziosamente
 *
 * Variabile d'ambiente richiesta: FOOTBALL_DATA_KEY
 */

const { getLeague } = require('./leagues');

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
 * @param {string} path - Percorso completo dell'endpoint
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
 * Recupera le prossime partite di una lega (stato SCHEDULED).
 * Formato normalizzato compatibile con api-football.js.
 *
 * @param {string} leagueSlug - Slug della lega
 * @param {number} count - Numero massimo di partite (default: 10)
 * @returns {Promise<Array<Object>>} Array di oggetti partita normalizzati
 */
async function getUpcomingMatches(leagueSlug, count = 10) {
  const league = getLeague(leagueSlug);
  const data = await request(
    `/competitions/${league.footballDataCode}/matches?status=SCHEDULED&limit=${count}`,
  );
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
 * Recupera gli ultimi risultati di una lega (stato FINISHED).
 * L'API restituisce le partite in ordine cronologico,
 * quindi il risultato viene invertito per avere i piu' recenti in cima.
 *
 * @param {string} leagueSlug - Slug della lega
 * @param {number} count - Numero massimo di risultati (default: 10)
 * @returns {Promise<Array<Object>>} Array di risultati (piu' recenti prima)
 */
async function getRecentResults(leagueSlug, count = 10) {
  const league = getLeague(leagueSlug);
  const data = await request(
    `/competitions/${league.footballDataCode}/matches?status=FINISHED&limit=${count}`,
  );
  const matches = data.matches || [];
  // football-data.org restituisce in ordine cronologico, invertiamo
  return matches
    .slice(-count)
    .reverse()
    .map((m) => ({
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
 * Recupera la classifica completa di una lega.
 * Filtra per il tipo "TOTAL" (classifica generale, non casa/trasferta).
 * Formato normalizzato compatibile con api-football.js.
 *
 * @param {string} leagueSlug - Slug della lega
 * @returns {Promise<Array<Object>>} Array ordinato per posizione
 */
async function getStandings(leagueSlug) {
  const league = getLeague(leagueSlug);
  const data = await request(`/competitions/${league.footballDataCode}/standings`);
  if (!data.standings || data.standings.length === 0) return [];
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
