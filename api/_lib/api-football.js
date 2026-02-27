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
    homeId: item.teams.home.id,
    homeLogo: item.teams.home.logo,
    away: item.teams.away.name,
    awayId: item.teams.away.id,
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
  const allOdds = await getAllOdds(fixtureId);
  if (!allOdds || !allOdds.matchWinner) return null;
  return {
    fixtureId,
    bookmaker: allOdds.bookmaker,
    values: allOdds.matchWinner,
  };
}

/**
 * Recupera tutte le quote pre-match per una partita (tutti i mercati).
 * Estrae: Match Winner (1X2), Over/Under, Both Teams Score, Double Chance.
 * @param {number|string} fixtureId - ID della partita
 * @returns {Promise<Object|null>} Oggetto con quote per mercato o null
 */
async function getAllOdds(fixtureId) {
  const data = await request('/odds', {
    fixture: fixtureId,
    bookmaker: 8, // Bet365 (ID 8)
  });
  if (!data || data.length === 0) return null;
  if (!data[0].bookmakers || data[0].bookmakers.length === 0) return null;

  const bookmaker = data[0].bookmakers[0];
  const result = { fixtureId, bookmaker: bookmaker.name };

  // Bet ID 1: Match Winner (1X2)
  const matchWinner = bookmaker.bets.find((b) => b.id === 1);
  if (matchWinner) {
    result.matchWinner = matchWinner.values.map((v) => ({
      outcome: v.value,
      odd: v.odd,
    }));
  }

  // Bet ID 5: Over/Under Goals
  const overUnder = bookmaker.bets.find((b) => b.id === 5);
  if (overUnder) {
    result.overUnder = overUnder.values.map((v) => ({
      outcome: v.value,
      odd: v.odd,
    }));
  }

  // Bet ID 8: Both Teams Score (Goal/No Goal)
  const bts = bookmaker.bets.find((b) => b.id === 8);
  if (bts) {
    result.bothTeamsScore = bts.values.map((v) => ({
      outcome: v.value,
      odd: v.odd,
    }));
  }

  // Bet ID 12: Double Chance (1X, 12, X2)
  const doubleChance = bookmaker.bets.find((b) => b.id === 12);
  if (doubleChance) {
    result.doubleChance = doubleChance.values.map((v) => ({
      outcome: v.value,
      odd: v.odd,
    }));
  }

  // Corners Over/Under (name-based: market names vary by bookmaker version)
  const cornersMarket = bookmaker.bets.find(
    (b) => b.id === 45 || b.name.toLowerCase().includes('corner'),
  );
  if (cornersMarket) {
    result.corners = cornersMarket.values.map((v) => ({
      outcome: v.value,
      odd: v.odd,
    }));
  }

  // Cards/Bookings Over/Under
  const cardsMarket = bookmaker.bets.find(
    (b) =>
      b.id === 75 ||
      b.name.toLowerCase().includes('card') ||
      b.name.toLowerCase().includes('booking'),
  );
  if (cardsMarket) {
    result.cards = cardsMarket.values.map((v) => ({
      outcome: v.value,
      odd: v.odd,
    }));
  }

  return result;
}

/**
 * Cerca la quota bookmaker reale per un tipo di pronostico specifico.
 * Mappa il testo del pronostico al mercato e outcome corretto.
 * @param {Object} allOdds - Risultato di getAllOdds()
 * @param {string} prediction - Testo del pronostico (es. "Over 2.5", "1", "Goal")
 * @returns {number|null} Quota decimale o null se non trovata
 */
function findOddsForPrediction(allOdds, prediction) {
  if (!allOdds || !prediction) return null;
  const pred = prediction.trim();

  // Match Winner: 1, X, 2
  if (pred === '1' && allOdds.matchWinner) {
    const home = allOdds.matchWinner.find((v) => v.outcome === 'Home');
    return home ? parseFloat(home.odd) : null;
  }
  if (pred === 'X' && allOdds.matchWinner) {
    const draw = allOdds.matchWinner.find((v) => v.outcome === 'Draw');
    return draw ? parseFloat(draw.odd) : null;
  }
  if (pred === '2' && allOdds.matchWinner) {
    const away = allOdds.matchWinner.find((v) => v.outcome === 'Away');
    return away ? parseFloat(away.odd) : null;
  }

  // Double Chance: 1X, X2, 12
  if (pred === '1X' && allOdds.doubleChance) {
    const dc = allOdds.doubleChance.find((v) => v.outcome === 'Home/Draw');
    return dc ? parseFloat(dc.odd) : null;
  }
  if (pred === 'X2' && allOdds.doubleChance) {
    const dc = allOdds.doubleChance.find((v) => v.outcome === 'Draw/Away');
    return dc ? parseFloat(dc.odd) : null;
  }
  if (pred === '12' && allOdds.doubleChance) {
    const dc = allOdds.doubleChance.find((v) => v.outcome === 'Home/Away');
    return dc ? parseFloat(dc.odd) : null;
  }

  // Over/Under Goals: Over 2.5, Under 2.5, Over 1.5, Under 3.5, etc.
  const overUnderMatch = pred.match(/^(Over|Under)\s+(\d+(?:\.\d+)?)$/i);
  if (overUnderMatch && allOdds.overUnder) {
    const direction = overUnderMatch[1]; // "Over" or "Under"
    const threshold = overUnderMatch[2]; // "2.5", "1.5", etc.
    const outcome = `${direction} ${threshold}`;
    const found = allOdds.overUnder.find((v) => v.outcome.toLowerCase() === outcome.toLowerCase());
    return found ? parseFloat(found.odd) : null;
  }

  // Both Teams Score: Goal, No Goal
  if (pred === 'Goal' && allOdds.bothTeamsScore) {
    const yes = allOdds.bothTeamsScore.find((v) => v.outcome === 'Yes');
    return yes ? parseFloat(yes.odd) : null;
  }
  if (pred === 'No Goal' && allOdds.bothTeamsScore) {
    const no = allOdds.bothTeamsScore.find((v) => v.outcome === 'No');
    return no ? parseFloat(no.odd) : null;
  }

  // Corner predictions: "Corners Over X.5", "Corners Under X.5"
  const cornersMatch = pred.match(/^Corners\s+(Over|Under)\s+(\d+(?:\.\d+)?)$/i);
  if (cornersMatch && allOdds.corners) {
    const direction = cornersMatch[1]; // "Over" or "Under"
    const threshold = cornersMatch[2]; // "9.5", "8.5", etc.
    const outcome = `${direction} ${threshold}`;
    const found = allOdds.corners.find(
      (v) => v.outcome.toLowerCase() === outcome.toLowerCase(),
    );
    return found ? parseFloat(found.odd) : null;
  }

  // Card predictions: "Cards Over X.5", "Cards Under X.5"
  const cardsMatch = pred.match(/^Cards\s+(Over|Under)\s+(\d+(?:\.\d+)?)$/i);
  if (cardsMatch && allOdds.cards) {
    const direction = cardsMatch[1];
    const threshold = cardsMatch[2];
    const outcome = `${direction} ${threshold}`;
    const found = allOdds.cards.find(
      (v) => v.outcome.toLowerCase() === outcome.toLowerCase(),
    );
    return found ? parseFloat(found.odd) : null;
  }

  // Combo predictions: "1 + Over 1.5", "2 + Over 1.5"
  // No single bookmaker market exists. Approximate by multiplying component odds
  // and applying a 0.92 correlation factor (winning team implies goals scored,
  // so the events aren't independent — raw multiplication overstates the odds).
  const comboMatch = pred.match(/^([12X])\s*\+\s*(Over|Under)\s+(\d+(?:\.\d+)?)$/i);
  if (comboMatch) {
    const resultPred = comboMatch[1]; // "1" or "2"
    const ouDirection = comboMatch[2]; // "Over" or "Under"
    const ouThreshold = comboMatch[3]; // "1.5"

    const resultOdds = findOddsForPrediction(allOdds, resultPred);
    const ouOdds = findOddsForPrediction(allOdds, `${ouDirection} ${ouThreshold}`);

    if (resultOdds && ouOdds) {
      const CORRELATION_FACTOR = 0.92;
      return parseFloat((resultOdds * ouOdds * CORRELATION_FACTOR).toFixed(2));
    }
  }

  return null;
}

/**
 * Recupera la classifica completa di una lega.
 * @param {string} leagueSlug - Slug della lega
 * @returns {Promise<Array<Object>>} Array ordinato per rank
 */
async function getStandings(leagueSlug) {
  const data = await fetchStandingsData(leagueSlug);
  if (!data) return [];
  return data.map((team) => normalizeStandingEntry(team, 'all'));
}

/**
 * Recupera classifica totale, casa e trasferta in una singola chiamata API.
 * L'endpoint /standings di api-football.com restituisce team.all, team.home,
 * team.away nella stessa risposta — zero chiamate extra.
 *
 * @param {string} leagueSlug - Slug della lega
 * @returns {Promise<Object>} { total: [...], home: [...], away: [...] }
 */
async function getFullStandings(leagueSlug) {
  const data = await fetchStandingsData(leagueSlug);
  if (!data) return { total: [], home: [], away: [] };

  return {
    total: data.map((team) => normalizeStandingEntry(team, 'all')),
    home: data.map((team) => normalizeStandingEntry(team, 'home')),
    away: data.map((team) => normalizeStandingEntry(team, 'away')),
  };
}

/**
 * Recupera i dati grezzi della classifica dall'API.
 * @param {string} leagueSlug - Slug della lega
 * @returns {Promise<Array|null>} Array di team entries o null
 */
async function fetchStandingsData(leagueSlug) {
  const league = getLeague(leagueSlug);
  const data = await request('/standings', {
    league: league.apiFootballId,
    season: league.season,
  });
  if (!data || data.length === 0) return null;
  if (!data[0].league || !data[0].league.standings || data[0].league.standings.length === 0) {
    return null;
  }
  return data[0].league.standings.flat();
}

/**
 * Normalizza un singolo entry della classifica api-football.com.
 * @param {Object} team - Entry grezza
 * @param {string} context - 'all', 'home', o 'away'
 * @returns {Object} Entry normalizzata
 */
function normalizeStandingEntry(team, context) {
  const stats = team[context];
  return {
    rank: team.rank,
    name: team.team.name,
    logo: team.team.logo,
    points: team.points,
    played: stats.played,
    win: stats.win,
    draw: stats.draw,
    lose: stats.lose,
    goalsFor: stats.goals.for,
    goalsAgainst: stats.goals.against,
    goalDiff: team.goalsDiff,
    form: team.form,
  };
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

/**
 * Recupera infortuni e squalifiche per una specifica partita.
 * @param {number|string} fixtureId - ID della partita
 * @returns {Promise<Array<Object>>} Array di giocatori out/dubbi con tipo e motivo
 */
async function getFixtureInjuries(fixtureId) {
  const data = await request('/injuries', { fixture: fixtureId });
  return (data || []).map((item) => ({
    playerId: item.player.id,
    playerName: item.player.name,
    teamId: item.team.id,
    teamName: item.team.name,
    type: item.type, // "Injury" | "Suspension"
    reason: item.reason || null,
  }));
}

/**
 * Recupera le statistiche stagionali dei giocatori di una squadra.
 * Restituisce solo page=1 (top ~20 giocatori per presenze) per efficienza.
 * @param {number|string} teamId - ID della squadra
 * @param {number|string} season - Anno stagione (es. 2025)
 * @param {number} topN - Numero massimo di giocatori da restituire (default: 20)
 * @returns {Promise<Array<Object>>} Array di giocatori con statistiche
 */
async function getTeamPlayerStats(teamId, season, topN = 20) {
  const data = await request('/players', { team: teamId, season, page: 1 });
  return (data || []).slice(0, topN).map((item) => {
    const stats = item.statistics?.[0] || {};
    return {
      id: item.player.id,
      name: item.player.name,
      position: stats.games?.position || 'Unknown',
      appearances: stats.games?.appearences || 0,
      minutes: stats.games?.minutes || 0,
      goals: stats.goals?.total || 0,
      assists: stats.goals?.assists || 0,
      rating: parseFloat(stats.games?.rating || 0) || 0,
    };
  });
}

/**
 * Recupera le statistiche stagionali di una squadra per corner e cartellini.
 * Utile per il modello di previsione Corner/Cards betting markets.
 *
 * Dati restituiti:
 *   - cards: cartellini gialli/rossi medi per partita
 *   - shots: tiri totali medi per partita (proxy per corner)
 *   - corners_estimate: stima corner per partita (shots × 0.42)
 *
 * Il coefficiente 0.42 è derivato da correlazione empirica shots→corners
 * per i principali campionati europei (media ~10.5 corner/match ÷ ~25 shots/match).
 *
 * @param {number|string} teamId - ID della squadra (api-football)
 * @param {number|string} leagueId - ID della lega (api-football)
 * @param {number|string} season - Anno stagione (es. 2025)
 * @returns {Promise<Object|null>} Statistiche o null se non disponibili
 */
async function getTeamStatistics(teamId, leagueId, season) {
  // /teams/statistics returns a single object (not an array) in json.response
  const data = await request('/teams/statistics', { team: teamId, league: leagueId, season });
  // api-football wraps the response: could be object or single-element array
  const stats = Array.isArray(data) ? data[0] : data;
  if (!stats || !stats.fixtures) return null;

  const played = stats.fixtures.played?.total || 1;

  const yellowTotal = Object.values(stats.cards?.yellow || {}).reduce(
    (sum, v) => sum + (Number(v.total) || 0),
    0,
  );
  const redTotal = Object.values(stats.cards?.red || {}).reduce(
    (sum, v) => sum + (Number(v.total) || 0),
    0,
  );

  const shotsOnTotal = stats.shots?.on?.total || 0;
  const shotsOffTotal = stats.shots?.off?.total || 0;
  const shotsTotal = shotsOnTotal + shotsOffTotal;

  return {
    played,
    cards: {
      yellow_total: yellowTotal,
      red_total: redTotal,
      total_per_game: parseFloat(((yellowTotal + redTotal) / played).toFixed(2)),
      yellow_per_game: parseFloat((yellowTotal / played).toFixed(2)),
    },
    shots: {
      total: shotsTotal,
      per_game: parseFloat((shotsTotal / played).toFixed(2)),
    },
    // Corner estimate: ~0.42 shots → corners (empirical coefficient for top 5 leagues)
    corners_estimate: {
      per_game: parseFloat(((shotsTotal / played) * 0.42).toFixed(2)),
    },
  };
}

/**
 * Recupera le quote per una partita da tutti i bookmaker disponibili.
 * Utile per il comparatore quote del Centro Scommesse B2B.
 *
 * @param {number|string} fixtureId - ID della partita
 * @returns {Promise<{fixtureId: number, bookmakers: Array}|null>}
 */
async function getMultipleBookmakerOdds(fixtureId) {
  const data = await request('/odds', { fixture: fixtureId });
  // omettere bookmaker= restituisce tutti i bookmaker disponibili
  if (!data || data.length === 0) return null;
  if (!data[0].bookmakers || data[0].bookmakers.length === 0) return null;

  const FIELDS = [
    { key: 'home', betId: 1, outcome: 'Home' },
    { key: 'draw', betId: 1, outcome: 'Draw' },
    { key: 'away', betId: 1, outcome: 'Away' },
    { key: 'over25', betId: 5, outcome: 'Over 2.5' },
    { key: 'under25', betId: 5, outcome: 'Under 2.5' },
    { key: 'btts_yes', betId: 8, outcome: 'Yes' },
    { key: 'btts_no', betId: 8, outcome: 'No' },
  ];

  const bookmakers = data[0].bookmakers
    .slice(0, 8)
    .map((bk) => {
      const betsById = {};
      bk.bets.forEach((b) => {
        betsById[b.id] = b;
      });
      const odds = {};
      FIELDS.forEach(({ key, betId, outcome }) => {
        const market = betsById[betId];
        if (!market) {
          odds[key] = null;
          return;
        }
        const v = market.values.find((x) => x.value === outcome);
        odds[key] = v ? v.odd : null;
      });
      return { id: bk.id, name: bk.name, odds };
    })
    .filter(
      (bk) => bk.odds.home !== null || bk.odds.draw !== null || bk.odds.over25 !== null,
    );

  return bookmakers.length === 0 ? null : { fixtureId: Number(fixtureId), bookmakers };
}

module.exports = {
  getUpcomingMatches,
  getRecentResults,
  getOdds,
  getAllOdds,
  findOddsForPrediction,
  getMultipleBookmakerOdds,
  getStandings,
  getFullStandings,
  getHeadToHead,
  getFixtureInjuries,
  getTeamPlayerStats,
  getTeamStatistics,
};
