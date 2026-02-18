/**
 * WinningBet — Shared Utilities
 *
 * Codice condiviso tra tutte le pagine del sito:
 *   - initMobileMenu() — Toggle del menu hamburger su mobile
 *   - initParticles(options) — Sistema di particelle animato (Canvas 2D)
 *   - initCookieBanner() — Banner consenso cookie (GDPR)
 *   - initCopyrightYear() — Anno dinamico nel footer
 *   - initLangToggle() — Toggle lingua IT/EN
 *
 * Caricato prima degli script specifici di ogni pagina.
 */

/* exported initMobileMenu, initParticles, initLangToggle, initCookieBanner, initCopyrightYear, LEAGUE_NAMES_MAP, TIER_PRICES, getCurrentSeasonDisplay */
// Why `var`? This file is loaded as a non-module <script> — `var` declarations
// become globals, making functions/constants available to other page scripts.
// Switch to `const`/`let` + `export` when the frontend migrates to ES modules.
/* eslint no-var: "off" */

// ==========================================
// TIER PRICING (shared between pages)
// ==========================================

var TIER_PRICES = {
  pro: { amount: 9.99, currency: '€', display: '€9.99/mese' },
  vip: { amount: 29.99, currency: '€', display: '€29.99/mese' },
};

// ==========================================
// SEASON (computed dynamically)
// ==========================================

// Football seasons span Aug–May, but we switch to displaying the new
// season from July onward (start of transfer window/pre-season).
// January–June → previous year, July–December → current year.
// Example: July 2025 → "2025/26", January 2026 → "2025/26"
function getCurrentSeasonDisplay() {
  var now = new Date();
  var year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return year + '/' + String(year + 1).slice(-2);
}

// ==========================================
// LEAGUE NAMES (shared between pages)
// ==========================================

var LEAGUE_NAMES_MAP = {
  'serie-a': { full: 'Serie A', short: 'Serie A' },
  'champions-league': { full: 'Champions League', short: 'UCL' },
  'la-liga': { full: 'La Liga', short: 'La Liga' },
  'premier-league': { full: 'Premier League', short: 'PL' },
  'ligue-1': { full: 'Ligue 1', short: 'Ligue 1' },
  bundesliga: { full: 'Bundesliga', short: 'Bundesliga' },
  eredivisie: { full: 'Eredivisie', short: 'Eredivisie' },
};

// ==========================================
// MOBILE MENU
// ==========================================

function initMobileMenu() {
  var hamburger = document.getElementById('hamburger');
  var navLinks = document.getElementById('navLinks');
  if (!hamburger || !navLinks) return;

  function closeMenu() {
    hamburger.classList.remove('active');
    navLinks.classList.remove('open');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', function (e) {
    e.stopPropagation();
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('open');
    document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
  });

  // Close menu when clicking any link or button inside nav (except lang-toggle which stays open)
  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  // Close menu when tapping the overlay background (not the nav items themselves)
  navLinks.addEventListener('click', function (e) {
    if (e.target === navLinks) closeMenu();
  });
}

// ==========================================
// PARTICLE SYSTEM
// ==========================================

/**
 * Inizializza il sistema di particelle animato.
 *
 * @param {Object} [options]
 * @param {number} [options.maxParticles=80] — Numero massimo di particelle
 * @param {number} [options.densityDivisor=15] — Divisore per la densita' (larghezza / divisor)
 * @param {boolean} [options.connections=true] — Disegna linee tra particelle vicine
 * @param {number} [options.connectionDistance=120] — Distanza massima per le connessioni (px)
 */
function initParticles(options) {
  var canvas = document.getElementById('particles');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var particles = [];
  var opts = options || {};
  var maxParticles = opts.maxParticles || 80;
  var densityDivisor = opts.densityDivisor || 15;
  var drawConnections = opts.connections !== false;
  var connectionDistance = opts.connectionDistance || 120;
  var connDistSq = connectionDistance * connectionDistance;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function Particle() {
    this.reset();
  }

  Particle.prototype.reset = function () {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = Math.random() * 1.5 + 0.5;
    this.speedX = (Math.random() - 0.5) * 0.3;
    this.speedY = (Math.random() - 0.5) * 0.3;
    this.opacity = Math.random() * 0.4 + 0.1;
    this.gold = Math.random() > 0.7;
  };

  Particle.prototype.update = function () {
    this.x += this.speedX;
    this.y += this.speedY;
    if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
    if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
  };

  Particle.prototype.draw = function () {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.gold
      ? 'rgba(212, 168, 83, ' + this.opacity + ')'
      : 'rgba(240, 240, 245, ' + this.opacity * 0.5 + ')';
    ctx.fill();
  };

  function init() {
    resizeCanvas();
    var count = Math.min(maxParticles, Math.floor(window.innerWidth / densityDivisor));
    particles = [];
    for (var i = 0; i < count; i++) {
      particles.push(new Particle());
    }
  }

  function renderConnections() {
    var cols = Math.ceil(canvas.width / connectionDistance) || 1;
    var rows = Math.ceil(canvas.height / connectionDistance) || 1;
    var grid = new Array(cols * rows);
    var i, j, k, ci, cj, ni, nj, cellIdx, p, q, dx, dy, distSq, opacity;

    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      ci = Math.min(Math.floor(p.x / connectionDistance), cols - 1);
      cj = Math.min(Math.floor(p.y / connectionDistance), rows - 1);
      if (ci < 0) ci = 0;
      if (cj < 0) cj = 0;
      cellIdx = cj * cols + ci;
      if (!grid[cellIdx]) grid[cellIdx] = [];
      grid[cellIdx].push(i);
    }

    ctx.lineWidth = 0.5;

    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      ci = Math.min(Math.floor(p.x / connectionDistance), cols - 1);
      cj = Math.min(Math.floor(p.y / connectionDistance), rows - 1);
      if (ci < 0) ci = 0;
      if (cj < 0) cj = 0;

      for (ni = ci; ni <= ci + 1 && ni < cols; ni++) {
        for (nj = cj - 1; nj <= cj + 1 && nj < rows; nj++) {
          if (ni < 0 || nj < 0) continue;
          cellIdx = nj * cols + ni;
          if (!grid[cellIdx]) continue;
          var cell = grid[cellIdx];
          for (k = 0; k < cell.length; k++) {
            j = cell[k];
            if (j <= i) continue;
            q = particles[j];
            dx = p.x - q.x;
            dy = p.y - q.y;
            distSq = dx * dx + dy * dy;
            if (distSq < connDistSq) {
              opacity = (1 - Math.sqrt(distSq) / connectionDistance) * 0.08;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.strokeStyle = 'rgba(212, 168, 83, ' + opacity + ')';
              ctx.stroke();
            }
          }
        }
      }
    }
  }

  var animationId = null;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(function (p) {
      p.update();
      p.draw();
    });
    if (drawConnections) renderConnections();
    animationId = requestAnimationFrame(animate);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    } else {
      if (animationId === null) {
        animate();
      }
    }
  });

  window.addEventListener('resize', resizeCanvas);
  init();
  animate();
}

// ==========================================
// COOKIE CONSENT BANNER
// ==========================================

/**
 * Gestisce il banner di consenso cookie.
 * Crea dinamicamente il banner e lo inietta nel DOM.
 * Mostra il banner solo se l'utente non ha gia' espresso
 * una preferenza (salvata in localStorage).
 */
function initCookieBanner() {
  var consent = null;
  try { consent = localStorage.getItem('cookie_consent'); } catch (_e) { /* storage unavailable */ }
  if (consent) return;

  var tFn = typeof window.t === 'function' ? window.t : function (key) {
    var defaults = {
      'cookie.text': 'Utilizziamo cookie tecnici per il funzionamento del sito. Per maggiori informazioni consulta la nostra',
      'cookie.link': 'Cookie Policy',
      'cookie.reject': 'Rifiuta',
      'cookie.accept': 'Accetta',
    };
    return defaults[key] || key;
  };

  var banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.id = 'cookieBanner';

  var inner = document.createElement('div');
  inner.className = 'cookie-inner';

  var text = document.createElement('p');
  text.className = 'cookie-text';
  text.textContent = tFn('cookie.text') + ' ';
  var link = document.createElement('a');
  link.href = '/cookies.html';
  link.textContent = tFn('cookie.link');
  text.appendChild(link);
  text.appendChild(document.createTextNode('.'));

  var actions = document.createElement('div');
  actions.className = 'cookie-actions';

  var rejectBtn = document.createElement('button');
  rejectBtn.className = 'btn btn-sm btn-outline';
  rejectBtn.id = 'cookieReject';
  rejectBtn.setAttribute('data-i18n', 'cookie.reject');
  rejectBtn.textContent = tFn('cookie.reject');

  var acceptBtn = document.createElement('button');
  acceptBtn.className = 'btn btn-sm btn-gold';
  acceptBtn.id = 'cookieAccept';
  acceptBtn.setAttribute('data-i18n', 'cookie.accept');
  acceptBtn.textContent = tFn('cookie.accept');

  actions.appendChild(rejectBtn);
  actions.appendChild(acceptBtn);
  inner.appendChild(text);
  inner.appendChild(actions);
  banner.appendChild(inner);
  document.body.appendChild(banner);

  acceptBtn.addEventListener('click', function () {
    try { localStorage.setItem('cookie_consent', 'accepted'); } catch (_e) { /* storage unavailable */ }
    banner.setAttribute('hidden', '');
  });

  rejectBtn.addEventListener('click', function () {
    try { localStorage.setItem('cookie_consent', 'rejected'); } catch (_e) { /* storage unavailable */ }
    banner.setAttribute('hidden', '');
  });
}

// ==========================================
// COPYRIGHT YEAR
// ==========================================

function initCopyrightYear() {
  var year = new Date().getFullYear();
  document.querySelectorAll('.footer-copy > span:first-child').forEach(function (el) {
    if (el.textContent) {
      el.textContent = el.textContent.replace(/\d{4}/, String(year));
    }
  });
}

// ==========================================
// LANGUAGE TOGGLE
// ==========================================

function initLangToggle() {
  var btn = document.getElementById('langToggle');
  if (!btn) return;

  var langs = [
    { code: 'IT', flag: '\uD83C\uDDEE\uD83C\uDDF9' },
    { code: 'EN', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  ];
  var savedLang = null;
  try { savedLang = localStorage.getItem('lang'); } catch (_e) { /* storage unavailable */ }
  var current = savedLang === 'EN' ? 1 : 0;

  function render() {
    var lang = langs[current];
    btn.querySelector('.flag-emoji').textContent = lang.flag;
    btn.querySelector('.lang-label').textContent = lang.code;
    document.documentElement.setAttribute('lang', lang.code.toLowerCase());
    if (typeof window.applyTranslations === 'function') {
      window.applyTranslations();
    }
    initCopyrightYear();
  }

  render();

  btn.addEventListener('click', function () {
    current = current === 0 ? 1 : 0;
    try { localStorage.setItem('lang', langs[current].code); } catch (_e) { /* storage unavailable */ }
    render();
  });
}
