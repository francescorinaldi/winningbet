/**
 * /api/admin?resource=apply|applications|users
 *
 * Endpoint unificato per candidature partner e gestione admin.
 *
 * resource=apply        — GET: stato propria candidatura
 *                         POST: invia candidatura partner
 * resource=applications — GET: lista candidature (admin)
 *                         POST + action=approve|reject|revoke: gestione candidature (admin)
 * resource=users        — GET: lista utenti con stats (admin)
 *                         PUT: aggiorna tier/ruolo utente (admin)
 *
 * Tutte le risorse richiedono JWT authentication.
 * Le risorse "applications" e "users" richiedono role='admin'.
 */

const { authenticate } = require('./_lib/auth-middleware');
const { supabase } = require('./_lib/supabase');
const {
  sendEmail,
  buildPartnerApplicationNotification,
  buildPartnerApprovalEmail,
  buildPartnerRejectionEmail,
} = require('./_lib/email');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').filter(Boolean);
const VAT_REGEX = /^IT\d{11}$/;
const VALID_TIERS = ['free', 'pro', 'vip'];
const VALID_ROLES = [null, 'partner', 'admin'];
const VALID_APP_STATUSES = ['pending', 'approved', 'rejected', 'revoked'];

module.exports = async function handler(req, res) {
  const auth = await authenticate(req);
  if (auth.error) return res.status(401).json({ error: auth.error });

  const user = auth.user;
  const profile = auth.profile;
  const resource = req.query.resource;

  if (resource === 'apply') {
    return handleApply(req, res, user);
  }
  if (resource === 'applications') {
    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Accesso riservato agli amministratori' });
    }
    return handleApplications(req, res, user);
  }
  if (resource === 'users') {
    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Accesso riservato agli amministratori' });
    }
    return handleUsers(req, res);
  }

  return res
    .status(400)
    .json({ error: 'Parametro resource richiesto: apply, applications o users' });
};

// ─── VIES Validation ────────────────────────────────────────────────────────

/**
 * Valida una Partita IVA tramite il servizio VIES della Commissione Europea.
 *
 * @param {string} vatNumber - P.IVA con prefisso paese (es. IT01234567890)
 * @returns {Promise<{valid: boolean|null, name: string|null, address: string|null}>}
 */
async function validateVies(vatNumber) {
  const country = vatNumber.slice(0, 2).toUpperCase();
  const number = vatNumber.slice(2);
  const url =
    'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/' + country + '/vat/' + number;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return { valid: null, name: null, address: null };
    const data = await resp.json();
    return {
      valid: data.isValid === true,
      name: data.name && data.name !== '---' ? data.name : null,
      address: data.address && data.address !== '---' ? data.address : null,
    };
  } catch (err) {
    console.error('[VIES] Error:', err.message);
    return { valid: null, name: null, address: null };
  }
}

// ─── Batch User Email Lookup ────────────────────────────────────────────────

/**
 * Retrieves emails for a set of user IDs using batch listUsers() instead of
 * per-row getUserById(). Paginates through all auth users matching the given IDs.
 *
 * @param {string[]} userIds - Array of user UUIDs
 * @returns {Promise<Object<string, string>>} Map of userId → email
 */
async function batchGetUserEmails(userIds) {
  const emailMap = {};
  if (!userIds || userIds.length === 0) return emailMap;

  const remaining = new Set(userIds);
  let page = 1;
  const perPage = 1000;

  while (remaining.size > 0) {
    const result = await supabase.auth.admin.listUsers({ page, perPage });

    if (!result || result.error || !result.data || !result.data.users || result.data.users.length === 0) {
      break;
    }

    for (const user of result.data.users) {
      if (remaining.has(user.id)) {
        emailMap[user.id] = user.email;
        remaining.delete(user.id);
      }
    }

    // If we got fewer users than requested, we've reached the end
    if (result.data.users.length < perPage) break;
    page++;
  }

  return emailMap;
}

// ─── Apply ──────────────────────────────────────────────────────────────────

async function handleApply(req, res, user) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // GET — stato della propria candidatura
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('partner_applications')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Nessuna candidatura trovata' });
    }
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST — invia candidatura
  const body = req.body || {};

  // Validazione business_name
  if (!body.business_name || typeof body.business_name !== 'string') {
    return res.status(400).json({ error: 'Ragione sociale obbligatoria' });
  }
  const businessName = body.business_name.trim();
  if (businessName.length === 0 || businessName.length > 200) {
    return res.status(400).json({ error: 'Ragione sociale: massimo 200 caratteri' });
  }

  // Validazione vat_number
  if (!body.vat_number || typeof body.vat_number !== 'string') {
    return res.status(400).json({ error: 'Partita IVA obbligatoria' });
  }
  const vatNumber = body.vat_number.trim().toUpperCase();
  if (!VAT_REGEX.test(vatNumber)) {
    return res.status(400).json({ error: 'Partita IVA non valida. Formato: IT + 11 cifre' });
  }

  // Validazione province (opzionale, max 2 caratteri)
  let province = null;
  if (body.province) {
    province = String(body.province).trim().toUpperCase();
    if (province.length > 2) {
      return res.status(400).json({ error: 'Provincia: massimo 2 caratteri (es. MI, RM)' });
    }
  }

  // Validazione website (opzionale, deve iniziare con http:// o https://)
  let website = null;
  if (body.website) {
    website = String(body.website).trim();
    if (website && !website.startsWith('http://') && !website.startsWith('https://')) {
      return res.status(400).json({ error: 'Sito web deve iniziare con http:// o https://' });
    }
  }

  const city = body.city ? String(body.city).trim() : null;

  // Check candidatura esistente
  const { data: existing, error: existingError } = await supabase
    .from('partner_applications')
    .select('id, status')
    .eq('user_id', user.id)
    .single();

  if (existing && existing.status !== 'rejected') {
    const statusLabels = {
      pending: 'in attesa di revisione',
      approved: 'gia\u0027 approvata',
      revoked: 'revocata',
    };
    return res.status(409).json({
      error:
        'Hai gia\u0027 una candidatura ' + (statusLabels[existing.status] || existing.status),
    });
  }
  if (existingError && existingError.code !== 'PGRST116') {
    return res.status(500).json({ error: existingError.message });
  }

  // Validazione VIES
  const vies = await validateVies(vatNumber);

  // Store applicant email denormalized to avoid cross-service lookups later
  const applicantEmail = user.email || null;

  // Se esiste una candidatura rifiutata, aggiorna quella (il UNIQUE constraint lo richiede)
  let result;
  if (existing && existing.status === 'rejected') {
    const { data: updated, error: updateError } = await supabase
      .from('partner_applications')
      .update({
        business_name: businessName,
        vat_number: vatNumber,
        vies_valid: vies.valid,
        vies_company_name: vies.name,
        vies_address: vies.address,
        city: city,
        province: province,
        website: website,
        applicant_email: applicantEmail,
        status: 'pending',
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });
    result = updated;
  } else {
    const { data: created, error: insertError } = await supabase
      .from('partner_applications')
      .insert({
        user_id: user.id,
        business_name: businessName,
        vat_number: vatNumber,
        vies_valid: vies.valid,
        vies_company_name: vies.name,
        vies_address: vies.address,
        city: city,
        province: province,
        website: website,
        applicant_email: applicantEmail,
      })
      .select()
      .single();

    if (insertError) return res.status(500).json({ error: insertError.message });
    result = created;
  }

  // Notifica email agli admin
  if (ADMIN_EMAILS.length > 0) {
    const emailData = buildPartnerApplicationNotification(result, user.email);
    for (let i = 0; i < ADMIN_EMAILS.length; i++) {
      sendEmail({
        to: ADMIN_EMAILS[i].trim(),
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
      }).catch(function (err) {
        console.error('[Admin] Email notification error:', err.message);
      });
    }
  }

  return res.status(201).json(result);
}

// ─── Applications (Admin) ───────────────────────────────────────────────────

async function handleApplications(req, res, adminUser) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // GET — lista candidature
  if (req.method === 'GET') {
    const statusFilter = req.query.status;
    if (statusFilter && VALID_APP_STATUSES.indexOf(statusFilter) === -1) {
      return res.status(400).json({
        error: 'Stato non valido. Valori: ' + VALID_APP_STATUSES.join(', '),
      });
    }

    let query = supabase
      .from('partner_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: apps, error: appsError } = await query;
    if (appsError) return res.status(500).json({ error: appsError.message });

    // Use denormalized applicant_email when available; fall back to batch lookup
    // for legacy rows that don't have it stored.
    const missingEmailIds = [];
    for (const app of apps) {
      if (!app.applicant_email) missingEmailIds.push(app.user_id);
    }

    let legacyEmails = {};
    if (missingEmailIds.length > 0) {
      legacyEmails = await batchGetUserEmails(missingEmailIds);
    }

    const enriched = apps.map(function (app) {
      return Object.assign({}, app, {
        email: app.applicant_email || legacyEmails[app.user_id] || null,
      });
    });

    return res.status(200).json({ applications: enriched });
  }

  // POST — gestione candidature (approve/reject/revoke)
  const action = req.query.action;
  if (!action || ['approve', 'reject', 'revoke'].indexOf(action) === -1) {
    return res.status(400).json({ error: 'Azione non valida. Valori: approve, reject, revoke' });
  }

  const body = req.body || {};
  if (!body.application_id) {
    return res.status(400).json({ error: 'application_id obbligatorio' });
  }

  // Recupera candidatura
  const { data: application, error: fetchError } = await supabase
    .from('partner_applications')
    .select('*')
    .eq('id', body.application_id)
    .single();

  if (fetchError && fetchError.code === 'PGRST116') {
    return res.status(404).json({ error: 'Candidatura non trovata' });
  }
  if (fetchError) return res.status(500).json({ error: fetchError.message });

  if (action === 'approve') {
    return handleApprove(res, application, adminUser);
  }
  if (action === 'reject') {
    return handleReject(res, application, adminUser, body.reason);
  }
  if (action === 'revoke') {
    return handleRevoke(res, application, adminUser);
  }
}

async function handleApprove(res, application, adminUser) {
  if (application.status !== 'pending') {
    return res.status(409).json({
      error: 'Solo candidature in stato "pending" possono essere approvate. Stato attuale: ' + application.status,
    });
  }

  // Read current profile role to prevent demoting admins
  const { data: currentProfile, error: profileFetchError } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', application.user_id)
    .single();

  if (profileFetchError) {
    console.error('[Admin] Profile fetch error:', profileFetchError.message);
    return res.status(500).json({ error: 'Impossibile leggere il profilo utente' });
  }

  // Aggiorna candidatura
  const { error: updateError } = await supabase
    .from('partner_applications')
    .update({
      status: 'approved',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', application.id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  // Aggiorna profilo: role='partner' — solo se il ruolo attuale non è admin
  // (un admin che viene approvato come partner mantiene il ruolo admin)
  if (!currentProfile.role || currentProfile.role === 'partner') {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ role: 'partner' })
      .eq('user_id', application.user_id);

    if (profileError) {
      console.error('[Admin] Profile update error:', profileError.message);
      // Abort: roll back application status to prevent inconsistent state
      await supabase
        .from('partner_applications')
        .update({ status: 'pending', reviewed_by: null, reviewed_at: null })
        .eq('id', application.id);
      return res.status(500).json({ error: 'Errore aggiornamento profilo: ' + profileError.message });
    }
  }

  // Invia email di approvazione — use denormalized email or fetch
  const recipientEmail = application.applicant_email || await getEmailByUserId(application.user_id);
  if (recipientEmail) {
    const emailData = buildPartnerApprovalEmail(application);
    sendEmail({
      to: recipientEmail,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
    }).catch(function (err) {
      console.error('[Admin] Approval email error:', err.message);
    });
  }

  return res.status(200).json({ ok: true, status: 'approved' });
}

async function handleReject(res, application, adminUser, reason) {
  if (application.status !== 'pending') {
    return res.status(409).json({
      error: 'Solo candidature in stato "pending" possono essere rifiutate. Stato attuale: ' + application.status,
    });
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return res.status(400).json({ error: 'Motivo del rifiuto obbligatorio' });
  }

  const trimmedReason = reason.trim();

  // Aggiorna candidatura
  const { error: updateError } = await supabase
    .from('partner_applications')
    .update({
      status: 'rejected',
      rejection_reason: trimmedReason,
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', application.id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  // Invia email di rifiuto — use denormalized email or fetch
  const recipientEmail = application.applicant_email || await getEmailByUserId(application.user_id);
  if (recipientEmail) {
    const emailData = buildPartnerRejectionEmail(application, trimmedReason);
    sendEmail({
      to: recipientEmail,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
    }).catch(function (err) {
      console.error('[Admin] Rejection email error:', err.message);
    });
  }

  return res.status(200).json({ ok: true, status: 'rejected' });
}

async function handleRevoke(res, application, adminUser) {
  if (application.status !== 'approved') {
    return res.status(409).json({
      error: 'Solo candidature in stato "approved" possono essere revocate. Stato attuale: ' + application.status,
    });
  }

  // Aggiorna candidatura
  const { error: updateError } = await supabase
    .from('partner_applications')
    .update({
      status: 'revoked',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', application.id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  // Revoca ruolo partner dal profilo — only if current role is exactly 'partner'.
  // This prevents accidentally removing admin privileges from admin users.
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: null })
    .eq('user_id', application.user_id)
    .eq('role', 'partner');

  if (profileError) {
    console.error('[Admin] Profile revoke error:', profileError.message);
  }

  return res.status(200).json({ ok: true, status: 'revoked' });
}

// ─── Helper: Get Single User Email ─────────────────────────────────────────

/**
 * Fallback for single-user email lookup (used in approve/reject/revoke
 * when applicant_email is not stored on legacy rows).
 */
async function getEmailByUserId(userId) {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data && data.user && data.user.email ? data.user.email : null;
}

// ─── Users (Admin) ──────────────────────────────────────────────────────────

async function handleUsers(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // PUT — aggiorna tier/ruolo utente
  if (req.method === 'PUT') {
    const body = req.body || {};
    if (!body.user_id) {
      return res.status(400).json({ error: 'user_id obbligatorio' });
    }

    const updates = {};

    if (body.tier !== undefined) {
      if (VALID_TIERS.indexOf(body.tier) === -1) {
        return res.status(400).json({
          error: 'Tier non valido. Valori: ' + VALID_TIERS.join(', '),
        });
      }
      updates.tier = body.tier;
    }

    if (body.role !== undefined) {
      if (VALID_ROLES.indexOf(body.role) === -1) {
        return res.status(400).json({
          error: 'Ruolo non valido. Valori: null, partner, admin',
        });
      }
      updates.role = body.role;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Specificare almeno tier o role da aggiornare' });
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', body.user_id)
      .select('user_id, display_name, tier, role, created_at, last_visit_date, total_visits')
      .single();

    if (updateError && updateError.code === 'PGRST116') {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.status(200).json(updatedProfile);
  }

  // GET — lista utenti con paginazione e ricerca
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const perPage = 50;
  const offset = (page - 1) * perPage;
  const search = req.query.search ? req.query.search.trim() : null;

  let query = supabase
    .from('profiles')
    .select('user_id, display_name, tier, role, created_at, last_visit_date, total_visits', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  if (search) {
    query = query.or(
      'display_name.ilike.%' + search + '%'
    );
  }

  const { data: profiles, error: profilesError, count: totalCount } = await query;
  if (profilesError) return res.status(500).json({ error: profilesError.message });

  // Batch email lookup — replaces N+1 getUserById() calls
  const userIds = profiles.map(function (p) { return p.user_id; });
  const emails = await batchGetUserEmails(userIds);

  // Enrich profiles with email
  let enriched = profiles.map(function (p) {
    return Object.assign({}, p, { email: emails[p.user_id] || null });
  });

  // Post-fetch email search: if search query was provided, also match against email
  // (email is not in the profiles table, so we can't filter DB-side)
  if (search) {
    const lowerSearch = search.toLowerCase();
    enriched = enriched.filter(function (p) {
      const nameMatch = p.display_name && p.display_name.toLowerCase().indexOf(lowerSearch) !== -1;
      const emailMatch = p.email && p.email.toLowerCase().indexOf(lowerSearch) !== -1;
      return nameMatch || emailMatch;
    });
  }

  // Calcola statistiche (sulla pagina corrente se c'e' search, altrimenti globali)
  let stats;
  if (search) {
    // Per la ricerca, le stats sono relative ai risultati filtrati
    stats = {
      total: enriched.length,
      free: enriched.filter(function (p) { return p.tier === 'free'; }).length,
      pro: enriched.filter(function (p) { return p.tier === 'pro'; }).length,
      vip: enriched.filter(function (p) { return p.tier === 'vip'; }).length,
      partners: enriched.filter(function (p) { return p.role === 'partner'; }).length,
    };
  } else {
    // Stats globali: query dedicate per conteggi precisi
    const tierCounts = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tier', 'free'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tier', 'pro'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tier', 'vip'),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'partner'),
    ]);

    stats = {
      total: totalCount || 0,
      free: tierCounts[0].count || 0,
      pro: tierCounts[1].count || 0,
      vip: tierCounts[2].count || 0,
      partners: tierCounts[3].count || 0,
    };
  }

  return res.status(200).json({
    users: enriched,
    stats: stats,
    pagination: {
      page: page,
      per_page: perPage,
      total: search ? enriched.length : (totalCount || 0),
      total_pages: Math.ceil((search ? enriched.length : (totalCount || 0)) / perPage),
    },
  });
}
