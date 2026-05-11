# CODEX TASK 117 — AI Chat with Full Board Data Context (Parlay Builder + Market Picks)

## Goal

Wire the Chat feature into the already-computed, already-scored AI Board candidates so the assistant can answer questions like:

- "Give me the best 3-leg prop parlay from Hits and K"
- "Best K props tonight"
- "Act like a professional sports bettor — what are your top plays today?"
- "Which outs props do you like?"

Currently `/api/chat` only has access to raw schedule and pitcher season stats. It has zero visibility into the ranked, AI-scored candidate lists that already exist in `aiBoardData`. The fix is simple: pass those candidates in the POST body and update the backend to use them.

**Files changed:** `prop-scout-v7.jsx`, `backend/routes/chat.js`

---

## Part 1 — Frontend: `prop-scout-v7.jsx`

### 1a — Update QUICK_CHIPS to include board-specific prompts

Search for:
```js
  const QUICK_CHIPS = [
    "Best plays today",
    "Top K props",
    "Biggest line moves",
    "NRFI leans",
    "Any injury alerts?",
  ];
```

Replace with:
```js
  const QUICK_CHIPS = [
    "Build me a 3-leg parlay",
    "Best K props tonight",
    "Best hits props tonight",
    "Top plays across all markets",
    "Any injury alerts?",
  ];
```

### 1b — Update `handleChatSend` to include board candidates in the POST body

Search for:
```js
    try {
      const data = await apiMutate("/api/chat", "POST", { message, history: historyPayload.slice(0, -1) });
```

Replace with:
```js
    // Build board context from AI Board data — top 6 per market, ranked by aiScore
    const boardCandidates = (() => {
      const source = aiBoardData ?? [];
      if (!source.length) return [];
      const markets = ["k", "outs", "hits", "hr", "f5ml"];
      return markets.flatMap(mkt =>
        source
          .filter(c => c.market === mkt)
          .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))
          .slice(0, 6)
          .map(c => ({
            market:    c.market,
            name:      c.name ?? c.playerName ?? null,
            team:      c.team ?? null,
            gameLabel: c.gameLabel ?? null,
            gamePk:    c.gamePk ?? null,
            aiScore:   c.aiScore ?? null,
            aiReason:  c.aiReason ?? null,
            bookLine:  c.bookLine ?? null,
            lean:      c.lean ?? null,
            stats:     c.stats ?? {},
          }))
      );
    })();

    try {
      const data = await apiMutate("/api/chat", "POST", {
        message,
        history: historyPayload.slice(0, -1),
        boardCandidates: boardCandidates.length ? boardCandidates : undefined,
      });
```

---

## Part 2 — Backend: `backend/routes/chat.js`

### 2a — Add board-specific keyword sets near the top (after existing WEB_KEYWORDS / SLATE_KEYWORDS)

Search for:
```js
const WEB_KEYWORDS = ["news", "injury", "il ", " il,", "hurt", "scratch", "lineup change", "trade", "recent", "latest", "update", "report"];
const SLATE_KEYWORDS = ["best play", "best prop", "top pick", "today", "slate", "recommend", "suggest", "should i", "what do you like", "who do you like"];
```

Replace with:
```js
const WEB_KEYWORDS    = ["news", "injury", "il ", " il,", "hurt", "scratch", "lineup change", "trade", "recent", "latest", "update", "report"];
const SLATE_KEYWORDS  = ["best play", "best prop", "top pick", "today", "slate", "recommend", "suggest", "should i", "what do you like", "who do you like"];
const PARLAY_KEYWORDS = ["parlay", "parlay", "multi-leg", "3-leg", "2-leg", "3 leg", "2 leg", "multi leg", "combine", "combo", "build me", "put together"];
const BOARD_KEYWORDS  = ["board", "ai board", "k prop", "ks prop", "strikeout prop", "outs prop", "hits prop", "hit prop", "hr prop", "home run prop", "best k", "best hits", "best outs", "best hr", "pitcher prop", "batter prop", "top plays", "top picks", "best plays", "best picks"];
const K_KEYWORDS      = ["k prop", "strikeout", "pitcher k", "k tab", "ks tab", "best k", "k props"];
const HITS_KEYWORDS   = ["hits prop", "hit prop", "hits tab", "best hits", "batter hit"];
const OUTS_KEYWORDS   = ["outs prop", "outs tab", "best outs", "innings prop", "ip prop"];
const HR_KEYWORDS     = ["hr prop", "home run prop", "hr tab", "best hr", "homer prop"];
```

### 2b — Parse `boardCandidates` from the request body

In the route handler, after reading `message` and `history`, add:

Search for:
```js
  const userId = req.user?.id ?? req.user?.username ?? "unknown";
  if (getUsage(userId) >= DAILY_LIMIT) {
```

Replace with:
```js
  const boardCandidates = Array.isArray(body.boardCandidates) ? body.boardCandidates.slice(0, 40) : [];

  const userId = req.user?.id ?? req.user?.username ?? "unknown";
  if (getUsage(userId) >= DAILY_LIMIT) {
```

### 2c — Add keyword detection flags for board and parlay queries

Search for:
```js
  const lower = message.toLowerCase();
  const needsWebSearch = WEB_KEYWORDS.some((kw) => lower.includes(kw));
  const isSlateQuestion = SLATE_KEYWORDS.some((kw) => lower.includes(kw));
```

Replace with:
```js
  const lower = message.toLowerCase();
  const needsWebSearch  = WEB_KEYWORDS.some((kw) => lower.includes(kw));
  const isSlateQuestion = SLATE_KEYWORDS.some((kw) => lower.includes(kw));
  const isBoardQuestion = boardCandidates.length > 0 && BOARD_KEYWORDS.some((kw) => lower.includes(kw));
  const isParlayRequest = boardCandidates.length > 0 && PARLAY_KEYWORDS.some((kw) => lower.includes(kw));
  const wantsKOnly     = K_KEYWORDS.some((kw) => lower.includes(kw));
  const wantsHitsOnly  = HITS_KEYWORDS.some((kw) => lower.includes(kw));
  const wantsOutsOnly  = OUTS_KEYWORDS.some((kw) => lower.includes(kw));
  const wantsHROnly    = HR_KEYWORDS.some((kw) => lower.includes(kw));
```

### 2d — Add a helper function to format board candidates as context text

Add this function before the route handler (near the other helpers):

```js
function formatBoardContext(candidates, { parlayMode = false, marketFilter = null } = {}) {
  if (!candidates.length) return "";

  const filtered = marketFilter
    ? candidates.filter(c => c.market === marketFilter)
    : candidates;

  if (!filtered.length) return "";

  const MARKET_LABELS = { k: "K PROPS", outs: "OUTS PROPS", hits: "HITS PROPS", hr: "HR PROPS", f5ml: "F5 ML" };

  const byMarket = {};
  filtered.forEach(c => {
    if (!byMarket[c.market]) byMarket[c.market] = [];
    byMarket[c.market].push(c);
  });

  const sections = Object.entries(byMarket).map(([mkt, cards]) => {
    const label = MARKET_LABELS[mkt] ?? mkt.toUpperCase();
    const rows = cards.map((c, i) => {
      const lineStr = c.bookLine != null ? `O${c.bookLine}` : "no line posted";
      const reasonStr = c.aiReason ? ` — ${c.aiReason}` : "";
      return `  ${i + 1}. ${c.name ?? "TBD"} (${c.team ?? "?"}) | ${c.gameLabel ?? "?"} | AI Score ${c.aiScore ?? "?"} | Line: ${lineStr}${reasonStr}`;
    });
    return `${label}:\n${rows.join("\n")}`;
  });

  const header = parlayMode
    ? "PROP SCOUT AI BOARD — CANDIDATES FOR PARLAY CONSTRUCTION:"
    : "PROP SCOUT AI BOARD — TODAY'S RANKED CANDIDATES:";

  return `${header}\n\n${sections.join("\n\n")}`;
}
```

### 2e — Inject board context into `contextParts` before the web search block

Find the section where `contextParts` is built (after `baseContext` is set). Add the board context injection after the existing prop pool section and before the web search block.

Search for:
```js
  let webContext = "";
  if (needsWebSearch) {
```

Replace with:
```js
  // Inject board candidates context when the question is board/parlay related
  if (boardCandidates.length > 0 && (isBoardQuestion || isParlayRequest || isSlateQuestion)) {
    const marketFilter = wantsKOnly ? "k" : wantsHitsOnly ? "hits" : wantsOutsOnly ? "outs" : wantsHROnly ? "hr" : null;
    const boardText = formatBoardContext(boardCandidates, { parlayMode: isParlayRequest, marketFilter });
    if (boardText) contextParts.push(boardText);
  }

  let webContext = "";
  if (needsWebSearch) {
```

### 2f — Update the system prompt to handle board and parlay queries

Search for:
```js
  const systemPrompt = `You are a sharp MLB prop research analyst with access to today's Prop Scout data — pitcher stats, sportsbook lines, umpire tendencies, weather, park factors, lineup data, and injury reports.

When answering prop or game-specific questions:
- Cite specific numbers that support your analysis
- Return a confidence score (0–100) and explain the key signals driving it
- Be direct and actionable — don't hedge unless the data is genuinely mixed
- Keep responses focused and concise

When answering general, conceptual, or conversational questions:
- Answer directly without a confidence score

Confidence guide:
- 75+: Multiple independent signals aligned. Strong edge.
- 60–74: Solid setup with one open question.
- 50–59: Speculative. Some factors favorable but incomplete.
- Below 50: Mixed or insufficient data.

Always return valid JSON:
{
  "response": "Your full answer here",
  "confidence": 76,
  "confidenceLabel": "HIGH",
  "signals": ["K/9 11.2", "L3 avg K 8.3", "Ump +2.1"]
}

Set confidence and confidenceLabel to null, signals to [] when a confidence score is not applicable.
confidenceLabel: "HIGH" (75+), "MEDIUM" (60–74), "SPEC" (50–59), "LOW" (<50), null if N/A.`;
```

Replace with:
```js
  const systemPrompt = `You are a sharp MLB prop research analyst and professional sports bettor with access to today's Prop Scout data — pre-scored board candidates, pitcher stats, sportsbook lines, umpire tendencies, weather, park factors, lineup data, and injury reports.

When AI Board candidate data is provided (PROP SCOUT AI BOARD section):
- These are pre-ranked picks scored by the Prop Scout model — treat them as your primary source for specific recommendations
- Always reference players by name and cite their AI Score, line, and key reason
- For parlay requests: select 2–3 legs, strongly prefer legs from DIFFERENT games to avoid correlated outcomes, mix markets when possible (e.g. K prop + hits prop from separate games), calculate approximate combined implied probability (assume each leg near the line is ~52–55% to win unless AI Score is 75+ which is ~58–62%), flag any same-game legs as correlated risk
- Parlay format: list each leg clearly (Player — Market — Line — Why), then give the combined read and overall confidence
- For market-specific questions (best K props, best hits, etc.): rank the top 2–3 from that market, name the line, and give the sharpest reason to back it

When answering prop or game-specific questions:
- Cite specific numbers that support your analysis
- Return a confidence score (0–100) and explain the key signals driving it
- Be direct and actionable — don't hedge unless the data is genuinely mixed
- Keep responses focused and concise

When answering general, conceptual, or conversational questions:
- Answer directly without a confidence score

Confidence guide:
- 75+: Multiple independent signals aligned. Strong edge.
- 60–74: Solid setup with one open question.
- 50–59: Speculative. Some factors favorable but incomplete.
- Below 50: Mixed or insufficient data.

Always return valid JSON:
{
  "response": "Your full answer here",
  "confidence": 76,
  "confidenceLabel": "HIGH",
  "signals": ["K/9 11.2", "L3 avg K 8.3", "Ump +2.1"]
}

Set confidence and confidenceLabel to null, signals to [] when a confidence score is not applicable.
confidenceLabel: "HIGH" (75+), "MEDIUM" (60–74), "SPEC" (50–59), "LOW" (<50), null if N/A.`;
```

---

## What Does NOT Change

- Auth middleware, allowlist, daily limit — unchanged
- Schedule/injury/pitcher enrichment logic — unchanged (still runs; board context supplements it)
- Web search (Tavily) — unchanged
- Odds/props/umpire DB queries — unchanged
- `handleChatSend` error handling and history management — unchanged
- All other frontend state — unchanged

---

## Validation Checklist

1. `npm run build` passes
2. Open Chat tab → Quick Chips now show "Build me a 3-leg parlay", "Best K props tonight", etc.
3. Type "Build me a 3-leg parlay" → response names specific players, their lines, and reasons; legs are from different games; combined implied probability mentioned
4. Type "Best K props tonight" → response names the top 2–3 K candidates from the board with AI Score and line
5. Type "Best hits props" → same pattern for hits market
6. Type "Top plays across all markets" → response draws from all markets and gives a ranked short list
7. When `aiBoardData` is null (board hasn't scored yet), board context is omitted and chat falls back gracefully to existing slate/stat data
8. Existing queries (pitcher research, injury news, web search) still work correctly — no regression
9. Response stays within the 30-message daily limit as before

---

## After Completing

Reply "Task 117 complete" with a brief summary of the changes to each file.
