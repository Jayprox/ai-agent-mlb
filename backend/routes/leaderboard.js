/**
 * GET  /api/leaderboard          — public ranked list (opt-in users only)
 * GET  /api/leaderboard/me       — auth required: caller's stats + opt-in status
 * POST /api/leaderboard/opt-in   — auth required: opt in (stores username from JWT)
 * POST /api/leaderboard/opt-out  — auth required: opt out (stays in table, opt_in=false)
 *
 * Architecture:
 * - leaderboard_settings table: user_id (PK), username, opt_in, updated_at
 * - No changes to picks or users tables
 * - pnl computed inline in SQL from result/result_hit + odds + units
 * - Handles both legacy grading (result='hit'/'miss') and new (result_hit boolean)
 * - Caches the public list for 5 minutes to reduce DB load
 */

const express       = require("express");
const router        = express.Router();
const requireAuth   = require("../middleware/auth");
const { query, isConnected } = require("../services/db");
const cache         = require("../services/cache");

const CACHE_TTL_MS     = 5 * 60 * 1000; // 5 min
const MIN_GRADED_PICKS = 10;             // minimum to appear on leaderboard

// ── Schema init ──────────────────────────────────────────────────────────────
let _schemaPromise = null;
async function ensureSchema() {
  if (!isConnected()) return;
  if (_schemaPromise) return _schemaPromise;
  _schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS leaderboard_settings (
        user_id    TEXT         PRIMARY KEY,
        username   TEXT         NOT NULL,
        opt_in     BOOLEAN      NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    // Index to speed up the public leaderboard query
    await query(`
      CREATE INDEX IF NOT EXISTS leaderboard_settings_opt_in_idx
        ON leaderboard_settings (opt_in)
        WHERE opt_in = TRUE
    `);
  })().catch((err) => {
    _schemaPromise = null;
    throw err;
  });
  return _schemaPromise;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The inline SQL expression for "did this pick hit?"
 * Handles both legacy text result and newer boolean result_hit.
 * Excludes special grade_status outcomes (ppd/scratch/push) from win/loss.
 */
const EFF_HIT_EXPR = `
  CASE
    WHEN grade_status IS NOT NULL THEN NULL  -- ppd/scratch/push: not a win or loss
    WHEN result = 'hit'  THEN TRUE
    WHEN result = 'miss' THEN FALSE
    ELSE result_hit   -- boolean from newer grading path
  END
`;

/**
 * Inline SQL P&L expression.
 * Mirrors the JS calcPnl() function in picks.js exactly:
 *   win  + no odds → +units
 *   win  + odds > 0 → units × (odds/100)
 *   win  + odds < 0 → units × (100/|odds|)
 *   loss            → -units
 */
const PNL_EXPR = `
  CASE
    WHEN (${EFF_HIT_EXPR}) IS NULL THEN NULL
    WHEN (${EFF_HIT_EXPR}) = TRUE AND (odds IS NULL OR odds = 0)
      THEN units
    WHEN (${EFF_HIT_EXPR}) = TRUE AND odds > 0
      THEN ROUND(units * (odds::numeric / 100), 2)
    WHEN (${EFF_HIT_EXPR}) = TRUE AND odds < 0
      THEN ROUND(units * (100::numeric / ABS(odds::numeric)), 2)
    WHEN (${EFF_HIT_EXPR}) = FALSE
      THEN -units
    ELSE NULL
  END
`;

// ── Build per-user aggregate stats ───────────────────────────────────────────
// Used by both the leaderboard query and the /me endpoint.
// Returns a subquery alias; caller wraps it.
function buildStatsSubquery() {
  return `
    SELECT
      p.user_id,
      -- graded picks: result is final and not a special status
      COUNT(*) FILTER (WHERE (${EFF_HIT_EXPR}) IS NOT NULL)      AS graded_picks,
      COUNT(*) FILTER (WHERE (${EFF_HIT_EXPR}) = TRUE)           AS hits,
      COUNT(*) FILTER (WHERE (${EFF_HIT_EXPR}) = FALSE)          AS misses,
      COUNT(*) FILTER (WHERE grade_status = 'push')               AS pushes,
      COUNT(*) FILTER (WHERE grade_status = 'ppd')                AS ppd_count,
      COUNT(*) FILTER (WHERE grade_status = 'scratch')            AS scratch_count,
      COUNT(*) FILTER (WHERE voided = FALSE)                      AS total_picks,
      -- win rate: hits / graded (NULL when no graded picks)
      CASE
        WHEN COUNT(*) FILTER (WHERE (${EFF_HIT_EXPR}) IS NOT NULL) = 0 THEN NULL
        ELSE ROUND(
          COUNT(*) FILTER (WHERE (${EFF_HIT_EXPR}) = TRUE)::numeric
          / COUNT(*) FILTER (WHERE (${EFF_HIT_EXPR}) IS NOT NULL)::numeric * 100,
          1
        )
      END AS win_rate_pct,
      -- total P&L summed across all settled picks
      COALESCE(
        ROUND(SUM(${PNL_EXPR})::numeric, 2),
        0
      ) AS total_pnl
    FROM picks p
    WHERE p.voided = FALSE
    GROUP BY p.user_id
  `;
}

// ── GET /api/leaderboard ─────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const sortBy  = req.query.sortBy === "pnl" ? "pnl" : "win_rate";
  const limit   = Math.min(Math.max(parseInt(req.query.limit  ?? "100", 10) || 100, 1), 500);
  const offset  = Math.max(parseInt(req.query.offset ?? "0",   10) || 0, 0);

  if (!isConnected()) {
    return res.json({
      leaderboard: [],
      totalUsers: 0,
      sortedBy: sortBy,
      minGradedPicks: MIN_GRADED_PICKS,
      unavailable: true,
    });
  }

  // 5-minute cache key includes sort + pagination
  const cacheKey = `leaderboard:${sortBy}:${limit}:${offset}`;
  const cached   = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    await ensureSchema();

    // Sort expression varies by sortBy
    const sortExpr = sortBy === "pnl"
      ? "stats.total_pnl DESC NULLS LAST, stats.win_rate_pct DESC NULLS LAST"
      : "stats.win_rate_pct DESC NULLS LAST, stats.graded_picks DESC, stats.total_pnl DESC NULLS LAST";

    const tiebreaker = "stats.graded_picks DESC, ls.updated_at ASC";

    const sql = `
      WITH stats AS (${buildStatsSubquery()})
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY ${sortExpr}, ${tiebreaker}
        )                              AS rank,
        ls.user_id,
        ls.username,
        stats.graded_picks,
        stats.hits,
        stats.misses,
        stats.pushes,
        stats.total_picks,
        stats.win_rate_pct,
        stats.total_pnl
      FROM leaderboard_settings ls
      JOIN stats ON stats.user_id = ls.user_id
      WHERE ls.opt_in = TRUE
        AND stats.graded_picks >= $1
      ORDER BY ${sortExpr}, ${tiebreaker}
      LIMIT $2 OFFSET $3
    `;

    // Total count (for pagination)
    const countSql = `
      WITH stats AS (${buildStatsSubquery()})
      SELECT COUNT(*) AS cnt
      FROM leaderboard_settings ls
      JOIN stats ON stats.user_id = ls.user_id
      WHERE ls.opt_in = TRUE
        AND stats.graded_picks >= $1
    `;

    const [rows, countRow] = await Promise.all([
      query(sql, [MIN_GRADED_PICKS, limit, offset]),
      query(countSql, [MIN_GRADED_PICKS]),
    ]);

    const leaderboard = (rows?.rows ?? []).map((row) => ({
      rank:        Number(row.rank),
      userId:      row.user_id,
      username:    row.username,
      winRate:     row.win_rate_pct != null ? Number(row.win_rate_pct) / 100 : null,
      winRatePct:  row.win_rate_pct != null ? `${row.win_rate_pct}%` : null,
      pnl:         row.total_pnl != null ? Number(row.total_pnl) : 0,
      gradedPicks: Number(row.graded_picks),
      hits:        Number(row.hits),
      misses:      Number(row.misses),
      pushes:      Number(row.pushes),
      totalPicks:  Number(row.total_picks),
    }));

    const payload = {
      leaderboard,
      totalUsers:     Number(countRow?.rows?.[0]?.cnt ?? 0),
      sortedBy:       sortBy,
      minGradedPicks: MIN_GRADED_PICKS,
    };

    cache.set(cacheKey, payload, CACHE_TTL_MS);
    res.setHeader("X-Cache", "MISS");
    return res.json(payload);

  } catch (err) {
    console.error(`  ✗ leaderboard GET failed: ${err.message}`);
    return res.status(500).json({ error: "Leaderboard unavailable", detail: err.message });
  }
});

// ── GET /api/leaderboard/me ──────────────────────────────────────────────────
// Returns the caller's own stats + opt-in status, regardless of ranking.
// Auth required so we know who "me" is.
router.get("/me", requireAuth, async (req, res) => {
  if (!isConnected()) {
    return res.json({ optIn: false, stats: null, rank: null });
  }

  try {
    await ensureSchema();

    // Get opt-in status
    const settingsRow = await query(
      "SELECT opt_in, username FROM leaderboard_settings WHERE user_id = $1",
      [req.userId]
    );
    const settings = settingsRow?.rows?.[0] ?? null;
    const optIn    = settings?.opt_in === true;

    // Get caller's own stats (always, even if not opted in)
    const statsResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE (${EFF_HIT_EXPR}) IS NOT NULL)  AS graded_picks,
        COUNT(*) FILTER (WHERE (${EFF_HIT_EXPR}) = TRUE)       AS hits,
        COUNT(*) FILTER (WHERE (${EFF_HIT_EXPR}) = FALSE)      AS misses,
        COUNT(*) FILTER (WHERE grade_status = 'push')           AS pushes,
        COUNT(*) FILTER (WHERE voided = FALSE)                  AS total_picks,
        CASE
          WHEN COUNT(*) FILTER (WHERE (${EFF_HIT_EXPR}) IS NOT NULL) = 0 THEN NULL
          ELSE ROUND(
            COUNT(*) FILTER (WHERE (${EFF_HIT_EXPR}) = TRUE)::numeric
            / COUNT(*) FILTER (WHERE (${EFF_HIT_EXPR}) IS NOT NULL)::numeric * 100,
            1
          )
        END AS win_rate_pct,
        COALESCE(ROUND(SUM(${PNL_EXPR})::numeric, 2), 0) AS total_pnl
       FROM picks
       WHERE user_id = $1 AND voided = FALSE`,
      [req.userId]
    );

    const s = statsResult?.rows?.[0] ?? null;
    const myStats = s ? {
      gradedPicks: Number(s.graded_picks),
      hits:        Number(s.hits),
      misses:      Number(s.misses),
      pushes:      Number(s.pushes),
      totalPicks:  Number(s.total_picks),
      winRate:     s.win_rate_pct != null ? Number(s.win_rate_pct) / 100 : null,
      winRatePct:  s.win_rate_pct != null ? `${s.win_rate_pct}%` : null,
      pnl:         s.total_pnl != null ? Number(s.total_pnl) : 0,
    } : null;

    // Compute caller's rank if opted in and meets threshold
    let myRank = null;
    if (optIn && myStats && myStats.gradedPicks >= MIN_GRADED_PICKS) {
      const rankResult = await query(
        `WITH stats AS (${buildStatsSubquery()})
         SELECT COUNT(*) + 1 AS my_rank
         FROM leaderboard_settings ls
         JOIN stats ON stats.user_id = ls.user_id
         WHERE ls.opt_in = TRUE
           AND stats.graded_picks >= $1
           AND stats.win_rate_pct > (
             SELECT win_rate_pct FROM (${buildStatsSubquery()}) s WHERE s.user_id = $2
           )`,
        [MIN_GRADED_PICKS, req.userId]
      );
      myRank = Number(rankResult?.rows?.[0]?.my_rank ?? 1);
    }

    return res.json({
      optIn,
      username:       settings?.username ?? req.username ?? null,
      meetsThreshold: (myStats?.gradedPicks ?? 0) >= MIN_GRADED_PICKS,
      minGradedPicks: MIN_GRADED_PICKS,
      stats:          myStats,
      rank:           myRank,
    });

  } catch (err) {
    console.error(`  ✗ leaderboard /me failed: ${err.message}`);
    return res.status(500).json({ error: "Leaderboard unavailable", detail: err.message });
  }
});

// ── POST /api/leaderboard/opt-in ─────────────────────────────────────────────
router.post("/opt-in", requireAuth, async (req, res) => {
  // Validate input before touching the DB
  const displayName = String(req.body?.username ?? req.username ?? "").trim();
  if (!displayName) {
    return res.status(400).json({ error: "username is required" });
  }
  if (displayName.length > 32) {
    return res.status(400).json({ error: "username must be 32 characters or fewer" });
  }

  if (!isConnected()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  try {
    await ensureSchema();

    // Check username isn't taken by another user
    const taken = await query(
      "SELECT user_id FROM leaderboard_settings WHERE LOWER(username) = LOWER($1) AND user_id != $2",
      [displayName, req.userId]
    );
    if (taken?.rows?.length > 0) {
      return res.status(409).json({ error: "username_taken", message: "That username is already on the leaderboard. Choose another." });
    }

    await query(
      `INSERT INTO leaderboard_settings (user_id, username, opt_in, updated_at)
       VALUES ($1, $2, TRUE, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET opt_in = TRUE, username = $2, updated_at = NOW()`,
      [req.userId, displayName]
    );

    // Bust cache so the new entry appears immediately
    cache.clear(`leaderboard:win_rate:100:0`);
    cache.clear(`leaderboard:pnl:100:0`);

    console.log(`  ✓ leaderboard opt-in: userId=${req.userId} username=${displayName}`);
    return res.json({ ok: true, optIn: true, username: displayName });

  } catch (err) {
    console.error(`  ✗ leaderboard opt-in failed: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/leaderboard/opt-out ────────────────────────────────────────────
router.post("/opt-out", requireAuth, async (req, res) => {
  if (!isConnected()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  try {
    await ensureSchema();

    await query(
      `UPDATE leaderboard_settings
       SET opt_in = FALSE, updated_at = NOW()
       WHERE user_id = $1`,
      [req.userId]
    );

    // Bust cache
    cache.clear(`leaderboard:win_rate:100:0`);
    cache.clear(`leaderboard:pnl:100:0`);

    console.log(`  ✓ leaderboard opt-out: userId=${req.userId}`);
    return res.json({ ok: true, optIn: false });

  } catch (err) {
    console.error(`  ✗ leaderboard opt-out failed: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
