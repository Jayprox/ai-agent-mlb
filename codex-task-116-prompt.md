# CODEX TASK 116 — Tiered Card Summaries (Haiku fast path + GPT-4o for top cards)

## Goal

Replace generic card summaries across **MODEL**, **BOARD**, and **AI BOARD** tabs with a two-tier system:

- **Tier 1 — Haiku (all cards):** Market-aware, player-named sentences using real signals. Zero extra latency for AI BOARD (reuses `aiReason` from the scoring call already in flight). Small prompt improvement for BOARD/MODEL.
- **Tier 2 — GPT-4o (cards with score ≥ 75 only):** Sharper, analyst-quality prose. Triggers after Tier 1 is displayed, overwrites it when ready. Visually distinguished with a ✦ badge.

**Before:** "Elite swing-and-miss; Strong recent K production."
**After (Tier 1):** "Cole averages 8.4 Ks L3 facing a lineup with 27% K rate; tight zone ump adds further edge."
**After (Tier 2, score ≥ 75):** "Cole's 11.2 K/9, elite 37% whiff rate, and a 27% K lineup with the ump squeezing calls make this one of the strongest K setups on the slate."

---

## Architecture

```
AI BOARD cards
  → aiReason already comes back from /api/ai-board/score (Haiku) ← display immediately
  → aiScore ≥ 75? → POST /api/card-summary {premium:true} → GPT-4o → store in aiCardSummaries → overwrite display

BOARD + MODEL cards
  → hydrateCardSummaries → /api/card-summary (Haiku, improved prompt) → aiCardSummaries
  → score ≥ 75? → POST /api/card-summary {premium:true} → GPT-4o → overwrite aiCardSummaries
```

One backend endpoint (`/api/card-summary`), one frontend state (`aiCardSummaries`), two quality tiers controlled by a `premium` flag.

---

## Part 1 — Backend: `backend/routes/aiBoard.js`

### 1a — Improve the Haiku `aiReason` prompt to be market-aware

Search for:
```js
        "You score MLB prop betting candidates on a 0–100 scale. " +
        "Use only the supplied stats. Do not invent numbers or players. " +
        "Score meaning: 75–100 = strong edge, 55–74 = moderate lean, 40–54 = neutral, below 40 = weak. " +
        "Weight inputs: algorithmic score (35%), simulation confidence (35%), stat quality (30%). " +
        "Write one factual reason sentence per candidate, 10–20 words, no hype or emojis. " +
        "Return strict JSON only: {\"scores\":[{\"id\":\"...\",\"aiScore\":75,\"aiReason\":\"...\"}]}",
```

Replace with:
```js
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
```

---

## Part 2 — Backend: `backend/routes/cardSummary.js`

### 2a — Add `premium` flag support (GPT-4o for score ≥ 75 cards)

Add a `PREMIUM_MODEL` constant after the existing model constants near the top of the file:

Search for:
```js
const SUMMARY_MODEL = "claude-haiku-4-5-20251001";
const FALLBACK_MODEL = "gpt-4o-mini";
```

Replace with:
```js
const SUMMARY_MODEL = "claude-haiku-4-5-20251001";
const FALLBACK_MODEL = "gpt-4o-mini";
const PREMIUM_MODEL  = "gpt-4o";
```

### 2b — Add `generateWithGPT4o` function

Add this function after `generateWithOpenAI` (before `generateSummaries`):

```js
async function generateWithGPT4o(cards) {
  const client = getOpenAI();
  const message = await client.chat.completions.create({
    model: PREMIUM_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are a sharp MLB prop betting analyst. Write one specific, confident sentence per card " +
          "explaining the key edge for this pick. Use only the supplied data. Do not invent stats or players. " +
          "Always lead with the player or pitcher name. Cite at least two concrete numbers. " +
          "Sound like a professional bettor who has reviewed the data — direct, no hedging, no hype. " +
          "Market-specific guidance: " +
          "• k: combine K rate (K/9 or L3 avg Ks), opposing lineup weakness (oppKPct), and one situational edge (umpire, park, weather, signals). " +
          "• outs: lead with longevity (avgIP), command (WHIP), and any rest/workload angle from signals. " +
          "• hits: lead with batter's handedness split vs tonight's pitcher (batterVsHand.avg/ops if available), recent form (L5), and pitcher's ERA or trend. " +
          "• hr: power profile (SLG or HR pace) + best situational edge (park HR factor, wind blowing out, pitcher ERA). " +
          "• f5ml/f5spread: SP quality comparison + park or weather edge; mention that bullpen doesn't factor in (F5 ends after 5 innings). " +
          "• nrfi/total/ml/spread: game-level edge — SP ERA match-up, park run environment, weather, or line value. " +
          "• Model Picks: player name, market, key stat, and why the line has value tonight. " +
          "Sentence length: 18–30 words. No emojis, no bullet points. " +
          "Return strict JSON only: {\"summaries\":[{\"id\":\"...\",\"text\":\"...\"}]}",
      },
      {
        role: "user",
        content: JSON.stringify({
          cards: cards.map((card) => ({
            id: card.id,
            market: card.market,
            lean: card.lean,
            positives: card.positives ?? [],
            caution: card.caution ?? null,
            signals: card.signals ?? [],
            name: card.name ?? null,
            hand: card.hand ?? null,
            facingTeam: card.facingTeam ?? null,
            avgK3: card.avgK3 ?? null,
            avgIP: card.avgIP ?? null,
            era: card.era ?? null,
            whip: card.whip ?? null,
            oppKPct: card.oppKPct ?? null,
            umpire: card.umpire ?? null,
            umpireRating: card.umpireRating ?? null,
            bookLine: card.bookLine ?? null,
            windFav: card.windFav ?? null,
            order: card.order ?? null,
            matchup: card.matchup ?? null,
          })),
        }),
      },
    ],
  });
  const parsed = safeJsonParse(message.choices?.[0]?.message?.content ?? "");
  return parsed;
}
```

### 2c — Update `generateSummaries` to route premium cards to GPT-4o

Search for:
```js
async function generateSummaries(cards) {
  if (process.env.ANTHROPIC_API_KEY) return generateWithAnthropic(cards);
  if (process.env.OPENAI_API_KEY) return generateWithOpenAI(cards);
  return {
    summaries: cards.map((card) => ({ id: card.id, text: fallbackSummary(card) })),
  };
}
```

Replace with:
```js
async function generateSummaries(cards, premium = false) {
  if (premium && process.env.OPENAI_API_KEY) return generateWithGPT4o(cards);
  if (process.env.ANTHROPIC_API_KEY) return generateWithAnthropic(cards);
  if (process.env.OPENAI_API_KEY) return generateWithOpenAI(cards);
  return {
    summaries: cards.map((card) => ({ id: card.id, text: fallbackSummary(card) })),
  };
}
```

### 2d — Update the route handler to read the `premium` flag and pass extended fields

Search for:
```js
router.post("/", async (req, res) => {
  const inputCards = Array.isArray(req.body?.cards) ? req.body.cards : [];
  if (!inputCards.length) return res.status(400).json({ error: "cards[] required" });
```

Replace with:
```js
router.post("/", async (req, res) => {
  const inputCards = Array.isArray(req.body?.cards) ? req.body.cards : [];
  const isPremium  = req.body?.premium === true;
  if (!inputCards.length) return res.status(400).json({ error: "cards[] required" });
```

Then update the cache key payload to include signals + name (so premium and standard results are cached separately and new signal data busts old caches).

Search for:
```js
    const payload = {
      market: card.market ?? "",
      lean: card.lean ?? "",
      positives: Array.isArray(card.positives) ? card.positives.slice(0, 3) : [],
      caution: card.caution ?? null,
      matchup: card.matchup ?? null,
    };
```

Replace with:
```js
    const payload = {
      market: card.market ?? "",
      lean: card.lean ?? "",
      positives: Array.isArray(card.positives) ? card.positives.slice(0, 3) : [],
      caution: card.caution ?? null,
      matchup: card.matchup ?? null,
      signals: Array.isArray(card.signals) ? card.signals.slice(0, 4) : [],
      name: card.name ?? null,
      hand: card.hand ?? null,
      facingTeam: card.facingTeam ?? null,
      premium: isPremium,
    };
```

Then update the `generateSummaries` call to pass `isPremium`:

Search for:
```js
    const generated = await generateSummaries(uncached);
```

Replace with:
```js
    const generated = await generateSummaries(uncached, isPremium);
```

### 2e — Update `generateWithAnthropic` to use market-aware prompt + extended fields

Replace the existing system prompt string inside `generateWithAnthropic`:

Search for:
```js
      "You rewrite structured MLB betting card factors into one factual sentence per card. " +
      "Use only the supplied information. Do not invent stats, teams, or players. " +
      "When a matchup object is provided, incorporate one specific H2H angle: " +
      "the batter's split vs pitcher handedness (batterVsHand.avg or ops), or the batter's " +
      "average vs the pitcher's primary pitch type (batterVsPitches). " +
      "Example: 'Piñango bats .378 vs LHP and Rodriguez leans heavily on the slider.' " +
      "Keep each sentence between 10 and 20 words. No hype, no emojis, no bullet points. " +
      "Return strict JSON only: {\"summaries\":[{\"id\":\"...\",\"text\":\"...\"}]}",
```

Replace with:
```js
      "You write one factual sentence per MLB betting card explaining why it scores well. " +
      "Use only the supplied data. Do not invent stats or players. " +
      "Always lead with the player or pitcher name if provided. Use signals[] as primary material. " +
      "Market-specific angles: " +
      "k = K/9 or avgK3 + oppKPct + one edge (umpire, park); " +
      "outs = avgIP + whip + rest/workload signal; " +
      "hits = batterVsHand split or L5 form + opposing pitcher ERA; " +
      "hr = SLG/HR pace + park or wind; " +
      "f5ml/f5spread/nrfi/total/ml/spread = SP comparison + park/weather. " +
      "Keep each sentence 12–22 words. No hype, no emojis, no bullet points. " +
      "Return strict JSON only: {\"summaries\":[{\"id\":\"...\",\"text\":\"...\"}]}",
```

Also update the `cards.map` inside `generateWithAnthropic` to forward the extended fields:

Search for (inside `generateWithAnthropic`):
```js
          cards: cards.map((card) => ({
            id: card.id,
            market: card.market,
            lean: card.lean,
            positives: card.positives ?? [],
            caution: card.caution ?? null,
            matchup: card.matchup ?? null,
          })),
```

Replace with:
```js
          cards: cards.map((card) => ({
            id: card.id,
            market: card.market,
            lean: card.lean,
            positives: card.positives ?? [],
            caution: card.caution ?? null,
            matchup: card.matchup ?? null,
            signals: card.signals ?? [],
            name: card.name ?? null,
            hand: card.hand ?? null,
            facingTeam: card.facingTeam ?? null,
            avgK3: card.avgK3 ?? null,
            avgIP: card.avgIP ?? null,
            era: card.era ?? null,
            whip: card.whip ?? null,
            oppKPct: card.oppKPct ?? null,
            umpire: card.umpire ?? null,
            umpireRating: card.umpireRating ?? null,
            bookLine: card.bookLine ?? null,
            windFav: card.windFav ?? null,
            order: card.order ?? null,
          })),
```

Apply the same `cards.map` update to `generateWithOpenAI` (the fallback function).

---

## Part 3 — Frontend: `prop-scout-v7.jsx`

### 3a — Update `buildBoardSummaryRequest` (line ~508) to forward extended fields

Search for:
```js
const buildBoardSummaryRequest = (c, type) => {
  const factors = c?.factors ?? generateWhyFactors(c, type);
  const positives = topPositiveSummaryLines(factors, 2);
  const caution = topCautionSummaryLine(factors);
  return {
    id: `board:${type}:${c?.id ?? c?.gamePk}:${c?.score ?? "na"}`,
    market:
      type === "hr" ? "HR Board"
      : type === "hits" ? "Hits Board"
      : type === "k" ? "K Board"
      : type === "outs" ? "Outs Board"
      : type === "nrfi" ? "NRFI"
      : type === "total" ? "Totals"
      : type === "spread" ? "Run Line"
      : type === "ml" ? "Moneyline"
      : type === "f5ml" ? "F5 Moneyline"
      : "F5 Run Line",
    lean: c?.leanAbbr ?? c?.lean ?? "",
    positives,
    caution,
    matchup: c?.matchup ?? null,
  };
};
```

Replace with:
```js
const buildBoardSummaryRequest = (c, type) => {
  const factors = c?.factors ?? generateWhyFactors(c, type);
  const positives = topPositiveSummaryLines(factors, 2);
  const caution = topCautionSummaryLine(factors);
  return {
    id: `board:${type}:${c?.id ?? c?.gamePk}:${c?.score ?? "na"}`,
    market:
      type === "hr" ? "HR Board"
      : type === "hits" ? "Hits Board"
      : type === "k" ? "K Board"
      : type === "outs" ? "Outs Board"
      : type === "nrfi" ? "NRFI"
      : type === "total" ? "Totals"
      : type === "spread" ? "Run Line"
      : type === "ml" ? "Moneyline"
      : type === "f5ml" ? "F5 Moneyline"
      : "F5 Run Line",
    lean: c?.leanAbbr ?? c?.lean ?? "",
    positives,
    caution,
    matchup:      c?.matchup ?? null,
    signals:      Array.isArray(c?.signals) ? c.signals.slice(0, 4) : [],
    name:         c?.name ?? null,
    hand:         c?.hand ?? null,
    facingTeam:   c?.facingTeam ?? null,
    avgK3:        c?.avgK3 ?? null,
    avgIP:        c?.avgIP ?? null,
    era:          c?.era ?? null,
    whip:         c?.whip ?? null,
    oppKPct:      c?.oppKPct ?? null,
    umpire:       c?.umpire ?? null,
    umpireRating: c?.umpireRating ?? null,
    bookLine:     c?.bookLine ?? null,
    windFav:      c?.windFav ?? null,
    order:        c?.order ?? null,
    score:        c?.score ?? null,
  };
};
```

### 3b — Update `buildModelSummaryRequest` (line ~532) to forward name and signals

Search for:
```js
const buildModelSummaryRequest = (p) => {
  const positives = (p?.signals ?? [])
    .filter(Boolean)
    .filter(signal => !SUMMARY_NEGATIVE_RE.test(String(signal)))
    .slice(0, 2);
  const caution = (p?.signals ?? []).find(signal => SUMMARY_NEGATIVE_RE.test(String(signal))) ?? null;
  return {
    id: `model:${p?.gamePk}:${p?.label}:${p?.confidence ?? "na"}`,
    market: `${p?.propType ?? "Model"} Picks`,
    lean: p?.lean ?? "",
    positives,
    caution,
  };
};
```

Replace with:
```js
const buildModelSummaryRequest = (p) => {
  const allSignals = (p?.signals ?? []).filter(Boolean);
  const positives  = allSignals.filter(s => !SUMMARY_NEGATIVE_RE.test(String(s))).slice(0, 2);
  const caution    = allSignals.find(s => SUMMARY_NEGATIVE_RE.test(String(s))) ?? null;
  return {
    id: `model:${p?.gamePk}:${p?.label}:${p?.confidence ?? "na"}`,
    market: `${p?.propType ?? "Model"} Picks`,
    lean: p?.lean ?? "",
    positives,
    caution,
    signals:    allSignals.slice(0, 4),
    name:       p?.player ?? p?.playerName ?? null,
    hand:       p?.hand ?? null,
    facingTeam: p?.opponent ?? p?.facingTeam ?? null,
    score:      p?.confidence ?? null,
  };
};
```

### 3c — Update `hydrateCardSummaries` to forward extended fields + support `premium` flag

Search for:
```js
  const hydrateCardSummaries = useCallback(async (requests) => {
    const pending = (requests ?? []).filter(req =>
      req?.id &&
      !aiCardSummaries[req.id] &&
      !aiSummaryInFlight.current.has(req.id)
    );
    if (!pending.length) return;

    pending.forEach(req => aiSummaryInFlight.current.add(req.id));
    try {
      const data = await apiMutate("/api/card-summary", "POST", {
        cards: pending.map(({ id, market, lean, positives, caution, matchup }) => ({ id, market, lean, positives, caution, matchup: matchup ?? null })),
      });
```

Replace with:
```js
  const hydrateCardSummaries = useCallback(async (requests, { premium = false } = {}) => {
    const premiumKey = (id) => premium ? `premium:${id}` : id;
    const pending = (requests ?? []).filter(req =>
      req?.id &&
      !aiCardSummaries[premiumKey(req.id)] &&
      !aiSummaryInFlight.current.has(premiumKey(req.id))
    );
    if (!pending.length) return;

    pending.forEach(req => aiSummaryInFlight.current.add(premiumKey(req.id)));
    try {
      const data = await apiMutate("/api/card-summary", "POST", {
        premium,
        cards: pending.map(({ id, market, lean, positives, caution, matchup, signals, name, hand, facingTeam, avgK3, avgIP, era, whip, oppKPct, umpire, umpireRating, bookLine, windFav, order }) => ({
          id, market, lean, positives, caution, matchup: matchup ?? null,
          signals: signals ?? [], name: name ?? null, hand: hand ?? null,
          facingTeam: facingTeam ?? null, avgK3: avgK3 ?? null, avgIP: avgIP ?? null,
          era: era ?? null, whip: whip ?? null, oppKPct: oppKPct ?? null,
          umpire: umpire ?? null, umpireRating: umpireRating ?? null,
          bookLine: bookLine ?? null, windFav: windFav ?? null, order: order ?? null,
        })),
      });
```

Also update the state-setter and inflight cleanup inside `hydrateCardSummaries` to use `premiumKey`:

Search for (inside `hydrateCardSummaries`):
```js
      setAiCardSummaries(prev => ({
        ...prev,
        ...Object.fromEntries(
          pending.map(req => [req.id, data?.summaries?.[req.id] ?? fallbackCardSummary(req)])
        ),
      }));
    } catch {
      setAiCardSummaries(prev => ({
        ...prev,
        ...Object.fromEntries(pending.map(req => [req.id, fallbackCardSummary(req)])),
      }));
    } finally {
      pending.forEach(req => aiSummaryInFlight.current.delete(req.id));
    }
```

Replace with:
```js
      setAiCardSummaries(prev => ({
        ...prev,
        ...Object.fromEntries(
          pending.map(req => [premiumKey(req.id), data?.summaries?.[req.id] ?? fallbackCardSummary(req)])
        ),
      }));
    } catch {
      setAiCardSummaries(prev => ({
        ...prev,
        ...Object.fromEntries(pending.map(req => [premiumKey(req.id), fallbackCardSummary(req)])),
      }));
    } finally {
      pending.forEach(req => aiSummaryInFlight.current.delete(premiumKey(req.id)));
    }
```

### 3d — Update `getCardSummaryText` to prefer premium summary when available

Search for:
```js
  const getCardSummaryText = useCallback((request) => {
    if (!request?.id) return null;
    return aiCardSummaries[request.id] ?? fallbackCardSummary(request);
  }, [aiCardSummaries]);
```

Replace with:
```js
  const getCardSummaryText = useCallback((request) => {
    if (!request?.id) return null;
    return aiCardSummaries[`premium:${request.id}`]
      ?? aiCardSummaries[request.id]
      ?? fallbackCardSummary(request);
  }, [aiCardSummaries]);
```

### 3e — Add a second `hydrateCardSummaries` call for premium (score ≥ 75) in the Board useEffect

This is the useEffect at line ~5097 that already calls `hydrateCardSummaries(requests)`. After that call, add a premium call for high-score candidates:

Search for:
```js
    hydrateCardSummaries(requests);
  }, [view, boardTab, gameSubTab, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires, liveLineups, livePlayerProps, liveHittingLog, liveStatSplits, liveGameLog, liveTeamStats, hydrateCardSummaries]);
```

Replace with:
```js
    hydrateCardSummaries(requests);
    const premiumRequests = requests.filter(r => (r.score ?? 0) >= 75);
    if (premiumRequests.length) hydrateCardSummaries(premiumRequests, { premium: true });
  }, [view, boardTab, gameSubTab, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires, liveLineups, livePlayerProps, liveHittingLog, liveStatSplits, liveGameLog, liveTeamStats, hydrateCardSummaries]);
```

### 3f — AI BOARD: store `aiReason` into `aiCardSummaries` + trigger premium for score ≥ 75

Find the useEffect that processes the AI board scoring response (around line 4082). After `setAiBoardData(scored)` is called, add logic to seed `aiCardSummaries` from `aiReason` and trigger premium calls.

Search for the block where `scored` is built and `setAiBoardData` is called. It looks like:

```js
        scored.sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0));
        setAiBoardData(scored);
```

Replace with:
```js
        scored.sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0));
        setAiBoardData(scored);

        // Seed Tier 1 summaries from aiReason (already generated by Haiku during scoring)
        setAiCardSummaries(prev => {
          const updates = {};
          scored.forEach(c => {
            if (c.aiReason && !prev[c.id]) updates[c.id] = c.aiReason;
          });
          return Object.keys(updates).length ? { ...prev, ...updates } : prev;
        });

        // Trigger Tier 2 (GPT-4o) for high-confidence cards (aiScore ≥ 75)
        const highConfidence = scored.filter(c => (c.aiScore ?? 0) >= 75);
        if (highConfidence.length) {
          const premiumRequests = highConfidence.map(c => {
            const cand = c._candidate ?? {};
            return buildBoardSummaryRequest(
              { ...cand, id: c.id, name: c.name ?? cand.name, score: c.aiScore,
                signals: Array.isArray(cand.signals) ? cand.signals : [],
                hand: cand.hand ?? null, facingTeam: cand.facingTeam ?? null,
                avgK3: cand.avgK3 ?? cand.stats?.avgK3 ?? null,
                avgIP: cand.avgIP ?? cand.stats?.avgIP ?? null,
                era: cand.era ?? cand.stats?.era ?? null,
                whip: cand.whip ?? cand.stats?.whip ?? null,
                oppKPct: cand.oppKPct ?? cand.stats?.oppKPct ?? null,
                umpire: cand.umpire ?? null, umpireRating: cand.umpireRating ?? null,
                bookLine: c.bookLine ?? null, windFav: cand.windFav ?? null,
                order: cand.order ?? null, matchup: cand.matchup ?? null },
              c.market
            );
          });
          hydrateCardSummaries(premiumRequests, { premium: true });
        }
```

### 3g — AI BOARD card rendering: use `getCardSummaryText` with premium fallback to `aiReason`

Find the AI Board card rendering (around line 10387):

```js
                            {c.aiReason && (
                              <div style={{ fontSize: 10, color: "#d1d5db", fontStyle: "italic", lineHeight: 1.4 }}>{c.aiReason}</div>
                            )}
```

Replace with:
```js
                            {(() => {
                              const boardReq = { id: c.id };
                              const premiumText = aiCardSummaries[`premium:${c.id}`];
                              const summaryText = premiumText ?? c.aiReason ?? null;
                              if (!summaryText) return null;
                              return (
                                <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginTop: 2 }}>
                                  {premiumText && (
                                    <span style={{ fontSize: 8, color: "#a78bfa", fontFamily: "monospace", fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✦</span>
                                  )}
                                  <div style={{ fontSize: 10, color: "#d1d5db", fontStyle: "italic", lineHeight: 1.4 }}>{summaryText}</div>
                                </div>
                              );
                            })()}
```

### 3h — BOARD and MODEL cards: add ✦ badge when premium summary is active

Wherever `getCardSummaryText(boardSummaryRequest)` or `getCardSummaryText(whySummaryRequest)` is rendered on BOARD/MODEL cards, wrap the output to show the badge if a premium summary is in use:

Find usages like:
```js
{getCardSummaryText(boardSummaryRequest) && (
  <div style={{ fontSize: 10, ... }}>{getCardSummaryText(boardSummaryRequest)}</div>
)}
```

For each of these (there are ~4 sites: BOARD games tab ~line 9583, BOARD batter tab ~9750, BOARD pitcher tab ~9923, MODEL tab ~10802), replace the plain text div with:

```js
{(() => {
  const summaryText = getCardSummaryText(boardSummaryRequest);
  const isPremium = !!aiCardSummaries[`premium:${boardSummaryRequest?.id}`];
  if (!summaryText) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
      {isPremium && (
        <span style={{ fontSize: 8, color: "#a78bfa", fontFamily: "monospace", fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✦</span>
      )}
      <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.4 }}>{summaryText}</div>
    </div>
  );
})()}
```

Note: use the appropriate local variable name (`boardSummaryRequest`, `whySummaryRequest`, etc.) at each call site. The pattern is the same.

---

## What Does NOT Change

- `generateWhyFactors` — unchanged
- `topPositiveSummaryLines` / `topCautionSummaryLine` — unchanged
- `fallbackCardSummary` — unchanged
- `aiCardSummaries` state initialization — unchanged
- All other useEffects — unchanged
- Backend routes other than `aiBoard.js` and `cardSummary.js` — unchanged

---

## Validation Checklist

1. `npm run build` passes
2. **AI BOARD** → all cards show an `aiReason` sentence immediately after scoring loads (Haiku, no extra call)
3. **AI BOARD** → cards with `aiScore ≥ 75` show a ✦ badge and a longer, more specific GPT-4o sentence within a few seconds
4. **BOARD → K tab** → summary names the pitcher, cites L3 avg Ks or K/9, mentions opp lineup or umpire
5. **BOARD → Outs tab** → summary names pitcher, cites avg IP and WHIP or rest angle
6. **BOARD → Hits tab** → summary names batter, cites handedness split or L5 form, mentions pitcher ERA
7. **BOARD → Games tab** → summary cites SP ERA comparison or park/weather edge
8. **MODEL tab** → summary names player, cites market and key stat
9. **Score ≥ 75 cards on BOARD/MODEL** → ✦ badge + GPT-4o prose appears after ~1–2s delay (async upgrade)
10. Hard-refresh → premium summaries re-fetch (new cache key), standard summaries also re-fetch (cache key changed)
11. No "undefined" or "null" visible in any rendered summary

---

## After Completing

Reply "Task 116 complete" with a brief summary of what was changed in each of the four files.
