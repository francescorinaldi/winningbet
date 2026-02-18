/* ============================================
   WinningBet — Script
   ============================================
   Frontend IIFE che gestisce tutte le interazioni del sito:
   - Sistema di particelle animato (Canvas 2D)
   - Effetti di scroll (navbar, reveal, counter)
   - Caricamento dati live via API (/api/matches, /api/results)
   - Rendering dinamico delle tip card e dei risultati
   - Filtri, FAQ accordion, smooth scroll

   Il codice e' organizzato in sezioni logiche. Nessuna
   dipendenza esterna: usa esclusivamente API del browser
   (Canvas, Fetch, IntersectionObserver, requestAnimationFrame).
   ============================================ */

/* global initParticles, initMobileMenu, initLangToggle, initCookieBanner, initCopyrightYear, LEAGUE_NAMES_MAP, TIER_PRICES, getCurrentSeasonDisplay, getLocale, setErrorState, REDUCED_MOTION, createEl, buildMatchCard, buildResultItem, buildTipResultItem, buildTipCard, canAccessTier, setEmptyState, activateConfidenceBars */

(function () {
  'use strict';

  // ==========================================
  // PARTICLE SYSTEM (delegated to shared.js)
  // ==========================================
  initParticles({ maxParticles: 80, densityDivisor: 15, connections: true });

  // ==========================================
  // NAVBAR SCROLL EFFECT
  // ==========================================
  // Aggiunge la classe .scrolled alla navbar dopo 60px di scroll.
  // Lo stato .scrolled attiva backdrop-filter blur e bordo inferiore
  // definiti in styles.css.

  const navbar = document.getElementById('navbar');

  /**
   * Handler per l'evento scroll. Aggiunge/rimuove la classe
   * .scrolled sulla navbar in base alla posizione di scroll.
   */
  function handleNavScroll() {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', handleNavScroll, { passive: true });

  // ==========================================
  // MOBILE MENU (delegated to shared.js)
  // ==========================================
  initMobileMenu();

  // ==========================================
  // COUNTER ANIMATION
  // ==========================================
  // Animazione numerica che conta da 0 al valore target
  // definito nell'attributo data-count dell'elemento.
  // Usa easing cubico (ease-out) per un effetto di decelerazione.

  /**
   * Anima un contatore numerico da 0 al valore data-count dell'elemento.
   * Durata fissa di 2 secondi con easing cubico (1 - (1-t)^3).
   * Il numero viene formattato con separatore italiano (punto per le migliaia).
   * @param {HTMLElement} el - Elemento con attributo data-count
   */
  function animateCounter(el) {
    const target = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(target) || target === 0) return;

    // Skip animation for users who prefer reduced motion
    if (REDUCED_MOTION) {
      el.textContent = target.toLocaleString(getLocale());
      return;
    }

    const duration = 2000;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);

      el.textContent = current.toLocaleString(getLocale());

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = target.toLocaleString(getLocale());
      }
    }

    requestAnimationFrame(update);
  }

  // ==========================================
  // SCROLL REVEAL & TRIGGERS
  // ==========================================
  // Sistema di animazioni on-scroll basato su IntersectionObserver.
  // Gli elementi con classe .reveal partono con opacity:0 e translateY(40px),
  // e diventano visibili (classe .visible) quando entrano nel viewport.
  // Ogni observer gestisce un tipo diverso di animazione:
  // - revealObserver: fade-in/slide-up generico
  // - counterObserver: trigger per animazioni counter
  // - confidenceObserver: riempimento barre di confidence
  // - chartObserver: animazione barre del grafico con stagger

  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -60px 0px',
    threshold: 0.1,
  };

  // Reveal elements — aggiunge .reveal a card, stat, pricing, ecc.
  // Fix: if navigating via hash (e.g. /#stats), elements already in viewport
  // get .reveal + .visible simultaneously to prevent flash.
  const revealElements = document.querySelectorAll(
    '.tip-card, .stat-card, .pricing-card, .faq-item, .telegram-card, .recent-results',
  );

  const hasHash = window.location.hash.length > 1;

  // If reduced motion, make everything visible immediately — no fade-in animations
  if (REDUCED_MOTION) {
    revealElements.forEach(function (el) {
      el.classList.add('reveal', 'visible');
    });
  } else {
    revealElements.forEach(function (el) {
      if (hasHash) {
        const rect = el.getBoundingClientRect();
        const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
        if (inViewport) {
          el.classList.add('reveal', 'visible');
          return;
        }
      }
      el.classList.add('reveal');
    });

    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, observerOptions);

    revealElements.forEach(function (el) {
      if (!el.classList.contains('visible')) {
        revealObserver.observe(el);
      }
    });
  }

  // Counter triggers — attiva animateCounter al primo scroll su [data-count]
  const counterElements = document.querySelectorAll('[data-count]');
  const counterTriggered = new Set();

  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !counterTriggered.has(entry.target)) {
          counterTriggered.add(entry.target);
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 },
  );

  counterElements.forEach((el) => counterObserver.observe(el));

  // Confidence bars — riempie la barra al valore data-confidence (%)
  const confidenceFills = document.querySelectorAll('.confidence-fill');

  const confidenceObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const confidence = entry.target.getAttribute('data-confidence');
          entry.target.style.width = confidence + '%';
          confidenceObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 },
  );

  confidenceFills.forEach((el) => confidenceObserver.observe(el));

  // Chart bars — anima le barre del grafico mensile con delay staggerato
  const chartBars = document.querySelectorAll('.chart-bar');

  const chartObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const bars = entry.target.closest('.chart').querySelectorAll('.chart-bar');
          bars.forEach((bar, index) => {
            setTimeout(() => {
              const value = bar.getAttribute('data-value');
              const fill = bar.querySelector('.chart-fill');
              fill.style.height = (value / 140) * 100 + '%';
              bar.classList.add('animated');
            }, index * 150);
          });
          chartObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 },
  );

  if (chartBars.length > 0) {
    chartObserver.observe(chartBars[0]);
  }

  // ==========================================
  // TIPS FILTER
  // ==========================================
  // Filtra le tip card per tier (all/free/pro/vip).
  // Funziona anche con card caricate dinamicamente via API.
  // Le card filtrate vengono nascoste con display:none,
  // quelle visibili hanno un'animazione fade-in.

  const filterBtns = document.querySelectorAll('.filter-btn');

  /** Inizializza i listener sui bottoni filtro della sezione tips. */
  function initTipsFilter() {
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');

        const filter = btn.getAttribute('data-filter');
        const cards = document.querySelectorAll('.tip-card');

        cards.forEach(function (card) {
          const tier = card.getAttribute('data-tier');
          if (filter === 'all' || tier === filter) {
            card.style.display = '';
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            requestAnimationFrame(function () {
              card.style.transition = 'all 0.4s ease';
              card.style.opacity = '1';
              card.style.transform = 'translateY(0)';
            });
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  initTipsFilter();

  // ==========================================
  // FAQ ACCORDION
  // ==========================================
  // Accordion con mutua esclusione: un solo item aperto alla volta.
  // Cliccando su un item gia' aperto lo chiude (toggle).
  // L'animazione e' gestita via CSS (max-height transition).

  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach((item) => {
    const question = item.querySelector('.faq-question');
    // Set initial ARIA state
    question.setAttribute('aria-expanded', 'false');
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach((i) => {
        i.classList.remove('active');
        i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });
      if (!isActive) {
        item.classList.add('active');
        question.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ==========================================
  // SMOOTH SCROLL FOR ANCHOR LINKS
  // ==========================================
  // Intercetta i click su link ancora (href="#...") e scrolla
  // in modo fluido alla sezione corrispondente, tenendo conto
  // dell'altezza della navbar fixed + 20px di padding.

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navHeight = navbar.offsetHeight;
        const targetPos = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;
        window.scrollTo({ top: targetPos, behavior: 'smooth' });
      }
    });
  });

  // ==========================================
  // STAGGER REVEAL FOR GRID ITEMS
  // ==========================================
  // Applica un transition-delay incrementale (0.1s * indice)
  // ai figli delle griglie tips, pricing e stats per creare
  // un effetto di apparizione sequenziale.

  const staggerContainers = document.querySelectorAll('.tips-grid, .pricing-grid, .stats-grid');

  staggerContainers.forEach((container) => {
    const children = container.children;
    Array.from(children).forEach((child, index) => {
      child.style.transitionDelay = index * 0.1 + 's';
    });
  });

  // ==========================================
  // LEAGUE SWITCHING
  // ==========================================
  // Gestisce la selezione della lega e il reload dei dati.

  let currentLeague = 'all';

  // Build LEAGUE_NAMES from shared LEAGUE_NAMES_MAP (add season + 'all' entry)
  const currentSeason = getCurrentSeasonDisplay();
  const LEAGUE_NAMES = { all: { label: 'Tutte le Leghe', season: currentSeason } };
  Object.keys(LEAGUE_NAMES_MAP).forEach(function (slug) {
    LEAGUE_NAMES[slug] = { label: LEAGUE_NAMES_MAP[slug].full, season: currentSeason };
  });

  const ALL_LEAGUE_SLUGS = [
    'serie-a',
    'champions-league',
    'la-liga',
    'premier-league',
    'ligue-1',
    'bundesliga',
    'eredivisie',
  ];

  function initLeagueSelector() {
    const selector = document.getElementById('leagueSelector');
    if (!selector) return;

    const buttons = selector.querySelectorAll('.league-btn');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const league = btn.getAttribute('data-league');
        if (league === currentLeague) return;

        buttons.forEach(function (b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');

        currentLeague = league;
        updateLeagueLabels();
        loadMatches().catch(function (err) { console.warn('[league] loadMatches:', err.message); });
        loadResults().then(loadTrackRecord).catch(function (err) { console.warn('[league] loadResults/trackRecord:', err.message); });
        loadTipsFromAPI().catch(function (err) { console.warn('[league] loadTipsFromAPI:', err.message); });
      });
    });
  }

  function updateLeagueLabels() {
    const info = LEAGUE_NAMES[currentLeague] || LEAGUE_NAMES['serie-a'];

    const badgeText = document.getElementById('heroBadgeText');
    if (badgeText) {
      badgeText.textContent = info.label.toUpperCase() + ' \u00B7 ' + info.season;
    }

    const liveBarLabel = document.getElementById('liveBarLabel');
    if (liveBarLabel) {
      liveBarLabel.textContent = 'PROSSIME PARTITE \u2014 ' + info.label.toUpperCase();
    }
  }

  // ==========================================
  // LIVE DATA — API FETCHING
  // ==========================================
  // Carica dati dalle serverless functions Vercel (/api/*)
  // e renderizza dinamicamente nel DOM le sezioni:
  // - Live Matches Bar (prossime partite)
  // - Tips del Giorno (pronostici generati dalle partite reali)
  // - Ultimi Risultati (risultati recenti con badge Over/Under)

  /**
   * Wrapper generico per le chiamate alle API interne.
   * @param {string} endpoint - Nome dell'endpoint (es. "matches", "results")
   * @param {Object} params - Query parameters opzionali
   * @returns {Promise<*>} Dati JSON dalla risposta
   * @throws {Error} Se la risposta non e' ok (status != 2xx)
   */
  async function fetchAPI(endpoint, params) {
    let url = '/api/' + endpoint;
    if (params) {
      const qs = Object.entries(params)
        .map(function (pair) {
          return encodeURIComponent(pair[0]) + '=' + encodeURIComponent(pair[1]);
        })
        .join('&');
      if (qs) url += '?' + qs;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API ${endpoint}: ${res.status}`);
    return res.json();
  }

  /**
   * Carica le prossime partite da /api/matches e genera le tip card.
   * Crea 3 card: 1 FREE + 1 PRO + 1 VIP.
   * Servono almeno 3 partite, altrimenti mostra stato vuoto.
   * Dopo il rendering attiva le animazioni (confidence bars, reveal).
   */
  async function loadTips() {
    const container = document.getElementById('tipsGrid');
    try {
      const matches = await fetchAPI('fixtures', { type: 'matches', league: currentLeague });
      if (!matches || matches.length < 3) {
        setEmptyState(container, 'tips-empty', 'Nessun pronostico disponibile al momento');
        return;
      }
      container.textContent = '';

      // Card 1: FREE (prima partita)
      container.appendChild(buildTipCard(matches[0], 'free', homepageUserTier));
      // Card 2: PRO (seconda partita)
      container.appendChild(buildTipCard(matches[1], 'pro', homepageUserTier));
      // Card 3: VIP (terza partita)
      container.appendChild(buildTipCard(matches[2], 'vip', homepageUserTier));

      // Attiva barre di confidence sui nuovi elementi
      activateConfidenceBars(container);

      // Animazione reveal con stagger sulle nuove card
      const cards = container.querySelectorAll('.tip-card');
      cards.forEach(function (card, i) {
        card.classList.add('reveal');
        card.style.transitionDelay = i * 0.1 + 's';
        requestAnimationFrame(function () {
          card.classList.add('visible');
        });
      });
    } catch (err) {
      console.error('loadTips failed:', err);
      setErrorState(container, 'Impossibile caricare i pronostici', loadTips);
    }
  }

  /**
   * Carica le prossime partite da /api/matches e le renderizza
   * nella Live Matches Bar (scroll orizzontale).
   */
  async function loadMatches() {
    const container = document.getElementById('matchesScroll');
    try {
      let matches;
      if (currentLeague === 'all') {
        const results = await Promise.all(
          ALL_LEAGUE_SLUGS.map(function (slug) {
            return fetchAPI('fixtures', { type: 'matches', league: slug }).catch(function () {
              return [];
            });
          }),
        );
        matches = results.flat().sort(function (a, b) {
          return new Date(a.date) - new Date(b.date);
        });
      } else {
        matches = await fetchAPI('fixtures', { type: 'matches', league: currentLeague });
      }

      if (!matches || matches.length === 0) {
        setEmptyState(container, 'matches-empty', 'Nessuna partita in programma');
        return;
      }
      container.textContent = '';

      // Crea il track wrapper per il ticker
      const track = createEl('div', 'matches-track');
      matches.forEach(function (m) {
        track.appendChild(buildMatchCard(m));
      });

      // Duplica le card per un loop seamless
      matches.forEach(function (m) {
        track.appendChild(buildMatchCard(m));
      });

      container.appendChild(track);

      // Calcola la durata in base al numero di card (3s per card)
      const duration = matches.length * 3;
      track.style.setProperty('--ticker-duration', duration + 's');
    } catch (err) {
      console.error('loadMatches failed:', err);
      setErrorState(container, 'Impossibile caricare le partite', loadMatches);
    }
  }

  /**
   * Carica gli ultimi risultati da /api/results e li renderizza
   * nella sezione Ultimi Risultati con badge Over/Under 2.5.
   */
  async function loadResults() {
    const container = document.getElementById('resultsList');
    try {
      let results;
      if (currentLeague === 'all') {
        const responses = await Promise.all(
          ALL_LEAGUE_SLUGS.map(function (slug) {
            return fetchAPI('fixtures', { type: 'results', league: slug }).catch(function () {
              return [];
            });
          }),
        );
        results = responses.flat().sort(function (a, b) {
          return new Date(b.date) - new Date(a.date);
        });
      } else {
        results = await fetchAPI('fixtures', { type: 'results', league: currentLeague });
      }

      if (!results || results.length === 0) {
        setEmptyState(container, 'results-empty', 'Nessun risultato disponibile');
        return;
      }
      container.textContent = '';
      results.forEach(function (r) {
        container.appendChild(buildResultItem(r));
      });
    } catch (err) {
      console.error('loadResults failed:', err);
      setErrorState(container, 'Impossibile caricare i risultati', loadResults);
    }
  }

  // ==========================================
  // AUTH STATE — Navbar UI + User Tier
  // ==========================================
  // Controlla se l'utente e' autenticato via Supabase,
  // aggiorna i bottoni della navbar e recupera il tier
  // per il rendering condizionale delle tip card.

  const navAuthBtn = document.getElementById('navAuthBtn');
  const navSubscribeBtn = document.getElementById('navSubscribeBtn');

  /** Tier dell'utente sulla homepage: null = non autenticato, 'free'/'pro'/'vip' */
  let homepageUserTier = null;

  /**
   * Aggiorna la navbar in base allo stato di autenticazione.
   * Se l'utente e' loggato: mostra "I Miei Tips" e nascondi "Abbonati Ora".
   * Se non loggato: mostra "Accedi" e "Abbonati Ora".
   * @param {Object|null} session - Sessione Supabase corrente
   */
  function updateNavForAuth(session) {
    if (session && navAuthBtn) {
      navAuthBtn.textContent = 'I Miei Tips';
      navAuthBtn.href = '/dashboard.html';
      if (navSubscribeBtn) navSubscribeBtn.style.display = 'none';
    }
  }

  /**
   * Carica il tier dell'utente autenticato dal profilo Supabase.
   * Aggiorna homepageUserTier e ricarica i tips per applicare il locking corretto.
   * @param {Object} session - Sessione Supabase attiva
   */
  async function loadHomepageUserTier(session) {
    try {
      const result = await SupabaseConfig.client
        .from('profiles')
        .select('tier')
        .eq('user_id', session.user.id)
        .single();
      homepageUserTier = (result.data && result.data.tier) || 'free';
    } catch (err) {
      console.error('loadHomepageUserTier failed:', err);
      homepageUserTier = 'free';
    }
    // Ricarica i tips con il tier aggiornato
    loadTipsFromAPI();
  }

  /**
   * Aggiorna i bottoni pricing per utenti autenticati.
   * Cambia href da /auth.html a /dashboard.html?upgrade=pro|vip.
   */
  function updatePricingForAuth() {
    const buttons = document.querySelectorAll('.pricing-card [data-plan]');
    buttons.forEach(function (btn) {
      const plan = btn.getAttribute('data-plan');
      if (plan === 'pro' || plan === 'vip') {
        btn.href = '/dashboard.html?upgrade=' + plan;
      }
    });
  }

  // Controlla la sessione all'avvio (solo se SupabaseConfig e' disponibile)
  if (typeof SupabaseConfig !== 'undefined') {
    SupabaseConfig.getSession()
      .then(function (result) {
        const session = (result && result.data && result.data.session) || null;
        updateNavForAuth(session);
        if (session) {
          loadHomepageUserTier(session); // this calls loadTipsFromAPI internally
          updatePricingForAuth();
        } else {
          // No session — load tips now (unauthenticated)
          loadTipsFromAPI().catch(function (err) { console.warn('[init] loadTipsFromAPI:', err.message); });
        }
      })
      .catch(function () {
        updateNavForAuth(null);
        loadTipsFromAPI().catch(function () { /* already logged */ });
      });

    SupabaseConfig.onAuthStateChange(function (_event, session) {
      updateNavForAuth(session);
      if (session) {
        loadHomepageUserTier(session);
        updatePricingForAuth();
      }
    });
  }

  // ==========================================
  // TRACK RECORD — Dynamic Stats from API
  // ==========================================
  // Carica le statistiche reali da /api/track-record
  // e aggiorna i valori visualizzati nel DOM.

  /**
   * Resets all track record UI elements to their default "no data" state (em dash).
   * Called before populating with new league data to prevent stale values
   * from the previous league persisting in the DOM.
   */
  function resetTrackRecordUI() {
    // Hero section
    const heroWinRate = findHeroStat('Win Rate');
    if (heroWinRate) {
      heroWinRate.setAttribute('data-count', '0');
      heroWinRate.textContent = '\u2014';
    }

    const heroWL = document.getElementById('heroWinLoss');
    if (heroWL) heroWL.textContent = '\u2014';

    const heroTips = findHeroStat('Tips Inviati');
    if (heroTips) {
      heroTips.setAttribute('data-count', '0');
      heroTips.textContent = '\u2014';
    }

    // Stat cards
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(function (card) {
      const label = card.querySelector('.stat-label');
      const value = card.querySelector('.stat-value');
      if (!label || !value) return;

      if (label.textContent === 'Win Rate') {
        value.setAttribute('data-count', '0');
        value.textContent = '\u2014';
      } else if (label.textContent === 'Vinti - Persi') {
        value.textContent = '\u2014';
      } else if (label.textContent === 'Quota Media') {
        value.textContent = '\u2014';
      }
    });

    // Individual stat elements
    const matchesEl = document.getElementById('statMatchesAnalyzed');
    if (matchesEl) {
      matchesEl.setAttribute('data-count', '0');
      matchesEl.textContent = '\u2014';
    }

    const dataPointsEl = document.getElementById('statDataPoints');
    if (dataPointsEl) {
      dataPointsEl.setAttribute('data-count', '0');
      dataPointsEl.textContent = '\u2014';
    }

    const roiEl = document.getElementById('statROI');
    if (roiEl) {
      roiEl.setAttribute('data-count', '0');
      roiEl.textContent = '\u2014';
    }
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
      const amountEl = priceEl.querySelector('.price-amount');
      const decimalEl = priceEl.querySelector('.price-decimal');

      if (amountEl && decimalEl) {
        const parts = config.amount.toString().split('.');
        amountEl.textContent = parts[0];
        decimalEl.textContent = parts[1] ? '.' + parts[1] : '';
      }
    });
  }

  /**
   * Carica le statistiche dal track record API e aggiorna il DOM.
   * Se won+lost===0: mostra stato "in costruzione" (em dash, pending count).
   * Se ci sono dati reali: aggiorna DOM con valori veri + trigger counter animation.
   * Se errore: lascia i placeholder em dash (stato onesto "nessun dato").
   */
  async function loadTrackRecord() {
    try {
      const data = await fetchAPI('stats', { type: 'track-record', league: currentLeague });
      if (!data) {
        resetTrackRecordUI();
        return;
      }

      // Reset stale values from previous league before populating
      resetTrackRecordUI();

      const won = data.won || 0;
      const lost = data.lost || 0;
      const settled = won + lost;

      // No settled tips yet — show "in costruzione" state
      if (settled === 0) {
        // Show pending count in hero if available
        if (data.total_tips > 0) {
          const heroTipsEl = findHeroStat('Tips Inviati');
          if (heroTipsEl) {
            heroTipsEl.setAttribute('data-count', data.total_tips);
            animateCounter(heroTipsEl);
          }
        }
        return;
      }

      // We have real data — update everything

      // Hero section stats
      const heroWinRate = findHeroStat('Win Rate');
      if (heroWinRate) {
        heroWinRate.setAttribute('data-count', Math.round(data.win_rate));
        animateCounter(heroWinRate);
      }

      const heroWL = document.getElementById('heroWinLoss');
      if (heroWL) {
        heroWL.textContent = '';
        heroWL.appendChild(createEl('span', 'stat-won', won + 'W'));
        heroWL.appendChild(createEl('span', 'stat-sep', '\u2009\u2014\u2009'));
        heroWL.appendChild(createEl('span', 'stat-lost', lost + 'L'));
      }

      const heroTips = findHeroStat('Tips Inviati');
      if (heroTips) {
        heroTips.setAttribute('data-count', data.total_tips);
        animateCounter(heroTips);
      }

      // Track record stat cards
      const statCards = document.querySelectorAll('.stat-card');
      statCards.forEach(function (card) {
        const label = card.querySelector('.stat-label');
        const value = card.querySelector('.stat-value');
        if (!label || !value) return;

        if (label.textContent === 'Win Rate' && value.hasAttribute('data-count')) {
          value.setAttribute('data-count', Math.round(data.win_rate));
          animateCounter(value);
        } else if (label.textContent === 'Vinti - Persi') {
          value.textContent = '';
          const wonSpan = createEl('span', 'stat-won', won + 'W');
          const sep = createEl('span', 'stat-sep', '\u2009\u2014\u2009');
          const lostSpan = createEl('span', 'stat-lost', lost + 'L');
          value.appendChild(wonSpan);
          value.appendChild(sep);
          value.appendChild(lostSpan);
        } else if (label.textContent === 'Quota Media') {
          value.textContent = data.avg_odds.toFixed(2);
        }
      });

      // Populate recent results with settled tips (won + close losses only)
      if (data.recent && data.recent.length > 0) {
        const container = document.getElementById('resultsList');
        if (container) {
          container.textContent = '';
          const filtered = data.recent.filter(function (tip) {
            return tip.status === 'won';
          });
          filtered.forEach(function (tip) {
            container.appendChild(buildTipResultItem(tip));
          });
        }
      }

      // Populate new stat cards
      const matchesEl = document.getElementById('statMatchesAnalyzed');
      if (matchesEl && data.matches_analyzed) {
        matchesEl.setAttribute('data-count', data.matches_analyzed);
        animateCounter(matchesEl);
      }

      const dataPointsEl = document.getElementById('statDataPoints');
      if (dataPointsEl && data.data_points) {
        dataPointsEl.setAttribute('data-count', data.data_points);
        animateCounter(dataPointsEl);
      }

      const roiEl = document.getElementById('statROI');
      if (roiEl) {
        const roiVal = Math.round(data.roi || 0);
        roiEl.setAttribute('data-count', roiVal);
        animateCounter(roiEl);
      }
    } catch (err) {
      console.error('loadTrackRecord failed:', err);
      resetTrackRecordUI();
      const container = document.getElementById('resultsList');
      if (container) setErrorState(container, 'Impossibile caricare i risultati', loadTrackRecord);
    }
  }

  /**
   * Finds a hero stat value element by its label text.
   * @param {string} labelText - The label to search for (e.g. "Win Rate")
   * @returns {HTMLElement|null} The .hero-stat-value element, or null
   */
  function findHeroStat(labelText) {
    const stats = document.querySelectorAll('.hero-stat');
    for (let i = 0; i < stats.length; i++) {
      const label = stats[i].querySelector('.hero-stat-label');
      if (label && label.textContent === labelText) {
        return stats[i].querySelector('.hero-stat-value[data-count]');
      }
    }
    return null;
  }

  /**
   * Tenta di caricare i tips dal database (API).
   * Mostra sempre tutte e 3 le tier (free, pro, vip) sulla homepage.
   * Se l'utente non ha accesso a un tier, mostra card bloccate con benefici.
   * Se il database non ha tips, usa il fallback client-side.
   */
  async function loadTipsFromAPI() {
    try {
      // Fetch tips con auth se disponibile, altrimenti solo free
      const fetchOptions = {};
      if (typeof SupabaseConfig !== 'undefined') {
        const sessionResult = await SupabaseConfig.getSession();
        if (sessionResult && sessionResult.data && sessionResult.data.session) {
          fetchOptions.headers = {
            Authorization: 'Bearer ' + sessionResult.data.session.access_token,
          };
        }
      }

      const url = '/api/tips?league=' + encodeURIComponent(currentLeague);
      const response = await fetch(url, fetchOptions);
      const tips = await response.json();

      if (!tips || !Array.isArray(tips) || tips.length === 0) {
        // Fallback: genera tips client-side dalle partite
        loadTips();
        return;
      }

      // Homepage: hide tips for matches that have already started
      // (masks lost/losing predictions during live matches)
      const now = new Date();
      const upcomingTips = tips.filter(function (tip) {
        return new Date(tip.match_date) > now;
      });

      if (upcomingTips.length === 0) {
        loadTips();
        return;
      }

      const container = document.getElementById('tipsGrid');
      container.textContent = '';

      // Renderizza i tips dal database
      upcomingTips.forEach(function (tip) {
        const match = {
          date: tip.match_date,
          home: tip.home_team,
          away: tip.away_team,
        };
        container.appendChild(buildTipCard(match, tip, homepageUserTier));
      });

      // Verifica quali tier sono presenti nei tips dal database
      const tiersPresent = new Set();
      upcomingTips.forEach(function (tip) {
        tiersPresent.add(tip.tier);
      });

      // Se mancano tier, genera card bloccate sample dalle partite
      const missingTiers = ['free', 'pro', 'vip'].filter(function (t) {
        return !tiersPresent.has(t) && !canAccessTier(homepageUserTier, t);
      });

      if (missingTiers.length > 0) {
        try {
          const matches = await fetchAPI('fixtures', { type: 'matches', league: currentLeague });
          if (matches && matches.length > 0) {
            let matchIndex = 0;
            missingTiers.forEach(function (tier) {
              if (matchIndex < matches.length) {
                container.appendChild(buildTipCard(matches[matchIndex], tier, homepageUserTier));
                matchIndex++;
              }
            });
          }
        } catch (matchErr) {
          console.error('loadTipsFromAPI fixtures fetch failed:', matchErr);
        }
      }

      activateConfidenceBars(container);

      const cards = container.querySelectorAll('.tip-card');
      cards.forEach(function (card, i) {
        card.classList.add('reveal');
        card.style.transitionDelay = i * 0.1 + 's';
        requestAnimationFrame(function () {
          card.classList.add('visible');
        });
      });
    } catch (err) {
      console.error('loadTipsFromAPI failed:', err);
      // Fallback: genera tips client-side
      loadTips();
    }
  }

  // Cookie banner + language toggle delegated to shared.js

  // Avvia il caricamento dati al ready della pagina
  injectTierPrices();
  initLeagueSelector();
  loadMatches().catch(function (err) { console.warn('[init] loadMatches:', err.message); });
  loadResults().then(loadTrackRecord).catch(function (err) { console.warn('[init] loadResults/trackRecord:', err.message); });
  // Tips loaded after auth check to avoid double fetch (#73).
  // If SupabaseConfig unavailable, load immediately.
  if (typeof SupabaseConfig === 'undefined') {
    loadTipsFromAPI().catch(function (err) { console.warn('[init] loadTipsFromAPI:', err.message); });
  }
  initCookieBanner();
  initCopyrightYear();
  initLangToggle();
})();
