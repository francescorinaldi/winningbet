/**
 * Admin Panel — WinningBet
 *
 * Pannello amministrazione protetto (role='admin').
 * Gestisce: candidature partner e gestione utenti.
 *
 * Dipendenze:
 *   - supabase-config.js (SupabaseConfig globale)
 *   - shared.js (initMobileMenu, initCookieBanner)
 *   - Supabase CDN (@supabase/supabase-js)
 */

/* global initMobileMenu, initCookieBanner, SupabaseConfig */

(function () {
  'use strict';

  // Shared utilities
  initMobileMenu();
  initCookieBanner();

  // ─── STATE ──────────────────────────────────────────────
  let session = null;
  let currentFilter = 'all';
  let currentSearchTimeout = null;
  let currentUsersPage = 1;
  let rejectingAppId = null;
  let usersLoaded = false;

  // ─── STATUS LABELS ──────────────────────────────────────
  const STATUS_LABELS = {
    pending: 'In Attesa',
    approved: 'Approvata',
    rejected: 'Rifiutata',
    revoked: 'Revocata',
  };

  const TIER_LABELS = {
    free: 'FREE',
    pro: 'PRO',
    vip: 'VIP',
  };

  // ==========================================
  // AUTH CHECK
  // ==========================================

  async function checkAuth() {
    try {
      const result = await SupabaseConfig.getSession();
      session = (result && result.data && result.data.session) || null;

      if (!session) {
        window.location.href = '/auth.html?return=/admin.html';
        return;
      }

      // Verify admin role — try to load applications (returns 403 if not admin)
      const test = await authFetch('/api/admin?resource=applications');
      if (test.error) {
        if (test.status === 401) {
          // Expired session — redirect to login
          session = null;
          window.location.href = '/auth.html?return=/admin.html';
        } else if (test.status === 403) {
          show403();
        } else {
          showError('Errore di connessione al server (HTTP ' + (test.status || '?') + '). Riprova più tardi.');
        }
        return;
      }

      // Admin verified — load data
      loadApplications();
    } catch (err) {
      console.error('[checkAuth]', err.message || err);
      showError('Errore di connessione al server. Riprova più tardi.');
    }
  }

  /**
   * Show 403 access denied — replace main content.
   */
  function show403() {
    const main = document.querySelector('.dash-main .container');
    if (!main) return;

    // Clear child nodes safely
    while (main.firstChild) {
      main.removeChild(main.firstChild);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'admin-forbidden';

    const icon = document.createElement('div');
    icon.className = 'admin-forbidden-icon';
    icon.textContent = '\uD83D\uDEAB'; // prohibited sign

    const title = document.createElement('h2');
    title.textContent = 'Accesso Negato';

    const desc = document.createElement('p');
    desc.textContent = 'Non hai i permessi per accedere al pannello amministrazione.';

    const link = document.createElement('a');
    link.href = '/dashboard.html';
    link.className = 'btn btn-outline';
    link.textContent = 'Torna alla Dashboard';

    wrapper.appendChild(icon);
    wrapper.appendChild(title);
    wrapper.appendChild(desc);
    wrapper.appendChild(link);
    main.appendChild(wrapper);
  }

  /**
   * Show generic error state — for server/network errors (not 403).
   */
  function showError(message) {
    const main = document.querySelector('.dash-main .container');
    if (!main) return;

    while (main.firstChild) {
      main.removeChild(main.firstChild);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'admin-forbidden';

    const icon = document.createElement('div');
    icon.className = 'admin-forbidden-icon';
    icon.textContent = '\u26A0\uFE0F'; // warning sign

    const title = document.createElement('h2');
    title.textContent = 'Errore';

    const desc = document.createElement('p');
    desc.textContent = message;

    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-outline';
    retryBtn.textContent = 'Riprova';
    retryBtn.addEventListener('click', function () {
      window.location.reload();
    });

    wrapper.appendChild(icon);
    wrapper.appendChild(title);
    wrapper.appendChild(desc);
    wrapper.appendChild(retryBtn);
    main.appendChild(wrapper);
  }

  // ==========================================
  // AUTH FETCH HELPER
  // ==========================================

  /**
   * Fetch helper: adds Authorization header & parses JSON.
   * Returns parsed object with optional error and status fields.
   * On error: { error: string, status: number }
   * On success: parsed JSON data
   */
  async function authFetch(url, options) {
    if (!session) throw new Error('No session');
    const opts = options || {};
    opts.headers = Object.assign(
      { Authorization: 'Bearer ' + session.access_token },
      opts.headers || {},
    );
    if (opts.body && typeof opts.body === 'string') {
      opts.headers['Content-Type'] = 'application/json';
    }
    try {
      const resp = await fetch(url, opts);
      const contentType = (resp.headers && resp.headers.get)
        ? (resp.headers.get('content-type') || '')
        : '';
      let data = null;
      if (contentType.indexOf('application/json') !== -1) {
        try {
          data = await resp.json();
        } catch (_parseErr) {
          return { error: 'Risposta non valida dal server', status: resp.status };
        }
      }
      if (!resp.ok) {
        const message = (data && data.error) ? data.error : 'Errore ' + resp.status;
        return { error: message, status: resp.status };
      }
      return data || {};
    } catch (_networkErr) {
      return { error: 'Errore di rete. Riprova più tardi.', status: 0 };
    }
  }

  // ==========================================
  // LOGOUT
  // ==========================================

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function (e) {
      e.preventDefault();
      await SupabaseConfig.signOut();
      window.location.href = '/';
    });
  }

  // ==========================================
  // TAB NAVIGATION
  // ==========================================

  const tabBtns = document.querySelectorAll('.dash-tab');
  tabBtns.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabBtns.forEach(function (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const target = tab.getAttribute('data-tab');

      document.getElementById('panelApplications').style.display =
        target === 'applications' ? '' : 'none';
      document.getElementById('panelUsers').style.display = target === 'users' ? '' : 'none';

      // Lazy-load users on first open
      if (target === 'users' && !usersLoaded) {
        usersLoaded = true;
        loadUsers();
      }
    });
  });

  // ==========================================
  // APPLICATIONS TAB
  // ==========================================

  /**
   * Clear all child nodes from an element (safe alternative to innerHTML = '').
   */
  function clearChildren(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  async function loadApplications() {
    const list = document.getElementById('applicationsList');
    const empty = document.getElementById('applicationsEmpty');
    const loading = document.getElementById('applicationsLoading');

    clearChildren(list);
    empty.style.display = 'none';
    if (loading) loading.style.display = '';

    let url = '/api/admin?resource=applications';
    if (currentFilter !== 'all') url += '&status=' + currentFilter;

    const data = await authFetch(url);

    if (loading) loading.style.display = 'none';

    if (data.error) {
      empty.style.display = '';
      const p = empty.querySelector('p');
      if (p) p.textContent = 'Errore: ' + data.error;
      return;
    }

    const apps = data.applications || [];
    if (apps.length === 0) {
      empty.style.display = '';
      const emptyP = empty.querySelector('p');
      if (emptyP) emptyP.textContent = 'Nessuna candidatura trovata.';
      return;
    }

    renderApplications(apps);
  }

  /**
   * Render application cards using DOM methods (no innerHTML with user data).
   */
  function renderApplications(apps) {
    const container = document.getElementById('applicationsList');
    clearChildren(container);

    apps.forEach(function (app) {
      const card = document.createElement('div');
      card.className = 'admin-app-card';

      // Header row: business name + status badge
      const header = document.createElement('div');
      header.className = 'admin-app-header';

      const nameEl = document.createElement('h3');
      nameEl.className = 'admin-app-name';
      nameEl.textContent = app.business_name;

      const badge = document.createElement('span');
      badge.className = 'admin-status-badge admin-status-badge--' + app.status;
      badge.textContent = STATUS_LABELS[app.status] || app.status;

      header.appendChild(nameEl);
      header.appendChild(badge);
      card.appendChild(header);

      // Details grid
      const details = document.createElement('div');
      details.className = 'admin-app-details';

      // P.IVA + VIES badge
      const vatRow = createDetailRow('P.IVA', null);
      const vatValue = vatRow.querySelector('.admin-detail-value');
      vatValue.textContent = app.vat_number;
      if (app.vies_valid === true) {
        const viesBadge = document.createElement('span');
        viesBadge.className = 'admin-vies-badge admin-vies-badge--valid';
        viesBadge.textContent = 'VIES OK';
        vatValue.appendChild(viesBadge);
      } else if (app.vies_valid === false) {
        const viesBadgeInv = document.createElement('span');
        viesBadgeInv.className = 'admin-vies-badge admin-vies-badge--invalid';
        viesBadgeInv.textContent = 'VIES KO';
        vatValue.appendChild(viesBadgeInv);
      }
      details.appendChild(vatRow);

      // VIES company name (if available)
      if (app.vies_company_name) {
        details.appendChild(createDetailRow('Ragione VIES', app.vies_company_name));
      }

      // City + Province
      let locationStr = '';
      if (app.city && app.province) {
        locationStr = app.city + ' (' + app.province + ')';
      } else if (app.city) {
        locationStr = app.city;
      } else if (app.province) {
        locationStr = app.province;
      }
      if (locationStr) {
        details.appendChild(createDetailRow('Sede', locationStr));
      }

      // Website — only render as link if http(s), otherwise plain text
      if (app.website) {
        const webRow = createDetailRow('Sito', null);
        const webValue = webRow.querySelector('.admin-detail-value');

        let safeHref = null;
        try {
          const parsedUrl = new URL(app.website, window.location.origin);
          if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
            safeHref = parsedUrl.href;
          }
        } catch (_e) {
          // Invalid URL — render as plain text below
        }

        if (safeHref) {
          const webLink = document.createElement('a');
          webLink.href = safeHref;
          webLink.target = '_blank';
          webLink.rel = 'noopener noreferrer';
          webLink.textContent = app.website.replace(/^https?:\/\//, '');
          webLink.className = 'admin-link';
          webValue.appendChild(webLink);
        } else {
          webValue.textContent = app.website;
        }
        details.appendChild(webRow);
      }

      // Email
      if (app.email) {
        details.appendChild(createDetailRow('Email', app.email));
      }

      // Date
      details.appendChild(
        createDetailRow('Data', formatDate(app.created_at)),
      );

      // Reviewed at
      if (app.reviewed_at) {
        details.appendChild(
          createDetailRow('Revisione', formatDate(app.reviewed_at)),
        );
      }

      // Rejection reason
      if (app.rejection_reason) {
        const reasonRow = createDetailRow('Motivo rifiuto', app.rejection_reason);
        reasonRow.classList.add('admin-detail-row--reason');
        details.appendChild(reasonRow);
      }

      card.appendChild(details);

      // Actions
      const actions = document.createElement('div');
      actions.className = 'admin-actions';

      if (app.status === 'pending') {
        const approveBtn = document.createElement('button');
        approveBtn.className = 'admin-btn admin-btn--approve';
        approveBtn.textContent = 'Approva';
        approveBtn.addEventListener('click', function () {
          approveApplication(app.id);
        });

        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'admin-btn admin-btn--danger';
        rejectBtn.textContent = 'Rifiuta';
        rejectBtn.addEventListener('click', function () {
          showRejectModal(app.id);
        });

        actions.appendChild(approveBtn);
        actions.appendChild(rejectBtn);
      } else if (app.status === 'approved') {
        const revokeBtn = document.createElement('button');
        revokeBtn.className = 'admin-btn admin-btn--secondary';
        revokeBtn.textContent = 'Revoca';
        revokeBtn.addEventListener('click', function () {
          revokeApplication(app.id);
        });
        actions.appendChild(revokeBtn);
      }

      if (actions.children.length > 0) {
        card.appendChild(actions);
      }

      container.appendChild(card);
    });
  }

  /**
   * Create a detail row (label + value).
   */
  function createDetailRow(label, value) {
    const row = document.createElement('div');
    row.className = 'admin-detail-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'admin-detail-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = 'admin-detail-value';
    if (value !== null && value !== undefined) {
      valueEl.textContent = value;
    }

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return row;
  }

  // ─── Filter Buttons ─────────────────────────────────────

  const filterBtns = document.querySelectorAll('.admin-filter-btn');
  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterBtns.forEach(function (b) {
        b.classList.remove('admin-filter-btn--active');
      });
      btn.classList.add('admin-filter-btn--active');
      currentFilter = btn.getAttribute('data-status');
      loadApplications();
    });
  });

  // ─── Approve Action ─────────────────────────────────────

  async function approveApplication(appId) {
    if (!confirm('Confermi l\'approvazione di questa candidatura?')) return;

    const data = await authFetch('/api/admin?resource=applications&action=approve', {
      method: 'POST',
      body: JSON.stringify({ application_id: appId }),
    });

    if (data.error) {
      alert('Errore: ' + data.error);
      return;
    }

    loadApplications();
  }

  // ─── Reject Action — Modal ──────────────────────────────

  function showRejectModal(appId) {
    rejectingAppId = appId;
    const modal = document.getElementById('rejectModal');
    const textarea = document.getElementById('rejectReason');
    textarea.value = '';
    modal.style.display = '';
  }

  function hideRejectModal() {
    rejectingAppId = null;
    document.getElementById('rejectModal').style.display = 'none';
  }

  const rejectCancelBtn = document.getElementById('rejectCancel');
  if (rejectCancelBtn) {
    rejectCancelBtn.addEventListener('click', hideRejectModal);
  }

  const rejectConfirmBtn = document.getElementById('rejectConfirm');
  if (rejectConfirmBtn) {
    rejectConfirmBtn.addEventListener('click', async function () {
      const reason = document.getElementById('rejectReason').value.trim();
      if (!reason) {
        alert('Inserisci il motivo del rifiuto.');
        return;
      }

      const data = await authFetch('/api/admin?resource=applications&action=reject', {
        method: 'POST',
        body: JSON.stringify({ application_id: rejectingAppId, reason: reason }),
      });

      hideRejectModal();

      if (data.error) {
        alert('Errore: ' + data.error);
        return;
      }

      loadApplications();
    });
  }

  // Close modal on backdrop click
  const rejectModal = document.getElementById('rejectModal');
  if (rejectModal) {
    rejectModal.addEventListener('click', function (e) {
      if (e.target === rejectModal) {
        hideRejectModal();
      }
    });
  }

  // ─── Revoke Action ──────────────────────────────────────

  async function revokeApplication(appId) {
    if (!confirm('Sei sicuro di voler revocare questo partner? Il ruolo verra\' rimosso.')) return;

    const data = await authFetch('/api/admin?resource=applications&action=revoke', {
      method: 'POST',
      body: JSON.stringify({ application_id: appId }),
    });

    if (data.error) {
      alert('Errore: ' + data.error);
      return;
    }

    loadApplications();
  }

  // ==========================================
  // USERS TAB
  // ==========================================

  async function loadUsers(search, page) {
    const list = document.getElementById('usersList');
    const loading = document.getElementById('usersLoading');
    const pagination = document.getElementById('usersPagination');

    clearChildren(list);
    if (loading) loading.style.display = '';
    if (pagination) pagination.style.display = 'none';

    let url = '/api/admin?resource=users&page=' + (page || 1);
    if (search) url += '&search=' + encodeURIComponent(search);

    const data = await authFetch(url);

    if (loading) loading.style.display = 'none';

    if (data.error) {
      const errP = document.createElement('p');
      errP.className = 'admin-empty';
      errP.textContent = 'Errore: ' + data.error;
      list.appendChild(errP);
      return;
    }

    renderUserStats(data.stats);
    renderUsers(data.users);
    renderPagination(data.pagination);
  }

  /**
   * Render user stats bar.
   */
  function renderUserStats(stats) {
    const container = document.getElementById('userStats');
    clearChildren(container);

    if (!stats) return;

    const items = [
      { label: 'Totali', value: stats.total, cls: '' },
      { label: 'Free', value: stats.free, cls: 'admin-stat--free' },
      { label: 'PRO', value: stats.pro, cls: 'admin-stat--pro' },
      { label: 'VIP', value: stats.vip, cls: 'admin-stat--vip' },
      { label: 'Partner', value: stats.partners, cls: 'admin-stat--partner' },
    ];

    items.forEach(function (item) {
      const card = document.createElement('div');
      card.className = 'admin-stat-card ' + item.cls;

      const value = document.createElement('div');
      value.className = 'admin-stat-value';
      value.textContent = item.value;

      const label = document.createElement('div');
      label.className = 'admin-stat-label';
      label.textContent = item.label;

      card.appendChild(value);
      card.appendChild(label);
      container.appendChild(card);
    });
  }

  /**
   * Render user cards using DOM methods.
   */
  function renderUsers(users) {
    const container = document.getElementById('usersList');
    clearChildren(container);

    if (!users || users.length === 0) {
      const emptyP = document.createElement('p');
      emptyP.className = 'admin-empty';
      emptyP.textContent = 'Nessun utente trovato.';
      container.appendChild(emptyP);
      return;
    }

    users.forEach(function (user) {
      const card = document.createElement('div');
      card.className = 'admin-user-card';
      card.dataset.userId = user.user_id;

      // Header: name + badges
      const header = document.createElement('div');
      header.className = 'admin-user-header';

      const nameBlock = document.createElement('div');
      nameBlock.className = 'admin-user-name-block';

      const nameEl = document.createElement('h3');
      nameEl.className = 'admin-user-name';
      nameEl.textContent = user.display_name || 'Senza nome';

      const emailEl = document.createElement('span');
      emailEl.className = 'admin-user-email';
      emailEl.textContent = user.email || '';

      nameBlock.appendChild(nameEl);
      nameBlock.appendChild(emailEl);

      const badges = document.createElement('div');
      badges.className = 'admin-user-badges';

      const tierBadge = document.createElement('span');
      tierBadge.className = 'admin-tier-badge admin-tier-badge--' + (user.tier || 'free');
      tierBadge.textContent = TIER_LABELS[user.tier] || 'FREE';
      badges.appendChild(tierBadge);

      if (user.role) {
        const roleBadge = document.createElement('span');
        roleBadge.className = 'admin-role-badge admin-role-badge--' + user.role;
        roleBadge.textContent = user.role.toUpperCase();
        badges.appendChild(roleBadge);
      }

      header.appendChild(nameBlock);
      header.appendChild(badges);
      card.appendChild(header);

      // Metadata row
      const meta = document.createElement('div');
      meta.className = 'admin-user-meta';

      if (user.last_visit_date) {
        const visitEl = document.createElement('span');
        visitEl.textContent = 'Ultima visita: ' + formatDate(user.last_visit_date);
        meta.appendChild(visitEl);
      }

      if (user.total_visits) {
        const visitsEl = document.createElement('span');
        visitsEl.textContent = user.total_visits + ' visite';
        meta.appendChild(visitsEl);
      }

      const createdEl = document.createElement('span');
      createdEl.textContent = 'Membro dal ' + formatDate(user.created_at);
      meta.appendChild(createdEl);

      card.appendChild(meta);

      // Actions: tier and role selects
      const actions = document.createElement('div');
      actions.className = 'admin-user-actions';

      // Tier select
      const tierGroup = document.createElement('div');
      tierGroup.className = 'admin-select-group';

      const tierLabel = document.createElement('label');
      tierLabel.textContent = 'Tier';
      tierLabel.className = 'admin-select-label';

      const tierSelect = document.createElement('select');
      tierSelect.className = 'admin-select';
      ['free', 'pro', 'vip'].forEach(function (t) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = TIER_LABELS[t];
        if (t === (user.tier || 'free')) opt.selected = true;
        tierSelect.appendChild(opt);
      });

      tierSelect.dataset.prevValue = user.tier || 'free';
      tierSelect.addEventListener('change', function () {
        updateUser(user.user_id, { tier: tierSelect.value }, tierSelect);
      });

      tierGroup.appendChild(tierLabel);
      tierGroup.appendChild(tierSelect);
      actions.appendChild(tierGroup);

      // Role select
      const roleGroup = document.createElement('div');
      roleGroup.className = 'admin-select-group';

      const roleLabel = document.createElement('label');
      roleLabel.textContent = 'Ruolo';
      roleLabel.className = 'admin-select-label';

      const roleSelect = document.createElement('select');
      roleSelect.className = 'admin-select';
      [
        { value: '', label: '\u2014' },
        { value: 'partner', label: 'Partner' },
        { value: 'admin', label: 'Admin' },
      ].forEach(function (r) {
        const opt = document.createElement('option');
        opt.value = r.value;
        opt.textContent = r.label;
        if ((user.role || '') === r.value) opt.selected = true;
        roleSelect.appendChild(opt);
      });

      roleSelect.dataset.prevValue = user.role || '';
      roleSelect.addEventListener('change', function () {
        const val = roleSelect.value || null;
        updateUser(user.user_id, { role: val }, roleSelect);
      });

      roleGroup.appendChild(roleLabel);
      roleGroup.appendChild(roleSelect);
      actions.appendChild(roleGroup);

      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  /**
   * Render pagination controls.
   */
  function renderPagination(pag) {
    const container = document.getElementById('usersPagination');
    if (!container || !pag || pag.total_pages <= 1) {
      if (container) container.style.display = 'none';
      return;
    }

    container.style.display = '';
    clearChildren(container);

    const info = document.createElement('span');
    info.className = 'admin-pagination-info';
    info.textContent =
      'Pagina ' + pag.page + ' di ' + pag.total_pages +
      ' (' + pag.total + ' utenti)';
    container.appendChild(info);

    const btnGroup = document.createElement('div');
    btnGroup.className = 'admin-pagination-btns';

    if (pag.page > 1) {
      const prevBtn = document.createElement('button');
      prevBtn.className = 'admin-btn admin-btn--secondary admin-btn--sm';
      prevBtn.textContent = 'Precedente';
      prevBtn.addEventListener('click', function () {
        currentUsersPage = pag.page - 1;
        const searchVal = document.getElementById('userSearch').value.trim();
        loadUsers(searchVal || null, currentUsersPage);
      });
      btnGroup.appendChild(prevBtn);
    }

    if (pag.page < pag.total_pages) {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'admin-btn admin-btn--secondary admin-btn--sm';
      nextBtn.textContent = 'Successiva';
      nextBtn.addEventListener('click', function () {
        currentUsersPage = pag.page + 1;
        const searchVal = document.getElementById('userSearch').value.trim();
        loadUsers(searchVal || null, currentUsersPage);
      });
      btnGroup.appendChild(nextBtn);
    }

    container.appendChild(btnGroup);
  }

  // ─── Search with Debounce ───────────────────────────────

  const userSearchEl = document.getElementById('userSearch');
  if (userSearchEl) {
    userSearchEl.addEventListener('input', function () {
      clearTimeout(currentSearchTimeout);
      const query = this.value.trim();
      currentSearchTimeout = setTimeout(function () {
        currentUsersPage = 1;
        loadUsers(query || null, 1);
      }, 400);
    });
  }

  // ─── User Update (tier/role) ────────────────────────────

  async function updateUser(userId, updates, selectEl) {
    const previousValue = selectEl ? selectEl.dataset.prevValue : null;

    const data = await authFetch('/api/admin?resource=users', {
      method: 'PUT',
      body: JSON.stringify(Object.assign({ user_id: userId }, updates)),
    });

    if (data.error) {
      alert('Errore: ' + data.error);
      // Revert the select to its previous value on failure
      if (selectEl && previousValue !== null) {
        selectEl.value = previousValue;
      }
      return;
    }

    // Update stored previous value to the new successful value
    if (selectEl) {
      selectEl.dataset.prevValue = selectEl.value;
    }

    // Brief visual feedback — flash the card border green to confirm save
    const card = document.querySelector('[data-user-id="' + userId + '"]');
    if (card) {
      card.style.transition = 'box-shadow 0.3s ease';
      card.style.boxShadow = '0 0 0 2px var(--green)';
      setTimeout(function () {
        card.style.boxShadow = '';
      }, 1500);
    }
  }

  // ==========================================
  // UTILITIES
  // ==========================================

  /**
   * Format ISO date to Italian short format.
   */
  function formatDate(isoString) {
    if (!isoString) return '\u2014';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch (_e) {
      return isoString;
    }
  }

  // ─── INIT ───────────────────────────────────────────────
  checkAuth();
})();
