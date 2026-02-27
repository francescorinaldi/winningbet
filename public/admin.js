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
  var session = null;
  var currentFilter = 'all';
  var currentSearchTimeout = null;
  var currentUsersPage = 1;
  var rejectingAppId = null;
  var usersLoaded = false;

  // ─── STATUS LABELS ──────────────────────────────────────
  var STATUS_LABELS = {
    pending: 'In Attesa',
    approved: 'Approvata',
    rejected: 'Rifiutata',
    revoked: 'Revocata',
  };

  var TIER_LABELS = {
    free: 'FREE',
    pro: 'PRO',
    vip: 'VIP',
  };

  // ==========================================
  // AUTH CHECK
  // ==========================================

  async function checkAuth() {
    try {
      var result = await SupabaseConfig.getSession();
      session = (result && result.data && result.data.session) || null;

      if (!session) {
        window.location.href = '/auth.html?return=/admin.html';
        return;
      }

      // Verify admin role — try to load applications (returns 403 if not admin)
      var test = await authFetch('/api/admin?resource=applications');
      if (test.error) {
        show403();
        return;
      }

      // Admin verified — load data
      loadApplications();
    } catch (err) {
      // HTTP 403 = not admin
      if (err.message && err.message.indexOf('403') !== -1) {
        show403();
        return;
      }
      console.error('[checkAuth]', err.message || err);
      show403();
    }
  }

  /**
   * Show 403 access denied — replace main content.
   */
  function show403() {
    var main = document.querySelector('.dash-main .container');
    if (!main) return;

    // Clear child nodes safely
    while (main.firstChild) {
      main.removeChild(main.firstChild);
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'admin-forbidden';

    var icon = document.createElement('div');
    icon.className = 'admin-forbidden-icon';
    icon.textContent = '\uD83D\uDEAB'; // prohibited sign

    var title = document.createElement('h2');
    title.textContent = 'Accesso Negato';

    var desc = document.createElement('p');
    desc.textContent = 'Non hai i permessi per accedere al pannello amministrazione.';

    var link = document.createElement('a');
    link.href = '/dashboard.html';
    link.className = 'btn btn-outline';
    link.textContent = 'Torna alla Dashboard';

    wrapper.appendChild(icon);
    wrapper.appendChild(title);
    wrapper.appendChild(desc);
    wrapper.appendChild(link);
    main.appendChild(wrapper);
  }

  // ==========================================
  // AUTH FETCH HELPER
  // ==========================================

  /**
   * Fetch helper: adds Authorization header & parses JSON.
   * Returns parsed object with optional error field.
   */
  async function authFetch(url, options) {
    if (!session) throw new Error('No session');
    var opts = options || {};
    opts.headers = Object.assign(
      { Authorization: 'Bearer ' + session.access_token },
      opts.headers || {},
    );
    if (opts.body && typeof opts.body === 'string') {
      opts.headers['Content-Type'] = 'application/json';
    }
    var resp = await fetch(url, opts);
    var data = await resp.json();
    if (!resp.ok) return { error: data.error || 'Errore ' + resp.status };
    return data;
  }

  // ==========================================
  // LOGOUT
  // ==========================================

  var logoutBtn = document.getElementById('logoutBtn');
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

  var tabBtns = document.querySelectorAll('.dash-tab');
  tabBtns.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabBtns.forEach(function (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      var target = tab.getAttribute('data-tab');

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
    var list = document.getElementById('applicationsList');
    var empty = document.getElementById('applicationsEmpty');
    var loading = document.getElementById('applicationsLoading');

    clearChildren(list);
    empty.style.display = 'none';
    if (loading) loading.style.display = '';

    var url = '/api/admin?resource=applications';
    if (currentFilter !== 'all') url += '&status=' + currentFilter;

    var data = await authFetch(url);

    if (loading) loading.style.display = 'none';

    if (data.error) {
      empty.style.display = '';
      var p = empty.querySelector('p');
      if (p) p.textContent = 'Errore: ' + data.error;
      return;
    }

    var apps = data.applications || [];
    if (apps.length === 0) {
      empty.style.display = '';
      var emptyP = empty.querySelector('p');
      if (emptyP) emptyP.textContent = 'Nessuna candidatura trovata.';
      return;
    }

    renderApplications(apps);
  }

  /**
   * Render application cards using DOM methods (no innerHTML with user data).
   */
  function renderApplications(apps) {
    var container = document.getElementById('applicationsList');
    clearChildren(container);

    apps.forEach(function (app) {
      var card = document.createElement('div');
      card.className = 'admin-app-card';

      // Header row: business name + status badge
      var header = document.createElement('div');
      header.className = 'admin-app-header';

      var nameEl = document.createElement('h3');
      nameEl.className = 'admin-app-name';
      nameEl.textContent = app.business_name;

      var badge = document.createElement('span');
      badge.className = 'admin-status-badge admin-status-badge--' + app.status;
      badge.textContent = STATUS_LABELS[app.status] || app.status;

      header.appendChild(nameEl);
      header.appendChild(badge);
      card.appendChild(header);

      // Details grid
      var details = document.createElement('div');
      details.className = 'admin-app-details';

      // P.IVA + VIES badge
      var vatRow = createDetailRow('P.IVA', null);
      var vatValue = vatRow.querySelector('.admin-detail-value');
      vatValue.textContent = app.vat_number;
      if (app.vies_valid === true) {
        var viesBadge = document.createElement('span');
        viesBadge.className = 'admin-vies-badge admin-vies-badge--valid';
        viesBadge.textContent = 'VIES OK';
        vatValue.appendChild(viesBadge);
      } else if (app.vies_valid === false) {
        var viesBadgeInv = document.createElement('span');
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
      var location = [app.city, app.province].filter(Boolean).join(' (') + (app.province ? ')' : '');
      if (location) {
        details.appendChild(createDetailRow('Sede', location));
      }

      // Website
      if (app.website) {
        var webRow = createDetailRow('Sito', null);
        var webValue = webRow.querySelector('.admin-detail-value');
        var webLink = document.createElement('a');
        webLink.href = app.website;
        webLink.target = '_blank';
        webLink.rel = 'noopener noreferrer';
        webLink.textContent = app.website.replace(/^https?:\/\//, '');
        webLink.className = 'admin-link';
        webValue.appendChild(webLink);
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
        var reasonRow = createDetailRow('Motivo rifiuto', app.rejection_reason);
        reasonRow.classList.add('admin-detail-row--reason');
        details.appendChild(reasonRow);
      }

      card.appendChild(details);

      // Actions
      var actions = document.createElement('div');
      actions.className = 'admin-actions';

      if (app.status === 'pending') {
        var approveBtn = document.createElement('button');
        approveBtn.className = 'admin-btn admin-btn--approve';
        approveBtn.textContent = 'Approva';
        approveBtn.addEventListener('click', function () {
          approveApplication(app.id);
        });

        var rejectBtn = document.createElement('button');
        rejectBtn.className = 'admin-btn admin-btn--danger';
        rejectBtn.textContent = 'Rifiuta';
        rejectBtn.addEventListener('click', function () {
          showRejectModal(app.id);
        });

        actions.appendChild(approveBtn);
        actions.appendChild(rejectBtn);
      } else if (app.status === 'approved') {
        var revokeBtn = document.createElement('button');
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
    var row = document.createElement('div');
    row.className = 'admin-detail-row';

    var labelEl = document.createElement('span');
    labelEl.className = 'admin-detail-label';
    labelEl.textContent = label;

    var valueEl = document.createElement('span');
    valueEl.className = 'admin-detail-value';
    if (value !== null && value !== undefined) {
      valueEl.textContent = value;
    }

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return row;
  }

  // ─── Filter Buttons ─────────────────────────────────────

  var filterBtns = document.querySelectorAll('.admin-filter-btn');
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

    var data = await authFetch('/api/admin?resource=applications&action=approve', {
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
    var modal = document.getElementById('rejectModal');
    var textarea = document.getElementById('rejectReason');
    textarea.value = '';
    modal.style.display = '';
  }

  function hideRejectModal() {
    rejectingAppId = null;
    document.getElementById('rejectModal').style.display = 'none';
  }

  var rejectCancelBtn = document.getElementById('rejectCancel');
  if (rejectCancelBtn) {
    rejectCancelBtn.addEventListener('click', hideRejectModal);
  }

  var rejectConfirmBtn = document.getElementById('rejectConfirm');
  if (rejectConfirmBtn) {
    rejectConfirmBtn.addEventListener('click', async function () {
      var reason = document.getElementById('rejectReason').value.trim();
      if (!reason) {
        alert('Inserisci il motivo del rifiuto.');
        return;
      }

      var data = await authFetch('/api/admin?resource=applications&action=reject', {
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
  var rejectModal = document.getElementById('rejectModal');
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

    var data = await authFetch('/api/admin?resource=applications&action=revoke', {
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
    var list = document.getElementById('usersList');
    var loading = document.getElementById('usersLoading');
    var pagination = document.getElementById('usersPagination');

    clearChildren(list);
    if (loading) loading.style.display = '';
    if (pagination) pagination.style.display = 'none';

    var url = '/api/admin?resource=users&page=' + (page || 1);
    if (search) url += '&search=' + encodeURIComponent(search);

    var data = await authFetch(url);

    if (loading) loading.style.display = 'none';

    if (data.error) {
      var errP = document.createElement('p');
      errP.className = 'admin-empty';
      errP.textContent = 'Errore: ' + data.error;
      list.appendChild(errP);
      return;
    }

    renderUserStats(data.stats);
    renderUsers(data.users);
    renderPagination(data.pagination, search);
  }

  /**
   * Render user stats bar.
   */
  function renderUserStats(stats) {
    var container = document.getElementById('userStats');
    clearChildren(container);

    if (!stats) return;

    var items = [
      { label: 'Totali', value: stats.total, cls: '' },
      { label: 'Free', value: stats.free, cls: 'admin-stat--free' },
      { label: 'PRO', value: stats.pro, cls: 'admin-stat--pro' },
      { label: 'VIP', value: stats.vip, cls: 'admin-stat--vip' },
      { label: 'Partner', value: stats.partners, cls: 'admin-stat--partner' },
    ];

    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'admin-stat-card ' + item.cls;

      var value = document.createElement('div');
      value.className = 'admin-stat-value';
      value.textContent = item.value;

      var label = document.createElement('div');
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
    var container = document.getElementById('usersList');
    clearChildren(container);

    if (!users || users.length === 0) {
      var emptyP = document.createElement('p');
      emptyP.className = 'admin-empty';
      emptyP.textContent = 'Nessun utente trovato.';
      container.appendChild(emptyP);
      return;
    }

    users.forEach(function (user) {
      var card = document.createElement('div');
      card.className = 'admin-user-card';

      // Header: name + badges
      var header = document.createElement('div');
      header.className = 'admin-user-header';

      var nameBlock = document.createElement('div');
      nameBlock.className = 'admin-user-name-block';

      var nameEl = document.createElement('h3');
      nameEl.className = 'admin-user-name';
      nameEl.textContent = user.display_name || 'Senza nome';

      var emailEl = document.createElement('span');
      emailEl.className = 'admin-user-email';
      emailEl.textContent = user.email || '';

      nameBlock.appendChild(nameEl);
      nameBlock.appendChild(emailEl);

      var badges = document.createElement('div');
      badges.className = 'admin-user-badges';

      var tierBadge = document.createElement('span');
      tierBadge.className = 'admin-tier-badge admin-tier-badge--' + (user.tier || 'free');
      tierBadge.textContent = TIER_LABELS[user.tier] || 'FREE';
      badges.appendChild(tierBadge);

      if (user.role) {
        var roleBadge = document.createElement('span');
        roleBadge.className = 'admin-role-badge admin-role-badge--' + user.role;
        roleBadge.textContent = user.role.toUpperCase();
        badges.appendChild(roleBadge);
      }

      header.appendChild(nameBlock);
      header.appendChild(badges);
      card.appendChild(header);

      // Metadata row
      var meta = document.createElement('div');
      meta.className = 'admin-user-meta';

      if (user.last_visit_date) {
        var visitEl = document.createElement('span');
        visitEl.textContent = 'Ultima visita: ' + formatDate(user.last_visit_date);
        meta.appendChild(visitEl);
      }

      if (user.total_visits) {
        var visitsEl = document.createElement('span');
        visitsEl.textContent = user.total_visits + ' visite';
        meta.appendChild(visitsEl);
      }

      var createdEl = document.createElement('span');
      createdEl.textContent = 'Membro dal ' + formatDate(user.created_at);
      meta.appendChild(createdEl);

      card.appendChild(meta);

      // Actions: tier and role selects
      var actions = document.createElement('div');
      actions.className = 'admin-user-actions';

      // Tier select
      var tierGroup = document.createElement('div');
      tierGroup.className = 'admin-select-group';

      var tierLabel = document.createElement('label');
      tierLabel.textContent = 'Tier';
      tierLabel.className = 'admin-select-label';

      var tierSelect = document.createElement('select');
      tierSelect.className = 'admin-select';
      ['free', 'pro', 'vip'].forEach(function (t) {
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = TIER_LABELS[t];
        if (t === (user.tier || 'free')) opt.selected = true;
        tierSelect.appendChild(opt);
      });

      tierSelect.addEventListener('change', function () {
        updateUser(user.user_id, { tier: tierSelect.value });
      });

      tierGroup.appendChild(tierLabel);
      tierGroup.appendChild(tierSelect);
      actions.appendChild(tierGroup);

      // Role select
      var roleGroup = document.createElement('div');
      roleGroup.className = 'admin-select-group';

      var roleLabel = document.createElement('label');
      roleLabel.textContent = 'Ruolo';
      roleLabel.className = 'admin-select-label';

      var roleSelect = document.createElement('select');
      roleSelect.className = 'admin-select';
      [
        { value: '', label: '\u2014' },
        { value: 'partner', label: 'Partner' },
        { value: 'admin', label: 'Admin' },
      ].forEach(function (r) {
        var opt = document.createElement('option');
        opt.value = r.value;
        opt.textContent = r.label;
        if ((user.role || '') === r.value) opt.selected = true;
        roleSelect.appendChild(opt);
      });

      roleSelect.addEventListener('change', function () {
        var val = roleSelect.value || null;
        updateUser(user.user_id, { role: val });
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
    var container = document.getElementById('usersPagination');
    if (!container || !pag || pag.total_pages <= 1) {
      if (container) container.style.display = 'none';
      return;
    }

    container.style.display = '';
    clearChildren(container);

    var info = document.createElement('span');
    info.className = 'admin-pagination-info';
    info.textContent =
      'Pagina ' + pag.page + ' di ' + pag.total_pages +
      ' (' + pag.total + ' utenti)';
    container.appendChild(info);

    var btnGroup = document.createElement('div');
    btnGroup.className = 'admin-pagination-btns';

    if (pag.page > 1) {
      var prevBtn = document.createElement('button');
      prevBtn.className = 'admin-btn admin-btn--secondary admin-btn--sm';
      prevBtn.textContent = 'Precedente';
      prevBtn.addEventListener('click', function () {
        currentUsersPage = pag.page - 1;
        var searchVal = document.getElementById('userSearch').value.trim();
        loadUsers(searchVal || null, currentUsersPage);
      });
      btnGroup.appendChild(prevBtn);
    }

    if (pag.page < pag.total_pages) {
      var nextBtn = document.createElement('button');
      nextBtn.className = 'admin-btn admin-btn--secondary admin-btn--sm';
      nextBtn.textContent = 'Successiva';
      nextBtn.addEventListener('click', function () {
        currentUsersPage = pag.page + 1;
        var searchVal = document.getElementById('userSearch').value.trim();
        loadUsers(searchVal || null, currentUsersPage);
      });
      btnGroup.appendChild(nextBtn);
    }

    container.appendChild(btnGroup);
  }

  // ─── Search with Debounce ───────────────────────────────

  var userSearchEl = document.getElementById('userSearch');
  if (userSearchEl) {
    userSearchEl.addEventListener('input', function () {
      clearTimeout(currentSearchTimeout);
      var query = this.value.trim();
      currentSearchTimeout = setTimeout(function () {
        currentUsersPage = 1;
        loadUsers(query || null, 1);
      }, 400);
    });
  }

  // ─── User Update (tier/role) ────────────────────────────

  async function updateUser(userId, updates) {
    var data = await authFetch('/api/admin?resource=users', {
      method: 'PUT',
      body: JSON.stringify(Object.assign({ user_id: userId }, updates)),
    });

    if (data.error) {
      alert('Errore: ' + data.error);
      return;
    }

    // Brief visual feedback — no full reload needed for single changes
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
      var d = new Date(isoString);
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
