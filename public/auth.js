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
  // Validated to prevent open redirects:
  //   - Must start with '/'
  //   - Must NOT start with '//' (protocol-relative URL)
  //   - Must NOT contain '://' (absolute URL with scheme)
  //   - Must NOT contain '\' (backslash — URL parsers normalize to '/', enabling bypass)
  //   - Must NOT contain encoded bypass variants (%5C, %2F%2F)
  const rawReturn = params.get('return');

  function isValidReturnUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.charAt(0) !== '/') return false;
    if (url.indexOf('//') === 0) return false;
    if (url.indexOf('://') !== -1) return false;
    if (url.indexOf('\\') !== -1) return false;
    if (url.indexOf('@') !== -1) return false;
    const lower = url.toLowerCase();
    if (lower.indexOf('%5c') !== -1) return false;
    if (lower.indexOf('%2f%2f') !== -1) return false;
    if (lower.indexOf('%0d') !== -1) return false;
    if (lower.indexOf('%0a') !== -1) return false;
    // Only allow safe URL characters
    if (!/^\/[a-zA-Z0-9/_\-.?=&%]+$/.test(url)) return false;
    return true;
  }

  const returnUrl = isValidReturnUrl(rawReturn) ? rawReturn : null;

  // Build the OAuth redirect target:
  // - If a valid return URL exists, use it as the full page path.
  //   Append ?upgrade=<plan> if a plan param is also present.
  // - Otherwise fall back to the legacy behavior (query string appended to /dashboard.html).
  let oauthRedirectPath;
  if (returnUrl) {
    const separator = returnUrl.indexOf('?') === -1 ? '?' : '&';
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
