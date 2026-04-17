const express = require("express");
const fs = require("fs");
const path = require("path");
const cache = require("../services/cache");
const requireAuth = require("../middleware/auth");

const router = express.Router();

const DATA_DIR = path.join(__dirname, "..", "data");
const PICKS_FILE = path.join(DATA_DIR, "picks.json");
const DIGEST_TTL_MS = 5 * 60 * 1000;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TYPE_BUCKETS = ["K", "Hits", "TB", "HR", "F5", "NRFI", "Other"];

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PICKS_FILE)) {
    fs.writeFileSync(PICKS_FILE, JSON.stringify({ picks: [] }, null, 2));
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(PICKS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.picks) ? parsed : { picks: [] };
  } catch (_err) {
    return { picks: [] };
  }
}

function emptyByType() {
  return TYPE_BUCKETS.reduce((acc, key) => {
    acc[key] = { total: 0, hits: 0 };
    return acc;
  }, {});
}

function normalizePropType(propType) {
  return TYPE_BUCKETS.includes(propType) && propType !== "Other" ? propType : "Other";
}

function summarizePick(pick) {
  return {
    label: pick.label ?? "",
    lean: pick.lean ?? "",
    confidence: Number(pick.confidence) || 0,
    homeTeam: pick.homeTeam ?? "",
    awayTeam: pick.awayTeam ?? "",
  };
}

function emptyDigest() {
  return {
    period: "Last 7 days",
    total: 0,
    hits: 0,
    misses: 0,
    pct: 0,
    bestHit: null,
    worstMiss: null,
    byType: emptyByType(),
  };
}

function computeDigest(picks, userId) {
  const digest = emptyDigest();
  const cutoff = Date.now() - WINDOW_MS;

  const graded = picks.filter((pick) => {
    if (pick?.userId !== userId) return false;
    if (pick?.result !== "hit" && pick?.result !== "miss") return false;
    const ts = Date.parse(pick?.timestamp || "");
    return !Number.isNaN(ts) && ts >= cutoff;
  });

  for (const pick of graded) {
    const confidence = Number(pick.confidence) || 0;
    const bucket = normalizePropType(pick.propType);

    digest.total += 1;
    digest.byType[bucket].total += 1;

    if (pick.result === "hit") {
      digest.hits += 1;
      digest.byType[bucket].hits += 1;
      if (!digest.bestHit || confidence > digest.bestHit.confidence) {
        digest.bestHit = summarizePick(pick);
      }
    }

    if (pick.result === "miss") {
      digest.misses += 1;
      if (!digest.worstMiss || confidence > digest.worstMiss.confidence) {
        digest.worstMiss = summarizePick(pick);
      }
    }
  }

  digest.pct = digest.total > 0 ? Math.round((digest.hits / digest.total) * 1000) / 10 : 0;
  return digest;
}

router.use(requireAuth);

router.get("/", (req, res) => {
  const cacheKey = `digest:7d:${req.userId}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  const store = readStore();
  const digest = computeDigest(store.picks, req.userId);
  cache.set(cacheKey, digest, DIGEST_TTL_MS);
  res.setHeader("X-Cache", "MISS");
  return res.json(digest);
});

router.post("/refresh", (req, res) => {
  cache.clear(`digest:7d:${req.userId}`);
  return res.json({ ok: true });
});

module.exports = router;
