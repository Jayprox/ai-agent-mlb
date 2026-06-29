const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const cache   = require("../services/cache");

const SEASON     = new Date().getFullYear();
const SAVANT_TTL = 6 * 60 * 60 * 1000; // 6 hours

const num = (v, fallback = 0) => {
  if (v === null || v === undefined || v === "" || v === "null") return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
};

const fmtAvg = (val) => {
  if (val <= 0) return ".000";
  return `.${String(Math.round(val * 1000)).padStart(3, "0")}`;
};

const SAVANT_HEADERS = {
  "User-Agent":       "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":           "application/json, text/javascript, */*; q=0.01",
  "Accept-Language":  "en-US,en;q=0.9",
  "Referer":          "https://baseballsavant.mlb.com/",
  "X-Requested-With": "XMLHttpRequest",
};

// ─────────────────────────────────────────────
// Statcast CSV — batter perspective
// ─────────────────────────────────────────────
function parseCSV(text) {
  const cleaned = String(text || "").replace(/^\uFEFF/, "").trim();
  const lines = cleaned.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map(line => {
    const values = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { values.push(cur.trim()); cur = ""; } else cur += ch;
    }
    values.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Matchup label helpers — same thresholds as frontend computePitchMatchupGood /
// computePitchMatchupNote so clients can read pre-computed values directly.
// ─────────────────────────────────────────────────────────────────────────────
function pitchMatchupGood(avg, whiff) {
  const a = parseFloat(avg) || 0;
  const w = parseFloat(whiff) || 0;
  if (a >= 0.280 && w < 25) return true;
  if (a <= 0.215 || w >= 35) return false;
  return null;
}

function pitchMatchupNote(abbr, avg, whiff) {
  const a = parseFloat(avg) || 0;
  const w = parseFloat(whiff) || 0;
  if (a >= 0.300 && w < 20) return `Elite contact vs ${abbr}`;
  if (a >= 0.280)            return `Solid contact rate vs ${abbr}`;
  if (a <= 0.180 || w >= 40) return `Severe weakness vs ${abbr} — high K exposure`;
  if (a <= 0.215)            return `Weak contact vs ${abbr}`;
  if (w >= 30)               return `High whiff rate (${Math.round(w)}%) — chases out of zone`;
  return `Average results vs ${abbr}`;
}

async function fetchFromCSV(batterId, year) {
  const url = [
    `https://baseballsavant.mlb.com/statcast_search/csv`,
    `?hfGT=R%7C`,
    `&hfSea=${year}%7C`,
    `&player_type=batter`,
    `&batters_lookup%5B%5D=${batterId}`,
    `&group_by=pitch-type`,
    `&sort_col=pitches`,
    `&sort_order=desc`,
    `&min_pitches=0`,
    `&min_results=0`,
    `&type=details`,
    `&player_id=${batterId}`,
  ].join("");
  console.log(`  → Savant batter CSV  ${url}`);

  const res  = await axios.get(url, { headers: { ...SAVANT_HEADERS, Accept: "text/csv,*/*" }, timeout: 15000 });
  const rows = parseCSV(String(res.data));
  if (!rows.length || !rows[0].pitch_type) {
    console.log(`  · Savant batter CSV returned no usable rows  batterId=${batterId} year=${year}`);
    return null;
  }

  console.log(`  ✓ Savant batter CSV  batterId=${batterId} rows=${rows.length}`);

  const byType = {};
  rows.forEach(r => {
    const abbr = (r.pitch_type || "").trim().toUpperCase();
    if (!abbr || abbr === "PO") return;
    if (!byType[abbr]) byType[abbr] = { abbr, pitches: 0, swings: 0, whiffs: 0, hits: 0, ab: 0, tb: 0 };
    const e = byType[abbr];
    e.pitches++;

    const desc  = (r.description || "").toLowerCase();
    const swing = ["swinging_strike","swinging_strike_blocked","foul","foul_bunt","missed_bunt","hit_into_play","foul_tip"].some(d => desc.includes(d));
    const whiff = ["swinging_strike","swinging_strike_blocked","missed_bunt"].some(d => desc.includes(d));
    if (swing) e.swings++;
    if (whiff) e.whiffs++;

    const ev = (r.events || "").toLowerCase();
    if (ev === "single")       { e.hits++; e.ab++; e.tb += 1; }
    else if (ev === "double")  { e.hits++; e.ab++; e.tb += 2; }
    else if (ev === "triple")  { e.hits++; e.ab++; e.tb += 3; }
    else if (ev === "home_run"){ e.hits++; e.ab++; e.tb += 4; }
    else if (["field_out","strikeout","grounded_into_double_play","force_out","double_play","fielders_choice","fielders_choice_out","strikeout_double_play","other_out","triple_play"].includes(ev)) e.ab++;
  });

  const splits = {};
  Object.values(byType)
    .filter(p => p.pitches >= 10)
    .forEach(p => {
      const avg   = fmtAvg(p.ab > 0 ? p.hits / p.ab : 0);
      const whiff = `${p.swings > 0 ? Math.round((p.whiffs / p.swings) * 100) : 0}%`;
      const slg   = fmtAvg(p.ab > 0 ? p.tb / p.ab : 0);
      const good  = pitchMatchupGood(avg, whiff);
      splits[p.abbr] = {
        avg,
        whiff,
        slg,
        pitches: p.pitches,
        // Pre-computed label and note so clients don't need to recompute
        label: good === true ? "HANDLES" : good === false ? "WEAK SPOT" : "NEUTRAL",
        note:  pitchMatchupNote(p.abbr, avg, whiff),
      };
    });

  return Object.keys(splits).length ? splits : null;
}

// ─────────────────────────────────────────────
// ROUTE: GET /api/splits/:batterId
// ─────────────────────────────────────────────
router.get("/:batterId", async (req, res) => {
  const { batterId } = req.params;
  const year     = parseInt(req.query.year ?? SEASON, 10);
  const cacheKey = `splits:batter:${batterId}:${year}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  let splits = null;
  let source  = null;
  let resolvedYear = year;
  const yearsToTry = year > 2008 ? [year, year - 1] : [year];

  for (const candidateYear of yearsToTry) {
    try {
      splits = await fetchFromCSV(batterId, candidateYear);
      if (splits) {
        resolvedYear = candidateYear;
        source = candidateYear === year ? "statcast_csv" : "statcast_csv_prev_season";
        break;
      }
    } catch (err) {
      console.error(`  ✗ Batter splits CSV failed for ${batterId} year=${candidateYear}: ${err.message}`);
    }
  }

  if (!splits) {
    return res.status(502).json({ error: "Baseball Savant unavailable", batterId });
  }

  const result = { batterId: parseInt(batterId), season: resolvedYear, source, splits };
  cache.set(cacheKey, result, SAVANT_TTL);
  res.setHeader("X-Cache", "MISS");
  console.log(`  ✓ Batter splits cached  batterId=${batterId} source=${source} season=${resolvedYear} types=${Object.keys(splits).join(",")}`);
  res.json(result);
});

module.exports = router;

// Programmatic export for use by other routes (e.g. lineups.js)
// Returns the splits map { FF: { avg, whiff, slg }, ... } or null.
// Tries current season, falls back to previous season automatically.
module.exports.fetchBatterPitchSplits = async (batterId) => {
  if (!batterId) return null;
  const yearsToTry = [SEASON, SEASON - 1];
  for (const year of yearsToTry) {
    const cacheKey = `splits:batter:${batterId}:${year}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached.splits ?? null;
    try {
      const splits = await fetchFromCSV(batterId, year);
      if (splits) {
        cache.set(cacheKey, { batterId: parseInt(batterId, 10), season: year, splits }, SAVANT_TTL);
        return splits;
      }
    } catch (err) {
      console.warn(`  · fetchBatterPitchSplits failed  batterId=${batterId} year=${year}: ${err.message}`);
    }
  }
  return null;
};
