const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const cache   = require("../services/cache");

const SEASON     = new Date().getFullYear();
const SAVANT_TTL = 6 * 60 * 60 * 1000; // 6 hours

// ─────────────────────────────────────────────
// PITCH TYPE METADATA
// Savant abbreviation → display name + card color
// ─────────────────────────────────────────────
const PITCH_META = {
  FF: { type: "4-Seam Fastball", color: "#f97316" },
  FA: { type: "4-Seam Fastball", color: "#f97316" },
  SI: { type: "Sinker",          color: "#facc15" },
  FC: { type: "Cutter",          color: "#a78bfa" },
  SL: { type: "Slider",          color: "#38bdf8" },
  ST: { type: "Sweeper",         color: "#60a5fa" },
  CU: { type: "Curveball",       color: "#c084fc" },
  KC: { type: "Knuckle-Curve",   color: "#f472b6" },
  CH: { type: "Changeup",        color: "#4ade80" },
  FS: { type: "Splitter",        color: "#fb7185" },
  FO: { type: "Forkball",        color: "#fb923c" },
  SC: { type: "Screwball",       color: "#a3e635" },
  SV: { type: "Slurve",          color: "#a3e635" },
  CS: { type: "Slow Curve",      color: "#d8b4fe" },
  KN: { type: "Knuckleball",     color: "#94a3b8" },
  EP: { type: "Eephus",          color: "#94a3b8" },
};

const num = (v, fallback = 0) => {
  if (v === null || v === undefined || v === "" || v === "null") return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
};

const SAVANT_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer":         "https://baseballsavant.mlb.com/",
  "X-Requested-With": "XMLHttpRequest",
};

// ─────────────────────────────────────────────
// STRATEGY 1: Baseball Savant arsenal-scores JSON
// This is the lightest, most reliable Savant endpoint.
// Returns JSON (not CSV) with one object per pitch type.
//
// Sample field names (vary slightly by year):
//   pitch_type, pitch_name, pitches, pa, avg_speed,
//   pitch_percent, whiff_percent, put_away_percent, ba, slg, run_value_per_100
// ─────────────────────────────────────────────
async function fetchFromArsenalScores(pitcherId, year) {
  const url = `https://baseballsavant.mlb.com/player-services/arsenal-scores?playerId=${pitcherId}&year=${year}&type=pitcher`;
  console.log(`  → Savant arsenal-scores  ${url}`);

  const res = await axios.get(url, { headers: SAVANT_HEADERS, timeout: 10000 });

  // Response shape: { data: [...] } or raw array
  const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);

  if (!rows.length) return null;

  // Log field names on first successful call for schema verification
  console.log(`  ✓ Savant arsenal-scores  pitcherId=${pitcherId} rows=${rows.length} fields=${Object.keys(rows[0]).join("|")}`);

  let totalPct = 0;
  const arsenal = rows
    .filter(r => r.pitch_type && r.pitch_type !== "PO")
    .map(r => {
      const abbr     = String(r.pitch_type).toUpperCase();
      const meta     = PITCH_META[abbr] ?? { type: r.pitch_name ?? abbr, color: "#9ca3af" };
      const pct      = num(r.pitch_percent, 0);
      const velo     = num(r.avg_speed, 0);
      const whiffPct = num(r.whiff_percent, null);
      const ba       = num(r.ba, null);
      const slg      = num(r.slg ?? r.slg_percent, null);
      totalPct += pct;
      return {
        abbr,
        type:     meta.type,
        pct:      Math.round(pct),
        velo:     velo > 0 ? velo.toFixed(1) : null,
        whiffPct: whiffPct != null ? Math.round(whiffPct) : null,
        ba:       ba != null && ba > 0 ? ba.toFixed(3) : null,
        slg:      slg != null && slg > 0 ? slg.toFixed(3) : null,
        color:    meta.color,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  return arsenal.length ? arsenal : null;
}

// ─────────────────────────────────────────────
// STRATEGY 2: Baseball Savant statcast CSV (ungrouped, aggregate manually)
// Fallback if arsenal-scores fails. Fetches raw pitch rows and aggregates.
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

async function fetchFromCSV(pitcherId, year) {
  // Use ungrouped CSV — smaller request by limiting to one team/pitcher
  const url = [
    `https://baseballsavant.mlb.com/statcast_search/csv`,
    `?hfGT=R%7C`,
    `&hfSea=${year}%7C`,
    `&player_type=pitcher`,
    `&pitchers_lookup%5B%5D=${pitcherId}`,
    `&sort_col=pitches`,
    `&sort_order=desc`,
    `&min_pitches=0`,
    `&min_results=0`,
    `&type=details`,
  ].join("");
  console.log(`  → Savant CSV  ${url}`);

  const res = await axios.get(url, {
    headers: { ...SAVANT_HEADERS, Accept: "text/csv,*/*" },
    timeout: 15000,
  });

  const rows = parseCSV(String(res.data));
  if (!rows.length || !rows[0].pitch_type) return null;

  console.log(`  ✓ Savant CSV  pitcherId=${pitcherId} rows=${rows.length} cols=${Object.keys(rows[0]).join("|")}`);

  // Aggregate individual pitch rows by pitch type
  const byType = {};
  let totalPitches = 0;

  rows.forEach(r => {
    const abbr = (r.pitch_type || "").trim().toUpperCase();
    if (!abbr || abbr === "PO") return;
    if (!byType[abbr]) byType[abbr] = { abbr, pitches: 0, veloSum: 0, veloN: 0, swings: 0, whiffs: 0, hits: 0, ab: 0, tb: 0 };
    const e = byType[abbr];
    e.pitches++;
    totalPitches++;

    const velo = num(r.release_speed || r.effective_speed, 0);
    if (velo > 60) { e.veloSum += velo; e.veloN++; }

    const desc = (r.description || "").toLowerCase();
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

  const arsenal = Object.values(byType)
    .filter(p => p.pitches >= 10)
    .map(p => {
      const meta = PITCH_META[p.abbr] ?? { type: p.abbr, color: "#9ca3af" };
      const pct  = totalPitches > 0 ? Math.round((p.pitches / totalPitches) * 100) : 0;
      return {
        abbr: p.abbr,
        type: meta.type,
        pct,
        velo:     p.veloN > 0 ? (p.veloSum / p.veloN).toFixed(1) : null,
        whiffPct: p.swings > 0 ? Math.round((p.whiffs / p.swings) * 100) : null,
        ba:       p.ab > 0 ? (p.hits / p.ab).toFixed(3) : null,
        slg:      p.ab > 0 ? (p.tb   / p.ab).toFixed(3) : null,
        color:    meta.color,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  return arsenal.length ? arsenal : null;
}

// ─────────────────────────────────────────────
// ROUTE: GET /api/arsenal/:pitcherId
// ─────────────────────────────────────────────
router.get("/:pitcherId", async (req, res) => {
  const { pitcherId } = req.params;
  const year     = req.query.year ?? SEASON;
  const cacheKey = `arsenal:pitcher:${pitcherId}:${year}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  let arsenal = null;
  let source  = null;

  // Strategy 1: arsenal-scores JSON (fast, clean)
  try {
    arsenal = await fetchFromArsenalScores(pitcherId, year);
    if (arsenal) source = "arsenal_scores_json";
  } catch (err) {
    console.warn(`  ⚠ arsenal-scores failed for ${pitcherId}: ${err.message} — trying CSV fallback`);
  }

  // Strategy 2: statcast CSV fallback
  if (!arsenal) {
    try {
      arsenal = await fetchFromCSV(pitcherId, year);
      if (arsenal) source = "statcast_csv";
    } catch (err) {
      console.error(`  ✗ CSV fallback also failed for ${pitcherId}: ${err.message}`);
    }
  }

  if (!arsenal) {
    return res.status(502).json({ error: "Baseball Savant unavailable — both strategies failed", pitcherId });
  }

  const result = { pitcherId: parseInt(pitcherId), season: year, source, arsenal };
  cache.set(cacheKey, result, SAVANT_TTL);
  res.setHeader("X-Cache", "MISS");
  console.log(`  ✓ Arsenal cached  pitcherId=${pitcherId} source=${source} pitches=${arsenal.length}`);
  res.json(result);
});

module.exports = router;
