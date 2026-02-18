/* ============================================
   WinningBet — Homepage Animations
   ============================================
   UI animation systems: counter animations, scroll reveal,
   confidence bars, stagger effects.
   ============================================ */

/* exported animateCounter, activateConfidenceBars */

(function () {
  'use strict';

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

  // Expose to global scope
  window.animateCounter = animateCounter;

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
  // CONFIDENCE BARS ACTIVATION (post-render)
  // ==========================================

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

  // Expose to global scope
  window.activateConfidenceBars = activateConfidenceBars;
})();
