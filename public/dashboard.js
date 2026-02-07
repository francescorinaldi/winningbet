/**
 * Dashboard — WinningBet
 *
 * Area personale utente. Richiede autenticazione.
 * Gestisce: tips giornalieri, storico pronostici, account e abbonamento.
 * Phase 1-3: league selector, expandable cards, tip of day, PTR,
 *   countdown, preferences, team form, H2H, favorites, streaks,
 *   user bets, notifications.
 *
 * Dipendenze:
 *   - supabase-config.js (SupabaseConfig globale)
 *   - Supabase CDN (@supabase/supabase-js)
 */

(function () {
  'use strict';

  // ==========================================
  // MOBILE MENU
  // ==========================================
  const hamburgerBtn = document.getElementById('hamburger');
  const navLinksEl = document.getElementById('navLinks');
  if (hamburgerBtn && navLinksEl) {
    hamburgerBtn.addEventListener('click', function () {
      hamburgerBtn.classList.toggle('active');
      navLinksEl.classList.toggle('open');
      document.body.style.overflow = navLinksEl.classList.contains('open') ? 'hidden' : '';
    });
    navLinksEl.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        hamburgerBtn.classList.remove('active');
        navLinksEl.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  let session = null;
  let profile = null;
  let allHistory = [];
  let userPrefs = null;
  let userBetsMap = {};
  let countdownInterval = null;
  let currentLeague = localStorage.getItem('wb_dashboard_league') || 'serie-a';

  // ─── INIT ───────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    checkAuth();
    setupTabs();
    setupHistoryFilters();
    setupLeagueSelector();
    setupLogout();
    handleCheckoutFeedback();
    setupPullToRefresh();
    setupNotifications();
    setupTeamSearch();
    setupPreferenceToggles();
  });

  /**
   * Verifica autenticazione. Redirect a /auth.html se non loggato.
   */
  async function checkAuth() {
    const result = await SupabaseConfig.getSession();
    session = result.data.session;

    if (!session) {
      window.location.href = '/auth.html';
      return;
    }

    loadProfile();
    loadTodayTips();
    loadHistory();
    loadActivity();
    loadNotifications();
    loadPreferences();
    loadUserBets();
  }

  // ─── PROFILE ────────────────────────────────────────────

  /**
   * Carica il profilo utente da Supabase e aggiorna la UI.
   */
  async function loadProfile() {
    const user = session.user;

    const result = await SupabaseConfig.client
      .from('profiles')
      .select('display_name, tier, stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    profile = result.data;

    const meta = user.user_metadata || {};
    const authName = meta.display_name || meta.full_name || meta.name || '';
    const profileName = (profile && profile.display_name) || '';
    const emailPrefix = user.email.split('@')[0];

    const rawName = authName || profileName || emailPrefix;
    const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    document.getElementById('userName').textContent = displayName;

    if (authName && profile && profile.display_name !== authName) {
      SupabaseConfig.client
        .from('profiles')
        .update({ display_name: authName })
        .eq('user_id', user.id)
        .then();
    }

    const tier = (profile && profile.tier) || 'free';
    const tierLabel = document.getElementById('tierLabel');
    const tierBadge = document.getElementById('tierBadge');
    tierLabel.textContent = tier.toUpperCase();
    tierBadge.className = 'dash-tier-badge dash-tier-badge--' + tier;

    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userDisplayName').textContent = displayName;
    document.getElementById('userSince').textContent = formatDate(user.created_at);

    updateSubscriptionUI(tier);
    loadTelegramStatus();

    // Show notification bell for authenticated users
    const notifBell = document.getElementById('notifBell');
    if (notifBell) notifBell.style.display = '';
  }

  /**
   * Aggiorna la sezione abbonamento in base al tier.
   */
  async function updateSubscriptionUI(tier) {
    const subTier = document.getElementById('subTier');
    const subStatus = document.getElementById('subStatus');
    const upgradeBtn = document.getElementById('upgradeBtn');
    const manageSubBtn = document.getElementById('manageSubBtn');
    const renewalRow = document.getElementById('subRenewalRow');
    const subRenewal = document.getElementById('subRenewal');

    if (tier === 'free') {
      subTier.textContent = 'Free';
      subStatus.textContent = 'Gratuito';
      upgradeBtn.style.display = '';
      upgradeBtn.textContent = 'Passa a PRO';
      upgradeBtn.onclick = function () {
        startCheckout('pro');
      };
      manageSubBtn.style.display = 'none';
      renewalRow.style.display = 'none';
      return;
    }

    subTier.textContent =
      tier === 'pro' ? 'PRO \u2014 \u20AC9.99/mese' : 'VIP \u2014 \u20AC29.99/mese';

    const subResult = await SupabaseConfig.client
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', session.user.id)
      .eq('status', 'active')
      .order('current_period_end', { ascending: false })
      .limit(1)
      .single();

    if (subResult.data) {
      subStatus.textContent = 'Attivo';
      subStatus.className = 'dash-sub-value dash-sub-value--active';
      renewalRow.style.display = '';
      subRenewal.textContent = formatDate(subResult.data.current_period_end);
    } else {
      subStatus.textContent = 'Non attivo';
    }

    if (tier === 'pro') {
      upgradeBtn.textContent = 'Passa a VIP';
      upgradeBtn.style.display = '';
      upgradeBtn.onclick = function () {
        startCheckout('vip');
      };
    } else {
      upgradeBtn.style.display = 'none';
    }

    if (profile && profile.stripe_customer_id) {
      manageSubBtn.style.display = '';
      manageSubBtn.onclick = openCustomerPortal;
    }
  }

  /**
   * Avvia il checkout Stripe per un piano.
   */
  async function startCheckout(tier) {
    const btn = document.getElementById('upgradeBtn');
    btn.disabled = true;
    btn.textContent = 'Caricamento...';

    try {
      const response = await fetch('/api/billing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ action: 'checkout', tier: tier }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        showAlert('Errore nella creazione del pagamento. Riprova.', 'error');
        btn.disabled = false;
        btn.textContent = tier === 'pro' ? 'Passa a PRO' : 'Passa a VIP';
      }
    } catch (_err) {
      showAlert('Errore di rete. Riprova.', 'error');
      btn.disabled = false;
      btn.textContent = tier === 'pro' ? 'Passa a PRO' : 'Passa a VIP';
    }
  }

  /**
   * Apre il Stripe Customer Portal.
   */
  async function openCustomerPortal() {
    const btn = document.getElementById('manageSubBtn');
    btn.disabled = true;
    btn.textContent = 'Apertura...';

    try {
      const response = await fetch('/api/billing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ action: 'portal' }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        showAlert("Errore nell'apertura del portale. Riprova.", 'error');
      }
    } catch (_err) {
      showAlert('Errore di rete. Riprova.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Gestisci Abbonamento';
    }
  }

  // ─── TODAY'S TIPS ───────────────────────────────────────

  /**
   * Carica i tips di oggi dall'API.
   */
  async function loadTodayTips() {
    const grid = document.getElementById('dashTipsGrid');
    const emptyState = document.getElementById('dashTipsEmpty');

    try {
      const tipLimit = currentLeague === 'all' ? 50 : 20;
      const response = await fetch(
        '/api/tips?status=pending&limit=' + tipLimit + '&league=' + encodeURIComponent(currentLeague),
        { headers: { Authorization: 'Bearer ' + session.access_token } },
      );

      const tips = await response.json();

      if (!Array.isArray(tips) || tips.length === 0) {
        grid.textContent = '';
        emptyState.style.display = '';
        startCountdown();
        return;
      }

      emptyState.style.display = 'none';
      stopCountdown();

      // Sort: future matches first (ascending), then started matches at the bottom
      const now = new Date();
      tips.sort(function (a, b) {
        const aStarted = new Date(a.match_date) < now;
        const bStarted = new Date(b.match_date) < now;
        if (aStarted !== bStarted) return aStarted ? 1 : -1;
        // Within same group: future ascending, started descending
        if (aStarted) return new Date(b.match_date) - new Date(a.match_date);
        return new Date(a.match_date) - new Date(b.match_date);
      });

      renderTipsGrid(grid, tips);
    } catch (_err) {
      grid.textContent = '';
      emptyState.style.display = '';
      startCountdown();
    }
  }

  /**
   * Renderizza la griglia di tips nel container.
   * Include: Tip del Giorno, expandable cards, favorite highlight, follow button.
   */
  function renderTipsGrid(container, tips) {
    container.textContent = '';

    // Find tip of the day (highest confidence)
    let tipOfDayId = null;
    let maxConf = 0;
    tips.forEach(function (tip) {
      if (tip.confidence && tip.confidence > maxConf) {
        maxConf = tip.confidence;
        tipOfDayId = tip.id;
      }
    });

    const favoriteTeams = (userPrefs && userPrefs.favorite_teams) || [];
    const favSet = new Set(
      favoriteTeams.map(function (t) {
        return t.toLowerCase();
      }),
    );

    const now = new Date();
    // League display names for 'all' view
    const leagueNames = {
      'serie-a': 'Serie A',
      'champions-league': 'UCL',
      'la-liga': 'La Liga',
      'premier-league': 'PL',
    };

    tips.forEach(function (tip) {
      const matchStarted = new Date(tip.match_date) < now;
      const card = document.createElement('div');
      card.className = 'tip-card tip-card--' + tip.tier;

      // Grey out started/past matches
      if (matchStarted) {
        card.classList.add('tip-card--started');
      }

      // Tip of the Day highlight (only for future matches)
      if (!matchStarted && tip.id === tipOfDayId && maxConf > 0) {
        card.classList.add('tip-card--highlighted');
        const todBadge = document.createElement('div');
        todBadge.className = 'tip-of-day-badge';
        todBadge.textContent = 'TIP DEL GIORNO';
        card.appendChild(todBadge);
      }

      // Favorite team highlight
      const homeLC = (tip.home_team || '').toLowerCase();
      const awayLC = (tip.away_team || '').toLowerCase();
      if (favSet.has(homeLC) || favSet.has(awayLC)) {
        card.classList.add('tip-card--favorite');
      }

      const badge =
        tip.tier === 'free'
          ? 'tip-badge--free'
          : tip.tier === 'pro'
            ? 'tip-badge--pro'
            : 'tip-badge--vip';

      // Header
      const header = document.createElement('div');
      header.className = 'tip-card-header';

      const badgeEl = document.createElement('span');
      badgeEl.className = 'tip-badge ' + badge;
      badgeEl.textContent = tip.tier.toUpperCase();
      header.appendChild(badgeEl);

      // League badge (visible in 'all' mode)
      if (currentLeague === 'all' && tip.league) {
        const leagueBadge = document.createElement('span');
        leagueBadge.className = 'tip-league-badge';
        leagueBadge.textContent = leagueNames[tip.league] || tip.league;
        header.appendChild(leagueBadge);
      }

      // Started label
      if (matchStarted) {
        const startedLabel = document.createElement('span');
        startedLabel.className = 'tip-started-label';
        startedLabel.textContent = 'Iniziata';
        header.appendChild(startedLabel);
      }

      const dateEl = document.createElement('span');
      dateEl.className = 'tip-date';
      dateEl.textContent = formatMatchDate(tip.match_date);
      header.appendChild(dateEl);

      card.appendChild(header);

      // Match
      const match = document.createElement('div');
      match.className = 'dash-tip-match';

      const homeTeam = document.createElement('span');
      homeTeam.className = 'dash-tip-team';
      homeTeam.textContent = tip.home_team;
      match.appendChild(homeTeam);

      const vs = document.createElement('span');
      vs.className = 'dash-tip-vs';
      vs.textContent = 'vs';
      match.appendChild(vs);

      const awayTeam = document.createElement('span');
      awayTeam.className = 'dash-tip-team';
      awayTeam.textContent = tip.away_team;
      match.appendChild(awayTeam);

      card.appendChild(match);

      // Prediction row
      const predRow = document.createElement('div');
      predRow.className = 'dash-tip-pred';

      const pickGroup = document.createElement('div');
      const pickLabel = document.createElement('span');
      pickLabel.className = 'pick-label';
      pickLabel.textContent = 'PRONOSTICO';
      pickGroup.appendChild(pickLabel);
      const pickValue = document.createElement('span');
      pickValue.className = 'pick-value';
      pickValue.textContent = tip.prediction || '\u2014';
      pickGroup.appendChild(pickValue);
      predRow.appendChild(pickGroup);

      const oddsGroup = document.createElement('div');
      oddsGroup.className = 'dash-tip-odds-group';
      const oddsLabel = document.createElement('span');
      oddsLabel.className = 'odds-label';
      oddsLabel.textContent = 'QUOTA';
      oddsGroup.appendChild(oddsLabel);
      const oddsValue = document.createElement('span');
      oddsValue.className = 'odds-value';
      oddsValue.textContent = tip.odds ? parseFloat(tip.odds).toFixed(2) : '\u2014';
      oddsGroup.appendChild(oddsValue);
      predRow.appendChild(oddsGroup);

      card.appendChild(predRow);

      // Confidence bar
      if (tip.confidence) {
        const confBar = document.createElement('div');
        confBar.className = 'tip-confidence';

        const confLabel = document.createElement('span');
        confLabel.className = 'confidence-label';
        confLabel.textContent = 'Fiducia';
        confBar.appendChild(confLabel);

        const barOuter = document.createElement('div');
        barOuter.className = 'confidence-bar';
        const barFill = document.createElement('div');
        barFill.className = 'confidence-fill';
        barOuter.appendChild(barFill);
        confBar.appendChild(barOuter);

        const confValue = document.createElement('span');
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
        const analysis = document.createElement('div');
        analysis.className = 'tip-analysis';
        analysis.textContent = tip.analysis;
        card.appendChild(analysis);
      }

      // Expandable details section
      const details = document.createElement('div');
      details.className = 'tip-card-details';
      details.id = 'tipDetails-' + tip.id;

      const detailsInner = document.createElement('div');
      detailsInner.className = 'tip-card-details-inner';

      // Form section placeholder
      const formSection = document.createElement('div');
      formSection.className = 'form-section';
      formSection.id = 'tipForm-' + tip.id;
      detailsInner.appendChild(formSection);

      // H2H section placeholder
      const h2hSection = document.createElement('div');
      h2hSection.className = 'h2h-section';
      h2hSection.id = 'tipH2H-' + tip.id;
      detailsInner.appendChild(h2hSection);

      // Follow/unfollow button
      const isFollowed = !!userBetsMap[tip.id];
      const followBtn = document.createElement('button');
      followBtn.className = 'bet-follow-btn' + (isFollowed ? ' followed' : '');
      followBtn.textContent = isFollowed ? '\u2605 Seguito' : '\u2606 Segui';
      followBtn.setAttribute('data-tip-id', tip.id);
      followBtn.addEventListener('click', function () {
        toggleFollowTip(tip.id, followBtn);
      });
      detailsInner.appendChild(followBtn);

      details.appendChild(detailsInner);
      card.appendChild(details);

      // Expand button
      const expandBtn = document.createElement('button');
      expandBtn.className = 'tip-card-expand-btn';
      expandBtn.innerHTML = 'Dettagli <span class="chevron">\u25BC</span>';
      expandBtn.addEventListener('click', function () {
        const isOpen = details.classList.contains('open');
        if (!isOpen) {
          details.classList.add('open');
          expandBtn.classList.add('expanded');
          // Lazy load form + H2H
          loadTipDetails(tip);
        } else {
          details.classList.remove('open');
          expandBtn.classList.remove('expanded');
        }
      });
      card.appendChild(expandBtn);

      container.appendChild(card);
    });
  }

  /**
   * Lazy load form and H2H data for an expanded tip card.
   */
  function loadTipDetails(tip) {
    const formEl = document.getElementById('tipForm-' + tip.id);
    const h2hEl = document.getElementById('tipH2H-' + tip.id);

    // Only load if not already loaded
    if (formEl && !formEl.hasAttribute('data-loaded')) {
      formEl.setAttribute('data-loaded', '1');
      loadTeamForm(formEl, tip.home_team, tip.away_team, tip.league || currentLeague);
    }
    if (h2hEl && !h2hEl.hasAttribute('data-loaded')) {
      h2hEl.setAttribute('data-loaded', '1');
      loadH2H(h2hEl, tip.home_team, tip.away_team, tip.league || currentLeague);
    }
  }

  /**
   * Load and render team form dots (last 5 results: W/D/L).
   */
  async function loadTeamForm(container, homeTeam, awayTeam, league) {
    try {
      const response = await fetch(
        '/api/match-insights?type=form&teams=' +
          encodeURIComponent(homeTeam + ',' + awayTeam) +
          '&league=' +
          encodeURIComponent(league),
      );
      const data = await response.json();
      if (!data || typeof data !== 'object') return;

      container.textContent = '';

      [homeTeam, awayTeam].forEach(function (teamName) {
        const teamData = data[teamName];
        if (!teamData || !teamData.form) return;

        const row = document.createElement('div');
        row.className = 'form-team-row';

        const name = document.createElement('span');
        name.className = 'form-team-name';
        name.textContent = teamName;
        row.appendChild(name);

        const dots = document.createElement('div');
        dots.className = 'form-dots';

        teamData.form.split('').forEach(function (ch) {
          const dot = document.createElement('span');
          dot.className = 'form-dot form-dot--' + ch;
          dot.textContent = ch;
          dots.appendChild(dot);
        });

        row.appendChild(dots);
        container.appendChild(row);
      });
    } catch (_err) {
      // Silenzioso
    }
  }

  /**
   * Load and render H2H bar chart.
   */
  async function loadH2H(container, homeTeam, awayTeam, league) {
    try {
      const response = await fetch(
        '/api/match-insights?type=h2h&home=' +
          encodeURIComponent(homeTeam) +
          '&away=' +
          encodeURIComponent(awayTeam) +
          '&league=' +
          encodeURIComponent(league),
      );
      const data = await response.json();
      if (!data || data.total === 0) return;

      container.textContent = '';

      const label = document.createElement('div');
      label.className = 'h2h-label';
      label.textContent = 'Scontri diretti (ultimi ' + data.total + ')';
      container.appendChild(label);

      // Bar
      const barContainer = document.createElement('div');
      barContainer.className = 'h2h-bar-container';

      const bar = document.createElement('div');
      bar.className = 'h2h-bar';

      const total = data.total || 1;
      const homePct = Math.round((data.home.wins / total) * 100);
      const drawPct = Math.round((data.draws / total) * 100);
      const awayPct = 100 - homePct - drawPct;

      const homeBar = document.createElement('div');
      homeBar.className = 'h2h-bar-home';
      homeBar.style.width = homePct + '%';
      bar.appendChild(homeBar);

      const drawBar = document.createElement('div');
      drawBar.className = 'h2h-bar-draw';
      drawBar.style.width = drawPct + '%';
      bar.appendChild(drawBar);

      const awayBar = document.createElement('div');
      awayBar.className = 'h2h-bar-away';
      awayBar.style.width = awayPct + '%';
      bar.appendChild(awayBar);

      barContainer.appendChild(bar);
      container.appendChild(barContainer);

      // Stats row
      const stats = document.createElement('div');
      stats.className = 'h2h-stats';

      const homeStat = document.createElement('div');
      homeStat.className = 'h2h-stat';
      const homeVal = document.createElement('span');
      homeVal.className = 'h2h-stat-value';
      homeVal.textContent = data.home.wins;
      homeStat.appendChild(homeVal);
      const homeLabel = document.createElement('span');
      homeLabel.textContent = data.home.name;
      homeStat.appendChild(homeLabel);
      stats.appendChild(homeStat);

      const drawStat = document.createElement('div');
      drawStat.className = 'h2h-stat';
      const drawVal = document.createElement('span');
      drawVal.className = 'h2h-stat-value';
      drawVal.textContent = data.draws;
      drawStat.appendChild(drawVal);
      const drawLabel = document.createElement('span');
      drawLabel.textContent = 'Pareggi';
      drawStat.appendChild(drawLabel);
      stats.appendChild(drawStat);

      const awayStat = document.createElement('div');
      awayStat.className = 'h2h-stat';
      const awayVal = document.createElement('span');
      awayVal.className = 'h2h-stat-value';
      awayVal.textContent = data.away.wins;
      awayStat.appendChild(awayVal);
      const awayLabel = document.createElement('span');
      awayLabel.textContent = data.away.name;
      awayStat.appendChild(awayLabel);
      stats.appendChild(awayStat);

      container.appendChild(stats);
    } catch (_err) {
      // Silenzioso
    }
  }

  // ─── HISTORY ────────────────────────────────────────────

  /**
   * Carica lo storico completo dei tips.
   */
  async function loadHistory() {
    try {
      const hdrs = { Authorization: 'Bearer ' + session.access_token };
      let results = [];

      const statuses = ['won', 'lost', 'void', 'pending'];
      const leagueParam = '&league=' + encodeURIComponent(currentLeague);
      const promises = statuses.map(function (s) {
        return fetch('/api/tips?status=' + s + '&limit=50' + leagueParam, {
          headers: hdrs,
        }).then(function (r) {
          return r.json();
        });
      });

      const responses = await Promise.all(promises);
      responses.forEach(function (data) {
        if (Array.isArray(data)) {
          results = results.concat(data);
        }
      });

      // Filtra ultimi 7 giorni, max 20 risultati
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      allHistory = results
        .filter(function (tip) {
          return new Date(tip.match_date) >= sevenDaysAgo;
        })
        .sort(function (a, b) {
          return new Date(b.match_date) - new Date(a.match_date);
        })
        .slice(0, 20);

      renderHistory('all');
      loadDashboardChart();
    } catch (_err) {
      document.getElementById('dashHistoryEmpty').style.display = '';
    }
  }

  /**
   * Renderizza lo storico filtrato per status.
   * "favorites" filter shows only tips matching favorite teams.
   */
  function renderHistory(statusFilter) {
    const list = document.getElementById('dashHistoryList');
    const emptyState = document.getElementById('dashHistoryEmpty');

    let filtered;
    if (statusFilter === 'all') {
      filtered = allHistory;
    } else if (statusFilter === 'favorites') {
      const favTeams = (userPrefs && userPrefs.favorite_teams) || [];
      const favSet = new Set(
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
      const item = document.createElement('div');
      item.className = 'dash-history-item';

      const statusEl = document.createElement('span');
      statusEl.className = 'dash-history-status dash-history-status--' + tip.status;
      if (tip.status === 'won') statusEl.textContent = '\u2713';
      else if (tip.status === 'lost') statusEl.textContent = '\u2717';
      else if (tip.status === 'void') statusEl.textContent = '\u2014';
      else statusEl.textContent = '\u25CF';
      item.appendChild(statusEl);

      const matchInfo = document.createElement('div');
      matchInfo.className = 'dash-history-match';

      const teams = document.createElement('span');
      teams.className = 'dash-history-teams';
      teams.textContent = tip.home_team + ' vs ' + tip.away_team;
      matchInfo.appendChild(teams);

      const date = document.createElement('span');
      date.className = 'dash-history-date';
      date.textContent = formatDate(tip.match_date);
      matchInfo.appendChild(date);

      item.appendChild(matchInfo);

      const pred = document.createElement('span');
      pred.className = 'dash-history-pred';
      pred.textContent = tip.prediction || '\u2014';
      item.appendChild(pred);

      const odds = document.createElement('span');
      odds.className = 'dash-history-odds';
      odds.textContent = tip.odds ? parseFloat(tip.odds).toFixed(2) : '\u2014';
      item.appendChild(odds);

      const badgeEl = document.createElement('span');
      badgeEl.className = 'dash-history-badge dash-history-badge--' + tip.status;
      const statusText = {
        won: 'Vinto',
        lost: 'Perso',
        void: 'Void',
        pending: 'In Corso',
      };
      badgeEl.textContent = statusText[tip.status] || tip.status;
      item.appendChild(badgeEl);

      list.appendChild(item);
    });
  }

  /**
   * Load and render profit chart in History tab.
   */
  async function loadDashboardChart() {
    const chartContainer = document.getElementById('dashChartContainer');
    const chartEl = document.getElementById('dashChart');
    if (!chartContainer || !chartEl) return;

    try {
      const response = await fetch('/api/stats?type=track-record');
      const data = await response.json();
      if (!data || !data.monthly || data.monthly.length === 0) return;

      chartContainer.style.display = '';
      chartEl.textContent = '';

      const monthly = data.monthly;
      const maxProfit = Math.max.apply(
        null,
        monthly.map(function (x) {
          return Math.abs(x.profit);
        }),
      );

      monthly.forEach(function (m) {
        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        const normalizedValue =
          maxProfit > 0 ? Math.round((Math.abs(m.profit) / maxProfit) * 140) : 0;
        bar.setAttribute('data-value', normalizedValue);
        bar.setAttribute('data-label', m.label);

        const fill = document.createElement('div');
        fill.className = 'chart-fill';
        bar.appendChild(fill);

        const amount = document.createElement('span');
        amount.className = 'chart-amount';
        amount.textContent = (m.profit >= 0 ? '+' : '') + m.profit + '\u20AC';
        bar.appendChild(amount);

        chartEl.appendChild(bar);
      });

      // Animate bars
      const bars = chartEl.querySelectorAll('.chart-bar');
      if (bars.length > 0) {
        const chartObs = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                const allBars = entry.target.closest('.chart').querySelectorAll('.chart-bar');
                allBars.forEach(function (b, index) {
                  setTimeout(function () {
                    const val = b.getAttribute('data-value');
                    const f = b.querySelector('.chart-fill');
                    f.style.height = (val / 140) * 100 + '%';
                    b.classList.add('animated');
                  }, index * 150);
                });
                chartObs.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.3 },
        );
        chartObs.observe(bars[0]);
      }
    } catch (_err) {
      // Silenzioso
    }
  }

  // ─── TABS ───────────────────────────────────────────────

  function setupTabs() {
    const tabs = document.querySelectorAll('.dash-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) {
          t.classList.remove('active');
        });
        tab.classList.add('active');

        const target = tab.getAttribute('data-tab');
        document.getElementById('panelTips').style.display = target === 'tips' ? '' : 'none';
        document.getElementById('panelHistory').style.display = target === 'history' ? '' : 'none';
        document.getElementById('panelAccount').style.display = target === 'account' ? '' : 'none';
      });
    });
  }

  function setupHistoryFilters() {
    const container = document.querySelector('.dash-history-filters');
    if (!container) return;

    container.addEventListener('click', function (e) {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;

      container.querySelectorAll('.filter-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      renderHistory(btn.getAttribute('data-status'));
    });
  }

  // ─── LEAGUE SELECTOR ───────────────────────────────

  function setupLeagueSelector() {
    const selector = document.getElementById('dashLeagueSelector');
    if (!selector) return;

    const buttons = selector.querySelectorAll('.league-btn');
    buttons.forEach(function (btn) {
      btn.classList.remove('active');
      if (btn.getAttribute('data-league') === currentLeague) {
        btn.classList.add('active');
      }
    });

    selector.addEventListener('click', function (e) {
      const btn = e.target.closest('.league-btn');
      if (!btn) return;

      const league = btn.getAttribute('data-league');
      if (league === currentLeague) return;

      buttons.forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      currentLeague = league;
      localStorage.setItem('wb_dashboard_league', league);

      loadTodayTips();
      loadHistory();
    });
  }

  // ─── COUNTDOWN ──────────────────────────────────────

  function startCountdown() {
    const el = document.getElementById('tipsCountdown');
    const valEl = document.getElementById('countdownValue');
    if (!el || !valEl) return;

    stopCountdown();
    el.style.display = '';

    // Fetch next match to determine when tips will come
    fetch('/api/fixtures?type=matches&league=' + encodeURIComponent(currentLeague) + '&limit=1')
      .then(function (r) {
        return r.json();
      })
      .then(function (matches) {
        if (!Array.isArray(matches) || matches.length === 0) {
          valEl.textContent = '--:--';
          return;
        }
        const nextDate = new Date(matches[0].date);
        updateCountdownDisplay(valEl, nextDate);

        countdownInterval = setInterval(function () {
          updateCountdownDisplay(valEl, nextDate);
        }, 60000);
      })
      .catch(function () {
        valEl.textContent = '--:--';
      });
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    const el = document.getElementById('tipsCountdown');
    if (el) el.style.display = 'none';
  }

  function updateCountdownDisplay(el, targetDate) {
    const now = new Date();
    const diff = targetDate - now;
    if (diff <= 0) {
      el.textContent = 'A breve!';
      return;
    }
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    el.textContent = hours + 'h ' + (mins < 10 ? '0' : '') + mins + 'm';
  }

  // ─── PULL TO REFRESH ────────────────────────────────

  function setupPullToRefresh() {
    if (window.innerWidth > 768) return;

    const main = document.querySelector('.dash-main');
    const ptr = document.getElementById('ptrIndicator');
    if (!main || !ptr) return;

    let startY = 0;
    let pulling = false;

    main.addEventListener(
      'touchstart',
      function (e) {
        if (window.scrollY === 0) {
          startY = e.touches[0].clientY;
          pulling = true;
        }
      },
      { passive: true },
    );

    main.addEventListener(
      'touchmove',
      function (e) {
        if (!pulling) return;
        const diff = e.touches[0].clientY - startY;
        if (diff > 10 && diff < 100) {
          ptr.style.height = Math.min(diff, 60) + 'px';
        }
      },
      { passive: true },
    );

    main.addEventListener('touchend', function () {
      if (!pulling) return;
      pulling = false;

      const currentHeight = parseInt(ptr.style.height) || 0;
      if (currentHeight >= 60) {
        ptr.classList.add('active');
        // Reload data
        Promise.all([loadTodayTips(), loadHistory()]).then(function () {
          ptr.classList.remove('active');
          ptr.style.height = '0';
        });
      } else {
        ptr.style.height = '0';
      }
    });
  }

  // ─── ACTIVITY / STREAK ──────────────────────────────

  async function loadActivity() {
    if (!session) return;

    try {
      // POST to register today's visit
      const postRes = await fetch('/api/user-settings?resource=activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
      });
      const data = await postRes.json();

      const streakDisplay = document.getElementById('streakDisplay');
      const streakCount = document.getElementById('streakCount');
      if (!streakDisplay || !streakCount) return;

      if (data.current_streak && data.current_streak > 0) {
        streakDisplay.style.display = '';
        streakCount.textContent = data.current_streak;
      }

      // Celebration for new day visit
      if (data.is_new_day && data.current_streak > 1) {
        showStreakCelebration(data.current_streak);
      }
    } catch (_err) {
      // Silenzioso
    }
  }

  function showStreakCelebration(streak) {
    const el = document.getElementById('streakCelebration');
    const textEl = document.getElementById('streakCelebrationText');
    if (!el || !textEl) return;

    textEl.textContent = '\uD83D\uDD25 ' + streak + ' giorni consecutivi! Continua cos\u00EC!';
    el.style.display = '';

    setTimeout(function () {
      el.style.display = 'none';
    }, 5000);
  }

  // ─── NOTIFICATIONS ──────────────────────────────────

  async function loadNotifications() {
    if (!session) return;

    try {
      const response = await fetch('/api/user-settings?resource=notifications&limit=20', {
        headers: { Authorization: 'Bearer ' + session.access_token },
      });
      const data = await response.json();

      const countEl = document.getElementById('notifCount');
      if (countEl && data.unread_count > 0) {
        countEl.textContent = data.unread_count;
        countEl.style.display = '';
      } else if (countEl) {
        countEl.style.display = 'none';
      }

      renderNotificationList(data.notifications || []);
    } catch (_err) {
      // Silenzioso
    }
  }

  function renderNotificationList(notifications) {
    const list = document.getElementById('notifList');
    if (!list) return;

    list.textContent = '';

    if (notifications.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'notif-empty';
      empty.textContent = 'Nessuna notifica';
      list.appendChild(empty);
      return;
    }

    notifications.forEach(function (notif) {
      const item = document.createElement('div');
      item.className = 'notif-item' + (notif.read ? '' : ' notif-item--unread');

      const content = document.createElement('div');
      content.className = 'notif-item-content';

      const title = document.createElement('div');
      title.className = 'notif-item-title';
      title.textContent = notif.title;
      content.appendChild(title);

      if (notif.body) {
        const body = document.createElement('div');
        body.className = 'notif-item-body';
        body.textContent = notif.body;
        content.appendChild(body);
      }

      const time = document.createElement('div');
      time.className = 'notif-item-time';
      time.textContent = formatRelativeTime(notif.created_at);
      content.appendChild(time);

      item.appendChild(content);

      // Mark as read on click
      if (!notif.read) {
        item.addEventListener('click', function () {
          markNotificationRead(notif.id);
          item.classList.remove('notif-item--unread');
        });
      }

      list.appendChild(item);
    });
  }

  function setupNotifications() {
    const bell = document.getElementById('notifBell');
    const dropdown = document.getElementById('notifDropdown');
    const markAllBtn = document.getElementById('notifMarkAll');
    if (!bell || !dropdown) return;

    bell.addEventListener('click', function (e) {
      e.stopPropagation();
      const isVisible = dropdown.style.display !== 'none';
      dropdown.style.display = isVisible ? 'none' : '';
    });

    // Close on click outside
    document.addEventListener('click', function (e) {
      if (!dropdown.contains(e.target) && !bell.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    if (markAllBtn) {
      markAllBtn.addEventListener('click', function () {
        markAllNotificationsRead();
      });
    }

    // Poll every 60s
    setInterval(loadNotifications, 60000);
  }

  async function markNotificationRead(id) {
    if (!session) return;
    try {
      await fetch('/api/user-settings?resource=notifications', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ id: id }),
      });
      loadNotifications();
    } catch (_err) {
      // Silenzioso
    }
  }

  async function markAllNotificationsRead() {
    if (!session) return;
    try {
      await fetch('/api/user-settings?resource=notifications', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ markAll: true }),
      });
      loadNotifications();
    } catch (_err) {
      // Silenzioso
    }
  }

  // ─── USER PREFERENCES ──────────────────────────────

  async function loadPreferences() {
    if (!session) return;

    try {
      const response = await fetch('/api/user-settings?resource=preferences', {
        headers: { Authorization: 'Bearer ' + session.access_token },
      });
      userPrefs = await response.json();

      // Render favorite team chips
      renderTeamChips();

      // Set notification toggles
      const tipToggle = document.getElementById('prefNotifTips');
      const resultToggle = document.getElementById('prefNotifResults');
      if (tipToggle) tipToggle.checked = userPrefs.notification_tips !== false;
      if (resultToggle) resultToggle.checked = userPrefs.notification_results !== false;
    } catch (_err) {
      // Silenzioso
    }
  }

  function renderTeamChips() {
    const container = document.getElementById('teamChips');
    if (!container) return;
    container.textContent = '';

    const teams = (userPrefs && userPrefs.favorite_teams) || [];
    teams.forEach(function (teamName) {
      const chip = document.createElement('span');
      chip.className = 'team-chip';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = teamName;
      chip.appendChild(nameSpan);

      const removeBtn = document.createElement('span');
      removeBtn.className = 'team-chip-remove';
      removeBtn.textContent = '\u00D7';
      removeBtn.addEventListener('click', function () {
        removeFavoriteTeam(teamName);
      });
      chip.appendChild(removeBtn);

      container.appendChild(chip);
    });
  }

  async function saveFavoriteTeams(teams) {
    if (!session) return;
    try {
      await fetch('/api/user-settings?resource=preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ favorite_teams: teams }),
      });
      showPrefSaveStatus('Salvato!');
    } catch (_err) {
      showPrefSaveStatus('Errore');
    }
  }

  function addFavoriteTeam(teamName) {
    if (!userPrefs) userPrefs = {};
    if (!userPrefs.favorite_teams) userPrefs.favorite_teams = [];
    const existing = userPrefs.favorite_teams.map(function (t) {
      return t.toLowerCase();
    });
    if (existing.indexOf(teamName.toLowerCase()) !== -1) return;
    if (userPrefs.favorite_teams.length >= 20) return;

    userPrefs.favorite_teams.push(teamName);
    renderTeamChips();
    saveFavoriteTeams(userPrefs.favorite_teams);
  }

  function removeFavoriteTeam(teamName) {
    if (!userPrefs || !userPrefs.favorite_teams) return;
    userPrefs.favorite_teams = userPrefs.favorite_teams.filter(function (t) {
      return t.toLowerCase() !== teamName.toLowerCase();
    });
    renderTeamChips();
    saveFavoriteTeams(userPrefs.favorite_teams);
  }

  function setupTeamSearch() {
    const input = document.getElementById('teamSearchInput');
    const dropdown = document.getElementById('teamSearchDropdown');
    if (!input || !dropdown) return;

    let allTeams = [];
    let debounceTimer = null;

    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      const query = input.value.trim().toLowerCase();

      if (query.length < 2) {
        dropdown.style.display = 'none';
        return;
      }

      debounceTimer = setTimeout(function () {
        if (allTeams.length === 0) {
          // Fetch team list from standings
          fetch('/api/stats?type=standings&league=' + encodeURIComponent(currentLeague))
            .then(function (r) {
              return r.json();
            })
            .then(function (standings) {
              allTeams = (standings || []).map(function (t) {
                return t.name;
              });
              showTeamResults(query, allTeams, dropdown);
            })
            .catch(function () {
              dropdown.style.display = 'none';
            });
        } else {
          showTeamResults(query, allTeams, dropdown);
        }
      }, 300);
    });

    // Close dropdown on click outside
    document.addEventListener('click', function (e) {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  function showTeamResults(query, teams, dropdown) {
    const filtered = teams.filter(function (name) {
      return name.toLowerCase().indexOf(query) !== -1;
    });

    dropdown.textContent = '';

    if (filtered.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    dropdown.style.display = '';

    filtered.slice(0, 8).forEach(function (teamName) {
      const option = document.createElement('div');
      option.className = 'team-search-option';
      option.textContent = teamName;
      option.addEventListener('click', function () {
        addFavoriteTeam(teamName);
        document.getElementById('teamSearchInput').value = '';
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(option);
    });
  }

  function setupPreferenceToggles() {
    const tipToggle = document.getElementById('prefNotifTips');
    const resultToggle = document.getElementById('prefNotifResults');

    function saveToggle() {
      if (!session) return;
      fetch('/api/user-settings?resource=preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          notification_tips: tipToggle ? tipToggle.checked : true,
          notification_results: resultToggle ? resultToggle.checked : true,
        }),
      })
        .then(function () {
          showPrefSaveStatus('Salvato!');
        })
        .catch(function () {
          showPrefSaveStatus('Errore');
        });
    }

    if (tipToggle) tipToggle.addEventListener('change', saveToggle);
    if (resultToggle) resultToggle.addEventListener('change', saveToggle);
  }

  function showPrefSaveStatus(text) {
    const el = document.getElementById('prefSaveStatus');
    if (!el) return;
    el.textContent = text;
    el.style.opacity = '1';
    setTimeout(function () {
      el.style.opacity = '0';
    }, 2000);
  }

  // ─── USER BETS ──────────────────────────────────────

  async function loadUserBets() {
    if (!session) return;

    try {
      const response = await fetch('/api/user-bets', {
        headers: { Authorization: 'Bearer ' + session.access_token },
      });
      const bets = await response.json();
      userBetsMap = {};
      if (Array.isArray(bets)) {
        bets.forEach(function (bet) {
          userBetsMap[bet.tip_id] = bet;
        });
      }
    } catch (_err) {
      // Silenzioso
    }
  }

  async function toggleFollowTip(tipId, btn) {
    if (!session) return;

    const isFollowed = !!userBetsMap[tipId];

    try {
      if (isFollowed) {
        // Unfollow
        await fetch('/api/user-bets?tipId=' + tipId, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + session.access_token },
        });
        delete userBetsMap[tipId];
        btn.classList.remove('followed');
        btn.textContent = '\u2606 Segui';
      } else {
        // Follow
        const response = await fetch('/api/user-bets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + session.access_token,
          },
          body: JSON.stringify({ tip_id: tipId, followed: true }),
        });
        const bet = await response.json();
        userBetsMap[tipId] = bet;
        btn.classList.add('followed');
        btn.textContent = '\u2605 Seguito';
      }
    } catch (_err) {
      // Silenzioso
    }
  }

  // ─── LOGOUT ─────────────────────────────────────────────

  function setupLogout() {
    document.getElementById('logoutBtn').addEventListener('click', async function (e) {
      e.preventDefault();
      await SupabaseConfig.signOut();
      window.location.href = '/';
    });
  }

  // ─── CHECKOUT FEEDBACK ──────────────────────────────────

  function handleCheckoutFeedback() {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');

    if (checkout === 'success') {
      showAlert('Abbonamento attivato con successo! Benvenuto.', 'success');
      window.history.replaceState({}, '', '/dashboard.html');
    } else if (checkout === 'cancelled') {
      showAlert('Pagamento annullato. Puoi riprovare quando vuoi.', 'error');
      window.history.replaceState({}, '', '/dashboard.html');
    }
  }

  function showAlert(message, type) {
    const alertEl = document.getElementById('checkoutAlert');
    alertEl.textContent = message;
    alertEl.className = 'dash-alert dash-alert--' + type;
    alertEl.style.display = '';

    setTimeout(function () {
      alertEl.style.display = 'none';
    }, 8000);
  }

  // ─── TELEGRAM LINKING ──────────────────────────────────

  async function loadTelegramStatus() {
    const statusEl = document.getElementById('telegramStatus');
    const linkBtn = document.getElementById('linkTelegramBtn');

    const result = await SupabaseConfig.client
      .from('profiles')
      .select('telegram_user_id')
      .eq('user_id', session.user.id)
      .single();

    const telegramId = result.data && result.data.telegram_user_id;

    if (telegramId) {
      statusEl.textContent = 'Account Telegram collegato';
      statusEl.className = 'dash-telegram-status dash-telegram-status--linked';
      linkBtn.style.display = 'none';
    } else {
      statusEl.textContent =
        'Collega il tuo account Telegram per ricevere i pronostici direttamente in chat.';
      statusEl.className = 'dash-telegram-status';
      linkBtn.style.display = '';
      linkBtn.onclick = handleLinkTelegram;
    }
  }

  async function handleLinkTelegram() {
    const linkBtn = document.getElementById('linkTelegramBtn');
    linkBtn.disabled = true;
    linkBtn.textContent = 'Caricamento...';

    try {
      const response = await fetch('/api/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
      });

      const data = await response.json();

      if (data.status === 'already_linked') {
        showAlert('Il tuo account Telegram \u00E8 gi\u00E0 collegato.', 'success');
        loadTelegramStatus();
        return;
      }

      if (data.url) {
        window.open(data.url, '_blank');
        showAlert('Apri Telegram e premi START nel bot per completare il collegamento.', 'success');
        pollTelegramLink();
      } else {
        showAlert('Errore nella generazione del link. Riprova.', 'error');
      }
    } catch (_err) {
      showAlert('Errore di rete. Riprova.', 'error');
    } finally {
      linkBtn.disabled = false;
      linkBtn.textContent = 'Collega Telegram';
    }
  }

  function pollTelegramLink() {
    let attempts = 0;
    const maxAttempts = 20;

    const interval = setInterval(async function () {
      attempts++;

      const result = await SupabaseConfig.client
        .from('profiles')
        .select('telegram_user_id')
        .eq('user_id', session.user.id)
        .single();

      const telegramId = result.data && result.data.telegram_user_id;

      if (telegramId) {
        clearInterval(interval);
        showAlert('Account Telegram collegato con successo!', 'success');
        loadTelegramStatus();
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 3000);
  }

  // ─── HELPERS ────────────────────────────────────────────

  function formatDate(iso) {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatMatchDate(iso) {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    return (
      d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) +
      ' \u2014 ' +
      d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    );
  }

  function formatRelativeTime(iso) {
    if (!iso) return '';
    const now = new Date();
    const d = new Date(iso);
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ora';
    if (mins < 60) return mins + ' min fa';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h fa';
    const days = Math.floor(hours / 24);
    if (days < 7) return days + 'g fa';
    return formatDate(iso);
  }
})();
