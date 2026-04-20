const express = require("express");
const router  = express.Router();
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");

const SEASON = new Date().getFullYear();
const TTL    = 6 * 60 * 60 * 1000; // 6 hours

// Primary: match by split.code. Fallback: match by description keyword.
// MLB Stats API codes are not always consistent across seasons.
const CODE_MAP = {
  home:  ["h",  "home"],
  away:  ["a",  "away"],
  vsL:   ["vl", "vl", "vs. left", "vs left", "left-handed pitcher", "left-handed batter"],
  vsR:   ["vr", "vr", "vs. right", "vs right", "right-handed pitcher", "right-handed batter"],
  day:   ["d",  "day"],
  night: ["n",  "night"],
};

const matchSplit = (split, candidates) => {
  const code = (split?.code ?? "").toLowerCase();
  const desc = (split?.description ?? "").toLowerCase();
  return candidates.some(c => code === c || desc.includes(c));
};

// Normalise a stat object to just the fields we display.
// Pitching: era, whip, avg (against), k, bb, ip
// Hitting:  avg, obp, slg, ops, hr, bb, k, ab
const normalise = (stat, group) => {
  if (!stat) return null;
  if (group === "pitching") {
    return {
      era:  stat.era  ?? "—",
      whip: stat.whip ?? "—",
      avg:  stat.avg  ?? "—",
      k:    stat.strikeOuts  ?? 0,
      bb:   stat.baseOnBalls ?? 0,
      ip:   stat.inningsPitched ?? "0.0",
    };
  }
  return {
    avg: stat.avg ?? "—",
    obp: stat.obp ?? "—",
    slg: stat.slg ?? "—",
    ops: stat.ops ?? "—",
    hr:  stat.homeRuns    ?? 0,
    bb:  stat.baseOnBalls ?? 0,
    k:   stat.strikeOuts  ?? 0,
    ab:  stat.atBats      ?? 0,
  };
};

// ── GET /api/stat-splits/:playerId?group=pitching|hitting ─────────────────
router.get("/:playerId", async (req, res) => {
  const { playerId } = req.params;
  const group    = req.query.group === "pitching" ? "pitching" : "hitting";
  const season   = parseInt(req.query.season ?? SEASON, 10);
  const cacheKey = `stat-splits:${playerId}:${group}:${season}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  const yearsToTry = [season, season - 1];

  for (const yr of yearsToTry) {
    try {
      const { data } = await mlb.get(`/people/${playerId}/stats`, {
        params: {
          stats:    "statSplits",
          group,
          season:   yr,
          sitCodes: "h,a,vl,vr,d,n", // explicitly request the splits we want
        },
      });

      // MLB API may return multiple stat objects — search all of them
      const allStats = data.stats ?? [];
      console.log(`  · statSplits  playerId=${playerId} group=${group} season=${yr}  stat blocks=${allStats.length}`);

      let splits = [];
      for (const block of allStats) {
        if ((block.splits ?? []).length > splits.length) splits = block.splits;
      }

      if (!splits.length) {
        console.log(`  · No splits returned for playerId=${playerId} season=${yr}`);
        continue;
      }

      // Log the first few for debugging
      splits.slice(0, 6).forEach(s =>
        console.log(`    split: code=${s.split?.code} desc="${s.split?.description}"`)
      );

      // Build result by matching code OR description
      const find = (candidates) => {
        const s = splits.find(sp => matchSplit(sp.split, candidates));
        return normalise(s?.stat ?? null, group);
      };

      const result = {
        playerId: parseInt(playerId),
        group,
        season: yr,
        home:  find(CODE_MAP.home),
        away:  find(CODE_MAP.away),
        vsL:   find(CODE_MAP.vsL),
        vsR:   find(CODE_MAP.vsR),
        day:   find(CODE_MAP.day),
        night: find(CODE_MAP.night),
      };

      // Only cache if we got at least one split
      const hasData = Object.values(result).some(v => v && typeof v === "object");
      if (!hasData) {
        console.log(`  · Splits returned but none matched known codes — skipping`);
        continue;
      }

      cache.set(cacheKey, result, TTL);
      res.setHeader("X-Cache", "MISS");
      console.log(`  ✓ Stat splits  playerId=${playerId} group=${group} season=${yr}`);
      return res.json(result);

    } catch (err) {
      console.error(`  ✗ Stat splits failed  playerId=${playerId} season=${yr}: ${err.message}`);
    }
  }

  return res.status(502).json({ error: "Stat splits unavailable", playerId });
});

module.exports = router;
