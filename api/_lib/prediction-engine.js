/**
 * AI Prediction Engine V2 — Claude API Integration
 *
 * Pipeline a 2 fasi per pronostici calcistici:
 *   Fase 1 — Research: Haiku 4.5 + web search per contesto live
 *   Fase 2 — Prediction: Opus 4.6 + structured output per ogni partita
 *
 * Dati arricchiti: classifica totale + casa/trasferta, risultati recenti,
 * statistiche derivate, contesto web, storico accuratezza.
 *
 * Variabile d'ambiente richiesta: ANTHROPIC_API_KEY
 */

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Tipi di pronostico supportati.
 * @type {string[]}
 */
const PREDICTION_TYPES = [
  '1',
  'X',
  '2',
  '1X',
  'X2',
  '12',
  'Over 2.5',
  'Under 2.5',
  'Over 1.5',
  'Under 3.5',
  'Goal',
  'No Goal',
  '1 + Over 1.5',
  '2 + Over 1.5',
];

/**
 * System prompt per l'analista AI (Fase 2 — Prediction).
 * @type {string}
 */
const SYSTEM_PROMPT = `Sei un analista di calcio professionista con 15+ anni di esperienza.
Specializzazione: analisi statistica, forma recente, tendenze casa/trasferta, pattern di gol.

REGOLE:
1. Analizza TUTTI i dati forniti prima di decidere.
2. La confidence deve riflettere la realta' statistica — mai ottimistica.
3. Per Over/Under: analizza media gol fatti+subiti di entrambe.
4. Per Goal/No Goal: considera % partite con entrambe a segno.
5. Non superare confidence 90 senza evidenze schiaccianti.
6. L'analisi deve citare dati specifici, in italiano, 2-3 frasi.
7. Il reasoning deve contenere il processo logico completo.
8. Considera il contesto della partita: obiettivi stagionali, rivalita', fattore campo.`;

/**
 * Schema JSON per structured output (Opus 4.6).
 * Garantisce output conforme senza bisogno di parsing manuale.
 * @type {Object}
 */
const PREDICTION_SCHEMA = {
  type: 'object',
  properties: {
    prediction: {
      type: 'string',
      enum: PREDICTION_TYPES,
      description: 'Tipo di pronostico selezionato',
    },
    confidence: {
      type: 'integer',
      description: 'Livello di fiducia tra 60 e 95',
    },
    odds: {
      type: 'number',
      description: 'Quota decimale consigliata tra 1.20 e 5.00',
    },
    analysis: {
      type: 'string',
      description: 'Analisi in italiano di 2-3 frasi con riferimenti a dati specifici',
    },
    reasoning: {
      type: 'string',
      description: 'Chain-of-thought interna con il processo logico completo',
    },
  },
  required: ['prediction', 'confidence', 'odds', 'analysis', 'reasoning'],
  additionalProperties: false,
};

// ─── Fase 1: Web Research ──────────────────────────────────────────────────

/**
 * Ricerca contesto live per le partite di una lega tramite Haiku 4.5 + web search.
 * Una chiamata per lega (non per partita) per contenere i costi.
 *
 * @param {string} leagueName - Nome della lega (es. "Serie A")
 * @param {Array<Object>} matches - Array di partite da analizzare
 * @returns {Promise<string>} Contesto testuale per il prompt di Fase 2
 */
async function researchLeagueContext(leagueName, matches) {
  const matchList = matches
    .map((m) => `- ${m.home} vs ${m.away} (${new Date(m.date).toLocaleDateString('it-IT')})`)
    .join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 3,
          user_location: { type: 'approximate', country: 'IT' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Cerca informazioni aggiornate per queste partite di ${leagueName} in programma oggi:
${matchList}

Per ogni partita trova: infortuni, squalifiche, cambi di allenatore, stato di forma recente,
e qualsiasi notizia rilevante. Rispondi con un riassunto breve per ogni partita.`,
        },
      ],
    });

    // Estrai solo i blocchi di testo dalla risposta (ignora tool_use e web_search_tool_result)
    const textBlocks = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text);

    return textBlocks.join('\n') || '';
  } catch (err) {
    console.warn('Web research failed (fallback silenzioso):', err.message);
    return '';
  }
}

// ─── Fase 2: Prediction ────────────────────────────────────────────────────

/**
 * Formatta la sezione classifica per il prompt, includendo stats casa/trasferta.
 *
 * @param {string} label - "CASA" o "OSPITE"
 * @param {string} teamName - Nome della squadra
 * @param {Object} total - Classifica totale
 * @param {Object|null} contextStanding - Classifica casa (per home) o trasferta (per away)
 * @returns {string} Sezione formattata per il prompt
 */
function formatStandingSection(label, teamName, total, contextStanding) {
  let section = `CLASSIFICA ${label} (${teamName}):
- Posizione: ${total.rank}° | Punti: ${total.points} in ${total.played} partite
- V/P/S totale: ${total.win}/${total.draw}/${total.lose}
- Gol fatti/subiti: ${total.goalsFor}/${total.goalsAgainst}
- Forma recente: ${total.form || 'N/D'}`;

  if (contextStanding) {
    const contextLabel = label === 'CASA' ? 'IN CASA' : 'IN TRASFERTA';
    section += `\n- Rendimento ${contextLabel}: ${contextStanding.rank}° | V/P/S: ${contextStanding.win}/${contextStanding.draw}/${contextStanding.lose} | GF/GS: ${contextStanding.goalsFor}/${contextStanding.goalsAgainst}`;
  }

  return section;
}

/**
 * Filtra i risultati recenti per una squadra (ultime N partite).
 *
 * @param {string} teamName - Nome della squadra
 * @param {Array<Object>} results - Tutti i risultati recenti della lega
 * @param {number} count - Numero di partite da restituire (default: 5)
 * @returns {Array<Object>} Ultime partite della squadra
 */
function getTeamRecentMatches(teamName, results, count = 5) {
  const teamLower = teamName.toLowerCase();
  return results
    .filter((r) => r.home.toLowerCase() === teamLower || r.away.toLowerCase() === teamLower)
    .slice(0, count);
}

/**
 * Formatta i risultati recenti di una squadra per il prompt.
 *
 * @param {string} teamName - Nome della squadra
 * @param {Array<Object>} matches - Risultati filtrati
 * @returns {string} Stringa formattata (es. "Napoli 3-1 Juventus, Roma 0-2 Napoli")
 */
function formatRecentResults(teamName, matches) {
  if (!matches || matches.length === 0) return 'Nessun risultato recente';
  return matches.map((m) => `${m.home} ${m.goalsHome}-${m.goalsAway} ${m.away}`).join(', ');
}

/**
 * Calcola statistiche derivate da classifica e risultati recenti.
 *
 * @param {Object} standing - Dati classifica della squadra
 * @param {Array<Object>} recentMatches - Ultime partite della squadra
 * @param {string} teamName - Nome della squadra
 * @param {number} totalTeams - Numero totale di squadre in classifica
 * @returns {Object} Statistiche derivate
 */
function computeDerivedStats(standing, recentMatches, teamName, totalTeams) {
  const played = standing.played || 1;
  const avgGoalsFor = (standing.goalsFor / played).toFixed(2);
  const avgGoalsAgainst = (standing.goalsAgainst / played).toFixed(2);

  // BTTS% e Clean Sheet% dalle ultime partite
  let bttsCount = 0;
  let cleanSheetCount = 0;
  const teamLower = teamName.toLowerCase();

  for (const m of recentMatches) {
    const isHome = m.home.toLowerCase() === teamLower;
    const teamGoals = isHome ? m.goalsHome : m.goalsAway;
    const oppGoals = isHome ? m.goalsAway : m.goalsHome;

    if (m.goalsHome > 0 && m.goalsAway > 0) bttsCount++;
    if (oppGoals === 0 && teamGoals !== null) cleanSheetCount++;
  }

  const recentCount = recentMatches.length || 1;
  const bttsPercent = Math.round((bttsCount / recentCount) * 100);
  const cleanSheetPercent = Math.round((cleanSheetCount / recentCount) * 100);

  // Contesto in classifica
  let zoneContext = 'Meta\' classifica';
  if (totalTeams > 0) {
    const rank = standing.rank;
    if (rank <= 4) zoneContext = 'Zona Champions';
    else if (rank <= 6) zoneContext = 'Zona Europa';
    else if (rank <= 7) zoneContext = 'Zona Conference';
    else if (rank > totalTeams - 3) zoneContext = 'Zona retrocessione';
  }

  return { avgGoalsFor, avgGoalsAgainst, bttsPercent, cleanSheetPercent, zoneContext };
}

/**
 * Genera un pronostico AI per una singola partita (Fase 2).
 * Usa Opus 4.6 con structured output per output vincolato.
 *
 * @param {Object} params
 * @param {Object} params.match - Dati della partita
 * @param {Object} params.homeStanding - Classifica totale squadra casa
 * @param {Object} params.awayStanding - Classifica totale squadra ospite
 * @param {Object|null} params.homeHomeStanding - Classifica CASA della squadra di casa
 * @param {Object|null} params.awayAwayStanding - Classifica TRASFERTA della squadra ospite
 * @param {Object|null} params.odds - Quote 1X2
 * @param {string} params.leagueName - Nome della lega
 * @param {Array<Object>} params.recentResults - Risultati recenti della lega
 * @param {string} params.webContext - Contesto da web research (Fase 1)
 * @param {string} params.accuracyContext - Storico accuratezza per tipo di pronostico
 * @param {number} params.totalTeams - Numero totale squadre in classifica
 * @returns {Promise<Object>} Pronostico generato
 */
async function generatePrediction({
  match,
  homeStanding,
  awayStanding,
  homeHomeStanding,
  awayAwayStanding,
  odds,
  leagueName,
  recentResults,
  webContext,
  accuracyContext,
  totalTeams,
}) {
  const league = leagueName || 'Serie A';
  const oddsInfo =
    odds && odds.values && odds.values.length >= 3
      ? `Quote 1X2: Casa ${odds.values[0].odd}, Pareggio ${odds.values[1].odd}, Trasferta ${odds.values[2].odd}`
      : 'Quote non disponibili';

  // Risultati recenti per squadra
  const homeRecent = getTeamRecentMatches(match.home, recentResults);
  const awayRecent = getTeamRecentMatches(match.away, recentResults);

  // Statistiche derivate
  const homeStats = computeDerivedStats(homeStanding, homeRecent, match.home, totalTeams);
  const awayStats = computeDerivedStats(awayStanding, awayRecent, match.away, totalTeams);

  // Gol attesi nel match
  const expectedGoals = (
    (parseFloat(homeStats.avgGoalsFor) + parseFloat(awayStats.avgGoalsAgainst)) / 2 +
    (parseFloat(awayStats.avgGoalsFor) + parseFloat(homeStats.avgGoalsAgainst)) / 2
  ).toFixed(2);

  const prompt = `Analizza questa partita di ${league} e fornisci un pronostico.

PARTITA: ${match.home} vs ${match.away}
DATA: ${match.date}

${formatStandingSection('CASA', match.home, homeStanding, homeHomeStanding)}

${formatStandingSection('OSPITE', match.away, awayStanding, awayAwayStanding)}

STATISTICHE DERIVATE:
- ${match.home}: media gol fatti ${homeStats.avgGoalsFor}/partita, subiti ${homeStats.avgGoalsAgainst}/partita | BTTS ${homeStats.bttsPercent}% | Clean sheet ${homeStats.cleanSheetPercent}% | ${homeStats.zoneContext}
- ${match.away}: media gol fatti ${awayStats.avgGoalsFor}/partita, subiti ${awayStats.avgGoalsAgainst}/partita | BTTS ${awayStats.bttsPercent}% | Clean sheet ${awayStats.cleanSheetPercent}% | ${awayStats.zoneContext}
- Gol attesi nel match: ${expectedGoals}

RISULTATI RECENTI ${match.home} (ultime 5):
${formatRecentResults(match.home, homeRecent)}

RISULTATI RECENTI ${match.away} (ultime 5):
${formatRecentResults(match.away, awayRecent)}

${oddsInfo}
${webContext ? `\nCONTESTO AGGIORNATO (da ricerche web):\n${webContext}` : ''}
${accuracyContext ? `\n${accuracyContext}` : ''}

TIPI DI PRONOSTICO VALIDI: ${PREDICTION_TYPES.join(', ')}

Fornisci il tuo pronostico. La confidence deve essere tra 60 e 95, le odds tra 1.20 e 5.00.`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 700,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: PREDICTION_SCHEMA,
      },
    },
  });

  const result = JSON.parse(response.content[0].text);

  // Validazione bounds (lo schema garantisce il tipo ma non min/max)
  return {
    prediction: result.prediction,
    confidence: Math.min(95, Math.max(60, result.confidence)),
    odds: parseFloat(Math.min(5.0, Math.max(1.2, result.odds)).toFixed(2)),
    analysis: result.analysis,
    reasoning: result.reasoning,
  };
}

// ─── Tier Assignment ────────────────────────────────────────────────────────

/**
 * Assegna il tier in base a confidence e odds (post-generazione).
 * Non piu' assegnato nel prompt Claude.
 *
 * @param {Object} prediction - Pronostico con confidence e odds
 * @returns {string} 'free', 'pro', o 'vip'
 */
function assignTier(prediction) {
  const { confidence, odds } = prediction;
  if (confidence >= 80 && odds <= 1.8) return 'free';
  if (confidence >= 75 && odds <= 2.5) return 'pro';
  if (odds >= 2.5 || prediction.prediction.includes('+')) return 'vip';
  if (confidence >= 70) return 'pro';
  return 'free';
}

/**
 * Garantisce distribuzione minima dei tier (almeno 1 per tier se possibile).
 * Riordina per valore (confidence * odds) e distribuisce equamente.
 *
 * @param {Array<Object>} predictions - Array di pronostici con tier gia' assegnato
 * @returns {Array<Object>} Pronostici con tier ribilanciati
 */
function balanceTiers(predictions) {
  if (predictions.length < 3) return predictions;

  const counts = { free: 0, pro: 0, vip: 0 };
  predictions.forEach((p) => counts[p.tier]++);

  // Se ogni tier ha almeno 1, la distribuzione e' ok
  if (counts.free >= 1 && counts.pro >= 1 && counts.vip >= 1) return predictions;

  // Riordina per valore (confidence * odds) e ridistribuisci
  const sorted = [...predictions].sort(
    (a, b) => a.confidence * a.odds - b.confidence * b.odds,
  );

  const third = Math.floor(sorted.length / 3);
  for (let i = 0; i < sorted.length; i++) {
    const original = predictions.find(
      (p) => p.match_id === sorted[i].match_id,
    );
    if (i < third) original.tier = 'free';
    else if (i < third * 2) original.tier = 'pro';
    else original.tier = 'vip';
  }

  return predictions;
}

// ─── Batch Generation ───────────────────────────────────────────────────────

/**
 * Genera pronostici per un batch di partite.
 * Pipeline: web research → per-match prediction → tier assignment → balancing.
 *
 * @param {Object} params
 * @param {Array<Object>} params.matches - Array di partite
 * @param {Array<Object>} params.standings - Classifica totale
 * @param {Array<Object>} params.homeStandings - Classifica casa (opzionale)
 * @param {Array<Object>} params.awayStandings - Classifica trasferta (opzionale)
 * @param {Array<Object>} params.recentResults - Risultati recenti della lega
 * @param {Function} params.getOdds - Funzione per recuperare le quote
 * @param {string} params.leagueName - Nome della lega
 * @param {string} params.accuracyContext - Storico accuratezza
 * @returns {Promise<Array<Object>>} Array di pronostici con metadati partita
 */
async function generateBatchPredictions({
  matches,
  standings,
  homeStandings,
  awayStandings,
  recentResults,
  getOdds,
  leagueName,
  accuracyContext,
}) {
  const standingsMap = new Map();
  standings.forEach((team) => standingsMap.set(team.name, team));

  const homeMap = new Map();
  if (homeStandings) {
    homeStandings.forEach((team) => homeMap.set(team.name, team));
  }

  const awayMap = new Map();
  if (awayStandings) {
    awayStandings.forEach((team) => awayMap.set(team.name, team));
  }

  const totalTeams = standings.length;

  // Fase 1: Web Research (una volta per lega)
  let webContext = '';
  try {
    webContext = await researchLeagueContext(leagueName, matches);
  } catch (err) {
    console.warn('Web research skipped:', err.message);
  }

  // Fase 2: Prediction per ogni partita
  const results = [];

  for (const match of matches) {
    const homeStanding = standingsMap.get(match.home) || createDefaultStanding(match.home);
    const awayStanding = standingsMap.get(match.away) || createDefaultStanding(match.away);
    const homeHomeStanding = homeMap.get(match.home) || null;
    const awayAwayStanding = awayMap.get(match.away) || null;

    let odds = null;
    try {
      odds = await getOdds(match.id);
    } catch (_err) {
      console.warn(`Could not fetch odds for fixture ${match.id}`);
    }

    try {
      const prediction = await generatePrediction({
        match,
        homeStanding,
        awayStanding,
        homeHomeStanding,
        awayAwayStanding,
        odds,
        leagueName,
        recentResults: recentResults || [],
        webContext,
        accuracyContext: accuracyContext || '',
        totalTeams,
      });

      const tier = assignTier(prediction);

      results.push({
        match_id: String(match.id),
        home_team: match.home,
        away_team: match.away,
        match_date: match.date,
        prediction: prediction.prediction,
        odds: prediction.odds,
        confidence: prediction.confidence,
        analysis: prediction.analysis,
        tier,
      });
    } catch (err) {
      console.error(
        `Failed to generate prediction for ${match.home} vs ${match.away}:`,
        err.message,
      );
    }
  }

  return balanceTiers(results);
}

/**
 * Crea un oggetto standing di default per squadre non trovate in classifica.
 * @param {string} name - Nome della squadra
 * @returns {Object} Standing con valori di default
 */
function createDefaultStanding(name) {
  return {
    rank: 10,
    name,
    points: 0,
    played: 0,
    win: 0,
    draw: 0,
    lose: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    form: 'N/D',
  };
}

module.exports = { generateBatchPredictions, researchLeagueContext };
