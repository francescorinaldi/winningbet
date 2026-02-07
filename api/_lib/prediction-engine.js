/**
 * AI Prediction Engine V2.1 — Claude API Integration (Batched)
 *
 * Pipeline a 2 fasi per pronostici calcistici:
 *   Fase 1 — Research: Haiku 4.5 + web search per contesto live (1 call/lega)
 *   Fase 2 — Prediction: Opus 4.6 + structured output per TUTTE le partite (1 call/lega)
 *
 * V2.1: Tutte le partite di una lega in una singola chiamata Opus (10x meno API calls).
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
 * Schema JSON per structured output batch (Opus 4.6).
 * Una singola chiamata restituisce pronostici per TUTTE le partite della lega.
 * @type {Object}
 */
const BATCH_PREDICTION_SCHEMA = {
  type: 'object',
  properties: {
    predictions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          match_index: {
            type: 'integer',
            description: "Indice della partita (0-based, corrispondente all'ordine nel prompt)",
          },
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
        required: ['match_index', 'prediction', 'confidence', 'odds', 'analysis', 'reasoning'],
        additionalProperties: false,
      },
    },
  },
  required: ['predictions'],
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
  let zoneContext = "Meta' classifica";
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
 * Formatta un blocco dati per una singola partita nel prompt batch.
 *
 * @param {number} index - Indice della partita (0-based)
 * @param {Object} match - Dati della partita
 * @param {Object} homeStanding - Classifica totale squadra casa
 * @param {Object} awayStanding - Classifica totale squadra ospite
 * @param {Object|null} homeHomeStanding - Classifica CASA della squadra di casa
 * @param {Object|null} awayAwayStanding - Classifica TRASFERTA della squadra ospite
 * @param {Object|null} odds - Quote 1X2
 * @param {Array<Object>} recentResults - Risultati recenti della lega
 * @param {number} totalTeams - Numero totale squadre in classifica
 * @returns {string} Blocco formattato per il prompt
 */
function formatMatchBlock(
  index,
  match,
  homeStanding,
  awayStanding,
  homeHomeStanding,
  awayAwayStanding,
  odds,
  recentResults,
  totalTeams,
) {
  const oddsInfo =
    odds && odds.values && odds.values.length >= 3
      ? `Quote 1X2: Casa ${odds.values[0].odd}, Pareggio ${odds.values[1].odd}, Trasferta ${odds.values[2].odd}`
      : 'Quote non disponibili';

  const homeRecent = getTeamRecentMatches(match.home, recentResults);
  const awayRecent = getTeamRecentMatches(match.away, recentResults);

  const homeStats = computeDerivedStats(homeStanding, homeRecent, match.home, totalTeams);
  const awayStats = computeDerivedStats(awayStanding, awayRecent, match.away, totalTeams);

  const expectedGoals = (
    (parseFloat(homeStats.avgGoalsFor) + parseFloat(awayStats.avgGoalsAgainst)) / 2 +
    (parseFloat(awayStats.avgGoalsFor) + parseFloat(homeStats.avgGoalsAgainst)) / 2
  ).toFixed(2);

  return `--- PARTITA ${index} ---
${match.home} vs ${match.away} | ${match.date}

${formatStandingSection('CASA', match.home, homeStanding, homeHomeStanding)}

${formatStandingSection('OSPITE', match.away, awayStanding, awayAwayStanding)}

STATISTICHE DERIVATE:
- ${match.home}: media gol fatti ${homeStats.avgGoalsFor}/partita, subiti ${homeStats.avgGoalsAgainst}/partita | BTTS ${homeStats.bttsPercent}% | Clean sheet ${homeStats.cleanSheetPercent}% | ${homeStats.zoneContext}
- ${match.away}: media gol fatti ${awayStats.avgGoalsFor}/partita, subiti ${awayStats.avgGoalsAgainst}/partita | BTTS ${awayStats.bttsPercent}% | Clean sheet ${awayStats.cleanSheetPercent}% | ${awayStats.zoneContext}
- Gol attesi nel match: ${expectedGoals}

RISULTATI RECENTI ${match.home} (ultime 5): ${formatRecentResults(match.home, homeRecent)}
RISULTATI RECENTI ${match.away} (ultime 5): ${formatRecentResults(match.away, awayRecent)}

${oddsInfo}`;
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
  const sorted = [...predictions].sort((a, b) => a.confidence * a.odds - b.confidence * b.odds);

  const third = Math.floor(sorted.length / 3);
  for (let i = 0; i < sorted.length; i++) {
    const original = predictions.find((p) => p.match_id === sorted[i].match_id);
    if (i < third) original.tier = 'free';
    else if (i < third * 2) original.tier = 'pro';
    else original.tier = 'vip';
  }

  return predictions;
}

// ─── Batch Generation ───────────────────────────────────────────────────────

/**
 * Genera pronostici per un batch di partite in una singola chiamata Opus.
 * Pipeline: odds prefetch → web research → batch prediction → tier assignment → balancing.
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

  // Pre-fetch: quote per tutte le partite in parallelo
  const oddsResults = await Promise.allSettled(matches.map((m) => getOdds(m.id)));
  const oddsMap = new Map();
  matches.forEach((m, i) => {
    oddsMap.set(m.id, oddsResults[i].status === 'fulfilled' ? oddsResults[i].value : null);
  });

  // Fase 1: Web Research (una volta per lega)
  let webContext = '';
  try {
    webContext = await researchLeagueContext(leagueName, matches);
  } catch (err) {
    console.warn('Web research skipped:', err.message);
  }

  // Fase 2: Batch prediction — una singola chiamata Opus per tutte le partite
  const matchBlocks = matches.map((match, index) => {
    const homeStanding = standingsMap.get(match.home) || createDefaultStanding(match.home);
    const awayStanding = standingsMap.get(match.away) || createDefaultStanding(match.away);
    return formatMatchBlock(
      index,
      match,
      homeStanding,
      awayStanding,
      homeMap.get(match.home) || null,
      awayMap.get(match.away) || null,
      oddsMap.get(match.id),
      recentResults || [],
      totalTeams,
    );
  });

  const league = leagueName || 'Serie A';
  const prompt = `Analizza queste ${matches.length} partite di ${league} e fornisci un pronostico per ciascuna.
Restituisci un pronostico per OGNI partita, usando match_index corrispondente.

${matchBlocks.join('\n\n')}

${webContext ? `\nCONTESTO AGGIORNATO (da ricerche web):\n${webContext}` : ''}
${accuracyContext ? `\n${accuracyContext}` : ''}

TIPI DI PRONOSTICO VALIDI: ${PREDICTION_TYPES.join(', ')}

Per ogni partita, la confidence deve essere tra 60 e 95, le odds tra 1.20 e 5.00.`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 600 * matches.length,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: BATCH_PREDICTION_SCHEMA,
      },
    },
  });

  const parsed = JSON.parse(response.content[0].text);
  const results = [];

  for (const pred of parsed.predictions) {
    const idx = pred.match_index;
    if (idx < 0 || idx >= matches.length) continue;

    const match = matches[idx];
    const tier = assignTier(pred);

    results.push({
      match_id: String(match.id),
      home_team: match.home,
      away_team: match.away,
      match_date: match.date,
      prediction: pred.prediction,
      odds: parseFloat(Math.min(5.0, Math.max(1.2, pred.odds)).toFixed(2)),
      confidence: Math.min(95, Math.max(60, pred.confidence)),
      analysis: pred.analysis,
      tier,
    });
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
