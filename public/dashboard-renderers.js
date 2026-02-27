/* exported dashRenderTipsGrid, dashRenderSchedule, dashRenderHistory, dashRenderNotifications, dashBuildBetTrackingUI, dashRenderFantacalcio, dashRenderCentroHub */
/* global LEAGUE_NAMES_MAP, formatMatchDate, buildShareDropdown */
/* eslint no-var: "off" */

/**
 * dashRenderTipsGrid — Renders the daily tips grid.
 *
 * Extracted from dashboard.js renderTipsGrid().
 *
 * @param {HTMLElement} container - The grid container element.
 * @param {Array} tips - Array of tip objects.
 * @param {Object} ctx - Closure dependencies:
 *   { currentLeague, userPrefs, userBetsMap, onExpand(tip), onToggleFollow(tipId, btn), onSaveBet(tipId, stake, notes, btn) }
 */
var dashRenderTipsGrid = function (container, tips, ctx) {
  container.textContent = '';

  // Find tip of the day (highest confidence)
  var tipOfDayId = null;
  var maxConf = 0;
  tips.forEach(function (tip) {
    if (tip.confidence && tip.confidence > maxConf) {
      maxConf = tip.confidence;
      tipOfDayId = tip.id;
    }
  });

  var favoriteTeams = (ctx.userPrefs && ctx.userPrefs.favorite_teams) || [];
  var favSet = new Set(
    favoriteTeams.map(function (t) {
      return t.toLowerCase();
    }),
  );

  var now = new Date();

  tips.forEach(function (tip) {
    var matchStarted = new Date(tip.match_date) < now;
    var isSettled = tip.status === 'won' || tip.status === 'lost' || tip.status === 'void';
    var isPast = matchStarted || isSettled;
    var card = document.createElement('div');
    card.className = 'tip-card tip-card--' + tip.tier;

    // Grey out started/settled matches
    if (isPast) {
      card.classList.add('tip-card--started');
    }
    // Won/lost specific class
    if (isSettled) {
      card.classList.add('tip-card--' + tip.status);
    }

    // Tip of the Day highlight (only for future pending matches)
    if (!isPast && tip.id === tipOfDayId && maxConf > 0) {
      card.classList.add('tip-card--highlighted');
      var todBadge = document.createElement('div');
      todBadge.className = 'tip-of-day-badge';
      todBadge.textContent = 'TIP DEL GIORNO';
      card.appendChild(todBadge);
    }

    // Favorite team highlight
    var homeLC = (tip.home_team || '').toLowerCase();
    var awayLC = (tip.away_team || '').toLowerCase();
    if (favSet.has(homeLC) || favSet.has(awayLC)) {
      card.classList.add('tip-card--favorite');
    }

    var badge =
      tip.tier === 'free'
        ? 'tip-badge--free'
        : tip.tier === 'pro'
          ? 'tip-badge--pro'
          : 'tip-badge--vip';

    // Header
    var header = document.createElement('div');
    header.className = 'tip-card-header';

    var badgeEl = document.createElement('span');
    badgeEl.className = 'tip-badge ' + badge;
    badgeEl.textContent = tip.tier.toUpperCase();
    header.appendChild(badgeEl);

    // League badge (visible in 'all' mode)
    if (ctx.currentLeague === 'all' && tip.league) {
      var leagueBadge = document.createElement('span');
      leagueBadge.className = 'tip-league-badge';
      var leagueInfo = LEAGUE_NAMES_MAP[tip.league];
      leagueBadge.textContent = leagueInfo ? leagueInfo.short : tip.league;
      header.appendChild(leagueBadge);
    }

    // Status label for started/settled matches
    if (isSettled) {
      var statusLabel = document.createElement('span');
      statusLabel.className = 'tip-status-label tip-status-label--' + tip.status;
      statusLabel.textContent =
        tip.status === 'won' ? 'Vinto' : tip.status === 'lost' ? 'Perso' : 'Annullata';
      header.appendChild(statusLabel);
    } else if (matchStarted) {
      var startedLabel = document.createElement('span');
      startedLabel.className = 'tip-started-label';
      startedLabel.textContent = 'In corso';
      header.appendChild(startedLabel);
    }

    var dateEl = document.createElement('span');
    dateEl.className = 'tip-date';
    dateEl.textContent = formatMatchDate(tip.match_date);
    header.appendChild(dateEl);

    card.appendChild(header);

    // Match + result
    var match = document.createElement('div');
    match.className = 'dash-tip-match';

    var homeTeam = document.createElement('span');
    homeTeam.className = 'dash-tip-team';
    homeTeam.textContent = tip.home_team;
    match.appendChild(homeTeam);

    if (tip.result) {
      var scoreEl = document.createElement('span');
      scoreEl.className = 'dash-tip-score';
      scoreEl.textContent = tip.result;
      match.appendChild(scoreEl);
    } else {
      var vs = document.createElement('span');
      vs.className = 'dash-tip-vs';
      vs.textContent = 'vs';
      match.appendChild(vs);
    }

    var awayTeam = document.createElement('span');
    awayTeam.className = 'dash-tip-team';
    awayTeam.textContent = tip.away_team;
    match.appendChild(awayTeam);

    card.appendChild(match);

    // Prediction row
    var predRow = document.createElement('div');
    predRow.className = 'dash-tip-pred';

    var pickGroup = document.createElement('div');
    var pickLabel = document.createElement('span');
    pickLabel.className = 'pick-label';
    pickLabel.textContent = 'PRONOSTICO';
    pickGroup.appendChild(pickLabel);
    var pickValue = document.createElement('span');
    pickValue.className = 'pick-value';
    pickValue.textContent = tip.prediction || '\u2014';
    pickGroup.appendChild(pickValue);
    // Marketing label (Italian name shown below the technical code)
    var marketingName = PREDICTION_LABELS[tip.prediction];
    if (marketingName) {
      var mktLabel = document.createElement('span');
      mktLabel.className = 'pick-label-marketing';
      mktLabel.textContent = marketingName;
      pickGroup.appendChild(mktLabel);
    }
    predRow.appendChild(pickGroup);

    var oddsGroup = document.createElement('div');
    oddsGroup.className = 'dash-tip-odds-group';
    var oddsLabel = document.createElement('span');
    oddsLabel.className = 'odds-label';
    oddsLabel.textContent = 'QUOTA';
    oddsGroup.appendChild(oddsLabel);
    var oddsValue = document.createElement('span');
    oddsValue.className = 'odds-value';
    oddsValue.textContent = tip.odds ? parseFloat(tip.odds).toFixed(2) : '\u2014';
    oddsGroup.appendChild(oddsValue);
    predRow.appendChild(oddsGroup);

    card.appendChild(predRow);

    // Confidence bar
    if (tip.confidence) {
      var confBar = document.createElement('div');
      confBar.className = 'tip-confidence';

      var confLabel = document.createElement('span');
      confLabel.className = 'confidence-label';
      confLabel.textContent = 'Fiducia';
      confBar.appendChild(confLabel);

      var barOuter = document.createElement('div');
      barOuter.className = 'confidence-bar';
      var barFill = document.createElement('div');
      barFill.className = 'confidence-fill';
      barOuter.appendChild(barFill);
      confBar.appendChild(barOuter);

      var confValue = document.createElement('span');
      confValue.className = 'confidence-value';
      confValue.textContent = tip.confidence + '%';
      confBar.appendChild(confValue);

      card.appendChild(confBar);

      requestAnimationFrame(function () {
        barFill.style.width = tip.confidence + '%';
      });
    }

    // Analysis (short preview)
    if (tip.analysis) {
      var analysis = document.createElement('div');
      analysis.className = 'tip-analysis';
      analysis.textContent = tip.analysis;
      card.appendChild(analysis);
    }

    // Expandable details section
    var details = document.createElement('div');
    details.className = 'tip-card-details';
    details.id = 'tipDetails-' + tip.id;

    var detailsInner = document.createElement('div');
    detailsInner.className = 'tip-card-details-inner';

    // Form section placeholder
    var formSection = document.createElement('div');
    formSection.className = 'form-section';
    formSection.id = 'tipForm-' + tip.id;
    detailsInner.appendChild(formSection);

    // H2H section placeholder
    var h2hSection = document.createElement('div');
    h2hSection.className = 'h2h-section';
    h2hSection.id = 'tipH2H-' + tip.id;
    detailsInner.appendChild(h2hSection);

    // Follow/unfollow button
    var isFollowed = !!ctx.userBetsMap[tip.id];
    var followBtn = document.createElement('button');
    followBtn.className = 'bet-follow-btn' + (isFollowed ? ' followed' : '');
    followBtn.textContent = isFollowed ? '\u2605 Seguito' : '\u2606 Segui';
    followBtn.setAttribute('data-tip-id', tip.id);
    followBtn.addEventListener('click', function () {
      ctx.onToggleFollow(tip.id, followBtn);
    });
    detailsInner.appendChild(followBtn);

    // Bet tracking (stake + notes)
    var existingBet = ctx.userBetsMap[tip.id];
    dashBuildBetTrackingUI(detailsInner, tip.id, existingBet, function (tipId, stake, notes, btn) {
      ctx.onSaveBet(tipId, stake, notes, btn);
    });

    details.appendChild(detailsInner);
    card.appendChild(details);

    // Expand button
    var expandBtn = document.createElement('button');
    expandBtn.className = 'tip-card-expand-btn';
    expandBtn.innerHTML = 'Dettagli <span class="chevron">\u25BC</span>';
    expandBtn.addEventListener('click', function () {
      var isOpen = details.classList.contains('open');
      if (!isOpen) {
        details.classList.add('open');
        expandBtn.classList.add('expanded');
        // Lazy load form + H2H
        ctx.onExpand(tip);
      } else {
        details.classList.remove('open');
        expandBtn.classList.remove('expanded');
      }
    });
    card.appendChild(expandBtn);

    // Share button (only for future pending tips)
    if (!isPast) {
      var shareText = '\u26BD ' + tip.home_team + ' vs ' + tip.away_team + '\n';
      shareText += '\uD83C\uDFAF Pronostico: ' + (tip.prediction || '') + '\n';
      shareText +=
        '\uD83D\uDCCA Quota: ' + (tip.odds ? parseFloat(tip.odds).toFixed(2) : '') + '\n';
      shareText += '\uD83D\uDCC5 ' + formatMatchDate(tip.match_date) + '\n';
      shareText += '\nda WinningBet \u2014 winningbet.it';

      card.appendChild(buildShareDropdown({ text: shareText }));
    }

    container.appendChild(card);
  });
};

/**
 * dashRenderSchedule — Renders the betting slips (schedine) grid.
 *
 * Extracted from dashboard.js renderSchedule(). Pure function, no closure deps.
 *
 * @param {HTMLElement} container - The schedine grid container.
 * @param {Array} schedine - Array of schedina objects.
 */
var dashRenderSchedule = function (container, schedine) {
  container.textContent = '';

  var riskMap = { 1: 'sicura', 2: 'equilibrata', 3: 'azzardo' };
  var riskLabels = { 1: 'Sicura', 2: 'Equilibrata', 3: 'Azzardo' };
  var statusLabels = {
    pending: 'In Corso',
    won: 'Vinta',
    lost: 'Persa',
    void: 'Annullata',
  };

  schedine.forEach(function (s) {
    var riskClass = riskMap[s.risk_level] || 'equilibrata';
    var card = document.createElement('div');
    card.className = 'schedina-card schedina-card--' + riskClass;

    // Header
    var header = document.createElement('div');
    header.className = 'schedina-header';

    var riskBadge = document.createElement('span');
    riskBadge.className = 'schedina-risk-badge schedina-risk-badge--' + riskClass;
    riskBadge.textContent = riskLabels[s.risk_level] || s.name;
    header.appendChild(riskBadge);

    if (s.status && s.status !== 'pending') {
      var statusBadge = document.createElement('span');
      statusBadge.className = 'schedina-status-badge schedina-status-badge--' + s.status;
      statusBadge.textContent = statusLabels[s.status] || s.status;
      header.appendChild(statusBadge);
    }

    card.appendChild(header);

    // Name
    var nameEl = document.createElement('div');
    nameEl.className = 'schedina-name';
    nameEl.textContent = s.name || 'Schedina ' + (riskLabels[s.risk_level] || '');
    card.appendChild(nameEl);

    // Stats row
    var stats = document.createElement('div');
    stats.className = 'schedina-stats';

    var oddsEl = document.createElement('div');
    oddsEl.className = 'schedina-stat';
    var oddsLabel = document.createElement('span');
    oddsLabel.className = 'schedina-stat-label';
    oddsLabel.textContent = 'Quota';
    oddsEl.appendChild(oddsLabel);
    var oddsVal = document.createElement('span');
    oddsVal.className = 'schedina-stat-value';
    oddsVal.textContent = parseFloat(s.combined_odds || 0).toFixed(2);
    oddsEl.appendChild(oddsVal);
    stats.appendChild(oddsEl);

    var stakeEl = document.createElement('div');
    stakeEl.className = 'schedina-stat';
    var stakeLabel = document.createElement('span');
    stakeLabel.className = 'schedina-stat-label';
    stakeLabel.textContent = 'Puntata';
    stakeEl.appendChild(stakeLabel);
    var stakeVal = document.createElement('span');
    stakeVal.className = 'schedina-stat-value';
    stakeVal.textContent = parseFloat(s.suggested_stake || 0).toFixed(2) + ' \u20AC';
    stakeEl.appendChild(stakeVal);
    stats.appendChild(stakeEl);

    var returnEl = document.createElement('div');
    returnEl.className = 'schedina-stat';
    var returnLabel = document.createElement('span');
    returnLabel.className = 'schedina-stat-label';
    returnLabel.textContent = 'Potenziale';
    returnEl.appendChild(returnLabel);
    var returnVal = document.createElement('span');
    returnVal.className = 'schedina-stat-value schedina-stat-value--highlight';
    returnVal.textContent = parseFloat(s.expected_return || 0).toFixed(2) + ' \u20AC';
    returnEl.appendChild(returnVal);
    stats.appendChild(returnEl);

    card.appendChild(stats);

    // Confidence bar
    if (s.confidence_avg) {
      var confBar = document.createElement('div');
      confBar.className = 'schedina-confidence';

      var confLabel = document.createElement('span');
      confLabel.className = 'schedina-confidence-label';
      confLabel.textContent = 'Fiducia media';
      confBar.appendChild(confLabel);

      var barOuter = document.createElement('div');
      barOuter.className = 'confidence-bar';
      var barFill = document.createElement('div');
      barFill.className = 'confidence-fill';
      barOuter.appendChild(barFill);
      confBar.appendChild(barOuter);

      var confValue = document.createElement('span');
      confValue.className = 'confidence-value';
      confValue.textContent = Math.round(s.confidence_avg) + '%';
      confBar.appendChild(confValue);

      card.appendChild(confBar);

      requestAnimationFrame(function () {
        barFill.style.width = Math.round(s.confidence_avg) + '%';
      });
    }

    // Strategy
    if (s.strategy) {
      var strategy = document.createElement('div');
      strategy.className = 'schedina-strategy';
      strategy.textContent = s.strategy;
      card.appendChild(strategy);
    }

    // Expandable tips list
    var details = document.createElement('div');
    details.className = 'schedina-details';

    if (s.tips && s.tips.length > 0) {
      var tipsList = document.createElement('div');
      tipsList.className = 'schedina-tips-list';

      s.tips.forEach(function (tip, idx) {
        var tipItem = document.createElement('div');
        tipItem.className = 'schedina-tip-item';

        var num = document.createElement('span');
        num.className = 'schedina-tip-num';
        num.textContent = tip.position || idx + 1;
        tipItem.appendChild(num);

        var tipInfo = document.createElement('div');
        tipInfo.className = 'schedina-tip-info';

        var tipMatch = document.createElement('div');
        tipMatch.className = 'schedina-tip-match';
        tipMatch.textContent = tip.home_team + ' vs ' + tip.away_team;
        tipInfo.appendChild(tipMatch);

        var tipMeta = document.createElement('div');
        tipMeta.className = 'schedina-tip-meta';
        tipMeta.textContent = tip.prediction + ' @ ' + parseFloat(tip.odds || 0).toFixed(2);
        if (tip.league) {
          var leagueTag = document.createElement('span');
          leagueTag.className = 'schedina-tip-league';
          leagueTag.textContent = tip.league;
          tipMeta.appendChild(leagueTag);
        }
        tipInfo.appendChild(tipMeta);

        tipItem.appendChild(tipInfo);

        if (tip.confidence) {
          var tipConf = document.createElement('span');
          tipConf.className = 'schedina-tip-conf';
          tipConf.textContent = tip.confidence + '%';
          tipItem.appendChild(tipConf);
        }

        tipsList.appendChild(tipItem);
      });

      details.appendChild(tipsList);
    }

    card.appendChild(details);

    // Expand button
    var expandBtn = document.createElement('button');
    expandBtn.className = 'schedina-expand-btn';
    expandBtn.textContent = 'Vedi pronostici \u25BC';
    expandBtn.addEventListener('click', function () {
      var isOpen = details.classList.contains('open');
      if (isOpen) {
        details.classList.remove('open');
        expandBtn.classList.remove('expanded');
      } else {
        details.classList.add('open');
        expandBtn.classList.add('expanded');
      }
    });
    card.appendChild(expandBtn);

    container.appendChild(card);
  });
};

/**
 * dashRenderHistory — Renders the history list filtered by status.
 *
 * Extracted from dashboard.js renderHistory().
 *
 * @param {HTMLElement} list - The history list container.
 * @param {HTMLElement} emptyState - The empty state element.
 * @param {Array} allHistory - Full array of history tip objects.
 * @param {string} statusFilter - Filter: 'all', 'won', 'lost', 'void', 'pending', 'favorites'.
 * @param {Object} ctx - Closure dependencies:
 *   { userPrefs, formatDate }
 */
var dashRenderHistory = function (list, emptyState, allHistory, statusFilter, ctx) {
  var filtered;
  if (statusFilter === 'all') {
    filtered = allHistory;
  } else if (statusFilter === 'favorites') {
    var favTeams = (ctx.userPrefs && ctx.userPrefs.favorite_teams) || [];
    var favSet = new Set(
      favTeams.map(function (t) {
        return t.toLowerCase();
      }),
    );
    filtered = allHistory.filter(function (t) {
      return (
        favSet.has((t.home_team || '').toLowerCase()) ||
        favSet.has((t.away_team || '').toLowerCase())
      );
    });
  } else {
    filtered = allHistory.filter(function (t) {
      return t.status === statusFilter;
    });
  }

  if (filtered.length === 0) {
    list.textContent = '';
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';
  list.textContent = '';

  filtered.forEach(function (tip) {
    var item = document.createElement('div');
    item.className = 'dash-history-item';

    var statusEl = document.createElement('span');
    statusEl.className = 'dash-history-status dash-history-status--' + tip.status;
    if (tip.status === 'won') {
      statusEl.textContent = '\u2713';
      statusEl.setAttribute('aria-label', 'Vinto');
    } else if (tip.status === 'lost') {
      statusEl.textContent = '\u2717';
      statusEl.setAttribute('aria-label', 'Perso');
    } else if (tip.status === 'void') {
      statusEl.textContent = '\u2014';
      statusEl.setAttribute('aria-label', 'Annullata');
    } else {
      statusEl.textContent = '\u25CF';
      statusEl.setAttribute('aria-label', 'In corso');
    }
    item.appendChild(statusEl);

    var matchInfo = document.createElement('div');
    matchInfo.className = 'dash-history-match';

    var teams = document.createElement('span');
    teams.className = 'dash-history-teams';
    teams.textContent = tip.home_team + ' vs ' + tip.away_team;
    matchInfo.appendChild(teams);

    var date = document.createElement('span');
    date.className = 'dash-history-date';
    date.textContent = ctx.formatDate(tip.match_date);
    matchInfo.appendChild(date);

    item.appendChild(matchInfo);

    var pred = document.createElement('span');
    pred.className = 'dash-history-pred';
    pred.textContent = tip.prediction || '\u2014';
    item.appendChild(pred);

    var odds = document.createElement('span');
    odds.className = 'dash-history-odds';
    odds.textContent = tip.odds ? parseFloat(tip.odds).toFixed(2) : '\u2014';
    item.appendChild(odds);

    var badgeEl = document.createElement('span');
    badgeEl.className = 'dash-history-badge dash-history-badge--' + tip.status;
    var statusText = {
      won: 'Vinto',
      lost: 'Perso',
      void: 'Annullata',
      pending: 'In Corso',
    };
    badgeEl.textContent = statusText[tip.status] || tip.status;
    item.appendChild(badgeEl);

    list.appendChild(item);
  });
};

/**
 * dashRenderNotifications — Renders the notification dropdown list.
 *
 * Extracted from dashboard.js renderNotificationList().
 *
 * @param {HTMLElement} list - The notification list container.
 * @param {Array} notifications - Array of notification objects.
 * @param {Object} ctx - Closure dependencies:
 *   { onMarkRead(id), formatRelativeTime(iso) }
 */
var dashRenderNotifications = function (list, notifications, ctx) {
  list.textContent = '';

  if (notifications.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'notif-empty';
    empty.textContent = 'Nessuna notifica';
    list.appendChild(empty);
    return;
  }

  notifications.forEach(function (notif) {
    var item = document.createElement('div');
    item.className = 'notif-item' + (notif.read ? '' : ' notif-item--unread');

    var content = document.createElement('div');
    content.className = 'notif-item-content';

    var title = document.createElement('div');
    title.className = 'notif-item-title';
    title.textContent = notif.title;
    content.appendChild(title);

    if (notif.body) {
      var body = document.createElement('div');
      body.className = 'notif-item-body';
      body.textContent = notif.body;
      content.appendChild(body);
    }

    var time = document.createElement('div');
    time.className = 'notif-item-time';
    time.textContent = ctx.formatRelativeTime(notif.created_at);
    content.appendChild(time);

    item.appendChild(content);

    // Mark as read on click
    if (!notif.read) {
      item.addEventListener('click', function () {
        ctx.onMarkRead(notif.id);
        item.classList.remove('notif-item--unread');
      });
    }

    list.appendChild(item);
  });
};

/**
 * dashBuildBetTrackingUI — Builds the bet tracking form (stake + notes + save).
 *
 * Extracted from dashboard.js buildBetTrackingUI().
 *
 * @param {HTMLElement} container - The parent element to append the section to.
 * @param {string} tipId - The tip ID.
 * @param {Object|undefined} existingBet - Existing bet data (stake, notes) or undefined.
 * @param {Function} onSave - Callback: onSave(tipId, stake, notes, btn).
 */
var dashBuildBetTrackingUI = function (container, tipId, existingBet, onSave) {
  var section = document.createElement('div');
  section.className = 'bet-tracking-section';

  var stakeInput = document.createElement('input');
  stakeInput.type = 'number';
  stakeInput.className = 'bet-stake-input';
  stakeInput.placeholder = 'Puntata (\u20AC)';
  stakeInput.min = '0';
  stakeInput.step = '0.5';
  if (existingBet && existingBet.stake) stakeInput.value = existingBet.stake;

  var notesInput = document.createElement('textarea');
  notesInput.className = 'bet-notes-input';
  notesInput.placeholder = 'Note personali...';
  notesInput.rows = 2;
  if (existingBet && existingBet.notes) notesInput.value = existingBet.notes;

  var saveBtn = document.createElement('button');
  saveBtn.className = 'bet-save-btn';
  saveBtn.textContent = 'Salva';
  saveBtn.addEventListener('click', function () {
    onSave(tipId, stakeInput.value, notesInput.value, saveBtn);
  });

  section.appendChild(stakeInput);
  section.appendChild(notesInput);
  section.appendChild(saveBtn);
  container.appendChild(section);
};

// ─── PREDICTION LABELS (marketing names) ───────────────────────────────────

/** Maps technical prediction codes to Italian marketing display names. */
var PREDICTION_LABELS = {
  '1': 'Vittoria Casa',
  'X': 'Pareggio',
  '2': 'Vittoria Ospite',
  '1X': 'No Sconfitta Casa',
  'X2': 'No Sconfitta Ospite',
  '12': 'Nessun Pareggio',
  'Over 2.5': 'Festival dei Gol',
  'Under 2.5': 'Gara Equilibrata',
  'Over 1.5': 'Almeno 2 Gol',
  'Under 3.5': 'Partita Misurata',
  'Goal': 'Entrambe a Segno',
  'No Goal': 'Porta Inviolata',
  '1 + Over 1.5': 'Vittoria con Gol',
  '2 + Over 1.5': 'Rimonta con Gol',
  'Corners Over 8.5': 'Corner Show',
  'Corners Over 9.5': 'Corner Show',
  'Corners Over 10.5': 'Corner Spettacolo',
  'Corners Under 8.5': 'Gara Tattica',
  'Corners Under 9.5': 'Gara Tattica',
  'Cards Over 3.5': 'Partita Nervosa',
  'Cards Over 4.5': 'Gara Bollente',
  'Cards Under 3.5': 'Partita Pulita',
  'Cards Under 4.5': 'Fair Play',
};

// ─── FANTACALCIO HUB RENDERER ───────────────────────────────────────────────

/**
 * dashRenderFantacalcio — Renders the Fantacalcio Hub panel.
 *
 * @param {HTMLElement} container - The #fantacalcioGrid element.
 * @param {Object} data - Response from /api/fantacalcio.
 * @param {Object} ctx - { tier: string, onUpgrade: function(tierName) }
 */
var dashRenderFantacalcio = function (container, data, ctx) {
  container.textContent = '';

  if (!data || data.error) {
    var errP = document.createElement('p');
    errP.className = 'dash-empty-text';
    errP.textContent = 'Impossibile caricare i consigli Fantacalcio.';
    container.appendChild(errP);
    return;
  }

  var onUpgrade = (ctx && ctx.onUpgrade) || function () {};

  // Header
  var header = document.createElement('div');
  header.className = 'fantacalcio-header';
  var title = document.createElement('h2');
  title.className = 'fantacalcio-title';
  title.textContent = '\u26bd Fanta Hub';
  var weekBadge = document.createElement('span');
  weekBadge.className = 'fantacalcio-week-badge';
  weekBadge.textContent = 'Gameweek ' + (data.week || '\u2014');
  header.appendChild(title);
  header.appendChild(weekBadge);
  container.appendChild(header);

  // Section renderer helper
  function renderPickSection(sectionTitle, picks, tierRequired, iconClass) {
    var section = document.createElement('section');
    section.className = 'fantacalcio-section';

    var sectionHeader = document.createElement('h3');
    sectionHeader.className = 'fantacalcio-section-title';
    var icon = document.createElement('span');
    icon.className = iconClass;
    sectionHeader.appendChild(icon);
    sectionHeader.appendChild(document.createTextNode(' ' + sectionTitle));

    var tierBadge = document.createElement('span');
    tierBadge.className = 'tier-badge tier-badge--' + tierRequired;
    tierBadge.textContent = tierRequired.toUpperCase();
    sectionHeader.appendChild(tierBadge);
    section.appendChild(sectionHeader);

    // Upgrade gate
    if (picks && picks.upgrade_required) {
      var gate = document.createElement('div');
      gate.className = 'fantacalcio-upgrade-gate';
      var lockIcon = document.createElement('span');
      lockIcon.textContent = '\ud83d\udd12';
      lockIcon.setAttribute('aria-hidden', 'true');
      var gateText = document.createElement('p');
      gateText.textContent = 'Sblocca con ' + picks.tier_needed.toUpperCase() + ' per accedere.';
      var upgradeBtn = document.createElement('button');
      upgradeBtn.className = 'btn btn-gold';
      upgradeBtn.textContent = 'Upgrade a ' + picks.tier_needed.toUpperCase();
      upgradeBtn.addEventListener('click', function () {
        onUpgrade(picks.tier_needed);
      });
      gate.appendChild(lockIcon);
      gate.appendChild(gateText);
      gate.appendChild(upgradeBtn);
      section.appendChild(gate);
      container.appendChild(section);
      return;
    }

    var list = Array.isArray(picks) ? picks : [];
    if (list.length === 0) {
      var emptyMsg = document.createElement('p');
      emptyMsg.className = 'dash-empty-text';
      emptyMsg.textContent = 'Nessun consiglio disponibile per questa settimana.';
      section.appendChild(emptyMsg);
      container.appendChild(section);
      return;
    }

    var grid = document.createElement('div');
    grid.className = 'fantacalcio-picks-grid';

    list.forEach(function (pick, idx) {
      var card = document.createElement('div');
      card.className = 'fantacalcio-pick-card';

      // Rank badge
      var rank = document.createElement('span');
      rank.className = 'fantacalcio-rank';
      rank.textContent = '#' + (idx + 1);
      card.appendChild(rank);

      // Role badge
      if (pick.role) {
        var roleBadge = document.createElement('span');
        roleBadge.className = 'fantacalcio-role fantacalcio-role--' + pick.role.toLowerCase();
        roleBadge.textContent = pick.role;
        card.appendChild(roleBadge);
      }

      // Player name
      var nameEl = document.createElement('h4');
      nameEl.className = 'fantacalcio-player-name';
      nameEl.textContent = pick.player_name || '\u2014';
      card.appendChild(nameEl);

      // Team
      var teamEl = document.createElement('p');
      teamEl.className = 'fantacalcio-team';
      teamEl.textContent = pick.team_name || '';
      card.appendChild(teamEl);

      // Ownership badge (differentials)
      if (pick.ownership_pct !== null && pick.ownership_pct !== undefined) {
        var own = document.createElement('span');
        own.className = 'fantacalcio-ownership';
        own.textContent = pick.ownership_pct + '% possesso';
        card.appendChild(own);
      }

      // Expected points
      if (pick.expected_points !== null && pick.expected_points !== undefined) {
        var pts = document.createElement('span');
        pts.className = 'fantacalcio-expected-pts';
        pts.textContent = pick.expected_points + ' FM attesi';
        card.appendChild(pts);
      }

      // Confidence bar
      if (pick.confidence !== null && pick.confidence !== undefined) {
        var confWrap = document.createElement('div');
        confWrap.className = 'fantacalcio-conf-wrap';
        var confBar = document.createElement('div');
        confBar.className = 'fantacalcio-conf-bar';
        confBar.style.width = pick.confidence + '%';
        confBar.setAttribute('aria-label', 'Fiducia ' + pick.confidence + '%');
        confWrap.appendChild(confBar);
        card.appendChild(confWrap);
      }

      // Reasoning
      if (pick.reasoning) {
        var reason = document.createElement('p');
        reason.className = 'fantacalcio-reasoning';
        reason.textContent = pick.reasoning;
        card.appendChild(reason);
      }

      grid.appendChild(card);
    });

    section.appendChild(grid);
    container.appendChild(section);
  }

  // Captain section (FREE)
  renderPickSection('Capitano della Settimana', data.captains, 'free', 'fantacalcio-icon-captain');

  // Differentials section (PRO+VIP)
  renderPickSection('Colpi a Sorpresa', data.differentials, 'pro', 'fantacalcio-icon-diff');

  // Transfers section (VIP) — buy + sell
  var transfers = data.transfers;
  if (transfers && transfers.upgrade_required) {
    renderPickSection('Mercato Settimanale', transfers, 'vip', 'fantacalcio-icon-market');
  } else if (transfers) {
    var marketSection = document.createElement('section');
    marketSection.className = 'fantacalcio-section';
    var marketHeader = document.createElement('h3');
    marketHeader.className = 'fantacalcio-section-title';
    marketHeader.textContent = '\ud83d\udcb0 Mercato Settimanale';
    var vipBadge = document.createElement('span');
    vipBadge.className = 'tier-badge tier-badge--vip';
    vipBadge.textContent = 'VIP';
    marketHeader.appendChild(vipBadge);
    marketSection.appendChild(marketHeader);

    var marketGrid = document.createElement('div');
    marketGrid.className = 'fantacalcio-market-grid';

    function renderMarketColumn(label, items, colClass) {
      var col = document.createElement('div');
      col.className = 'fantacalcio-market-col ' + colClass;
      var colTitle = document.createElement('h4');
      colTitle.className = 'fantacalcio-market-col-title';
      colTitle.textContent = label;
      col.appendChild(colTitle);
      (items || []).forEach(function (pick) {
        var item = document.createElement('div');
        item.className = 'fantacalcio-market-item';
        var nameEl = document.createElement('strong');
        nameEl.textContent = pick.player_name;
        item.appendChild(nameEl);
        if (pick.team_name) {
          var teamEl = document.createElement('span');
          teamEl.className = 'fantacalcio-team';
          teamEl.textContent = ' (' + pick.team_name + ')';
          item.appendChild(teamEl);
        }
        if (pick.reasoning) {
          var reason = document.createElement('p');
          reason.className = 'fantacalcio-reasoning';
          reason.textContent = pick.reasoning;
          item.appendChild(reason);
        }
        col.appendChild(item);
      });
      return col;
    }

    marketGrid.appendChild(renderMarketColumn('\ud83d\udfe2 Da Comprare', transfers.buy, 'fantacalcio-market-buy'));
    marketGrid.appendChild(renderMarketColumn('\ud83d\udd34 Da Cedere', transfers.sell, 'fantacalcio-market-sell'));
    marketSection.appendChild(marketGrid);
    container.appendChild(marketSection);
  }
};

/**
 * dashRenderCentroHub — Renders the odds comparison table for B2B partners.
 *
 * @param {HTMLElement} container - The #centroHubGrid element.
 * @param {HTMLElement} emptyEl - The #centroHubEmpty element.
 * @param {Object} data - Response from GET /api/fixtures?type=odds-compare
 *   { league, fixtures: [{ fixtureId, date, home, away, tip, bookmakers, bestOdds }] }
 */
var dashRenderCentroHub = function (container, emptyEl, data) {
  container.textContent = '';

  var fixtures = (data && data.fixtures) || [];
  var withOdds = fixtures.filter(function (f) { return f.bookmakers && f.bookmakers.length > 0; });

  if (withOdds.length === 0) {
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  var COLS = [
    { key: 'home',     label: '1' },
    { key: 'draw',     label: 'X' },
    { key: 'away',     label: '2' },
    { key: 'over25',   label: 'Ov 2.5' },
    { key: 'under25',  label: 'Un 2.5' },
    { key: 'btts_yes', label: 'GG' },
    { key: 'btts_no',  label: 'NG' },
  ];

  withOdds.forEach(function (fixture) {
    var card = document.createElement('div');
    card.className = 'centro-fixture-card';

    // Header: teams + date
    var header = document.createElement('div');
    header.className = 'centro-fixture-header';

    var teams = document.createElement('h3');
    teams.className = 'centro-fixture-teams';
    teams.textContent = fixture.home + ' vs ' + fixture.away;
    header.appendChild(teams);

    var dateEl = document.createElement('span');
    dateEl.className = 'centro-fixture-date';
    var d = new Date(fixture.date);
    dateEl.textContent = d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    header.appendChild(dateEl);

    card.appendChild(header);

    // Tip badge (se presente)
    if (fixture.tip) {
      var tipBadge = document.createElement('div');
      tipBadge.className = 'centro-fixture-tip';
      var tipLabel = document.createElement('span');
      tipLabel.className = 'centro-tip-label';
      tipLabel.textContent = 'WinningBet:';
      var tipValue = document.createElement('span');
      tipValue.className = 'centro-tip-value';
      tipValue.textContent = ' ' + fixture.tip.prediction + (fixture.tip.confidence ? ' (' + fixture.tip.confidence + '%)' : '');
      tipBadge.appendChild(tipLabel);
      tipBadge.appendChild(tipValue);
      card.appendChild(tipBadge);
    }

    // Odds table
    var wrapper = document.createElement('div');
    wrapper.className = 'centro-odds-table-wrapper';

    var table = document.createElement('table');
    table.className = 'centro-odds-table';

    // Thead
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    var thBk = document.createElement('th');
    thBk.textContent = 'Bookmaker';
    thBk.className = 'centro-odds-th';
    headRow.appendChild(thBk);
    COLS.forEach(function (col) {
      var th = document.createElement('th');
      th.textContent = col.label;
      th.className = 'centro-odds-th';
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    // Tbody
    var tbody = document.createElement('tbody');
    fixture.bookmakers.forEach(function (bk) {
      var row = document.createElement('tr');
      var tdName = document.createElement('td');
      tdName.className = 'centro-odds-td centro-odds-td--name';
      tdName.textContent = bk.name;
      row.appendChild(tdName);

      COLS.forEach(function (col) {
        var td = document.createElement('td');
        var val = bk.odds[col.key];
        var best = fixture.bestOdds[col.key];
        if (val === null || val === undefined) {
          td.textContent = '\u2014';
          td.className = 'centro-odds-td centro-odds-td--empty';
        } else {
          td.textContent = parseFloat(val).toFixed(2);
          td.className = 'centro-odds-td' + (best !== null && parseFloat(val) >= parseFloat(best) ? ' centro-odds-best' : '');
        }
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });

    // Best row
    var bestRow = document.createElement('tr');
    bestRow.className = 'centro-odds-best-row';
    var tdBestLabel = document.createElement('td');
    tdBestLabel.className = 'centro-odds-td centro-odds-td--name';
    tdBestLabel.textContent = 'Best';
    bestRow.appendChild(tdBestLabel);
    COLS.forEach(function (col) {
      var td = document.createElement('td');
      var val = fixture.bestOdds[col.key];
      if (val === null || val === undefined) {
        td.textContent = '\u2014';
        td.className = 'centro-odds-td centro-odds-td--empty';
      } else {
        td.textContent = parseFloat(val).toFixed(2);
        td.className = 'centro-odds-td centro-odds-best';
      }
      bestRow.appendChild(td);
    });
    tbody.appendChild(bestRow);

    table.appendChild(tbody);
    wrapper.appendChild(table);
    card.appendChild(wrapper);
    container.appendChild(card);
  });
};
