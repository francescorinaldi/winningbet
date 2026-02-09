/* global initMobileMenu, initParticles, initLangToggle */

/**
 * WinningBet — Auth Page Logic
 *
 * Gestisce accesso via Google OAuth tramite Supabase Auth.
 * Redirect a dashboard dopo autenticazione riuscita.
 */

(function () {
  'use strict';

  // Mobile menu delegated to shared.js
  initMobileMenu();

  // Particles (reduced version for auth page, no connections)
  initParticles({ maxParticles: 40, densityDivisor: 25, connections: false });

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

  // Language toggle delegated to shared.js
  initLangToggle();
})();
