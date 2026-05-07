const express = require("express");
const crypto = require("crypto");
const Anthropic = require("@anthropic-ai/sdk");
const cache = require("../services/cache");

const router = express.Router();
const AI_BOARD_TTL = 4 * 60 * 60 * 1000; // 4h
const MODEL = "claude-haiku-4-5-20251001";

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
      max_tokens: 1200,
      temperature: 0.15,
      system:
        "You score MLB prop betting candidates on a 0–100 scale. " +
        "Use only the supplied stats. Do not invent numbers or players. " +
        "Score meaning: 75–100 = strong edge, 55–74 = moderate lean, 40–54 = neutral, below 40 = weak. " +
        "Weight inputs: algorithmic score (35%), simulation confidence (35%), stat quality (30%). " +
        "Write one factual reason sentence per candidate, 10–20 words, no hype or emojis. " +
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
