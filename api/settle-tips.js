/**
 * POST /api/settle-tips
 *
 * Chiude i pronostici confrontando le previsioni con i risultati reali.
 * Progettato per essere chiamato da un cron job giornaliero.
 *
 * Supporta multi-lega: raggruppa i tips pendenti per lega e
 * recupera i risultati di ciascuna lega separatamente.
 *
 * Flusso:
 *   1. Recupera tutti i tips con status 'pending' e match_date nel passato
 *   2. Raggruppa per lega
 *   3. Per ogni lega, recupera i risultati reali
 *   4. Confronta il pronostico con il risultato effettivo
 *   5. Aggiorna lo status del tip (won/lost/void) e crea il tip_outcome
 *
 * Sicurezza: richiede CRON_SECRET nell'header Authorization.
 *
 * Risposta 200: { settled: number, results: Array }
 *
 * Errori:
 *   401 — Segreto cron non valido
 *   405 — Metodo non consentito
 *   500 — Errore durante il settlement
 */

const { supabase } = require('./_lib/supabase');
const apiFootball = require('./_lib/api-football');
const footballData = require('./_lib/football-data');
const { verifyCronSecret } = require('./_lib/auth-middleware');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { authorized, error: cronError } = verifyCronSecret(req);
  if (!authorized) {
    return res.status(401).json({ error: cronError });
  }

  try {
    // 1. Recupera tips pendenti con partite gia' giocate
    const { data: pendingTips, error: fetchError } = await supabase
      .from('tips')
      .select('*')
      .eq('status', 'pending')
      .lt('match_date', new Date().toISOString())
      .order('match_date', { ascending: true });

    if (fetchError) {
      console.error('Failed to fetch pending tips:', fetchError.message);
      return res.status(500).json({ error: 'Errore nel recupero dei pronostici pendenti' });
    }

    if (!pendingTips || pendingTips.length === 0) {
      return res.status(200).json({ settled: 0, message: 'Nessun pronostico da chiudere' });
    }

    // 2. Raggruppa tips per lega
    const tipsByLeague = {};
    pendingTips.forEach(function (tip) {
      const league = tip.league || 'serie-a';
      if (!tipsByLeague[league]) tipsByLeague[league] = [];
      tipsByLeague[league].push(tip);
    });

    // 3. Per ogni lega, recupera risultati e chiudi i tips
    const settledResults = [];

    for (const [leagueSlug, tips] of Object.entries(tipsByLeague)) {
      let results;
      try {
        results = await apiFootball.getRecentResults(leagueSlug, 30);
      } catch (_primaryErr) {
        try {
          results = await footballData.getRecentResults(leagueSlug, 30);
        } catch (_fallbackErr) {
          console.error(`Could not fetch results for ${leagueSlug}, skipping`);
          continue;
        }
      }

      // Mappa risultati per match_id
      const resultsMap = new Map();
      results.forEach(function (r) {
        resultsMap.set(String(r.id), r);
      });

      // Confronta e chiudi ogni tip di questa lega
      for (const tip of tips) {
        const result = resultsMap.get(tip.match_id);

        if (!result || result.goalsHome === null || result.goalsAway === null) {
          continue;
        }

        const totalGoals = result.goalsHome + result.goalsAway;
        const actualResult = buildActualResult(result);
        const status = evaluatePrediction(tip.prediction, result, totalGoals);

        const { error: updateError } = await supabase
          .from('tips')
          .update({ status: status })
          .eq('id', tip.id);

        if (updateError) {
          console.error(`Failed to update tip ${tip.id}:`, updateError.message);
          continue;
        }

        const { error: upsertError } = await supabase.from('tip_outcomes').upsert(
          {
            tip_id: tip.id,
            actual_result: actualResult,
          },
          { onConflict: 'tip_id' },
        );

        if (upsertError) {
          console.error(`Failed to upsert outcome for tip ${tip.id}:`, upsertError.message);
        }

        settledResults.push({
          match: tip.home_team + ' vs ' + tip.away_team,
          league: leagueSlug,
          prediction: tip.prediction,
          actual: actualResult,
          status: status,
        });
      }
    }

    return res.status(200).json({
      settled: settledResults.length,
      results: settledResults,
    });
  } catch (err) {
    console.error('settle-tips error:', err);
    return res.status(500).json({ error: 'Errore nella chiusura dei pronostici' });
  }
};

/**
 * Costruisce una stringa descrittiva del risultato effettivo.
 * @param {Object} result - Risultato della partita
 * @returns {string} Descrizione (es. "2-1 (Home Win, Over 2.5)")
 */
function buildActualResult(result) {
  const score = result.goalsHome + '-' + result.goalsAway;
  const totalGoals = result.goalsHome + result.goalsAway;
  const parts = [score];

  if (result.goalsHome > result.goalsAway) parts.push('1');
  else if (result.goalsHome === result.goalsAway) parts.push('X');
  else parts.push('2');

  parts.push(totalGoals > 2 ? 'O2.5' : 'U2.5');
  parts.push(totalGoals > 1 ? 'O1.5' : 'U1.5');
  parts.push(result.goalsHome > 0 && result.goalsAway > 0 ? 'Goal' : 'NoGoal');

  return parts.join(', ');
}

/**
 * Valuta se un pronostico e' vincente confrontandolo con il risultato.
 *
 * @param {string} prediction - Tipo di pronostico (es. "Over 2.5", "1", "Goal")
 * @param {Object} result - Risultato della partita
 * @param {number} totalGoals - Gol totali
 * @returns {string} 'won', 'lost', o 'void'
 */
function evaluatePrediction(prediction, result, totalGoals) {
  const homeWin = result.goalsHome > result.goalsAway;
  const draw = result.goalsHome === result.goalsAway;
  const awayWin = result.goalsAway > result.goalsHome;
  const bothScored = result.goalsHome > 0 && result.goalsAway > 0;

  switch (prediction) {
    case '1':
      return homeWin ? 'won' : 'lost';
    case 'X':
      return draw ? 'won' : 'lost';
    case '2':
      return awayWin ? 'won' : 'lost';
    case '1X':
      return homeWin || draw ? 'won' : 'lost';
    case 'X2':
      return draw || awayWin ? 'won' : 'lost';
    case '12':
      return homeWin || awayWin ? 'won' : 'lost';
    case 'Over 2.5':
      return totalGoals > 2 ? 'won' : 'lost';
    case 'Under 2.5':
      return totalGoals < 3 ? 'won' : 'lost';
    case 'Over 1.5':
      return totalGoals > 1 ? 'won' : 'lost';
    case 'Under 3.5':
      return totalGoals < 4 ? 'won' : 'lost';
    case 'Goal':
      return bothScored ? 'won' : 'lost';
    case 'No Goal':
      return !bothScored ? 'won' : 'lost';
    case '1 + Over 1.5':
      return homeWin && totalGoals > 1 ? 'won' : 'lost';
    case '2 + Over 1.5':
      return awayWin && totalGoals > 1 ? 'won' : 'lost';
    default:
      return 'void';
  }
}
