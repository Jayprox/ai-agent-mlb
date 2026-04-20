const express   = require("express");
const router    = express.Router();
const Anthropic = require("@anthropic-ai/sdk");
const cache     = require("../services/cache");

const TRENDS_TTL = 2 * 60 * 60 * 1000; // 2 hours

// Lazy-init client so missing key doesn't crash the server on startup
let _client = null;
const getClient = () => {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
};

const SYSTEM_PROMPT = `You are a sharp MLB sports bettor's research assistant. Given structured pre-game data, write a concise 2–3 sentence bettor-focused trend summary. Be specific with numbers. Mention the most actionable angles: pitcher matchup edge, bullpen fatigue, weather impact, umpire tendency, park factor, or NRFI lean — whichever are most relevant. Write in confident, direct prose. No bullet points. No hedging phrases like "it's worth noting" or "keep in mind". Do not start with the teams' names.`;

// ── POST /api/trends/:gamePk ──────────────────────────────────
// Body: { context: string }  — pre-formatted game summary string
// Returns: { summary: string, gamePk: number }
router.post("/:gamePk", async (req, res) => {
  const { gamePk } = req.params;
  const cacheKey   = `trends:${gamePk}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  const { context } = req.body;
  if (!context || typeof context !== "string") {
    return res.status(400).json({ error: "context string required in request body" });
  }

  try {
    const client  = getClient();
    const message = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: context }],
    });

    const summary = message.content?.[0]?.text?.trim() ?? null;
    if (!summary) return res.status(502).json({ error: "Empty response from AI" });

    const result = { summary, gamePk: parseInt(gamePk, 10) };
    cache.set(cacheKey, result, TRENDS_TTL);
    res.setHeader("X-Cache", "MISS");
    console.log(`  ✓ Trends generated  gamePk=${gamePk}  chars=${summary.length}`);
    return res.json(result);
  } catch (err) {
    console.error(`  ✗ Trends failed  gamePk=${gamePk}: ${err.message}`);
    return res.status(502).json({ error: "AI unavailable", detail: err.message });
  }
});

module.exports = router;
