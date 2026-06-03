const express = require("express");
const crypto = require("crypto");
const Anthropic = require("@anthropic-ai/sdk");
const cache = require("../services/cache");
const db = require("../services/db");

const router = express.Router();
const AI_BOARD_TTL = 4 * 60 * 60 * 1000; // 4h
const MODEL = "claude-haiku-4-5-20251001";

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function safeJsonParse(text) {
  const raw = String(text ?? "").trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(raw);
}

function fallbackScore(candidate) {
  const algo = candidate.score ?? 50;
  const sim = candidate.simConfidence ?? 50;
  return Math.round(algo * 0.6 + sim * 0.4);
}

// GET /api/ai-board/edges
// Returns the pre-scored daily snapshot written by dailyAiSnapshot.js.
// Falls back gracefully if the snapshot hasn't run yet today.
router.get("/edges", async (req, res) => {
  const date = req.query.date ?? todayHonolulu();

  // In-memory cache: 5 min TTL — snapshot only updates once or twice a day
  const cacheKey = `ai-board-edges:${date}`;
  const hit = cache.get(cacheKey);
  if (hit) {
    res.setHeader("X-Cache", "HIT");
    return res.json(hit);
  }

  if (!db.isConnected()) {
    return res.json({ edges: [], generatedAt: null, fallback: true });
  }

  try {
    const result = await db.query(
      `SELECT edges, generated_at FROM ai_board_edges WHERE slate_date = $1 LIMIT 1`,
      [date]
    );

    const row = result?.rows?.[0];
    if (!row) {
      return res.json({ edges: [], generatedAt: null, fallback: true });
    }

    const payload = {
      edges: Array.isArray(row.edges) ? row.edges : [],
      generatedAt: row.generated_at,
      slateDate: date,
    };

    cache.set(cacheKey, payload, 5 * 60 * 1000); // 5 min
    res.setHeader("X-Cache", "MISS");
    return res.json(payload);
  } catch (err) {
    console.warn(`  ⚠ ai-board/edges DB read failed: ${err.message}`);
    return res.status(502).json({ error: "DB unavailable", detail: err.message });
  }
});

router.post("/score", async (req, res) => {
  const inputCandidates = Array.isArray(req.body?.candidates) ? req.body.candidates.slice(0, 32) : [];
  if (!inputCandidates.length) return res.status(400).json({ error: "candidates[] required" });

  const scores = {};
  const uncached = [];

  inputCandidates.forEach((c) => {
    if (!c?.id) return;
    const hash = crypto.createHash("md5").update(JSON.stringify({
      id: c.id, market: c.market, score: c.score, simConfidence: c.simConfidence,
      bookLine: c.bookLine, stats: c.stats,
    })).digest("hex");
    const cacheKey = `ai-board:${hash}`;
    const cached = cache.get(cacheKey);
    if (cached) { scores[c.id] = cached; return; }
    uncached.push({ ...c, _cacheKey: cacheKey });
  });

  if (!uncached.length) return res.json({ scores });

  if (!process.env.ANTHROPIC_API_KEY) {
    uncached.forEach((c) => { scores[c.id] = { aiScore: fallbackScore(c), aiReason: null }; });
    return res.json({ scores, fallback: true });
  }

  try {
    const client = getAnthropic();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2500,
      temperature: 0.15,
      system:
        "You score MLB prop betting candidates on a 0–100 scale. " +
        "Use only the supplied stats. Do not invent numbers or players. " +
        "Score meaning: 75–100 = strong edge, 55–74 = moderate lean, 40–54 = neutral, below 40 = weak. " +
        "Weight inputs: algorithmic score (35%), simulation confidence (35%), stat quality (30%). " +
        "Write one factual reason sentence per candidate, 12–22 words, no hype or emojis. " +
        "Always lead with the player or pitcher name. Use market-specific angles: " +
        "k = K/9 or L3 avg Ks + opposing lineup K% + umpire or park edge; " +
        "outs = avg IP + WHIP or control angle; " +
        "hits = batter avg/form + opposing pitcher ERA or handedness split; " +
        "hr = SLG or HR pace + park/wind angle; " +
        "f5ml = SP ERA comparison + park or weather edge. " +
        "Return strict JSON only: {\"scores\":[{\"id\":\"...\",\"aiScore\":75,\"aiReason\":\"...\"}]}",
      messages: [{
        role: "user",
        content: JSON.stringify({
          candidates: uncached.map((c) => ({
            id: c.id,
            market: c.market,
            playerName: c.playerName,
            team: c.team,
            gameLabel: c.gameLabel,
            score: c.score,
            simConfidence: c.simConfidence,
            bookLine: c.bookLine,
            stats: c.stats,
          })),
        }),
      }],
    });

    const text = message.content?.find((p) => p.type === "text")?.text ?? "";
    const parsed = safeJsonParse(text);
    const byId = new Map(
      Array.isArray(parsed?.scores)
        ? parsed.scores.map((s) => [s?.id, { aiScore: Math.round(Number(s?.aiScore ?? 50)), aiReason: String(s?.aiReason ?? "").trim() }])
        : []
    );

    uncached.forEach((c) => {
      const result = byId.get(c.id) ?? { aiScore: fallbackScore(c), aiReason: null };
      scores[c.id] = result;
      cache.set(c._cacheKey, result, AI_BOARD_TTL);
    });

    return res.json({ scores });
  } catch (err) {
    console.warn(`  ⚠ ai-board scoring failed: ${err.message}`);
    uncached.forEach((c) => { scores[c.id] = { aiScore: fallbackScore(c), aiReason: null }; });
    return res.json({ scores, fallback: true });
  }
});

module.exports = router;
