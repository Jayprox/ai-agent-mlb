/**
 * GET /api/pitcher-splits/:pitcherId
 *
 * Returns a pitcher's splits sourced from the MLB Stats API statSplits
 * endpoint — shaped for the iOS pitcher card UI.
 *
 * Response shape (iOS-compatible):
 * {
 *   pitcherId: number,
 *   season:    number,
 *   vsLeft:    { avg, ops, k9, bb9 } | null,   ← vs left-handed hitters
 *   vsRight:   { avg, ops, k9, bb9 } | null,   ← vs right-handed hitters
 *   vsL:       <alias for vsLeft>,              ← backward-compat
 *   vsR:       <alias for vsRight>,
 *   home:      { era, whip, ip, k9, bb9 } | null,
 *   away:      { era, whip, ip, k9, bb9 } | null,
 *   dayGame:   { era, whip, ip, k9, bb9 } | null,
 *   nightGame: { era, whip, ip, k9, bb9 } | null,
 * }
 *
 * All stat values are strings. k9 and bb9 are computed from strikeOuts /
 * baseOnBalls counts and inningsPitched returned by the MLB API.
 */

const express = require("express");
const router  = express.Router();
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");

const SEASON   = new Date().getFullYear();
const TTL      = 6 * 60 * 60 * 1000;  // 6 hours
const MISS_TTL = 30 * 60 * 1000;      // 30 min for "no data" entries

// Parse MLB inningsPitched string ("45.1" = 45⅓ innings = 45.333...)
function parseIP(ip) {
  if (!ip) return 0;
  const [whole, outs] = String(ip).split(".");
  return parseInt(whole, 10) + (parseInt(outs ?? 0, 10) / 3);
}

// Format a decimal rate to one decimal place, or "—" if not finite.
function fmtRate(val) {
  return isFinite(val) ? val.toFixed(1) : "—";
}

// Prefix with "." if MLB returned a bare number like "724" instead of ".724"
function fmt3(v) {
  if (!v || v === "---" || v === ".---") return "—";
  const s = String(v);
  return s.startsWith(".") ? s : `.${s}`;
}

// Shape a raw MLB API stat block into the iOS SplitLine struct (platoon).
function formatPlatoonLine(stat) {
  if (!stat) return null;
  const ip  = parseIP(stat.inningsPitched);
  const k9  = ip > 0 ? fmtRate((stat.strikeOuts  ?? 0) / ip * 9) : "—";
  const bb9 = ip > 0 ? fmtRate((stat.baseOnBalls ?? 0) / ip * 9) : "—";

  // Opponent OPS: prefer the field if present, else derive from obp + slg
  let ops = stat.ops ?? null;
  if (!ops && stat.obp && stat.slg) {
    const derived = parseFloat(stat.obp) + parseFloat(stat.slg);
    ops = isFinite(derived) ? derived.toFixed(3) : null;
  }

  return {
    avg: fmt3(stat.avg),
    ops: fmt3(ops),
    k9,
    bb9,
  };
}

// Shape a raw MLB API stat block into the iOS GameSiteSplits struct (home/away/day/night).
function formatGameSiteLine(stat) {
  if (!stat) return null;
  const ip  = parseIP(stat.inningsPitched);
  const k9  = ip > 0 ? fmtRate((stat.strikeOuts  ?? 0) / ip * 9) : "—";
  const bb9 = ip > 0 ? fmtRate((stat.baseOnBalls ?? 0) / ip * 9) : "—";

  // Require at least 5 IP to return a meaningful split
  if (ip < 5) return null;

  return {
    era:  stat.era  ?? "—",
    whip: stat.whip ?? "—",
    ip:   stat.inningsPitched ?? "—",
    k9,
    bb9,
  };
}

// ── Core fetch ────────────────────────────────────────────────────────────
async function fetchPitcherSplitsFromMlb(pitcherId, season) {
  const { data } = await mlb.get(`/people/${pitcherId}/stats`, {
    params: {
      stats:    "statSplits",
      group:    "pitching",
      season,
      sitCodes: "vl,vr,h,a,d,n",
    },
  });

  // MLB may return multiple stat blocks — pick the one with the most splits
  const allStats = data.stats ?? [];
  let splits = [];
  for (const block of allStats) {
    if ((block.splits ?? []).length > splits.length) splits = block.splits;
  }

  if (!splits.length) return null;

  const matchSplit = (candidates) => {
    const found = splits.find(sp => {
      const code = (sp.split?.code ?? "").toLowerCase();
      const desc = (sp.split?.description ?? "").toLowerCase();
      return candidates.some(c => code === c || desc.includes(c));
    });
    return found?.stat ?? null;
  };

  const vsLeft   = formatPlatoonLine(matchSplit(["vl", "vs. left",  "vs left",  "left"]));
  const vsRight  = formatPlatoonLine(matchSplit(["vr", "vs. right", "vs right", "right"]));
  const home     = formatGameSiteLine(matchSplit(["h",  "home"]));
  const away     = formatGameSiteLine(matchSplit(["a",  "away"]));
  const dayGame  = formatGameSiteLine(matchSplit(["d",  "day"]));
  const nightGame = formatGameSiteLine(matchSplit(["n",  "night"]));

  // Require at least platoon splits to count as a valid result
  if (!vsLeft && !vsRight) return null;

  return { vsLeft, vsRight, home, away, dayGame, nightGame };
}

// ── GET /api/pitcher-splits/:pitcherId ───────────────────────────────────
router.get("/:pitcherId", async (req, res) => {
  const { pitcherId } = req.params;
  const season    = parseInt(req.query.season ?? SEASON, 10);
  const cacheKey  = `splits:pitcher:mlb:${pitcherId}:${season}`;

  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    res.setHeader("X-Cache", "HIT");
    if (cached === null) return res.status(502).json({ error: "No platoon splits available", pitcherId });
    return res.json(cached);
  }

  const yearsToTry = [season, season - 1];

  for (const yr of yearsToTry) {
    try {
      const splits = await fetchPitcherSplitsFromMlb(pitcherId, yr);
      if (splits) {
        const result = {
          pitcherId:  parseInt(pitcherId),
          season:     yr,
          vsLeft:     splits.vsLeft,
          vsRight:    splits.vsRight,
          vsL:        splits.vsLeft,   // backward-compat alias
          vsR:        splits.vsRight,  // backward-compat alias
          home:       splits.home,
          away:       splits.away,
          dayGame:    splits.dayGame,
          nightGame:  splits.nightGame,
        };
        cache.set(cacheKey, result, TTL);
        res.setHeader("X-Cache", "MISS");
        console.log(
          `  ✓ Pitcher splits (MLB)  pitcherId=${pitcherId} season=${yr}` +
          `  vsL=${!!splits.vsLeft} vsR=${!!splits.vsRight}` +
          `  home=${!!splits.home} away=${!!splits.away}` +
          `  day=${!!splits.dayGame} night=${!!splits.nightGame}`
        );
        return res.json(result);
      }
      console.log(`  · No splits for pitcherId=${pitcherId} season=${yr}`);
    } catch (err) {
      console.error(`  ✗ Pitcher splits failed  pitcherId=${pitcherId} year=${yr}: ${err.message}`);
    }
  }

  cache.set(cacheKey, null, MISS_TTL);
  return res.status(502).json({ error: "No platoon splits available", pitcherId });
});

module.exports = router;

// Exported for use by pre-warming jobs
module.exports.buildPitcherSplitsForJob = async (pitcherId, season = SEASON) => {
  const yearsToTry = [season, season - 1];
  for (const yr of yearsToTry) {
    try {
      const splits = await fetchPitcherSplitsFromMlb(pitcherId, yr);
      if (splits) {
        return {
          pitcherId:  parseInt(pitcherId),
          season:     yr,
          vsLeft:     splits.vsLeft,
          vsRight:    splits.vsRight,
          vsL:        splits.vsLeft,
          vsR:        splits.vsRight,
          home:       splits.home,
          away:       splits.away,
          dayGame:    splits.dayGame,
          nightGame:  splits.nightGame,
        };
      }
    } catch {
      // try next year
    }
  }
  return null;
};
