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

var ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').filter(Boolean);
var VAT_REGEX = /^IT\d{11}$/;
var VALID_TIERS = ['free', 'pro', 'vip'];
var VALID_ROLES = [null, 'partner', 'admin'];
var VALID_APP_STATUSES = ['pending', 'approved', 'rejected', 'revoked'];

module.exports = async function handler(req, res) {
  var auth = await authenticate(req);
  if (auth.error) return res.status(401).json({ error: auth.error });

  var user = auth.user;
  var profile = auth.profile;
  var resource = req.query.resource;

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
  var country = vatNumber.slice(0, 2).toUpperCase();
  var number = vatNumber.slice(2);
  var url =
    'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/' + country + '/vat/' + number;

  try {
    var resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return { valid: null, name: null, address: null };
    var data = await resp.json();
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

// ─── Apply ──────────────────────────────────────────────────────────────────

async function handleApply(req, res, user) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // GET — stato della propria candidatura
  if (req.method === 'GET') {
    var { data, error } = await supabase
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
  var body = req.body || {};

  // Validazione business_name
  if (!body.business_name || typeof body.business_name !== 'string') {
    return res.status(400).json({ error: 'Ragione sociale obbligatoria' });
  }
  var businessName = body.business_name.trim();
  if (businessName.length === 0 || businessName.length > 200) {
    return res.status(400).json({ error: 'Ragione sociale: massimo 200 caratteri' });
  }

  // Validazione vat_number
  if (!body.vat_number || typeof body.vat_number !== 'string') {
    return res.status(400).json({ error: 'Partita IVA obbligatoria' });
  }
  var vatNumber = body.vat_number.trim().toUpperCase();
  if (!VAT_REGEX.test(vatNumber)) {
    return res.status(400).json({ error: 'Partita IVA non valida. Formato: IT + 11 cifre' });
  }

  // Validazione province (opzionale, max 2 caratteri)
  var province = null;
  if (body.province) {
    province = String(body.province).trim().toUpperCase();
    if (province.length > 2) {
      return res.status(400).json({ error: 'Provincia: massimo 2 caratteri (es. MI, RM)' });
    }
  }

  // Validazione website (opzionale, deve iniziare con http:// o https://)
  var website = null;
  if (body.website) {
    website = String(body.website).trim();
    if (website && !website.startsWith('http://') && !website.startsWith('https://')) {
      return res.status(400).json({ error: 'Sito web deve iniziare con http:// o https://' });
    }
  }

  var city = body.city ? String(body.city).trim() : null;

  // Check candidatura esistente
  var { data: existing, error: existingError } = await supabase
    .from('partner_applications')
    .select('id, status')
    .eq('user_id', user.id)
    .single();

  if (existing && existing.status !== 'rejected') {
    var statusLabels = {
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
  var vies = await validateVies(vatNumber);

  // Se esiste una candidatura rifiutata, aggiorna quella (il UNIQUE constraint lo richiede)
  var result;
  if (existing && existing.status === 'rejected') {
    var { data: updated, error: updateError } = await supabase
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
    var { data: created, error: insertError } = await supabase
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
      })
      .select()
      .single();

    if (insertError) return res.status(500).json({ error: insertError.message });
    result = created;
  }

  // Notifica email agli admin
  if (ADMIN_EMAILS.length > 0) {
    var emailData = buildPartnerApplicationNotification(result, user.email);
    for (var i = 0; i < ADMIN_EMAILS.length; i++) {
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
    var statusFilter = req.query.status;
    if (statusFilter && VALID_APP_STATUSES.indexOf(statusFilter) === -1) {
      return res.status(400).json({
        error: 'Stato non valido. Valori: ' + VALID_APP_STATUSES.join(', '),
      });
    }

    var query = supabase
      .from('partner_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    var { data: apps, error: appsError } = await query;
    if (appsError) return res.status(500).json({ error: appsError.message });

    // Recupera email utenti in parallelo
    var emails = {};
    if (apps.length > 0) {
      var emailPromises = apps.map(function (app) {
        return supabase.auth.admin
          .getUserById(app.user_id)
          .then(function (result) {
            if (result.data && result.data.user) {
              emails[app.user_id] = result.data.user.email;
            }
          })
          .catch(function () {
            /* ignore */
          });
      });
      await Promise.all(emailPromises);
    }

    var enriched = apps.map(function (app) {
      return Object.assign({}, app, { email: emails[app.user_id] || null });
    });

    return res.status(200).json({ applications: enriched });
  }

  // POST — gestione candidature (approve/reject/revoke)
  var action = req.query.action;
  if (!action || ['approve', 'reject', 'revoke'].indexOf(action) === -1) {
    return res.status(400).json({ error: 'Azione non valida. Valori: approve, reject, revoke' });
  }

  var body = req.body || {};
  if (!body.application_id) {
    return res.status(400).json({ error: 'application_id obbligatorio' });
  }

  // Recupera candidatura
  var { data: application, error: fetchError } = await supabase
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

  // Aggiorna candidatura
  var { error: updateError } = await supabase
    .from('partner_applications')
    .update({
      status: 'approved',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', application.id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  // Aggiorna profilo: role='partner'
  var { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'partner' })
    .eq('user_id', application.user_id);

  if (profileError) {
    console.error('[Admin] Profile update error:', profileError.message);
  }

  // Invia email di approvazione
  var { data: userData } = await supabase.auth.admin.getUserById(application.user_id);
  if (userData && userData.user && userData.user.email) {
    var emailData = buildPartnerApprovalEmail(application);
    sendEmail({
      to: userData.user.email,
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

  var trimmedReason = reason.trim();

  // Aggiorna candidatura
  var { error: updateError } = await supabase
    .from('partner_applications')
    .update({
      status: 'rejected',
      rejection_reason: trimmedReason,
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', application.id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  // Invia email di rifiuto
  var { data: userData } = await supabase.auth.admin.getUserById(application.user_id);
  if (userData && userData.user && userData.user.email) {
    var emailData = buildPartnerRejectionEmail(application, trimmedReason);
    sendEmail({
      to: userData.user.email,
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
  var { error: updateError } = await supabase
    .from('partner_applications')
    .update({
      status: 'revoked',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', application.id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  // Revoca ruolo partner dal profilo
  var { error: profileError } = await supabase
    .from('profiles')
    .update({ role: null })
    .eq('user_id', application.user_id);

  if (profileError) {
    console.error('[Admin] Profile revoke error:', profileError.message);
  }

  return res.status(200).json({ ok: true, status: 'revoked' });
}

// ─── Users (Admin) ──────────────────────────────────────────────────────────

async function handleUsers(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // PUT — aggiorna tier/ruolo utente
  if (req.method === 'PUT') {
    var body = req.body || {};
    if (!body.user_id) {
      return res.status(400).json({ error: 'user_id obbligatorio' });
    }

    var updates = {};

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

    var { data: updatedProfile, error: updateError } = await supabase
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
  var page = Math.max(1, parseInt(req.query.page) || 1);
  var perPage = 50;
  var offset = (page - 1) * perPage;
  var search = req.query.search ? req.query.search.trim() : null;

  var query = supabase
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

  var { data: profiles, error: profilesError, count: totalCount } = await query;
  if (profilesError) return res.status(500).json({ error: profilesError.message });

  // Recupera email utenti in parallelo
  var emails = {};
  if (profiles.length > 0) {
    var emailPromises = profiles.map(function (p) {
      return supabase.auth.admin
        .getUserById(p.user_id)
        .then(function (result) {
          if (result.data && result.data.user) {
            emails[p.user_id] = result.data.user.email;
          }
        })
        .catch(function () {
          /* ignore */
        });
    });
    await Promise.all(emailPromises);
  }

  // Se abbiamo una ricerca, cerca anche per email (non disponibile via .ilike su profiles)
  // Filtro post-fetch: se search non matcha display_name, controlliamo email
  var enriched = profiles.map(function (p) {
    return Object.assign({}, p, { email: emails[p.user_id] || null });
  });

  // Calcola statistiche (sulla pagina corrente se c'e' search, altrimenti globali)
  var statsQuery;
  if (search) {
    // Per la ricerca, le stats sono relative ai risultati filtrati
    statsQuery = {
      total: totalCount || 0,
      free: enriched.filter(function (p) { return p.tier === 'free'; }).length,
      pro: enriched.filter(function (p) { return p.tier === 'pro'; }).length,
      vip: enriched.filter(function (p) { return p.tier === 'vip'; }).length,
      partners: enriched.filter(function (p) { return p.role === 'partner'; }).length,
    };
  } else {
    // Stats globali: query dedicate per conteggi precisi
    var tierCounts = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tier', 'free'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tier', 'pro'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tier', 'vip'),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'partner'),
    ]);

    statsQuery = {
      total: totalCount || 0,
      free: tierCounts[0].count || 0,
      pro: tierCounts[1].count || 0,
      vip: tierCounts[2].count || 0,
      partners: tierCounts[3].count || 0,
    };
  }

  return res.status(200).json({
    users: enriched,
    stats: statsQuery,
    pagination: {
      page: page,
      per_page: perPage,
      total: totalCount || 0,
      total_pages: Math.ceil((totalCount || 0) / perPage),
    },
  });
}
