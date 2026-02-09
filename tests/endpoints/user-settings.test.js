const handler = require('../../api/user-settings');
const { createMockReq, createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../api/_lib/auth-middleware', () => ({
  authenticate: jest.fn(),
}));

const { authenticate } = require('../../api/_lib/auth-middleware');
const { supabase } = require('../../api/_lib/supabase');

function mockChain(result) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    then: jest.fn((r) => r(result)),
  };
  supabase.from.mockReturnValue(chain);
  return chain;
}

describe('GET /api/user-settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      profile: { tier: 'free' },
      error: null,
    });
  });

  test('Not authenticated returns 401', async () => {
    authenticate.mockResolvedValueOnce({
      user: null,
      profile: null,
      error: 'Unauthorized',
    });

    const req = createMockReq({ method: 'GET', query: { resource: 'activity' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  test('Missing resource returns 400', async () => {
    const req = createMockReq({ method: 'GET', query: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Parametro resource richiesto: activity, notifications o preferences',
    });
  });
});

describe('GET /api/user-settings?resource=activity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      error: null,
    });
  });

  test('Returns profile activity data', async () => {
    const mockProfile = {
      current_streak: 5,
      longest_streak: 10,
      last_visit_date: '2026-02-07',
      total_visits: 42,
    };
    mockChain({ data: mockProfile, error: null });

    const req = createMockReq({ method: 'GET', query: { resource: 'activity' } });
    const res = createMockRes();

    await handler(req, res);

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockProfile);
  });

  test('Method not GET or POST returns 405', async () => {
    const req = createMockReq({ method: 'DELETE', query: { resource: 'activity' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });
});

describe('POST /api/user-settings?resource=activity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      error: null,
    });
  });

  test('Same day visit returns is_new_day: false', async () => {
    const today = new Date().toISOString().split('T')[0];
    const mockProfile = {
      current_streak: 5,
      longest_streak: 10,
      last_visit_date: today,
      total_visits: 42,
    };

    const chain = mockChain({ data: mockProfile, error: null });
    chain.single.mockResolvedValueOnce({ data: mockProfile, error: null });

    const req = createMockReq({ method: 'POST', query: { resource: 'activity' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      current_streak: 5,
      longest_streak: 10,
      total_visits: 42,
      last_visit_date: today,
      is_new_day: false,
    });
  });

  test('New day visit updates streak', async () => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const mockProfile = {
      current_streak: 4,
      longest_streak: 10,
      last_visit_date: yesterday,
      total_visits: 41,
    };

    const chain = mockChain({ error: null });
    chain.single
      .mockResolvedValueOnce({ data: mockProfile, error: null })
      .mockResolvedValueOnce({ error: null });
    chain.update.mockReturnThis();

    const req = createMockReq({ method: 'POST', query: { resource: 'activity' } });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.update).toHaveBeenCalledWith({
      current_streak: 5,
      longest_streak: 10,
      last_visit_date: today,
      total_visits: 42,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      current_streak: 5,
      longest_streak: 10,
      total_visits: 42,
      last_visit_date: today,
      is_new_day: true,
    });
  });

  test('Consecutive day increments streak', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const mockProfile = {
      current_streak: 3,
      longest_streak: 5,
      last_visit_date: yesterday,
      total_visits: 20,
    };

    const chain = mockChain({ error: null });
    chain.single
      .mockResolvedValueOnce({ data: mockProfile, error: null })
      .mockResolvedValueOnce({ error: null });

    const req = createMockReq({ method: 'POST', query: { resource: 'activity' } });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        current_streak: 4,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('Gap > 1 day resets streak to 1', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
    const mockProfile = {
      current_streak: 10,
      longest_streak: 15,
      last_visit_date: threeDaysAgo,
      total_visits: 50,
    };

    const chain = mockChain({ error: null });
    chain.single
      .mockResolvedValueOnce({ data: mockProfile, error: null })
      .mockResolvedValueOnce({ error: null });

    const req = createMockReq({ method: 'POST', query: { resource: 'activity' } });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        current_streak: 1,
        longest_streak: 15,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('GET /api/user-settings?resource=notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      error: null,
    });
  });

  test('Returns notifications with unread_count', async () => {
    const mockNotifications = [
      { id: 1, user_id: 'u1', message: 'Test 1', read: false },
      { id: 2, user_id: 'u1', message: 'Test 2', read: true },
    ];

    const chain = mockChain({ data: mockNotifications, error: null });
    chain.limit.mockResolvedValueOnce({ data: mockNotifications, error: null });

    // Mock count query
    supabase.from.mockReturnValueOnce(chain).mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn((resolve) =>
        resolve({
          count: 1,
          error: null,
        }),
      ),
    });

    const req = createMockReq({ method: 'GET', query: { resource: 'notifications' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      notifications: mockNotifications,
      unread_count: 1,
    });
  });

  test('unread=true filter applies', async () => {
    const eqSpy = jest.fn().mockReturnThis();
    const orderSpy = jest.fn().mockReturnThis();
    const limitSpy = jest.fn().mockReturnThis();

    const mockNotifChain = {
      select: jest.fn().mockReturnThis(),
      eq: eqSpy,
      order: orderSpy,
      limit: limitSpy,
    };
    // Make the chain thenable so `await query` resolves the data
    Object.defineProperty(mockNotifChain, 'then', {
      value: (resolve) => resolve({ data: [], error: null }),
      enumerable: false,
    });

    const mockCountChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    Object.defineProperty(mockCountChain, 'then', {
      value: (resolve) => resolve({ count: 0, error: null }),
      enumerable: false,
    });

    supabase.from
      .mockReturnValueOnce(mockNotifChain)
      .mockReturnValueOnce(mockCountChain);

    const req = createMockReq({
      method: 'GET',
      query: { resource: 'notifications', unread: 'true' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(eqSpy).toHaveBeenCalledWith('user_id', 'u1');
    expect(eqSpy).toHaveBeenCalledWith('read', false);
    expect(orderSpy).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limitSpy).toHaveBeenCalledWith(20);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('Method not GET or PUT returns 405', async () => {
    const req = createMockReq({ method: 'POST', query: { resource: 'notifications' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });
});

describe('PUT /api/user-settings?resource=notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      error: null,
    });
  });

  test('markAll updates all unread to read', async () => {
    const eqSpy = jest.fn().mockReturnThis();
    const mockUpdateChain = {
      update: jest.fn().mockReturnThis(),
      eq: eqSpy,
    };
    // Make the chain thenable so `await` resolves to { error: null }
    Object.defineProperty(mockUpdateChain, 'then', {
      value: (resolve) => resolve({ error: null }),
      enumerable: false,
    });

    supabase.from.mockReturnValue(mockUpdateChain);

    const req = createMockReq({
      method: 'PUT',
      query: { resource: 'notifications' },
      body: { markAll: true },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(mockUpdateChain.update).toHaveBeenCalledWith({ read: true });
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'u1');
    expect(eqSpy).toHaveBeenCalledWith('read', false);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('Single id marks one as read', async () => {
    const chain = mockChain({ error: null });

    const req = createMockReq({
      method: 'PUT',
      query: { resource: 'notifications' },
      body: { id: 123 },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.update).toHaveBeenCalledWith({ read: true });
    expect(chain.eq).toHaveBeenCalledWith('id', 123);
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  test('Missing id and markAll returns 400', async () => {
    const req = createMockReq({
      method: 'PUT',
      query: { resource: 'notifications' },
      body: {},
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Specificare id o markAll' });
  });
});

describe('GET /api/user-settings?resource=preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      error: null,
    });
  });

  test('Returns preferences', async () => {
    const mockPrefs = {
      user_id: 'u1',
      preferred_league: 'serie-a',
      risk_tolerance: 'equilibrato',
      weekly_budget: 100,
    };
    mockChain({ data: mockPrefs, error: null });

    const req = createMockReq({ method: 'GET', query: { resource: 'preferences' } });
    const res = createMockRes();

    await handler(req, res);

    expect(supabase.from).toHaveBeenCalledWith('user_preferences');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockPrefs);
  });

  test('No preferences (PGRST116) auto-creates default', async () => {
    const chain = mockChain({ data: null, error: { code: 'PGRST116' } });
    chain.single
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
      .mockResolvedValueOnce({
        data: { user_id: 'u1', preferred_league: 'serie-a' },
        error: null,
      });

    const req = createMockReq({ method: 'GET', query: { resource: 'preferences' } });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.insert).toHaveBeenCalledWith({ user_id: 'u1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ user_id: 'u1', preferred_league: 'serie-a' });
  });

  test('Method not GET or PUT returns 405', async () => {
    const req = createMockReq({ method: 'DELETE', query: { resource: 'preferences' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });
});

describe('PUT /api/user-settings?resource=preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue({
      user: { id: 'u1' },
      error: null,
    });
  });

  test('Validates preferred_league', async () => {
    const chain = mockChain({ data: { preferred_league: 'serie-a' }, error: null });

    const req = createMockReq({
      method: 'PUT',
      query: { resource: 'preferences' },
      body: { preferred_league: 'serie-a' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        preferred_league: 'serie-a',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('Invalid preferred_league returns 400', async () => {
    const req = createMockReq({
      method: 'PUT',
      query: { resource: 'preferences' },
      body: { preferred_league: 'invalid-league' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Lega non valida' });
  });

  test('Invalid risk_tolerance returns 400', async () => {
    const req = createMockReq({
      method: 'PUT',
      query: { resource: 'preferences' },
      body: { risk_tolerance: 'invalid' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'risk_tolerance non valido. Valori: prudente, equilibrato, aggressivo',
    });
  });

  test('weekly_budget range check (5-10000)', async () => {
    mockChain({ data: {}, error: null });

    // Test lower bound (valid)
    let req = createMockReq({
      method: 'PUT',
      query: { resource: 'preferences' },
      body: { weekly_budget: 5 },
    });
    let res = createMockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);

    jest.clearAllMocks();
    mockChain({ data: {}, error: null });

    // Test upper bound (valid)
    req = createMockReq({
      method: 'PUT',
      query: { resource: 'preferences' },
      body: { weekly_budget: 10000 },
    });
    res = createMockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);

    jest.clearAllMocks();

    // Test below lower bound (invalid)
    req = createMockReq({
      method: 'PUT',
      query: { resource: 'preferences' },
      body: { weekly_budget: 4 },
    });
    res = createMockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'weekly_budget deve essere tra 5 e 10000 EUR',
    });

    jest.clearAllMocks();

    // Test above upper bound (invalid)
    req = createMockReq({
      method: 'PUT',
      query: { resource: 'preferences' },
      body: { weekly_budget: 10001 },
    });
    res = createMockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'weekly_budget deve essere tra 5 e 10000 EUR',
    });
  });

  test('favorite_teams must be array, max 20', async () => {
    // Not an array
    let req = createMockReq({
      method: 'PUT',
      query: { resource: 'preferences' },
      body: { favorite_teams: 'not-an-array' },
    });
    let res = createMockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'favorite_teams deve essere un array',
    });

    jest.clearAllMocks();

    // Too many teams
    req = createMockReq({
      method: 'PUT',
      query: { resource: 'preferences' },
      body: { favorite_teams: new Array(21).fill('Team') },
    });
    res = createMockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Massimo 20 squadre preferite',
    });

    jest.clearAllMocks();
    mockChain({ data: {}, error: null });

    // Valid array
    req = createMockReq({
      method: 'PUT',
      query: { resource: 'preferences' },
      body: { favorite_teams: ['Inter', 'Milan'] },
    });
    res = createMockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
