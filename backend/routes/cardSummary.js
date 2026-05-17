const express = require("express");
const crypto = require("crypto");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const cache = require("../services/cache");
const db = require("../services/db");

const router = express.Router();

const SUMMARY_TTL   = 6 * 60 * 60 * 1000; // 6h in-memory cache
const SUMMARY_MODEL = "claude-haiku-4-5-20251001";
const FALLBACK_MODEL = "gpt-4o-mini";
const PREMIUM_MODEL  = "gpt-4o";

// Cards below this score get deterministic fallback — no AI call.
const AI_SCORE_THRESHOLD = 70;

let _anthropic = null;
let _openai    = null;

function getAnthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

function safeJsonParse(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(cleaned);
}

function fallbackSummary(card) {
  const tier = card?.scoreTier ?? "mid";
  const negatives = Array.isArray(card?.negatives) ? card.negatives.filter(Boolean).slice(0, 2) : [];
  const positives = Array.isArray(card?.positives) ? card.positives.filter(Boolean).slice(0, 2) : [];
  const caution = card?.caution ? String(card.caution).trim() : "";

  if (tier === "low") {
    if (negatives.length >= 2) return `${negatives[0]}; ${negatives[1]}.`;
    if (negatives.length === 1) return caution ? `${negatives[0]}. ${caution}.` : `${negatives[0]}.`;
    return caution || `${card?.market ?? "Matchup"} shows limited edge from the current factor mix.`;
  }

  if (positives.length >= 2) {
    return caution
      ? `${positives[0]}; ${positives[1]}. ${caution}.`
      : `${positives[0]}; ${positives[1]}.`;
  }
  if (positives.length === 1) {
    return caution ? `${positives[0]}. ${caution}.` : `${positives[0]}.`;
  }
  return caution || `${card?.market ?? "Matchup"} leans ${card?.lean ?? "neutral"} from the current factor mix.`;
}

// Stable key for DB persistence: player + market + lean, date-scoped
function dbCardKey(card) {
  const name   = String(card.name   ?? "").toLowerCase().replace(/\s+/g, "_");
  const market = String(card.market ?? "").toLowerCase();
  const lean   = String(card.lean   ?? "").toLowerCase();
  return `${name}:${market}:${lean}`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// DB persistence: ensure migration table exists
async function ensureSummaryTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS card_summaries (
      id         SERIAL      PRIMARY KEY,
      slate_date DATE        NOT NULL,
      card_key   TEXT        NOT NULL,
      summary    TEXT        NOT NULL,
      is_premium BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_key_date_premium
      ON card_summaries(slate_date, card_key, is_premium)
  `);
}

let _tableReady = false;
async function getTableReady() {
  if (_tableReady || !db.isConnected()) return;
  try {
    await ensureSummaryTable();
    _tableReady = true;
  } catch (e) {
    console.warn("  ⚠ card_summaries table init failed:", e.message);
  }
}

async function dbGetSummaries(cardKeys, isPremium, slateDate) {
  if (!db.isConnected() || !cardKeys.length) return {};
  try {
    await getTableReady();
    const res = await db.query(
      `SELECT card_key, summary FROM card_summaries
       WHERE slate_date = $1 AND is_premium = $2 AND card_key = ANY($3)`,
      [slateDate, isPremium, cardKeys]
    );
    const out = {};
    for (const row of (res?.rows ?? [])) out[row.card_key] = row.summary;
    return out;
  } catch (e) {
    console.warn("  ⚠ card_summaries DB read failed:", e.message);
    return {};
  }
}

async function dbSaveSummaries(entries, isPremium, slateDate) {
  // entries: [{ cardKey, summary }]
  if (!db.isConnected() || !entries.length) return;
  try {
    await getTableReady();
    const values = entries.map((_, i) => {
      const base = i * 4;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    }).join(", ");
    const params = entries.flatMap(({ cardKey, summary }) => [slateDate, cardKey, summary, isPremium]);
    await db.query(
      `INSERT INTO card_summaries (slate_date, card_key, summary, is_premium)
       VALUES ${values}
       ON CONFLICT (slate_date, card_key, is_premium) DO NOTHING`,
      params
    );
  } catch (e) {
    console.warn("  ⚠ card_summaries DB write failed:", e.message);
  }
}

// Shared card payload shape for all AI calls
function cardPayload(card) {
  return {
    id:           card.id,
    market:       card.market,
    lean:         card.lean,
    score:        card.score ?? null,
    scoreTier:    card.scoreTier ?? "mid",
    positives:    card.positives ?? [],
    negatives:    card.negatives ?? [],
    caution:      card.caution ?? null,
    matchup:      card.matchup ?? null,
    signals:      card.signals ?? [],
    name:         card.name ?? null,
    hand:         card.hand ?? null,
    facingTeam:   card.facingTeam ?? null,
    avgK3:        card.avgK3 ?? null,
    avgIP:        card.avgIP ?? null,
    era:          card.era ?? null,
    whip:         card.whip ?? null,
    oppKPct:      card.oppKPct ?? null,
    umpire:       card.umpire ?? null,
    umpireRating: card.umpireRating ?? null,
    bookLine:     card.bookLine ?? null,
    windFav:      card.windFav ?? null,
    order:        card.order ?? null,
  };
}

const HAIKU_SYSTEM =
  "You write one factual sentence per MLB betting card. " +
  "You MUST return one summary object for EVERY card in the request — same count, same ids, no omissions. " +
  "Tone is driven by scoreTier: " +
  "  high (≥75) → confident edge statement, lead with what makes this pick strong; " +
  "  mid (55–74) → balanced — name the main edge but acknowledge the key headwind; " +
  "  low (<55)   → honest risk assessment — lead with what's working AGAINST this pick, do NOT spin it positive. " +
  "For high and mid tiers: cite at least two concrete numbers or stats from the payload (ERA, WHIP, K/9, avgK3, avgIP, AVG, OPS, bookLine, oppKPct, park, etc.) when any are present. " +
  "Use only the supplied data. Do not invent stats or players. " +
  "Always lead with the player or pitcher name if provided. Use signals[] and negatives[] as primary material for low-tier cards. " +
  "Market-specific angles: " +
  "k = K/9 or avgK3 + oppKPct + one edge (umpire, park); " +
  "outs = avgIP + whip + rest/workload signal; " +
  "hits = batterVsHand split or L5 form + opposing pitcher ERA; " +
  "hr = SLG/HR pace + park or wind; " +
  "f5ml/f5spread/nrfi/total/ml/spread = SP comparison + park/weather. " +
  "Keep each sentence 12–22 words. No hype, no emojis, no bullet points. " +
  "Return strict JSON only: {\"summaries\":[{\"id\":\"...\",\"text\":\"...\"}]}";

const GPT4O_MINI_SYSTEM =
  "You write one factual sentence per MLB betting card. " +
  "You MUST return one summary object for EVERY card in the request — same count, same ids, no omissions. " +
  "Tone is driven by scoreTier: " +
  "  high (≥75) → confident edge statement, lead with what makes this pick strong; " +
  "  mid (55–74) → balanced — name the main edge but acknowledge the key headwind; " +
  "  low (<55)   → honest risk assessment — lead with what's working AGAINST this pick, do NOT spin it positive. " +
  "For high and mid tiers: cite at least two concrete numbers from the payload when present. " +
  "Use only the supplied data. Do not invent stats or players. " +
  "Always lead with the player or pitcher name if provided. Use signals[] and negatives[] as primary material for low-tier cards. " +
  "Market-specific angles: " +
  "k = K/9 or avgK3 + oppKPct + one edge (umpire, park); " +
  "outs = avgIP + whip + rest/workload signal; " +
  "hits = batterVsHand split or L5 form + opposing pitcher ERA; " +
  "hr = SLG/HR pace + park or wind; " +
  "f5ml/f5spread/nrfi/total/ml/spread = SP comparison + park/weather. " +
  "Keep each sentence 12–22 words. No hype, no emojis, no bullet points. " +
  "Return strict JSON only: {\"summaries\":[{\"id\":\"...\",\"text\":\"...\"}]}";

const GPT4O_SYSTEM =
  "You are a sharp MLB prop betting analyst. Write one specific, realistic sentence per card. " +
  "You MUST return one summary object for EVERY card in the request — same count, same ids, no omissions. " +
  "Tone is driven by scoreTier: " +
  "  high (≥75) → confident, analyst-voice edge statement citing at least two concrete numbers; " +
  "  mid (55–74) → balanced assessment — lead with the main edge but include the most significant headwind; " +
  "  low (<55)   → honest, direct risk summary — explain clearly what factors are working against this pick; do NOT frame it as a good bet. " +
  "Use only the supplied data. Do not invent stats or players. " +
  "Always lead with the player or pitcher name. For low-tier cards, draw from negatives[] and caution first. " +
  "Market-specific guidance: " +
  "• k: combine K rate (K/9 or L3 avg Ks), opposing lineup weakness (oppKPct), and one situational edge (umpire, park, weather, signals). " +
  "• outs: lead with longevity (avgIP), command (WHIP), and any rest/workload angle from signals. " +
  "• hits: lead with batter's handedness split vs tonight's pitcher, recent form (L5), and pitcher's ERA or trend. " +
  "• hr: power profile (SLG or HR pace) + best situational edge (park HR factor, wind blowing out, pitcher ERA). " +
  "• f5ml/f5spread: SP quality comparison + park or weather edge; mention that bullpen doesn't factor in (F5 ends after 5 innings). " +
  "• nrfi/total/ml/spread: game-level edge — SP ERA match-up, park run environment, weather, or line value. " +
  "• Model Picks: player name, market, key stat, and why the line has value tonight. " +
  "Sentence length: 18–30 words. No emojis, no bullet points. " +
  "Return strict JSON only: {\"summaries\":[{\"id\":\"...\",\"text\":\"...\"}]}";

/**
 * Output token budget per batch.
 * Each card produces 12–22 words (~30 tokens) + JSON structure overhead (~20 tokens/card).
 * Cap at 4096 to stay well under the 10K TPM limit even across concurrent requests.
 */
function maxOutputTokensForBatch(cardCount, premium) {
  const perCard = premium ? 120 : 80;
  return Math.min(4096, Math.max(256, 100 + Math.max(1, cardCount) * perCard));
}

/** Returns true if err is an Anthropic 429 rate-limit error */
function isRateLimit(err) {
  return (
    err?.status === 429 ||
    err?.error?.type === "rate_limit_error" ||
    String(err?.message ?? "").includes("rate_limit_error") ||
    String(err?.message ?? "").includes("rate limit")
  );
}

async function generateWithAnthropic(cards) {
  const client = getAnthropic();
  const message = await client.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: maxOutputTokensForBatch(cards.length, false),
    temperature: 0.2,
    system: HAIKU_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify({ cards: cards.map(cardPayload) }) }],
  });
  const text = message.content?.find((part) => part.type === "text")?.text ?? "";
  return safeJsonParse(text);
}

async function generateWithOpenAI(cards) {
  const client = getOpenAI();
  const message = await client.chat.completions.create({
    model: FALLBACK_MODEL,
    max_tokens: maxOutputTokensForBatch(cards.length, false),
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: GPT4O_MINI_SYSTEM },
      { role: "user", content: JSON.stringify({ cards: cards.map(cardPayload) }) },
    ],
  });
  return safeJsonParse(message.choices?.[0]?.message?.content ?? "");
}

async function generateWithGPT4o(cards) {
  const client = getOpenAI();
  const message = await client.chat.completions.create({
    model: PREMIUM_MODEL,
    max_tokens: maxOutputTokensForBatch(cards.length, true),
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [
      { role: "system", content: GPT4O_SYSTEM },
      { role: "user", content: JSON.stringify({ cards: cards.map(cardPayload) }) },
    ],
  });
  return safeJsonParse(message.choices?.[0]?.message?.content ?? "");
}

async function generateSummaries(cards, premium = false) {
  if (premium && process.env.OPENAI_API_KEY) return generateWithGPT4o(cards);

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await generateWithAnthropic(cards);
    } catch (err) {
      if (isRateLimit(err)) {
        console.warn(`  ⚠ card-summary: Anthropic 429 — falling back to OpenAI`);
        // fall through to OpenAI below
      } else {
        throw err;
      }
    }
  }

  if (process.env.OPENAI_API_KEY) return generateWithOpenAI(cards);
  return {
    summaries: cards.map((card) => ({ id: card.id, text: fallbackSummary(card) })),
  };
}

router.post("/", async (req, res) => {
  const inputCards = Array.isArray(req.body?.cards) ? req.body.cards : [];
  const isPremium  = req.body?.premium === true;
  if (!inputCards.length) return res.status(400).json({ error: "cards[] required" });

  const slateDate = todayDate();
  const summaries = {};

  // ── Step 1: Score gate — below threshold gets deterministic fallback immediately ──
  const aiEligible = [];
  inputCards.forEach((card) => {
    if (!card?.id) return;
    const score = parseFloat(card.score ?? 0);
    if (score < AI_SCORE_THRESHOLD) {
      summaries[card.id] = fallbackSummary(card);
    } else {
      aiEligible.push(card);
    }
  });

  if (!aiEligible.length) return res.json({ summaries });

  // ── Step 2: In-memory cache check ──
  const uncachedMemory = [];
  aiEligible.forEach((card) => {
    const payload = {
      market: card.market ?? "", lean: card.lean ?? "", score: card.score ?? null,
      scoreTier: card.scoreTier ?? "mid",
      positives: Array.isArray(card.positives) ? card.positives.slice(0, 3) : [],
      negatives: Array.isArray(card.negatives) ? card.negatives.slice(0, 2) : [],
      caution: card.caution ?? null, matchup: card.matchup ?? null,
      signals: Array.isArray(card.signals) ? card.signals.slice(0, 4) : [],
      name: card.name ?? null, hand: card.hand ?? null,
      facingTeam: card.facingTeam ?? null, premium: isPremium,
    };
    const hash     = crypto.createHash("md5").update(JSON.stringify(payload)).digest("hex");
    const cacheKey = `card-summary:${hash}`;
    const cached   = cache.get(cacheKey);
    if (cached) {
      summaries[card.id] = cached;
    } else {
      uncachedMemory.push({ ...card, _cacheKey: cacheKey, _cardKey: dbCardKey(card) });
    }
  });

  if (!uncachedMemory.length) return res.json({ summaries });

  // ── Step 3: DB cache check ──
  const cardKeys   = uncachedMemory.map((c) => c._cardKey);
  const dbHits     = await dbGetSummaries(cardKeys, isPremium, slateDate);
  const uncachedDb = [];

  uncachedMemory.forEach((card) => {
    const dbText = dbHits[card._cardKey];
    if (dbText) {
      summaries[card.id] = dbText;
      cache.set(card._cacheKey, dbText, SUMMARY_TTL); // warm in-memory cache
    } else {
      uncachedDb.push(card);
    }
  });

  if (!uncachedDb.length) return res.json({ summaries });

  // ── Step 4: AI generation for remaining cards ──
  const SUMMARY_CHUNK = 10;

  try {
    for (let offset = 0; offset < uncachedDb.length; offset += SUMMARY_CHUNK) {
      const slice     = uncachedDb.slice(offset, offset + SUMMARY_CHUNK);
      const generated = await generateSummaries(slice, isPremium);
      const byId      = new Map(
        Array.isArray(generated?.summaries)
          ? generated.summaries.map((item) => [item?.id, String(item?.text ?? "").trim()])
          : []
      );

      const toSave = [];
      slice.forEach((card) => {
        const text = byId.get(card.id) || fallbackSummary(card);
        summaries[card.id] = text;
        cache.set(card._cacheKey, text, SUMMARY_TTL);
        if (byId.has(card.id)) toSave.push({ cardKey: card._cardKey, summary: text });
      });

      // Persist AI-generated summaries to DB (fire-and-forget)
      dbSaveSummaries(toSave, isPremium, slateDate).catch(() => {});
    }

    return res.json({ summaries });
  } catch (err) {
    console.warn(`  ⚠ card-summary failed: ${err.message}`);
    uncachedDb.forEach((card) => {
      if (summaries[card.id] == null) summaries[card.id] = fallbackSummary(card);
    });
    return res.json({ summaries, fallback: true });
  }
});

module.exports = router;
