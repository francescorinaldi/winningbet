/**
 * WinningBet — Shared Utilities
 *
 * Codice condiviso tra tutte le pagine del sito:
 *   - initMobileMenu() — Toggle del menu hamburger su mobile
 *   - initParticles(options) — Sistema di particelle animato (Canvas 2D)
 *   - initCookieBanner() — Banner consenso cookie (GDPR)
 *   - initLangToggle() — Toggle lingua IT/EN
 *
 * Caricato prima degli script specifici di ogni pagina.
 */

/* exported initMobileMenu, initParticles, initLangToggle, initCookieBanner, LEAGUE_NAMES_MAP, TIER_PRICES */
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
    for (var i = 0; i < particles.length; i++) {
      for (var j = i + 1; j < particles.length; j++) {
        var dx = particles[i].x - particles[j].x;
        var dy = particles[i].y - particles[j].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          var opacity = (1 - dist / 120) * 0.08;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = 'rgba(212, 168, 83, ' + opacity + ')';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(function (p) {
      p.update();
      p.draw();
    });
    if (drawConnections) renderConnections();
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', resizeCanvas);
  init();
  animate();
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
  var banner = document.getElementById('cookieBanner');
  var acceptBtn = document.getElementById('cookieAccept');
  var rejectBtn = document.getElementById('cookieReject');

  if (!banner || !acceptBtn || !rejectBtn) return;

  var consent = localStorage.getItem('cookie_consent');
  if (consent) return;

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

function initLangToggle() {
  var btn = document.getElementById('langToggle');
  if (!btn) return;

  var langs = [
    { code: 'IT', flag: '\uD83C\uDDEE\uD83C\uDDF9' },
    { code: 'EN', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  ];
  var current = localStorage.getItem('lang') === 'EN' ? 1 : 0;

  function render() {
    var lang = langs[current];
    btn.querySelector('.flag-emoji').textContent = lang.flag;
    btn.querySelector('.lang-label').textContent = lang.code;
    document.documentElement.setAttribute('lang', lang.code.toLowerCase());
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
