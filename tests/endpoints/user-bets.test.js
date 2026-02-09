const handler = require('../../api/user-bets');
const { createMockReq, createMockRes } = require('../__helpers__/mock-req-res');

jest.mock('../../api/_lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../api/_lib/auth-middleware', () => ({
  authenticate: jest.fn(),
}));

const { supabase } = require('../../api/_lib/supabase');
const { authenticate } = require('../../api/_lib/auth-middleware');

function mockChain(result) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
    then: jest.fn((r) => r(result)),
  };
  supabase.from.mockReturnValue(chain);
  return chain;
}

describe('CRUD /api/user-bets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authenticate.mockResolvedValue({ user: { id: 'u1' }, error: null });
  });

  it('should return 405 for unsupported methods (PATCH)', async () => {
    const req = createMockReq({ method: 'PATCH' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('should return 401 when not authenticated', async () => {
    authenticate.mockResolvedValueOnce({
      user: null,
      error: 'Unauthorized',
    });

    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should list all bets for GET request', async () => {
    const mockBets = [
      { id: '1', tip_id: 'tip_1', stake: 10, user_id: 'u1' },
      { id: '2', tip_id: 'tip_2', stake: 20, user_id: 'u1' },
    ];

    mockChain({ data: mockBets, error: null });

    const req = createMockReq({ method: 'GET', query: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(supabase.from).toHaveBeenCalledWith('user_bets');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockBets);
  });

  it('should return single bet for GET with tipId', async () => {
    const mockBet = { id: '1', tip_id: 'tip_1', stake: 10, user_id: 'u1' };

    const chain = mockChain({ data: mockBet, error: null });

    const req = createMockReq({ method: 'GET', query: { tipId: 'tip_1' } });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.eq).toHaveBeenCalledWith('tip_id', 'tip_1');
    expect(chain.single).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockBet);
  });

  it('should return 404 when single bet not found (PGRST116)', async () => {
    mockChain({ data: null, error: { code: 'PGRST116' } });

    const req = createMockReq({ method: 'GET', query: { tipId: 'tip_999' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
  });

  it('should create bet with tip_id for POST', async () => {
    const newBet = {
      id: '3',
      tip_id: 'tip_3',
      stake: 50,
      user_id: 'u1',
    };

    const chain = mockChain({ data: newBet, error: null });

    const req = createMockReq({
      method: 'POST',
      body: { tip_id: 'tip_3', stake: 50, notes: 'Test bet' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'u1',
      tip_id: 'tip_3',
      followed: true,
      stake: 50,
      notes: 'Test bet',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(newBet);
  });

  it('should return 400 for POST without tip_id', async () => {
    const req = createMockReq({
      method: 'POST',
      body: { stake: 50 },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'tip_id richiesto',
    });
  });

  it('should return 409 for duplicate POST (23505)', async () => {
    mockChain({ data: null, error: { code: '23505' } });

    const req = createMockReq({
      method: 'POST',
      body: { tip_id: 'tip_1', stake: 10 },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Tip già seguito',
    });
  });

  it('should update stake/notes for PUT', async () => {
    const updatedBet = {
      id: '1',
      tip_id: 'tip_1',
      stake: 100,
      notes: 'Updated',
      user_id: 'u1',
    };

    const chain = mockChain({ data: updatedBet, error: null });

    const req = createMockReq({
      method: 'PUT',
      body: { tip_id: 'tip_1', stake: 100, notes: 'Updated' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        stake: 100,
        notes: 'Updated',
        updated_at: expect.any(String),
      }),
    );
    expect(chain.eq).toHaveBeenCalledWith('tip_id', 'tip_1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updatedBet);
  });

  it('should return 400 for PUT without tip_id', async () => {
    const req = createMockReq({
      method: 'PUT',
      body: { stake: 100 },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'tip_id richiesto',
    });
  });

  it('should delete bet for DELETE', async () => {
    const chain = mockChain({ data: null, error: null });

    const req = createMockReq({
      method: 'DELETE',
      query: { tipId: 'tip_1' },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('tip_id', 'tip_1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('should return 400 for DELETE without tipId', async () => {
    const req = createMockReq({
      method: 'DELETE',
      query: {},
    });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'tipId query parameter richiesto',
    });
  });

  it('should return 500 for database errors', async () => {
    mockChain({ data: null, error: { message: 'Database error' } });

    const req = createMockReq({ method: 'GET', query: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Database error',
    });
  });
});
