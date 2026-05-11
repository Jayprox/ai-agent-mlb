const express = require("express");
const crypto = require("crypto");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const cache = require("../services/cache");

const router = express.Router();

const SUMMARY_TTL = 6 * 60 * 60 * 1000; // 6h
const SUMMARY_MODEL = "claude-haiku-4-5-20251001";
const FALLBACK_MODEL = "gpt-4o-mini";
const PREMIUM_MODEL  = "gpt-4o";

let _anthropic = null;
let _openai = null;

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
  const positives = Array.isArray(card?.positives) ? card.positives.filter(Boolean).slice(0, 2) : [];
  const caution = card?.caution ? String(card.caution).trim() : "";
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

async function generateWithAnthropic(cards) {
  const client = getAnthropic();
  const message = await client.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 2000,
    temperature: 0.2,
    system:
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
    messages: [
      {
        role: "user",
        content: JSON.stringify({
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
        }),
      },
    ],
  });

  const text = message.content?.find((part) => part.type === "text")?.text ?? "";
  return safeJsonParse(text);
}

async function generateWithOpenAI(cards) {
  const client = getOpenAI();
  const message = await client.chat.completions.create({
    model: FALLBACK_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
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
        }),
      },
    ],
  });
  return safeJsonParse(message.choices?.[0]?.message?.content ?? "");
}

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

async function generateSummaries(cards, premium = false) {
  if (premium && process.env.OPENAI_API_KEY) return generateWithGPT4o(cards);
  if (process.env.ANTHROPIC_API_KEY) return generateWithAnthropic(cards);
  if (process.env.OPENAI_API_KEY) return generateWithOpenAI(cards);
  return {
    summaries: cards.map((card) => ({ id: card.id, text: fallbackSummary(card) })),
  };
}

router.post("/", async (req, res) => {
  const inputCards = Array.isArray(req.body?.cards) ? req.body.cards : [];
  const isPremium  = req.body?.premium === true;
  if (!inputCards.length) return res.status(400).json({ error: "cards[] required" });

  const summaries = {};
  const uncached = [];

  inputCards.forEach((card) => {
    if (!card?.id) return;
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
    const hash = crypto.createHash("md5").update(JSON.stringify(payload)).digest("hex");
    const cacheKey = `card-summary:${hash}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      summaries[card.id] = cached;
      return;
    }
    uncached.push({ ...card, _cacheKey: cacheKey });
  });

  if (!uncached.length) return res.json({ summaries });

  try {
    const generated = await generateSummaries(uncached, isPremium);
    const byId = new Map(
      Array.isArray(generated?.summaries)
        ? generated.summaries.map((item) => [item?.id, String(item?.text ?? "").trim()])
        : []
    );

    uncached.forEach((card) => {
      const text = byId.get(card.id) || fallbackSummary(card);
      summaries[card.id] = text;
      cache.set(card._cacheKey, text, SUMMARY_TTL);
    });

    return res.json({ summaries });
  } catch (err) {
    console.warn(`  ⚠ card-summary failed: ${err.message}`);
    uncached.forEach((card) => {
      summaries[card.id] = fallbackSummary(card);
    });
    return res.json({ summaries, fallback: true });
  }
});

module.exports = router;
