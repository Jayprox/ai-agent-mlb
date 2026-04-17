const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const cache   = require("../services/cache");

const SEASON     = new Date().getFullYear();
const SAVANT_TTL = 6 * 60 * 60 * 1000; // 6 hours
const PREV_VELO_TTL = 24 * 60 * 60 * 1000; // 24 hours

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
// Baseball Savant statcast CSV (ungrouped, aggregate manually)
// Uses the current export shape from the live Statcast Search page.
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

async function fetchCSVRows(pitcherId, year) {
  const url = [
    `https://baseballsavant.mlb.com/statcast_search/csv`,
    `?hfGT=R%7C`,
    `&hfSea=${year}%7C`,
    `&player_type=pitcher`,
    `&pitchers_lookup%5B%5D=${pitcherId}`,
    `&group_by=pitch-type`,
    `&sort_col=pitches`,
    `&sort_order=desc`,
    `&min_pitches=0`,
    `&min_results=0`,
    `&type=details`,
    `&player_id=${pitcherId}`,
  ].join("");
  console.log(`  → Savant CSV  ${url}`);

  const res = await axios.get(url, {
    headers: { ...SAVANT_HEADERS, Accept: "text/csv,*/*" },
    timeout: 15000,
  });

  const rows = parseCSV(String(res.data));
  if (!rows.length || !rows[0].pitch_type) {
    console.log(`  · Savant CSV returned no usable rows  pitcherId=${pitcherId} year=${year}`);
    return null;
  }

  console.log(`  ✓ Savant CSV  pitcherId=${pitcherId} rows=${rows.length} cols=${Object.keys(rows[0]).join("|")}`);
  return rows;
}

function buildArsenalFromRows(rows) {
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

function buildPrevVeloMap(rows) {
  const byType = {};

  rows.forEach(r => {
    const abbr = (r.pitch_type || "").trim().toUpperCase();
    if (!abbr || abbr === "PO") return;
    if (!byType[abbr]) byType[abbr] = { veloSum: 0, veloN: 0 };

    const velo = num(r.release_speed || r.effective_speed, 0);
    if (velo > 60) {
      byType[abbr].veloSum += velo;
      byType[abbr].veloN++;
    }
  });

  return Object.fromEntries(
    Object.entries(byType).map(([abbr, entry]) => [
      abbr,
      entry.veloN > 0 ? parseFloat((entry.veloSum / entry.veloN).toFixed(1)) : null,
    ])
  );
}

// ─────────────────────────────────────────────
// ROUTE: GET /api/arsenal/:pitcherId
// ─────────────────────────────────────────────
router.get("/:pitcherId", async (req, res) => {
  const { pitcherId } = req.params;
  const year     = parseInt(req.query.year ?? SEASON, 10);
  const cacheKey = `arsenal:pitcher:${pitcherId}:${year}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  let arsenal = null;
  let source  = null;
  let resolvedYear = year;
  const yearsToTry = year > 2008 ? [year, year - 1] : [year];

  for (const candidateYear of yearsToTry) {
    try {
      const rows = await fetchCSVRows(pitcherId, candidateYear);
      arsenal = rows ? buildArsenalFromRows(rows) : null;
      if (arsenal) {
        resolvedYear = candidateYear;
        source = candidateYear === year ? "statcast_csv" : "statcast_csv_prev_season";
        break;
      }
    } catch (err) {
      console.error(`  ✗ Savant CSV failed for ${pitcherId} year=${candidateYear}: ${err.message}`);
    }
  }

  if (!arsenal) {
    return res.status(502).json({ error: "Baseball Savant unavailable", pitcherId });
  }

  const prevCacheKey = `arsenal:${pitcherId}:prev`;
  let prevCache = cache.get(prevCacheKey);
  let prevVeloMap = null;
  const prevYear = resolvedYear - 1;

  if (prevCache?.season === prevYear) {
    prevVeloMap = prevCache.map ?? null;
  } else {
    try {
      const prevRows = await fetchCSVRows(pitcherId, prevYear);
      prevVeloMap = prevRows ? buildPrevVeloMap(prevRows) : null;
      cache.set(prevCacheKey, { season: prevYear, map: prevVeloMap }, PREV_VELO_TTL);
    } catch (err) {
      console.warn(`  · Savant prev velo skipped for ${pitcherId} year=${prevYear}: ${err.message}`);
      prevVeloMap = null;
    }
  }

  arsenal = arsenal.map(pitch => ({
    ...pitch,
    prevVelo: prevVeloMap?.[pitch.abbr] ?? null,
  }));

  const result = { pitcherId: parseInt(pitcherId), season: resolvedYear, source, arsenal };
  cache.set(cacheKey, result, SAVANT_TTL);
  res.setHeader("X-Cache", "MISS");
  console.log(`  ✓ Arsenal cached  pitcherId=${pitcherId} source=${source} season=${resolvedYear} pitches=${arsenal.length}`);
  res.json(result);
});

module.exports = router;
