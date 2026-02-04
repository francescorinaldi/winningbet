/**
 * Cache in-memory con TTL per le serverless functions.
 *
 * Usa una Map globale che sopravvive tra invocazioni "warm"
 * della stessa istanza Vercel. Viene azzerata ad ogni cold start.
 *
 * Strategia:
 *   - Ogni entry ha un timestamp di scadenza (expiresAt)
 *   - Le entry scadute vengono eliminate al primo accesso (lazy cleanup)
 *   - Non c'e' limite di dimensione (il numero di chiavi e' fisso e ridotto)
 *
 * Chiavi utilizzate nel progetto:
 *   - "matches"      → /api/matches   (TTL: 2h)
 *   - "results"      → /api/results   (TTL: 1h)
 *   - "odds_{id}"    → /api/odds      (TTL: 30min, una entry per fixture)
 *   - "standings"    → /api/standings  (TTL: 6h)
 */
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
