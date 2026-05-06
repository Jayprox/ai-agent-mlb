const fs = require("fs");
const path = require("path");
const axios = require("axios");

const UMPIRES_DATA_PATH = path.join(__dirname, "..", "data", "umpires.json");

function normalizeName(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[%,$]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function getSeasonWindow() {
  const year = new Date().getFullYear();
  return {
    season: year,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    seasonType: "R",
  };
}

function loadExisting() {
  try {
    return JSON.parse(fs.readFileSync(UMPIRES_DATA_PATH, "utf8"));
  } catch {
    return { source: "umpscorecards", scrapedAt: null, season: new Date().getFullYear(), seasonType: "R", count: 0, umpiresByName: {} };
  }
}

function flattenRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const directKeys = ["umpires", "data", "results", "items", "rows"];
  for (const key of directKeys) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && Array.isArray(payload[key].umpires)) return payload[key].umpires;
    if (payload[key] && Array.isArray(payload[key].data)) return payload[key].data;
  }
  return [];
}

function deriveRating(kRate, priorRating = null) {
  if (kRate == null) return priorRating ?? "neutral";
  if (kRate >= 22) return "pitcher";
  if (kRate <= 17) return "hitter";
  return "neutral";
}

function deriveTendency(kRate, rating, priorTendency = null) {
  if (kRate == null) return priorTendency ?? "Neutral zone — average strikeout environment";
  if (rating === "pitcher") return `Wide zone — ${kRate.toFixed(1)}% K rate boosts punchouts`;
  if (rating === "hitter") return `Tight zone — ${kRate.toFixed(1)}% K rate suppresses strikeouts`;
  return `Neutral zone — ${kRate.toFixed(1)}% K rate is close to league average`;
}

function mapRow(row, existingByName) {
  const name = row?.name ?? row?.fullName ?? row?.umpire?.name ?? row?.umpireName ?? row?.official?.fullName ?? null;
  if (!name) return null;

  const existing = existingByName[name]
    ?? existingByName[Object.keys(existingByName).find((key) => normalizeName(key) === normalizeName(name))]
    ?? {};

  const kRate = toNumber(row?.kRate ?? row?.k_rate ?? row?.strikeoutRate ?? row?.strikeout_rate ?? existing.kRate);
  const bbRate = toNumber(row?.bbRate ?? row?.bb_rate ?? row?.walkRate ?? row?.walk_rate ?? existing.bbRate);
  const rating = deriveRating(kRate, row?.rating ?? existing.rating ?? null);
  const tendency = row?.tendency ?? deriveTendency(kRate, rating, existing.tendency ?? null);

  return {
    name,
    games: toNumber(row?.games ?? row?.gameCount ?? existing.games) ?? existing.games ?? 0,
    calledPitches: toNumber(row?.calledPitches ?? row?.called_pitches ?? existing.calledPitches),
    correctCalls: toNumber(row?.correctCalls ?? row?.correct_calls ?? existing.correctCalls),
    incorrectCalls: toNumber(row?.incorrectCalls ?? row?.incorrect_calls ?? existing.incorrectCalls),
    expectedCorrectCalls: toNumber(row?.expectedCorrectCalls ?? row?.expected_correct_calls ?? existing.expectedCorrectCalls),
    correctCallsAboveExpected: toNumber(row?.correctCallsAboveExpected ?? row?.correct_calls_above_expected ?? existing.correctCallsAboveExpected),
    expectedIncorrectCalls: toNumber(row?.expectedIncorrectCalls ?? row?.expected_incorrect_calls ?? existing.expectedIncorrectCalls),
    overallAccuracy: toNumber(row?.overallAccuracy ?? row?.overall_accuracy ?? existing.overallAccuracy),
    expectedAccuracy: toNumber(row?.expectedAccuracy ?? row?.expected_accuracy ?? existing.expectedAccuracy),
    accuracyAboveExpected: toNumber(row?.accuracyAboveExpected ?? row?.accuracy_above_expected ?? existing.accuracyAboveExpected),
    consistency: toNumber(row?.consistency ?? existing.consistency),
    minAccuracy: toNumber(row?.minAccuracy ?? row?.min_accuracy ?? existing.minAccuracy),
    maxAccuracy: toNumber(row?.maxAccuracy ?? row?.max_accuracy ?? existing.maxAccuracy),
    averageRunImpact: toNumber(row?.averageRunImpact ?? row?.average_run_impact ?? existing.averageRunImpact),
    averageAbsoluteFavor: toNumber(row?.averageAbsoluteFavor ?? row?.average_absolute_favor ?? existing.averageAbsoluteFavor),
    challenges: toNumber(row?.challenges ?? existing.challenges),
    overturnedChallenges: toNumber(row?.overturnedChallenges ?? row?.overturned_challenges ?? existing.overturnedChallenges),
    successfulChallengeRate: toNumber(row?.successfulChallengeRate ?? row?.successful_challenge_rate ?? existing.successfulChallengeRate),
    weightedScore: toNumber(row?.weightedScore ?? row?.weighted_score ?? existing.weightedScore),
    kRate: kRate != null ? `${kRate.toFixed(1)}%` : existing.kRate ?? null,
    bbRate: bbRate != null ? `${bbRate.toFixed(1)}%` : existing.bbRate ?? null,
    tendency,
    rating,
  };
}

async function refreshUmpireData() {
  const existing = loadExisting();
  const existingByName = existing.umpiresByName ?? {};
  const { season, startDate, endDate, seasonType } = getSeasonWindow();

  console.log(`  → Job: refreshUmpireData  season=${season}`);
  const { data } = await axios.get("https://umpscorecards.com/api/umpires", {
    params: { startDate, endDate, seasonType },
    timeout: 20000,
    headers: {
      "User-Agent": "PropScout/1.0 (+https://ai-agent-mlb-production.up.railway.app)",
      Accept: "application/json,text/plain,*/*",
    },
  });

  const rows = flattenRows(data);
  if (!rows.length) throw new Error("No umpire rows returned from UmpScorecards");

  const umpiresByName = {};
  rows.forEach((row) => {
    const mapped = mapRow(row, existingByName);
    if (mapped?.name) umpiresByName[mapped.name] = mapped;
  });

  const payload = {
    source: existing.source ?? "umpscorecards",
    scrapedAt: new Date().toISOString(),
    season,
    seasonType,
    count: Object.keys(umpiresByName).length,
    umpiresByName,
  };

  fs.mkdirSync(path.dirname(UMPIRES_DATA_PATH), { recursive: true });
  fs.writeFileSync(UMPIRES_DATA_PATH, JSON.stringify(payload, null, 2));
  console.log(`  ✓ refreshUmpireData  umpires=${payload.count}`);
  return { count: payload.count, season, seasonType, scrapedAt: payload.scrapedAt };
}

module.exports = { refreshUmpireData };
