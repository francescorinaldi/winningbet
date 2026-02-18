/* ============================================
   WinningBet — Homepage Tips
   ============================================
   Tip card rendering, tier locking logic, auth state
   management, locked overlays with value proposition.
   ============================================ */

/* global SupabaseConfig, fetchAPI, formatMatchDate, createEl, setEmptyState, activateConfidenceBars, TIER_PRICES, LEAGUE_NAMES_MAP, getCurrentLeague */
/* exported loadTipsFromAPI, canAccessTier, updateNavForAuth, loadHomepageUserTier */

(function () {
  'use strict';

  // ==========================================
  // AUTH STATE
  // ==========================================

  const navAuthBtn = document.getElementById('navAuthBtn');
  const navSubscribeBtn = document.getElementById('navSubscribeBtn');

  /** Tier dell'utente sulla homepage: null = non autenticato, 'free'/'pro'/'vip' */
  let homepageUserTier = null;

  // ==========================================
  // TIPS GENERATION POOLS
  // ==========================================
  // I pronostici mostrati sono generati lato client combinando dati
  // reali delle partite (da /api/matches) con previsioni e analisi
  // selezionate casualmente. Le card sono divise per tier:
  // - FREE: pronostico e analisi visibili
  // - PRO: pronostico visibile, analisi bloccata
  // - VIP: pronostico, quote e analisi bloccati

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

  // ==========================================
  // TIP CARD UTILITIES
  // ==========================================

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

  // ==========================================
  // TIER ACCESS CHECK
  // ==========================================

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

  // ==========================================
  // TIP CARD BUILDER
  // ==========================================

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

  // ==========================================
  // LOAD TIPS (client-side fallback)
  // ==========================================

  /**
   * Carica le prossime partite da /api/matches e genera le tip card.
   * Crea 3 card: 1 FREE + 1 PRO + 1 VIP.
   * Servono almeno 3 partite, altrimenti mostra stato vuoto.
   * Dopo il rendering attiva le animazioni (confidence bars, reveal).
   */
  async function loadTips() {
    const container = document.getElementById('tipsGrid');
    try {
      const matches = await fetchAPI('fixtures', { type: 'matches', league: getCurrentLeague() });
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

  // ==========================================
  // AUTH STATE — Navbar UI + User Tier
  // ==========================================

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

  // ==========================================
  // LOAD TIPS FROM API (primary)
  // ==========================================

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

      const url = '/api/tips?league=' + encodeURIComponent(getCurrentLeague());
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
          const matches = await fetchAPI('fixtures', {
            type: 'matches',
            league: getCurrentLeague(),
          });
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

  // Expose to global scope
  window.loadTipsFromAPI = loadTipsFromAPI;
  window.canAccessTier = canAccessTier;
  window.updateNavForAuth = updateNavForAuth;
  window.loadHomepageUserTier = loadHomepageUserTier;
  window.updatePricingForAuth = updatePricingForAuth;
})();
