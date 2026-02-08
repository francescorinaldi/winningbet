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

(function () {
  'use strict';

  // ==========================================
  // PARTICLE SYSTEM
  // ==========================================
  // Sfondo animato con particelle fluttuanti e linee
  // di connessione tra particelle vicine. Renderizzato
  // su un <canvas> fixed (id="particles") che copre
  // l'intera viewport. Il numero di particelle si adatta
  // alla larghezza dello schermo (max 80).

  const canvas = document.getElementById('particles');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let animationId;

  /**
   * Ridimensiona il canvas alla dimensione della viewport.
   * Chiamata all'init e su window resize.
   */
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  /**
   * Singola particella del sistema.
   * Ogni particella ha posizione, velocita', dimensione e opacita'
   * casuali. Il 30% delle particelle e' color gold, il resto bianco.
   */
  class Particle {
    constructor() {
      this.reset();
    }

    /** Inizializza/resetta le proprieta' con valori casuali. */
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 1.5 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.speedY = (Math.random() - 0.5) * 0.3;
      this.opacity = Math.random() * 0.4 + 0.1;
      this.gold = Math.random() > 0.7;
    }

    /** Aggiorna la posizione. Inverte la direzione ai bordi del canvas. */
    update() {
      this.x += this.speedX;
      this.y += this.speedY;

      if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
      if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
    }

    /** Disegna la particella come cerchio sul canvas context. */
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      if (this.gold) {
        ctx.fillStyle = `rgba(212, 168, 83, ${this.opacity})`;
      } else {
        ctx.fillStyle = `rgba(240, 240, 245, ${this.opacity * 0.5})`;
      }
      ctx.fill();
    }
  }

  /**
   * Crea l'array di particelle iniziale.
   * Il conteggio scala con la larghezza della finestra (1 ogni 15px, max 80).
   */
  function initParticles() {
    resizeCanvas();
    const count = Math.min(80, Math.floor(window.innerWidth / 15));
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push(new Particle());
    }
  }

  /**
   * Disegna linee semi-trasparenti tra coppie di particelle
   * distanti meno di 120px. L'opacita' della linea decresce
   * con la distanza (effetto rete/constellation).
   */
  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 120) {
          const opacity = (1 - dist / 120) * 0.08;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(212, 168, 83, ${opacity})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  /**
   * Loop principale di animazione. Pulisce il canvas,
   * aggiorna e disegna ogni particella, poi disegna le connessioni.
   * Usa requestAnimationFrame per ~60fps.
   */
  function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.update();
      p.draw();
    });
    drawConnections();
    animationId = requestAnimationFrame(animateParticles);
  }

  window.addEventListener('resize', () => {
    resizeCanvas();
  });

  initParticles();
  animateParticles();

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
  // MOBILE MENU
  // ==========================================
  // Toggle del menu hamburger su mobile. Quando aperto,
  // blocca lo scroll del body (overflow: hidden) e mostra
  // un overlay fullscreen con i link di navigazione.

  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('open');
    document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
  });

  // Chiude il menu quando si clicca un link
  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      navLinks.classList.remove('open');
      document.body.style.overflow = '';
    });
  });

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
  const revealElements = document.querySelectorAll(
    '.tip-card, .stat-card, .pricing-card, .faq-item, .telegram-card, .recent-results',
  );
  revealElements.forEach((el) => el.classList.add('reveal'));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  revealElements.forEach((el) => revealObserver.observe(el));

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

  let currentLeague = 'serie-a';

  const LEAGUE_NAMES = {
    all: { label: 'Tutte le Leghe', season: '2025/26' },
    'serie-a': { label: 'Serie A', season: '2025/26' },
    'champions-league': { label: 'Champions League', season: '2025/26' },
    'la-liga': { label: 'La Liga', season: '2025/26' },
    'premier-league': { label: 'Premier League', season: '2025/26' },
  };

  const ALL_LEAGUE_SLUGS = ['serie-a', 'champions-league', 'la-liga', 'premier-league'];

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
        loadResults();
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
        ? 'Diventa VIP \u2014 \u20AC29.99/mese'
        : 'Passa a PRO \u2014 \u20AC9.99/mese';
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
   * La visibilita' del contenuto dipende dal tier dell'utente (homepageUserTier):
   * - canAccessTier = true: tutto visibile (pronostico, quota, analisi)
   * - canAccessTier = false: card grayed out con overlay di blocco e proposta upgrade/login
   * - I tips FREE sono sempre visibili a tutti
   *
   * @param {Object} match - Dati partita da /api/matches
   * @param {string} match.date - Data ISO della partita
   * @param {string} match.home - Nome squadra di casa
   * @param {string} match.away - Nome squadra ospite
   * @param {string} tier - Tier della card: "free", "pro", o "vip"
   * @returns {HTMLElement} Elemento .tip-card completo
   */
  function buildTipCard(match, tier) {
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
    const badgeClass = 'tip-badge tip-badge--' + tier;
    header.appendChild(createEl('span', badgeClass, tier.toUpperCase()));
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
    const prediction = createEl('div', 'tip-prediction');
    const pick = createEl('div', 'tip-pick');
    pick.appendChild(createEl('span', 'pick-label', 'Pronostico'));
    const pickVal = createEl('span', !hasAccess ? 'pick-value tip-value--hidden' : 'pick-value');
    pickVal.textContent = !hasAccess ? '\u2605 \u2605 \u2605' : randomFrom(PREDICTIONS);
    pick.appendChild(pickVal);
    prediction.appendChild(pick);
    const odds = createEl('div', 'tip-odds');
    odds.appendChild(createEl('span', 'odds-label', 'Quota'));
    const oddsVal = createEl('span', !hasAccess ? 'odds-value tip-value--hidden' : 'odds-value');
    oddsVal.textContent = !hasAccess ? '?.??' : randomOdd();
    odds.appendChild(oddsVal);
    prediction.appendChild(odds);
    card.appendChild(prediction);

    // Barra di confidence con animazione
    const conf = randomConfidence();
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
    if (hasAccess) {
      const analysis = createEl('div', 'tip-analysis');
      analysis.appendChild(createEl('p', null, randomFrom(ANALYSES)));
      card.appendChild(analysis);
    } else {
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

  // Controlla la sessione all'avvio (solo se SupabaseConfig e' disponibile)
  if (typeof SupabaseConfig !== 'undefined') {
    SupabaseConfig.getSession().then(function (result) {
      updateNavForAuth(result.data.session);
      if (result.data.session) {
        loadHomepageUserTier(result.data.session);
      }
    });

    SupabaseConfig.onAuthStateChange(function (_event, session) {
      updateNavForAuth(session);
      if (session) {
        loadHomepageUserTier(session);
      }
    });
  }

  // ==========================================
  // TRACK RECORD — Dynamic Stats from API
  // ==========================================
  // Carica le statistiche reali da /api/track-record
  // e aggiorna i valori visualizzati nel DOM.

  /**
   * Carica le statistiche dal track record API e aggiorna il DOM.
   * Se won+lost===0: mostra stato "in costruzione" (em dash, pending count).
   * Se ci sono dati reali: aggiorna DOM con valori veri + trigger counter animation.
   * Se errore: lascia i placeholder em dash (stato onesto "nessun dato").
   */
  async function loadTrackRecord() {
    try {
      const data = await fetchAPI('stats', { type: 'track-record' });
      if (!data) return;

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

      // Populate recent results with settled tips
      if (data.recent && data.recent.length > 0) {
        const container = document.getElementById('resultsList');
        if (container) {
          container.textContent = '';
          data.recent.forEach(function (tip) {
            container.appendChild(buildTipResultItem(tip));
          });
        }
      }
    } catch (_err) {
      // Leave em dash placeholders — honest "no data" state
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
        container.appendChild(buildTipCardFromAPI(match, tip));
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

  /**
   * Costruisce una tip card da dati API (pronostico reale dal database).
   * La visibilita' dipende dal tier dell'utente (homepageUserTier).
   * @param {Object} match - Dati partita
   * @param {Object} tip - Dati pronostico dal database
   * @returns {HTMLElement} Elemento .tip-card
   */
  function buildTipCardFromAPI(match, tip) {
    const hasAccess = canAccessTier(homepageUserTier, tip.tier);
    const isVip = tip.tier === 'vip';
    let cardClass = 'tip-card';
    if (tip.tier === 'pro') cardClass += ' tip-card--pro';
    if (isVip) cardClass += ' tip-card--vip';
    if (!hasAccess) cardClass += ' tip-card--locked';

    const card = createEl('div', cardClass);
    card.setAttribute('data-tier', tip.tier);

    if (tip.tier === 'pro') card.appendChild(createEl('div', 'tip-card-glow'));
    if (isVip) card.appendChild(createEl('div', 'tip-card-glow tip-card-glow--gold'));

    // Header
    const header = createEl('div', 'tip-card-header');
    header.appendChild(
      createEl('span', 'tip-badge tip-badge--' + tip.tier, tip.tier.toUpperCase()),
    );
    header.appendChild(createEl('span', 'tip-date', formatMatchDate(match.date)));
    card.appendChild(header);

    // Squadre
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
    const prediction = createEl('div', 'tip-prediction');
    const pick = createEl('div', 'tip-pick');
    pick.appendChild(createEl('span', 'pick-label', 'Pronostico'));
    const pickClass = !hasAccess ? 'pick-value tip-value--hidden' : 'pick-value';
    const pickText = hasAccess ? tip.prediction || '\u2014' : '\u2605 \u2605 \u2605';
    pick.appendChild(createEl('span', pickClass, pickText));
    prediction.appendChild(pick);

    const odds = createEl('div', 'tip-odds');
    odds.appendChild(createEl('span', 'odds-label', 'Quota'));
    const oddsClass = !hasAccess ? 'odds-value tip-value--hidden' : 'odds-value';
    const oddsText = hasAccess ? (tip.odds ? parseFloat(tip.odds).toFixed(2) : '\u2014') : '?.??';
    odds.appendChild(createEl('span', oddsClass, oddsText));
    prediction.appendChild(odds);
    card.appendChild(prediction);

    // Confidence
    const conf = tip.confidence || 70;
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

    // Analisi: visibile se ha accesso, overlay con benefit se bloccata
    if (hasAccess && tip.analysis) {
      const analysis = createEl('div', 'tip-analysis');
      analysis.appendChild(createEl('p', null, tip.analysis));
      card.appendChild(analysis);
    } else if (!hasAccess) {
      const locked = createEl('div', 'tip-analysis tip-analysis--locked');
      locked.appendChild(buildLockedOverlay(tip.tier, homepageUserTier));
      card.appendChild(locked);
    }

    return card;
  }

  // ==========================================
  // COOKIE CONSENT BANNER
  // ==========================================

  /**
   * Gestisce il banner di consenso cookie.
   * Mostra il banner solo se l'utente non ha gia' espresso
   * una preferenza (salvata in localStorage).
   */
  function initCookieBanner() {
    const banner = document.getElementById('cookieBanner');
    const acceptBtn = document.getElementById('cookieAccept');
    const rejectBtn = document.getElementById('cookieReject');

    if (!banner || !acceptBtn || !rejectBtn) return;

    const consent = localStorage.getItem('cookie_consent');
    if (consent) return; // Preferenza gia' espressa

    banner.removeAttribute('hidden');

    acceptBtn.addEventListener('click', function () {
      localStorage.setItem('cookie_consent', 'accepted');
      banner.setAttribute('hidden', '');
    });

    rejectBtn.addEventListener('click', function () {
      localStorage.setItem('cookie_consent', 'rejected');
      banner.setAttribute('hidden', '');
    });
  }

  // ==========================================
  // LANGUAGE TOGGLE
  // ==========================================
  // Toggles between IT and EN. Applies translations via i18n.js.

  function initLangToggle() {
    const btn = document.getElementById('langToggle');
    if (!btn) return;

    const langs = [
      { code: 'IT', flag: '\uD83C\uDDEE\uD83C\uDDF9' },
      { code: 'EN', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
    ];
    let current = localStorage.getItem('lang') === 'EN' ? 1 : 0;

    function render() {
      const lang = langs[current];
      btn.querySelector('.flag-emoji').textContent = lang.flag;
      btn.querySelector('.lang-label').textContent = lang.code;
      document.documentElement.setAttribute('lang', lang.code.toLowerCase());
      // Apply translations to all data-i18n elements
      if (typeof window.applyTranslations === 'function') {
        window.applyTranslations();
      }
    }

    render();

    btn.addEventListener('click', function () {
      current = current === 0 ? 1 : 0;
      localStorage.setItem('lang', langs[current].code);
      render();
    });
  }

  // Avvia il caricamento dati al ready della pagina
  initLeagueSelector();
  loadMatches();
  loadResults();
  loadTipsFromAPI();
  loadTrackRecord();
  initCookieBanner();
  initLangToggle();
})();
