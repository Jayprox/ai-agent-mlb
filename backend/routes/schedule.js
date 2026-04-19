const express = require("express");
const router  = express.Router();
const mlb     = require("../services/mlbApi");
const cache   = require("../services/cache");

// MLB team ID → abbreviation lookup (all 30 teams)
const TEAM_ABBR = {
  108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC",
  113: "CIN", 114: "CLE", 115: "COL", 116: "DET", 117: "HOU",
  118: "KC",  119: "LAD", 120: "WSH", 121: "NYM", 133: "OAK",
  134: "PIT", 135: "SD",  136: "SEA", 137: "SF",  138: "STL",
  139: "TB",  140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI",
  144: "ATL", 145: "CWS", 146: "MIA", 147: "NYY", 158: "MIL",
};

// Format a UTC game-time string into "7:08 PM ET"
const formatGameTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour:     "numeric",
      minute:   "2-digit",
      timeZone: "America/New_York",
    }) + " ET";
  } catch {
    return iso;
  }
};

// Slim pitcher object — stats filled in later by /api/players
const transformPitcher = (p, abbr) => {
  if (!p) return null;
  return {
    id:     p.id,
    name:   p.fullName,
    team:   abbr,
    number: p.primaryNumber ?? "?",
    hand:   p.pitchHand?.code ?? "?",
  };
};

// ── GET /api/schedule?date=YYYY-MM-DD ────────────────────────
// Returns today's MLB slate with probable pitchers.
// Falls back to today's date if no `date` param supplied.
router.get("/", async (req, res) => {
  // Use Hawaii Time — matches the user's local day so "today's games" aligns
  // with what they see on their clock. Hawaii (UTC−10) is the furthest west,
  // so it never rolls into a new calendar day mid-slate.
  const date     = req.query.date ?? new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  const cacheKey = `schedule:${date}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const { data } = await mlb.get("/schedule", {
      params: {
        sportId: 1,
        date,
        hydrate: "probablePitcher,linescore,team,venue",
      },
    });

    const games = data.dates?.[0]?.games ?? [];

    const transformed = games.map((g) => {
      const away     = g.teams.away;
      const home     = g.teams.home;
      const awayAbbr = TEAM_ABBR[away.team.id] ?? away.team.abbreviation ?? "???";
      const homeAbbr = TEAM_ABBR[home.team.id] ?? home.team.abbreviation ?? "???";

      return {
        gamePk:   g.gamePk,
        id:       g.gamePk,
        status:   g.status.detailedState,
        time:     formatGameTime(g.gameDate), // ET fallback
        gameTime: g.gameDate,                 // raw ISO — frontend formats in user's local TZ
        stadium:  g.venue.name,
        away: {
          id:   away.team.id,
          name: away.team.name,
          abbr: awayAbbr,
        },
        home: {
          id:   home.team.id,
          name: home.team.name,
          abbr: homeAbbr,
        },
        probablePitchers: {
          away: transformPitcher(away.probablePitcher, awayAbbr),
          home: transformPitcher(home.probablePitcher, homeAbbr),
        },
      };
    });

    // Enrich probable pitchers with hand + jersey number via a single
    // batched /people call. The schedule hydration only returns id + fullName.
    const pitcherIds = [
      ...new Set(
        transformed
          .flatMap((g) => [g.probablePitchers.away?.id, g.probablePitchers.home?.id])
          .filter(Boolean)
      ),
    ];

    if (pitcherIds.length > 0) {
      try {
        const { data: peopleData } = await mlb.get("/people", {
          params: { personIds: pitcherIds.join(",") },
        });
        const peopleMap = {};
        (peopleData.people ?? []).forEach((p) => { peopleMap[p.id] = p; });

        transformed.forEach((g) => {
          ["away", "home"].forEach((side) => {
            const p = g.probablePitchers[side];
            if (p && peopleMap[p.id]) {
              p.number = peopleMap[p.id].primaryNumber ?? "?";
              p.hand   = peopleMap[p.id].pitchHand?.code ?? "?";
            }
          });
        });
      } catch (enrichErr) {
        // Non-fatal — pitcher hand/number stays "?" rather than failing the whole request
        console.warn("Pitcher enrichment failed:", enrichErr.message);
      }
    }

    // Cache for 1 hour — pitchers are set well before game time
    cache.set(cacheKey, transformed, 60 * 60 * 1000);
    res.setHeader("X-Cache", "MISS");
    res.json(transformed);
  } catch (err) {
    res.status(502).json({ error: "MLB API unavailable", detail: err.message });
  }
});

module.exports = router;
