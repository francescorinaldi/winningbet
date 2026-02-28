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

  // If user came from a pricing button (e.g. /auth.html?plan=pro), preserve the
  // checkout intent through the OAuth redirect so dashboard auto-starts checkout.
  const searchParams = new URLSearchParams(window.location.search);
  const pendingPlan = searchParams.get('plan');
  const oauthRedirectPath = pendingPlan ? '?upgrade=' + encodeURIComponent(pendingPlan) : '';

  // Cattura ?ref=CODE per il programma referral Centro Partner.
  // Se l'utente arriva da /partner.html?ref=CODE o /auth.html?ref=CODE,
  // salva il codice in localStorage per poi applicarlo dopo il login.
  const refCode = searchParams.get('ref');
  if (refCode) {
    localStorage.setItem('wb_ref_code', refCode.toUpperCase());
  }

  document.getElementById('googleAuth').addEventListener('click', async function () {
    const { error } = await SupabaseConfig.signInWithOAuth('google', oauthRedirectPath);
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
        // Preserve checkout intent if redirected from a pricing button
        location.href = '/dashboard.html' + oauthRedirectPath;
      }
    })
    .catch(function (err) {
      console.warn('[auth] getSession failed:', err && err.message);
    });

  // Language toggle delegated to shared.js
  initLangToggle();
})();
