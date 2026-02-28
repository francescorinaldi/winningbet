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
});
