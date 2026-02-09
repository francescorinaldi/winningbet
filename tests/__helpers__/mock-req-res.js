/**
 * Mock helpers for Vercel serverless request/response objects.
 */

function createMockReq(options = {}) {
  return {
    method: options.method || 'GET',
    headers: options.headers || {},
    query: options.query || {},
    body: options.body || {},
    url: options.url || '/',
    ...options,
  };
}

function createMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
  return res;
}

module.exports = { createMockReq, createMockRes };
