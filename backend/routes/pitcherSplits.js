const express = require("express");
const router  = require("express").Router();
const axios   = require("axios");
const cache   = require("../services/cache");

const SEASON   = new Date().getFullYear();
const TTL      = 6 * 60 * 60 * 1000; // 6 hours

const SAVANT_HEADERS = {
  "User-Agent":       "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":           "application/json, text/javascript, */*; q=0.01",
  "Accept-Language":  "en-US,en;q=0.9",
  "Referer":          "https://baseballsavant.mlb.com/",
  "X-Requested-With": "XMLHttpRequest",
};

const fmtAvg = (val) => {
  if (val <= 0) return ".000";
  return `.${String(Math.round(val * 1000)).padStart(3, "0")}`;
};

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

async function fetchPitcherVsHand(pitcherId, hand, year) {
  const url = [
    `https://baseballsavant.mlb.com/statcast_search/csv`,
    `?hfGT=R%7C`,
    `&hfSea=${year}%7C`,
    `&player_type=pitcher`,
    `&pitchers_lookup%5B%5D=${pitcherId}`,
    `&stand=${hand}`,
    `&type=details`,
    `&min_pitches=0`,
    `&min_results=0`,
  ].join("");

  console.log(`  → Savant pitcher splits  stand=${hand}  ${url.slice(0, 80)}…`);
  const res  = await axios.get(url, { headers: { ...SAVANT_HEADERS, Accept: "text/csv,*/*" }, timeout: 15000 });
  const rows = parseCSV(String(res.data));
  if (!rows.length || !rows[0].pitch_type) return null;

  let hits = 0, ab = 0, walks = 0, hbp = 0, k = 0;
  const HIT_EVENTS = new Set(["single", "double", "triple", "home_run"]);
  const K_EVENTS   = new Set(["strikeout", "strikeout_double_play"]);
  const OUT_EVENTS = new Set(["field_out", "grounded_into_double_play", "force_out", "double_play",
                              "fielders_choice", "fielders_choice_out", "other_out", "triple_play",
                              "sac_fly", "sac_bunt", "fielders_choice_out"]);

  rows.forEach(r => {
    const ev = (r.events || "").toLowerCase().trim();
    if (!ev) return; // non-terminal pitch
    if (HIT_EVENTS.has(ev))  { hits++; ab++; }
    else if (K_EVENTS.has(ev))  { ab++; k++; }
    else if (OUT_EVENTS.has(ev)) { ab++; }
    else if (ev === "walk")         { walks++; }
    else if (ev === "hit_by_pitch") { hbp++; }
  });

  const pa = ab + walks + hbp;
  if (pa < 15) return null; // too small a sample

  return {
    avg:   fmtAvg(ab > 0 ? hits / ab : 0),
    kPct:  `${pa > 0 ? Math.round((k    / pa) * 100) : 0}%`,
    bbPct: `${pa > 0 ? Math.round((walks / pa) * 100) : 0}%`,
    pa,
  };
}

// ── GET /api/pitcher-splits/:pitcherId ───────────────────────────────────
router.get("/:pitcherId", async (req, res) => {
  const { pitcherId } = req.params;
  const year      = parseInt(req.query.year ?? SEASON, 10);
  const cacheKey  = `splits:pitcher:${pitcherId}:${year}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  const yearsToTry = [year, year - 1];

  for (const candidateYear of yearsToTry) {
    try {
      const [vsL, vsR] = await Promise.all([
        fetchPitcherVsHand(pitcherId, "L", candidateYear).catch(() => null),
        fetchPitcherVsHand(pitcherId, "R", candidateYear).catch(() => null),
      ]);

      if (vsL || vsR) {
        const result = { pitcherId: parseInt(pitcherId), season: candidateYear, vsL, vsR };
        cache.set(cacheKey, result, TTL);
        res.setHeader("X-Cache", "MISS");
        console.log(`  ✓ Pitcher splits cached  pitcherId=${pitcherId} season=${candidateYear} vsL=${!!vsL} vsR=${!!vsR}`);
        return res.json(result);
      }
    } catch (err) {
      console.error(`  ✗ Pitcher splits failed  pitcherId=${pitcherId} year=${candidateYear}: ${err.message}`);
    }
  }

  return res.status(502).json({ error: "No platoon splits available", pitcherId });
});

module.exports = router;
