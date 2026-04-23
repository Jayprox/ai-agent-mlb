/**
 * dailyCard.js — Full-slate AI analysis: "The Daily Card"
 *
 * Gathers data across every game on today's slate and asks Claude to surface
 * only the 2–3 strongest plays, using a disciplined bankroll-building lens.
 *
 * Rate cap:  10 uncached Anthropic calls per calendar day (~$1.50 max)
 * Cache:     45 minutes — all users share one result per window
 * Model:     claude-sonnet-4-6  (more capable than Haiku; worth it for full-slate reasoning)
 */

const express   = require("express");
const router    = express.Router();
const axios     = require("axios");
const Anthropic = require("@anthropic-ai/sdk");
const cache     = require("../services/cache");
const { todayHonolulu } = require("../jobs/snapshotJobs");

const CARD_TTL     = 45 * 60 * 1000; // 45-minute result cache
const DAILY_CAP    = 10;             // max uncached Anthropic calls per day (~$1.50)
const CARD_MODEL   = "claude-sonnet-4-6";

// ── Daily call counter (resets at midnight Honolulu time) ────────────────────
let _cap = { date: null, calls: 0 };

function capCheck() {
  const today = todayHonolulu();
  if (_cap.date !== today) _cap = { date: today, calls: 0 };
  if (_cap.calls >= DAILY_CAP) return false;
  _cap.calls++;
  return true;
}

function capStatus() {
  const today = todayHonolulu();
  if (_cap.date !== today) return { date: today, calls: 0, remaining: DAILY_CAP };
  return { date: _cap.date, calls: _cap.calls, remaining: DAILY_CAP - _cap.calls };
}

// ── Lazy Anthropic client ────────────────────────────────────────────────────
let _client = null;
const getClient = () => {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
};

// ── Internal fetch helper ────────────────────────────────────────────────────
// Hits our own cached endpoints so we don't bypass the shared cache layer.
async function internal(path) {
  const PORT = process.env.PORT ?? 3001;
  try {
    const res = await axios.get(`http://localhost:${PORT}${path}`, { timeout: 10000 });
    return res.data;
  } catch {
    return null;
  }
}

async function regenerateDailyCard() {
  const cacheKey = `daily-card:${todayHonolulu()}`;
  cache.clear(cacheKey);
  console.log(`  → Daily Card regenerate requested  key=${cacheKey}`);

  const data = await internal("/api/daily-card");
  if (!data?.card) {
    const message = data?.error ?? "Daily Card regeneration failed";
    console.error(`  ✗ Daily Card regenerate failed: ${message}`);
    throw new Error(message);
  }

  console.log(
    `  ✓ Daily Card regenerated  games=${data.gamesAnalyzed ?? "?"}  cost=$${data.tokens?.estCost ?? "?"}  cap=${data.cap?.calls ?? "?"}/${DAILY_CAP}`
  );
  return data;
}

// ── Context builder ──────────────────────────────────────────────────────────
// Produces a tight, information-dense string for the Claude context.
// Deliberately avoids raw stat dumps — surfaces signals, not noise.

function fmtOdds(n) {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : String(n);
}

function pitcherLine(p) {
  if (!p) return "TBD";
  const parts = [p.name ?? "TBD"];
  if (p.hand) parts.push(`(${p.hand}HP)`);
  return parts.join(" ");
}

function buildGameBlock(game, lineups, umpire, nrfi, props, oddsMap) {
  const { away, home, time, stadium, gamePk } = game;
  const lu = lineups ?? {};
  const lineupConfirmed = lu.confirmed === true;

  // ── Umpire
  const hp = umpire?.homePlate;
  const umpStr = hp
    ? `${hp.name}${hp.stats ? ` | K%: ${hp.stats.strikeout_rate ?? "—"} | ERA+: ${hp.stats.era_factor ?? "—"}` : " | stats N/A"}`
    : "TBD";

  // ── NRFI tendency (route returns { awayFirst, homeFirst, lean, confidence })
  let nrfiStr = "N/A";
  if (nrfi?.awayFirst && nrfi?.homeFirst) {
    const a = nrfi.awayFirst;
    const h = nrfi.homeFirst;
    nrfiStr = `${away.abbr} scores 1st inn: ${a.scoredPct ?? "?"}% (${a.avgRuns ?? "?"} avg R) | ${home.abbr}: ${h.scoredPct ?? "?"}% (${h.avgRuns ?? "?"} avg R) | lean: ${nrfi.lean ?? "?"}`;
  }

  // ── Odds
  const oddsKey = `${away.name}|${home.name}`;
  const odds = oddsMap?.[oddsKey];
  let oddsStr = "N/A";
  if (odds) {
    oddsStr = `Total: ${odds.total ?? "—"} | ${away.abbr} ML: ${fmtOdds(odds.awayML)} | ${home.abbr} ML: ${fmtOdds(odds.homeML)}`;
  }

  // ── Lineup summary (route returns { confirmed, away: [], home: [] })
  const awayOrder = (lu.away ?? []).slice(0, 6).map((p, i) => `${i + 1}.${p.name?.split(" ").pop()}`).join(" ");
  const homeOrder = (lu.home ?? []).slice(0, 6).map((p, i) => `${i + 1}.${p.name?.split(" ").pop()}`).join(" ");
  const lineupStatus = lineupConfirmed ? "CONFIRMED" : "UNCONFIRMED";

  // ── Pitcher lines
  const awayP = pitcherLine(game.probablePitchers?.away);
  const homeP = pitcherLine(game.probablePitchers?.home);

  // ── Key props (K lines + top hit/TB lines with book splits)
  const propLines = [];
  if (props?.length) {
    const kProps  = props.filter(p => p.market === "pitcher_strikeouts").slice(0, 2);
    const hitProps = props.filter(p => p.market === "batter_hits").slice(0, 3);
    const tbProps  = props.filter(p => p.market === "batter_total_bases").slice(0, 2);
    const hrProps  = props.filter(p => p.market === "batter_home_runs").slice(0, 1);

    for (const p of [...kProps, ...hitProps, ...tbProps, ...hrProps]) {
      const books = p.books ?? {};
      const bookStr = ["DK", "FD", "CZR", "MGM"]
        .filter(bk => books[bk])
        .map(bk => `${bk}:${books[bk].line}(${books[bk].overOdds ?? "—"})`)
        .join(" ");
      const split = (() => {
        const lines = Object.values(books).map(b => b.line).filter(Boolean);
        return [...new Set(lines)].length > 1 ? " [SPLIT]" : "";
      })();
      propLines.push(`  ${p.player} ${p.marketLabel} — ${bookStr}${split}`);
    }
  }

  return [
    `GAME ${gamePk}: ${away.abbr} @ ${home.abbr} | ${time} | ${stadium}`,
    `  SP: ${away.abbr} ${awayP} vs ${home.abbr} ${homeP}`,
    `  LINEUP [${lineupStatus}]: ${away.abbr}: ${awayOrder || "N/A"} | ${home.abbr}: ${homeOrder || "N/A"}`,
    `  UMPIRE: ${umpStr}`,
    `  NRFI:   ${nrfiStr}`,
    `  ODDS:   ${oddsStr}`,
    propLines.length ? `  PROPS:\n${propLines.join("\n")}` : "  PROPS: none posted",
  ].join("\n");
}

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a disciplined MLB betting analyst producing a daily picks card for bettors.

CRITICAL OUTPUT RULES — follow these exactly:
- Output ONLY the four numbered sections below. No preamble, no "I'll work through this", no pre-analysis notes, no reasoning narrative, no data quality commentary.
- Do NOT mention missing data, undefined values, or data limitations in your output. Silently factor them into your confidence ratings instead.
- Do NOT show your thinking process. Produce clean, professional output as if publishing to a betting blog.
- Start your response immediately with "1. BEST BETS SUMMARY" — nothing before it.

Analysis rules (apply silently, never mention in output):
- Minimum 2 independent positive signals to recommend a play
- Unconfirmed lineup → lower confidence on batter props
- Missing umpire data → lower confidence on strikeout props
- Pitcher avg IP under 5.0 → do not recommend K overs unless clearly justified
- Missing or conflicting data lowers confidence rating silently
- If the number is bad, note it in PLAYABILITY only
- If nothing qualifies, return PASS in the Official Card with one brief sentence

Preferred markets: pitcher strikeouts, pitcher outs, batter hits, total bases, NRFI/YRFI, selective game totals, F5 angles
Avoid: longshot HR props, large parlays, ladder plays, volatile alt lines

Return EXACTLY this format, nothing else:

1. BEST BETS SUMMARY
- [Ranked list of strongest plays, tight and selective]

2. PICK BREAKDOWN
PROP: [player/game] [market] [line] [OVER/UNDER/NRFI/YRFI]
CONFIDENCE: [1.0–10.0]
EDGE: [why this line has betting value in one sentence]
SIGNALS:
  • [specific data point]
  • [specific data point]
  • [optional third signal]
RISK:
  • [what could kill the play]
PLAYABILITY:
  • [still playable / playable only to X / pass if line moves past Y]

[Repeat PROP block for each recommended play]

3. PASSES
- [Player/game]: [one sentence why it was considered but rejected]

4. OFFICIAL CARD
[Each final play on its own line: Player — Market — Line — Direction — Confidence]`;

// ── GET /api/daily-card ───────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });

  const cacheKey = `daily-card:${todayHonolulu()}`;
  const cached   = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json({ ...cached, cap: capStatus() });
  }

  // Rate cap check
  if (!capCheck()) {
    console.warn("  ⚠ Daily Card: daily cap reached");
    return res.status(429).json({
      error: "Daily analysis cap reached ($1.50/day safeguard). Resets at midnight.",
      cap: capStatus(),
    });
  }

  console.log(`  → Daily Card: building full-slate context…`);
  const t0 = Date.now();

  try {
    // ── Step 1: Gather shared data ───────────────────────────────────────────
    const [schedule, injuriesRes, oddsData] = await Promise.all([
      internal("/api/schedule"),
      internal("/api/injuries"),
      internal("/api/odds"),
    ]);

    // /api/injuries returns { injuries: [...] }, not a plain array
    const injuries = injuriesRes?.injuries ?? injuriesRes ?? [];
    const games = Array.isArray(schedule) ? schedule : [];
    if (!games.length) {
      return res.status(404).json({ error: "No games on today's slate" });
    }

    const oddsMap = oddsData?.map ?? {};

    // Build injuredIds set for quick lookup
    const injuredNames = new Set(
      (injuries ?? []).map(p => (p.name ?? p.fullName ?? "").toLowerCase()).filter(Boolean)
    );

    // ── Step 2: Gather per-game data in parallel ─────────────────────────────
    const CHUNK = 5;
    const gameData = new Array(games.length).fill(null).map(() => ({}));

    for (let i = 0; i < games.length; i += CHUNK) {
      const chunk = games.slice(i, i + CHUNK);
      await Promise.allSettled(
        chunk.map(async (g, ci) => {
          const idx = i + ci;
          const pk  = g.gamePk ?? g.id;
          const [lineups, umpire, nrfi, props] = await Promise.all([
            internal(`/api/lineups/${pk}`),
            internal(`/api/umpires/${pk}`),
            internal(`/api/nrfi/${pk}`),
            internal(`/api/player-props/${pk}`),
          ]);
          gameData[idx] = { lineups, umpire, nrfi, props: props?.props ?? [] };
        })
      );
    }

    // ── Step 3: Build context string ─────────────────────────────────────────
    const gameBlocks = games.map((g, i) => {
      const { lineups, umpire, nrfi, props } = gameData[i];
      return buildGameBlock(g, lineups, umpire, nrfi, props, oddsMap);
    });

    // Injury summary (IL players active today)
    // injuries objects have shape: { playerName, team, status, date, description }
    const injurySection = injuries?.length
      ? `INJURIES (recent IL):\n${injuries.slice(0, 20).map(p => `  ${p.playerName ?? "Unknown"} (${p.team ?? "?"}) — ${p.status ?? "IL"}`).join("\n")}`
      : "INJURIES: none reported";

    const context = [
      `TODAY'S MLB SLATE — ${todayHonolulu()} — ${games.length} games\n`,
      injurySection,
      "\n--- GAMES ---\n",
      gameBlocks.join("\n\n"),
    ].join("\n");

    console.log(`  · Daily Card context built  games=${games.length}  chars=${context.length}`);

    // ── Step 4: Claude call ──────────────────────────────────────────────────
    const client = getClient();
    const message = await client.messages.create({
      model:      CARD_MODEL,
      max_tokens: 2048,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: context }],
    });

    const text = message.content?.[0]?.text ?? "";
    const inputTokens  = message.usage?.input_tokens  ?? 0;
    const outputTokens = message.usage?.output_tokens ?? 0;
    const estCost      = ((inputTokens * 3 + outputTokens * 15) / 1_000_000).toFixed(4);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ✓ Daily Card complete  games=${games.length}  in=${inputTokens}  out=${outputTokens}  cost=$${estCost}  elapsed=${elapsed}s  cap=${_cap.calls}/${DAILY_CAP}`);

    const result = {
      date:      todayHonolulu(),
      card:      text,
      gamesAnalyzed: games.length,
      generatedAt:   new Date().toISOString(),
      tokens: { input: inputTokens, output: outputTokens, estCost },
    };

    cache.set(cacheKey, result, CARD_TTL);
    res.setHeader("X-Cache", "MISS");
    res.json({ ...result, cap: capStatus() });

  } catch (err) {
    // Roll back the cap increment on failure so the call doesn't count
    if (_cap.calls > 0) _cap.calls--;
    console.error(`  ✗ Daily Card failed: ${err.message}`);
    console.error(err.stack ?? err);
    res.status(502).json({ error: "Daily Card generation failed", detail: err.message, stack: process.env.NODE_ENV !== "production" ? err.stack : undefined });
  }
});

module.exports = { router, regenerateDailyCard };
