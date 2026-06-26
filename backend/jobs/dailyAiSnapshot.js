/**
 * Daily AI Snapshot Job
 *
 * Runs once per day (10 AM HST) and again at pregame (~95 min before first pitch).
 * Builds the full board enrichment server-side, scores candidates with Haiku,
 * pre-generates card summaries, and persists everything to Postgres.
 *
 * After this runs:
 *   • GET  /api/ai-board/edges     → returns today's pre-scored candidates (no Anthropic call)
 *   • POST /api/card-summary       → hits DB cache on every card (no Anthropic call)
 *
 * All clients (web + iOS) see the same summaries for the entire day.
 */

const Anthropic  = require("@anthropic-ai/sdk");
const db         = require("../services/db");
const { buildSchedulePayloadForJob } = require("../routes/schedule");
const { dbCardKey, todayHonolulu: todayHonoluluKey } = require("../lib/cardSummaryKeys");
const { gatherLiveBoardData, computeMarketCandidates } = require("../services/liveBoardData");
const { BOARD_MARKETS, saveBoardSnapshot } = require("../services/boardSnapshotDb");

// ── Helpers ────────────────────────────────────────────────────────────────

function todayHonolulu() {
  return todayHonoluluKey();
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
  try { return JSON.parse(raw); } catch { return null; }
}

// ── DB helpers ─────────────────────────────────────────────────────────────

async function ensureEdgesTable() {
  if (!db.isConnected()) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_board_edges (
      id           SERIAL PRIMARY KEY,
      slate_date   DATE        NOT NULL,
      edges        JSONB       NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_board_edges_date
      ON ai_board_edges(slate_date)
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS board_daily_snapshots (
      slate_date   DATE         NOT NULL,
      market       TEXT         NOT NULL,
      candidates   JSONB        NOT NULL,
      generated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      PRIMARY KEY  (slate_date, market)
    )
  `);
}

async function saveEdges(slateDate, edges) {
  if (!db.isConnected()) return false;
  try {
    await ensureEdgesTable();
    await db.query(
      `INSERT INTO ai_board_edges (slate_date, edges, generated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (slate_date) DO UPDATE SET edges = $2, generated_at = NOW()`,
      [slateDate, JSON.stringify(edges)]
    );
    return true;
  } catch (err) {
    console.warn("  ⚠ dailyAiSnapshot: saveEdges failed:", err.message);
    return false;
  }
}

// ── Card summary DB write (mirrors cardSummary.js logic) ──────────────────

async function saveCardSummaries(entries, slateDate) {
  // entries: [{ cardKey: string, summary: string }]
  if (!db.isConnected() || !entries.length) return;
  try {
    const values = entries.map((_, i) => {
      const b = i * 4;
      return `($${b+1}, $${b+2}, $${b+3}, $${b+4})`;
    }).join(", ");
    const params = entries.flatMap(({ cardKey, summary }) => [slateDate, cardKey, summary, false]);
    await db.query(
      `INSERT INTO card_summaries (slate_date, card_key, summary, is_premium)
       VALUES ${values}
       ON CONFLICT (slate_date, card_key, is_premium)
       DO UPDATE SET summary = EXCLUDED.summary, created_at = NOW()`,
      params
    );
    console.log(`  ✓ dailyAiSnapshot: saved ${entries.length} card summaries to DB`);
  } catch (err) {
    console.warn("  ⚠ dailyAiSnapshot: saveCardSummaries failed:", err.message);
  }
}

// ── AI scoring helpers ─────────────────────────────────────────────────────

const SCORE_MODEL = "claude-haiku-4-5-20251001";

const SUMMARY_SYSTEM =
  "You write one factual sentence per MLB betting card. " +
  "You MUST return one summary object for EVERY card — same count, same ids, no omissions. " +
  "Tone: high (≥75) → confident edge; mid (55–74) → balanced with main headwind; low (<55) → honest risk. " +
  "Cite at least two concrete numbers from the payload for high/mid tiers. " +
  "Always lead with the player name. Use signals[] and negatives[] for low tiers. " +
  "k = K/9 or avgK3 + oppKPct; outs = avgIP + whip; hits = split + ERA; hr = SLG + park/wind. " +
  "12–22 words each. No hype, no emojis. " +
  "Return strict JSON only: {\"summaries\":[{\"id\":\"...\",\"text\":\"...\"}]}";

const EDGE_SYSTEM =
  "You score MLB prop betting candidates 0–100. " +
  "75–100 = strong edge, 55–74 = moderate, 40–54 = neutral, <40 = weak. " +
  "Weight: algorithmic score 35%, simulation confidence 35%, stat quality 30%. " +
  "One factual reason per candidate, 12–22 words, lead with player name. " +
  "k = K/9 + oppK% + umpire/park; outs = avgIP + WHIP; " +
  "hits = split + pitcher ERA; hr = SLG + park/wind; f5ml = SP ERA + park/weather. " +
  "Return strict JSON only: {\"scores\":[{\"id\":\"...\",\"aiScore\":75,\"aiReason\":\"...\"}]}";

async function scoreWithAI(candidates) {
  if (!candidates.length) return {};
  const client = getAnthropic();
  const scored = {};
  const CHUNK = 12;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);
    try {
      const msg = await client.messages.create({
        model: SCORE_MODEL,
        max_tokens: 2000,
        temperature: 0.15,
        system: EDGE_SYSTEM,
        messages: [{ role: "user", content: JSON.stringify({
          candidates: slice.map(c => ({
            id: c.id, market: c.market, playerName: c.name ?? c.playerName,
            team: c.team, gameLabel: c.gameLabel,
            score: c.score, simConfidence: c.simConfidence,
            bookLine: c.propLine?.books?.DK?.line ?? c.suggestedLine ?? null,
            stats: { era: c.era, k9: c.k9, whip: c.whip, avgIP: c.avgIP, avgK3: c.avgK3 },
          })),
        }) }],
      });
      const text = msg.content?.find(p => p.type === "text")?.text ?? "";
      const parsed = safeJsonParse(text);
      (parsed?.scores ?? []).forEach(s => {
        if (s?.id != null) scored[s.id] = { aiScore: Math.round(Number(s.aiScore ?? 50)), aiReason: String(s.aiReason ?? "").trim() };
      });
    } catch (err) {
      console.warn(`  ⚠ dailyAiSnapshot: scoreWithAI chunk failed: ${err.message}`);
    }
  }
  return scored;
}

async function generateCardSummaries(cards) {
  if (!cards.length) return {};
  const client = getAnthropic();
  const summaries = {};
  const CHUNK = 10;
  for (let i = 0; i < cards.length; i += CHUNK) {
    const slice = cards.slice(i, i + CHUNK);
    try {
      const msg = await client.messages.create({
        model: SCORE_MODEL,
        max_tokens: Math.min(4096, 100 + slice.length * 80),
        temperature: 0.2,
        system: SUMMARY_SYSTEM,
        messages: [{ role: "user", content: JSON.stringify({ cards: slice }) }],
      });
      const text = msg.content?.find(p => p.type === "text")?.text ?? "";
      const parsed = safeJsonParse(text);
      (parsed?.summaries ?? []).forEach(s => {
        if (s?.id != null) summaries[s.id] = String(s.text ?? "").trim();
      });
    } catch (err) {
      console.warn(`  ⚠ dailyAiSnapshot: generateCardSummaries chunk failed: ${err.message}`);
    }
  }
  return summaries;
}

// ── Main job ───────────────────────────────────────────────────────────────

async function generateDailyAiSnapshot(label = "scheduled") {
  const slateDate = todayHonolulu();
  console.log(`\n  → dailyAiSnapshot [${label}]  date=${slateDate}`);

  if (!db.isConnected()) {
    throw new Error("DATABASE_URL not set or PostgreSQL unavailable");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  // ── 1. Schedule ──────────────────────────────────────────────────────────
  let schedule;
  try {
    schedule = await buildSchedulePayloadForJob(slateDate);
  } catch (err) {
    console.warn("  ⚠ dailyAiSnapshot: schedule fetch failed:", err.message);
    return;
  }
  const activeSlate = schedule.filter(g =>
    ["Scheduled", "Pre-Game", "Warmup", "In Progress"].includes(g.status)
  );
  if (!activeSlate.length) {
    console.log("  · dailyAiSnapshot: no active games, skipping");
    return;
  }
  console.log(`  · games=${activeSlate.length}`);

  // ── 2-6. Gather all live data needed for board scoring ───────────────────
  const liveData = await gatherLiveBoardData(activeSlate);
  const {
    oddsMap,
    liveNrfiData,
    liveWeather,
    liveLineups,
    liveUmpires,
    livePlayerProps,
    liveTeamStats,
    livePitcherStats,
    liveGameLog,
    pitcherArsenal,
    liveStatSplits,
    liveHittingLog,
  } = liveData;

  console.log(`  · pitchers=${Object.keys(livePitcherStats).length}  teamStats=${Object.keys(liveTeamStats).length}`);

  // ── 7. Run board scoring ─────────────────────────────────────────────────
  let buildAiBoardPayload, computeGameBoard, computePitcherBoard, computeBatterBoard;
  try {
    const board = await import("../../src/board/index.js");
    buildAiBoardPayload = board.buildAiBoardPayload;
    computeGameBoard = board.computeGameBoard;
    computePitcherBoard = board.computePitcherBoard;
    computeBatterBoard = board.computeBatterBoard;
  } catch (err) {
    console.warn("  ⚠ dailyAiSnapshot: board import failed:", err.message);
    return;
  }

  const candidates = buildAiBoardPayload(
    activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats,
    liveLineups, liveWeather, liveHittingLog, liveStatSplits,
    liveNrfiData, oddsMap ?? {}, pitcherArsenal
  );

  // Also include game board candidates (totals, ML, spread, NRFI)
  const gameCandidates = [
    ...computeGameBoard("total",  activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups),
    ...computeGameBoard("nrfi",   activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups),
    ...computeGameBoard("ml",     activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups),
  ].slice(0, 12);

  const allCandidates = [...candidates, ...gameCandidates];
  if (!allCandidates.length) {
    console.log("  · dailyAiSnapshot: no candidates, skipping AI calls");
    return;
  }
  console.log(`  · candidates=${allCandidates.length}`);

  // ── 8. Score with Haiku ───────────────────────────────────────────────────
  const aiScores = await scoreWithAI(allCandidates);

  // Build merged edge list
  const edges = allCandidates.map(c => ({
    ...c,
    aiScore:  aiScores[c.id]?.aiScore  ?? Math.round((c.score ?? 50) * 0.6 + (c.simConfidence ?? 50) * 0.4),
    aiReason: aiScores[c.id]?.aiReason ?? null,
    bookLine: c.bookLine ?? c._candidate?.propLine?.books?.DK?.line ?? c._candidate?.propLine?.books?.FD?.line ?? c._candidate?.suggestedLine ?? null,
    bookOdds: c.bookOdds ?? c._candidate?.propLine?.books?.DK?.overOdds ?? null,
  })).filter(c => (c.aiScore ?? 0) >= 55) // only meaningful edges
    .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0));

  const edgesSaved = await saveEdges(slateDate, edges);
  if (edgesSaved) console.log(`  ✓ dailyAiSnapshot: saved ${edges.length} edges`);
  else console.warn(`  ⚠ dailyAiSnapshot: edges NOT persisted (${edges.length} computed in memory only)`);

  // ── 9. Pre-generate card summaries ───────────────────────────────────────
  // Cards above score threshold get AI summaries stored in card_summaries table.
  // When frontend calls POST /api/card-summary, it hits DB cache and skips AI.
  const summaryCards = allCandidates
    .filter(c => (c.score ?? 0) >= 70)
    .slice(0, 40)
    .map(c => ({
      id:        c.id,
      market:    c.market,
      lean:      c.lean ?? (c.score >= 70 ? "OVER" : "UNDER"),
      score:     c.score,
      scoreTier: (c.score ?? 0) >= 75 ? "high" : (c.score ?? 0) >= 55 ? "mid" : "low",
      name:      c.name ?? c.playerName ?? null,
      hand:      c.hand ?? null,
      facingTeam: c.facingTeam ?? null,
      avgK3:     c.avgK3 ?? null,
      avgIP:     c.avgIP ?? null,
      era:       c.era ?? null,
      whip:      c.whip ?? null,
      oppKPct:   c.oppKPct ?? null,
      umpire:    c.umpire ?? null,
      umpireRating: c.umpireRating ?? null,
      bookLine:  c.propLine?.books?.DK?.line ?? c.suggestedLine ?? null,
      windFav:   c.windFav ?? false,
      order:     c.order ?? null,
      signals:   c.signals ?? [],
      positives: [],
      negatives: [],
      caution:   null,
      matchup:   c.matchup ?? null,
    }));

  if (summaryCards.length) {
    const summaryMap = await generateCardSummaries(summaryCards);
    const toSave = summaryCards
      .filter(c => summaryMap[c.id])
      .map(c => ({ cardKey: dbCardKey(c), summary: summaryMap[c.id] }));
    await saveCardSummaries(toSave, slateDate);
  }

  // ── 10. Pre-snapshot all board markets ───────────────────────────────────
  // These snapshots make Board cards deterministic for every client that opens today.
  const boardMarkets = [];
  for (const market of BOARD_MARKETS) {
    boardMarkets.push({
      market,
      candidates: await computeMarketCandidates(market, activeSlate, liveData),
    });
  }

  let boardSnapshotsSaved = 0;
  for (const { market, candidates: marketCandidates } of boardMarkets) {
    const summaryInput = marketCandidates.slice(0, 30).map((c, idx) => ({
      id: String(c.id ?? c.gamePk ?? `${market}-${idx}`),
      market,
      lean: c.leanAbbr ?? c.lean ?? "",
      score: c.score ?? 50,
      scoreTier: (c.score ?? 0) >= 75 ? "high" : (c.score ?? 0) >= 55 ? "mid" : "low",
      positives: [],
      negatives: [],
      caution: null,
      signals: Array.isArray(c.signals) ? c.signals.slice(0, 4) : [],
      name: c.name ?? null,
      hand: c.hand ?? null,
      facingTeam: c.facingTeam ?? null,
      avgK3: c.avgK3 ?? null,
      avgIP: c.avgIP ?? null,
      era: c.era ?? null,
      whip: c.whip ?? null,
      oppKPct: c.oppKPct ?? null,
      umpire: c.umpire ?? null,
      umpireRating: c.umpireRating ?? null,
      bookLine: c.bookLine ?? c.propLine?.books?.DK?.line ?? c.propLine?.books?.FD?.line ?? c.suggestedLine ?? null,
      windFav: c.windFav ?? false,
      matchup: c.away && c.home ? `${c.away.abbr ?? ""} (away) @ ${c.home.abbr ?? ""} (home)` : (c.matchup ?? null),
      order: c.order ?? null,
    }));

    let summaryMap = {};
    try {
      summaryMap = await generateCardSummaries(summaryInput);
    } catch (err) {
      console.warn(`  ⚠ dailyAiSnapshot: board summary gen failed for ${market}: ${err.message}`);
    }

    const withSummaries = marketCandidates.map((c, idx) => {
      const sid = summaryInput[idx]?.id;
      return {
        ...c,
        _boardSummary: sid && summaryMap[sid] ? summaryMap[sid] : null,
      };
    });

    if (await saveBoardSnapshot(slateDate, market, withSummaries)) boardSnapshotsSaved++;
  }
  if (boardSnapshotsSaved > 0) {
    console.log(`  ✓ dailyAiSnapshot: board snapshots saved for ${boardSnapshotsSaved}/${boardMarkets.length} markets`);
  } else {
    throw new Error("board snapshots failed to persist (check DATABASE_URL — use DATABASE_PUBLIC_URL when running locally)");
  }

  console.log(`  ✓ dailyAiSnapshot [${label}] complete  date=${slateDate}  edges=${edges.length}  summaries=${summaryCards.length}`);
}

module.exports = { generateDailyAiSnapshot };
