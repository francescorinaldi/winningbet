/**
 * Test suite for api/_lib/auth-middleware.js
 *
 * Tests authenticate(), hasAccess(), and verifyCronSecret() functions.
 */

const { authenticate, hasAccess, verifyCronSecret } = require('../../api/_lib/auth-middleware');

// Mock Supabase
jest.mock('../../api/_lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

const { supabase } = require('../../api/_lib/supabase');

describe('authenticate', () => {
  let mockSingle;
  let mockEq;
  let mockSelect;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup chainable mock for supabase.from().select().eq().single()
    mockSingle = jest.fn();
    mockEq = jest.fn().mockReturnValue({ single: mockSingle });
    mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    supabase.from.mockReturnValue({ select: mockSelect });
  });

  test('returns error for missing Authorization header', async () => {
    const req = { headers: {} };
    const result = await authenticate(req);

    expect(result).toEqual({
      user: null,
      profile: null,
      error: 'Token di autenticazione mancante',
    });
  });

  test('returns error for Authorization header without Bearer prefix', async () => {
    const req = { headers: { authorization: 'InvalidToken123' } };
    const result = await authenticate(req);

    expect(result).toEqual({
      user: null,
      profile: null,
      error: 'Token di autenticazione mancante',
    });
  });

  test('returns error when supabase.auth.getUser returns error', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    });

    const req = { headers: { authorization: 'Bearer invalid-token' } };
    const result = await authenticate(req);

    expect(result).toEqual({
      user: null,
      profile: null,
      error: 'Token non valido o scaduto',
    });
  });

  test('returns error when supabase.auth.getUser returns no user', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const req = { headers: { authorization: 'Bearer valid-token' } };
    const result = await authenticate(req);

    expect(result).toEqual({
      user: null,
      profile: null,
      error: 'Token non valido o scaduto',
    });
  });

  test('returns user with null profile when profile fetch fails', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    supabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Profile not found' },
    });

    const req = { headers: { authorization: 'Bearer valid-token' } };
    const result = await authenticate(req);

    expect(result).toEqual({
      user: mockUser,
      profile: null,
      error: null,
    });
  });

  test('returns user and profile when authentication succeeds', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockProfile = {
      id: 'profile-123',
      display_name: 'Test User',
      tier: 'pro',
      stripe_customer_id: 'cus_123',
    };

    supabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    mockSingle.mockResolvedValue({
      data: mockProfile,
      error: null,
    });

    const req = { headers: { authorization: 'Bearer valid-token' } };
    const result = await authenticate(req);

    expect(result).toEqual({
      user: mockUser,
      profile: mockProfile,
      error: null,
    });

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(mockSelect).toHaveBeenCalledWith('id, display_name, tier, stripe_customer_id');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-123');
  });

  test('calls getUser with extracted token', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid' },
    });

    const req = { headers: { authorization: 'Bearer my-jwt-token' } };
    await authenticate(req);

    expect(supabase.auth.getUser).toHaveBeenCalledWith('my-jwt-token');
  });

  test('handles empty bearer token', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Empty token' },
    });

    const req = { headers: { authorization: 'Bearer ' } };
    await authenticate(req);

    expect(supabase.auth.getUser).toHaveBeenCalledWith('');
  });
});

describe('hasAccess', () => {
  test('free tier can access free content', () => {
    expect(hasAccess('free', 'free')).toBe(true);
  });

  test('free tier cannot access pro content', () => {
    expect(hasAccess('free', 'pro')).toBe(false);
  });

  test('free tier cannot access vip content', () => {
    expect(hasAccess('free', 'vip')).toBe(false);
  });

  test('pro tier can access free content', () => {
    expect(hasAccess('pro', 'free')).toBe(true);
  });

  test('pro tier can access pro content', () => {
    expect(hasAccess('pro', 'pro')).toBe(true);
  });

  test('pro tier cannot access vip content', () => {
    expect(hasAccess('pro', 'vip')).toBe(false);
  });

  test('vip tier can access free content', () => {
    expect(hasAccess('vip', 'free')).toBe(true);
  });

  test('vip tier can access pro content', () => {
    expect(hasAccess('vip', 'pro')).toBe(true);
  });

  test('vip tier can access vip content', () => {
    expect(hasAccess('vip', 'vip')).toBe(true);
  });

  test('unknown user tier treated as level 0 - cannot access pro', () => {
    expect(hasAccess('unknown', 'pro')).toBe(false);
  });

  test('unknown user tier treated as level 0 - cannot access vip', () => {
    expect(hasAccess('unknown', 'vip')).toBe(false);
  });

  test('unknown user tier treated as level 0 - can access free', () => {
    expect(hasAccess('unknown', 'free')).toBe(true);
  });
});

describe('verifyCronSecret', () => {
  // CRON_SECRET is set to 'test-cron-secret' in setup.js before module load

  test('returns error when Authorization header is missing', () => {
    const req = { headers: {} };
    const result = verifyCronSecret(req);

    expect(result).toEqual({
      authorized: false,
      error: 'Unauthorized',
    });
  });

  test('returns error when Authorization header does not start with Bearer', () => {
    const req = { headers: { authorization: 'Basic test-cron-secret' } };
    const result = verifyCronSecret(req);

    expect(result).toEqual({
      authorized: false,
      error: 'Unauthorized',
    });
  });

  test('returns error for wrong secret (different length)', () => {
    const req = { headers: { authorization: 'Bearer wrong' } };
    const result = verifyCronSecret(req);

    expect(result).toEqual({
      authorized: false,
      error: 'Unauthorized',
    });
  });

  test('returns error for wrong secret (same length)', () => {
    const req = { headers: { authorization: 'Bearer test-cron-WRONG!' } };
    const result = verifyCronSecret(req);

    expect(result).toEqual({
      authorized: false,
      error: 'Unauthorized',
    });
  });

  test('returns success for correct secret', () => {
    const req = { headers: { authorization: 'Bearer test-cron-secret' } };
    const result = verifyCronSecret(req);

    expect(result).toEqual({
      authorized: true,
      error: null,
    });
  });
});
