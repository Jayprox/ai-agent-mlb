// Simple in-memory TTL cache.
// Keyed by string. Data expires after ttlMs milliseconds.
// Fine for a single-process local server — swap for Redis if you go multi-instance.

const store = {};

module.exports = {
  /** Return cached value, or undefined if missing / expired.
   *  Returns null only when null was explicitly cached (e.g. a failed search). */
  get(key) {
    const entry = store[key];
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      delete store[key];
      return undefined;
    }
    return entry.data;
  },

  /** Store value with a TTL in milliseconds. */
  set(key, data, ttlMs) {
    store[key] = { data, expiresAt: Date.now() + ttlMs };
  },

  /** Delete one key, or clear everything if no key given. */
  clear(key) {
    if (key) {
      delete store[key];
    } else {
      Object.keys(store).forEach((k) => delete store[k]);
    }
  },

  /** Return all current keys and their remaining TTLs (for /health debug). */
  stats() {
    const now = Date.now();
    return Object.entries(store).map(([k, v]) => ({
      key: k,
      expiresIn: Math.max(0, Math.round((v.expiresAt - now) / 1000)) + "s",
    }));
  },
};
