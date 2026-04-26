// cache.js — in-memory TTL cache with optional Redis write-through persistence.
// All public methods remain synchronous so no call sites need to change.
// Redis (if configured) seeds the in-memory store on startup and receives
// background writes on every set() so data survives server restarts.

const store = {};
let redis = null;

const PREFIX = "propscout:";

function redisKey(key) { return PREFIX + key; }

// Lazy Redis connect — only if REDIS_URL is set
function getRedis() {
  if (redis) return redis;
  if (!process.env.REDIS_URL) return null;
  try {
    const Redis = require("ioredis");
    redis = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
    redis.on("error", () => {}); // suppress unhandled error events
    return redis;
  } catch { return null; }
}

module.exports = {
  /** Seed in-memory store from Redis. Call once on server startup. */
  async init() {
    const r = getRedis();
    if (!r) return;
    try {
      await r.connect().catch(() => {});
      const keys = await r.keys(PREFIX + "*");
      for (const rk of keys) {
        const raw = await r.get(rk);
        const ttl = await r.pttl(rk); // remaining TTL in ms
        if (!raw || ttl <= 0) continue;
        try {
          const parsed = JSON.parse(raw);
          const localKey = rk.slice(PREFIX.length);
          store[localKey] = { data: parsed, expiresAt: Date.now() + ttl };
        } catch {}
      }
    } catch {}
  },

  get(key) {
    const entry = store[key];
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      delete store[key];
      const r = getRedis();
      if (r) r.del(redisKey(key)).catch(() => {});
      return undefined;
    }
    return entry.data;
  },

  set(key, data, ttlMs) {
    store[key] = { data, expiresAt: Date.now() + ttlMs };
    const r = getRedis();
    if (r) {
      try {
        r.set(redisKey(key), JSON.stringify(data), "PX", ttlMs).catch(() => {});
      } catch {}
    }
  },

  clear(key) {
    const r = getRedis();
    if (key) {
      delete store[key];
      if (r) r.del(redisKey(key)).catch(() => {});
    } else {
      Object.keys(store).forEach(k => delete store[k]);
      if (r) r.keys(PREFIX + "*").then(keys => keys.length && r.del(...keys)).catch(() => {});
    }
  },

  stats() {
    const now = Date.now();
    return Object.entries(store).map(([k, v]) => ({
      key: k,
      expiresIn: Math.max(0, Math.round((v.expiresAt - now) / 1000)) + "s",
    }));
  },
};
