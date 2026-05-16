const express = require("express");
const { query, isConnected } = require("../services/db");

const router = express.Router();

function normalizeLean(lean) {
  if (lean == null) return null;
  const s = String(lean).trim().toUpperCase();
  if (s === "OVER") return "over";
  if (s === "UNDER") return "under";
  const lo = String(lean).trim().toLowerCase();
  if (lo === "over" || lo === "under") return lo;
  return null;
}

// POST /api/board-snapshot
// Body: { slateDate: "YYYY-MM-DD", cards: [...] }
// Idempotent — ON CONFLICT DO NOTHING so re-locks never overwrite.
router.post("/", async (req, res) => {
  const { slateDate, cards } = req.body ?? {};
  if (!slateDate || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: "slateDate and cards[] required" });
  }
  if (!isConnected()) {
    return res.json({ ok: true, inserted: 0, skipped: cards.length, reason: "db_unavailable" });
  }

  let inserted = 0;
  let skipped = 0;

  for (const card of cards) {
    const cardId = card?.id != null ? String(card.id) : "";
    const market = card?.market != null ? String(card.market) : "";
    if (!cardId || !market) {
      skipped++;
      continue;
    }

    const gamePk = card.gamePk ?? null;
    const lean = normalizeLean(card.lean);
    const score = card.score ?? null;
    const scoreTier = card.scoreTier ?? null;
    const rawLine = card.bookLine ?? card.propLine?.books?.DK?.line ?? card.propLine?.line ?? card.suggestedLine;
    const bookLine = rawLine != null && rawLine !== "" && Number.isFinite(Number(rawLine)) ? Number(rawLine) : null;
    const aiSummary = card.aiSummary ?? null;
    const cardData = card;

    try {
      const result = await query(
        `INSERT INTO board_card_snapshots
           (slate_date, game_pk, card_id, market, lean, score, score_tier,
            book_line, ai_summary, card_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (slate_date, card_id, market) DO NOTHING`,
        [
          slateDate,
          gamePk,
          cardId,
          market,
          lean,
          score,
          scoreTier,
          bookLine,
          aiSummary,
          cardData,
        ]
      );
      if (result && result.rowCount > 0) inserted++;
      else skipped++;
    } catch (err) {
      console.warn(`  ⚠ board-snapshot insert skipped: ${err.message}`);
      skipped++;
    }
  }

  console.log(`  ✓ board-snapshot: inserted=${inserted} skipped=${skipped} date=${slateDate}`);
  return res.json({ ok: true, inserted, skipped });
});

// GET /api/board-snapshot/:date
// Returns all snapshots for a slate date, grouped by market.
router.get("/:date", async (req, res) => {
  const { date } = req.params;
  if (!isConnected()) {
    return res.json({ hits: [], hr: [], k: [], outs: [] });
  }

  try {
    const result = await query(
      `SELECT id, game_pk, card_id, market, lean, score, score_tier,
              book_line, ai_summary, card_data, locked_at,
              result_hit, actual_stat, resolved_at
       FROM board_card_snapshots
       WHERE slate_date = $1
       ORDER BY score DESC NULLS LAST`,
      [date]
    );

    const grouped = { hits: [], hr: [], k: [], outs: [] };
    for (const row of result.rows ?? []) {
      const market = row.market;
      if (!grouped[market]) continue;
      grouped[market].push({
        ...(row.card_data ?? {}),
        id: row.card_id,
        market: row.market,
        gamePk: row.game_pk,
        lean: row.lean,
        score: row.score,
        scoreTier: row.score_tier,
        bookLine: row.book_line,
        aiSummary: row.ai_summary,
        lockedAt: row.locked_at,
        resultHit: row.result_hit,
        actualStat: row.actual_stat,
        resolvedAt: row.resolved_at,
      });
    }

    return res.json(grouped);
  } catch (err) {
    console.warn(`  ⚠ board-snapshot GET failed: ${err.message}`);
    return res.json({ hits: [], hr: [], k: [], outs: [] });
  }
});

module.exports = router;
