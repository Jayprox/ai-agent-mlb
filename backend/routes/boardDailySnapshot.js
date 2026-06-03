const express = require("express");
const cache = require("../services/cache");
const db = require("../services/db");

const router = express.Router();

const BOARD_MARKETS = ["k", "outs", "hits", "hr", "nrfi", "total", "spread", "ml", "f5ml", "f5spread"];
const SNAPSHOT_TTL = 5 * 60 * 1000;

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

// GET /api/board/snapshot?date=YYYY-MM-DD
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

    if (!result?.rows?.length) {
      return res.json({ empty: true, reason: "no_snapshot" });
    }

    const payload = {
      date,
      generatedAt: result.rows[0]?.generated_at ?? null,
    };
    for (const row of result.rows) {
      if (BOARD_MARKETS.includes(row.market)) {
        payload[row.market] = Array.isArray(row.candidates) ? row.candidates : [];
      }
    }

    cache.set(cacheKey, payload, SNAPSHOT_TTL);
    res.setHeader("X-Cache", "MISS");
    return res.json(payload);
  } catch (err) {
    console.warn(`  ⚠ board daily snapshot GET failed: ${err.message}`);
    return res.status(502).json({ error: "DB unavailable", detail: err.message });
  }
});

module.exports = router;
