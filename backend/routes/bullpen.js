const express = require("express");
const router  = express.Router();
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");

const SEASON      = new Date().getFullYear();
const BULLPEN_TTL = 30 * 60 * 1000; // 30 min — refresh before game

// ── Helpers ──────────────────────────────────────────────────
const gradeFromEra = (era) => {
  const e = parseFloat(era) || 5.00;
  if (e < 3.00) return { grade: "A",  gradeColor: "#22c55e" };
  if (e < 3.50) return { grade: "B+", gradeColor: "#22c55e" };
  if (e < 4.00) return { grade: "B",  gradeColor: "#f59e0b" };
  if (e < 4.50) return { grade: "B-", gradeColor: "#f59e0b" };
  if (e < 5.00) return { grade: "C+", gradeColor: "#ef4444" };
  return           { grade: "C",  gradeColor: "#ef4444" };
};

const daysSince = (dateStr) => {
  if (!dateStr) return 99;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const lastAppLabel = (days) => {
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
};

const roleFromStats = (saves, holds) => {
  if (saves >= 3)  return "CL";
  if (holds >= 3)  return "SU";
  return "MR";
};

const isLikelyReliever = (r) => (
  r._gamesStarted === 0 ||
  r._gamesFinished > 0 ||
  r._saves > 0 ||
  r._holds > 0 ||
  r._inherited > 0
);

// ── ROUTE: GET /api/bullpen/:teamId ───────────────────────────
// Returns bullpen summary for one team in the shape BullpenCard expects.
router.get("/:teamId", async (req, res) => {
  const { teamId } = req.params;
  const cacheKey   = `bullpen:team:${teamId}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    // 1. Active roster → collect all active pitchers.
    // MLB's current roster feed often labels bullpen arms as generic "P",
    // not "RP"/"CL", so reliever detection happens after season stats load.
    const rosterRes = await mlb.get(`/teams/${teamId}/roster`, {
      params: { rosterType: "active", season: SEASON },
    });
    const allRoster = rosterRes.data.roster ?? [];
    const pitchers = allRoster.filter(p => p.position?.abbreviation === "P");

    if (!pitchers.length) {
      return res.status(404).json({ error: "No pitchers found", teamId });
    }

    console.log(`  → Bullpen  teamId=${teamId}  pitchers=${pitchers.length}`);

    // 2. Fetch season stats + game log for each pitcher in parallel, then
    // classify likely relievers from the returned usage profile.
    const cutoff3d = Date.now() - 3 * 24 * 60 * 60 * 1000;

    const pitcherData = await Promise.all(pitchers.map(async (p) => {
      const personId = p.person.id;
      try {
        const [seasonRes, gameLogRes, personRes] = await Promise.all([
          mlb.get(`/people/${personId}/stats`, {
            params: { stats: "season", group: "pitching", season: SEASON },
          }),
          mlb.get(`/people/${personId}/stats`, {
            params: { stats: "gameLog", group: "pitching", season: SEASON },
          }),
          mlb.get(`/people/${personId}`, {}),
        ]);

        const stat     = seasonRes.data.stats?.[0]?.splits?.[0]?.stat ?? {};
        const games    = gameLogRes.data.stats?.[0]?.splits ?? [];
        const person   = personRes.data.people?.[0] ?? {};

        // Most recent appearance
        const lastGame    = games[games.length - 1];
        const lastDate    = lastGame?.date ?? null;
        const days        = daysSince(lastDate);
        const lastPitches = parseInt(lastGame?.stat?.numberOfPitches ?? 0);

        // Pitches thrown in last 3 calendar days
        const pitches3d = games
          .filter(g => new Date(g.date).getTime() >= cutoff3d)
          .reduce((sum, g) => sum + parseInt(g.stat?.numberOfPitches ?? 0), 0);

        // Fatigue status for this individual arm
        const status = (days <= 1 && lastPitches > 20) ? "TIRED"
                     : (days === 2 && lastPitches > 35) ? "MODERATE"
                     : "FRESH";

        const saves = parseInt(stat.saves ?? 0);
        const holds = parseInt(stat.holds ?? 0);
        const gamesStarted = parseInt(stat.gamesStarted ?? 0);
        const gamesPlayed  = parseInt(stat.gamesPlayed ?? stat.gamesPitched ?? 0);
        const gamesFinished = parseInt(stat.gamesFinished ?? 0);
        const inherited = parseInt(stat.inheritedRunners ?? 0);

        return {
          name:    person.fullName ?? p.person.fullName,
          role:    roleFromStats(saves, holds),
          hand:    person.pitchHand?.code ?? "R",
          era:     stat.era ?? "—",
          whip:    stat.whip ?? "—",
          vsL:     "—",  // platoon splits skipped for now
          vsR:     "—",
          lastApp: lastDate ? lastAppLabel(days) : "—",
          pitches: lastPitches,
          status,
          // internal — stripped before response
          _days:       days,
          _pitches3d:  pitches3d,
          _era:        parseFloat(stat.era) || 5.00,
          _hand:       person.pitchHand?.code ?? "R",
          _gamesStarted: gamesStarted,
          _gamesPlayed:  gamesPlayed,
          _gamesFinished: gamesFinished,
          _saves:        saves,
          _holds:        holds,
          _inherited:    inherited,
        };
      } catch (err) {
        console.error(`    ✗ Reliever ${personId}: ${err.message}`);
        return null;
      }
    }));

    const validPitchers = pitcherData.filter(Boolean);
    if (!validPitchers.length) {
      return res.status(502).json({ error: "Could not fetch pitcher stats", teamId });
    }

    let valid = validPitchers.filter(isLikelyReliever);

    // Fallback: if reliever heuristics are too strict for a team, keep arms
    // that have appeared without being pure starters.
    if (!valid.length) {
      valid = validPitchers.filter(r => r._gamesStarted < r._gamesPlayed);
    }
    if (!valid.length) {
      return res.status(404).json({ error: "No relievers found", teamId });
    }

    // Prioritize the most relevant bullpen arms before computing team metrics.
    valid = valid
      .sort((a, b) =>
        (b._saves + b._holds) - (a._saves + a._holds) ||
        b._gamesFinished - a._gamesFinished ||
        a._era - b._era
      )
      .slice(0, 8);

    // 3. Team-level derived metrics
    const totalPitches3d = valid.reduce((s, r) => s + r._pitches3d, 0);
    const avgDaysRest    = valid.reduce((s, r) => s + Math.min(r._days, 10), 0) / valid.length;
    const teamEra        = valid.reduce((s, r) => s + r._era, 0) / valid.length;
    const lhCount        = valid.filter(r => r._hand === "L").length;
    const rhCount        = valid.filter(r => r._hand === "R").length;
    const qualityArms    = valid.filter(r => r._era < 4.00).length;

    const fatigueLevel = totalPitches3d > 150 || avgDaysRest < 1.5 ? "HIGH"
                       : totalPitches3d > 80  || avgDaysRest < 2.5 ? "MODERATE"
                       : "FRESH";

    const { grade, gradeColor } = gradeFromEra(teamEra.toFixed(2));

    const setupDepth = qualityArms >= 4 ? "DEEP"
                     : qualityArms >= 2 ? "MODERATE"
                     : "THIN";

    const lrBalance = Math.abs(lhCount - rhCount) <= 1 ? "BALANCED"
                    : lhCount > rhCount ? "LH HEAVY"
                    : "RH HEAVY";

    // Narrative note + lean
    const closer   = valid.find(r => r.role === "CL");
    const tiredArm = valid.find(r => r.status === "TIRED");
    const note = tiredArm
      ? `${tiredArm.name} threw ${tiredArm.pitches}p recently — fatigue factor.`
      : closer
      ? `${closer.name} available (${closer.era} ERA).`
      : `${setupDepth} depth, ${lrBalance.toLowerCase()} pen.`;

    const lean = fatigueLevel === "HIGH"
      ? `Fatigued pen — may struggle in high-leverage situations`
      : setupDepth === "DEEP"
      ? `Deep pen — late leads well protected`
      : `${setupDepth} depth, monitor high-leverage at-bats`;

    // Strip internal fields
    const cleanedRelievers = valid.map(({
      _days, _pitches3d, _era, _hand, _gamesStarted, _gamesPlayed,
      _gamesFinished, _saves, _holds, _inherited, ...r
    }) => r);

    const result = {
      teamId:       parseInt(teamId),
      fatigueLevel,
      restDays:     Math.round(avgDaysRest),
      pitchesLast3: totalPitches3d,
      grade,
      gradeColor,
      setupDepth,
      lrBalance,
      note,
      lean,
      relievers:    cleanedRelievers,
      live:         true,
    };

    cache.set(cacheKey, result, BULLPEN_TTL);
    res.setHeader("X-Cache", "MISS");
    console.log(`  ✓ Bullpen cached  teamId=${teamId}  arms=${cleanedRelievers.length}  era=${teamEra.toFixed(2)}  fatigue=${fatigueLevel}`);
    res.json(result);

  } catch (err) {
    console.error(`  ✗ Bullpen failed  teamId=${teamId}: ${err.message}`);
    res.status(502).json({ error: "MLB API unavailable", detail: err.message });
  }
});

module.exports = router;
