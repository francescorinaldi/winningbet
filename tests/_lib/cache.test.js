/**
 * Test suite for api/_lib/cache.js
 *
 * Tests in-memory cache with TTL functionality.
 */

const { get, set } = require('../../api/_lib/cache');

describe('cache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('get returns null for unknown key', () => {
    expect(get('unknown-key')).toBeNull();
  });

  test('set and get returns the value', () => {
    set('test-key', { data: 'test-value' }, 60);
    expect(get('test-key')).toEqual({ data: 'test-value' });
  });

  test('get returns null after TTL expires', () => {
    set('expiring-key', 'value', 60); // 60 seconds TTL
    expect(get('expiring-key')).toBe('value');

    // Advance time by 61 seconds
    jest.advanceTimersByTime(61 * 1000);

    expect(get('expiring-key')).toBeNull();
  });

  test('get returns value before TTL expires', () => {
    set('valid-key', 'value', 120); // 120 seconds TTL

    // Advance time by 60 seconds (less than TTL)
    jest.advanceTimersByTime(60 * 1000);

    expect(get('valid-key')).toBe('value');
  });

  test('set overwrites existing value', () => {
    set('key', 'first-value', 60);
    expect(get('key')).toBe('first-value');

    set('key', 'second-value', 60);
    expect(get('key')).toBe('second-value');
  });

  test('set with TTL of 0 expires immediately', () => {
    set('zero-ttl-key', 'value', 0);

    // Advance time by 1ms to trigger expiration
    jest.advanceTimersByTime(1);

    expect(get('zero-ttl-key')).toBeNull();
  });

  test('multiple keys can coexist', () => {
    set('key1', 'value1', 60);
    set('key2', 'value2', 120);
    set('key3', 'value3', 180);

    expect(get('key1')).toBe('value1');
    expect(get('key2')).toBe('value2');
    expect(get('key3')).toBe('value3');

    // Expire only key1
    jest.advanceTimersByTime(61 * 1000);

    expect(get('key1')).toBeNull();
    expect(get('key2')).toBe('value2');
    expect(get('key3')).toBe('value3');
  });

  test('expired entry gets deleted from store', () => {
    set('cleanup-key', 'value', 30);
    expect(get('cleanup-key')).toBe('value');

    // Advance time past expiration
    jest.advanceTimersByTime(31 * 1000);

    // First get should delete the entry
    expect(get('cleanup-key')).toBeNull();

    // Second get should still return null (entry was deleted, not just ignored)
    expect(get('cleanup-key')).toBeNull();
  });
});
