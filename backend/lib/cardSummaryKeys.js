/**
 * Canonical keys for card_summaries — shared by cardSummary route and dailyAiSnapshot job.
 * All clients must resolve to these keys so everyone reads the same DB row.
 */

const MARKET_ALIASES = {
  k: "k",
  hr: "hr",
  hits: "hits",
  outs: "outs",
  nrfi: "nrfi",
  total: "total",
  spread: "spread",
  ml: "ml",
  f5ml: "f5ml",
  f5spread: "f5spread",
  "k board": "k",
  "hr board": "hr",
  "hits board": "hits",
  "outs board": "outs",
  "k picks": "model_k",
  "hr picks": "model_hr",
  "hits picks": "model_hits",
  "outs picks": "model_outs",
  totals: "total",
  "run line": "spread",
  moneyline: "ml",
  "f5 moneyline": "f5ml",
  "f5 run line": "f5spread",
};

function normalizeMarket(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  if (MARKET_ALIASES[s]) return MARKET_ALIASES[s];
  if (s.endsWith(" board")) {
    const base = s.replace(/ board$/, "").trim();
    return MARKET_ALIASES[base] ?? base.replace(/\s+/g, "_");
  }
  if (s.endsWith(" picks")) {
    const base = s.replace(/ picks$/, "").trim();
    const canon = MARKET_ALIASES[base] ?? base.replace(/\s+/g, "_");
    return canon.startsWith("model_") ? canon : `model_${canon}`;
  }
  return s.replace(/\s+/g, "_");
}

function normalizeLean(lean) {
  if (lean == null || lean === "") return "";
  const s = String(lean).trim().toUpperCase();
  if (s === "OVER" || s === "O") return "over";
  if (s === "UNDER" || s === "U") return "under";
  if (s === "HOME" || s === "H") return "home";
  if (s === "AWAY" || s === "A") return "away";
  if (s === "NRFI") return "nrfi";
  if (s === "YRFI") return "yrfi";
  return String(lean).trim().toLowerCase();
}

function normalizePlayerKey(name) {
  return String(name ?? "").toLowerCase().replace(/\s+/g, "_");
}

/** Stable Postgres card_key: player + market + lean */
function dbCardKey(card) {
  const name = normalizePlayerKey(card?.name);
  const market = normalizeMarket(card?.market);
  const lean = normalizeLean(card?.lean);
  return `${name}:${market}:${lean}`;
}

/** Pre-normalization key shape (legacy rows written before Phase A) */
function legacyDbCardKey(card) {
  const name = normalizePlayerKey(card?.name);
  const market = String(card?.market ?? "").trim().toLowerCase();
  const lean = String(card?.lean ?? "").trim().toLowerCase();
  return `${name}:${market}:${lean}`;
}

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

module.exports = {
  normalizeMarket,
  normalizeLean,
  dbCardKey,
  legacyDbCardKey,
  todayHonolulu,
};
