const express = require("express");
const cache = require("../services/cache");
const db = require("../services/db");
const { buildSchedulePayloadForJob } = require("./schedule");
const { gatherLiveBoardData, computeMarketCandidates } = require("../services/liveBoardData");
const { BOARD_MARKETS, saveBoardSnapshot } = require("../services/boardSnapshotDb");

const router = express.Router();

const SNAPSHOT_TTL = 5 * 60 * 1000;
const FALLBACK_BUDGET_MS = 9000;
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

const _inFlight = new Map();
const _emptyMarketAt = new Map();

async function getLiveData(date, activeSlate) {
  if (_inFlight.has(date)) return _inFlight.get(date);
  const promise = gatherLiveBoardData(activeSlate)
    .catch((err) => {
      console.warn(`  ⚠ board/snapshot: gatherLiveBoardData failed: ${err.message}`);
      return null;
    })
    .finally(() => _inFlight.delete(date));
  _inFlight.set(date, promise);
  return promise;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve("__timeout__"), ms)),
  ]);
}

async function fillMissingMarkets(date, payload) {
  const missing = BOARD_MARKETS.filter((market) => !(market in payload));
  if (!missing.length) return;

  const isToday = date === todayHonolulu();
  if (!isToday) {
    for (const market of missing) payload[market] = [];
    return;
  }

  const stillMissing = [];
  for (const market of missing) {
    const negKey = `${date}:${market}`;
    const negAt = _emptyMarketAt.get(negKey);
    if (negAt && Date.now() - negAt < NEGATIVE_CACHE_TTL_MS) {
      payload[market] = [];
    } else {
      stillMissing.push(market);
    }
  }
  if (!stillMissing.length) return;

  let activeSlate;
  try {
    const schedule = await buildSchedulePayloadForJob(date);
    activeSlate = schedule.filter((game) =>
      ["Scheduled", "Pre-Game", "Warmup", "In Progress"].includes(game.status)
    );
  } catch (err) {
    console.warn(`  ⚠ board/snapshot: schedule fetch failed: ${err.message}`);
    activeSlate = [];
  }

  if (!activeSlate.length) {
    for (const market of stillMissing) payload[market] = [];
    return;
  }

  const liveData = await withTimeout(getLiveData(date, activeSlate), FALLBACK_BUDGET_MS);
  if (liveData === "__timeout__" || !liveData) {
    for (const market of stillMissing) payload[market] = [];
    return;
  }

  await Promise.allSettled(stillMissing.map(async (market) => {
    let candidates = [];
    try {
      candidates = await computeMarketCandidates(market, activeSlate, liveData);
    } catch (err) {
      console.warn(`  ⚠ board/snapshot: on-demand compute failed for ${market}: ${err.message}`);
    }
    payload[market] = candidates;
    if (!candidates.length) {
      _emptyMarketAt.set(`${date}:${market}`, Date.now());
    } else {
      _emptyMarketAt.delete(`${date}:${market}`);
    }
    await saveBoardSnapshot(date, market, candidates);
  }));
}

router.get("/snapshot", async (req, res) => {
  const date = req.query.date ?? todayHonolulu();
  const cacheKey = `board-daily-snapshot:${date}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  if (!db.isConnected()) {
    return res.json({ empty: true, reason: "db_unavailable" });
  }

  try {
    const result = await db.query(
      `SELECT market, candidates, generated_at
       FROM board_daily_snapshots
       WHERE slate_date = $1`,
      [date]
    );

    const payload = {
      date,
      generatedAt: result?.rows?.[0]?.generated_at ?? null,
    };
    for (const row of result?.rows ?? []) {
      if (BOARD_MARKETS.includes(row.market)) {
        payload[row.market] = Array.isArray(row.candidates) ? row.candidates : [];
      }
    }

    const hadAnyRows = (result?.rows?.length ?? 0) > 0;
    let usedFallback = false;
    if (BOARD_MARKETS.some((market) => !(market in payload))) {
      usedFallback = true;
      await fillMissingMarkets(date, payload);
    }

    if (!hadAnyRows && !Object.keys(payload).some((key) => BOARD_MARKETS.includes(key) && payload[key]?.length)) {
      if (!payload.generatedAt && BOARD_MARKETS.every((market) => (payload[market] ?? []).length === 0)) {
        return res.json({ empty: true, reason: "no_snapshot", date });
      }
    }

    if (payload.generatedAt == null) payload.generatedAt = new Date().toISOString();

    if (!usedFallback) {
      cache.set(cacheKey, payload, SNAPSHOT_TTL);
    }
    res.setHeader("X-Cache", usedFallback ? "FALLBACK" : "MISS");
    return res.json(payload);
  } catch (err) {
    console.warn(`  ⚠ board daily snapshot GET failed: ${err.message}`);
    return res.status(502).json({ error: "DB unavailable", detail: err.message });
  }
});

module.exports = router;
