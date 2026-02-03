// In-memory cache that survives between warm Vercel invocations
const store = new Map();

/**
 * Get a cached value if it exists and hasn't expired.
 * @param {string} key
 * @returns {*|null}
 */
function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Set a value in cache with a TTL in seconds.
 * @param {string} key
 * @param {*} value
 * @param {number} ttlSeconds
 */
function set(key, value, ttlSeconds) {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

module.exports = { get, set };
