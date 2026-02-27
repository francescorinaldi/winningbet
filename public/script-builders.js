/* exported createEl, formatResultDate, teamAbbr, buildLockSvg, randomFrom, randomOdd, randomConfidence, canAccessTier, setEmptyState, buildMatchCard, buildResultItem, buildTipResultItem, buildLockedOverlay, buildTipCard, activateConfidenceBars, PREDICTIONS, ANALYSES */
/* global formatMatchDate, TIER_PRICES, TIER_LEVELS, buildShareDropdown */
/* eslint no-var: "off" */

/**
 * Formatta una data ISO in formato DD/MM per i risultati.
 * Esempio: "2025-09-15T18:45:00Z" -> "15/09"
 * @param {string} isoDate - Data in formato ISO 8601
 * @returns {string} Data formattata (giorno/mese)
 */
var formatResultDate = function (isoDate) {
  var d = new Date(isoDate);
  var day = String(d.getDate()).padStart(2, '0');
  var month = String(d.getMonth() + 1).padStart(2, '0');
  return day + '/' + month;
};

/**
 * Utility per creare un elemento DOM con classe e contenuto opzionali.
 * @param {string} tag - Tag HTML (es. "div", "span")
 * @param {string|null} className - Classe CSS (null per nessuna)
 * @param {string|null} textContent - Contenuto testuale (null per vuoto)
 * @returns {HTMLElement} Elemento creato
 */
var createEl = function (tag, className, textContent) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent !== null && textContent !== undefined) el.textContent = textContent;
  return el;
};

/**
 * Costruisce una card partita per la Live Matches Bar.
 * Mostra giorno/ora e nomi delle due squadre.
 * @param {Object} m - Dati partita da /api/matches
 * @param {string} m.date - Data ISO della partita
 * @param {string} m.home - Nome squadra di casa
 * @param {string} m.away - Nome squadra ospite
 * @returns {HTMLElement} Elemento .match-card
 */
var buildMatchCard = function (m) {
  var card = createEl('div', 'match-card');
  card.appendChild(createEl('div', 'match-time', formatMatchDate(m.date)));

  var teams = createEl('div', 'match-teams');
  var homeTeam = createEl('div', 'team');
  homeTeam.appendChild(createEl('span', 'team-name', m.home));
  teams.appendChild(homeTeam);
  teams.appendChild(createEl('span', 'match-vs', 'vs'));
  var awayTeam = createEl('div', 'team');
  awayTeam.appendChild(createEl('span', 'team-name', m.away));
  teams.appendChild(awayTeam);
  card.appendChild(teams);

  return card;
};

/**
 * Costruisce una riga risultato per la sezione Ultimi Risultati.
 * Mostra data, squadre, punteggio e badge Over/Under 2.5.
 * @param {Object} r - Dati risultato da /api/results
 * @param {string} r.date - Data ISO della partita
 * @param {string} r.home - Nome squadra di casa
 * @param {string} r.away - Nome squadra ospite
 * @param {number} r.goalsHome - Gol squadra di casa
 * @param {number} r.goalsAway - Gol squadra ospite
 * @returns {HTMLElement} Elemento .result-item
 */
var buildResultItem = function (r) {
  var item = createEl('div', 'result-item');
  item.appendChild(createEl('span', 'result-date', formatResultDate(r.date)));
  item.appendChild(createEl('span', 'result-match', r.home + ' vs ' + r.away));
  item.appendChild(createEl('span', 'result-score', r.goalsHome + ' - ' + r.goalsAway));

  var totalGoals = (r.goalsHome || 0) + (r.goalsAway || 0);
  var badgeClass =
    totalGoals > 2 ? 'result-badge result-badge--over' : 'result-badge result-badge--under';
  var badgeText = totalGoals > 2 ? 'O 2.5' : 'U 2.5';
  item.appendChild(createEl('span', badgeClass, badgeText));

  return item;
};

/**
 * Costruisce una riga per i tip settati (won/lost) nella sezione Ultimi Risultati.
 * @param {Object} tip - Dati tip dal track record API
 * @param {string} tip.home_team - Nome squadra di casa
 * @param {string} tip.away_team - Nome squadra ospite
 * @param {string} tip.prediction - Previsione (es. "1", "Goal", "Over 2.5")
 * @param {number} tip.odds - Quota
 * @param {string} tip.status - Esito: "won" o "lost"
 * @param {string} tip.match_date - Data ISO della partita
 * @returns {HTMLElement} Elemento .result-item con badge won/lost
 */
var buildTipResultItem = function (tip) {
  var isWin = tip.status === 'won';
  var item = createEl('div', 'result-item ' + (isWin ? 'result-item--win' : 'result-item--loss'));
  item.appendChild(createEl('span', 'result-status', isWin ? '\u2713' : '\u2717'));
  item.appendChild(createEl('span', 'result-date', formatResultDate(tip.match_date)));
  item.appendChild(createEl('span', 'result-match', tip.home_team + ' vs ' + tip.away_team));
  item.appendChild(createEl('span', 'result-pick', tip.prediction));
  item.appendChild(createEl('span', 'result-odds', '@' + Number(tip.odds).toFixed(2)));
  var badgeClass = 'result-badge ' + (isWin ? 'result-badge--win' : 'result-badge--loss');
  item.appendChild(createEl('span', badgeClass, isWin ? 'WIN' : 'LOSS'));
  return item;
};

/**
 * Mostra uno stato vuoto/errore in un container, sostituendo il contenuto.
 * @param {HTMLElement} container - Elemento contenitore
 * @param {string} className - Classe CSS per il messaggio
 * @param {string} message - Testo del messaggio
 */
var setEmptyState = function (container, className, message) {
  container.textContent = '';
  container.appendChild(createEl('div', className, message));
};

/** Pool di previsioni possibili per le tip card */
var PREDICTIONS = [
  'Under 2.5',
  'Over 2.5',
  'Goal',
  'No Goal',
  '1',
  'X',
  '2',
  '1X',
  'X2',
  'Over 1.5',
  'Under 3.5',
  '1 + Over 1.5',
  '2 + Over 1.5',
];

/** Pool di analisi testuali per le tip card FREE */
var ANALYSES = [
  "Negli ultimi 5 scontri diretti, il trend e' chiaro. Difese solide e pochi gol nelle ultime uscite casalinghe.",
  'Entrambe le squadre segnano regolarmente. Media gol combinata superiore a 3 nelle ultime 4 giornate.',
  'La squadra di casa non perde da 8 partite. Rendimento casalingo tra i migliori del campionato.',
  'Valori di Expected Goals molto equilibrati. Match che si preannuncia tattico e bloccato.',
  'Trend marcato nelle ultime 6 giornate. Le statistiche parlano chiaro su questa partita.',
  'Quote in calo da inizio settimana. Il mercato si sta allineando alla nostra analisi.',
];

/**
 * Seleziona un elemento casuale da un array.
 * @param {Array} arr - Array sorgente
 * @returns {*} Elemento casuale
 */
var randomFrom = function (arr) {
  return arr[Math.floor(Math.random() * arr.length)];
};

/**
 * Genera una quota casuale tra 1.30 e 3.50.
 * @returns {string} Quota con 2 decimali (es. "2.15")
 */
var randomOdd = function () {
  return (1.3 + Math.random() * 2.2).toFixed(2);
};

/**
 * Genera un valore di confidence casuale tra 60% e 90%.
 * @returns {number} Valore intero tra 60 e 90
 */
var randomConfidence = function () {
  return 60 + Math.floor(Math.random() * 31); // 60-90
};

/**
 * Abbrevia il nome di una squadra alle prime 3 lettere maiuscole.
 * Usato come placeholder nei cerchi team-logo.
 * @param {string} name - Nome completo della squadra
 * @returns {string} Abbreviazione di 3 caratteri (es. "JUV")
 */
var teamAbbr = function (name) {
  return name.substring(0, 3).toUpperCase();
};

/**
 * Crea un'icona lucchetto SVG per le sezioni bloccate (PRO/VIP).
 * @returns {SVGElement} Elemento SVG del lucchetto
 */
var buildLockSvg = function () {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '3');
  rect.setAttribute('y', '11');
  rect.setAttribute('width', '18');
  rect.setAttribute('height', '11');
  rect.setAttribute('rx', '2');
  rect.setAttribute('ry', '2');
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M7 11V7a5 5 0 0110 0v4');
  svg.appendChild(rect);
  svg.appendChild(path);
  return svg;
};

/**
 * Costruisce l'overlay di blocco con proposta di valore per le tip card.
 * Mostra i benefit concreti del tier + CTA (login o upgrade).
 * @param {string} cardTier - Tier della card ('pro' o 'vip')
 * @param {string|null} userTier - Tier dell'utente (null se non autenticato)
 * @returns {HTMLElement} Elemento .locked-overlay
 */
var buildLockedOverlay = function (cardTier, userTier) {
  var isVipCard = cardTier === 'vip';
  var isAuthenticated = userTier !== null;

  var overlayClass = isVipCard ? 'locked-overlay locked-overlay--gold' : 'locked-overlay';
  var overlay = createEl('div', overlayClass);
  overlay.appendChild(buildLockSvg());

  // Titolo con proposta di valore
  var title = isVipCard ? 'Pronostici VIP Esclusivi' : 'Sblocca i Pronostici PRO';
  overlay.appendChild(createEl('span', 'locked-overlay-title', title));

  // Lista benefit concreti
  var benefits = createEl('ul', 'locked-benefits');
  var benefitItems = isVipCard
    ? [
        'Tips VALUE ad alta quota',
        'Canale Telegram VIP privato',
        'Bankroll management personalizzato',
      ]
    : ['Tutti i tips giornalieri', 'Analisi pre-partita dettagliate', 'Storico completo risultati'];

  benefitItems.forEach(function (text) {
    var li = createEl('li', null, '\u2713 ' + text);
    benefits.appendChild(li);
  });
  overlay.appendChild(benefits);

  // CTA: login se non autenticato, upgrade se autenticato
  if (isAuthenticated) {
    var btn = createEl('a', 'btn btn-gold btn-sm');
    btn.textContent = isVipCard
      ? 'Diventa VIP \u2014 ' + TIER_PRICES.vip.display
      : 'Passa a PRO \u2014 ' + TIER_PRICES.pro.display;
    btn.href = '#pricing';
    overlay.appendChild(btn);
  } else {
    var loginBtn = createEl('a', 'btn btn-gold btn-sm');
    loginBtn.textContent = 'Accedi con Google';
    loginBtn.href = '/auth.html';
    overlay.appendChild(loginBtn);
  }

  return overlay;
};

/**
 * Costruisce una tip card per un singolo pronostico.
 *
 * Modalita':
 *   - Con tip (API): usa dati reali dal database (prediction, odds, analysis, confidence)
 *   - Senza tip (random): genera dati sample per demo/fallback
 *
 * La visibilita' del contenuto dipende dal tier dell'utente (userTier):
 * - canAccessTier = true: tutto visibile (pronostico, quota, analisi)
 * - canAccessTier = false: card grayed out con overlay di blocco e proposta upgrade/login
 * - I tips FREE sono sempre visibili a tutti
 *
 * @param {Object} match - Dati partita { date, home, away }
 * @param {string|Object} tierOrTip - Tier string ('free','pro','vip') for random mode, or tip object from API
 * @param {string|null} userTier - Tier dell'utente (null se non autenticato)
 * @returns {HTMLElement} Elemento .tip-card completo
 */
var buildTipCard = function (match, tierOrTip, userTier) {
  var isApiTip = typeof tierOrTip === 'object' && tierOrTip !== null;
  var tier = isApiTip ? tierOrTip.tier : tierOrTip;
  var tip = isApiTip ? tierOrTip : null;

  var hasAccess = canAccessTier(userTier, tier);
  var isVip = tier === 'vip';
  var cardClass = 'tip-card';
  if (tier === 'pro') cardClass += ' tip-card--pro';
  if (isVip) cardClass += ' tip-card--vip';
  if (!hasAccess) cardClass += ' tip-card--locked';

  var card = createEl('div', cardClass);
  card.setAttribute('data-tier', tier);

  // Glow decorativo per card pro/vip
  if (tier === 'pro') card.appendChild(createEl('div', 'tip-card-glow'));
  if (isVip) card.appendChild(createEl('div', 'tip-card-glow tip-card-glow--gold'));

  // Header: badge tier + data partita
  var header = createEl('div', 'tip-card-header');
  header.appendChild(createEl('span', 'tip-badge tip-badge--' + tier, tier.toUpperCase()));
  header.appendChild(createEl('span', 'tip-date', formatMatchDate(match.date)));
  card.appendChild(header);

  // Squadre con abbreviazione come logo placeholder
  var tipMatch = createEl('div', 'tip-match');
  var homeTeam = createEl('div', 'tip-team');
  homeTeam.appendChild(createEl('div', 'team-logo', teamAbbr(match.home)));
  homeTeam.appendChild(createEl('span', null, match.home));
  tipMatch.appendChild(homeTeam);
  var versus = createEl('div', 'tip-versus');
  versus.appendChild(createEl('span', 'vs-text', 'VS'));
  tipMatch.appendChild(versus);
  var awayTeam = createEl('div', 'tip-team');
  awayTeam.appendChild(createEl('div', 'team-logo', teamAbbr(match.away)));
  awayTeam.appendChild(createEl('span', null, match.away));
  tipMatch.appendChild(awayTeam);
  card.appendChild(tipMatch);

  // Pronostico e quota (nascosti se non si ha accesso)
  var predictionEl = createEl('div', 'tip-prediction');
  var pick = createEl('div', 'tip-pick');
  pick.appendChild(createEl('span', 'pick-label', 'Pronostico'));
  var pickClass = !hasAccess ? 'pick-value tip-value--hidden' : 'pick-value';
  var pickText;
  if (!hasAccess) pickText = '\u2605 \u2605 \u2605';
  else if (tip) pickText = tip.prediction || '\u2014';
  else pickText = randomFrom(PREDICTIONS);
  pick.appendChild(createEl('span', pickClass, pickText));
  predictionEl.appendChild(pick);

  var odds = createEl('div', 'tip-odds');
  odds.appendChild(createEl('span', 'odds-label', 'Quota'));
  var oddsClass = !hasAccess ? 'odds-value tip-value--hidden' : 'odds-value';
  var oddsText;
  if (!hasAccess) oddsText = '?.??';
  else if (tip) oddsText = tip.odds ? parseFloat(tip.odds).toFixed(2) : '\u2014';
  else oddsText = randomOdd();
  odds.appendChild(createEl('span', oddsClass, oddsText));
  predictionEl.appendChild(odds);
  card.appendChild(predictionEl);

  // Barra di confidence con animazione
  var conf = tip ? tip.confidence || 70 : randomConfidence();
  var confDiv = createEl('div', 'tip-confidence');
  confDiv.appendChild(createEl('span', 'confidence-label', 'Confidence'));
  var confBar = createEl('div', 'confidence-bar');
  var confFill = createEl(
    'div',
    isVip ? 'confidence-fill confidence-fill--gold' : 'confidence-fill',
  );
  confFill.setAttribute('data-confidence', conf);
  confBar.appendChild(confFill);
  confDiv.appendChild(confBar);
  confDiv.appendChild(createEl('span', 'confidence-value', conf + '%'));
  card.appendChild(confDiv);

  // Analisi: visibile se ha accesso, altrimenti overlay con benefit + CTA
  var analysisText = tip ? tip.analysis : randomFrom(ANALYSES);
  if (hasAccess && analysisText) {
    var analysis = createEl('div', 'tip-analysis');
    analysis.appendChild(createEl('p', null, analysisText));
    card.appendChild(analysis);
  } else if (!hasAccess) {
    var locked = createEl('div', 'tip-analysis tip-analysis--locked');
    locked.appendChild(buildLockedOverlay(tier, userTier));
    card.appendChild(locked);
  }

  // Share button (only for accessible tips)
  if (hasAccess) {
    var shareText = '\u26BD ' + match.home + ' vs ' + match.away + '\n';
    shareText += '\uD83C\uDFAF Pronostico: ' + pickText + '\n';
    shareText += '\uD83D\uDCCA Quota: ' + oddsText + '\n';
    shareText += '\uD83D\uDCC5 ' + formatMatchDate(match.date) + '\n';
    shareText += '\nda WinningBet \u2014 winningbet.it';

    card.appendChild(buildShareDropdown({ text: shareText }));
  }

  return card;
};

/**
 * Attiva l'IntersectionObserver per le barre di confidence
 * all'interno di un container specifico (usato dopo il rendering
 * dinamico delle tip card).
 * @param {HTMLElement} container - Contenitore con elementi .confidence-fill
 */
var activateConfidenceBars = function (container) {
  var fills = container.querySelectorAll('.confidence-fill');
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var val = entry.target.getAttribute('data-confidence');
          entry.target.style.width = val + '%';
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 },
  );
  fills.forEach(function (el) {
    observer.observe(el);
  });
};

/**
 * Controlla se l'utente puo' accedere al contenuto di un certo tier.
 * I tips FREE sono sempre accessibili a tutti.
 * @param {string|null} userTier - Tier dell'utente (null se non autenticato)
 * @param {string} cardTier - Tier della tip card ('free', 'pro', 'vip')
 * @returns {boolean}
 */
var canAccessTier = function (userTier, cardTier) {
  if (cardTier === 'free') return true;
  var userLevel = userTier ? TIER_LEVELS[userTier] || 0 : -1;
  var cardLevel = TIER_LEVELS[cardTier] || 0;
  return userLevel >= cardLevel;
};
