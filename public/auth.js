/**
 * WinningBet — Auth Page Logic
 *
 * Gestisce login, registrazione e OAuth via Supabase Auth.
 * Toggle tra form di login e registrazione.
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
  // FORM TOGGLE (Login <-> Register)
  // ==========================================
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const authToggle = document.getElementById('authToggle');
  const authMessage = document.getElementById('authMessage');

  let isLoginMode = true;

  /**
   * Ricostruisce il testo del toggle in modo sicuro (senza innerHTML).
   * @param {boolean} toLogin - Se true mostra "Registrati", altrimenti "Accedi"
   */
  function updateToggleText(toLogin) {
    // Pulisce il contenuto esistente
    while (authToggle.firstChild) {
      authToggle.removeChild(authToggle.firstChild);
    }

    if (toLogin) {
      authToggle.appendChild(document.createTextNode('Non hai un account? '));
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = 'Registrati';
      link.addEventListener('click', function (e) {
        e.preventDefault();
        switchMode(false);
      });
      authToggle.appendChild(link);
    } else {
      authToggle.appendChild(document.createTextNode("Hai gia' un account? "));
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = 'Accedi';
      link.addEventListener('click', function (e) {
        e.preventDefault();
        switchMode(true);
      });
      authToggle.appendChild(link);
    }
  }

  function switchMode(toLogin) {
    isLoginMode = toLogin;
    hideMessage();

    if (toLogin) {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      loginForm.style.display = '';
      registerForm.style.display = 'none';
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      registerForm.style.display = '';
      loginForm.style.display = 'none';
    }

    updateToggleText(toLogin);
  }

  tabLogin.addEventListener('click', function () {
    switchMode(true);
  });
  tabRegister.addEventListener('click', function () {
    switchMode(false);
  });

  // Bind del link toggle iniziale
  const initialToggle = authToggle.querySelector('a');
  if (initialToggle) {
    initialToggle.addEventListener('click', function (e) {
      e.preventDefault();
      switchMode(false);
    });
  }

  // ==========================================
  // MESSAGE DISPLAY
  // ==========================================
  function showMessage(text, type) {
    authMessage.textContent = text;
    authMessage.className = 'auth-message auth-message--' + type;
    authMessage.style.display = '';
  }

  function hideMessage() {
    authMessage.style.display = 'none';
  }

  function setLoading(button, loading) {
    if (loading) {
      button.disabled = true;
      button.querySelector('span').textContent = 'Caricamento...';
    } else {
      button.disabled = false;
      button.querySelector('span').textContent = isLoginMode ? 'Accedi' : 'Crea Account';
    }
  }

  // ==========================================
  // LOGIN
  // ==========================================
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideMessage();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const submitBtn = document.getElementById('loginSubmit');

    if (!email || !password) {
      showMessage('Compila tutti i campi', 'error');
      return;
    }

    setLoading(submitBtn, true);

    const { error } = await SupabaseConfig.signIn(email, password);

    if (error) {
      setLoading(submitBtn, false);
      if (error.message.includes('Invalid login')) {
        showMessage('Email o password non corretti', 'error');
      } else {
        showMessage(error.message, 'error');
      }
      return;
    }

    // Login riuscito — redirect a dashboard
    showMessage('Accesso effettuato! Reindirizzamento...', 'success');
    setTimeout(function () {
      location.href = '/dashboard.html';
    }, 500);
  });

  // ==========================================
  // REGISTER
  // ==========================================
  registerForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideMessage();

    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const submitBtn = document.getElementById('registerSubmit');

    if (!email || !password) {
      showMessage('Compila tutti i campi obbligatori', 'error');
      return;
    }

    if (password.length < 8) {
      showMessage('La password deve essere di almeno 8 caratteri', 'error');
      return;
    }

    setLoading(submitBtn, true);

    const { error } = await SupabaseConfig.signUp(email, password);

    setLoading(submitBtn, false);

    if (error) {
      showMessage(error.message, 'error');
      return;
    }

    // Se il nome e' fornito, aggiorniamo i metadata
    if (name) {
      await SupabaseConfig.client.auth.updateUser({
        data: { display_name: name },
      });
    }

    showMessage(
      'Account creato! Controlla la tua email per confermare la registrazione.',
      'success',
    );
  });

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
})();
