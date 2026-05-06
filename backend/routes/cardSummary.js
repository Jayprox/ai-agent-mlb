const express = require("express");
const crypto = require("crypto");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const cache = require("../services/cache");

const router = express.Router();

const SUMMARY_TTL = 6 * 60 * 60 * 1000; // 6h
const SUMMARY_MODEL = "claude-haiku-4-5-20251001";
const FALLBACK_MODEL = "gpt-4o-mini";

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
    max_tokens: 800,
    temperature: 0.2,
    system:
      "You rewrite structured MLB betting card factors into one factual sentence per card. " +
      "Use only the supplied information. Do not invent stats, teams, or players. " +
      "When a matchup object is provided, incorporate one specific H2H angle: " +
      "the batter's split vs pitcher handedness (batterVsHand.avg or ops), or the batter's " +
      "average vs the pitcher's primary pitch type (batterVsPitches). " +
      "Example: 'Piñango bats .378 vs LHP and Rodriguez leans heavily on the slider.' " +
      "Keep each sentence between 10 and 20 words. No hype, no emojis, no bullet points. " +
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
          "You rewrite structured MLB betting card factors into one factual sentence per card. " +
          "Use only the supplied information. Do not invent stats, teams, or players. " +
          "When a matchup object is provided, incorporate one specific H2H angle: " +
          "the batter's split vs pitcher handedness (batterVsHand.avg or ops), or the batter's " +
          "average vs the pitcher's primary pitch type (batterVsPitches). " +
          "Example: 'Piñango bats .378 vs LHP and Rodriguez leans heavily on the slider.' " +
          "Keep each sentence between 10 and 20 words. No hype, no emojis, no bullet points. " +
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
          })),
        }),
      },
    ],
  });
  return safeJsonParse(message.choices?.[0]?.message?.content ?? "");
}

async function generateSummaries(cards) {
  if (process.env.ANTHROPIC_API_KEY) return generateWithAnthropic(cards);
  if (process.env.OPENAI_API_KEY) return generateWithOpenAI(cards);
  return {
    summaries: cards.map((card) => ({ id: card.id, text: fallbackSummary(card) })),
  };
}

router.post("/", async (req, res) => {
  const inputCards = Array.isArray(req.body?.cards) ? req.body.cards : [];
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
    const generated = await generateSummaries(uncached);
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
