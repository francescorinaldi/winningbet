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

/* global initParticles, initMobileMenu, initLangToggle, initCookieBanner, initCopyrightYear, LEAGUE_NAMES_MAP, TIER_PRICES */

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

    const duration = 2000;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);

      el.textContent = current.toLocaleString('it-IT');

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = target.toLocaleString('it-IT');
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
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach((i) => i.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
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
  const LEAGUE_NAMES = { all: { label: 'Tutte le Leghe', season: '2025/26' } };
  Object.keys(LEAGUE_NAMES_MAP).forEach(function (slug) {
    LEAGUE_NAMES[slug] = { label: LEAGUE_NAMES_MAP[slug].full, season: '2025/26' };
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
        loadMatches();
        loadResults().then(loadTrackRecord);
        loadTipsFromAPI();
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
   * Formatta una data ISO in formato breve italiano per le partite.
   * Esempio: "2025-09-15T18:45:00Z" -> "Lun 18:45"
   * @param {string} isoDate - Data in formato ISO 8601
   * @returns {string} Data formattata (giorno abbreviato + ora)
   */
  function formatMatchDate(isoDate) {
    const d = new Date(isoDate);
    const days = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    const day = days[d.getDay()];
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return day + ' ' + hours + ':' + mins;
  }

  /**
   * Formatta una data ISO in formato DD/MM per i risultati.
   * Esempio: "2025-09-15T18:45:00Z" -> "15/09"
   * @param {string} isoDate - Data in formato ISO 8601
   * @returns {string} Data formattata (giorno/mese)
   */
  function formatResultDate(isoDate) {
    const d = new Date(isoDate);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return day + '/' + month;
  }

  /**
   * Utility per creare un elemento DOM con classe e contenuto opzionali.
   * @param {string} tag - Tag HTML (es. "div", "span")
   * @param {string|null} className - Classe CSS (null per nessuna)
   * @param {string|null} textContent - Contenuto testuale (null per vuoto)
   * @returns {HTMLElement} Elemento creato
   */
  function createEl(tag, className, textContent) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent !== null && textContent !== undefined) el.textContent = textContent;
    return el;
  }

  /**
   * Costruisce una card partita per la Live Matches Bar.
   * Mostra giorno/ora e nomi delle due squadre.
   * @param {Object} m - Dati partita da /api/matches
   * @param {string} m.date - Data ISO della partita
   * @param {string} m.home - Nome squadra di casa
   * @param {string} m.away - Nome squadra ospite
   * @returns {HTMLElement} Elemento .match-card
   */
  function buildMatchCard(m) {
    const card = createEl('div', 'match-card');
    card.appendChild(createEl('div', 'match-time', formatMatchDate(m.date)));

    const teams = createEl('div', 'match-teams');
    const homeTeam = createEl('div', 'team');
    homeTeam.appendChild(createEl('span', 'team-name', m.home));
    teams.appendChild(homeTeam);
    teams.appendChild(createEl('span', 'match-vs', 'vs'));
    const awayTeam = createEl('div', 'team');
    awayTeam.appendChild(createEl('span', 'team-name', m.away));
    teams.appendChild(awayTeam);
    card.appendChild(teams);

    return card;
  }

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
  function buildResultItem(r) {
    const item = createEl('div', 'result-item');
    item.appendChild(createEl('span', 'result-date', formatResultDate(r.date)));
    item.appendChild(createEl('span', 'result-match', r.home + ' vs ' + r.away));
    item.appendChild(createEl('span', 'result-score', r.goalsHome + ' - ' + r.goalsAway));

    const totalGoals = (r.goalsHome || 0) + (r.goalsAway || 0);
    const badgeClass =
      totalGoals > 2 ? 'result-badge result-badge--over' : 'result-badge result-badge--under';
    const badgeText = totalGoals > 2 ? 'O 2.5' : 'U 2.5';
    item.appendChild(createEl('span', badgeClass, badgeText));

    return item;
  }

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
  function buildTipResultItem(tip) {
    const isWin = tip.status === 'won';
    const item = createEl(
      'div',
      'result-item ' + (isWin ? 'result-item--win' : 'result-item--loss'),
    );
    item.appendChild(createEl('span', 'result-status', isWin ? '\u2713' : '\u2717'));
    item.appendChild(createEl('span', 'result-date', formatResultDate(tip.match_date)));
    item.appendChild(createEl('span', 'result-match', tip.home_team + ' vs ' + tip.away_team));
    item.appendChild(createEl('span', 'result-pick', tip.prediction));
    item.appendChild(createEl('span', 'result-odds', '@' + Number(tip.odds).toFixed(2)));
    const badgeClass = 'result-badge ' + (isWin ? 'result-badge--win' : 'result-badge--loss');
    item.appendChild(createEl('span', badgeClass, isWin ? 'WIN' : 'LOSS'));
    return item;
  }

  /**
   * Mostra uno stato vuoto/errore in un container, sostituendo il contenuto.
   * @param {HTMLElement} container - Elemento contenitore
   * @param {string} className - Classe CSS per il messaggio
   * @param {string} message - Testo del messaggio
   */
  function setEmptyState(container, className, message) {
    container.textContent = '';
    container.appendChild(createEl('div', className, message));
  }

  // --- Tips generation from real matches ---
  // I pronostici mostrati sono generati lato client combinando dati
  // reali delle partite (da /api/matches) con previsioni e analisi
  // selezionate casualmente. Le card sono divise per tier:
  // - FREE: pronostico e analisi visibili
  // - PRO: pronostico visibile, analisi bloccata
  // - VIP: pronostico, quote e analisi bloccati
  // - MULTIPLA: combinata di 3 partite, parzialmente bloccata

  /** Pool di previsioni possibili per le tip card */
  const PREDICTIONS = [
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
  const ANALYSES = [
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
  function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Genera una quota casuale tra 1.30 e 3.50.
   * @returns {string} Quota con 2 decimali (es. "2.15")
   */
  function randomOdd() {
    return (1.3 + Math.random() * 2.2).toFixed(2);
  }

  /**
   * Genera un valore di confidence casuale tra 60% e 90%.
   * @returns {number} Valore intero tra 60 e 90
   */
  function randomConfidence() {
    return 60 + Math.floor(Math.random() * 31); // 60-90
  }

  /**
   * Abbrevia il nome di una squadra alle prime 3 lettere maiuscole.
   * Usato come placeholder nei cerchi team-logo.
   * @param {string} name - Nome completo della squadra
   * @returns {string} Abbreviazione di 3 caratteri (es. "JUV")
   */
  function teamAbbr(name) {
    return name.substring(0, 3).toUpperCase();
  }

  /**
   * Crea un'icona lucchetto SVG per le sezioni bloccate (PRO/VIP).
   * @returns {SVGElement} Elemento SVG del lucchetto
   */
  function buildLockSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '3');
    rect.setAttribute('y', '11');
    rect.setAttribute('width', '18');
    rect.setAttribute('height', '11');
    rect.setAttribute('rx', '2');
    rect.setAttribute('ry', '2');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M7 11V7a5 5 0 0110 0v4');
    svg.appendChild(rect);
    svg.appendChild(path);
    return svg;
  }

  /**
   * Costruisce l'overlay di blocco con proposta di valore per le tip card.
   * Mostra i benefit concreti del tier + CTA (login o upgrade).
   * @param {string} cardTier - Tier della card ('pro' o 'vip')
   * @param {string|null} userTier - Tier dell'utente (null se non autenticato)
   * @returns {HTMLElement} Elemento .locked-overlay
   */
  function buildLockedOverlay(cardTier, userTier) {
    const isVipCard = cardTier === 'vip';
    const isAuthenticated = userTier !== null;

    const overlayClass = isVipCard ? 'locked-overlay locked-overlay--gold' : 'locked-overlay';
    const overlay = createEl('div', overlayClass);
    overlay.appendChild(buildLockSvg());

    // Titolo con proposta di valore
    const title = isVipCard ? 'Pronostici VIP Esclusivi' : 'Sblocca i Pronostici PRO';
    overlay.appendChild(createEl('span', 'locked-overlay-title', title));

    // Lista benefit concreti
    const benefits = createEl('ul', 'locked-benefits');
    const benefitItems = isVipCard
      ? [
          'Tips VALUE ad alta quota',
          'Canale Telegram VIP privato',
          'Bankroll management personalizzato',
        ]
      : [
          'Tutti i tips giornalieri',
          'Analisi pre-partita dettagliate',
          'Storico completo risultati',
        ];

    benefitItems.forEach(function (text) {
      const li = createEl('li', null, '\u2713 ' + text);
      benefits.appendChild(li);
    });
    overlay.appendChild(benefits);

    // CTA: login se non autenticato, upgrade se autenticato
    if (isAuthenticated) {
      const btn = createEl('a', 'btn btn-gold btn-sm');
      btn.textContent = isVipCard
        ? `Diventa VIP \u2014 ${TIER_PRICES.vip.display}`
        : `Passa a PRO \u2014 ${TIER_PRICES.pro.display}`;
      btn.href = '#pricing';
      overlay.appendChild(btn);
    } else {
      const loginBtn = createEl('a', 'btn btn-gold btn-sm');
      loginBtn.textContent = 'Accedi con Google';
      loginBtn.href = '/auth.html';
      overlay.appendChild(loginBtn);
    }

    return overlay;
  }

  /**
   * Costruisce una tip card per un singolo pronostico.
   *
   * Modalita':
   *   - Con tip (API): usa dati reali dal database (prediction, odds, analysis, confidence)
   *   - Senza tip (random): genera dati sample per demo/fallback
   *
   * La visibilita' del contenuto dipende dal tier dell'utente (homepageUserTier):
   * - canAccessTier = true: tutto visibile (pronostico, quota, analisi)
   * - canAccessTier = false: card grayed out con overlay di blocco e proposta upgrade/login
   * - I tips FREE sono sempre visibili a tutti
   *
   * @param {Object} match - Dati partita { date, home, away }
   * @param {string|Object} tierOrTip - Tier string ('free','pro','vip') for random mode, or tip object from API
   * @returns {HTMLElement} Elemento .tip-card completo
   */
  function buildTipCard(match, tierOrTip) {
    const isApiTip = typeof tierOrTip === 'object' && tierOrTip !== null;
    const tier = isApiTip ? tierOrTip.tier : tierOrTip;
    const tip = isApiTip ? tierOrTip : null;

    const hasAccess = canAccessTier(homepageUserTier, tier);
    const isVip = tier === 'vip';
    let cardClass = 'tip-card';
    if (tier === 'pro') cardClass += ' tip-card--pro';
    if (isVip) cardClass += ' tip-card--vip';
    if (!hasAccess) cardClass += ' tip-card--locked';

    const card = createEl('div', cardClass);
    card.setAttribute('data-tier', tier);

    // Glow decorativo per card pro/vip
    if (tier === 'pro') card.appendChild(createEl('div', 'tip-card-glow'));
    if (isVip) card.appendChild(createEl('div', 'tip-card-glow tip-card-glow--gold'));

    // Header: badge tier + data partita
    const header = createEl('div', 'tip-card-header');
    header.appendChild(createEl('span', 'tip-badge tip-badge--' + tier, tier.toUpperCase()));
    header.appendChild(createEl('span', 'tip-date', formatMatchDate(match.date)));
    card.appendChild(header);

    // Squadre con abbreviazione come logo placeholder
    const tipMatch = createEl('div', 'tip-match');
    const homeTeam = createEl('div', 'tip-team');
    homeTeam.appendChild(createEl('div', 'team-logo', teamAbbr(match.home)));
    homeTeam.appendChild(createEl('span', null, match.home));
    tipMatch.appendChild(homeTeam);
    const versus = createEl('div', 'tip-versus');
    versus.appendChild(createEl('span', 'vs-text', 'VS'));
    tipMatch.appendChild(versus);
    const awayTeam = createEl('div', 'tip-team');
    awayTeam.appendChild(createEl('div', 'team-logo', teamAbbr(match.away)));
    awayTeam.appendChild(createEl('span', null, match.away));
    tipMatch.appendChild(awayTeam);
    card.appendChild(tipMatch);

    // Pronostico e quota (nascosti se non si ha accesso)
    const predictionEl = createEl('div', 'tip-prediction');
    const pick = createEl('div', 'tip-pick');
    pick.appendChild(createEl('span', 'pick-label', 'Pronostico'));
    const pickClass = !hasAccess ? 'pick-value tip-value--hidden' : 'pick-value';
    let pickText;
    if (!hasAccess) pickText = '\u2605 \u2605 \u2605';
    else if (tip) pickText = tip.prediction || '\u2014';
    else pickText = randomFrom(PREDICTIONS);
    pick.appendChild(createEl('span', pickClass, pickText));
    predictionEl.appendChild(pick);

    const odds = createEl('div', 'tip-odds');
    odds.appendChild(createEl('span', 'odds-label', 'Quota'));
    const oddsClass = !hasAccess ? 'odds-value tip-value--hidden' : 'odds-value';
    let oddsText;
    if (!hasAccess) oddsText = '?.??';
    else if (tip) oddsText = tip.odds ? parseFloat(tip.odds).toFixed(2) : '\u2014';
    else oddsText = randomOdd();
    odds.appendChild(createEl('span', oddsClass, oddsText));
    predictionEl.appendChild(odds);
    card.appendChild(predictionEl);

    // Barra di confidence con animazione
    const conf = tip ? tip.confidence || 70 : randomConfidence();
    const confDiv = createEl('div', 'tip-confidence');
    confDiv.appendChild(createEl('span', 'confidence-label', 'Confidence'));
    const confBar = createEl('div', 'confidence-bar');
    const confFill = createEl(
      'div',
      isVip ? 'confidence-fill confidence-fill--gold' : 'confidence-fill',
    );
    confFill.setAttribute('data-confidence', conf);
    confBar.appendChild(confFill);
    confDiv.appendChild(confBar);
    confDiv.appendChild(createEl('span', 'confidence-value', conf + '%'));
    card.appendChild(confDiv);

    // Analisi: visibile se ha accesso, altrimenti overlay con benefit + CTA
    const analysisText = tip ? tip.analysis : randomFrom(ANALYSES);
    if (hasAccess && analysisText) {
      const analysis = createEl('div', 'tip-analysis');
      analysis.appendChild(createEl('p', null, analysisText));
      card.appendChild(analysis);
    } else if (!hasAccess) {
      const locked = createEl('div', 'tip-analysis tip-analysis--locked');
      locked.appendChild(buildLockedOverlay(tier, homepageUserTier));
      card.appendChild(locked);
    }

    return card;
  }

  /**
   * Attiva l'IntersectionObserver per le barre di confidence
   * all'interno di un container specifico (usato dopo il rendering
   * dinamico delle tip card).
   * @param {HTMLElement} container - Contenitore con elementi .confidence-fill
   */
  function activateConfidenceBars(container) {
    const fills = container.querySelectorAll('.confidence-fill');
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            const val = entry.target.getAttribute('data-confidence');
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
      container.appendChild(buildTipCard(matches[0], 'free'));
      // Card 2: PRO (seconda partita)
      container.appendChild(buildTipCard(matches[1], 'pro'));
      // Card 3: VIP (terza partita)
      container.appendChild(buildTipCard(matches[2], 'vip'));

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
      setEmptyState(container, 'tips-empty', 'Impossibile caricare i pronostici');
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
      setEmptyState(container, 'matches-empty', 'Impossibile caricare le partite');
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
      setEmptyState(container, 'results-empty', 'Impossibile caricare i risultati');
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
   * Controlla se l'utente puo' accedere al contenuto di un certo tier.
   * I tips FREE sono sempre accessibili a tutti.
   * @param {string|null} userTier - Tier dell'utente (null se non autenticato)
   * @param {string} cardTier - Tier della tip card ('free', 'pro', 'vip')
   * @returns {boolean}
   */
  function canAccessTier(userTier, cardTier) {
    if (cardTier === 'free') return true;
    const hierarchy = { free: 0, pro: 1, vip: 2 };
    const userLevel = userTier ? hierarchy[userTier] || 0 : -1;
    const cardLevel = hierarchy[cardTier] || 0;
    return userLevel >= cardLevel;
  }

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
    } catch (_err) {
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
    SupabaseConfig.getSession().then(function (result) {
      updateNavForAuth(result.data.session);
      if (result.data.session) {
        loadHomepageUserTier(result.data.session);
        updatePricingForAuth();
      }
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
    } catch (_err) {
      resetTrackRecordUI();
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
        if (sessionResult.data.session) {
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
        container.appendChild(buildTipCard(match, tip));
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
                container.appendChild(buildTipCard(matches[matchIndex], tier));
                matchIndex++;
              }
            });
          }
        } catch (_matchErr) {
          // Nessun match disponibile, mostra solo i tips dal database
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
    } catch (_err) {
      // Fallback: genera tips client-side
      loadTips();
    }
  }

  // Cookie banner + language toggle delegated to shared.js

  // Avvia il caricamento dati al ready della pagina
  injectTierPrices();
  initLeagueSelector();
  loadMatches();
  loadResults().then(loadTrackRecord);
  loadTipsFromAPI();
  initCookieBanner();
  initCopyrightYear();
  initLangToggle();
})();
