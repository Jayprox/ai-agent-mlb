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
// STRATEGY 1: Baseball Savant arsenal-scores with type=batter
// Returns batter's run value (and sometimes BA/whiff) vs each pitch type.
// ─────────────────────────────────────────────
async function fetchFromArsenalScores(batterId, year) {
  const url = `https://baseballsavant.mlb.com/player-services/arsenal-scores?playerId=${batterId}&year=${year}&type=batter`;
  console.log(`  → Savant batter arsenal-scores  ${url}`);

  const res  = await axios.get(url, { headers: SAVANT_HEADERS, timeout: 10000 });
  const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);

  if (!rows.length) return null;

  console.log(`  ✓ Savant batter splits  batterId=${batterId} rows=${rows.length} fields=${Object.keys(rows[0]).join("|")}`);

  const splits = {};
  rows
    .filter(r => r.pitch_type && r.pitch_type !== "PO")
    .forEach(r => {
      const abbr  = String(r.pitch_type).toUpperCase();
      const ba    = num(r.ba    ?? r.avg ?? r.batting_average, -1);
      const slg   = num(r.slg  ?? r.slg_percent, -1);
      const whiff = num(r.whiff_percent ?? r.whiff_pct, -1);

      // Only include if we have at least one meaningful stat
      if (ba < 0 && slg < 0 && whiff < 0) return;

      splits[abbr] = {
        avg:     ba    >= 0 ? fmtAvg(ba)            : ".000",
        whiff:   whiff >= 0 ? `${Math.round(whiff)}%` : "0%",
        slg:     slg   >= 0 ? fmtAvg(slg)           : ".000",
        pitches: num(r.pitches ?? r.pa, 0),
      };
    });

  return Object.keys(splits).length ? splits : null;
}

// ─────────────────────────────────────────────
// STRATEGY 2: Statcast CSV — batter perspective
// ─────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
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

async function fetchFromCSV(batterId, year) {
  const url = [
    `https://baseballsavant.mlb.com/statcast_search/csv`,
    `?hfGT=R%7C`,
    `&hfSea=${year}%7C`,
    `&player_type=batter`,
    `&batters_lookup%5B%5D=${batterId}`,
    `&sort_col=pitches`,
    `&sort_order=desc`,
    `&min_pitches=0`,
    `&min_results=0`,
    `&type=details`,
  ].join("");
  console.log(`  → Savant batter CSV  ${url}`);

  const res  = await axios.get(url, { headers: { ...SAVANT_HEADERS, Accept: "text/csv,*/*" }, timeout: 15000 });
  const rows = parseCSV(String(res.data));
  if (!rows.length || !rows[0].pitch_type) return null;

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
      splits[p.abbr] = {
        avg:     fmtAvg(p.ab > 0 ? p.hits / p.ab : 0),
        whiff:   `${p.swings > 0 ? Math.round((p.whiffs / p.swings) * 100) : 0}%`,
        slg:     fmtAvg(p.ab > 0 ? p.tb / p.ab : 0),
        pitches: p.pitches,
      };
    });

  return Object.keys(splits).length ? splits : null;
}

// ─────────────────────────────────────────────
// ROUTE: GET /api/splits/:batterId
// ─────────────────────────────────────────────
router.get("/:batterId", async (req, res) => {
  const { batterId } = req.params;
  const year     = req.query.year ?? SEASON;
  const cacheKey = `splits:batter:${batterId}:${year}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  let splits = null;
  let source  = null;

  // Strategy 1: arsenal-scores JSON (fast)
  try {
    splits = await fetchFromArsenalScores(batterId, year);
    if (splits) source = "arsenal_scores_json";
  } catch (err) {
    console.warn(`  ⚠ batter arsenal-scores failed for ${batterId}: ${err.message} — trying CSV`);
  }

  // Strategy 2: statcast CSV fallback
  if (!splits) {
    try {
      splits = await fetchFromCSV(batterId, year);
      if (splits) source = "statcast_csv";
    } catch (err) {
      console.error(`  ✗ Batter splits CSV also failed for ${batterId}: ${err.message}`);
    }
  }

  if (!splits) {
    return res.status(502).json({ error: "Baseball Savant unavailable — both strategies failed", batterId });
  }

  const result = { batterId: parseInt(batterId), season: year, source, splits };
  cache.set(cacheKey, result, SAVANT_TTL);
  res.setHeader("X-Cache", "MISS");
  console.log(`  ✓ Batter splits cached  batterId=${batterId} source=${source} types=${Object.keys(splits).join(",")}`);
  res.json(result);
});

module.exports = router;
