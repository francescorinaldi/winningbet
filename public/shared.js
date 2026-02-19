/**
 * WinningBet — Shared Utilities
 *
 * Codice condiviso tra tutte le pagine del sito:
 *   - initMobileMenu() — Toggle del menu hamburger su mobile
 *   - initParticles(options) — Sistema di particelle animato (Canvas 2D)
 *   - initCookieBanner() — Banner consenso cookie (GDPR)
 *   - initCopyrightYear() — Anno dinamico nel footer
 *   - initLangToggle() — Toggle lingua IT/EN
 *   - formatMatchDate(iso) — Formattazione date partite (locale-aware)
 *
 * Caricato prima degli script specifici di ogni pagina.
 */

/* exported initMobileMenu, initParticles, initLangToggle, initCookieBanner, initCopyrightYear, LEAGUE_NAMES_MAP, TIER_PRICES, TIER_LEVELS, getCurrentSeasonDisplay, formatMatchDate, setErrorState, REDUCED_MOTION, showToast, buildSkeletonCards, buildEmptyState, setLastUpdated, retryWithBackoff, buildShareDropdown */
/* global getLocale */
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
// TIER LEVELS (shared between pages)
// ==========================================

var TIER_LEVELS = { free: 0, pro: 1, vip: 2 };

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
// REDUCED MOTION (accessibility)
// ==========================================

var REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ==========================================
// ERROR STATE WITH RETRY
// ==========================================

/**
 * Mostra uno stato di errore con messaggio e bottone "Riprova".
 * Sostituisce il contenuto del container con icona SVG + testo + CTA retry.
 * @param {HTMLElement} container - Elemento contenitore
 * @param {string} message - Messaggio di errore
 * @param {Function|null} retryFn - Funzione da chiamare al click "Riprova"
 */
function setErrorState(container, message, retryFn) {
  container.textContent = '';

  var wrapper = document.createElement('div');
  wrapper.className = 'error-state';

  // SVG warning icon
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '32');
  svg.setAttribute('height', '32');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('aria-hidden', 'true');
  var tri = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tri.setAttribute(
    'd',
    'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  );
  var line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '12');
  line1.setAttribute('y1', '9');
  line1.setAttribute('x2', '12');
  line1.setAttribute('y2', '13');
  var line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '12');
  line2.setAttribute('y1', '17');
  line2.setAttribute('x2', '12.01');
  line2.setAttribute('y2', '17');
  svg.appendChild(tri);
  svg.appendChild(line1);
  svg.appendChild(line2);
  wrapper.appendChild(svg);

  var msg = document.createElement('p');
  msg.className = 'error-state-message';
  msg.textContent = message;
  wrapper.appendChild(msg);

  if (typeof retryFn === 'function') {
    var btn = document.createElement('button');
    btn.className = 'btn btn-outline btn-sm error-state-retry';
    btn.textContent = 'Riprova';
    btn.addEventListener('click', function () {
      container.textContent = '';
      retryFn();
    });
    wrapper.appendChild(btn);
  }

  container.appendChild(wrapper);
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================

var _toastContainer = null;

/**
 * Mostra un toast temporaneo con messaggio e tipo.
 * @param {string} message - Testo del messaggio
 * @param {'success'|'error'|'info'} [type='info'] - Tipo di toast
 * @param {number} [duration=3000] - Durata in ms prima dell'auto-dismiss
 */
function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration || 3000;

  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.className = 'toast-container';
    _toastContainer.setAttribute('aria-live', 'polite');
    _toastContainer.setAttribute('aria-label', 'Notifiche');
    document.body.appendChild(_toastContainer);
  }

  var icons = { success: '\u2713', error: '\u2717', info: '\u2139' };

  var toast = document.createElement('div');
  toast.className = 'toast toast--' + type;
  toast.setAttribute('role', 'status');

  var icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = icons[type] || icons.info;
  toast.appendChild(icon);

  var text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;
  toast.appendChild(text);

  _toastContainer.appendChild(toast);

  // Slide in
  if (REDUCED_MOTION) {
    toast.classList.add('visible');
  } else {
    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });
  }

  // Click to dismiss
  toast.addEventListener('click', function () {
    removeToast(toast);
  });

  // Auto-dismiss
  setTimeout(function () {
    removeToast(toast);
  }, duration);
}

function removeToast(toast) {
  if (!toast.parentNode) return;
  toast.classList.remove('visible');
  if (REDUCED_MOTION) {
    toast.remove();
  } else {
    setTimeout(function () {
      toast.remove();
    }, 300);
  }
}

// ==========================================
// SKELETON LOADING
// ==========================================

/**
 * Genera N skeleton card placeholder nel container.
 * @param {HTMLElement} container - Elemento contenitore (viene svuotato)
 * @param {number} count - Numero di skeleton card
 * @param {'card'|'match'|'history'} [variant='card'] - Tipo di skeleton
 */
function buildSkeletonCards(container, count, variant) {
  variant = variant || 'card';
  container.textContent = '';
  for (var i = 0; i < count; i++) {
    var el = document.createElement('div');
    el.className = 'skeleton skeleton-' + variant;
    el.setAttribute('aria-hidden', 'true');
    container.appendChild(el);
  }
}

// ==========================================
// EMPTY STATE
// ==========================================

/**
 * Mostra uno stato vuoto informativo con icona, titolo, sottotitolo e azione opzionale.
 * @param {HTMLElement} container - Elemento contenitore (viene svuotato)
 * @param {Object} opts
 * @param {'calendar'|'clipboard'|'trophy'|'search'} opts.icon - Tipo icona SVG
 * @param {string} opts.title - Titolo principale
 * @param {string} [opts.subtitle] - Sottotitolo opzionale
 * @param {{label: string, onClick: Function}} [opts.action] - Bottone azione opzionale
 */
function buildEmptyState(container, opts) {
  container.textContent = '';

  var wrapper = document.createElement('div');
  wrapper.className = 'empty-state';

  var svgPaths = {
    calendar:
      'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
    clipboard:
      'M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 2h6a1 1 0 011 1v1a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z',
    trophy:
      'M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z',
    search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  };

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '40');
  svg.setAttribute('height', '40');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  var pathData = svgPaths[opts.icon] || svgPaths.clipboard;
  pathData
    .split('M')
    .filter(Boolean)
    .forEach(function (seg) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M' + seg);
      svg.appendChild(path);
    });

  wrapper.appendChild(svg);

  var title = document.createElement('p');
  title.className = 'empty-state-title';
  title.textContent = opts.title;
  wrapper.appendChild(title);

  if (opts.subtitle) {
    var sub = document.createElement('p');
    sub.className = 'empty-state-subtitle';
    sub.textContent = opts.subtitle;
    wrapper.appendChild(sub);
  }

  if (opts.action) {
    var btn = document.createElement('button');
    btn.className = 'btn btn-outline btn-sm';
    btn.textContent = opts.action.label;
    btn.addEventListener('click', opts.action.onClick);
    wrapper.appendChild(btn);
  }

  container.appendChild(wrapper);
}

// ==========================================
// LAST UPDATED TIMESTAMP
// ==========================================

/**
 * Mostra un timestamp "Aggiornato alle HH:MM" con icona refresh cliccabile.
 * @param {string} containerId - ID dell'elemento .last-updated
 * @param {Function} [refreshFn] - Funzione da chiamare al click refresh
 */
function setLastUpdated(containerId, refreshFn) {
  var el = document.getElementById(containerId);
  if (!el) return;

  var locale = typeof getLocale === 'function' ? getLocale() : 'it-IT';
  var time = new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  el.textContent = '';

  var text = document.createElement('span');
  text.textContent = 'Aggiornato alle ' + time;
  el.appendChild(text);

  if (typeof refreshFn === 'function') {
    var btn = document.createElement('button');
    btn.className = 'last-updated-refresh';
    btn.setAttribute('aria-label', 'Aggiorna');
    btn.textContent = '\u21BB';
    btn.addEventListener('click', refreshFn);
    el.appendChild(btn);
  }
}

// ==========================================
// RETRY WITH EXPONENTIAL BACKOFF
// ==========================================

/**
 * Esegue una funzione con retry automatico e backoff esponenziale.
 * @param {Function} fn - Funzione async da eseguire
 * @param {Object} [opts]
 * @param {number} [opts.maxRetries=3] - Tentativi massimi
 * @param {number} [opts.baseDelay=1000] - Delay base in ms (raddoppia ad ogni retry)
 * @param {number} [opts.timeout=10000] - Timeout per singola chiamata in ms
 * @returns {Promise<*>} Risultato della funzione
 */
function retryWithBackoff(fn, opts) {
  opts = opts || {};
  var maxRetries = opts.maxRetries || 3;
  var baseDelay = opts.baseDelay || 1000;
  var timeout = opts.timeout || 10000;

  return new Promise(function (resolve, reject) {
    var attempt = 0;

    function tryOnce() {
      attempt++;

      var controller = new AbortController();
      var timer = setTimeout(function () {
        controller.abort();
      }, timeout);

      Promise.resolve(fn(controller.signal))
        .then(function (result) {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(function (err) {
          clearTimeout(timer);
          if (attempt >= maxRetries) {
            reject(err);
            return;
          }
          var delay = baseDelay * Math.pow(2, attempt - 1);
          setTimeout(tryOnce, delay);
        });
    }

    tryOnce();
  });
}

// ==========================================
// SHARE DROPDOWN
// ==========================================

/**
 * Costruisce un dropdown di condivisione con Copia, WhatsApp e Telegram.
 * @param {Object} opts
 * @param {string} opts.text - Testo formattato da condividere
 * @returns {HTMLElement} Elemento .share-wrapper con bottone + dropdown
 */
function buildShareDropdown(opts) {
  var wrapper = document.createElement('div');
  wrapper.className = 'share-wrapper';

  // Share button (SVG share icon)
  var btn = document.createElement('button');
  btn.className = 'share-btn';
  btn.setAttribute('aria-label', 'Condividi');
  btn.setAttribute('aria-expanded', 'false');

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  var c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c1.setAttribute('cx', '18');
  c1.setAttribute('cy', '5');
  c1.setAttribute('r', '3');
  var c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c2.setAttribute('cx', '6');
  c2.setAttribute('cy', '12');
  c2.setAttribute('r', '3');
  var c3 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c3.setAttribute('cx', '18');
  c3.setAttribute('cy', '19');
  c3.setAttribute('r', '3');
  var l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l1.setAttribute('x1', '8.59');
  l1.setAttribute('y1', '13.51');
  l1.setAttribute('x2', '15.42');
  l1.setAttribute('y2', '17.49');
  var l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l2.setAttribute('x1', '15.41');
  l2.setAttribute('y1', '6.51');
  l2.setAttribute('x2', '8.59');
  l2.setAttribute('y2', '10.49');
  svg.appendChild(c1);
  svg.appendChild(c2);
  svg.appendChild(c3);
  svg.appendChild(l1);
  svg.appendChild(l2);
  btn.appendChild(svg);
  wrapper.appendChild(btn);

  // Dropdown
  var dropdown = document.createElement('div');
  dropdown.className = 'share-dropdown';

  // Copy
  var copyBtn = document.createElement('button');
  copyBtn.className = 'share-option';
  copyBtn.textContent = '\uD83D\uDCCB Copia';
  copyBtn.addEventListener('click', function () {
    navigator.clipboard
      .writeText(opts.text)
      .then(function () {
        showToast('Pronostico copiato!', 'success');
      })
      .catch(function () {
        showToast('Impossibile copiare', 'error');
      });
    dropdown.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });
  dropdown.appendChild(copyBtn);

  // WhatsApp
  var waBtn = document.createElement('a');
  waBtn.className = 'share-option';
  waBtn.textContent = '\uD83D\uDCAC WhatsApp';
  waBtn.href = 'https://wa.me/?text=' + encodeURIComponent(opts.text);
  waBtn.target = '_blank';
  waBtn.rel = 'noopener noreferrer';
  waBtn.addEventListener('click', function () {
    dropdown.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });
  dropdown.appendChild(waBtn);

  // Telegram
  var tgBtn = document.createElement('a');
  tgBtn.className = 'share-option';
  tgBtn.textContent = '\u2708\uFE0F Telegram';
  tgBtn.href =
    'https://t.me/share/url?url=https://winningbet.it&text=' + encodeURIComponent(opts.text);
  tgBtn.target = '_blank';
  tgBtn.rel = 'noopener noreferrer';
  tgBtn.addEventListener('click', function () {
    dropdown.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });
  dropdown.appendChild(tgBtn);

  wrapper.appendChild(dropdown);

  // Toggle dropdown
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var isOpen = dropdown.classList.contains('open');
    // Close all other dropdowns first
    document.querySelectorAll('.share-dropdown.open').forEach(function (d) {
      d.classList.remove('open');
      var parentBtn = d.parentNode.querySelector('.share-btn');
      if (parentBtn) parentBtn.setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      dropdown.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });

  return wrapper;
}

// Close share dropdowns on click outside
document.addEventListener('click', function () {
  document.querySelectorAll('.share-dropdown.open').forEach(function (d) {
    d.classList.remove('open');
    var parentBtn = d.parentNode.querySelector('.share-btn');
    if (parentBtn) parentBtn.setAttribute('aria-expanded', 'false');
  });
});

// ==========================================
// MOBILE MENU
// ==========================================

function initMobileMenu() {
  var hamburger = document.getElementById('hamburger');
  var navLinks = document.getElementById('navLinks');
  if (!hamburger || !navLinks) return;

  // Create backdrop overlay
  var backdrop = document.createElement('div');
  backdrop.className = 'nav-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.appendChild(backdrop);

  function closeMenu() {
    hamburger.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
    navLinks.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  function openMenu() {
    hamburger.classList.add('active');
    hamburger.setAttribute('aria-expanded', 'true');
    navLinks.classList.add('open');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // Set initial aria state
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.setAttribute('aria-controls', 'navLinks');

  hamburger.addEventListener('click', function (e) {
    e.stopPropagation();
    if (navLinks.classList.contains('open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // ESC key closes the menu
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) {
      closeMenu();
      hamburger.focus();
    }
  });

  // Close on backdrop click
  backdrop.addEventListener('click', closeMenu);

  // Close menu when clicking any link inside nav
  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
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

  function drawStatic() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(function (p) {
      p.draw();
    });
    if (drawConnections) renderConnections();
  }

  // Pause animation when tab is hidden to save CPU
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    } else if (animationId === null) {
      animate();
    }
  });

  window.addEventListener('resize', function () {
    resizeCanvas();
    if (REDUCED_MOTION) drawStatic();
  });
  init();
  if (REDUCED_MOTION) {
    drawStatic();
  } else {
    animate();
  }
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
  try {
    consent = localStorage.getItem('cookie_consent');
  } catch (_e) {
    /* storage unavailable */
  }
  if (consent) return;

  var tFn =
    typeof window.t === 'function'
      ? window.t
      : function (key) {
          var defaults = {
            'cookie.text':
              'Utilizziamo cookie tecnici per il funzionamento del sito. Per maggiori informazioni consulta la nostra',
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
    try {
      localStorage.setItem('cookie_consent', 'accepted');
    } catch (_e) {
      /* storage unavailable */
    }
    banner.setAttribute('hidden', '');
  });

  rejectBtn.addEventListener('click', function () {
    try {
      localStorage.setItem('cookie_consent', 'rejected');
    } catch (_e) {
      /* storage unavailable */
    }
    banner.setAttribute('hidden', '');
  });
}

// ==========================================
// DATE FORMATTING
// ==========================================

/**
 * Formatta una data ISO in formato breve per le partite.
 * Usa getLocale() per adattarsi alla lingua corrente.
 * Esempio (it): "2025-09-15T18:45:00Z" -> "15 set — 18:45"
 * @param {string} iso - Data in formato ISO 8601
 * @returns {string} Data formattata (giorno mese — ora)
 */
function formatMatchDate(iso) {
  if (!iso) return '\u2014';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '\u2014';
  var locale = typeof getLocale === 'function' ? getLocale() : 'it-IT';
  return (
    d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) +
    ' \u2014 ' +
    d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  );
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
  try {
    savedLang = localStorage.getItem('lang');
  } catch (_e) {
    /* storage unavailable */
  }
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
    try {
      localStorage.setItem('lang', langs[current].code);
    } catch (_e) {
      /* storage unavailable */
    }
    render();
  });
}
