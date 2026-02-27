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

/* global initMobileMenu, initLangToggle, initCookieBanner, initCopyrightYear, TIER_PRICES, TIER_LEVELS, getLocale, setErrorState, dashRenderTipsGrid, dashRenderSchedule, dashRenderHistory, dashRenderNotifications, dashRenderFantacalcio, showToast, buildSkeletonCards, setLastUpdated, retryWithBackoff */

(function () {
  'use strict';

  // Shared utilities
  initMobileMenu();
  initCookieBanner();

  // ─── CONFIG ───────────────────────────────────────────
  const UI_TEXT = {
    networkError: 'Errore di rete. Riprova.',
    loading: 'Caricamento...',
    upgradeTo: { pro: 'Passa a PRO', vip: 'Passa a VIP' },
  };

  let session = null;
  let profile = null;

  /**
   * Fetch helper: adds Authorization header & checks response.ok.
   * Returns parsed JSON. Throws on HTTP errors or missing session.
   */
  async function authFetch(url, options) {
    if (!session) throw new Error('No session');
    const opts = options || {};
    opts.headers = Object.assign(
      { Authorization: 'Bearer ' + session.access_token },
      opts.headers || {},
    );
    const resp = await fetch(url, opts);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.json();
  }
  let allHistory = [];
  let userPrefs = null;
  let userBetsMap = {};
  let countdownInterval = null;
  let notifInterval = null;
  let checkoutJustCompleted = false;
  let currentLeague = null;
  try {
    currentLeague = localStorage.getItem('wb_dashboard_league');
  } catch (_e) {
    /* storage unavailable */
  }
  currentLeague = currentLeague || 'serie-a';

  // ─── INIT ───────────────────────────────────────────────

  // Compute Monday of the current ISO week for schedine navigation
  let schedineDate = getCurrentWeekMonday();

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
    setupSettingsToggle();
    setupSchedineDateNav();
    setupRiskProfileInputs();
    setupBankrollCalculator();
  });

  /**
   * Verifica autenticazione. Redirect a /auth.html se non loggato.
   */
  async function checkAuth() {
    try {
      const result = await SupabaseConfig.getSession();
      session = (result && result.data && result.data.session) || null;

      if (!session) {
        window.location.href = '/auth.html';
        return;
      }

      await loadProfile();
      loadTodayTips();
      loadHistory();
      loadActivity();
      loadNotifications();
      loadPreferences();
      loadUserBets();
      loadSchedule();
    } catch (err) {
      console.error('[checkAuth]', err.message || err);
      showAlert('Errore di connessione. Ricarica la pagina.', 'error');
    }
  }

  // ─── PROFILE ────────────────────────────────────────────

  /**
   * Carica il profilo utente da Supabase e aggiorna la UI.
   */
  async function loadProfile() {
    try {
      const user = session.user;

      const result = await SupabaseConfig.client
        .from('profiles')
        .select('display_name, tier, stripe_customer_id')
        .eq('user_id', user.id)
        .single();

      if (result.error && result.error.code !== 'PGRST116') {
        console.warn('[loadProfile]', result.error.message);
      }
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
          .then(function (r) {
            if (r.error) console.warn('[profile-update]', r.error.message);
          })
          .catch(function (err) {
            console.warn('[profile-update]', err.message);
          });
      }

      const tier = (profile && profile.tier) || 'free';
      const tierLabel = document.getElementById('tierLabel');
      const tierBadge = document.getElementById('tierBadge');
      tierLabel.textContent = tier.toUpperCase();
      tierBadge.className = 'dash-tier-badge dash-tier-badge--' + tier;

      document.getElementById('userEmail').textContent = user.email;
      document.getElementById('userDisplayName').textContent = displayName;
      document.getElementById('userSince').textContent = formatDate(user.created_at);

      // Set avatar: use Google profile picture if available
      const avatarEl = document.getElementById('userAvatar');
      const avatarUrl = meta.avatar_url || meta.picture || '';
      if (avatarUrl && avatarEl) {
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.alt = displayName;
        img.onerror = function () {
          this.remove();
        };
        // Clear existing content (initials span) and add image
        while (avatarEl.firstChild) avatarEl.removeChild(avatarEl.firstChild);
        avatarEl.appendChild(img);
      }

      updateSubscriptionUI(tier);
      loadTelegramStatus();

      // Se l'utente torna da un checkout appena completato ma il tier è ancora free,
      // il webhook potrebbe non aver ancora sparato: esegui polling finché non si aggiorna.
      if (checkoutJustCompleted) {
        checkoutJustCompleted = false;
        if (tier !== 'free') {
          showAlert('Abbonamento attivato con successo! Benvenuto.', 'success');
        } else {
          showAlert('Stiamo attivando il tuo abbonamento\u2026', 'success');
          pollForSubscriptionUpgrade(user.id);
        }
      }

      // Show notification bell for authenticated users
      const notifBell = document.getElementById('notifBell');
      if (notifBell) notifBell.style.display = '';
    } catch (err) {
      console.error('[loadProfile]', err.message || err);
      showAlert('Errore di connessione. Ricarica la pagina.', 'error');
    }
  }

  /**
   * Aggiorna la sezione abbonamento in base al tier.
   */
  async function updateSubscriptionUI(tier) {
    try {
      const subTierBadge = document.getElementById('subTierBadge');
      const upgradeSection = document.getElementById('upgradeSection');
      const upgradeProBtn = document.getElementById('upgradeProBtn');
      const upgradeVipBtn = document.getElementById('upgradeVipBtn');
      const manageSubBtn = document.getElementById('manageSubBtn');
      const manageSubRow = document.getElementById('manageSubRow');
      const subStatusDisplay = document.getElementById('subStatusDisplay');
      const subRenewalDisplay = document.getElementById('subRenewalDisplay');

      // Hidden compat elements
      const subTier = document.getElementById('subTier');
      const subStatus = document.getElementById('subStatus');

      // Setup upgrade buttons (guard against missing elements)
      if (upgradeProBtn) upgradeProBtn.onclick = function () { startCheckout('pro'); };
      if (upgradeVipBtn) upgradeVipBtn.onclick = function () { startCheckout('vip'); };

      // Update tier badge
      if (subTierBadge) {
        subTierBadge.textContent = tier.toUpperCase();
        subTierBadge.className = 'profile-hero__badge';
        if (tier === 'pro') subTierBadge.classList.add('profile-hero__badge--pro');
        if (tier === 'vip') subTierBadge.classList.add('profile-hero__badge--vip');
      }

      // Update avatar initials
      const initials = document.getElementById('userInitials');
      const nameEl = document.getElementById('userDisplayName');
      const name = (nameEl && nameEl.textContent) || '';
      if (initials && name && name !== '\u2014') {
        const parts = name.trim().split(/\s+/);
        initials.textContent =
          parts.length > 1
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : parts[0].substring(0, 2).toUpperCase();
      }

      if (tier === 'free') {
        if (subTier) subTier.textContent = 'Free';
        if (subStatus) subStatus.textContent = 'Gratuito';
        if (upgradeSection) upgradeSection.style.display = '';
        if (manageSubRow) manageSubRow.style.display = 'none';

        const proCard = document.querySelector('.upgrade-card--pro');
        const vipCard = document.querySelector('.upgrade-card--vip');
        if (proCard) proCard.style.display = '';
        if (vipCard) vipCard.style.display = '';

        handleAutoCheckout(tier);
        return;
      }

      if (subTier) subTier.textContent = tier.toUpperCase() + ' \u2014 ' + TIER_PRICES[tier].display;

      const subResult = await SupabaseConfig.client
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .order('current_period_end', { ascending: false })
        .limit(1)
        .single();

      if (subResult.error && subResult.error.code !== 'PGRST116') {
        console.warn('[subscription]', subResult.error.message);
      }

      if (subResult.data) {
        if (subStatus) subStatus.textContent = 'Attivo';
        if (manageSubRow) manageSubRow.style.display = '';
        if (subStatusDisplay) subStatusDisplay.textContent = tier.toUpperCase() + ' Attivo';
        if (subRenewalDisplay) subRenewalDisplay.textContent = 'Rinnovo: ' + formatDate(subResult.data.current_period_end);
      } else {
        if (subStatus) subStatus.textContent = 'Non attivo';
      }

      if (tier === 'pro') {
        // PRO user: show only VIP upgrade
        if (upgradeSection) {
          upgradeSection.style.display = '';
          const upgradeTitle = upgradeSection.querySelector('.upgrade-section__title');
          if (upgradeTitle) upgradeTitle.textContent = 'Passa a VIP';
        }
        const proCard = document.querySelector('.upgrade-card--pro');
        const vipCard = document.querySelector('.upgrade-card--vip');
        if (proCard) proCard.style.display = 'none';
        if (vipCard) vipCard.style.display = '';
      } else {
        // VIP user: hide upgrade section
        if (upgradeSection) upgradeSection.style.display = 'none';
      }

      if (profile && profile.stripe_customer_id && manageSubBtn) {
        manageSubBtn.style.display = '';
        manageSubBtn.onclick = openCustomerPortal;
      }

      handleAutoCheckout(tier);
    } catch (err) {
      console.error('[updateSubscriptionUI]', err.message || err);
    }
  }

  /**
   * Gestisce l'auto-checkout da URL param (?upgrade=pro|vip).
   * Usato quando l'utente clicca "Scegli PRO" dalla home page.
   */
  function handleAutoCheckout(currentTier) {
    const params = new URLSearchParams(window.location.search);
    const requestedTier = params.get('upgrade');
    if (!requestedTier || !TIER_PRICES[requestedTier]) return;

    // Pulisci il param dall'URL
    window.history.replaceState({}, '', '/dashboard.html');

    // Non avviare checkout se l'utente ha gia' quel tier o superiore
    if ((TIER_LEVELS[currentTier] || 0) >= (TIER_LEVELS[requestedTier] || 0)) return;

    startCheckout(requestedTier);
  }

  /**
   * Avvia il checkout Stripe per un piano.
   */
  async function startCheckout(tier) {
    // Disabilita tutti i bottoni upgrade durante il caricamento
    const allUpgradeButtons = document.querySelectorAll('.upgrade-card__btn');
    allUpgradeButtons.forEach(function (b) {
      b.disabled = true;
      b.textContent = 'Caricamento...';
    });

    try {
      if (!session) {
        showAlert('Sessione scaduta. Ricarica la pagina e riprova.', 'error');
        return;
      }

      const resp = await fetch('/api/billing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ action: 'checkout', tier: tier }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(function () {
          return {};
        });
        console.error('[checkout] HTTP ' + resp.status, errData);
        showAlert(errData.error || 'Errore nel pagamento (HTTP ' + resp.status + ')', 'error');
        return;
      }

      const data = await resp.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        showAlert('Errore nella creazione del pagamento. Riprova.', 'error');
      }
    } catch (err) {
      console.error('[checkout] Network error:', err);
      showAlert('Errore di connessione: ' + err.message, 'error');
    } finally {
      const proBtn = document.getElementById('upgradeProBtn');
      const vipBtn = document.getElementById('upgradeVipBtn');
      if (proBtn) {
        proBtn.disabled = false;
        proBtn.textContent = 'Scegli PRO';
      }
      if (vipBtn) {
        vipBtn.disabled = false;
        vipBtn.textContent = 'Diventa VIP';
      }
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
      const data = await authFetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'portal' }),
      });

      if (data.url) {
        window.location.href = data.url;
      } else {
        showAlert("Errore nell'apertura del portale. Riprova.", 'error');
      }
    } catch (err) {
      console.warn('[portal]', err.message);
      showAlert(UI_TEXT.networkError, 'error');
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
      buildSkeletonCards(grid, 3, 'card');
      const tipLimit = currentLeague === 'all' ? 50 : 20;
      const tips = await retryWithBackoff(function () {
        return authFetch(
          '/api/tips?status=today&limit=' +
            tipLimit +
            '&league=' +
            encodeURIComponent(currentLeague),
        );
      });

      if (!Array.isArray(tips) || tips.length === 0) {
        grid.textContent = '';
        emptyState.style.display = '';
        startCountdown();
        return;
      }

      emptyState.style.display = 'none';
      stopCountdown();

      // Sort: future pending first (ascending), then started/settled at the bottom
      const now = new Date();
      tips.sort(function (a, b) {
        const aPast = new Date(a.match_date) < now || a.status !== 'pending';
        const bPast = new Date(b.match_date) < now || b.status !== 'pending';
        if (aPast !== bPast) return aPast ? 1 : -1;
        // Within same group: future ascending, past descending
        if (aPast) return new Date(b.match_date) - new Date(a.match_date);
        return new Date(a.match_date) - new Date(b.match_date);
      });

      renderTipsGrid(grid, tips);
      setLastUpdated('dashTipsUpdated', loadTodayTips);
    } catch (err) {
      console.warn('[loadTodayTips]', err.message);
      setErrorState(grid, 'Impossibile caricare i pronostici', loadTodayTips);
      startCountdown();
    }
  }

  /**
   * Renderizza la griglia di tips nel container.
   * Delega a dashRenderTipsGrid (dashboard-renderers.js) passando le dipendenze.
   */
  function renderTipsGrid(container, tips) {
    dashRenderTipsGrid(container, tips, {
      currentLeague: currentLeague,
      userPrefs: userPrefs,
      userBetsMap: userBetsMap,
      onExpand: loadTipDetails,
      onToggleFollow: toggleFollowTip,
      onSaveBet: saveBetTracking,
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
      const data = await authFetch(
        '/api/match-insights?type=form&teams=' +
          encodeURIComponent(homeTeam + ',' + awayTeam) +
          '&league=' +
          encodeURIComponent(league),
      );
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
    } catch (err) {
      console.warn('[loadTeamForm]', err.message);
    }
  }

  /**
   * Load and render H2H bar chart.
   */
  async function loadH2H(container, homeTeam, awayTeam, league) {
    try {
      const data = await authFetch(
        '/api/match-insights?type=h2h&home=' +
          encodeURIComponent(homeTeam) +
          '&away=' +
          encodeURIComponent(awayTeam) +
          '&league=' +
          encodeURIComponent(league),
      );
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
    } catch (err) {
      console.warn('[loadH2H]', err.message);
    }
  }

  // ─── HISTORY ────────────────────────────────────────────

  /**
   * Carica lo storico completo dei tips.
   */
  async function loadHistory() {
    try {
      const histList = document.getElementById('dashHistoryList');
      if (histList) buildSkeletonCards(histList, 4, 'history');
      let results = [];

      const statuses = ['won', 'lost', 'void', 'pending'];
      const leagueParam = '&league=' + encodeURIComponent(currentLeague);
      const promises = statuses.map(function (s) {
        return authFetch('/api/tips?status=' + s + '&limit=50' + leagueParam);
      });

      const responses = await retryWithBackoff(function () {
        return Promise.all(promises);
      });
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
      setLastUpdated('dashHistoryUpdated', loadHistory);
    } catch (err) {
      console.warn('[loadHistory]', err.message);
      const histList = document.getElementById('dashHistoryList');
      if (histList) setErrorState(histList, 'Impossibile caricare lo storico', loadHistory);
    }
  }

  /**
   * Renderizza lo storico filtrato per status.
   * Delega a dashRenderHistory (dashboard-renderers.js) passando le dipendenze.
   */
  function renderHistory(statusFilter) {
    dashRenderHistory(
      document.getElementById('dashHistoryList'),
      document.getElementById('dashHistoryEmpty'),
      allHistory,
      statusFilter,
      { userPrefs: userPrefs, formatDate: formatDate },
    );
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
    } catch (err) {
      console.warn('[loadDashboardChart]', err.message);
    }
  }

  // ─── TABS ───────────────────────────────────────────────

  function setupTabs() {
    const tabs = document.querySelectorAll('.dash-tab');
    const STORAGE_KEY = 'wb_dashboard_tab';

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) settingsBtn.classList.remove('active');

        const target = tab.getAttribute('data-tab');

        try {
          localStorage.setItem(STORAGE_KEY, target);
        } catch (_e) {
          /* storage unavailable */
        }

        document.getElementById('panelTips').style.display = target === 'tips' ? '' : 'none';
        document.getElementById('panelSchedule').style.display =
          target === 'schedine' ? '' : 'none';
        document.getElementById('panelHistory').style.display = target === 'history' ? '' : 'none';
        document.getElementById('panelFantacalcio').style.display =
          target === 'fantacalcio' ? '' : 'none';
        document.getElementById('panelAccount').style.display = 'none';

        // Lazy-load Fantacalcio on first open
        if (target === 'fantacalcio') {
          loadFantacalcio();
        }

        const leagueSelector = document.getElementById('dashLeagueSelector');
        if (leagueSelector) {
          // Hide league selector for tabs where it has no effect
          leagueSelector.style.display =
            target === 'account' || target === 'fantacalcio' ? 'none' : '';
        }
      });
    });

    // Restore saved tab (after listeners are attached)
    let savedTab = null;
    try {
      savedTab = localStorage.getItem(STORAGE_KEY);
    } catch (_e) {
      /* storage unavailable */
    }
    if (savedTab && savedTab !== 'tips') {
      const target = document.querySelector('.dash-tab[data-tab="' + savedTab + '"]');
      if (target) target.click();
    }
  }

  /**
   * Configura il pulsante gear per mostrare/nascondere il pannello Account.
   */
  function setupSettingsToggle() {
    const settingsBtn = document.getElementById('settingsBtn');
    if (!settingsBtn) return;

    settingsBtn.addEventListener('click', function () {
      const panelAccount = document.getElementById('panelAccount');
      const panelTips = document.getElementById('panelTips');
      const panelSchedule = document.getElementById('panelSchedule');
      const panelHistory = document.getElementById('panelHistory');
      const panelFantacalcio = document.getElementById('panelFantacalcio');
      const isAccountVisible = panelAccount.style.display !== 'none';

      const leagueSelector = document.getElementById('dashLeagueSelector');

      if (isAccountVisible) {
        // Chiudi account, torna alla tab attiva
        panelAccount.style.display = 'none';
        settingsBtn.classList.remove('active');

        const activeTab = document.querySelector('.dash-tab.active');
        const activePanel = activeTab ? activeTab.getAttribute('data-tab') : 'tips';
        panelTips.style.display = activePanel === 'tips' ? '' : 'none';
        panelSchedule.style.display = activePanel === 'schedine' ? '' : 'none';
        panelHistory.style.display = activePanel === 'history' ? '' : 'none';
        if (panelFantacalcio)
          panelFantacalcio.style.display = activePanel === 'fantacalcio' ? '' : 'none';
        if (leagueSelector)
          leagueSelector.style.display =
            activePanel === 'fantacalcio' ? 'none' : '';
      } else {
        // Apri account, nascondi gli altri pannelli e il selettore campionato
        panelTips.style.display = 'none';
        panelSchedule.style.display = 'none';
        panelHistory.style.display = 'none';
        if (panelFantacalcio) panelFantacalcio.style.display = 'none';
        panelAccount.style.display = '';
        settingsBtn.classList.add('active');
        if (leagueSelector) leagueSelector.style.display = 'none';
      }
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

      // On the Schedine/Fantacalcio tabs, league filter has no effect — do nothing
      const activeTab = document.querySelector('.dash-tab.active');
      const activeTabName = activeTab ? activeTab.getAttribute('data-tab') : '';
      if (activeTabName === 'schedine' || activeTabName === 'fantacalcio') return;

      const league = btn.getAttribute('data-league');
      if (league === currentLeague) return;

      buttons.forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      currentLeague = league;
      try {
        localStorage.setItem('wb_dashboard_league', league);
      } catch (_e) {
        /* storage unavailable */
      }

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
        Promise.all([loadTodayTips(), loadHistory()])
          .then(function () {
            ptr.classList.remove('active');
            ptr.style.height = '0';
          })
          .catch(function (err) {
            console.warn('[pull-to-refresh]', err.message);
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
      const data = await authFetch('/api/user-settings?resource=activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

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

      // Activity stats display
      const activityStats = document.getElementById('activityStats');
      const totalVisitsEl = document.getElementById('totalVisits');
      const longestStreakEl = document.getElementById('longestStreak');
      if (activityStats && totalVisitsEl && longestStreakEl) {
        if (data.total_visits || data.longest_streak) {
          activityStats.style.display = '';
          totalVisitsEl.textContent = data.total_visits || 0;
          longestStreakEl.textContent = data.longest_streak || 0;
        }
      }
    } catch (err) {
      console.warn('[loadActivity]', err.message);
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
      const data = await authFetch('/api/user-settings?resource=notifications&limit=20');

      const countEl = document.getElementById('notifCount');
      if (countEl && data.unread_count > 0) {
        countEl.textContent = data.unread_count;
        countEl.style.display = '';
      } else if (countEl) {
        countEl.style.display = 'none';
      }

      renderNotificationList(data.notifications || []);
    } catch (err) {
      console.warn('[loadNotifications]', err.message);
    }
  }

  function renderNotificationList(notifications) {
    const list = document.getElementById('notifList');
    if (!list) return;
    dashRenderNotifications(list, notifications, {
      onMarkRead: markNotificationRead,
      formatRelativeTime: formatRelativeTime,
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

    // Poll every 60s — pause when tab is hidden, clear on logout
    notifInterval = setInterval(loadNotifications, 60000);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (notifInterval) {
          clearInterval(notifInterval);
          notifInterval = null;
        }
      } else {
        if (!notifInterval && session) {
          loadNotifications();
          notifInterval = setInterval(loadNotifications, 60000);
        }
      }
    });
  }

  async function markNotificationRead(id) {
    if (!session) return;
    try {
      await authFetch('/api/user-settings?resource=notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id }),
      });
      loadNotifications();
    } catch (err) {
      console.warn('[markNotificationRead]', err.message);
    }
  }

  async function markAllNotificationsRead() {
    if (!session) return;
    try {
      await authFetch('/api/user-settings?resource=notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      });
      loadNotifications();
    } catch (err) {
      console.warn('[markAllNotificationsRead]', err.message);
    }
  }

  // ─── USER PREFERENCES ──────────────────────────────

  async function loadPreferences() {
    if (!session) return;

    try {
      userPrefs = await authFetch('/api/user-settings?resource=preferences');

      // Render favorite team chips
      renderTeamChips();

      // Set notification toggles
      const tipToggle = document.getElementById('prefNotifTips');
      const resultToggle = document.getElementById('prefNotifResults');
      if (tipToggle) tipToggle.checked = userPrefs.notification_tips !== false;
      if (resultToggle) resultToggle.checked = userPrefs.notification_results !== false;

      // Set risk profile fields
      const riskSelect = document.getElementById('prefRiskTolerance');
      const budgetInput = document.getElementById('prefWeeklyBudget');
      const maxSchedine = document.getElementById('prefMaxSchedine');
      if (riskSelect && userPrefs.risk_tolerance) riskSelect.value = userPrefs.risk_tolerance;
      if (budgetInput && userPrefs.weekly_budget) budgetInput.value = userPrefs.weekly_budget;
      if (maxSchedine && userPrefs.max_schedine_per_day)
        maxSchedine.value = userPrefs.max_schedine_per_day;
    } catch (err) {
      console.warn('[loadPreferences]', err.message);
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
      await authFetch('/api/user-settings?resource=preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite_teams: teams }),
      });
      showPrefSaveStatus('Salvato!');
    } catch (err) {
      console.warn('[saveFavoriteTeams]', err.message);
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
      authFetch('/api/user-settings?resource=preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notification_tips: tipToggle ? tipToggle.checked : true,
          notification_results: resultToggle ? resultToggle.checked : true,
        }),
      })
        .then(function () {
          showPrefSaveStatus('Salvato!');
        })
        .catch(function (err) {
          console.warn('[saveToggle]', err.message);
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
      const bets = await authFetch('/api/user-bets');
      userBetsMap = {};
      if (Array.isArray(bets)) {
        bets.forEach(function (bet) {
          userBetsMap[bet.tip_id] = bet;
        });
      }
    } catch (err) {
      console.warn('[loadUserBets]', err.message);
    }
  }

  async function toggleFollowTip(tipId, btn) {
    if (!session) return;

    const isFollowed = !!userBetsMap[tipId];

    try {
      if (isFollowed) {
        // Unfollow
        await authFetch('/api/user-bets?tipId=' + tipId, { method: 'DELETE' });
        delete userBetsMap[tipId];
        btn.classList.remove('followed');
        btn.textContent = '\u2606 Segui';
      } else {
        // Follow
        const bet = await authFetch('/api/user-bets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tip_id: tipId, followed: true }),
        });
        userBetsMap[tipId] = bet;
        btn.classList.add('followed');
        btn.textContent = '\u2605 Seguito';
      }
    } catch (err) {
      console.warn('[toggleFollowTip]', err.message);
    }
  }

  // ─── SCHEDINE (BETTING SLIPS) ─────────────────────────

  async function loadSchedule() {
    const grid = document.getElementById('schedineGrid');
    const empty = document.getElementById('schedineEmpty');
    const upgrade = document.getElementById('schedineUpgrade');
    const budgetBar = document.getElementById('schedineBudgetBar');

    if (!grid) return;

    const tier = (profile && profile.tier) || 'free';

    if (tier === 'free') {
      grid.textContent = '';
      empty.style.display = 'none';
      budgetBar.style.display = 'none';
      upgrade.style.display = '';
      const upgradeBtn = document.getElementById('schedineUpgradeBtn');
      if (upgradeBtn) {
        upgradeBtn.onclick = function () {
          startCheckout('pro');
        };
      }
      return;
    }

    buildSkeletonCards(grid, 2, 'card');
    empty.style.display = 'none';
    upgrade.style.display = 'none';

    try {
      const data = await retryWithBackoff(function () {
        return authFetch('/api/betting-slips?date=' + encodeURIComponent(schedineDate));
      });

      if (!data.schedine || data.schedine.length === 0) {
        grid.textContent = '';
        empty.style.display = '';
        budgetBar.style.display = 'none';
        return;
      }

      if (data.budget_summary) {
        budgetBar.style.display = '';
        document.getElementById('budgetTotal').textContent = data.budget_summary.budget + ' \u20AC';
        document.getElementById('budgetStake').textContent =
          data.budget_summary.total_stake + ' \u20AC';
        document.getElementById('budgetReserve').textContent =
          data.budget_summary.reserve + ' \u20AC';
      }

      renderSchedule(grid, data.schedine);
    } catch (err) {
      console.warn('[loadSchedule]', err.message);
      budgetBar.style.display = 'none';

      if (err.message === 'HTTP 403') {
        grid.textContent = '';
        upgrade.style.display = '';
      } else {
        setErrorState(grid, 'Impossibile caricare le schedine', loadSchedule);
      }
    }
  }

  function renderSchedule(container, schedine) {
    dashRenderSchedule(container, schedine);
  }

  // ─── FANTACALCIO HUB ──────────────────────────────────

  let fantacalcioLoaded = false;

  async function loadFantacalcio() {
    if (fantacalcioLoaded) return; // Already loaded — no need to re-fetch
    const grid = document.getElementById('fantacalcioGrid');
    if (!grid) return;

    try {
      buildSkeletonCards(grid, 3, 'card');
      const data = await retryWithBackoff(function () {
        return authFetch('/api/fantacalcio?league=serie-a');
      });
      fantacalcioLoaded = true;
      dashRenderFantacalcio(grid, data, {
        tier: (profile && profile.tier) || 'free',
        onUpgrade: startCheckout,
      });
    } catch (err) {
      console.warn('[loadFantacalcio]', err.message);
      setErrorState(grid, 'Impossibile caricare i consigli Fantacalcio', function () {
        fantacalcioLoaded = false;
        loadFantacalcio();
      });
    }
  }

  function setupSchedineDateNav() {
    const prevBtn = document.getElementById('schedinePrev');
    const nextBtn = document.getElementById('schedineNext');
    const label = document.getElementById('schedineDateLabel');
    if (!prevBtn || !nextBtn || !label) return;

    updateSchedineDateLabel(label);

    prevBtn.addEventListener('click', function () {
      const d = new Date(schedineDate + 'T12:00:00');
      d.setDate(d.getDate() - 7);
      schedineDate = d.toISOString().split('T')[0];
      updateSchedineDateLabel(label);
      loadSchedule();
    });

    nextBtn.addEventListener('click', function () {
      const d = new Date(schedineDate + 'T12:00:00');
      d.setDate(d.getDate() + 7);
      schedineDate = d.toISOString().split('T')[0];
      updateSchedineDateLabel(label);
      loadSchedule();
    });
  }

  function getCurrentWeekMonday() {
    const now = new Date();
    const day = now.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    const mon = new Date(now);
    mon.setDate(now.getDate() + offset);
    return mon.toISOString().split('T')[0];
  }

  function updateSchedineDateLabel(label) {
    const currentMonday = getCurrentWeekMonday();
    const mon = new Date(schedineDate + 'T12:00:00');
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);

    const monStr = mon.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });
    const sunStr = sun.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });

    if (schedineDate === currentMonday) {
      label.textContent = 'Questa settimana (' + monStr + ' - ' + sunStr + ')';
    } else {
      label.textContent = monStr + ' - ' + sunStr;
    }
  }

  // ─── RISK PROFILE ─────────────────────────────────────

  function setupRiskProfileInputs() {
    const riskSelect = document.getElementById('prefRiskTolerance');
    const budgetInput = document.getElementById('prefWeeklyBudget');
    const maxSchedine = document.getElementById('prefMaxSchedine');
    let debounceTimer = null;

    function saveRiskProfile(field, value) {
      if (!session) return;
      const body = {};
      body[field] = value;
      authFetch('/api/user-settings?resource=preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function () {
          showPrefSaveStatus('Salvato!');
        })
        .catch(function (err) {
          console.warn('[saveRiskProfile]', err.message);
          showPrefSaveStatus('Errore');
        });
    }

    if (riskSelect) {
      riskSelect.addEventListener('change', function () {
        saveRiskProfile('risk_tolerance', riskSelect.value);
      });
    }

    if (budgetInput) {
      budgetInput.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          const val = parseInt(budgetInput.value, 10);
          if (val >= 5 && val <= 10000) {
            saveRiskProfile('weekly_budget', val);
          }
        }, 800);
      });
    }

    if (maxSchedine) {
      maxSchedine.addEventListener('change', function () {
        saveRiskProfile('max_schedine_per_day', parseInt(maxSchedine.value, 10));
      });
    }
  }

  async function saveBetTracking(tipId, stake, notes, btn) {
    if (!session) return;

    btn.disabled = true;
    btn.textContent = 'Salvataggio...';

    try {
      const body = { tip_id: tipId };
      if (stake) body.stake = parseFloat(stake);
      if (notes) body.notes = notes;

      await authFetch('/api/user-bets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (userBetsMap[tipId]) {
        if (stake) userBetsMap[tipId].stake = parseFloat(stake);
        if (notes) userBetsMap[tipId].notes = notes;
      }

      btn.textContent = 'Salvato!';
      setTimeout(function () {
        btn.disabled = false;
        btn.textContent = 'Salva';
      }, 1500);
    } catch (err) {
      console.warn('[saveBetTracking]', err.message);
      btn.textContent = 'Errore';
      setTimeout(function () {
        btn.disabled = false;
        btn.textContent = 'Salva';
      }, 1500);
    }
  }

  // ─── LOGOUT ─────────────────────────────────────────────

  function setupLogout() {
    document.getElementById('logoutBtn').addEventListener('click', async function (e) {
      e.preventDefault();
      if (notifInterval) {
        clearInterval(notifInterval);
        notifInterval = null;
      }
      await SupabaseConfig.signOut();
      window.location.href = '/';
    });
  }

  // ─── CHECKOUT FEEDBACK ──────────────────────────────────

  function handleCheckoutFeedback() {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const fromPortal = params.get('from') === 'portal';

    if (checkout === 'success') {
      // Imposta il flag — loadProfile mostrerà l'alert e avvierà il polling se necessario
      checkoutJustCompleted = true;
      window.history.replaceState({}, '', '/dashboard.html');
    } else if (checkout === 'cancelled') {
      showAlert('Pagamento annullato. Puoi riprovare quando vuoi.', 'error');
      window.history.replaceState({}, '', '/dashboard.html');
    } else if (fromPortal) {
      // Ritorno dal Customer Portal: ripeti loadProfile dopo 3s per recepire
      // eventuali aggiornamenti al tier arrivati via webhook (es. cancellazione).
      window.history.replaceState({}, '', '/dashboard.html');
      setTimeout(function () {
        if (session) loadProfile();
      }, 3000);
    }
  }

  /**
   * Polling su Supabase finché il tier non passa da free a pro/vip.
   * Serve quando il webhook di Stripe è leggermente in ritardo rispetto al redirect.
   * @param {string} userId
   */
  async function pollForSubscriptionUpgrade(userId) {
    const MAX_ATTEMPTS = 8;
    const INTERVAL_MS = 2000;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await new Promise(function (resolve) { setTimeout(resolve, INTERVAL_MS); });

      const result = await SupabaseConfig.client
        .from('profiles')
        .select('tier')
        .eq('user_id', userId)
        .single();

      const freshTier = result.data && result.data.tier;
      if (freshTier && freshTier !== 'free') {
        profile.tier = freshTier;
        const tierLabel = document.getElementById('tierLabel');
        const tierBadge = document.getElementById('tierBadge');
        if (tierLabel) tierLabel.textContent = freshTier.toUpperCase();
        if (tierBadge) tierBadge.className = 'dash-tier-badge dash-tier-badge--' + freshTier;
        await updateSubscriptionUI(freshTier);
        showAlert('Abbonamento attivato con successo! Benvenuto.', 'success');
        return;
      }
    }

    // Polling esaurito senza aggiornamento tier — verifica se esiste una subscription attiva.
    // Se sì: webhook lento, invita a ricaricare. Se no: pagamento fallito.
    const subCheck = await SupabaseConfig.client
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1);

    if (subCheck.data && subCheck.data.length > 0) {
      showAlert('Abbonamento attivato! Se il badge non si aggiorna, ricarica la pagina.', 'success');
    } else {
      showAlert('Il pagamento non è andato a buon fine. Riprova o contatta il supporto.', 'error');
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
    try {
      const statusEl = document.getElementById('telegramStatus');
      const linkBtn = document.getElementById('linkTelegramBtn');

      const result = await SupabaseConfig.client
        .from('profiles')
        .select('telegram_user_id')
        .eq('user_id', session.user.id)
        .single();

      if (result.error && result.error.code !== 'PGRST116') {
        console.warn('[loadTelegramStatus]', result.error.message);
      }

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
    } catch (err) {
      console.error('[loadTelegramStatus]', err.message || err);
      showAlert('Errore di connessione. Ricarica la pagina.', 'error');
    }
  }

  async function handleLinkTelegram() {
    const linkBtn = document.getElementById('linkTelegramBtn');
    linkBtn.disabled = true;
    linkBtn.textContent = UI_TEXT.loading;

    try {
      const data = await authFetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (data.already_linked) {
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
    } catch (err) {
      console.warn('[handleLinkTelegram]', err.message);
      showAlert(UI_TEXT.networkError, 'error');
    } finally {
      linkBtn.disabled = false;
      linkBtn.textContent = 'Collega Telegram';
    }
  }

  function pollTelegramLink() {
    let attempts = 0;
    const maxAttempts = 20;

    const interval = setInterval(async function () {
      try {
        attempts++;

        const result = await SupabaseConfig.client
          .from('profiles')
          .select('telegram_user_id')
          .eq('user_id', session.user.id)
          .single();

        if (result.error && result.error.code !== 'PGRST116') {
          console.warn('[pollTelegramLink]', result.error.message);
        }

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
      } catch (err) {
        console.warn('[pollTelegramLink]', err.message);
        clearInterval(interval);
      }
    }, 3000);
  }

  // ─── BANKROLL CALCULATOR ──────────────────────────────

  function setupBankrollCalculator() {
    const calcBtn = document.getElementById('calcBankrollBtn');
    if (!calcBtn) return;

    calcBtn.addEventListener('click', calculateBankroll);
  }

  function calculateBankroll() {
    const input = document.getElementById('bankrollInput');
    const resultsEl = document.getElementById('bankrollResults');
    const summaryEl = document.getElementById('bankrollSummary');
    const tbodyEl = document.getElementById('bankrollTableBody');
    if (!input || !resultsEl || !summaryEl || !tbodyEl) return;

    const bankroll = parseFloat(input.value) || 100;
    if (bankroll < 10) {
      showToast('Il bankroll minimo \u00E8 10\u20AC', 'error');
      return;
    }
    if (bankroll > 100000) {
      showToast('Il bankroll massimo \u00E8 100.000\u20AC', 'error');
      return;
    }

    // Collect today's pending tips from the already-loaded grid
    const tipCards = document.querySelectorAll('#dashTipsGrid .tip-card:not(.tip-card--started)');
    const tips = [];

    tipCards.forEach(function (card) {
      const predEl = card.querySelector('.pick-value');
      const oddsEl = card.querySelector('.odds-value');
      const confEl = card.querySelector('.confidence-value');
      const teamsEls = card.querySelectorAll('.dash-tip-team');

      if (!predEl || !oddsEl || teamsEls.length < 2) return;

      const confidence = parseInt((confEl && confEl.textContent) || '70', 10);
      const odds = parseFloat(oddsEl.textContent) || 0;
      const prediction = predEl.textContent || '';
      const matchName = teamsEls[0].textContent + ' vs ' + teamsEls[1].textContent;

      if (prediction && odds > 0) {
        tips.push({
          matchName: matchName,
          prediction: prediction,
          odds: odds,
          confidence: confidence,
        });
      }
    });

    if (tips.length === 0) {
      showToast('Nessun pronostico disponibile per il calcolo', 'info');
      return;
    }

    // Fixed-percentage staking: 2-5% scaled by confidence
    // confidence 60% -> 2%, confidence 90% -> 5%
    const MIN_PCT = 0.02;
    const MAX_PCT = 0.05;
    const MIN_CONF = 60;
    const MAX_CONF = 90;

    let totalStake = 0;
    tbodyEl.textContent = '';

    tips.forEach(function (tip) {
      const clampedConf = Math.max(MIN_CONF, Math.min(MAX_CONF, tip.confidence));
      const pct =
        MIN_PCT + ((clampedConf - MIN_CONF) / (MAX_CONF - MIN_CONF)) * (MAX_PCT - MIN_PCT);
      const stake = Math.round(bankroll * pct * 100) / 100;
      totalStake += stake;

      const tr = document.createElement('tr');

      const tdMatch = document.createElement('td');
      tdMatch.textContent = tip.matchName;
      tr.appendChild(tdMatch);

      const tdPred = document.createElement('td');
      tdPred.textContent = tip.prediction;
      tr.appendChild(tdPred);

      const tdConf = document.createElement('td');
      tdConf.textContent = tip.confidence + '%';
      tr.appendChild(tdConf);

      const tdStake = document.createElement('td');
      tdStake.className = 'bankroll-stake-cell';
      tdStake.textContent = stake.toFixed(2) + ' \u20AC';
      tr.appendChild(tdStake);

      tbodyEl.appendChild(tr);
    });

    // Summary (using safe DOM methods — no innerHTML)
    const remainingBankroll = bankroll - totalStake;
    summaryEl.textContent = '';

    const rows = [
      { label: 'Investimento totale:', value: totalStake.toFixed(2) + ' \u20AC' },
      { label: 'Bankroll rimanente:', value: remainingBankroll.toFixed(2) + ' \u20AC' },
      { label: '% investito:', value: ((totalStake / bankroll) * 100).toFixed(1) + '%' },
    ];

    rows.forEach(function (row) {
      const div = document.createElement('div');
      div.className = 'bankroll-summary-row';
      const labelSpan = document.createElement('span');
      labelSpan.textContent = row.label;
      div.appendChild(labelSpan);
      const valueStrong = document.createElement('strong');
      valueStrong.textContent = row.value;
      div.appendChild(valueStrong);
      summaryEl.appendChild(div);
    });

    resultsEl.style.display = '';
  }

  // ─── HELPERS ────────────────────────────────────────────

  function formatDate(iso) {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    return d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /**
   * Inietta i prezzi tier dalla configurazione centralizzata nel DOM.
   * Aggiorna gli elementi con data-tier="pro" e data-tier="vip".
   */
  function injectTierPrices() {
    document.querySelectorAll('[data-tier]').forEach(function (priceEl) {
      const tier = priceEl.getAttribute('data-tier');
      if (!TIER_PRICES[tier]) return;

      const config = TIER_PRICES[tier];
      const amountEl = priceEl.querySelector('.upgrade-card__amount, .price-amount');
      const decimalEl = priceEl.querySelector('.upgrade-card__decimal, .price-decimal');

      if (amountEl && decimalEl) {
        const parts = config.amount.toString().split('.');
        amountEl.textContent = parts[0];
        decimalEl.textContent = parts[1] ? '.' + parts[1] : '';
      }
    });
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

  // Language toggle delegated to shared.js
  injectTierPrices();
  initCopyrightYear();
  initLangToggle();
})();
