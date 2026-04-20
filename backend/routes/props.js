const express   = require("express");
const router    = express.Router();
const Anthropic = require("@anthropic-ai/sdk");
const axios     = require("axios");
const cache     = require("../services/cache");

const PROPS_TTL  = 45 * 60 * 1000; // 45 minutes
const SEARCH_TTL = 20 * 60 * 1000; // 20 minutes — news is more time-sensitive than game data

// Lazy-init Anthropic client so missing key doesn't crash on startup
let _client = null;
const getClient = () => {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
};

// ── Tavily web search ──────────────────────────────────────────────────────
// Returns the AI-generated answer summary for a query, or null if unavailable.
// Results are cached to avoid burning quota on repeat hits.
const tavilySearch = async (query) => {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null; // key not configured — skip silently

  const cacheKey = `tavily:${Buffer.from(query).toString("base64").slice(0, 40)}`;
  const cached   = cache.get(cacheKey);
  if (cached !== undefined) return cached; // null is a valid cached result

  try {
    const res = await axios.post(
      "https://api.tavily.com/search",
      {
        api_key:        apiKey,
        query,
        search_depth:   "basic",
        max_results:    3,
        include_answer: true,   // ask Tavily to summarise — cleaner than raw snippets
      },
      { timeout: 8000 }
    );
    const answer = res.data.answer ?? null;
    console.log(`  ✓ Tavily search  "${query.slice(0, 60)}…"  answer=${!!answer}`);
    cache.set(cacheKey, answer, SEARCH_TTL);
    return answer;
  } catch (err) {
    console.log(`  · Tavily skipped  "${query.slice(0, 50)}": ${err.message}`);
    cache.set(cacheKey, null, SEARCH_TTL); // cache null so we don't retry immediately
    return null;
  }
};

// Parse a pitcher name out of the context string.
// Context line format: "Away SP: Shane Bieber (RHP) — ERA …"
const extractSPName = (context, side) => {
  const m = context.match(new RegExp(`${side} SP: ([^(]+)\\s*\\(`));
  return m?.[1]?.trim() ?? null;
};

// ── System prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a sharp MLB sports bettor's prop analyst. Given structured pre-game data, return a JSON array of prop recommendations.

Rules:
- Return ONLY a valid JSON array — no markdown, no explanation, no code fences, no wrapper text
- Include 3–5 props maximum
- Only include a prop if confidence is genuinely ≥ 55. Omit entirely rather than guess.
- Reason from the specific numbers provided: K/9, WHIP, ERA, umpire K rate, park factor, bullpen grade, first-inning scoring %, market lines, etc.
- If real-time news is provided, treat it as the most current information available. An injured or scratched starter, bullpen arm, or key lineup bat should meaningfully shift your confidence.
- One-sentence reason per prop — cite specific numbers, no hedging phrases

Prop types to consider (in priority order):
1. Starting pitcher K O/U — based on K/9, umpire zone, weather, park K factor, lineup profile, any market K line provided
2. Game total O/U — based on both SP quality, weather, park HR/hit factor, bullpen grades
3. NRFI/YRFI — based on first-inning scoring % (provided directly), SP clean-start tendency
4. F5 total — based on SP ERA/WHIP comparison, early-inning tendencies
5. Run line lean — only if one side has a clear SP + bullpen edge

Each prop object must have exactly these six fields:
{
  "label": "Cole K's O/U 7.5",
  "propType": "K",
  "confidence": 65,
  "lean": "OVER",
  "positive": true,
  "reason": "Cole's 11.2 K/9 meets a lineup with confirmed high whiff rates and Pat Hoberg's wide zone (23.4% K rate) in a dome."
}

Field rules:
- propType: "K" | "Total" | "NRFI" | "F5" | "Outs" | "RL"
- lean: "OVER" | "UNDER" | "NRFI" | "YRFI" | "OVER F5" | "UNDER F5" | "AWAY -1.5" | "HOME -1.5"
- positive: OVER→true, UNDER→false, NRFI→true, YRFI→false, OVER F5→true, UNDER F5→false, AWAY -1.5→true, HOME -1.5→true
- confidence: integer 55–80 only (never below 55 — omit the prop instead)
- reason: exactly one sentence, cite at least two specific numbers`;

// ── POST /api/props/:gamePk ───────────────────────────────────────────────
// Body: { context: string }  — pre-formatted game summary string
// Returns: { props: [...], gamePk: number, searchUsed: boolean }
router.post("/:gamePk", async (req, res) => {
  const { gamePk } = req.params;
  const cacheKey   = `props:${gamePk}`;

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
    // ── Step 1: Web search for real-time news (runs in parallel) ──────────
    const awaySP = extractSPName(context, "Away");
    const homeSP = extractSPName(context, "Home");
    const yr     = new Date().getFullYear();

    // Game abbrs — first line is "Game: ATL @ PHI at Citizens Bank Park"
    const gameMatch = context.match(/^Game:\s*(\S+)\s*@\s*(\S+)/m);
    const awayAbbr  = gameMatch?.[1] ?? "";
    const homeAbbr  = gameMatch?.[2] ?? "";

    const queries = [
      awaySP ? `${awaySP} injury status MLB ${yr}` : null,
      homeSP ? `${homeSP} injury status MLB ${yr}` : null,
      awayAbbr && homeAbbr
        ? `${awayAbbr} ${homeAbbr} lineup scratch injury news today MLB`
        : null,
    ].filter(Boolean);

    const searchResults = await Promise.all(queries.map(tavilySearch));
    const newsItems     = searchResults.filter(Boolean);
    const searchUsed    = newsItems.length > 0;

    // ── Step 2: Build enriched context ───────────────────────────────────
    let enrichedContext = context;
    if (searchUsed) {
      enrichedContext +=
        `\n\nReal-time news (factor into confidence if relevant):\n` +
        newsItems.map((s, i) => `${i + 1}. ${s}`).join("\n");
      console.log(`  ✓ Tavily enriched context  gamePk=${gamePk}  snippets=${newsItems.length}`);
    } else {
      console.log(`  · Tavily unavailable or no key — proceeding without web search  gamePk=${gamePk}`);
    }

    // ── Step 3: AI prop generation ────────────────────────────────────────
    const client  = getClient();
    const message = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: enrichedContext }],
    });

    const raw = message.content?.[0]?.text?.trim() ?? "";
    if (!raw) return res.status(502).json({ error: "Empty response from AI" });

    // Extract JSON array — handle possible stray markdown fences
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error(`  ✗ Props: no JSON array found. Raw: ${raw.slice(0, 200)}`);
      return res.status(502).json({ error: "No JSON array in response" });
    }

    let props;
    try {
      props = JSON.parse(match[0]);
    } catch (parseErr) {
      console.error(`  ✗ Props: JSON parse failed  gamePk=${gamePk}: ${parseErr.message}`);
      return res.status(502).json({ error: "JSON parse error", detail: parseErr.message });
    }

    if (!Array.isArray(props)) {
      return res.status(502).json({ error: "Response was not a JSON array" });
    }

    // Validate and filter — drop any with missing required fields
    const valid = props.filter(p =>
      p.label && p.propType && typeof p.confidence === "number" &&
      p.lean && typeof p.positive === "boolean" && p.reason
    );

    const result = { props: valid, gamePk: parseInt(gamePk, 10), searchUsed };
    cache.set(cacheKey, result, PROPS_TTL);
    res.setHeader("X-Cache", "MISS");
    console.log(`  ✓ AI Props generated  gamePk=${gamePk}  count=${valid.length}  search=${searchUsed}`);
    return res.json(result);

  } catch (err) {
    console.error(`  ✗ AI Props failed  gamePk=${gamePk}: ${err.message}`);
    return res.status(502).json({ error: "AI unavailable", detail: err.message });
  }
});

module.exports = router;
