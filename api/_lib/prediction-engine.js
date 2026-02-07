/**
 * AI Prediction Engine — Claude API Integration
 *
 * Genera pronostici per le partite di calcio usando Claude.
 * Supporta tutte le leghe configurate in leagues.js.
 * Riceve dati strutturati (forma, classifica, H2H, quote) e
 * produce una previsione con confidence, analisi e tier.
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
 * Genera un pronostico AI per una singola partita.
 *
 * @param {Object} params
 * @param {Object} params.match - Dati della partita (da /api/matches)
 * @param {Object} params.homeStanding - Classifica squadra casa (da /api/standings)
 * @param {Object} params.awayStanding - Classifica squadra ospite (da /api/standings)
 * @param {Object|null} params.odds - Quote 1X2 (da /api/odds)
 * @param {string} params.tier - Tier del tip: 'free', 'pro', o 'vip'
 * @returns {Promise<Object>} Pronostico generato
 * @returns {string} return.prediction - Tipo di pronostico (es. "Over 2.5")
 * @returns {number} return.confidence - Livello di fiducia (60-95)
 * @returns {number} return.odds - Quota consigliata
 * @returns {string} return.analysis - Analisi in italiano (2-3 frasi)
 */
async function generatePrediction({ match, homeStanding, awayStanding, odds, tier, leagueName }) {
  const league = leagueName || 'Serie A';
  const oddsInfo =
    odds && odds.values && odds.values.length >= 3
      ? `Quote 1X2: Casa ${odds.values[0].odd}, Pareggio ${odds.values[1].odd}, Trasferta ${odds.values[2].odd}`
      : 'Quote non disponibili';

  const prompt = `Sei un analista di calcio professionista specializzato nella ${league}.
Analizza questa partita e fornisci un pronostico.

PARTITA: ${match.home} vs ${match.away}
DATA: ${match.date}

CLASSIFICA CASA (${match.home}):
- Posizione: ${homeStanding.rank}°
- Punti: ${homeStanding.points} in ${homeStanding.played} partite
- Vittorie/Pareggi/Sconfitte: ${homeStanding.win}/${homeStanding.draw}/${homeStanding.lose}
- Gol fatti/subiti: ${homeStanding.goalsFor}/${homeStanding.goalsAgainst}
- Forma recente: ${homeStanding.form || 'N/D'}

CLASSIFICA OSPITE (${match.away}):
- Posizione: ${awayStanding.rank}°
- Punti: ${awayStanding.points} in ${awayStanding.played} partite
- Vittorie/Pareggi/Sconfitte: ${awayStanding.win}/${awayStanding.draw}/${awayStanding.lose}
- Gol fatti/subiti: ${awayStanding.goalsFor}/${awayStanding.goalsAgainst}
- Forma recente: ${awayStanding.form || 'N/D'}

${oddsInfo}

TIER: ${tier} (${tier === 'vip' ? 'cerca pronostici ad alto valore/quota' : tier === 'pro' ? 'pronostico dettagliato' : 'pronostico base accessibile'})

TIPI DI PRONOSTICO VALIDI: ${PREDICTION_TYPES.join(', ')}

Rispondi SOLO con un oggetto JSON valido (senza markdown, senza backtick) nel seguente formato:
{
  "prediction": "<tipo dal lista sopra>",
  "confidence": <numero tra 60 e 95>,
  "odds": <quota decimale consigliata tra 1.20 e 5.00>,
  "analysis": "<analisi in italiano di 2-3 frasi>"
}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  let text = response.content[0].text.trim();
  // Strip markdown code fences if present (e.g. ```json ... ```)
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  try {
    const result = JSON.parse(text);

    // Validazione dei campi
    if (!PREDICTION_TYPES.includes(result.prediction)) {
      throw new Error(`Tipo di pronostico non valido: ${result.prediction}`);
    }

    const parsedOdds = parseFloat(result.odds);
    if (isNaN(parsedOdds)) {
      throw new Error(`Invalid odds value from AI: ${result.odds}`);
    }

    return {
      prediction: result.prediction,
      confidence: Math.min(95, Math.max(60, Math.round(result.confidence))),
      odds: parseFloat(Math.min(5.0, Math.max(1.2, parsedOdds)).toFixed(2)),
      analysis: result.analysis,
    };
  } catch (parseErr) {
    console.error('Failed to parse AI response:', text);
    throw new Error(`Invalid AI response: ${parseErr.message}`);
  }
}

/**
 * Genera pronostici per un batch di partite.
 * Assegna automaticamente i tier: prima partita FREE, poi PRO, poi VIP.
 *
 * @param {Object} params
 * @param {Array<Object>} params.matches - Array di partite
 * @param {Array<Object>} params.standings - Classifica completa
 * @param {Function} params.getOdds - Funzione per recuperare le quote (match.id => odds)
 * @returns {Promise<Array<Object>>} Array di pronostici con metadati partita
 */
async function generateBatchPredictions({ matches, standings, getOdds, leagueName }) {
  const standingsMap = new Map();
  standings.forEach((team) => standingsMap.set(team.name, team));

  const tierPattern = ['free', 'pro', 'vip', 'pro', 'vip', 'pro', 'free', 'pro', 'vip', 'pro'];
  const results = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const tier = tierPattern[i % tierPattern.length];

    const homeStanding = standingsMap.get(match.home) || createDefaultStanding(match.home);
    const awayStanding = standingsMap.get(match.away) || createDefaultStanding(match.away);

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
        odds,
        tier,
        leagueName,
      });

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

  return results;
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

module.exports = { generateBatchPredictions };
