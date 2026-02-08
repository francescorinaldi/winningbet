/**
 * WinningBet — Auth Page Logic
 *
 * Gestisce accesso via Google OAuth tramite Supabase Auth.
 * Redirect a dashboard dopo autenticazione riuscita.
 */

(function () {
  'use strict';

  // ==========================================
  // MOBILE MENU
  // ==========================================
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('active');
      navLinks.classList.toggle('open');
      document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
    });
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        hamburger.classList.remove('active');
        navLinks.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // ==========================================
  // PARTICLE SYSTEM (versione ridotta per auth page)
  // ==========================================
  const canvas = document.getElementById('particles');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    class Particle {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 1.5 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.3;
        this.speedY = (Math.random() - 0.5) * 0.3;
        this.opacity = Math.random() * 0.4 + 0.1;
        this.gold = Math.random() > 0.7;
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
        if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.gold
          ? 'rgba(212, 168, 83, ' + this.opacity + ')'
          : 'rgba(240, 240, 245, ' + this.opacity * 0.5 + ')';
        ctx.fill();
      }
    }

    function initParticles() {
      resizeCanvas();
      const count = Math.min(40, Math.floor(window.innerWidth / 25));
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push(new Particle());
      }
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(function (p) {
        p.update();
        p.draw();
      });
      requestAnimationFrame(animate);
    }

    window.addEventListener('resize', resizeCanvas);
    initParticles();
    animate();
  }

  // ==========================================
  // MESSAGE DISPLAY
  // ==========================================
  const authMessage = document.getElementById('authMessage');

  function showMessage(text, type) {
    authMessage.textContent = text;
    authMessage.className = 'auth-message auth-message--' + type;
    authMessage.style.display = '';
  }

  // ==========================================
  // GOOGLE OAUTH
  // ==========================================
  document.getElementById('googleAuth').addEventListener('click', async function () {
    const { error } = await SupabaseConfig.signInWithOAuth('google');
    if (error) {
      showMessage("Errore nell'accesso con Google: " + error.message, 'error');
    }
  });

  // ==========================================
  // CHECK EXISTING SESSION
  // ==========================================
  SupabaseConfig.getSession().then(function (result) {
    if (result.data.session) {
      location.href = '/dashboard.html';
    }
  });

  // ==========================================
  // LANGUAGE TOGGLE
  // ==========================================
  (function initLangToggle() {
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
  })();
})();
