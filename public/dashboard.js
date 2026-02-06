/**
 * Dashboard — WinningBet
 *
 * Area personale utente. Richiede autenticazione.
 * Gestisce: tips giornalieri, storico pronostici, account e abbonamento.
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
  let currentLeague = localStorage.getItem('wb_dashboard_league') || 'serie-a';

  // ─── INIT ───────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    checkAuth();
    setupTabs();
    setupHistoryFilters();
    setupLeagueSelector();
    setupLogout();
    handleCheckoutFeedback();
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
  }

  // ─── PROFILE ────────────────────────────────────────────

  /**
   * Carica il profilo utente da Supabase e aggiorna la UI.
   */
  async function loadProfile() {
    const user = session.user;

    // Carica profilo dal database
    const result = await SupabaseConfig.client
      .from('profiles')
      .select('display_name, tier, stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    profile = result.data;

    // Risolvi display name: Auth metadata ha priorità (fonte di verità dell'utente),
    // poi profilo DB, poi fallback a email prefix
    const meta = user.user_metadata || {};
    const authName = meta.display_name || meta.full_name || meta.name || '';
    const profileName = (profile && profile.display_name) || '';
    const emailPrefix = user.email.split('@')[0];

    // Usa Auth metadata se disponibile, altrimenti profilo DB, altrimenti email
    const rawName = authName || profileName || emailPrefix;
    const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    document.getElementById('userName').textContent = displayName;

    // Sincronizza profilo DB se Auth metadata ha un nome migliore
    if (authName && profile && profile.display_name !== authName) {
      SupabaseConfig.client
        .from('profiles')
        .update({ display_name: authName })
        .eq('user_id', user.id)
        .then();
    }

    // Tier badge
    const tier = (profile && profile.tier) || 'free';
    const tierLabel = document.getElementById('tierLabel');
    const tierBadge = document.getElementById('tierBadge');
    tierLabel.textContent = tier.toUpperCase();
    tierBadge.className = 'dash-tier-badge dash-tier-badge--' + tier;

    // Account tab info
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userDisplayName').textContent = displayName;
    document.getElementById('userSince').textContent = formatDate(user.created_at);

    // Subscription info
    updateSubscriptionUI(tier);

    // Telegram linking status
    loadTelegramStatus();
  }

  /**
   * Aggiorna la sezione abbonamento in base al tier.
   * @param {string} tier - Tier corrente ('free', 'pro', 'vip')
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

    // PRO o VIP — carica dettagli abbonamento
    subTier.textContent = tier === 'pro' ? 'PRO — €9.99/mese' : 'VIP — €29.99/mese';

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

    // Se PRO, mostra upgrade a VIP
    if (tier === 'pro') {
      upgradeBtn.textContent = 'Passa a VIP';
      upgradeBtn.style.display = '';
      upgradeBtn.onclick = function () {
        startCheckout('vip');
      };
    } else {
      upgradeBtn.style.display = 'none';
    }

    // Mostra gestione abbonamento
    if (profile && profile.stripe_customer_id) {
      manageSubBtn.style.display = '';
      manageSubBtn.onclick = openCustomerPortal;
    }
  }

  /**
   * Avvia il checkout Stripe per un piano.
   * @param {string} tier - 'pro' o 'vip'
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
   * Apre il Stripe Customer Portal per la gestione dell'abbonamento.
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
      const response = await fetch(
        '/api/tips?status=pending&limit=20&league=' + encodeURIComponent(currentLeague),
        { headers: { Authorization: 'Bearer ' + session.access_token } },
      );

      const tips = await response.json();

      if (!Array.isArray(tips) || tips.length === 0) {
        grid.textContent = '';
        emptyState.style.display = '';
        return;
      }

      emptyState.style.display = 'none';
      renderTipsGrid(grid, tips);
    } catch (_err) {
      grid.textContent = '';
      emptyState.style.display = '';
    }
  }

  /**
   * Renderizza la griglia di tips nel container.
   * @param {HTMLElement} container
   * @param {Array} tips
   */
  function renderTipsGrid(container, tips) {
    container.textContent = '';

    tips.forEach(function (tip) {
      const card = document.createElement('div');
      card.className = 'tip-card tip-card--' + tip.tier;

      const badge =
        tip.tier === 'free'
          ? 'tip-badge--free'
          : tip.tier === 'pro'
            ? 'tip-badge--pro'
            : 'tip-badge--vip';

      // Build card content
      const header = document.createElement('div');
      header.className = 'tip-card-header';

      const badgeEl = document.createElement('span');
      badgeEl.className = 'tip-badge ' + badge;
      badgeEl.textContent = tip.tier.toUpperCase();
      header.appendChild(badgeEl);

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
      pickValue.textContent = tip.prediction || '—';
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
      oddsValue.textContent = tip.odds ? parseFloat(tip.odds).toFixed(2) : '—';
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

        // Animate fill
        requestAnimationFrame(function () {
          barFill.style.width = tip.confidence + '%';
        });
      }

      // Analysis
      if (tip.analysis) {
        const analysis = document.createElement('div');
        analysis.className = 'tip-analysis';
        analysis.textContent = tip.analysis;
        card.appendChild(analysis);
      }

      container.appendChild(card);
    });
  }

  // ─── HISTORY ────────────────────────────────────────────

  /**
   * Carica lo storico completo dei tips.
   */
  async function loadHistory() {
    try {
      const headers = { Authorization: 'Bearer ' + session.access_token };
      let results = [];

      // Carica won, lost, void, pending in parallelo
      const statuses = ['won', 'lost', 'void', 'pending'];
      const leagueParam = '&league=' + encodeURIComponent(currentLeague);
      const promises = statuses.map(function (s) {
        return fetch('/api/tips?status=' + s + '&limit=50' + leagueParam, {
          headers: headers,
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

      // Ordina per data piu' recente
      allHistory = results.sort(function (a, b) {
        return new Date(b.match_date) - new Date(a.match_date);
      });

      renderHistory('all');
    } catch (_err) {
      document.getElementById('dashHistoryEmpty').style.display = '';
    }
  }

  /**
   * Renderizza lo storico filtrato per status.
   * @param {string} statusFilter - 'all', 'won', 'lost', 'pending'
   */
  function renderHistory(statusFilter) {
    const list = document.getElementById('dashHistoryList');
    const emptyState = document.getElementById('dashHistoryEmpty');

    const filtered =
      statusFilter === 'all'
        ? allHistory
        : allHistory.filter(function (t) {
            return t.status === statusFilter;
          });

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

      // Status indicator
      const statusEl = document.createElement('span');
      statusEl.className = 'dash-history-status dash-history-status--' + tip.status;
      if (tip.status === 'won') statusEl.textContent = '\u2713';
      else if (tip.status === 'lost') statusEl.textContent = '\u2717';
      else if (tip.status === 'void') statusEl.textContent = '\u2014';
      else statusEl.textContent = '\u25CF';
      item.appendChild(statusEl);

      // Match info
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

      // Prediction
      const pred = document.createElement('span');
      pred.className = 'dash-history-pred';
      pred.textContent = tip.prediction || '—';
      item.appendChild(pred);

      // Odds
      const odds = document.createElement('span');
      odds.className = 'dash-history-odds';
      odds.textContent = tip.odds ? parseFloat(tip.odds).toFixed(2) : '—';
      item.appendChild(odds);

      // Status badge
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

  // ─── TABS ───────────────────────────────────────────────

  /**
   * Setup navigazione tab nella dashboard.
   */
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

  /**
   * Setup filtri storico (won/lost/pending/all).
   */
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

  /**
   * Setup del selettore lega nella dashboard.
   * Salva la scelta in localStorage e ricarica tips/storico.
   */
  function setupLeagueSelector() {
    const selector = document.getElementById('dashLeagueSelector');
    if (!selector) return;

    // Ripristina selezione salvata
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

      // Ricarica dati per la nuova lega
      loadTodayTips();
      loadHistory();
    });
  }

  // ─── LOGOUT ─────────────────────────────────────────────

  /**
   * Setup bottone logout.
   */
  function setupLogout() {
    document.getElementById('logoutBtn').addEventListener('click', async function (e) {
      e.preventDefault();
      await SupabaseConfig.signOut();
      window.location.href = '/';
    });
  }

  // ─── CHECKOUT FEEDBACK ──────────────────────────────────

  /**
   * Mostra feedback dopo checkout Stripe (success/cancelled).
   */
  function handleCheckoutFeedback() {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');

    if (checkout === 'success') {
      showAlert('Abbonamento attivato con successo! Benvenuto.', 'success');
      // Pulisci URL
      window.history.replaceState({}, '', '/dashboard.html');
    } else if (checkout === 'cancelled') {
      showAlert('Pagamento annullato. Puoi riprovare quando vuoi.', 'error');
      window.history.replaceState({}, '', '/dashboard.html');
    }
  }

  /**
   * Mostra un messaggio di alert nella dashboard.
   * @param {string} message
   * @param {string} type - 'success' o 'error'
   */
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

  /**
   * Carica lo stato del collegamento Telegram dal profilo utente.
   * Mostra stato "collegato" o il pulsante per avviare il linking.
   */
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

  /**
   * Avvia il flusso di collegamento Telegram.
   * Chiama POST /api/link-telegram per ottenere il deep link e lo apre in un nuovo tab.
   */
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
        showAlert('Il tuo account Telegram è già collegato.', 'success');
        loadTelegramStatus();
        return;
      }

      if (data.url) {
        window.open(data.url, '_blank');
        showAlert(
          'Apri Telegram e premi START nel bot per completare il collegamento.',
          'success',
        );
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

  /**
   * Polling per verificare se l'utente ha completato il collegamento Telegram.
   * Controlla ogni 3 secondi per un massimo di 60 secondi (20 tentativi).
   */
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

  /**
   * Formatta una data ISO in formato italiano breve.
   * @param {string} iso - Data in formato ISO
   * @returns {string}
   */
  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /**
   * Formatta data e ora della partita.
   * @param {string} iso - Data in formato ISO
   * @returns {string}
   */
  function formatMatchDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return (
      d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) +
      ' — ' +
      d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    );
  }
})();
