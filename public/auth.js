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

  const params = new URLSearchParams(window.location.search);

  // If user came from a pricing button (e.g. /auth.html?plan=pro), preserve the
  // checkout intent through the OAuth redirect so dashboard auto-starts checkout.
  const pendingPlan = params.get('plan');

  // Return URL support — e.g. /auth.html?return=/business.html redirects there after login.
  // Validated to prevent open redirects: must start with '/', must NOT contain '://' or start with '//'.
  const rawReturn = params.get('return');
  const returnUrl =
    rawReturn &&
    rawReturn.charAt(0) === '/' &&
    rawReturn.indexOf('//') !== 0 &&
    rawReturn.indexOf('://') === -1
      ? rawReturn
      : null;

  // Build the OAuth redirect target:
  // - If a valid return URL exists, use it as the full page path.
  //   Append ?upgrade=<plan> if a plan param is also present.
  // - Otherwise fall back to the legacy behavior (query string appended to /dashboard.html).
  var oauthRedirectPath;
  if (returnUrl) {
    var separator = returnUrl.indexOf('?') === -1 ? '?' : '&';
    oauthRedirectPath = pendingPlan
      ? returnUrl + separator + 'upgrade=' + encodeURIComponent(pendingPlan)
      : returnUrl;
  } else {
    oauthRedirectPath = pendingPlan ? '?upgrade=' + encodeURIComponent(pendingPlan) : '';
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
        // Redirect to return URL (if provided) or dashboard, preserving checkout intent
        if (returnUrl) {
          location.href = oauthRedirectPath;
        } else {
          location.href = '/dashboard.html' + oauthRedirectPath;
        }
      }
    })
    .catch(function (err) {
      console.warn('[auth] getSession failed:', err && err.message);
    });

  // Language toggle delegated to shared.js
  initLangToggle();
})();
