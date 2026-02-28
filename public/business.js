/* global initMobileMenu, initParticles, initLangToggle, initCookieBanner, initCopyrightYear, SupabaseConfig, showToast */

/**
 * WinningBet — Partner Landing Page Logic
 *
 * Gestisce la pagina pubblica del Programma Partner:
 * - Check sessione utente
 * - Mostra form candidatura o prompt di accesso
 * - Invia candidatura a POST /api/admin?resource=apply
 * - Mostra stato candidatura (pending/approved/rejected)
 */

(function () {
  'use strict';

  // Shared utilities
  initMobileMenu();
  initCookieBanner();
  initParticles({ maxParticles: 40, densityDivisor: 25, connections: false });
  initLangToggle();
  initCopyrightYear();

  // ==========================================
  // DOM REFERENCES
  // ==========================================

  const heroCta = document.getElementById('heroCta');
  const authPrompt = document.getElementById('partnerAuthPrompt');
  const formWrapper = document.getElementById('partnerFormWrapper');
  const statusWrapper = document.getElementById('partnerStatusWrapper');
  const statusEl = document.getElementById('partnerStatus');
  const applicationForm = document.getElementById('applicationForm');
  const formError = document.getElementById('formError');
  const submitBtn = document.getElementById('submitBtn');
  const navAuthBtn = document.getElementById('navAuthBtn');

  let session = null;

  // ==========================================
  // DOM HELPERS
  // ==========================================

  function el(tag, className, textContent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent) node.textContent = textContent;
    return node;
  }

  function svgIcon(paths, opts) {
    opts = opts || {};
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', opts.size || '40');
    svg.setAttribute('height', opts.size || '40');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    paths.forEach(function (d) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  // ==========================================
  // SESSION CHECK
  // ==========================================

  async function checkSession() {
    try {
      const result = await SupabaseConfig.getSession();
      if (result && result.data && result.data.session) {
        session = result.data.session;
        updateNavForLoggedIn();
        showFormSection();
        checkExistingApplication();
      } else {
        showAuthPrompt();
      }
    } catch (err) {
      console.warn('[business] getSession failed:', err && err.message);
      showAuthPrompt();
    }
  }

  // ==========================================
  // NAV UPDATE (logged in)
  // ==========================================

  function updateNavForLoggedIn() {
    if (navAuthBtn) {
      navAuthBtn.textContent = 'Dashboard';
      navAuthBtn.href = '/dashboard.html';
      navAuthBtn.classList.remove('btn-outline');
      navAuthBtn.classList.add('btn-gold');
    }
  }

  // ==========================================
  // AUTH PROMPT (not logged in)
  // ==========================================

  function showAuthPrompt() {
    authPrompt.style.display = '';
    formWrapper.style.display = 'none';
    statusWrapper.style.display = 'none';

    // Hero CTA redirects to auth
    if (heroCta) {
      heroCta.href = '/auth.html?return=/business.html';
    }
  }

  // ==========================================
  // FORM SECTION (logged in)
  // ==========================================

  function showFormSection() {
    authPrompt.style.display = 'none';
    formWrapper.style.display = '';
    statusWrapper.style.display = 'none';
  }

  // ==========================================
  // CHECK EXISTING APPLICATION
  // ==========================================

  async function checkExistingApplication() {
    try {
      const resp = await fetch('/api/admin?resource=apply', {
        headers: { Authorization: 'Bearer ' + session.access_token },
      });

      if (resp.ok) {
        const app = await resp.json();
        showApplicationStatus(app);
      } else if (resp.status === 404) {
        // No existing application — show form
        showFormSection();
      } else {
        // Unexpected error — show form anyway
        showFormSection();
      }
    } catch (err) {
      console.warn('[business] checkExistingApplication failed:', err && err.message);
      showFormSection();
    }
  }

  // ==========================================
  // APPLICATION STATUS DISPLAY (safe DOM methods)
  // ==========================================

  function showApplicationStatus(app) {
    authPrompt.style.display = 'none';
    formWrapper.style.display = 'none';
    statusWrapper.style.display = '';

    // Clear previous content
    statusEl.textContent = '';

    const status = app.status || 'pending';

    if (status === 'pending') {
      statusEl.className = 'partner-status partner-status--pending';
      buildPendingStatus(app);
    } else if (status === 'approved') {
      statusEl.className = 'partner-status partner-status--approved';
      buildApprovedStatus();
    } else if (status === 'rejected') {
      statusEl.className = 'partner-status partner-status--rejected';
      buildRejectedStatus(app);
    } else if (status === 'revoked') {
      statusEl.className = 'partner-status partner-status--rejected';
      buildRevokedStatus();
    }
  }

  function buildPendingStatus(app) {
    // Icon
    const iconWrap = el('div', 'partner-status-icon');
    iconWrap.appendChild(
      svgIcon([
        'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z',
        'M12 6v6l4 2',
      ]),
    );
    statusEl.appendChild(iconWrap);

    // Title + description
    statusEl.appendChild(el('h3', 'partner-status-title', 'Candidatura in revisione'));
    statusEl.appendChild(
      el(
        'p',
        'partner-status-desc',
        'La tua candidatura e\u0300 in fase di revisione. Ti invieremo una notifica via email quando sara\u0300 valutata.',
      ),
    );

    // Business name detail
    const detailName = el('div', 'partner-status-details');
    detailName.appendChild(el('span', 'partner-status-label', 'Ragione Sociale'));
    detailName.appendChild(el('span', 'partner-status-value', app.business_name || ''));
    statusEl.appendChild(detailName);

    // P.IVA detail
    const detailVat = el('div', 'partner-status-details');
    detailVat.appendChild(el('span', 'partner-status-label', 'P.IVA'));
    const vatValue = el('span', 'partner-status-value', app.vat_number || '');
    if (app.vies_valid === true) {
      const badgeValid = el('span', 'partner-vies-badge partner-vies-badge--valid', ' VIES Verificata');
      vatValue.appendChild(badgeValid);
    } else if (app.vies_valid === false) {
      const badgeInvalid = el('span', 'partner-vies-badge partner-vies-badge--invalid', ' VIES Non Valida');
      vatValue.appendChild(badgeInvalid);
    }
    detailVat.appendChild(vatValue);
    statusEl.appendChild(detailVat);
  }

  function buildApprovedStatus() {
    const iconWrap = el('div', 'partner-status-icon partner-status-icon--approved');
    iconWrap.appendChild(
      svgIcon(['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4L12 14.01l-3-3']),
    );
    statusEl.appendChild(iconWrap);

    statusEl.appendChild(el('h3', 'partner-status-title', 'Candidatura approvata!'));
    statusEl.appendChild(
      el(
        'p',
        'partner-status-desc',
        'Complimenti! La tua candidatura e\u0300 stata approvata. Accedi alla Dashboard per utilizzare gli strumenti Partner.',
      ),
    );

    const ctaLink = document.createElement('a');
    ctaLink.href = '/dashboard.html';
    ctaLink.className = 'btn btn-gold btn-lg';
    ctaLink.textContent = 'Vai alla Dashboard';
    statusEl.appendChild(ctaLink);
  }

  function buildRejectedStatus(app) {
    const iconWrap = el('div', 'partner-status-icon partner-status-icon--rejected');
    iconWrap.appendChild(
      svgIcon([
        'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z',
        'M15 9l-6 6',
        'M9 9l6 6',
      ]),
    );
    statusEl.appendChild(iconWrap);

    statusEl.appendChild(el('h3', 'partner-status-title', 'Candidatura non approvata'));

    const reasonText = app.rejection_reason
      ? 'Motivo: ' + app.rejection_reason
      : 'La tua candidatura non e\u0300 stata approvata in questo momento.';
    statusEl.appendChild(el('p', 'partner-status-desc', reasonText));
    statusEl.appendChild(
      el('p', 'partner-status-desc', 'Puoi inviare una nuova candidatura con dati aggiornati.'),
    );

    const reapplyBtn = document.createElement('button');
    reapplyBtn.type = 'button';
    reapplyBtn.className = 'btn btn-outline btn-lg';
    reapplyBtn.textContent = 'Invia Nuova Candidatura';
    reapplyBtn.addEventListener('click', function () {
      showFormSection();
    });
    statusEl.appendChild(reapplyBtn);
  }

  function buildRevokedStatus() {
    const iconWrap = el('div', 'partner-status-icon partner-status-icon--rejected');
    iconWrap.appendChild(
      svgIcon([
        'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z',
        'M15 9l-6 6',
        'M9 9l6 6',
      ]),
    );
    statusEl.appendChild(iconWrap);

    statusEl.appendChild(el('h3', 'partner-status-title', 'Accesso Partner revocato'));
    statusEl.appendChild(
      el(
        'p',
        'partner-status-desc',
        'Il tuo accesso Partner e\u0300 stato revocato. Contatta il supporto per maggiori informazioni.',
      ),
    );
  }

  // ==========================================
  // FORM SUBMISSION
  // ==========================================

  if (applicationForm) {
    applicationForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideFormError();

      if (!session) {
        showFormError('Sessione scaduta. Ricarica la pagina e accedi di nuovo.');
        return;
      }

      // Client-side P.IVA validation
      const vatNumber = document.getElementById('vatNumber').value.trim().toUpperCase();
      if (!/^IT\d{11}$/.test(vatNumber)) {
        showFormError('Formato P.IVA non valido. Usa il formato IT seguito da 11 cifre.');
        return;
      }

      const businessName = document.getElementById('businessName').value.trim();
      if (!businessName) {
        showFormError('Ragione Sociale obbligatoria.');
        return;
      }

      const body = {
        business_name: businessName,
        vat_number: vatNumber,
      };

      const cityVal = document.getElementById('city').value.trim();
      if (cityVal) body.city = cityVal;

      const provinceVal = document.getElementById('province').value.trim().toUpperCase();
      if (provinceVal) body.province = provinceVal;

      const websiteVal = document.getElementById('website').value.trim();
      if (websiteVal) body.website = websiteVal;

      // Loading state
      submitBtn.disabled = true;
      submitBtn.textContent = 'Invio in corso...';

      try {
        const resp = await fetch('/api/admin?resource=apply', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + session.access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        const data = await resp.json();

        if (!resp.ok) {
          showFormError(data.error || "Errore durante l'invio. Riprova.");
          return;
        }

        showToast('Candidatura inviata con successo!', 'success');
        showApplicationStatus(data);
      } catch (err) {
        console.error('[business] submit error:', err);
        showFormError('Errore di rete. Controlla la connessione e riprova.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Invia Candidatura';
      }
    });
  }

  // ==========================================
  // FORM ERROR HELPERS
  // ==========================================

  function showFormError(message) {
    if (!formError) return;
    formError.textContent = message;
    formError.style.display = '';
  }

  function hideFormError() {
    if (!formError) return;
    formError.textContent = '';
    formError.style.display = 'none';
  }

  // ==========================================
  // SMOOTH SCROLL FOR HERO CTA
  // ==========================================

  if (heroCta) {
    heroCta.addEventListener('click', function (e) {
      // Only smooth-scroll if the href points to an anchor on this page
      const href = heroCta.getAttribute('href');
      if (href && href.charAt(0) === '#') {
        const target = document.getElementById(href.slice(1));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({
            behavior: REDUCED_MOTION ? 'auto' : 'smooth',
            block: 'start',
          });
        }
      }
    });
  }

  // ==========================================
  // INIT
  // ==========================================

  checkSession();
})();
