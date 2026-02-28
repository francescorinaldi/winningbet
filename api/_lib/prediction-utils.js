/**
 * Prediction evaluation utilities.
 *
 * Shared by cron-tasks.js (settlement) and fixtures.js (opportunistic settlement).
 * Extracted to avoid circular dependency and keep prediction logic DRY.
 */

/**
 * Build a human-readable string describing the actual match result.
 * e.g. "2-1, 1, O2.5, O1.5, Goal"
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
 * Evaluate a prediction against the actual result.
 *
 * @param {string} prediction - Tipo di pronostico
 * @param {Object} result - { goalsHome, goalsAway }
 * @param {number} totalGoals - Somma gol
 * @param {Object} [extras] - Dati extra per mercati non-goal
 *   extras.corners {number} — corner totali partita (per previsioni Corner)
 *   extras.cards   {number} — cartellini totali partita (per previsioni Cards)
 *
 * Returns 'won', 'lost', null (non valutabile senza extras — cron skippa),
 * o 'void' (tipo non riconosciuto).
 */
function evaluatePrediction(prediction, result, totalGoals, extras) {
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
    default: {
      // Corner predictions: "Corners Over X.5" / "Corners Under X.5"
      const cornersMatch = prediction.match(/^Corners\s+(Over|Under)\s+(\d+(?:\.\d+)?)$/i);
      if (cornersMatch) {
        if (!extras || extras.corners === undefined || extras.corners === null) {
          return null; // Not evaluable via cron — skip (needs fr3-settle-tips skill)
        }
        const threshold = parseFloat(cornersMatch[2]);
        const over = cornersMatch[1].toLowerCase() === 'over';
        return over ? extras.corners > threshold ? 'won' : 'lost'
                    : extras.corners < threshold ? 'won' : 'lost';
      }

      // Card predictions: "Cards Over X.5" / "Cards Under X.5"
      const cardsMatch = prediction.match(/^Cards\s+(Over|Under)\s+(\d+(?:\.\d+)?)$/i);
      if (cardsMatch) {
        if (!extras || extras.cards === undefined || extras.cards === null) {
          return null; // Not evaluable via cron — skip
        }
        const threshold = parseFloat(cardsMatch[2]);
        const over = cardsMatch[1].toLowerCase() === 'over';
        return over ? extras.cards > threshold ? 'won' : 'lost'
                    : extras.cards < threshold ? 'won' : 'lost';
      }

      console.warn('evaluatePrediction: unrecognized prediction format, marking void:', prediction);
      return 'void';
    }
  }
}

module.exports = { buildActualResult, evaluatePrediction };
