/* global initMobileMenu, initParticles, initLangToggle, initCookieBanner */

/**
 * WinningBet — Auth Page Logic
 *
 * Gestisce accesso via Google OAuth tramite Supabase Auth.
 * Redirect a dashboard dopo autenticazione riuscita.
 */

(function () {
  'use strict';

  // Shared utilities
  initMobileMenu();
  initCookieBanner();

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
  SupabaseConfig.getSession()
    .then(function (result) {
      if (result && result.data && result.data.session) {
        location.href = '/dashboard.html';
      }
    })
    .catch(function () {
      // Supabase auth service unavailable — stay on auth page
    });

  // Language toggle delegated to shared.js
  initLangToggle();
})();
