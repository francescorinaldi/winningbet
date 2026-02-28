const handler = require('../../api/admin');
const { createMockReq, createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/auth-middleware', () => ({
  authenticate: jest.fn(),
}));
jest.mock('../../api/_lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { admin: { getUserById: jest.fn() } },
  },
}));
jest.mock('../../api/_lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  buildPartnerApplicationNotification: jest.fn().mockReturnValue({}),
  buildPartnerApprovalEmail: jest.fn().mockReturnValue({}),
  buildPartnerRejectionEmail: jest.fn().mockReturnValue({}),
}));

const { authenticate } = require('../../api/_lib/auth-middleware');
const { supabase } = require('../../api/_lib/supabase');

// ─── Helpers ─────────────────────────────────────────────────

function mockAuth(overrides = {}) {
  authenticate.mockResolvedValue({
    user: { id: 'user-1', email: 'user@test.com' },
    profile: { role: null, tier: 'free' },
    error: null,
    ...overrides,
  });
}

function mockChain(result) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
    then: jest.fn((r) => r(result)),
  };
  supabase.from.mockReturnValue(chain);
  return chain;
}

// ─── Tests ───────────────────────────────────────────────────

describe('/api/admin', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ─── Auth ─────────────────────────────────────────────────

  it('should return 401 when not authenticated', async () => {
    authenticate.mockResolvedValue({ user: null, error: 'Unauthorized' });

    const req = createMockReq({ query: { resource: 'applications' } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should return 400 for missing resource parameter', async () => {
    mockAuth();

    const req = createMockReq({ query: {} });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Parametro resource richiesto: apply, applications o users',
    });
  });

  // ─── resource=applications (admin-only) ───────────────────

  it('should return 403 for non-admin accessing applications', async () => {
    mockAuth();

    const req = createMockReq({ query: { resource: 'applications' } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Accesso riservato agli amministratori',
    });
  });

  it('should return 403 for partner role accessing applications', async () => {
    mockAuth({ profile: { role: 'partner', tier: 'vip' } });

    const req = createMockReq({ query: { resource: 'applications' } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  // ─── resource=users (admin-only) ──────────────────────────

  it('should return 403 for non-admin accessing users', async () => {
    mockAuth();

    const req = createMockReq({ query: { resource: 'users' } });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Accesso riservato agli amministratori',
    });
  });

  // ─── resource=apply (VAT validation) ──────────────────────

  it('should return 400 for missing business_name on apply POST', async () => {
    mockAuth();

    const req = createMockReq({
      method: 'POST',
      query: { resource: 'apply' },
      body: { vat_number: 'IT01234567890' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Ragione sociale obbligatoria',
    });
  });

  it('should return 400 for invalid VAT number format', async () => {
    mockAuth();

    const req = createMockReq({
      method: 'POST',
      query: { resource: 'apply' },
      body: { business_name: 'Test SRL', vat_number: 'INVALID' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Partita IVA non valida. Formato: IT + 11 cifre',
    });
  });

  it('should return 400 for VAT without IT prefix', async () => {
    mockAuth();

    const req = createMockReq({
      method: 'POST',
      query: { resource: 'apply' },
      body: { business_name: 'Test SRL', vat_number: '01234567890' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Partita IVA non valida. Formato: IT + 11 cifre',
    });
  });

  it('should return 400 for province longer than 2 chars', async () => {
    mockAuth();
    // Mock VIES fetch to avoid network call
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const req = createMockReq({
      method: 'POST',
      query: { resource: 'apply' },
      body: {
        business_name: 'Test SRL',
        vat_number: 'IT01234567890',
        province: 'MILANO',
      },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Provincia: massimo 2 caratteri (es. MI, RM)',
    });
  });

  it('should return 404 for GET apply with no existing application', async () => {
    mockAuth();
    mockChain({ data: null, error: { code: 'PGRST116' } });

    const req = createMockReq({
      method: 'GET',
      query: { resource: 'apply' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Nessuna candidatura trovata',
    });
  });

  it('should return 405 for unsupported method on apply', async () => {
    mockAuth();

    const req = createMockReq({
      method: 'DELETE',
      query: { resource: 'apply' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  // ─── resource=users (admin actions) ─────────────────────────

  it('should return 405 for unsupported method on users', async () => {
    mockAuth({ profile: { role: 'admin', tier: 'vip' } });

    const req = createMockReq({
      method: 'DELETE',
      query: { resource: 'users' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('should return 400 for PUT users without user_id', async () => {
    mockAuth({ profile: { role: 'admin', tier: 'vip' } });

    const req = createMockReq({
      method: 'PUT',
      query: { resource: 'users' },
      body: { tier: 'pro' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'user_id obbligatorio' });
  });

  it('should return 400 for invalid tier value', async () => {
    mockAuth({ profile: { role: 'admin', tier: 'vip' } });

    const req = createMockReq({
      method: 'PUT',
      query: { resource: 'users' },
      body: { user_id: 'u-2', tier: 'diamond' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Tier non valido. Valori: free, pro, vip',
    });
  });

  it('should return 400 for invalid role value', async () => {
    mockAuth({ profile: { role: 'admin', tier: 'vip' } });

    const req = createMockReq({
      method: 'PUT',
      query: { resource: 'users' },
      body: { user_id: 'u-2', role: 'superadmin' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Ruolo non valido. Valori: null, partner, admin',
    });
  });

  it('should return 400 when no tier or role specified in PUT users', async () => {
    mockAuth({ profile: { role: 'admin', tier: 'vip' } });

    const req = createMockReq({
      method: 'PUT',
      query: { resource: 'users' },
      body: { user_id: 'u-2' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Specificare almeno tier o role da aggiornare',
    });
  });

  it('should prevent admin from removing own admin role', async () => {
    mockAuth({
      user: { id: 'admin-1', email: 'admin@test.com' },
      profile: { role: 'admin', tier: 'vip' },
    });

    const req = createMockReq({
      method: 'PUT',
      query: { resource: 'users' },
      body: { user_id: 'admin-1', role: null },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Non puoi rimuovere il tuo ruolo admin',
    });
  });

  // ─── resource=applications (admin actions) ──────────────────

  it('should return 405 for unsupported method on applications', async () => {
    mockAuth({ profile: { role: 'admin', tier: 'vip' } });

    const req = createMockReq({
      method: 'DELETE',
      query: { resource: 'applications' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('should return 400 for POST applications without application_id', async () => {
    mockAuth({ profile: { role: 'admin', tier: 'vip' } });

    const req = createMockReq({
      method: 'POST',
      query: { resource: 'applications', action: 'reject' },
      body: { reason: 'Bad data' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'application_id obbligatorio',
    });
  });

  it('should return 400 for reject without reason', async () => {
    mockAuth({ profile: { role: 'admin', tier: 'vip' } });
    mockChain({
      data: { id: 'app-1', user_id: 'u-2', status: 'pending' },
      error: null,
    });

    const req = createMockReq({
      method: 'POST',
      query: { resource: 'applications', action: 'reject' },
      body: { application_id: 'app-1', reason: '' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Motivo del rifiuto obbligatorio',
    });
  });

  // ─── Happy paths ────────────────────────────────────────────

  it('should return paginated applications for admin GET', async () => {
    mockAuth({ profile: { role: 'admin', tier: 'vip' } });
    const apps = [
      { id: 'a1', user_id: 'u1', business_name: 'SRL1', applicant_email: 'u1@test.com', status: 'pending' },
      { id: 'a2', user_id: 'u2', business_name: 'SRL2', applicant_email: 'u2@test.com', status: 'approved' },
    ];
    const chain = mockChain({ data: apps, error: null, count: 2 });
    // The chain resolves via then() for non-single queries
    chain.then.mockImplementation((r) => r({ data: apps, error: null, count: 2 }));

    const req = createMockReq({
      method: 'GET',
      query: { resource: 'applications' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.applications).toHaveLength(2);
    expect(response.pagination).toBeDefined();
    expect(response.pagination.total).toBe(2);
  });

  it('should return paginated users for admin GET', async () => {
    mockAuth({
      user: { id: 'admin-1', email: 'admin@test.com' },
      profile: { role: 'admin', tier: 'vip' },
    });
    const profiles = [
      { user_id: 'u1', display_name: 'User1', tier: 'free', role: null },
      { user_id: 'u2', display_name: 'User2', tier: 'pro', role: null },
    ];
    const chain = mockChain({ data: profiles, error: null, count: 2 });
    chain.then.mockImplementation((r) => r({ data: profiles, error: null, count: 2 }));

    // Mock getUserById for email enrichment
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { email: 'test@test.com' } },
      error: null,
    });

    const req = createMockReq({
      method: 'GET',
      query: { resource: 'users' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.users).toBeDefined();
    expect(response.stats).toBeDefined();
    expect(response.pagination).toBeDefined();
  });

  it('should update user tier for admin PUT users', async () => {
    mockAuth({
      user: { id: 'admin-1', email: 'admin@test.com' },
      profile: { role: 'admin', tier: 'vip' },
    });
    const chain = mockChain({ data: { user_id: 'u2', tier: 'pro' }, error: null });
    chain.single.mockResolvedValue({ data: { user_id: 'u2', tier: 'pro' }, error: null });

    const req = createMockReq({
      method: 'PUT',
      query: { resource: 'users' },
      body: { user_id: 'u2', tier: 'pro' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ user_id: 'u2', tier: 'pro' });
  });

  it('should return 409 for approve on non-pending application', async () => {
    mockAuth({ profile: { role: 'admin', tier: 'vip' } });
    mockChain({
      data: { id: 'app-1', user_id: 'u-2', status: 'approved' },
      error: null,
    });

    const req = createMockReq({
      method: 'POST',
      query: { resource: 'applications', action: 'approve' },
      body: { application_id: 'app-1' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('should return 409 for revoke on non-approved application', async () => {
    mockAuth({ profile: { role: 'admin', tier: 'vip' } });
    mockChain({
      data: { id: 'app-1', user_id: 'u-2', status: 'pending' },
      error: null,
    });

    const req = createMockReq({
      method: 'POST',
      query: { resource: 'applications', action: 'revoke' },
      body: { application_id: 'app-1' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  // ─── Happy paths: approve, reject, revoke, POST apply ──────

  it('should approve a pending application and set role=partner', async () => {
    mockAuth({
      user: { id: 'admin-1', email: 'admin@test.com' },
      profile: { role: 'admin', tier: 'vip' },
    });

    // Build a chain that handles sequential from() calls:
    // 1st from('partner_applications') → select → eq → single (fetch app)
    // 2nd from('profiles') → select → eq → single (fetch profile role)
    // 3rd from('partner_applications') → update → eq → eq → select → maybeSingle (approve)
    // 4th from('profiles') → update → eq (set role=partner)
    let fromCallCount = 0;
    supabase.from.mockImplementation(() => {
      fromCallCount++;
      const chain = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
        maybeSingle: jest.fn(),
      };
      if (fromCallCount === 1) {
        // Fetch application
        chain.single.mockResolvedValue({
          data: { id: 'app-1', user_id: 'u-2', status: 'pending', applicant_email: 'u2@test.com' },
          error: null,
        });
      } else if (fromCallCount === 2) {
        // Fetch profile role
        chain.single.mockResolvedValue({
          data: { role: null },
          error: null,
        });
      } else if (fromCallCount === 3) {
        // Approve application (update + maybeSingle)
        chain.maybeSingle.mockResolvedValue({
          data: { id: 'app-1', status: 'approved' },
          error: null,
        });
      } else if (fromCallCount === 4) {
        // Update profile role
        chain.update.mockReturnValue(chain);
        chain.eq.mockResolvedValue({ error: null });
      }
      return chain;
    });

    const req = createMockReq({
      method: 'POST',
      query: { resource: 'applications', action: 'approve' },
      body: { application_id: 'app-1' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.ok).toBe(true);
    expect(response.status).toBe('approved');
  });

  it('should reject a pending application with reason', async () => {
    mockAuth({
      user: { id: 'admin-1', email: 'admin@test.com' },
      profile: { role: 'admin', tier: 'vip' },
    });

    let fromCallCount = 0;
    supabase.from.mockImplementation(() => {
      fromCallCount++;
      const chain = {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
        maybeSingle: jest.fn(),
      };
      if (fromCallCount === 1) {
        // Fetch application
        chain.single.mockResolvedValue({
          data: { id: 'app-1', user_id: 'u-2', status: 'pending', applicant_email: 'u2@test.com' },
          error: null,
        });
      } else if (fromCallCount === 2) {
        // Reject application
        chain.maybeSingle.mockResolvedValue({
          data: { id: 'app-1', status: 'rejected' },
          error: null,
        });
      }
      return chain;
    });

    const req = createMockReq({
      method: 'POST',
      query: { resource: 'applications', action: 'reject' },
      body: { application_id: 'app-1', reason: 'Dati incompleti' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.ok).toBe(true);
    expect(response.status).toBe('rejected');
  });

  it('should revoke an approved application and remove partner role', async () => {
    mockAuth({
      user: { id: 'admin-1', email: 'admin@test.com' },
      profile: { role: 'admin', tier: 'vip' },
    });

    let fromCallCount = 0;
    supabase.from.mockImplementation(() => {
      fromCallCount++;
      const chain = {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
        maybeSingle: jest.fn(),
      };
      if (fromCallCount === 1) {
        // Fetch application
        chain.single.mockResolvedValue({
          data: { id: 'app-1', user_id: 'u-2', status: 'approved', applicant_email: 'u2@test.com' },
          error: null,
        });
      } else if (fromCallCount === 2) {
        // Revoke application
        chain.maybeSingle.mockResolvedValue({
          data: { id: 'app-1', status: 'revoked' },
          error: null,
        });
      } else if (fromCallCount === 3) {
        // Remove partner role: update().eq('user_id', ...).eq('role', 'partner')
        // Last .eq() in the chain resolves the promise
        let eqCount = 0;
        chain.eq.mockImplementation(() => {
          eqCount++;
          if (eqCount >= 2) return Promise.resolve({ error: null });
          return chain;
        });
      }
      return chain;
    });

    const req = createMockReq({
      method: 'POST',
      query: { resource: 'applications', action: 'revoke' },
      body: { application_id: 'app-1' },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const response = res.json.mock.calls[0][0];
    expect(response.ok).toBe(true);
    expect(response.status).toBe('revoked');
  });

  it('should submit a new partner application with VIES validation', async () => {
    mockAuth();

    // Mock VIES fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          isValid: true,
          name: 'RAI RADIOTELEVISIONE ITALIANA SPA',
          address: 'VIALE GIUSEPPE MAZZINI 14',
        }),
    });

    let fromCallCount = 0;
    supabase.from.mockImplementation(() => {
      fromCallCount++;
      const chain = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      if (fromCallCount === 1) {
        // Check existing application — none found
        chain.single.mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        });
      } else if (fromCallCount === 2) {
        // Insert new application
        chain.single.mockResolvedValue({
          data: {
            id: 'app-new',
            user_id: 'user-1',
            business_name: 'RAI SPA',
            vat_number: 'IT00743110157',
            vies_valid: true,
            vies_company_name: 'RAI RADIOTELEVISIONE ITALIANA SPA',
            vies_address: 'VIALE GIUSEPPE MAZZINI 14',
            city: 'Roma',
            province: 'RM',
            website: null,
            status: 'pending',
            rejection_reason: null,
            created_at: '2026-02-28T00:00:00Z',
            updated_at: '2026-02-28T00:00:00Z',
          },
          error: null,
        });
      }
      return chain;
    });

    const req = createMockReq({
      method: 'POST',
      query: { resource: 'apply' },
      body: {
        business_name: 'RAI SPA',
        vat_number: 'IT00743110157',
        city: 'Roma',
        province: 'RM',
      },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const response = res.json.mock.calls[0][0];
    expect(response.business_name).toBe('RAI SPA');
    expect(response.vies_valid).toBe(true);
    expect(response.status).toBe('pending');
    // Should NOT include admin-only fields
    expect(response.notes).toBeUndefined();
    expect(response.reviewed_by).toBeUndefined();
    expect(response.applicant_email).toBeUndefined();
  });
});
