import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────
// STADIUM DATA — coordinates + orientation
// orientation: degrees from home plate toward CF
// used to interpret wind direction meaningfully
// ─────────────────────────────────────────────
const STADIUMS = {
  "Citizens Bank Park":        { lat: 39.9061,  lon: -75.1665, orientation: 60,  tz: "America/New_York"    },
  "Dodger Stadium":            { lat: 34.0739,  lon: -118.2400,orientation: 25,  tz: "America/Los_Angeles" },
  "Globe Life Field":          { lat: 32.7473,  lon: -97.0832, orientation: 0,   tz: "America/Chicago",  roof: true },
  "American Family Field":     { lat: 43.0280,  lon: -87.9712, orientation: 5,   tz: "America/Chicago"     },
  "Oracle Park":               { lat: 37.7786,  lon: -122.3893,orientation: 55,  tz: "America/Los_Angeles" },
  "Rogers Centre":             { lat: 43.6414,  lon: -79.3894, orientation: 10,  tz: "America/Toronto",  roof: true, turf: true },
  "Yankee Stadium":            { lat: 40.8296,  lon: -73.9262, orientation: 30,  tz: "America/New_York"    },
  "Fenway Park":               { lat: 42.3467,  lon: -71.0972, orientation: 90,  tz: "America/New_York"    },
  "Wrigley Field":             { lat: 41.9484,  lon: -87.6553, orientation: 30,  tz: "America/Chicago"     },
  "Busch Stadium":             { lat: 38.6226,  lon: -90.1928, orientation: 10,  tz: "America/Chicago"     },
  "T-Mobile Park":             { lat: 47.5914,  lon: -122.3325,orientation: 5,   tz: "America/Los_Angeles" },
  "Camden Yards":              { lat: 39.2838,  lon: -76.6218, orientation: 5,   tz: "America/New_York"    },
  "Petco Park":                { lat: 32.7076,  lon: -117.1570,orientation: 35,  tz: "America/Los_Angeles" },
  "Truist Park":               { lat: 33.8907,  lon: -84.4677, orientation: 20,  tz: "America/New_York"    },
  "Great American Ball Park":  { lat: 39.0979,  lon: -84.5082, orientation: 10,  tz: "America/New_York"    },
  "loanDepot park":            { lat: 25.7781,  lon: -80.2197, orientation: 5,   tz: "America/New_York",  roof: true, turf: true },
  "Minute Maid Park":          { lat: 29.7572,  lon: -95.3555, orientation: 30,  tz: "America/Chicago",  roof: true },
  "Tropicana Field":           { lat: 27.7683,  lon: -82.6534, orientation: 0,   tz: "America/New_York",  roof: true, turf: true },
  "Chase Field":               { lat: 33.4453,  lon: -112.0667,orientation: 25,  tz: "America/Phoenix",  roof: true },
  "Coors Field":               { lat: 39.7559,  lon: -104.9942,orientation: 20,  tz: "America/Denver"      },
  "PNC Park":                  { lat: 40.4469,  lon: -80.0057, orientation: 35,  tz: "America/New_York"    },
  "Target Field":              { lat: 44.9817,  lon: -93.2778, orientation: 5,   tz: "America/Chicago"     },
  "Kauffman Stadium":          { lat: 39.0517,  lon: -94.4803, orientation: 15,  tz: "America/Chicago"     },
  "Progressive Field":         { lat: 41.4962,  lon: -81.6852, orientation: 5,   tz: "America/New_York"    },
  "Comerica Park":             { lat: 42.3390,  lon: -83.0485, orientation: 5,   tz: "America/New_York"    },
  "Guaranteed Rate Field":     { lat: 41.8299,  lon: -87.6338, orientation: 5,   tz: "America/Chicago"     },
  "Angel Stadium":             { lat: 33.8003,  lon: -117.8827,orientation: 25,  tz: "America/Los_Angeles" },
  "Oakland Coliseum":          { lat: 37.7516,  lon: -122.2005,orientation: 10,  tz: "America/Los_Angeles" },
  "Sutter Health Park":        { lat: 38.5762,  lon: -121.5029,orientation: 15,  tz: "America/Los_Angeles" },
  "Nationals Park":            { lat: 38.8730,  lon: -77.0074, orientation: 5,   tz: "America/New_York"    },
  "Citi Field":                { lat: 40.7571,  lon: -73.8458, orientation: 5,   tz: "America/New_York"    },
};

// WMO weather code → human-readable condition
const WMO_CODES = {
  0:"Clear", 1:"Mostly Clear", 2:"Partly Cloudy", 3:"Overcast",
  45:"Foggy", 48:"Foggy", 51:"Light Drizzle", 53:"Drizzle",
  55:"Heavy Drizzle", 61:"Light Rain", 63:"Rain", 65:"Heavy Rain",
  71:"Light Snow", 73:"Snow", 75:"Heavy Snow", 77:"Snow Grains",
  80:"Rain Showers", 81:"Rain Showers", 82:"Heavy Showers",
  85:"Snow Showers", 86:"Heavy Snow Showers",
  95:"Thunderstorm", 96:"Thunderstorm", 99:"Thunderstorm",
};

// Convert wind degrees + stadium orientation → betting-relevant string
// stadiumOrientation = degrees from home plate toward CF
const windDescription = (windDeg, windSpd, stadiumOrientation) => {
  if (windSpd < 3) return `${Math.round(windSpd)} mph Calm`;
  // Relative wind angle vs stadium CF direction
  const rel = ((windDeg - stadiumOrientation) + 360) % 360;
  let dir;
  if      (rel >= 315 || rel < 45)  dir = "OUT to CF";
  else if (rel >= 45  && rel < 135) dir = "OUT to RF";
  else if (rel >= 135 && rel < 225) dir = "IN from CF";
  else                               dir = "OUT to LF";
  return `${Math.round(windSpd)} mph ${dir}`;
};

// Determine if conditions favor HRs
const isHrFavorable = (windDeg, windSpd, stadiumOrientation, temp) => {
  const rel = ((windDeg - stadiumOrientation) + 360) % 360;
  const windOut = rel >= 315 || rel < 135; // blowing out (CF, RF, LF)
  return windOut && windSpd >= 6 && temp >= 65;
};

// ─────────────────────────────────────────────
// SANDBOX DETECTION
// Claude artifact sandbox blocks outbound fetch.
// Flip this to false when running in a real environment.
// ─────────────────────────────────────────────
const IS_SANDBOX = false;

// ── Park Factors (keyed by home team abbreviation) ────────────────────────────
// hr: HR factor  hit: overall hit factor  k: strikeout factor
// >1.0 = hitter-friendly, <1.0 = pitcher-friendly, 1.0 = neutral
// Source: multi-year FanGraphs park factor averages (updated pre-season)
const PARK_FACTORS = {
  COL: { hr: 1.35, hit: 1.15, k: 0.93, label: "Hitter Haven"   },  // Coors Field
  CIN: { hr: 1.15, hit: 1.05, k: 0.97, label: "Hitter-Friendly"},  // Great American
  PHI: { hr: 1.10, hit: 1.04, k: 0.98, label: "Hitter-Friendly"},  // Citizens Bank
  BOS: { hr: 1.08, hit: 1.09, k: 0.97, label: "Hitter-Friendly"},  // Fenway
  TEX: { hr: 1.08, hit: 1.03, k: 0.98, label: "Hitter-Friendly"},  // Globe Life
  BAL: { hr: 1.07, hit: 1.03, k: 0.99, label: "Hitter-Friendly"},  // Camden Yards
  CHC: { hr: 1.04, hit: 1.02, k: 0.99, label: "Neutral (wind-variable)" }, // Wrigley
  NYY: { hr: 1.05, hit: 1.01, k: 1.00, label: "Slight Hitter"  },  // Yankee Stadium
  TOR: { hr: 1.03, hit: 1.02, k: 1.00, label: "Slight Hitter"  },  // Rogers Centre
  ARI: { hr: 1.02, hit: 1.01, k: 0.99, label: "Slight Hitter"  },  // Chase Field
  ATL: { hr: 1.02, hit: 1.01, k: 1.00, label: "Neutral"        },  // Truist Park
  DET: { hr: 1.01, hit: 1.00, k: 1.00, label: "Neutral"        },  // Comerica Park
  MIL: { hr: 1.00, hit: 1.01, k: 1.00, label: "Neutral"        },  // American Family
  CHW: { hr: 1.00, hit: 1.00, k: 1.00, label: "Neutral"        },  // Guaranteed Rate
  STL: { hr: 0.98, hit: 0.99, k: 1.01, label: "Slight Pitcher" },  // Busch Stadium
  WSH: { hr: 0.98, hit: 0.99, k: 1.00, label: "Slight Pitcher" },  // Nationals Park
  MIN: { hr: 0.97, hit: 0.99, k: 1.01, label: "Slight Pitcher" },  // Target Field
  CLE: { hr: 0.97, hit: 0.99, k: 1.00, label: "Slight Pitcher" },  // Progressive Field
  PIT: { hr: 0.96, hit: 0.98, k: 1.01, label: "Pitcher-Friendly"}, // PNC Park
  NYM: { hr: 0.96, hit: 0.98, k: 1.01, label: "Pitcher-Friendly"}, // Citi Field
  LAA: { hr: 0.96, hit: 0.98, k: 1.01, label: "Pitcher-Friendly"}, // Angel Stadium
  HOU: { hr: 0.95, hit: 0.99, k: 1.01, label: "Pitcher-Friendly"}, // Minute Maid
  MIA: { hr: 0.94, hit: 0.98, k: 1.02, label: "Pitcher-Friendly"}, // loanDepot
  TB:  { hr: 0.94, hit: 0.97, k: 1.02, label: "Pitcher-Friendly"}, // Tropicana
  OAK: { hr: 0.93, hit: 0.97, k: 1.01, label: "Pitcher-Friendly"}, // Sutter Health Park (Sacramento)
  LAD: { hr: 0.93, hit: 0.97, k: 1.02, label: "Pitcher-Friendly"}, // Dodger Stadium
  KC:  { hr: 0.91, hit: 0.98, k: 1.01, label: "Pitcher-Friendly"}, // Kauffman Stadium
  SEA: { hr: 0.90, hit: 0.97, k: 1.02, label: "Pitcher-Friendly"}, // T-Mobile Park
  SD:  { hr: 0.87, hit: 0.96, k: 1.03, label: "Pitcher Haven"  },  // Petco Park
  SF:  { hr: 0.83, hit: 0.96, k: 1.03, label: "Pitcher Haven"  },  // Oracle Park
};
const NEUTRAL_PARK = { hr: 1.0, hit: 1.0, k: 1.0, label: "Neutral" };

// ─────────────────────────────────────────────
// UMPIRE STATS — keyed by full name as returned by the MLB Stats API.
// kRate / bbRate: career per-game K% / BB% with that umpire behind the plate.
// rating: "pitcher" (tight/wide zone benefits pitcher), "hitter", or "neutral".
// Source: UmpScorecards.com multi-season averages (updated pre-season).
// ─────────────────────────────────────────────
const UMPIRE_STATS = {
  // ── High-K / wide zone (pitcher-friendly for K props) ──
  "Pat Hoberg":         { kRate: "23.4%", bbRate: "7.3%", tendency: "Wide zone — among highest K rates in MLB", rating: "pitcher" },
  "Dan Bellino":        { kRate: "22.8%", bbRate: "7.6%", tendency: "Wide zone — high K environment", rating: "pitcher" },
  "Roberto Ortiz":      { kRate: "22.6%", bbRate: "7.8%", tendency: "Expansive zone — favors strikeout pitchers", rating: "pitcher" },
  "Nic Lentz":          { kRate: "22.5%", bbRate: "7.9%", tendency: "Wide zone — suppresses walks", rating: "pitcher" },
  "Cory Blaser":        { kRate: "22.4%", bbRate: "7.5%", tendency: "Wide zone — low BB, high K", rating: "pitcher" },
  "Adam Hamari":        { kRate: "22.3%", bbRate: "7.8%", tendency: "Consistent wide zone — K props lean over", rating: "pitcher" },
  "Tom Hallion":        { kRate: "22.2%", bbRate: "7.9%", tendency: "Wide zone — favors strikeout pitchers", rating: "pitcher" },
  "Mike Muchlinski":    { kRate: "22.1%", bbRate: "8.0%", tendency: "Wide zone — K environment", rating: "pitcher" },
  "Ryan Additon":       { kRate: "22.0%", bbRate: "8.0%", tendency: "Above-average zone — slight K lean", rating: "pitcher" },
  "Will Little":        { kRate: "22.0%", bbRate: "8.0%", tendency: "Wide zone — favors power pitchers", rating: "pitcher" },
  "Mark Wegner":        { kRate: "22.0%", bbRate: "8.1%", tendency: "Wide zone — above-average K rate", rating: "pitcher" },
  "Quinn Wolcott":      { kRate: "22.0%", bbRate: "8.0%", tendency: "Wide zone — slightly favors pitchers", rating: "pitcher" },
  "Edwin Moscoso":      { kRate: "21.9%", bbRate: "8.0%", tendency: "Slightly wide zone — above-average K rate", rating: "pitcher" },
  "Ben May":            { kRate: "21.9%", bbRate: "8.0%", tendency: "Wide zone — favors high-K starters", rating: "pitcher" },
  "Sean Barber":        { kRate: "21.8%", bbRate: "8.0%", tendency: "Slightly expanded zone", rating: "pitcher" },
  "James Hoye":         { kRate: "21.8%", bbRate: "8.1%", tendency: "Above-average K zone", rating: "pitcher" },
  "Mike Estabrook":     { kRate: "21.8%", bbRate: "8.0%", tendency: "Wide zone — K props lean over", rating: "pitcher" },
  "David Rackley":      { kRate: "21.7%", bbRate: "8.1%", tendency: "Slightly wide zone", rating: "pitcher" },
  "Alfonso Marquez":    { kRate: "21.7%", bbRate: "8.0%", tendency: "Wide zone — consistent calls", rating: "pitcher" },
  "Manny Gonzalez":     { kRate: "21.6%", bbRate: "8.0%", tendency: "Slightly expanded zone", rating: "pitcher" },
  "Tom Woodring":       { kRate: "21.6%", bbRate: "8.0%", tendency: "Above-average zone size", rating: "pitcher" },
  "Rob Drake":          { kRate: "21.5%", bbRate: "8.2%", tendency: "Slightly wide zone — reliable calls", rating: "pitcher" },

  // ── Neutral zone ──
  "Gabe Morales":       { kRate: "21.2%", bbRate: "8.5%", tendency: "Average zone — neutral for props", rating: "neutral" },
  "Brian Knight":       { kRate: "21.2%", bbRate: "8.4%", tendency: "Consistent neutral zone", rating: "neutral" },
  "Vic Carapazza":      { kRate: "21.1%", bbRate: "8.3%", tendency: "Average zone size — neutral calls", rating: "neutral" },
  "Fieldin Culbreth":   { kRate: "21.1%", bbRate: "8.5%", tendency: "Neutral zone — very consistent", rating: "neutral" },
  "Andy Fletcher":      { kRate: "21.1%", bbRate: "8.3%", tendency: "Average zone — steady calls", rating: "neutral" },
  "Alan Porter":        { kRate: "21.0%", bbRate: "8.5%", tendency: "Average zone — neutral for K and BB props", rating: "neutral" },
  "Chris Guccione":     { kRate: "21.0%", bbRate: "8.3%", tendency: "Average zone — reliable umpire", rating: "neutral" },
  "Phil Cuzzi":         { kRate: "21.0%", bbRate: "8.4%", tendency: "Average zone — neutral tendencies", rating: "neutral" },
  "Mark Carlson":       { kRate: "21.3%", bbRate: "8.2%", tendency: "Average zone · consistent calls", rating: "neutral" },
  "Todd Tichenor":      { kRate: "21.0%", bbRate: "8.5%", tendency: "Neutral zone — no strong tendencies", rating: "neutral" },
  "Doug Eddings":       { kRate: "21.0%", bbRate: "8.2%", tendency: "Average zone — neutral environment", rating: "neutral" },
  "Jim Reynolds":       { kRate: "21.0%", bbRate: "8.4%", tendency: "Average zone — neutral for all props", rating: "neutral" },
  "Dan Iassogna":       { kRate: "20.9%", bbRate: "8.4%", tendency: "Solid zone · above-average strike calls", rating: "neutral" },
  "Brian O'Nora":       { kRate: "21.0%", bbRate: "8.5%", tendency: "Average zone — consistent", rating: "neutral" },
  "Sam Holbrook":       { kRate: "21.0%", bbRate: "8.2%", tendency: "Average zone — no notable tendencies", rating: "neutral" },
  "Hunter Wendelstedt": { kRate: "21.0%", bbRate: "8.5%", tendency: "Average zone — neutral calls", rating: "neutral" },
  "Ted Barrett":        { kRate: "21.0%", bbRate: "8.2%", tendency: "Average zone — reliable veteran", rating: "neutral" },
  "Mike Everitt":       { kRate: "21.0%", bbRate: "8.5%", tendency: "Average zone — no prop tendencies", rating: "neutral" },
  "John Tumpane":       { kRate: "21.0%", bbRate: "8.3%", tendency: "Average zone — neutral environment", rating: "neutral" },
  "Lance Barksdale":    { kRate: "20.9%", bbRate: "8.7%", tendency: "Slightly loose zone — watch BB props", rating: "neutral" },
  "Marty Foster":       { kRate: "20.8%", bbRate: "8.9%", tendency: "Average zone — slightly more walks", rating: "neutral" },
  "Scott Barry":        { kRate: "21.0%", bbRate: "8.4%", tendency: "Average zone — neutral calls", rating: "neutral" },
  "Jerry Layne":        { kRate: "20.9%", bbRate: "8.6%", tendency: "Average zone — veteran consistency", rating: "neutral" },
  "Dave Meals":         { kRate: "21.0%", bbRate: "8.5%", tendency: "Neutral zone — consistent career", rating: "neutral" },
  "Paul Nauert":        { kRate: "21.0%", bbRate: "8.2%", tendency: "Average zone — no strong tendencies", rating: "neutral" },
  "Larry Vanover":      { kRate: "20.8%", bbRate: "8.8%", tendency: "Slightly loose zone — neutral overall", rating: "neutral" },
  "Bill Welke":         { kRate: "20.9%", bbRate: "8.6%", tendency: "Average zone — neutral for all props", rating: "neutral" },
  "Jeff Kellogg":       { kRate: "21.0%", bbRate: "8.5%", tendency: "Average zone — neutral tendencies", rating: "neutral" },

  // ── Tight / low-K zone (hitter-friendly) ──
  "CB Bucknor":         { kRate: "20.4%", bbRate: "8.6%", tendency: "Inconsistent zone — watch BB props", rating: "neutral" },
  "Mike Winters":       { kRate: "20.3%", bbRate: "9.0%", tendency: "Tight zone — below-average K rate", rating: "hitter" },
  "Bill Miller":        { kRate: "20.2%", bbRate: "9.0%", tendency: "Tight zone — slightly hitter-friendly", rating: "hitter" },
  "Angel Hernandez":    { kRate: "19.2%", bbRate: "9.1%", tendency: "Tight zone — favors pitchers' ERA but suppresses Ks", rating: "hitter" },
  "Ron Kulpa":          { kRate: "19.8%", bbRate: "9.5%", tendency: "Loose zone — watch over on BB props", rating: "hitter" },
  "Joe West":           { kRate: "18.8%", bbRate: "9.8%", tendency: "Slow pace · generous outside corner", rating: "hitter" },
  "Gerry Davis":        { kRate: "19.5%", bbRate: "9.3%", tendency: "Veteran — loose zone, walk-friendly", rating: "hitter" },
};

// Build a plain-text context string for the AI Trends Summary route
const buildTrendsContext = (game, odds, parkFactors) => {
  const lines = [];
  lines.push(`Game: ${game.away.abbr} @ ${game.home.abbr} at ${game.stadium ?? "Unknown Stadium"}`);

  const sp = (p, side) => p
    ? `${side} SP: ${p.name} (${p.hand ?? "?"}HP) — ERA ${p.era ?? "—"}, WHIP ${p.whip ?? "—"}, K/9 ${p.k9 ?? "—"}, BB/9 ${p.bb9 ?? "—"}`
    : null;
  if (sp(game.awayPitcher, "Away")) lines.push(sp(game.awayPitcher, "Away"));
  if (sp(game.pitcher,     "Home")) lines.push(sp(game.pitcher,     "Home"));

  if (game.weather) {
    const w = game.weather;
    lines.push(w.roof
      ? "Weather: Dome — controlled environment"
      : `Weather: ${w.temp ?? "?"}°F, ${w.wind ?? "calm"}, ${w.condition ?? ""}${w.hrFavorable ? " — HR-favorable wind" : ""}`
    );
  }

  if (game.umpire?.name && game.umpire.name !== "TBD") {
    const u = game.umpire;
    const umpLine = [`Umpire: ${u.name}`];
    if (u.tendency) umpLine.push(u.tendency);
    if (u.kRate)    umpLine.push(`K Rate ${u.kRate}`);
    lines.push(umpLine.join(" — "));
  }

  if (game.bullpen?.away) {
    const b = game.bullpen.away;
    lines.push(`Away Bullpen: Grade ${b.grade ?? "?"}, ${b.fatigueLevel ?? "?"} fatigue${b.note ? ` — ${b.note}` : ""}`);
  }
  if (game.bullpen?.home) {
    const b = game.bullpen.home;
    lines.push(`Home Bullpen: Grade ${b.grade ?? "?"}, ${b.fatigueLevel ?? "?"} fatigue${b.note ? ` — ${b.note}` : ""}`);
  }

  if (game.nrfi?.lean) {
    lines.push(`NRFI lean: ${game.nrfi.lean} at ${game.nrfi.confidence ?? "?"}% confidence`);
  }

  if (odds?.total) {
    const ml = odds.awayML && odds.homeML
      ? ` | ML: ${game.away.abbr} ${odds.awayML} / ${game.home.abbr} ${odds.homeML}`
      : "";
    lines.push(`Total: O/U ${odds.total}${ml}`);
  }

  const pf = parkFactors?.[game.home?.abbr];
  if (pf) lines.push(`Park: ${game.stadium} — ${pf.label} (HR ${pf.hr}x, Hit ${pf.hit}x)`);

  lines.push("\nWrite a 2–3 sentence bettor-focused trend summary for this game.");
  return lines.filter(Boolean).join("\n");
};

// Build structured context string for the AI Props engine
// playerProps: array from /api/player-props (real sportsbook lines), or null
const buildPropsContext = (game, odds, parkFactors, playerProps = null) => {
  const lines = [];
  lines.push(`Game: ${game.away.abbr} @ ${game.home.abbr} at ${game.stadium ?? "Unknown Stadium"}`);

  const spLine = (p, side) => {
    if (!p) return null;
    let s = `${side} SP: ${p.name} (${p.hand ?? "?"}HP) — ERA ${p.era ?? "—"}, WHIP ${p.whip ?? "—"}, K/9 ${p.k9 ?? "—"}, BB/9 ${p.bb9 ?? "—"}, avgIP ${p.avgIP ?? "—"}`;
    if (p.arsenal?.length > 0) {
      const pitches = p.arsenal.slice(0, 3).map(a =>
        `${a.type ?? a.abbr} ${a.pct != null ? Math.round(a.pct) + "%" : ""} whiff ${a.whiffPct ?? "?"}%`
      ).join(", ");
      s += ` | Arsenal: ${pitches}`;
    }
    return s;
  };
  if (spLine(game.awayPitcher, "Away")) lines.push(spLine(game.awayPitcher, "Away"));
  if (spLine(game.pitcher,     "Home")) lines.push(spLine(game.pitcher,     "Home"));

  if (game.weather) {
    const w = game.weather;
    lines.push(w.roof
      ? "Weather: Dome — controlled environment"
      : `Weather: ${w.temp ?? "?"}°F, ${w.wind ?? "calm"}, ${w.condition ?? ""}${w.hrFavorable ? " — HR-favorable wind" : ""}${w.rainChance && w.rainChance !== "N/A" ? `, ${w.rainChance} rain chance` : ""}`
    );
  }

  if (game.umpire?.name && game.umpire.name !== "TBD") {
    const u = game.umpire;
    const parts = [`Umpire: ${u.name}`];
    if (u.kRate)    parts.push(`K Rate ${u.kRate}`);
    if (u.bbRate)   parts.push(`BB Rate ${u.bbRate}`);
    if (u.tendency) parts.push(u.tendency);
    lines.push(parts.join(" — "));
  }

  const bpLine = (b, side, abbr) => {
    if (!b) return null;
    const top = b.relievers?.slice(0, 3).map(r =>
      `${r.name} (${r.pitches ?? r.pitchesLast3 ?? 0}pc/${r.lastApp ?? "?"})`
    ).join(", ");
    return `${side} Bullpen (${abbr}): Grade ${b.grade ?? "?"} — ${b.fatigueLevel ?? "?"} fatigue, ${b.pitchesLast3 ?? "?"}pc last 3d${top ? ` | Top arms: ${top}` : ""}`;
  };
  if (bpLine(game.bullpen?.away, "Away", game.away.abbr)) lines.push(bpLine(game.bullpen.away, "Away", game.away.abbr));
  if (bpLine(game.bullpen?.home, "Home", game.home.abbr)) lines.push(bpLine(game.bullpen.home, "Home", game.home.abbr));

  if (game.nrfi?.lean) {
    const n = game.nrfi;
    lines.push(`First Inning: ${n.lean} at ${n.confidence ?? "?"}% confidence — ${game.away.abbr} scores 1st inn ${n.awayFirst?.scoredPct ?? "?"}, ${game.home.abbr} scores 1st inn ${n.homeFirst?.scoredPct ?? "?"}`);
  }

  const awayLineup = game.lineups?.away ?? [];
  const homeLineup = game.lineups?.home ?? [];
  if (awayLineup.length >= 3) {
    const R = awayLineup.filter(b => b.hand === "R").length;
    const L = awayLineup.filter(b => b.hand === "L").length;
    lines.push(`${game.away.abbr} lineup vs ${game.pitcher?.hand ?? "?"}HP: ${R} RHB / ${L} LHB`);
  }
  if (homeLineup.length >= 3) {
    const R = homeLineup.filter(b => b.hand === "R").length;
    const L = homeLineup.filter(b => b.hand === "L").length;
    lines.push(`${game.home.abbr} lineup vs ${game.awayPitcher?.hand ?? "?"}HP: ${R} RHB / ${L} LHB`);
  }

  if (odds?.total) {
    const ml = odds.awayML && odds.homeML ? ` | ML: ${game.away.abbr} ${odds.awayML} / ${game.home.abbr} ${odds.homeML}` : "";
    const rl = odds.awaySpread ? ` | RL: ${game.away.abbr} ${odds.awaySpread}(${odds.awaySpreadOdds ?? "?"})` : "";
    lines.push(`Odds: O/U ${odds.total}${ml}${rl}`);
  }

  const pf = parkFactors?.[game.home?.abbr];
  if (pf) lines.push(`Park: ${game.stadium} — ${pf.label} (HR ${pf.hr}x, Hit ${pf.hit}x)`);

  // Inject real sportsbook lines when available — AI anchors against actual market prices
  if (playerProps?.length) {
    const fmtLine = (p) => {
      const o = p.overOdds  ?? "?";
      const u = p.underOdds ?? "?";
      return `${p.player} ${p.marketLabel} O/U ${p.line} (O:${o}/U:${u} ${p.book})`;
    };
    const kLines  = playerProps.filter(p => p.market === "pitcher_strikeouts").map(fmtLine).join(", ");
    const tbLines = playerProps.filter(p => p.market === "batter_total_bases").map(fmtLine).join(", ");
    const hLines  = playerProps.filter(p => p.market === "batter_hits").map(fmtLine).join(", ");
    if (kLines)  lines.push(`Market K lines: ${kLines}`);
    if (tbLines) lines.push(`Market TB lines: ${tbLines}`);
    if (hLines)  lines.push(`Market Hits lines: ${hLines}`);
  }

  lines.push("\nGenerate 3–5 prop recommendations as a JSON array. Return ONLY the JSON array, no other text.");
  return lines.filter(Boolean).join("\n");
};

// ─────────────────────────────────────────────────────────────
// PLAYER PROPS — routed through backend (shared server-side 10-min cache)
// Passes the Odds API eventId (from oddsCache) to the backend so it can skip
// its own events-list lookup — saves a credit per game.
// ─────────────────────────────────────────────────────────────
const playerPropsCache   = {};  // browser-side dedup: key = gamePk string
const PLAYER_PROP_LABELS = { pitcher_strikeouts: "K", pitcher_outs_recorded: "Outs", batter_total_bases: "TB", batter_hits: "H", batter_home_runs: "HR" };

const fetchPlayerPropsDirect = async (awayName, homeName, gamePk) => {
  if (IS_ODDS_SANDBOX) return [];
  const cacheKey = String(gamePk ?? `${awayName}|${homeName}`);
  const cached   = playerPropsCache[cacheKey];
  if (cached) return cached;

  // Pass eventId to backend so it can skip the Odds API events-list fetch
  const eventIdKey = `${awayName}|${homeName}`;
  const eventId    = oddsCache.eventIdMap?.[eventIdKey] ?? null;
  const qs         = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";

  const res = await fetch(`${API_BASE}/api/player-props/${gamePk}${qs}`);
  if (!res.ok) throw new Error(`player-props ${res.status}`);
  const data = await res.json();

  const props = (data.props ?? []).map(p => ({
    ...p,
    marketLabel: PLAYER_PROP_LABELS[p.market] ?? p.marketLabel ?? p.market,
  }));
  const result = { props, reason: data.reason ?? (props.length ? "ok" : "no_props") };
  playerPropsCache[cacheKey] = result;
  return result;
};


// Format an ISO datetime string in the user's local timezone
const formatLocalTime = (isoStr) => {
  if (!isoStr) return null;
  try {
    return new Date(isoStr).toLocaleTimeString("en-US", {
      hour:           "numeric",
      minute:         "2-digit",
      timeZoneName:   "short",
    });
  } catch {
    return null;
  }
};

const weatherCache = {};
const CACHE_TTL_MS = 30 * 60 * 1000;

const fetchWeather = async (gameId, stadiumName, gameTimeStr, mockWeather) => {
  const cached = weatherCache[gameId];
  if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) return cached.data;

  const stadium = STADIUMS[stadiumName];

  // Dome — no fetch needed ever
  if (!stadium || stadium.roof || mockWeather?.roof) {
    const data = { ...(mockWeather ?? {}), condition: "Dome", wind: "N/A", humidity: "N/A", rainChance: "N/A", roof: true, hrFavorable: false, live: false };
    weatherCache[gameId] = { data, ts: Date.now() };
    return data;
  }

  // Sandbox mode — return mock data, no API call
  if (IS_SANDBOX) {
    const data = { ...mockWeather, live: false, sandbox: true };
    weatherCache[gameId] = { data, ts: Date.now() };
    return data;
  }

  // Live path — route through backend (shared 1-hour server cache, avoids Open-Meteo 429s)
  const parseHour = (timeStr, tz) => {
    try {
      const now     = new Date();
      const dateStr = now.toLocaleDateString("en-CA", { timeZone: tz });
      const clean   = timeStr.replace(/ [A-Z]{2,3}$/, "");
      const d       = new Date(`${dateStr} ${clean}`);
      return isNaN(d) ? now : d;
    } catch { return new Date(); }
  };

  const targetHour = parseHour(gameTimeStr, stadium.tz).getHours();
  const qs = new URLSearchParams({
    lat:  stadium.lat,
    lon:  stadium.lon,
    tz:   stadium.tz,
    hour: targetHour,
    key:  stadiumName,
  });

  try {
    const res  = await fetch(`${API_BASE}/api/weather?${qs}`);
    if (!res.ok) throw new Error(`weather ${res.status}`);
    const w = await res.json();

    const data = {
      temp:        w.temp,
      condition:   WMO_CODES[w.weathercode] ?? "Unknown",
      wind:        windDescription(w.winddirection, w.windspeed, stadium.orientation),
      humidity:    `${Math.round(w.relativehumidity)}%`,
      rainChance:  `${w.precipitation_probability}%`,
      roof:        false,
      hrFavorable: isHrFavorable(w.winddirection, w.windspeed, stadium.orientation, w.temp),
      live:        true,
      fetchedAt:   w.fetchedAt,
    };
    weatherCache[gameId] = { data, ts: Date.now() };
    return data;
  } catch {
    const fallback = { ...mockWeather, live: false };
    weatherCache[gameId] = { data: fallback, ts: Date.now() };
    return fallback;
  }
};


// ─────────────────────────────────────────────
// THE ODDS API CONFIG
// Browser-safe — no proxy needed.
// Flip IS_ODDS_SANDBOX to false to go live.
// ─────────────────────────────────────────────
const ODDS_API_KEY    = import.meta.env.VITE_ODDS_API_KEY ?? "";
const IS_ODDS_SANDBOX = false; // flip to false to enable live odds

// ─────────────────────────────────────────────
// STATS API (Backend Proxy) CONFIG
// Flip IS_STATS_SANDBOX to false once the backend is running locally.
// ─────────────────────────────────────────────
const API_BASE         = ""; // Vite proxy forwards /api → localhost:3001
const IS_STATS_SANDBOX = false; // flip to false to enable live MLB stats
// Baseball Savant (arsenal + splits) shares the IS_STATS_SANDBOX gate —
// set false when backend is running so Savant routes are active too.
const IS_SAVANT_SANDBOX = IS_STATS_SANDBOX;

// Module-level auth token — set by App on login/logout so every fetch auto-includes it
let _authToken = null;

const apiFetch = async (path) => {
  const headers = {};
  if (_authToken) headers["Authorization"] = `Bearer ${_authToken}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (res.status === 401) {
    _authToken = null;
    window.dispatchEvent(new Event("propscout:unauthorized"));
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// POST / PATCH / DELETE helper (fire-and-forget safe)
// ── Daily Card ────────────────────────────────────────────────────────────────
// Fetches (or returns cached) the full-slate AI analysis from the backend.
const fetchDailyCard = async () => {
  const res = await fetch(`${API_BASE}/api/daily-card`);
  const body = await res.json().catch(() => ({}));
  if (res.status === 202) return body;
  if (!res.ok) {
    // Surface the real detail so we can diagnose failures
    const msg = body.detail ?? body.error ?? `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status, cap: body.cap });
  }
  return body;
};

const apiMutate = async (path, method, body) => {
  const headers = { "Content-Type": "application/json" };
  if (_authToken) headers["Authorization"] = `Bearer ${_authToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    _authToken = null;
    window.dispatchEvent(new Event("propscout:unauthorized"));
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// GAME ODDS — routed through backend (shared 20-min server cache)
// Replaces the old client-side fetch. The backend builds the same map
// structure and also returns eventIdMap so player-props calls can skip
// the Odds API events-list lookup.
const oddsCache = { data: null, ts: 0, remaining: null, used: null, fetchedAt: null, error: null, eventIdMap: null };
const ODDS_CACHE_TTL_MS = 20 * 60 * 1000; // mirror backend TTL

const fetchOdds = async (forceRefresh = false) => {
  if (IS_ODDS_SANDBOX) return null;

  // Return browser-side cache if still fresh (avoids even hitting the backend)
  if (!forceRefresh && oddsCache.data && (Date.now() - oddsCache.ts) < ODDS_CACHE_TTL_MS) {
    return oddsCache;
  }

  oddsCache.error = null;
  try {
    const res = await fetch(`${API_BASE}/api/odds`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
    }
    const data = await res.json();

    oddsCache.data       = data.map;
    oddsCache.eventIdMap = data.eventIdMap;
    oddsCache.ts         = Date.now();
    oddsCache.remaining  = data.remaining;
    oddsCache.used       = data.used;
    oddsCache.fetchedAt  = data.fetchedAt;
    return oddsCache;
  } catch (err) {
    console.error("Odds API error:", err);
    oddsCache.error = err.message;
    return oddsCache;
  }
};

// ─────────────────────────────────────────────
// MOCK SLATE DATA
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// BOARD "WHY?" MODAL — factor breakdown generator
// ─────────────────────────────────────────────
const generateWhyFactors = (c, type) => {
  const homeTeam = (c.gameLabel ?? "").split(" @ ")[1] ?? "";
  const pf = PARK_FACTORS[homeTeam] ?? NEUTRAL_PARK;
  const factors = [];

  if (type === "k") {
    const k9 = parseFloat(c.k9) || 0;
    const k9pts = k9 >= 10 ? 30 : k9 >= 9 ? 22 : k9 >= 8 ? 14 : k9 >= 7 ? 7 : 0;
    factors.push({ label: "K/9", value: k9 > 0 ? `${c.k9}` : "—",
      detail: k9 >= 10 ? "Elite swing-and-miss (≥10)" : k9 >= 9 ? "Very good (≥9)" : k9 >= 8 ? "Above avg (≥8)" : k9 >= 7 ? "Solid (≥7)" : "Below avg", pts: k9pts, max: 30 });

    const avgK = parseFloat(c.avgK3) || 0;
    const avgKpts = avgK >= 7 ? 22 : avgK >= 6 ? 16 : avgK >= 5 ? 10 : avgK >= 4 ? 5 : 0;
    factors.push({ label: "L3 avg K", value: c.avgK3 !== null ? `${c.avgK3}K/start` : "—",
      detail: avgK >= 7 ? "Strong recent K production" : avgK >= 6 ? "Good recent production" : avgK >= 5 ? "Average production" : avgK >= 4 ? "Modest production" : "Low recent production", pts: avgKpts, max: 22 });

    const pfKPts = Math.round((pf.k - 1.0) * 90);
    factors.push({ label: "Park (K factor)", value: homeTeam || "—",
      detail: pf.k >= 1.05 ? `K-friendly park (+${((pf.k - 1) * 100).toFixed(0)}%)` : pf.k <= 0.95 ? `K-suppressing (${((pf.k - 1) * 100).toFixed(0)}%)` : "Neutral park", pts: pfKPts, max: 18 });

    const umpPts = c.umpireRating === "pitcher" ? 15 : (!c.umpire || c.umpireRating === "neutral") ? 8 : 3;
    factors.push({ label: "Umpire", value: c.umpire ?? "TBD",
      detail: c.umpireRating === "pitcher" ? "Tight zone — historically boosts K rates" : c.umpireRating === "neutral" ? "Average zone" : !c.umpire ? "Not yet assigned" : "Wide zone — suppresses Ks", pts: umpPts, max: 15 });

    const whip = parseFloat(c.whip) || 0;
    const whipPts = whip > 0 ? (whip <= 1.05 ? 10 : whip <= 1.20 ? 6 : whip <= 1.35 ? 2 : 0) : 0;
    factors.push({ label: "WHIP", value: whip > 0 ? `${c.whip}` : "—",
      detail: whip <= 1.05 ? "Elite control — stays in games" : whip <= 1.20 ? "Good control" : whip <= 1.35 ? "Average control" : "Elevated baserunners — risk of early hook", pts: whipPts, max: 10 });

  } else if (type === "outs") {
    const avgIPStr = c.avgIP;
    const avgIPNum = (() => {
      if (!avgIPStr || avgIPStr === "—") return null;
      const [w, f = "0"] = String(avgIPStr).split(".");
      return parseInt(w) + parseInt(f) / 3;
    })();
    const ipPts = avgIPNum !== null ? (avgIPNum >= 6.5 ? 35 : avgIPNum >= 6.0 ? 26 : avgIPNum >= 5.5 ? 17 : avgIPNum >= 5.0 ? 8 : 0) : 0;
    factors.push({ label: "Avg IP (recent)", value: avgIPStr !== "—" ? `${avgIPStr} IP/start` : "—",
      detail: avgIPNum >= 6.5 ? "Goes deep — 6.5+ IP avg" : avgIPNum >= 6.0 ? "Quality starts — 6+ IP avg" : avgIPNum >= 5.5 ? "Solid depth — 5.5+ IP avg" : avgIPNum >= 5.0 ? "Average depth — ~5 IP" : "Short outings — risky for outs props", pts: ipPts, max: 35 });

    const whip = parseFloat(c.whip) || 0;
    const whipPts = whip > 0 ? (whip <= 1.00 ? 28 : whip <= 1.10 ? 20 : whip <= 1.20 ? 12 : whip <= 1.35 ? 5 : 0) : 0;
    factors.push({ label: "WHIP (control)", value: whip > 0 ? `${c.whip}` : "—",
      detail: whip <= 1.00 ? "Elite control — extends outings" : whip <= 1.10 ? "Very good control" : whip <= 1.20 ? "Good control" : whip <= 1.35 ? "Average control" : "Elevated baserunners — pitch count climbs fast", pts: whipPts, max: 28 });

    const era = parseFloat(c.era) || 0;
    const eraPts = era > 0 && era <= 3.0 ? 10 : era <= 3.5 ? 7 : era <= 4.5 ? 3 : 0;
    factors.push({ label: "ERA (season)", value: era > 0 ? `${c.era}` : "—",
      detail: era <= 3.0 ? "Elite — limiting runs, keeps manager trust" : era <= 3.5 ? "Very good" : era <= 4.5 ? "Average — occasional rough starts" : "Struggling — early exits more likely", pts: eraPts, max: 12 });

    const pfOutsPts = Math.round((1.0 - pf.hit) * 50);
    factors.push({ label: "Park (hit suppression)", value: homeTeam || "—",
      detail: pf.hit <= 0.95 ? `Pitcher-friendly — suppresses hits` : pf.hit >= 1.08 ? `Hitter-friendly — pitch count rises, risk of early exit` : "Neutral park", pts: pfOutsPts, max: 10 });

  } else if (type === "hr") {
    const slg = parseFloat(c.slg) || 0;
    const ops = parseFloat(c.ops) || 0;
    const slgPts = Math.round(slg > 0 ? (slg - 0.410) * 55 : (ops - 0.720) * 20);
    factors.push({ label: "Power (SLG)", value: slg > 0 ? `${c.slg} SLG` : `${c.ops} OPS`,
      detail: slg >= 0.500 ? "Power hitter (.500+ SLG)" : slg >= 0.440 ? "Above-avg power (.440+)" : slg >= 0.380 ? "Average power" : "Below-avg power — few extra-base hits", pts: Math.min(20, Math.max(-12, slgPts)), max: 20 });

    const hr = parseInt(c.hr) || 0;
    const hrPts = Math.round(hr * 0.7);
    factors.push({ label: "HR pace", value: `${hr} HR this season`,
      detail: hr >= 20 ? "High HR pace — proven power" : hr >= 10 ? "Moderate HR pace" : hr >= 5 ? "Low HR pace" : "Very few HRs this season", pts: hrPts, max: 15 });

    const pfHRPts = Math.round((pf.hr - 1.0) * 35);
    factors.push({ label: "Park (HR factor)", value: homeTeam || "—",
      detail: pf.hr >= 1.10 ? `HR-friendly (+${((pf.hr - 1) * 100).toFixed(0)}%)` : pf.hr <= 0.90 ? `HR-suppressing (${((pf.hr - 1) * 100).toFixed(0)}%)` : "Neutral park for HRs", pts: pfHRPts, max: 10 });

    if (c.windFav) {
      factors.push({ label: "Wind", value: "Blowing out", detail: "Wind out to CF/RF — historically adds 5–8% to HR rates", pts: 8, max: 8 });
    }

    const orderPts = c.order <= 3 ? 6 : c.order <= 5 ? 3 : c.order >= 8 ? -4 : 0;
    factors.push({ label: "Batting order", value: `#${c.order}`,
      detail: c.order <= 3 ? "Premium spot — most PA, best lineup protection" : c.order <= 5 ? "Middle of order" : c.order >= 8 ? "Bottom of order — fewer PA" : "Lower-middle order", pts: orderPts, max: 6 });

  } else { // hits
    const avg = parseFloat(c.avg) || 0;
    const ops = parseFloat(c.ops) || 0;
    const avgPts = Math.round(avg > 0 ? (avg - 0.250) * 140 : (ops - 0.720) * 15);
    factors.push({ label: "Season AVG", value: avg > 0 ? `${c.avg} AVG` : `${c.ops} OPS`,
      detail: avg >= 0.300 ? "Excellent contact hitter (.300+)" : avg >= 0.270 ? "Good hitter (.270+)" : avg >= 0.240 ? "Average (.240+)" : "Struggling — below .240", pts: Math.min(20, Math.max(-12, avgPts)), max: 20 });

    const l5 = (c.hitRate ?? []).slice(0, 5).reduce((a, v) => a + v, 0);
    const l5pts = Math.round((l5 / 5 - 0.40) * 28);
    factors.push({ label: "Recent form (L5)", value: `${l5}/5 games with a hit`,
      detail: l5 >= 4 ? "Hot — on a tear recently" : l5 >= 3 ? "Consistent — hitting in most games" : l5 >= 2 ? "Mixed — some cold games" : "Cold — struggling to get on base", pts: l5pts, max: 8 });

    const pfHitPts = Math.round((pf.hit - 1.0) * 28);
    factors.push({ label: "Park (hit factor)", value: homeTeam || "—",
      detail: pf.hit >= 1.08 ? `Hitter-friendly (+${((pf.hit - 1) * 100).toFixed(0)}%)` : pf.hit <= 0.93 ? `Pitcher-friendly (${((pf.hit - 1) * 100).toFixed(0)}%)` : "Neutral park for hits", pts: pfHitPts, max: 8 });

    const orderPts = c.order <= 3 ? 6 : c.order <= 5 ? 3 : c.order >= 8 ? -4 : 0;
    factors.push({ label: "Batting order", value: `#${c.order}`,
      detail: c.order <= 3 ? "Premium spot — most PA" : c.order <= 5 ? "Middle of order" : c.order >= 8 ? "Bottom of order — fewer PA" : "Lower-middle order", pts: orderPts, max: 6 });
  }

  return factors;
};

const SLATE = [
  {
    id: 1,
    away: { name: "New York Yankees", abbr: "NYY" },
    home: { name: "Philadelphia Phillies", abbr: "PHI" },
    time: "7:08 PM ET",
    stadium: "Citizens Bank Park",
    location: "Philadelphia, PA",
    weather: { temp: 74, condition: "Partly Cloudy", wind: "8 mph OUT to RF", humidity: "61%", roof: false, hrFavorable: true },
    umpire: { name: "Angel Hernandez", kRate: "19.2%", bbRate: "9.1%", tendency: "Tight zone — favors pitchers", rating: "pitcher" },
    odds: { awayML: "+115", homeML: "-135", total: "8.5", overOdds: "-110", underOdds: "-110", awaySpread: "+1.5", awaySpreadOdds: "-168", homeSpread: "-1.5", homeSpreadOdds: "+142", movement: "Total opened 9 — moved DOWN 0.5. Sharp under action.", lineMove: "under" },
    nrfi: {
      awayFirst: { scoredPct: "38%", avgRuns: 0.52, tendency: "Slow starters — 4th lowest 1st inn scoring" },
      homeFirst:  { scoredPct: "41%", avgRuns: 0.58, tendency: "Average 1st inning output" },
      lean: "NRFI", confidence: 64,
    },
    bullpen: {
      away: {
        fatigueLevel: "HIGH", restDays: 1, pitchesLast3: 187,
        grade: "B-", gradeColor: "#f59e0b",
        setupDepth: "THIN", lrBalance: "RH HEAVY",
        note: "Chapman threw 38p yesterday. Holmes available but pen is taxed.",
        lean: "Fatigue + RH heavy — LHB could exploit late game",
        relievers: [
          { name: "Clay Holmes",    role: "CL",    hand: "R", era: "2.84", whip: "1.08", vsL: ".231", vsR: ".198", lastApp: "3d ago", pitches: 18, status: "FRESH"    },
          { name: "Tommy Kahnle",   role: "SU",    hand: "R", era: "3.12", whip: "1.14", vsL: ".248", vsR: ".201", lastApp: "2d ago", pitches: 22, status: "FRESH"    },
          { name: "Aroldis Chapman",role: "SU",    hand: "L", era: "3.98", whip: "1.31", vsL: ".198", vsR: ".261", lastApp: "1d ago", pitches: 38, status: "TIRED"    },
          { name: "Ian Hamilton",   role: "MR",    hand: "R", era: "4.11", whip: "1.28", vsL: ".271", vsR: ".224", lastApp: "2d ago", pitches: 29, status: "MODERATE" },
          { name: "Victor González",role: "LOOGY", hand: "L", era: "3.44", whip: "1.19", vsL: ".189", vsR: ".278", lastApp: "4d ago", pitches: 14, status: "FRESH"    },
        ],
      },
      home: {
        fatigueLevel: "FRESH", restDays: 2, pitchesLast3: 112,
        grade: "A-", gradeColor: "#22c55e",
        setupDepth: "DEEP", lrBalance: "BALANCED",
        note: "Full pen available. Alvarado well rested.",
        lean: "Deep, balanced pen — strong hold potential in 7th/8th",
        relievers: [
          { name: "José Alvarado",  role: "CL",    hand: "L", era: "2.41", whip: "1.02", vsL: ".188", vsR: ".241", lastApp: "3d ago", pitches: 16, status: "FRESH"    },
          { name: "Seranthony Dom.",role: "SU",    hand: "R", era: "2.98", whip: "1.11", vsL: ".224", vsR: ".191", lastApp: "2d ago", pitches: 21, status: "FRESH"    },
          { name: "Matt Strahm",    role: "SU",    hand: "L", era: "3.21", whip: "1.18", vsL: ".201", vsR: ".248", lastApp: "3d ago", pitches: 19, status: "FRESH"    },
          { name: "Jeff Hoffman",   role: "MR",    hand: "R", era: "3.54", whip: "1.22", vsL: ".241", vsR: ".208", lastApp: "2d ago", pitches: 24, status: "FRESH"    },
          { name: "Orion Kerkering",role: "MR",    hand: "R", era: "3.88", whip: "1.26", vsL: ".258", vsR: ".221", lastApp: "4d ago", pitches: 18, status: "FRESH"    },
        ],
      },
    },
    pitcher: {
      name: "Zack Wheeler", team: "PHI", number: 45, hand: "R",
      era: "2.71", whip: "0.94", kPer9: "11.7", bbPer9: "1.98",
      avgIP: 6.4, avgK: 8.7, avgPC: 101, avgER: 1.9,
      season: { k: 195, bb: 33, ip: "149.2", wins: 10, losses: 5 },
      arsenal: [
        { abbr: "FF", type: "4-Seam Fastball", pct: 34, velo: "97.1", color: "#f97316" },
        { abbr: "SL", type: "Slider",          pct: 29, velo: "89.3", color: "#38bdf8" },
        { abbr: "SI", type: "Sinker",          pct: 19, velo: "96.5", color: "#facc15" },
        { abbr: "CH", type: "Changeup",        pct: 12, velo: "88.4", color: "#4ade80" },
        { abbr: "CU", type: "Curveball",       pct: 6,  velo: "82.7", color: "#c084fc" },
      ],
    },
    batter: {
      name: "Aaron Judge", team: "NYY", number: 99, hand: "R",
      avg: ".295", ops: "1.033", hr: 38, rbi: 102,
      avgH: 1.70, avgHR: 0.50, avgTB: 2.60,
      hitRate: "8/10", hrRate: "5/10", tbOver: "8/10",
      vsPitches: {
        FF: { avg: ".341", whiff: "18%", good: true,  note: "Crushes elevated FF" },
        SL: { avg: ".198", whiff: "34%", good: false, note: "Chases down and away" },
        SI: { avg: ".298", whiff: "14%", good: true,  note: "Drives sinker well" },
        CH: { avg: ".211", whiff: "31%", good: false, note: "Timing disrupted" },
        CU: { avg: ".224", whiff: "28%", good: null,  note: "Chases in the dirt" },
      },
    },
    lineups: {
      away: [
        { order: 1, name: "Anthony Volpe",    pos: "SS", hand: "R", avg: ".261", hr: 14, tb: 1.6, hitRate: [1,1,0,1,1], vsPitches: { FF: { avg: ".288", whiff: "22%", slg: ".441" }, SL: { avg: ".201", whiff: "36%", slg: ".318" }, SI: { avg: ".271", whiff: "16%", slg: ".412" }, CH: { avg: ".234", whiff: "29%", slg: ".368" }, CU: { avg: ".219", whiff: "31%", slg: ".341" } } },
        { order: 2, name: "Juan Soto",        pos: "RF", hand: "L", avg: ".288", hr: 21, tb: 2.1, hitRate: [1,0,1,1,1], vsPitches: { FF: { avg: ".301", whiff: "14%", slg: ".512" }, SL: { avg: ".244", whiff: "28%", slg: ".389" }, SI: { avg: ".289", whiff: "12%", slg: ".478" }, CH: { avg: ".198", whiff: "34%", slg: ".312" }, CU: { avg: ".271", whiff: "22%", slg: ".432" } } },
        { order: 3, name: "Aaron Judge",      pos: "CF", hand: "R", avg: ".295", hr: 38, tb: 2.6, hitRate: [1,1,0,1,1], vsPitches: { FF: { avg: ".341", whiff: "18%", slg: ".621" }, SL: { avg: ".198", whiff: "34%", slg: ".312" }, SI: { avg: ".298", whiff: "14%", slg: ".534" }, CH: { avg: ".211", whiff: "31%", slg: ".334" }, CU: { avg: ".224", whiff: "28%", slg: ".361" } } },
        { order: 4, name: "Giancarlo Stanton",pos: "DH", hand: "R", avg: ".244", hr: 24, tb: 2.2, hitRate: [0,1,1,0,1], vsPitches: { FF: { avg: ".268", whiff: "26%", slg: ".512" }, SL: { avg: ".178", whiff: "42%", slg: ".278" }, SI: { avg: ".251", whiff: "21%", slg: ".478" }, CH: { avg: ".188", whiff: "38%", slg: ".294" }, CU: { avg: ".201", whiff: "34%", slg: ".312" } } },
        { order: 5, name: "Jazz Chisholm",    pos: "3B", hand: "L", avg: ".271", hr: 18, tb: 1.9, hitRate: [1,1,1,0,0], vsPitches: { FF: { avg: ".291", whiff: "20%", slg: ".478" }, SL: { avg: ".221", whiff: "31%", slg: ".348" }, SI: { avg: ".264", whiff: "18%", slg: ".434" }, CH: { avg: ".241", whiff: "27%", slg: ".378" }, CU: { avg: ".258", whiff: "24%", slg: ".401" } } },
        { order: 6, name: "Paul Goldschmidt", pos: "1B", hand: "R", avg: ".258", hr: 16, tb: 1.7, hitRate: [0,1,0,1,1], vsPitches: { FF: { avg: ".271", whiff: "21%", slg: ".445" }, SL: { avg: ".211", whiff: "33%", slg: ".334" }, SI: { avg: ".261", whiff: "17%", slg: ".421" }, CH: { avg: ".224", whiff: "29%", slg: ".354" }, CU: { avg: ".238", whiff: "26%", slg: ".378" } } },
        { order: 7, name: "Austin Wells",     pos: "C",  hand: "L", avg: ".241", hr: 12, tb: 1.5, hitRate: [1,0,0,1,0], vsPitches: { FF: { avg: ".258", whiff: "24%", slg: ".412" }, SL: { avg: ".198", whiff: "37%", slg: ".312" }, SI: { avg: ".244", whiff: "19%", slg: ".389" }, CH: { avg: ".271", whiff: "21%", slg: ".434" }, CU: { avg: ".231", whiff: "28%", slg: ".361" } } },
        { order: 8, name: "Trent Grisham",    pos: "LF", hand: "L", avg: ".228", hr: 8,  tb: 1.3, hitRate: [0,0,1,0,1], vsPitches: { FF: { avg: ".241", whiff: "26%", slg: ".378" }, SL: { avg: ".188", whiff: "39%", slg: ".294" }, SI: { avg: ".231", whiff: "21%", slg: ".358" }, CH: { avg: ".258", whiff: "24%", slg: ".401" }, CU: { avg: ".214", whiff: "30%", slg: ".334" } } },
        { order: 9, name: "Gleyber Torres",   pos: "2B", hand: "R", avg: ".251", hr: 11, tb: 1.5, hitRate: [1,1,0,0,1], vsPitches: { FF: { avg: ".264", whiff: "22%", slg: ".421" }, SL: { avg: ".208", whiff: "34%", slg: ".328" }, SI: { avg: ".254", whiff: "18%", slg: ".401" }, CH: { avg: ".218", whiff: "30%", slg: ".344" }, CU: { avg: ".241", whiff: "27%", slg: ".378" } } },
      ],
      home: [
        { order: 1, name: "Kyle Schwarber",   pos: "LF", hand: "L", avg: ".248", hr: 31, tb: 2.1, hitRate: [1,0,1,1,0], vsPitches: { FF: ".271", SL: ".218", SI: ".254", CH: ".238", CU: ".221" } },
        { order: 2, name: "Trea Turner",      pos: "SS", hand: "R", avg: ".281", hr: 16, tb: 1.9, hitRate: [1,1,1,0,1], vsPitches: { FF: ".298", SL: ".241", SI: ".288", CH: ".261", CU: ".271" } },
        { order: 3, name: "Bryce Harper",     pos: "1B", hand: "L", avg: ".286", hr: 27, tb: 2.3, hitRate: [1,1,0,1,1], vsPitches: { FF: ".304", SL: ".231", SI: ".291", CH: ".254", CU: ".261" } },
        { order: 4, name: "Nick Castellanos", pos: "RF", hand: "R", avg: ".264", hr: 19, tb: 1.8, hitRate: [0,1,1,0,1], vsPitches: { FF: ".278", SL: ".224", SI: ".268", CH: ".241", CU: ".251" } },
        { order: 5, name: "Alec Bohm",        pos: "3B", hand: "R", avg: ".278", hr: 14, tb: 1.7, hitRate: [1,0,1,1,0], vsPitches: { FF: ".291", SL: ".238", SI: ".281", CH: ".254", CU: ".264" } },
        { order: 6, name: "J.T. Realmuto",    pos: "C",  hand: "R", avg: ".261", hr: 11, tb: 1.6, hitRate: [0,1,0,1,1], vsPitches: { FF: ".274", SL: ".221", SI: ".264", CH: ".241", CU: ".254" } },
        { order: 7, name: "Johan Rojas",      pos: "CF", hand: "R", avg: ".238", hr: 6,  tb: 1.3, hitRate: [1,0,0,0,1], vsPitches: { FF: ".251", SL: ".204", SI: ".241", CH: ".221", CU: ".231" } },
        { order: 8, name: "Bryson Stott",     pos: "2B", hand: "L", avg: ".254", hr: 8,  tb: 1.4, hitRate: [0,1,1,0,0], vsPitches: { FF: ".268", SL: ".214", SI: ".258", CH: ".244", CU: ".241" } },
        { order: 9, name: "Edmundo Sosa",     pos: "DH", hand: "R", avg: ".231", hr: 4,  tb: 1.2, hitRate: [0,0,1,0,1], vsPitches: { FF: ".244", SL: ".198", SI: ".234", CH: ".218", CU: ".224" } },
      ],
    },
    props: [
      { label: "Wheeler K's O/U 7.5",      confidence: 78, lean: "OVER",  positive: true,  reason: "Avg 8.7 K/game · Judge whiffs 34% vs SL · Tight ump zone" },
      { label: "Judge Anytime HR",          confidence: 44, lean: "YES",   positive: true,  reason: "5/10 recent games · Wind blowing OUT to RF" },
      { label: "Judge Hits O/U 1.5",        confidence: 65, lean: "OVER",  positive: true,  reason: ".341 avg vs FF — Wheeler's #1 pitch at 34%" },
      { label: "Judge Total Bases O/U 1.5", confidence: 72, lean: "OVER",  positive: true,  reason: "2+ TB in 8/10 · High SLG vs fastball" },
      { label: "Wheeler Walks O/U 2.5",     confidence: 71, lean: "UNDER", positive: false, reason: "1.98 BB/9 all season · Tight ump zone helps" },
      { label: "NRFI",                      confidence: 64, lean: "YES",   positive: true,  reason: "Wheeler 0 ER in 6/10 · NYY slow 1st inning starters · Line moved under" },
    ],
  },
  {
    id: 2,
    away: { name: "Atlanta Braves", abbr: "ATL" },
    home: { name: "Los Angeles Dodgers", abbr: "LAD" },
    time: "10:10 PM ET",
    stadium: "Dodger Stadium",
    location: "Los Angeles, CA",
    weather: { temp: 68, condition: "Clear", wind: "5 mph IN from CF", humidity: "55%", roof: false, hrFavorable: false },
    umpire: { name: "Ángel Campos", kRate: "22.1%", bbRate: "7.8%", tendency: "Wide zone — high K environment", rating: "pitcher" },
    odds: { awayML: "+142", homeML: "-162", total: "7.5", overOdds: "-115", underOdds: "-105", awaySpread: "+1.5", awaySpreadOdds: "-155", homeSpread: "-1.5", homeSpreadOdds: "+132", movement: "Total opened 8 — moved DOWN 0.5. Heavy under action early.", lineMove: "under" },
    nrfi: {
      awayFirst: { scoredPct: "44%", avgRuns: 0.61, tendency: "Braves aggressive early in counts" },
      homeFirst:  { scoredPct: "39%", avgRuns: 0.54, tendency: "Dodgers patient — often 2nd time through" },
      lean: "NRFI", confidence: 61,
    },
    bullpen: {
      away: {
        fatigueLevel: "MODERATE", restDays: 2, pitchesLast3: 134,
        grade: "B", gradeColor: "#f59e0b",
        setupDepth: "MODERATE", lrBalance: "BALANCED",
        note: "Minter used 2 days ago. Rest of pen fresh.",
        lean: "Solid pen, balanced — no major late-game exploits",
        relievers: [
          { name: "Raisel Iglesias", role: "CL",  hand: "R", era: "2.61", whip: "1.04", vsL: ".221", vsR: ".188", lastApp: "3d ago", pitches: 17, status: "FRESH"    },
          { name: "A.J. Minter",     role: "SU",  hand: "L", era: "3.14", whip: "1.18", vsL: ".194", vsR: ".258", lastApp: "2d ago", pitches: 28, status: "MODERATE" },
          { name: "Joe Jiménez",     role: "SU",  hand: "R", era: "3.41", whip: "1.21", vsL: ".238", vsR: ".204", lastApp: "4d ago", pitches: 19, status: "FRESH"    },
          { name: "Dylan Lee",       role: "LOOGY",hand:"L", era: "3.78", whip: "1.29", vsL: ".188", vsR: ".271", lastApp: "3d ago", pitches: 14, status: "FRESH"    },
          { name: "Pierce Johnson",  role: "MR",  hand: "R", era: "4.02", whip: "1.31", vsL: ".251", vsR: ".214", lastApp: "2d ago", pitches: 21, status: "FRESH"    },
        ],
      },
      home: {
        fatigueLevel: "FRESH", restDays: 3, pitchesLast3: 98,
        grade: "A", gradeColor: "#22c55e",
        setupDepth: "DEEP", lrBalance: "BALANCED",
        note: "Dodgers pen fully rested. Treinen available.",
        lean: "Elite depth, fully rested — late leads are safe",
        relievers: [
          { name: "Evan Phillips",   role: "CL",  hand: "R", era: "2.18", whip: "0.94", vsL: ".211", vsR: ".178", lastApp: "4d ago", pitches: 16, status: "FRESH"    },
          { name: "Blake Treinen",   role: "SU",  hand: "R", era: "2.54", whip: "1.01", vsL: ".224", vsR: ".189", lastApp: "4d ago", pitches: 18, status: "FRESH"    },
          { name: "Alex Vesia",      role: "SU",  hand: "L", era: "2.88", whip: "1.09", vsL: ".191", vsR: ".248", lastApp: "3d ago", pitches: 14, status: "FRESH"    },
          { name: "Brusdar Graterol",role: "MR",  hand: "R", era: "3.12", whip: "1.14", vsL: ".234", vsR: ".198", lastApp: "3d ago", pitches: 22, status: "FRESH"    },
          { name: "Yohan Ramírez",   role: "MR",  hand: "R", era: "3.88", whip: "1.28", vsL: ".248", vsR: ".211", lastApp: "5d ago", pitches: 19, status: "FRESH"    },
        ],
      },
    },
    lineups: {
      away: [
        { order: 1, name: "Ronald Acuña Jr.", pos: "RF", hand: "R", avg: ".312", hr: 29, tb: 2.4, hitRate: [1,1,1,0,1], vsPitches: { FF: ".334", SL: ".261", CH: ".298" } },
        { order: 2, name: "Ozzie Albies",     pos: "2B", hand: "S", avg: ".271", hr: 16, tb: 1.8, hitRate: [1,0,1,1,0], vsPitches: { FF: ".288", SL: ".234", CH: ".261" } },
        { order: 3, name: "Matt Olson",       pos: "1B", hand: "L", avg: ".258", hr: 32, tb: 2.2, hitRate: [0,1,1,0,1], vsPitches: { FF: ".271", SL: ".214", CH: ".244" } },
        { order: 4, name: "Austin Riley",     pos: "3B", hand: "R", avg: ".274", hr: 26, tb: 2.0, hitRate: [1,1,0,1,1], vsPitches: { FF: ".291", SL: ".228", CH: ".258" } },
        { order: 5, name: "Marcell Ozuna",    pos: "DH", hand: "R", avg: ".261", hr: 22, tb: 1.9, hitRate: [0,1,1,0,0], vsPitches: { FF: ".278", SL: ".218", CH: ".248" } },
        { order: 6, name: "Michael Harris",   pos: "CF", hand: "L", avg: ".251", hr: 14, tb: 1.6, hitRate: [1,0,0,1,1], vsPitches: { FF: ".264", SL: ".208", CH: ".238" } },
        { order: 7, name: "Sean Murphy",      pos: "C",  hand: "R", avg: ".244", hr: 11, tb: 1.5, hitRate: [0,1,0,0,1], vsPitches: { FF: ".258", SL: ".204", CH: ".231" } },
        { order: 8, name: "Forrest Wall",     pos: "LF", hand: "L", avg: ".231", hr: 6,  tb: 1.3, hitRate: [1,0,0,0,0], vsPitches: { FF: ".244", SL: ".194", CH: ".221" } },
        { order: 9, name: "Orlando Arcia",    pos: "SS", hand: "R", avg: ".238", hr: 8,  tb: 1.4, hitRate: [0,1,1,0,0], vsPitches: { FF: ".251", SL: ".201", CH: ".228" } },
      ],
      home: [
        { order: 1, name: "Mookie Betts",     pos: "RF", hand: "R", avg: ".291", hr: 24, tb: 2.1, hitRate: [1,1,1,0,1], vsPitches: { FF: ".311", SL: ".248", CH: ".281" } },
        { order: 2, name: "Freddie Freeman",  pos: "1B", hand: "L", avg: ".311", hr: 22, tb: 2.1, hitRate: [1,0,1,1,1], vsPitches: { FF: ".298", SL: ".241", CH: ".333" } },
        { order: 3, name: "Shohei Ohtani",    pos: "DH", hand: "L", avg: ".298", hr: 41, tb: 2.8, hitRate: [1,1,0,1,1], vsPitches: { FF: ".318", SL: ".251", CH: ".288" } },
        { order: 4, name: "Will Smith",       pos: "C",  hand: "R", avg: ".264", hr: 18, tb: 1.8, hitRate: [0,1,1,0,1], vsPitches: { FF: ".278", SL: ".228", CH: ".261" } },
        { order: 5, name: "Max Muncy",        pos: "3B", hand: "L", avg: ".241", hr: 21, tb: 1.8, hitRate: [1,0,0,1,0], vsPitches: { FF: ".258", SL: ".208", CH: ".244" } },
        { order: 6, name: "James Outman",     pos: "CF", hand: "L", avg: ".238", hr: 12, tb: 1.5, hitRate: [0,0,1,1,0], vsPitches: { FF: ".251", SL: ".201", CH: ".234" } },
        { order: 7, name: "Miguel Rojas",     pos: "SS", hand: "R", avg: ".248", hr: 5,  tb: 1.3, hitRate: [1,0,0,0,1], vsPitches: { FF: ".261", SL: ".211", CH: ".241" } },
        { order: 8, name: "Chris Taylor",     pos: "LF", hand: "R", avg: ".231", hr: 7,  tb: 1.3, hitRate: [0,1,0,0,0], vsPitches: { FF: ".244", SL: ".198", CH: ".224" } },
        { order: 9, name: "Gavin Lux",        pos: "2B", hand: "L", avg: ".244", hr: 6,  tb: 1.3, hitRate: [1,0,1,0,0], vsPitches: { FF: ".258", SL: ".204", CH: ".238" } },
      ],
    },
    pitcher: {
      name: "Spencer Strider", team: "ATL", number: 99, hand: "R",
      era: "3.18", whip: "1.02", kPer9: "13.2", bbPer9: "2.41",
      avgIP: 5.9, avgK: 9.2, avgPC: 97, avgER: 2.1,
      season: { k: 211, bb: 44, ip: "142.0", wins: 12, losses: 6 },
      arsenal: [
        { abbr: "FF", type: "4-Seam Fastball", pct: 62, velo: "98.8", color: "#f97316" },
        { abbr: "SL", type: "Slider",          pct: 29, velo: "87.4", color: "#38bdf8" },
        { abbr: "CH", type: "Changeup",        pct: 9,  velo: "86.1", color: "#4ade80" },
      ],
    },
    batter: {
      name: "Freddie Freeman", team: "LAD", number: 5, hand: "L",
      avg: ".311", ops: ".952", hr: 22, rbi: 89,
      avgH: 1.50, avgHR: 0.30, avgTB: 2.10,
      hitRate: "7/10", hrRate: "3/10", tbOver: "6/10",
      vsPitches: {
        FF: { avg: ".298", whiff: "16%", good: true,  note: "Good contact vs hard FB" },
        SL: { avg: ".241", whiff: "27%", good: null,  note: "Average vs slider" },
        CH: { avg: ".333", whiff: "12%", good: true,  note: "Feasts on changeups" },
      },
    },
    props: [
      { label: "Strider K's O/U 8.5",        confidence: 81, lean: "OVER",  positive: true,  reason: "Avg 9.2 K · 62% FF usage · Wide ump zone" },
      { label: "Freeman Hits O/U 1.5",        confidence: 55, lean: "OVER",  positive: true,  reason: "7/10 hit rate but wind blowing IN" },
      { label: "Freeman Total Bases O/U 1.5", confidence: 51, lean: "UNDER", positive: false, reason: "Wind in reduces XBH · Strider dominant vs LHB" },
      { label: "NRFI",                        confidence: 61, lean: "YES",   positive: true,  reason: "Both teams slow starters · Line moved under" },
    ],
  },
  {
    id: 3,
    away: { name: "Houston Astros", abbr: "HOU" },
    home: { name: "Texas Rangers", abbr: "TEX" },
    time: "8:05 PM ET",
    stadium: "Globe Life Field",
    location: "Arlington, TX",
    weather: { temp: 72, condition: "Dome", wind: "N/A", humidity: "N/A", roof: true, hrFavorable: false },
    umpire: { name: "CB Bucknor", kRate: "20.4%", bbRate: "8.6%", tendency: "Inconsistent zone — watch BB props", rating: "neutral" },
    odds: { awayML: "-108", homeML: "-112", total: "9.0", overOdds: "-110", underOdds: "-110", awaySpread: "+1.5", awaySpreadOdds: "-182", homeSpread: "-1.5", homeSpreadOdds: "+154", movement: "Total opened 8.5 — moved UP 0.5. Public over money flowing in.", lineMove: "over" },
    nrfi: {
      awayFirst: { scoredPct: "48%", avgRuns: 0.71, tendency: "Astros lead majors in 1st inn scoring" },
      homeFirst:  { scoredPct: "43%", avgRuns: 0.62, tendency: "Rangers active early vs new pitchers" },
      lean: "YRFI", confidence: 67,
    },
    bullpen: {
      away: {
        fatigueLevel: "HIGH", restDays: 1, pitchesLast3: 201,
        grade: "C+", gradeColor: "#ef4444",
        setupDepth: "THIN", lrBalance: "RH HEAVY",
        note: "Pressly used back-to-back. Bullpen taxed.",
        lean: "Tired RH pen — LHB with power should be monitored late",
        relievers: [
          { name: "Ryan Pressly",    role: "CL",  hand: "R", era: "3.44", whip: "1.21", vsL: ".244", vsR: ".201", lastApp: "1d ago", pitches: 34, status: "TIRED"    },
          { name: "Phil Maton",      role: "SU",  hand: "R", era: "3.88", whip: "1.28", vsL: ".258", vsR: ".214", lastApp: "2d ago", pitches: 31, status: "MODERATE" },
          { name: "Bryan Abreu",     role: "SU",  hand: "R", era: "3.21", whip: "1.18", vsL: ".238", vsR: ".198", lastApp: "3d ago", pitches: 24, status: "FRESH"    },
          { name: "Rafael Montero",  role: "MR",  hand: "R", era: "4.12", whip: "1.34", vsL: ".261", vsR: ".221", lastApp: "1d ago", pitches: 28, status: "TIRED"    },
          { name: "Héctor Neris",    role: "MR",  hand: "R", era: "4.44", whip: "1.38", vsL: ".271", vsR: ".231", lastApp: "2d ago", pitches: 26, status: "MODERATE" },
        ],
      },
      home: {
        fatigueLevel: "MODERATE", restDays: 2, pitchesLast3: 145,
        grade: "B-", gradeColor: "#f59e0b",
        setupDepth: "MODERATE", lrBalance: "BALANCED",
        note: "Leclerc available. Dunning may be limited.",
        lean: "Serviceable pen, some LH options available",
        relievers: [
          { name: "José Leclerc",    role: "CL",  hand: "R", era: "3.01", whip: "1.12", vsL: ".231", vsR: ".194", lastApp: "3d ago", pitches: 19, status: "FRESH"    },
          { name: "Will Smith",      role: "SU",  hand: "L", era: "3.34", whip: "1.21", vsL: ".201", vsR: ".261", lastApp: "2d ago", pitches: 22, status: "FRESH"    },
          { name: "Josh Sborz",      role: "SU",  hand: "R", era: "3.78", whip: "1.26", vsL: ".248", vsR: ".208", lastApp: "2d ago", pitches: 24, status: "FRESH"    },
          { name: "Brock Burke",     role: "LOOGY",hand:"L", era: "3.91", whip: "1.29", vsL: ".194", vsR: ".268", lastApp: "4d ago", pitches: 16, status: "FRESH"    },
          { name: "Cole Ragans",     role: "MR",  hand: "L", era: "4.21", whip: "1.36", vsL: ".208", vsR: ".278", lastApp: "1d ago", pitches: 31, status: "TIRED"    },
        ],
      },
    },
    lineups: {
      away: [
        { order: 1, name: "Jose Altuve",      pos: "2B", hand: "R", avg: ".291", hr: 14, tb: 1.8, hitRate: [1,1,1,1,0], vsPitches: { SI: ".298", CU: ".228", CH: ".311", FF: ".304" } },
        { order: 2, name: "Alex Bregman",     pos: "3B", hand: "R", avg: ".271", hr: 18, tb: 1.8, hitRate: [0,1,1,0,1], vsPitches: { SI: ".281", CU: ".218", CH: ".264", FF: ".288" } },
        { order: 3, name: "Yordan Alvarez",   pos: "DH", hand: "L", avg: ".301", hr: 31, tb: 2.3, hitRate: [1,1,0,1,1], vsPitches: { SI: ".278", CU: ".198", CH: ".312", FF: ".321" } },
        { order: 4, name: "Kyle Tucker",      pos: "RF", hand: "L", avg: ".281", hr: 24, tb: 2.1, hitRate: [1,0,1,1,0], vsPitches: { SI: ".291", CU: ".211", CH: ".298", FF: ".304" } },
        { order: 5, name: "Mauricio Dubon",   pos: "CF", hand: "R", avg: ".254", hr: 8,  tb: 1.5, hitRate: [0,1,0,1,1], vsPitches: { SI: ".261", CU: ".201", CH: ".248", FF: ".268" } },
        { order: 6, name: "Jon Singleton",    pos: "1B", hand: "L", avg: ".238", hr: 16, tb: 1.6, hitRate: [1,0,0,0,1], vsPitches: { SI: ".248", CU: ".194", CH: ".241", FF: ".251" } },
        { order: 7, name: "Yainer Diaz",      pos: "C",  hand: "R", avg: ".261", hr: 9,  tb: 1.5, hitRate: [0,1,1,0,0], vsPitches: { SI: ".271", CU: ".208", CH: ".258", FF: ".278" } },
        { order: 8, name: "Jake Meyers",      pos: "LF", hand: "R", avg: ".241", hr: 7,  tb: 1.3, hitRate: [1,0,0,1,0], vsPitches: { SI: ".251", CU: ".198", CH: ".244", FF: ".258" } },
        { order: 9, name: "Jeremy Peña",      pos: "SS", hand: "R", avg: ".248", hr: 11, tb: 1.5, hitRate: [0,1,0,0,1], vsPitches: { SI: ".258", CU: ".204", CH: ".251", FF: ".264" } },
      ],
      home: [
        { order: 1, name: "Marcus Semien",    pos: "2B", hand: "R", avg: ".258", hr: 18, tb: 1.8, hitRate: [1,1,0,1,0], vsPitches: { SI: ".268", CU: ".211", CH: ".261", FF: ".274" } },
        { order: 2, name: "Corey Seager",     pos: "SS", hand: "L", avg: ".281", hr: 22, tb: 2.1, hitRate: [1,0,1,1,1], vsPitches: { SI: ".291", CU: ".224", CH: ".274", FF: ".298" } },
        { order: 3, name: "Adolis Garcia",    pos: "RF", hand: "R", avg: ".258", hr: 24, tb: 1.9, hitRate: [0,1,1,0,1], vsPitches: { SI: ".268", CU: ".208", CH: ".261", FF: ".274" } },
        { order: 4, name: "Nathaniel Lowe",   pos: "1B", hand: "L", avg: ".271", hr: 14, tb: 1.7, hitRate: [1,1,0,0,1], vsPitches: { SI: ".281", CU: ".218", CH: ".268", FF: ".288" } },
        { order: 5, name: "Josh Jung",        pos: "3B", hand: "R", avg: ".264", hr: 16, tb: 1.7, hitRate: [0,0,1,1,0], vsPitches: { SI: ".274", CU: ".211", CH: ".261", FF: ".281" } },
        { order: 6, name: "Jonah Heim",       pos: "C",  hand: "S", avg: ".241", hr: 9,  tb: 1.4, hitRate: [1,0,0,0,1], vsPitches: { SI: ".251", CU: ".198", CH: ".244", FF: ".258" } },
        { order: 7, name: "Travis Jankowski", pos: "LF", hand: "L", avg: ".234", hr: 4,  tb: 1.2, hitRate: [0,1,0,0,0], vsPitches: { SI: ".244", CU: ".191", CH: ".238", FF: ".251" } },
        { order: 8, name: "Leody Taveras",    pos: "CF", hand: "S", avg: ".238", hr: 6,  tb: 1.3, hitRate: [1,0,1,0,0], vsPitches: { SI: ".248", CU: ".198", CH: ".241", FF: ".254" } },
        { order: 9, name: "Ezequiel Duran",   pos: "DH", hand: "R", avg: ".244", hr: 8,  tb: 1.4, hitRate: [0,0,0,1,1], vsPitches: { SI: ".254", CU: ".201", CH: ".244", FF: ".261" } },
      ],
    },
    pitcher: {
      name: "Framber Valdez", team: "HOU", number: 59, hand: "L",
      era: "2.91", whip: "1.08", kPer9: "8.9", bbPer9: "3.12",
      avgIP: 6.1, avgK: 6.8, avgPC: 103, avgER: 2.2,
      season: { k: 158, bb: 55, ip: "148.2", wins: 11, losses: 7 },
      arsenal: [
        { abbr: "SI", type: "Sinker",    pct: 44, velo: "93.8", color: "#facc15" },
        { abbr: "CU", type: "Curveball", pct: 31, velo: "76.4", color: "#c084fc" },
        { abbr: "CH", type: "Changeup",  pct: 14, velo: "88.2", color: "#4ade80" },
        { abbr: "FF", type: "4-Seam",    pct: 11, velo: "94.1", color: "#f97316" },
      ],
    },
    batter: {
      name: "Yordan Alvarez", team: "HOU", number: 44, hand: "L",
      avg: ".301", ops: "1.011", hr: 31, rbi: 95,
      avgH: 1.40, avgHR: 0.40, avgTB: 2.30,
      hitRate: "7/10", hrRate: "4/10", tbOver: "7/10",
      vsPitches: {
        SI: { avg: ".278", whiff: "19%", good: true,  note: "Solid contact on sinkers" },
        CU: { avg: ".198", whiff: "33%", good: false, note: "Breaking ball gives trouble" },
        CH: { avg: ".312", whiff: "14%", good: true,  note: "Crushes changeups" },
        FF: { avg: ".321", whiff: "15%", good: true,  note: "Elite vs fastball" },
      },
    },
    props: [
      { label: "Valdez K's O/U 5.5",         confidence: 62, lean: "OVER",  positive: true,  reason: "Avg 6.8 K · dome conditions neutral" },
      { label: "Alvarez Hits O/U 1.5",        confidence: 58, lean: "OVER",  positive: true,  reason: "7/10 hit rate · strong vs CU" },
      { label: "Alvarez Total Bases O/U 1.5", confidence: 64, lean: "OVER",  positive: true,  reason: "2+ TB in 7/10 · dome removes weather factor" },
      { label: "YRFI",                        confidence: 67, lean: "YES",   positive: true,  reason: "Astros lead majors in 1st inn scoring · line moved over" },
    ],
  },
  {
    id: 4,
    away: { name: "Chicago Cubs", abbr: "CHC" },
    home: { name: "Milwaukee Brewers", abbr: "MIL" },
    time: "7:40 PM ET",
    stadium: "American Family Field",
    location: "Milwaukee, WI",
    weather: { temp: 58, condition: "Overcast", wind: "14 mph IN from RF", humidity: "71%", roof: false, hrFavorable: false },
    umpire: { name: "Joe West", kRate: "18.8%", bbRate: "9.8%", tendency: "Slow pace · generous outside corner", rating: "neutral" },
    odds: { awayML: "+128", homeML: "-148", total: "7.0", overOdds: "-110", underOdds: "-110", awaySpread: "+1.5", awaySpreadOdds: "-162", homeSpread: "-1.5", homeSpreadOdds: "+138", movement: "Total opened 7.5 — moved DOWN 0.5. Cold, wind in — sharp under action.", lineMove: "under" },
    nrfi: {
      awayFirst: { scoredPct: "35%", avgRuns: 0.44, tendency: "Cubs among lowest 1st inn scorers" },
      homeFirst:  { scoredPct: "37%", avgRuns: 0.49, tendency: "Brewers patient — grind early counts" },
      lean: "NRFI", confidence: 72,
    },
    bullpen: {
      away: {
        fatigueLevel: "FRESH", restDays: 3, pitchesLast3: 89,
        grade: "B", gradeColor: "#f59e0b",
        setupDepth: "MODERATE", lrBalance: "BALANCED",
        note: "Mostly rested. Hendricks closed yesterday but pen otherwise fresh.",
        lean: "Decent pen but cold weather limits leverage situations",
        relievers: [
          { name: "Adbert Alzolay",  role: "CL",  hand: "R", era: "2.88", whip: "1.08", vsL: ".221", vsR: ".188", lastApp: "3d ago", pitches: 18, status: "FRESH"    },
          { name: "Brad Boxberger",  role: "SU",  hand: "R", era: "3.44", whip: "1.21", vsL: ".241", vsR: ".201", lastApp: "4d ago", pitches: 21, status: "FRESH"    },
          { name: "Julian Merryweather",role:"SU",hand: "R", era: "3.71", whip: "1.24", vsL: ".254", vsR: ".211", lastApp: "5d ago", pitches: 17, status: "FRESH"    },
          { name: "Luke Little",     role: "LOOGY",hand:"L", era: "3.54", whip: "1.22", vsL: ".198", vsR: ".271", lastApp: "3d ago", pitches: 14, status: "FRESH"    },
          { name: "Michael Fulmer",  role: "MR",  hand: "R", era: "4.08", whip: "1.31", vsL: ".261", vsR: ".221", lastApp: "1d ago", pitches: 19, status: "TIRED"    },
        ],
      },
      home: {
        fatigueLevel: "MODERATE", restDays: 2, pitchesLast3: 121,
        grade: "A-", gradeColor: "#22c55e",
        setupDepth: "DEEP", lrBalance: "BALANCED",
        note: "Devin Williams elite closer. Payamps used yesterday.",
        lean: "Elite closer, deep pen — late leads heavily protected",
        relievers: [
          { name: "Devin Williams",  role: "CL",  hand: "R", era: "1.88", whip: "0.88", vsL: ".178", vsR: ".154", lastApp: "3d ago", pitches: 16, status: "FRESH"    },
          { name: "Joel Payamps",    role: "SU",  hand: "R", era: "3.18", whip: "1.14", vsL: ".228", vsR: ".194", lastApp: "1d ago", pitches: 26, status: "TIRED"    },
          { name: "Elvis Peguero",   role: "SU",  hand: "R", era: "3.44", whip: "1.21", vsL: ".241", vsR: ".201", lastApp: "3d ago", pitches: 19, status: "FRESH"    },
          { name: "Jake Cousins",    role: "LOOGY",hand:"R", era: "3.68", whip: "1.26", vsL: ".218", vsR: ".248", lastApp: "4d ago", pitches: 15, status: "FRESH"    },
          { name: "Bryse Wilson",    role: "MR",  hand: "R", era: "4.11", whip: "1.33", vsL: ".258", vsR: ".218", lastApp: "2d ago", pitches: 22, status: "FRESH"    },
        ],
      },
    },
    lineups: {
      away: [
        { order: 1, name: "Ian Happ",         pos: "LF", hand: "S", avg: ".261", hr: 16, tb: 1.7, hitRate: [1,0,1,0,1], vsPitches: { CT: ".238", SI: ".271", SL: ".214", CH: ".294", CU: ".248" } },
        { order: 2, name: "Dansby Swanson",   pos: "SS", hand: "R", avg: ".244", hr: 14, tb: 1.6, hitRate: [0,1,0,1,0], vsPitches: { CT: ".221", SI: ".254", SL: ".198", CH: ".278", CU: ".231" } },
        { order: 3, name: "Cody Bellinger",   pos: "CF", hand: "L", avg: ".268", hr: 18, tb: 1.8, hitRate: [1,1,0,1,1], vsPitches: { CT: ".244", SI: ".278", SL: ".218", CH: ".301", CU: ".254" } },
        { order: 4, name: "Seiya Suzuki",     pos: "RF", hand: "R", avg: ".274", hr: 18, tb: 1.8, hitRate: [0,1,1,0,0], vsPitches: { CT: ".231", SI: ".288", SL: ".219", CH: ".301", CU: ".244" } },
        { order: 5, name: "Christopher Morel",pos: "3B", hand: "R", avg: ".251", hr: 19, tb: 1.7, hitRate: [1,0,0,1,0], vsPitches: { CT: ".218", SI: ".261", SL: ".201", CH: ".271", CU: ".234" } },
        { order: 6, name: "Michael Busch",    pos: "1B", hand: "L", avg: ".258", hr: 14, tb: 1.6, hitRate: [0,0,1,0,1], vsPitches: { CT: ".228", SI: ".268", SL: ".208", CH: ".284", CU: ".241" } },
        { order: 7, name: "Miguel Amaya",     pos: "C",  hand: "R", avg: ".234", hr: 8,  tb: 1.3, hitRate: [1,0,0,0,0], vsPitches: { CT: ".208", SI: ".244", SL: ".191", CH: ".261", CU: ".221" } },
        { order: 8, name: "Miles Mastrobuoni",pos: "2B", hand: "R", avg: ".228", hr: 4,  tb: 1.2, hitRate: [0,1,0,0,0], vsPitches: { CT: ".201", SI: ".238", SL: ".184", CH: ".254", CU: ".214" } },
        { order: 9, name: "Pete Crow-Armstrong",pos:"CF",hand: "L", avg: ".241", hr: 9,  tb: 1.4, hitRate: [1,0,1,0,0], vsPitches: { CT: ".214", SI: ".251", SL: ".198", CH: ".268", CU: ".228" } },
      ],
      home: [
        { order: 1, name: "Christian Yelich", pos: "LF", hand: "L", avg: ".271", hr: 19, tb: 1.9, hitRate: [1,1,0,1,0], vsPitches: { CT: ".248", SI: ".281", SL: ".224", CH: ".304", CU: ".258" } },
        { order: 2, name: "Willy Adames",     pos: "SS", hand: "R", avg: ".258", hr: 22, tb: 1.9, hitRate: [0,1,1,0,1], vsPitches: { CT: ".234", SI: ".268", SL: ".211", CH: ".288", CU: ".244" } },
        { order: 3, name: "William Contreras",pos: "C",  hand: "R", avg: ".274", hr: 17, tb: 1.8, hitRate: [1,1,0,1,1], vsPitches: { CT: ".251", SI: ".284", SL: ".228", CH: ".301", CU: ".261" } },
        { order: 4, name: "Rhys Hoskins",     pos: "1B", hand: "R", avg: ".248", hr: 24, tb: 1.9, hitRate: [0,0,1,1,0], vsPitches: { CT: ".224", SI: ".258", SL: ".201", CH: ".274", CU: ".234" } },
        { order: 5, name: "Mark Canha",       pos: "RF", hand: "R", avg: ".261", hr: 12, tb: 1.6, hitRate: [1,0,0,1,0], vsPitches: { CT: ".238", SI: ".271", SL: ".214", CH: ".288", CU: ".248" } },
        { order: 6, name: "Blake Perkins",    pos: "CF", hand: "S", avg: ".244", hr: 7,  tb: 1.4, hitRate: [0,1,0,0,1], vsPitches: { CT: ".221", SI: ".254", SL: ".198", CH: ".271", CU: ".231" } },
        { order: 7, name: "Joey Wiemer",      pos: "DH", hand: "R", avg: ".231", hr: 9,  tb: 1.3, hitRate: [1,0,0,0,0], vsPitches: { CT: ".208", SI: ".241", SL: ".188", CH: ".258", CU: ".218" } },
        { order: 8, name: "Andruw Monasterio",pos: "3B", hand: "R", avg: ".238", hr: 5,  tb: 1.2, hitRate: [0,0,1,0,0], vsPitches: { CT: ".214", SI: ".248", SL: ".194", CH: ".264", CU: ".224" } },
        { order: 9, name: "Sal Frelick",      pos: "2B", hand: "L", avg: ".254", hr: 6,  tb: 1.3, hitRate: [1,0,0,1,0], vsPitches: { CT: ".231", SI: ".264", SL: ".208", CH: ".281", CU: ".241" } },
      ],
    },
    pitcher: {
      name: "Corbin Burnes", team: "MIL", number: 39, hand: "R",
      era: "2.94", whip: "0.97", kPer9: "10.8", bbPer9: "1.89",
      avgIP: 6.6, avgK: 8.1, avgPC: 99, avgER: 1.7,
      season: { k: 201, bb: 35, ip: "155.1", wins: 13, losses: 5 },
      arsenal: [
        { abbr: "CT", type: "Cutter",          pct: 36, velo: "94.2", color: "#a78bfa" },
        { abbr: "SI", type: "Sinker",          pct: 28, velo: "93.8", color: "#facc15" },
        { abbr: "SL", type: "Slider",          pct: 18, velo: "86.1", color: "#38bdf8" },
        { abbr: "CH", type: "Changeup",        pct: 12, velo: "85.9", color: "#4ade80" },
        { abbr: "CU", type: "Curveball",       pct: 6,  velo: "79.2", color: "#c084fc" },
      ],
    },
    batter: {
      name: "Seiya Suzuki", team: "CHC", number: 27, hand: "R",
      avg: ".274", ops: ".841", hr: 18, rbi: 64,
      avgH: 1.20, avgHR: 0.22, avgTB: 1.80,
      hitRate: "6/10", hrRate: "2/10", tbOver: "5/10",
      vsPitches: {
        CT: { avg: ".231", whiff: "29%", good: false, note: "Cutter ties him up inside" },
        SI: { avg: ".288", whiff: "17%", good: true,  note: "Handles sinker well" },
        SL: { avg: ".219", whiff: "31%", good: false, note: "Slides away — weak contact" },
        CH: { avg: ".301", whiff: "14%", good: true,  note: "Good bat speed vs CH" },
        CU: { avg: ".244", whiff: "26%", good: null,  note: "Average vs curve" },
      },
    },
    props: [
      { label: "Burnes K's O/U 7.5",        confidence: 74, lean: "OVER",  positive: true,  reason: "Avg 8.1 K · Cutter dominant · cold suppresses offense" },
      { label: "Suzuki Hits O/U 1.5",        confidence: 41, lean: "UNDER", positive: false, reason: "6/10 hit rate · wind IN · .231 vs Burnes cutter" },
      { label: "Suzuki Total Bases O/U 1.5", confidence: 60, lean: "UNDER", positive: false, reason: "Cold + wind in = power suppressed" },
      { label: "NRFI",                       confidence: 72, lean: "YES",   positive: true,  reason: "Both teams slow starters · cold weather · line moved under" },
    ],
  },
  {
    id: 5,
    away: { name: "San Diego Padres", abbr: "SD" },
    home: { name: "San Francisco Giants", abbr: "SF" },
    time: "9:45 PM ET",
    stadium: "Oracle Park",
    location: "San Francisco, CA",
    weather: { temp: 61, condition: "Foggy", wind: "12 mph IN from CF", humidity: "78%", roof: false, hrFavorable: false },
    umpire: { name: "Mark Carlson", kRate: "21.3%", bbRate: "8.2%", tendency: "Average zone · consistent calls", rating: "neutral" },
    odds: { awayML: "-122", homeML: "+104", total: "7.5", overOdds: "-110", underOdds: "-110", awaySpread: "-1.5", awaySpreadOdds: "+128", homeSpread: "+1.5", homeSpreadOdds: "-148", movement: "Total steady at 7.5. No significant movement. Public split.", lineMove: "none" },
    nrfi: {
      awayFirst: { scoredPct: "40%", avgRuns: 0.55, tendency: "Padres average 1st inn — depends on lineup" },
      homeFirst:  { scoredPct: "36%", avgRuns: 0.48, tendency: "Giants slow at Oracle — cold and foggy conditions" },
      lean: "NRFI", confidence: 63,
    },
    bullpen: {
      away: {
        fatigueLevel: "MODERATE", restDays: 2, pitchesLast3: 118,
        grade: "A-", gradeColor: "#22c55e",
        setupDepth: "DEEP", lrBalance: "BALANCED",
        note: "Hader available. Suarez used 2 days ago.",
        lean: "Elite closer available — late runs hard to come by",
        relievers: [
          { name: "Josh Hader",      role: "CL",  hand: "L", era: "1.98", whip: "0.91", vsL: ".171", vsR: ".221", lastApp: "3d ago", pitches: 15, status: "FRESH"    },
          { name: "Robert Suarez",   role: "SU",  hand: "R", era: "2.88", whip: "1.08", vsL: ".218", vsR: ".184", lastApp: "2d ago", pitches: 24, status: "MODERATE" },
          { name: "Tom Cosgrove",    role: "SU",  hand: "L", era: "3.14", whip: "1.16", vsL: ".194", vsR: ".254", lastApp: "3d ago", pitches: 19, status: "FRESH"    },
          { name: "Steven Wilson",   role: "MR",  hand: "R", era: "3.54", whip: "1.22", vsL: ".238", vsR: ".201", lastApp: "4d ago", pitches: 21, status: "FRESH"    },
          { name: "Luis García",     role: "MR",  hand: "R", era: "3.88", whip: "1.28", vsL: ".251", vsR: ".214", lastApp: "2d ago", pitches: 18, status: "FRESH"    },
        ],
      },
      home: {
        fatigueLevel: "HIGH", restDays: 1, pitchesLast3: 178,
        grade: "C", gradeColor: "#ef4444",
        setupDepth: "THIN", lrBalance: "RH HEAVY",
        note: "Doval threw yesterday. Bullpen stretched thin.",
        lean: "Taxed pen at hitter-friendly Oracle — late OVER lean",
        relievers: [
          { name: "Camilo Doval",    role: "CL",  hand: "R", era: "3.11", whip: "1.18", vsL: ".231", vsR: ".194", lastApp: "1d ago", pitches: 31, status: "TIRED"    },
          { name: "Tyler Rogers",    role: "SU",  hand: "R", era: "3.44", whip: "1.21", vsL: ".248", vsR: ".208", lastApp: "2d ago", pitches: 28, status: "MODERATE" },
          { name: "Sean Hjelle",     role: "MR",  hand: "R", era: "4.01", whip: "1.31", vsL: ".261", vsR: ".221", lastApp: "2d ago", pitches: 26, status: "MODERATE" },
          { name: "Ryan Walker",     role: "MR",  hand: "R", era: "4.28", whip: "1.36", vsL: ".268", vsR: ".228", lastApp: "1d ago", pitches: 29, status: "TIRED"    },
          { name: "John Brebbia",    role: "MR",  hand: "R", era: "4.54", whip: "1.41", vsL: ".278", vsR: ".238", lastApp: "3d ago", pitches: 22, status: "FRESH"    },
        ],
      },
    },
    lineups: {
      away: [
        { order: 1, name: "Xander Bogaerts",  pos: "SS", hand: "R", avg: ".261", hr: 14, tb: 1.7, hitRate: [1,0,1,1,0], vsPitches: { SL: ".244", FF: ".278", CT: ".231", SP: ".168", CU: ".258" } },
        { order: 2, name: "Fernando Tatis Jr.",pos:"RF", hand: "R", avg: ".278", hr: 26, tb: 2.1, hitRate: [1,1,0,1,1], vsPitches: { SL: ".261", FF: ".294", CT: ".248", SP: ".181", CU: ".271" } },
        { order: 3, name: "Manny Machado",    pos: "3B", hand: "R", avg: ".261", hr: 19, tb: 1.9, hitRate: [0,1,1,0,1], vsPitches: { SL: ".252", FF: ".298", CT: ".238", SP: ".178", CU: ".271" } },
        { order: 4, name: "Jake Cronenworth", pos: "1B", hand: "L", avg: ".244", hr: 14, tb: 1.6, hitRate: [1,0,0,1,0], vsPitches: { SL: ".228", FF: ".261", CT: ".218", SP: ".161", CU: ".244" } },
        { order: 5, name: "Ha-Seong Kim",     pos: "2B", hand: "R", avg: ".251", hr: 11, tb: 1.5, hitRate: [0,1,0,0,1], vsPitches: { SL: ".234", FF: ".268", CT: ".221", SP: ".164", CU: ".248" } },
        { order: 6, name: "Jurickson Profar", pos: "LF", hand: "S", avg: ".241", hr: 9,  tb: 1.4, hitRate: [1,0,1,0,0], vsPitches: { SL: ".224", FF: ".258", CT: ".211", SP: ".158", CU: ".238" } },
        { order: 7, name: "Kyle Higashioka",  pos: "C",  hand: "R", avg: ".228", hr: 8,  tb: 1.3, hitRate: [0,0,0,1,0], vsPitches: { SL: ".211", FF: ".244", CT: ".198", SP: ".151", CU: ".224" } },
        { order: 8, name: "Jackson Merrill",  pos: "CF", hand: "L", avg: ".244", hr: 12, tb: 1.5, hitRate: [1,0,1,0,1], vsPitches: { SL: ".228", FF: ".261", CT: ".214", SP: ".161", CU: ".241" } },
        { order: 9, name: "Matthew Batten",   pos: "DH", hand: "R", avg: ".221", hr: 4,  tb: 1.1, hitRate: [0,0,0,0,1], vsPitches: { SL: ".204", FF: ".238", CT: ".194", SP: ".144", CU: ".214" } },
      ],
      home: [
        { order: 1, name: "LaMonte Wade Jr.", pos: "1B", hand: "L", avg: ".251", hr: 11, tb: 1.5, hitRate: [1,0,1,0,1], vsPitches: { SL: ".234", FF: ".268", CT: ".221", SP: ".158", CU: ".244" } },
        { order: 2, name: "Wilmer Flores",    pos: "3B", hand: "R", avg: ".258", hr: 13, tb: 1.6, hitRate: [0,1,0,1,0], vsPitches: { SL: ".241", FF: ".274", CT: ".228", SP: ".164", CU: ".251" } },
        { order: 3, name: "Patrick Bailey",   pos: "C",  hand: "S", avg: ".238", hr: 8,  tb: 1.3, hitRate: [1,1,0,0,0], vsPitches: { SL: ".221", FF: ".254", CT: ".208", SP: ".151", CU: ".231" } },
        { order: 4, name: "Mike Yastrzemski", pos: "RF", hand: "L", avg: ".244", hr: 14, tb: 1.6, hitRate: [0,0,1,1,0], vsPitches: { SL: ".228", FF: ".261", CT: ".214", SP: ".158", CU: ".238" } },
        { order: 5, name: "Matt Chapman",     pos: "DH", hand: "R", avg: ".241", hr: 17, tb: 1.7, hitRate: [1,0,0,0,1], vsPitches: { SL: ".224", FF: ".258", CT: ".211", SP: ".154", CU: ".234" } },
        { order: 6, name: "Heliot Ramos",     pos: "CF", hand: "R", avg: ".251", hr: 12, tb: 1.5, hitRate: [0,1,1,0,0], vsPitches: { SL: ".234", FF: ".268", CT: ".221", SP: ".161", CU: ".244" } },
        { order: 7, name: "Brett Wisely",     pos: "2B", hand: "R", avg: ".234", hr: 7,  tb: 1.3, hitRate: [1,0,0,1,0], vsPitches: { SL: ".218", FF: ".251", CT: ".204", SP: ".148", CU: ".228" } },
        { order: 8, name: "Tyler Fitzgerald", pos: "SS", hand: "R", avg: ".241", hr: 9,  tb: 1.4, hitRate: [0,1,0,0,1], vsPitches: { SL: ".224", FF: ".258", CT: ".211", SP: ".154", CU: ".234" } },
        { order: 9, name: "Austin Slater",    pos: "LF", hand: "R", avg: ".228", hr: 5,  tb: 1.2, hitRate: [0,0,1,0,0], vsPitches: { SL: ".211", FF: ".244", CT: ".198", SP: ".141", CU: ".221" } },
      ],
    },
    pitcher: {
      name: "Yu Darvish", team: "SD", number: 11, hand: "R",
      era: "3.44", whip: "1.11", kPer9: "9.6", bbPer9: "2.44",
      avgIP: 5.8, avgK: 7.4, avgPC: 96, avgER: 2.4,
      season: { k: 167, bb: 42, ip: "138.2", wins: 9, losses: 8 },
      arsenal: [
        { abbr: "SL", type: "Slider",          pct: 31, velo: "84.9", color: "#38bdf8" },
        { abbr: "FF", type: "4-Seam Fastball", pct: 24, velo: "92.4", color: "#f97316" },
        { abbr: "CT", type: "Cutter",          pct: 19, velo: "89.7", color: "#a78bfa" },
        { abbr: "SP", type: "Splitter",        pct: 14, velo: "84.1", color: "#fb7185" },
        { abbr: "CU", type: "Curveball",       pct: 12, velo: "77.3", color: "#c084fc" },
      ],
    },
    batter: {
      name: "Manny Machado", team: "SD", number: 13, hand: "R",
      avg: ".261", ops: ".798", hr: 19, rbi: 72,
      avgH: 1.20, avgHR: 0.25, avgTB: 1.90,
      hitRate: "6/10", hrRate: "3/10", tbOver: "5/10",
      vsPitches: {
        SL: { avg: ".252", whiff: "23%", good: null,  note: "Average vs slider" },
        FF: { avg: ".298", whiff: "18%", good: true,  note: "Handles fastball well" },
        CT: { avg: ".238", whiff: "26%", good: null,  note: "Cutter causes weak contact" },
        SP: { avg: ".178", whiff: "38%", good: false, note: "Splitter is his biggest weakness" },
        CU: { avg: ".271", whiff: "21%", good: true,  note: "Good reads on curve" },
      },
    },
    props: [
      { label: "Darvish K's O/U 6.5",         confidence: 66, lean: "OVER",  positive: true,  reason: "Avg 7.4 K · 5-pitch mix · cold suppresses offense" },
      { label: "Machado Hits O/U 1.5",         confidence: 44, lean: "UNDER", positive: false, reason: "Cold foggy Oracle · wind IN · 6/10 hit rate" },
      { label: "Machado Total Bases O/U 1.5",  confidence: 52, lean: "UNDER", positive: false, reason: ".178 avg vs splitter — Darvish's put-away pitch" },
      { label: "NRFI",                         confidence: 63, lean: "YES",   positive: true,  reason: "Foggy Oracle suppresses offense · both teams slow starters" },
    ],
  },
  {
    id: 6,
    away: { name: "Boston Red Sox", abbr: "BOS" },
    home: { name: "Toronto Blue Jays", abbr: "TOR" },
    time: "7:07 PM ET",
    stadium: "Rogers Centre",
    location: "Toronto, ON",
    weather: { temp: 70, condition: "Dome", wind: "N/A", humidity: "N/A", roof: true, hrFavorable: false },
    umpire: { name: "Dan Iassogna", kRate: "20.9%", bbRate: "8.4%", tendency: "Solid zone · above avg strike calls", rating: "pitcher" },
    odds: { awayML: "+105", homeML: "-125", total: "8.0", overOdds: "-112", underOdds: "-108", awaySpread: "+1.5", awaySpreadOdds: "-158", homeSpread: "-1.5", homeSpreadOdds: "+134", movement: "Total opened 8 — held steady. Slight over lean from public.", lineMove: "over" },
    nrfi: {
      awayFirst: { scoredPct: "42%", avgRuns: 0.58, tendency: "Red Sox active leadoff — Turner, Yoshida" },
      homeFirst:  { scoredPct: "45%", avgRuns: 0.64, tendency: "Blue Jays leadoff boppers — Springer drives runs early" },
      lean: "YRFI", confidence: 59,
    },
    bullpen: {
      away: {
        fatigueLevel: "MODERATE", restDays: 2, pitchesLast3: 131,
        grade: "B+", gradeColor: "#22c55e",
        setupDepth: "MODERATE", lrBalance: "BALANCED",
        note: "Jansen rested. Whitlock available.",
        lean: "Solid pen — good RH/LH mix, Jansen elite in close games",
        relievers: [
          { name: "Kenley Jansen",   role: "CL",  hand: "R", era: "2.54", whip: "1.01", vsL: ".214", vsR: ".181", lastApp: "3d ago", pitches: 17, status: "FRESH"    },
          { name: "Garrett Whitlock",role: "SU",  hand: "R", era: "2.98", whip: "1.11", vsL: ".228", vsR: ".194", lastApp: "2d ago", pitches: 23, status: "FRESH"    },
          { name: "Chris Martin",    role: "SU",  hand: "R", era: "3.28", whip: "1.18", vsL: ".241", vsR: ".204", lastApp: "3d ago", pitches: 19, status: "FRESH"    },
          { name: "Joely Rodríguez", role: "LOOGY",hand:"L", era: "3.54", whip: "1.24", vsL: ".194", vsR: ".268", lastApp: "2d ago", pitches: 18, status: "FRESH"    },
          { name: "Josh Winckowski", role: "MR",  hand: "R", era: "4.01", whip: "1.31", vsL: ".258", vsR: ".218", lastApp: "1d ago", pitches: 29, status: "TIRED"    },
        ],
      },
      home: {
        fatigueLevel: "MODERATE", restDays: 2, pitchesLast3: 144,
        grade: "B", gradeColor: "#f59e0b",
        setupDepth: "MODERATE", lrBalance: "RH HEAVY",
        note: "Romano available. Both pens similar fatigue.",
        lean: "RH heavy pen — LHB late may find better looks",
        relievers: [
          { name: "Jordan Romano",   role: "CL",  hand: "R", era: "2.78", whip: "1.06", vsL: ".224", vsR: ".188", lastApp: "3d ago", pitches: 18, status: "FRESH"    },
          { name: "Tim Mayza",       role: "SU",  hand: "L", era: "3.08", whip: "1.14", vsL: ".198", vsR: ".254", lastApp: "2d ago", pitches: 21, status: "FRESH"    },
          { name: "Yimi García",     role: "SU",  hand: "R", era: "3.44", whip: "1.21", vsL: ".241", vsR: ".204", lastApp: "3d ago", pitches: 19, status: "FRESH"    },
          { name: "Erik Swanson",    role: "MR",  hand: "R", era: "3.78", whip: "1.28", vsL: ".254", vsR: ".214", lastApp: "2d ago", pitches: 24, status: "FRESH"    },
          { name: "Génesis Cabrera", role: "LOOGY",hand:"L", era: "3.98", whip: "1.31", vsL: ".201", vsR: ".271", lastApp: "4d ago", pitches: 16, status: "FRESH"    },
        ],
      },
    },
    lineups: {
      away: [
        { order: 1, name: "Jarren Duran",     pos: "CF", hand: "L", avg: ".278", hr: 12, tb: 1.8, hitRate: [1,1,1,0,1], vsPitches: { SP: ".168", FF: ".291", SL: ".241", CH: ".278" } },
        { order: 2, name: "Masataka Yoshida", pos: "DH", hand: "L", avg: ".291", hr: 14, tb: 1.9, hitRate: [1,0,1,1,1], vsPitches: { SP: ".181", FF: ".304", SL: ".254", CH: ".291" } },
        { order: 3, name: "Rafael Devers",    pos: "3B", hand: "L", avg: ".281", hr: 28, tb: 2.1, hitRate: [1,1,0,1,0], vsPitches: { SP: ".171", FF: ".312", SL: ".244", CH: ".289" } },
        { order: 4, name: "Triston Casas",    pos: "1B", hand: "L", avg: ".258", hr: 19, tb: 1.8, hitRate: [0,1,1,0,1], vsPitches: { SP: ".158", FF: ".271", SL: ".224", CH: ".261" } },
        { order: 5, name: "Rob Refsnyder",    pos: "RF", hand: "R", avg: ".261", hr: 8,  tb: 1.5, hitRate: [1,0,0,1,0], vsPitches: { SP: ".164", FF: ".274", SL: ".231", CH: ".258" } },
        { order: 6, name: "Enmanuel Valdez",  pos: "2B", hand: "L", avg: ".244", hr: 9,  tb: 1.4, hitRate: [0,1,0,0,1], vsPitches: { SP: ".151", FF: ".258", SL: ".214", CH: ".244" } },
        { order: 7, name: "Connor Wong",      pos: "C",  hand: "R", avg: ".248", hr: 10, tb: 1.4, hitRate: [1,0,1,0,0], vsPitches: { SP: ".154", FF: ".261", SL: ".218", CH: ".248" } },
        { order: 8, name: "Ceddanne Rafaela", pos: "LF", hand: "R", avg: ".238", hr: 8,  tb: 1.3, hitRate: [0,0,0,1,1], vsPitches: { SP: ".148", FF: ".251", SL: ".208", CH: ".238" } },
        { order: 9, name: "David Hamilton",   pos: "SS", hand: "L", avg: ".228", hr: 4,  tb: 1.2, hitRate: [1,0,0,0,0], vsPitches: { SP: ".141", FF: ".241", SL: ".201", CH: ".228" } },
      ],
      home: [
        { order: 1, name: "George Springer",  pos: "CF", hand: "R", avg: ".261", hr: 19, tb: 1.9, hitRate: [1,1,0,1,1], vsPitches: { SP: ".174", FF: ".274", SL: ".231", CH: ".261" } },
        { order: 2, name: "Daulton Varsho",   pos: "LF", hand: "L", avg: ".241", hr: 16, tb: 1.6, hitRate: [0,1,1,0,0], vsPitches: { SP: ".151", FF: ".254", SL: ".214", CH: ".244" } },
        { order: 3, name: "Vladimir Guerrero",pos: "1B", hand: "R", avg: ".291", hr: 24, tb: 2.2, hitRate: [1,1,1,0,1], vsPitches: { SP: ".184", FF: ".304", SL: ".258", CH: ".291" } },
        { order: 4, name: "Bo Bichette",      pos: "SS", hand: "R", avg: ".271", hr: 16, tb: 1.8, hitRate: [0,1,0,1,1], vsPitches: { SP: ".171", FF: ".284", SL: ".241", CH: ".271" } },
        { order: 5, name: "Alejandro Kirk",   pos: "C",  hand: "R", avg: ".264", hr: 12, tb: 1.6, hitRate: [1,0,1,0,0], vsPitches: { SP: ".164", FF: ".278", SL: ".234", CH: ".264" } },
        { order: 6, name: "Davis Schneider",  pos: "RF", hand: "R", avg: ".248", hr: 11, tb: 1.5, hitRate: [0,0,0,1,1], vsPitches: { SP: ".154", FF: ".261", SL: ".218", CH: ".248" } },
        { order: 7, name: "Isiah Kiner-Falefa",pos:"3B", hand: "R", avg: ".251", hr: 4,  tb: 1.3, hitRate: [1,0,1,0,0], vsPitches: { SP: ".158", FF: ".264", SL: ".221", CH: ".251" } },
        { order: 8, name: "Spencer Horwitz",  pos: "DH", hand: "L", avg: ".258", hr: 8,  tb: 1.4, hitRate: [0,1,0,1,0], vsPitches: { SP: ".161", FF: ".271", SL: ".228", CH: ".258" } },
        { order: 9, name: "Ernie Clement",    pos: "2B", hand: "R", avg: ".234", hr: 5,  tb: 1.2, hitRate: [0,0,0,0,1], vsPitches: { SP: ".144", FF: ".248", SL: ".208", CH: ".234" } },
      ],
    },
    pitcher: {
      name: "Kevin Gausman", team: "TOR", number: 34, hand: "R",
      era: "3.12", whip: "1.04", kPer9: "10.4", bbPer9: "2.61",
      avgIP: 6.0, avgK: 7.8, avgPC: 98, avgER: 2.1,
      season: { k: 182, bb: 46, ip: "144.1", wins: 10, losses: 7 },
      arsenal: [
        { abbr: "SP", type: "Splitter",        pct: 38, velo: "85.2", color: "#fb7185" },
        { abbr: "FF", type: "4-Seam Fastball", pct: 29, velo: "93.4", color: "#f97316" },
        { abbr: "SL", type: "Slider",          pct: 18, velo: "84.7", color: "#38bdf8" },
        { abbr: "CH", type: "Changeup",        pct: 15, velo: "83.1", color: "#4ade80" },
      ],
    },
    batter: {
      name: "Rafael Devers", team: "BOS", number: 11, hand: "L",
      avg: ".281", ops: ".883", hr: 28, rbi: 88,
      avgH: 1.30, avgHR: 0.35, avgTB: 2.10,
      hitRate: "7/10", hrRate: "4/10", tbOver: "6/10",
      vsPitches: {
        SP: { avg: ".171", whiff: "42%", good: false, note: "Splitter is nightmare pitch — high whiff" },
        FF: { avg: ".312", whiff: "19%", good: true,  note: "Punishes fastballs hard" },
        SL: { avg: ".244", whiff: "28%", good: null,  note: "Average vs slider" },
        CH: { avg: ".289", whiff: "16%", good: true,  note: "Good contact vs changeup" },
      },
    },
    props: [
      { label: "Gausman K's O/U 7.5",       confidence: 76, lean: "OVER",  positive: true,  reason: "Avg 7.8 K · 38% splitter · dome conditions · Devers whiffs 42% vs SP" },
      { label: "Devers Anytime HR",          confidence: 36, lean: "YES",   positive: true,  reason: "4/10 HR rate but Gausman splitter suppresses power" },
      { label: "Devers Hits O/U 1.5",        confidence: 48, lean: "UNDER", positive: false, reason: ".171 avg vs splitter — Gausman's #1 pitch at 38%" },
      { label: "Devers Total Bases O/U 1.5", confidence: 55, lean: "UNDER", positive: false, reason: "Splitter whiff rate suggests lower contact night" },
    ],
  },
];

// ─────────────────────────────────────────────
// LIVE GAME BUILDER
// Converts a /api/schedule response object into a game-card-compatible
// object. SLATE[0] fills gaps until Baseball Savant + prop engine land.
// ─────────────────────────────────────────────
const buildLiveGame = (sg) => {
  const tpl = SLATE[0];
  const hp  = sg.probablePitchers?.home; // home pitcher faces the away lineup
  const ap  = sg.probablePitchers?.away; // away pitcher faces the home lineup
  const mkPitcher = (p) => p ? {
    id:     p.id,
    name:   p.name,
    team:   p.team,
    number: p.number,
    hand:   p.hand,
    era: "—", whip: "—", kPer9: "—", bbPer9: "—",
    avgIP: "—", avgK: "—", avgPC: "—", avgER: "—",
    season: {},
    arsenal: [],
  } : tpl.pitcher;
  return {
    id:          sg.gamePk,
    gamePk:      sg.gamePk,
    away:        sg.away,
    home:        sg.home,
    time:        formatLocalTime(sg.gameTime) ?? sg.time,
    status:      sg.status ?? "Scheduled",
    stadium:     sg.stadium,
    location:    "",
    weather:     tpl.weather,  // overridden by Open-Meteo when IS_SANDBOX = false
    umpire:      { name: "TBD", kRate: "—", bbRate: "—", tendency: "Awaiting assignment", rating: "neutral" },
    odds:        { ...tpl.odds, lineMove: "none" },  // lineMove reset — overridden by Odds API when live
    nrfi:        tpl.nrfi,     // mock — pending historical data integration
    bullpen:     tpl.bullpen,  // mock — pending bullpen data integration
    pitcher:     mkPitcher(hp),  // home SP — faces the away lineup
    awayPitcher: mkPitcher(ap),  // away SP — faces the home lineup
    batter:      tpl.batter,     // featured batter — pending player selection logic
    lineups:     { away: [], home: [] },
    props:       [],
  };
};

// ─────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────
const LeanBadge = ({ label, positive, small }) => {
  const color  = positive === true ? "#22c55e" : positive === false ? "#ef4444" : "#f59e0b";
  const bg     = positive === true ? "rgba(34,197,94,0.12)" : positive === false ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)";
  const border = positive === true ? "rgba(34,197,94,0.4)"  : positive === false ? "rgba(239,68,68,0.4)"  : "rgba(245,158,11,0.4)";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: small ? "2px 7px" : "4px 11px", fontSize: small ? 9 : 10, fontWeight: 700, color, fontFamily: "monospace", whiteSpace: "nowrap" }}>
      <div style={{ width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
      {label}
    </div>
  );
};

const Card = ({ children, style, onClick }) => (
  <div style={{ background: "#161827", border: "1px solid #1f2437", borderRadius: 14, padding: "14px", marginBottom: 12, ...style }} onClick={onClick}>{children}</div>
);

const Divider = () => <div style={{ height: 1, background: "#1f2437", margin: "10px 0" }} />;

const SLabel = ({ children }) => (
  <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>— {children}</div>
);

const StatMini = ({ label, value, color }) => (
  <div style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "8px 6px", textAlign: "center", minWidth: 0 }}>
    <div style={{ fontSize: 15, fontWeight: 800, color: color ?? "#e5e7eb", fontFamily: "monospace" }}>{value}</div>
    <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
  </div>
);

const ConfBar = ({ pct, positive }) => {
  const color = positive ? (pct >= 70 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#9ca3af") : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, background: "#1e2030", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 30, fontFamily: "monospace" }}>{pct}%</span>
    </div>
  );
};

const FatigueChip = ({ level }) => {
  const map = { HIGH: ["#ef4444", "rgba(239,68,68,0.15)"], MODERATE: ["#f59e0b", "rgba(245,158,11,0.12)"], FRESH: ["#22c55e", "rgba(34,197,94,0.12)"] };
  const [color, bg] = map[level] ?? ["#9ca3af", "#1e2030"];
  return <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 5, padding: "2px 8px", fontFamily: "monospace" }}>{level}</span>;
};

// ─────────────────────────────────────────────
// BULLPEN CARD COMPONENT (needs useState — must be a real component)
// ─────────────────────────────────────────────
const BullpenCard = ({ label, data }) => {
  const [expanded, setExpanded] = useState(false);
  const statusColor = (s) => s === "TIRED" ? "#ef4444" : s === "MODERATE" ? "#f59e0b" : "#22c55e";
  const roleColor   = (r) => r === "CL" ? "#fbbf24" : r === "SU" ? "#38bdf8" : r === "LOOGY" ? "#c084fc" : "#9ca3af";

  return (
    <div style={{ background: "#161827", border: "1px solid #1f2437", borderRadius: 14, padding: "14px", marginBottom: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb" }}>{label} Bullpen</div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{data.setupDepth} depth · {data.lrBalance}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ background: `${data.gradeColor}18`, border: `1px solid ${data.gradeColor}44`, borderRadius: 8, padding: "4px 12px", fontSize: 18, fontWeight: 800, color: data.gradeColor, fontFamily: "monospace" }}>{data.grade}</div>
          <span style={{ fontSize: 10, fontWeight: 700, color: data.fatigueLevel === "HIGH" ? "#ef4444" : data.fatigueLevel === "MODERATE" ? "#f59e0b" : "#22c55e", background: data.fatigueLevel === "HIGH" ? "rgba(239,68,68,0.15)" : data.fatigueLevel === "MODERATE" ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.12)", borderRadius: 5, padding: "2px 8px", fontFamily: "monospace" }}>{data.fatigueLevel}</span>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[
          ["Rest Days", data.restDays,     data.restDays >= 2 ? "#22c55e" : "#ef4444"],
          ["P Last 3G", data.pitchesLast3, data.pitchesLast3 > 160 ? "#ef4444" : "#e5e7eb"],
          ["Depth",     data.setupDepth,   data.setupDepth === "DEEP" ? "#22c55e" : data.setupDepth === "THIN" ? "#ef4444" : "#f59e0b"],
          ["L/R",       data.lrBalance,    data.lrBalance === "BALANCED" ? "#22c55e" : "#f59e0b"],
        ].map(([lbl, val, clr]) => (
          <div key={lbl} style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "8px 6px", textAlign: "center", minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: clr, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{val}</div>
            <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2, textTransform: "uppercase" }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Lean callout */}
      <div style={{ borderLeft: `3px solid ${data.gradeColor}`, background: `${data.gradeColor}08`, borderRadius: "0 8px 8px 0", padding: "8px 10px", fontSize: 11, color: "#d1d5db", lineHeight: 1.5, marginBottom: 10 }}>
        {data.lean}
      </div>

      {/* Relievers toggle */}
      <button onClick={() => setExpanded(!expanded)} style={{ width: "100%", background: "#1e2030", border: "1px solid #2d3748", borderRadius: 8, padding: "7px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "monospace" }}>
        <span style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Relievers ({data.relievers.length})</span>
        <span style={{ fontSize: 10, color: "#6b7280" }}>{expanded ? "▲ hide" : "▼ show"}</span>
      </button>

      {/* Reliever list */}
      {expanded && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {data.relievers.map((r, ri) => (
            <div key={ri} style={{ background: "#0e0f1a", borderRadius: 10, padding: "10px 12px", border: "1px solid #1f2437" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: roleColor(r.role), background: `${roleColor(r.role)}18`, border: `1px solid ${roleColor(r.role)}44`, borderRadius: 4, padding: "1px 6px" }}>{r.role}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb" }}>{r.name}</span>
                  <span style={{ fontSize: 9, color: "#6b7280" }}>{r.hand}HP</span>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: statusColor(r.status), background: `${statusColor(r.status)}18`, borderRadius: 4, padding: "1px 7px", fontFamily: "monospace" }}>{r.status}</span>
              </div>

              <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                {[
                  ["ERA",      r.era,      parseFloat(r.era)   < 3.0  ? "#22c55e" : parseFloat(r.era)   > 4.0  ? "#ef4444" : "#f59e0b"],
                  ["WHIP",     r.whip,     parseFloat(r.whip)  < 1.1  ? "#22c55e" : parseFloat(r.whip)  > 1.3  ? "#ef4444" : "#f59e0b"],
                  ["Last App", r.lastApp,  "#9ca3af"],
                  ["Pitches",  r.pitches,  r.pitches >= 30 ? "#ef4444" : r.pitches >= 20 ? "#f59e0b" : "#22c55e"],
                ].map(([lbl, val, clr]) => (
                  <div key={lbl} style={{ flex: 1, background: "#161827", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: clr }}>{val}</div>
                    <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1, textTransform: "uppercase" }}>{lbl}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 5 }}>
                <div style={{ flex: 1, background: "#161827", borderRadius: 6, padding: "6px 8px" }}>
                  <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>K/9</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: parseFloat(r.k9) >= 10 ? "#22c55e" : parseFloat(r.k9) <= 7 ? "#ef4444" : "#f59e0b", fontFamily: "monospace" }}>{r.k9 !== "—" ? parseFloat(r.k9).toFixed(1) : "—"}</div>
                </div>
                <div style={{ flex: 1, background: "#161827", borderRadius: 6, padding: "6px 8px" }}>
                  <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>BB/9</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: parseFloat(r.bb9) <= 3 ? "#22c55e" : parseFloat(r.bb9) >= 5 ? "#ef4444" : "#f59e0b", fontFamily: "monospace" }}>{r.bb9 !== "—" ? parseFloat(r.bb9).toFixed(1) : "—"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// SLATE CARD (mini, for game selector)
// ─────────────────────────────────────────────
const SlateCard = ({ game, selected, onSelect, liveOddsMap = {}, bestBet = null, liveScore = null, injuredIds = new Set() }) => {
  const topProp = bestBet ?? (game.props[0]?.lean ? game.props[0] : null);
  // Merge live odds if available for this game
  const liveKey       = `${game.away.name}|${game.home.name}`;
  const liveOdds      = liveOddsMap[liveKey];
  const total         = liveOdds?.total         ?? game.odds.total;
  const awayML        = liveOdds?.awayML        ?? game.odds.awayML;
  const homeML        = liveOdds?.homeML        ?? game.odds.homeML;
  const overOdds      = liveOdds?.overOdds      ?? game.odds.overOdds;
  const underOdds     = liveOdds?.underOdds     ?? game.odds.underOdds;
  const awaySpread    = liveOdds?.awaySpread    ?? game.odds.awaySpread;
  const awaySprdOdds  = liveOdds?.awaySpreadOdds ?? game.odds.awaySpreadOdds;
  const homeSpread    = liveOdds?.homeSpread    ?? game.odds.homeSpread;
  const homeSprdOdds  = liveOdds?.homeSpreadOdds ?? game.odds.homeSpreadOdds;
  const isLive        = !!liveOdds;
  const lineMove      = game.odds.lineMove; // "over" | "under" | "none"
  const gameStatus    = game.status ?? "Scheduled";
  const isInProgress  = gameStatus === "In Progress" || gameStatus === "Warmup";
  const isFinal       = gameStatus === "Final" || gameStatus === "Game Over";
  const isDelayed     = gameStatus.startsWith("Delayed");
  const isPostponed   = gameStatus === "Postponed" || gameStatus === "Cancelled" || gameStatus === "Suspended";

  return (
    <div onClick={() => onSelect(game.id)} style={{ background: selected ? "rgba(34,197,94,0.06)" : "#161827", border: `1px solid ${selected ? "rgba(34,197,94,0.25)" : "#1f2437"}`, borderRadius: 12, padding: "12px", cursor: "pointer", marginBottom: 8, transition: "all 0.15s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#f9fafb" }}>{game.away.abbr} <span style={{ color: "#6b7280", fontWeight: 400 }}>@</span> {game.home.abbr}</div>
            {isInProgress && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 5, padding: "2px 6px" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 5px #ef4444", animation: "pulse 1.2s infinite" }} />
                <span style={{ fontSize: 8, fontWeight: 700, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.05em" }}>LIVE</span>
              </div>
            )}
            {isInProgress && liveScore && (
              <div style={{ display: "flex", alignItems: "center", gap: 3, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 5, padding: "2px 7px" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#f9fafb", fontFamily: "monospace" }}>
                  {liveScore.awayScore}–{liveScore.homeScore}
                </span>
                <span style={{ fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                  {liveScore.halfInning === "bottom" ? "▼" : "▲"}{liveScore.inning}
                </span>
              </div>
            )}
            {isFinal && (
              <div style={{ background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.3)", borderRadius: 5, padding: "2px 6px" }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.05em" }}>FINAL</span>
              </div>
            )}
            {isDelayed && (
              <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 5, padding: "2px 6px" }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: "#f59e0b", fontFamily: "monospace", letterSpacing: "0.05em" }}>DELAY</span>
              </div>
            )}
            {isPostponed && (
              <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 5, padding: "2px 6px" }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: "#f59e0b", fontFamily: "monospace", letterSpacing: "0.05em" }}>PPD</span>
              </div>
            )}
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{game.time} · {game.stadium}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          {isFinal && liveScore ? (() => {
            const combinedRuns = liveScore.awayScore + liveScore.homeScore;
            const ouResult     = total ? (combinedRuns > parseFloat(total) ? "O" : "U") : null;
            const awayWon      = liveScore.awayScore > liveScore.homeScore;
            const winnerAbbr   = awayWon ? game.away.abbr : game.home.abbr;
            const winnerML     = awayWon ? awayML : homeML;
            const margin       = Math.abs(liveScore.awayScore - liveScore.homeScore);
            const rlCovered    = margin >= 2 ? "-1.5" : "+1.5";
            // NRFI: both teams scored 0 in the 1st inning
            const f1 = liveScore.firstInning;
            const nrfiKnown = f1 && f1.away !== null && f1.home !== null;
            const wasNrfi   = nrfiKnown && f1.away === 0 && f1.home === 0;
            return (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace", lineHeight: 1 }}>
                  {liveScore.awayScore}–{liveScore.homeScore}
                </div>
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 4 }}>
                  {ouResult && total && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: ouResult === "O" ? "#22c55e" : "#ef4444", fontFamily: "monospace" }}>
                      {ouResult} {total}
                    </span>
                  )}
                  {winnerAbbr && winnerML && (
                    <span style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace" }}>· {winnerAbbr} {winnerML}</span>
                  )}
                  {rlCovered && (
                    <span style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace" }}>· {rlCovered}</span>
                  )}
                  {nrfiKnown && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: wasNrfi ? "#22c55e" : "#ef4444", fontFamily: "monospace" }}>
                      · {wasNrfi ? "NRFI ✓" : `YRFI (${f1.away > 0 ? game.away.abbr : game.home.abbr} scored)`}
                    </span>
                  )}
                </div>
              </>
            );
          })() : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                <div style={{ fontSize: 11, color: "#f9fafb", fontWeight: 700 }}>O/U {total}</div>
                {isLive && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 4px #22c55e", flexShrink: 0 }} />}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", marginTop: 3 }}>
                <span style={{ fontSize: 8, color: "#4b5563", fontFamily: "monospace" }}>ML</span>
                <span style={{ fontSize: 10, color: "#22c55e", fontFamily: "monospace" }}>{awayML} / {homeML}</span>
              </div>
              {(overOdds || underOdds) && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", marginTop: 2 }}>
                  <span style={{ fontSize: 8, color: "#4b5563", fontFamily: "monospace" }}>O/U Odds</span>
                  <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>{overOdds ?? "—"} / {underOdds ?? "—"}</span>
                </div>
              )}
              {(awaySpread || homeSpread) && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", marginTop: 2 }}>
                  <span style={{ fontSize: 8, color: "#4b5563", fontFamily: "monospace" }}>RL</span>
                  <span style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace" }}>
                    {awaySpread}({awaySprdOdds}) / {homeSpread}({homeSprdOdds})
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <LeanBadge label={game.weather.roof ? "DOME" : `${game.weather.temp}°`} positive={game.weather.hrFavorable} small />
        {game.nrfi?.lean === "NRFI" && (game.nrfi?.confidence ?? 0) >= 62 && <LeanBadge label="NRFI" positive={true} small />}
        {lineMove === "over"  && <LeanBadge label="↑ OVER"  positive={true}  small />}
        {lineMove === "under" && <LeanBadge label="↓ UNDER" positive={false} small />}
        {(injuredIds.has(String(game.pitcher?.id)) || injuredIds.has(String(game.awayPitcher?.id))) && (
          <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 999, padding: "2px 7px", letterSpacing: "0.06em" }}>
            ⚠ SP IL
          </span>
        )}
        {topProp && (() => {
          const lastName = bestBet
            ? bestBet.label.split(" ")[0]
            : game.pitcher.name?.split(" ").slice(-1)[0] ?? "";
          const propType = bestBet?.propType ?? "K";
          return <LeanBadge label={`${lastName} ${propType} ${topProp.lean}`} positive={topProp.positive} small />;
        })()}
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────
// TOP SLATE PICKS — extracted to module scope so the minifier can't
// collide its local variable names with App()'s render-body variables.
// Receives all needed data as explicit parameters.
// ─────────────────────────────────────────────
// ── Model pick tiers ──────────────────────────────────────────────────────────
// HIGH  65 %+ : strong signal, multiple corroborating factors
// MEDIUM 56–64%: positive lean, fewer signals
// SPEC  50–55%: marginal, display-only (no action implied)
const MODEL_TIER = (score) =>
  score >= 65 ? "HIGH" : score >= 56 ? "MEDIUM" : "SPEC";

function computeTopSlatePicks(liveSlate, livePitcherStats, liveLineups, liveWeather) {
  const picks = [];

  liveSlate.forEach(sg => {
    const sgGameLabel = `${sg.away?.abbr ?? "?"} @ ${sg.home?.abbr ?? "?"}`;
    const sgLu        = liveLineups[sg.gamePk];
    const sgConfirmed = sgLu?.confirmed ?? false;
    const sgWx        = liveWeather[sg.gamePk];
    const sgPf        = PARK_FACTORS[sg.home?.abbr] ?? NEUTRAL_PARK;

    // Score both starters: home pitcher faces away batters, away pitcher faces home batters
    [
      { pitcher: sg.probablePitchers?.home, opposingBatters: sgLu?.away ?? [], side: "home" },
      { pitcher: sg.probablePitchers?.away, opposingBatters: sgLu?.home ?? [], side: "away" },
    ].forEach(({ pitcher, opposingBatters, side }) => {
      if (!pitcher?.id) return;
      const ps = livePitcherStats[pitcher.id];
      if (!ps) return;

      const lastName  = (ps.name ?? pitcher.name ?? "SP").split(" ").slice(-1)[0];
      const fullName  = ps.name ?? pitcher.name ?? "SP";
      const era       = parseFloat(ps.era)    || 5.00;
      const kPer9     = parseFloat(ps.kPer9)  || 6.0;
      const whip      = parseFloat(ps.whip)   || 1.35;
      const bbPer9    = parseFloat(ps.bbPer9) || 3.5;
      const avgIP     = parseFloat(ps.avgIP)  || 5.0;
      const avgK      = parseFloat(ps.avgK)   || Math.round(kPer9 * avgIP / 9 * 10) / 10;

      // ── Lineup platoon adjustment ──────────────────────────────────────────
      let lineupAdj    = 0;
      let lineupSignal = null;
      if (sgConfirmed && opposingBatters.length >= 7) {
        const pHand    = pitcher.hand ?? "R";
        const oppCount = opposingBatters.filter(b => b.hand && b.hand !== pHand && b.hand !== "?").length;
        const oppPct   = oppCount / opposingBatters.length;
        if      (oppPct >= 0.67) { lineupAdj = -5; lineupSignal = `${Math.round(oppPct * 100)}% opposite-hand batters (tough)`; }
        else if (oppPct >= 0.56) { lineupAdj = -2; lineupSignal = `${Math.round(oppPct * 100)}% opposite-hand batters`; }
        else if (oppPct <= 0.33) { lineupAdj = +5; lineupSignal = `${Math.round(oppPct * 100)}% same-hand batters (favorable)`;  }
        else if (oppPct <= 0.44) { lineupAdj = +2; lineupSignal = `${Math.round(oppPct * 100)}% same-hand batters`; }
      }

      // ════════════════════════════════
      // K prop scoring
      // ════════════════════════════════
      let kScore   = 50;
      const kSigs  = [];

      if      (era  < 3.00) { kScore += 8;  kSigs.push(`ERA ${era.toFixed(2)} (elite)`); }
      else if (era  < 3.50) { kScore += 5;  kSigs.push(`ERA ${era.toFixed(2)} (strong)`); }
      else if (era  > 5.00) { kScore -= 8;  kSigs.push(`ERA ${era.toFixed(2)} (concerning)`); }
      else if (era  > 4.50) { kScore -= 4;  kSigs.push(`ERA ${era.toFixed(2)} (elevated)`); }

      if      (kPer9 >= 10)  { kScore += 14; kSigs.push(`K/9 ${kPer9.toFixed(1)} (elite strikeout rate)`); }
      else if (kPer9 >= 8.5) { kScore += 8;  kSigs.push(`K/9 ${kPer9.toFixed(1)} (above average)`); }
      else if (kPer9 >= 7)   { kScore += 3;  kSigs.push(`K/9 ${kPer9.toFixed(1)} (solid)`); }
      else if (kPer9 < 6)    { kScore -= 10; kSigs.push(`K/9 ${kPer9.toFixed(1)} (low — caution)`); }

      if (whip < 1.1) { kScore += 3; kSigs.push(`WHIP ${whip.toFixed(2)} (excellent command)`); }
      else if (whip > 1.45) { kScore -= 5; kSigs.push(`WHIP ${whip.toFixed(2)} (poor command)`); }

      const kPfAdj = Math.round((sgPf.k - 1.0) * 50);
      if      (kPfAdj >= 3)  kSigs.push(`${sg.home?.abbr} park: K-friendly (+${kPfAdj}%)`);
      else if (kPfAdj <= -3) kSigs.push(`${sg.home?.abbr} park: hitter-friendly (${kPfAdj}%)`);
      kScore += kPfAdj;

      if (sgWx && !sgWx.roof && parseInt(sgWx.temp) < 55) {
        kScore += 5;
        kSigs.push(`Cold weather ${sgWx.temp}°F (suppresses contact)`);
      }
      if (lineupAdj !== 0 && lineupSignal) { kScore += lineupAdj; kSigs.push(lineupSignal); }
      if (avgIP >= 6.0) kSigs.push(`Avg IP ${avgIP.toFixed(1)} (deep outings, more K opportunities)`);

      kScore = Math.max(38, Math.min(78, kScore));
      const kLine = Math.max(0.5, Math.round(avgK) - 0.5);

      picks.push({
        label:          `${lastName} K O/U ${kLine}`,
        fullName,
        pitcherId:      pitcher.id,
        lean:           kScore >= 50 ? "OVER" : "UNDER",
        positive:       kScore >= 50,
        confidence:     kScore,
        tier:           MODEL_TIER(kScore),
        propType:       "K",
        market:         "pitcher_strikeouts",
        modelLine:      kLine,
        gamePk:         sg.gamePk,
        game:           sgGameLabel,
        lineupConfirmed: sgConfirmed,
        signals:        kSigs,
        avgIP,
      });

      // ════════════════════════════════
      // Outs prop scoring
      // ════════════════════════════════
      let oScore  = 50;
      const oSigs = [];

      if      (era  < 3.00) { oScore += 10; oSigs.push(`ERA ${era.toFixed(2)} (elite — goes deep)`); }
      else if (era  < 3.50) { oScore += 6;  oSigs.push(`ERA ${era.toFixed(2)} (strong)`); }
      else if (era  > 5.00) { oScore -= 10; oSigs.push(`ERA ${era.toFixed(2)} (short outing risk)`); }
      else if (era  > 4.50) { oScore -= 5;  oSigs.push(`ERA ${era.toFixed(2)} (elevated)`); }

      if      (whip < 1.10) { oScore += 12; oSigs.push(`WHIP ${whip.toFixed(2)} (elite control)`); }
      else if (whip < 1.25) { oScore += 6;  oSigs.push(`WHIP ${whip.toFixed(2)} (solid control)`); }
      else if (whip > 1.50) { oScore -= 12; oSigs.push(`WHIP ${whip.toFixed(2)} (command issues)`); }
      else if (whip > 1.38) { oScore -= 6;  oSigs.push(`WHIP ${whip.toFixed(2)} (slightly elevated)`); }

      if      (bbPer9 < 2.5) { oScore += 8; oSigs.push(`BB/9 ${bbPer9.toFixed(1)} (excellent command)`); }
      else if (bbPer9 < 3.0) { oScore += 3; oSigs.push(`BB/9 ${bbPer9.toFixed(1)} (above average)`); }
      else if (bbPer9 > 4.5) { oScore -= 8; oSigs.push(`BB/9 ${bbPer9.toFixed(1)} (walk rate concern)`); }
      else if (bbPer9 > 3.5) { oScore -= 4; oSigs.push(`BB/9 ${bbPer9.toFixed(1)} (elevated walks)`); }

      if (lineupAdj !== 0 && lineupSignal) { oScore += lineupAdj; oSigs.push(lineupSignal); }
      if (avgIP >= 6.0) oSigs.push(`Avg IP ${avgIP.toFixed(1)} (consistently works deep)`);
      else if (avgIP < 5.0) oSigs.push(`Avg IP ${avgIP.toFixed(1)} (short outing risk)`);

      oScore = Math.max(38, Math.min(78, oScore));
      const oLine = Math.max(0.5, Math.round(avgIP * 3) - 0.5);

      picks.push({
        label:          `${lastName} Outs O/U ${oLine}`,
        fullName,
        pitcherId:      pitcher.id,
        lean:           oScore >= 50 ? "OVER" : "UNDER",
        positive:       oScore >= 50,
        confidence:     oScore,
        tier:           MODEL_TIER(oScore),
        propType:       "Outs",
        market:         "pitcher_outs_recorded",
        modelLine:      oLine,
        gamePk:         sg.gamePk,
        game:           sgGameLabel,
        lineupConfirmed: sgConfirmed,
        signals:        oSigs,
        avgIP,
      });
    });
  });

  // Sort by confidence, filter to positive-lean only, cap at 10 for readability
  return picks
    .filter(p => p.positive)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

// ─── HR / Hit board scoring ───────────────────────────────────────────────────
// hrBoardScore: 0–95 composite. Primary = SLG/HR pace. Secondary = park, wind, order, platoon.
const hrBoardScore = (hlog, order, pitcherHand, pf, wxFav, sd) => {
  if (!hlog) return null;
  let s = 50;
  const slg = parseFloat(hlog.slg) || 0;
  const hr  = parseInt(hlog.hr)    || 0;
  const ops = parseFloat(hlog.ops) || 0;
  // Power signal — SLG vs league avg ~.410
  if (slg > 0) s += (slg - 0.410) * 55;
  else          s += (ops - 0.720) * 20; // ops fallback if slg unavailable
  // HR pace (each HR this season adds to score)
  s += hr * 0.7;
  // Park HR factor
  s += (pf.hr - 1.0) * 35;
  // Wind boost
  if (wxFav) s += 8;
  // Batting order (higher slots = more PA)
  if      (order <= 3) s += 6;
  else if (order <= 5) s += 3;
  else if (order >= 8) s -= 4;
  // Platoon split from stat splits (bonus/penalty vs facing pitcher's hand)
  if (sd && typeof sd === "object" && sd !== "loading") {
    const hand = pitcherHand === "L" ? sd.vsL : sd.vsR;
    if (hand?.slg) s += (parseFloat(hand.slg) - (slg || 0.410)) * 25;
  }
  return Math.round(Math.max(15, Math.min(95, s)));
};

// hitBoardScore: 0–95 composite. Primary = AVG + recent form. Secondary = park, order, platoon.
const hitBoardScore = (hlog, order, pitcherHand, pf, sd) => {
  if (!hlog) return null;
  let s = 50;
  const avg = parseFloat(hlog.avg) || 0;
  const ops = parseFloat(hlog.ops) || 0;
  const hitRate = hlog.hitRate ?? [];
  const l5 = hitRate.slice(0, 5).reduce((a, v) => a + v, 0);
  // Season AVG vs league avg ~.250
  if (avg > 0) s += (avg - 0.250) * 140;
  else          s += (ops - 0.720) * 15;
  // Recent form: L5 hit rate vs 50% baseline
  s += (l5 / 5 - 0.40) * 28;
  // Park hit factor
  s += (pf.hit - 1.0) * 28;
  // Batting order
  if      (order <= 3) s += 6;
  else if (order <= 5) s += 3;
  else if (order >= 8) s -= 4;
  // Platoon split
  if (sd && typeof sd === "object" && sd !== "loading") {
    const hand = pitcherHand === "L" ? sd.vsL : sd.vsR;
    if (hand?.avg) s += (parseFloat(hand.avg) - (avg || 0.250)) * 110;
  }
  return Math.round(Math.max(15, Math.min(95, s)));
};

// kBoardScore: 0–95 composite for K prop attractiveness.
// Inputs: season pitcher stats obj, pitching gamelog, park factor, umpire obj
const kBoardScore = (pStats, gamelog, pf, umpire) => {
  if (!pStats) return null;
  let s = 40;
  const k9   = parseFloat(pStats.kPer9  ?? pStats.k9)  || 0;
  const whip = parseFloat(pStats.whip)                  || 0;
  // K/9 — primary signal (30 pts)
  if (k9 > 0) s += k9 >= 10 ? 30 : k9 >= 9 ? 22 : k9 >= 8 ? 14 : k9 >= 7 ? 7 : 0;
  // Recent K production — avg Ks last 3 starts (22 pts)
  const recentStarts = gamelog?.games ?? [];
  const last3 = recentStarts.slice(0, 3);
  if (last3.length > 0) {
    const avgK = last3.reduce((acc, g) => acc + (g.k ?? 0), 0) / last3.length;
    s += avgK >= 7 ? 22 : avgK >= 6 ? 16 : avgK >= 5 ? 10 : avgK >= 4 ? 5 : 0;
  }
  // Park K factor (18 pts)
  s += (pf.k - 1.0) * 90;
  // Umpire tendency (15 pts)
  if (umpire?.rating === "pitcher") s += 15;
  else if (umpire?.rating === "neutral" || !umpire) s += 8;
  else s += 3;
  // WHIP bonus — low WHIP = pitcher in control (10 pts)
  if (whip > 0) s += whip <= 1.05 ? 10 : whip <= 1.20 ? 6 : whip <= 1.35 ? 2 : 0;
  return Math.round(Math.max(10, Math.min(95, s)));
};

// outsBoardScore: 0–95 composite for Outs (innings pitched) prop attractiveness.
const outsBoardScore = (pStats, gamelog, pf) => {
  if (!pStats) return null;
  let s = 35;
  const whip = parseFloat(pStats.whip) || 0;
  const era  = parseFloat(pStats.era)  || 0;
  // Avg IP from recent starts — primary signal (35 pts)
  const avgIPStr = gamelog?.avgIP;
  if (avgIPStr && avgIPStr !== "—") {
    const [whole, frac = "0"] = String(avgIPStr).split(".");
    const outs = parseInt(whole) * 3 + parseInt(frac);
    const ip   = outs / 3;
    s += ip >= 6.5 ? 35 : ip >= 6.0 ? 26 : ip >= 5.5 ? 17 : ip >= 5.0 ? 8 : 0;
  }
  // WHIP — control = deeper games (28 pts)
  if (whip > 0) s += whip <= 1.00 ? 28 : whip <= 1.10 ? 20 : whip <= 1.20 ? 12 : whip <= 1.35 ? 5 : 0;
  // ERA trend: recent vs season (12 pts)
  const seasonEra = era;
  const recentStarts = gamelog?.games ?? [];
  const last3 = recentStarts.slice(0, 3);
  if (last3.length >= 2 && seasonEra > 0) {
    const totalOuts = last3.reduce((acc, g) => {
      const [w, f = "0"] = String(g.ip ?? "0").split(".");
      return acc + parseInt(w) * 3 + parseInt(f);
    }, 0);
    const totalER = last3.reduce((acc, g) => acc + (g.er ?? 0), 0);
    const recentEra = totalOuts > 0 ? (totalER * 27) / totalOuts : seasonEra;
    s += recentEra < seasonEra - 0.5 ? 12 : recentEra < seasonEra ? 7 : recentEra < seasonEra + 1 ? 3 : 0;
  }
  // Park hit suppression — pitcher parks allow deeper outings (10 pts)
  s += (1.0 - pf.hit) * 50;
  return Math.round(Math.max(10, Math.min(95, s)));
};

// computePitcherBoard: returns top-20 SP candidates sorted by score.
const computePitcherBoard = (type, liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps) => {
  const candidates = [];
  (liveSlate ?? []).forEach(game => {
    [
      { p: game.pitcher,     facingTeam: game.away?.abbr, isHome: true  },
      { p: game.awayPitcher, facingTeam: game.home?.abbr, isHome: false },
    ].forEach(({ p, facingTeam, isHome }) => {
      if (!p?.id) return;
      const pStats  = livePitcherStats[p.id];
      const gamelog = liveGameLog[p.id];
      if (!pStats && !gamelog) return;
      const pf      = PARK_FACTORS[game.home?.abbr] ?? NEUTRAL_PARK;
      const umpire  = liveUmpires[game.gamePk];
      const merged  = { ...(p ?? {}), ...(pStats ?? {}) };
      const score   = type === "k"
        ? kBoardScore(merged, gamelog, pf, umpire)
        : outsBoardScore(merged, gamelog, pf);
      if (score === null) return;

      const ppKey   = String(game.gamePk);
      const props   = Array.isArray(livePlayerProps[ppKey]?.props) ? livePlayerProps[ppKey].props : [];
      const lastName = (p.name ?? "").split(" ").pop().toLowerCase();
      const market  = type === "k" ? "pitcher_strikeouts" : "pitcher_outs_recorded";
      const propLine = props.find(pr => pr.market === market && pr.player.toLowerCase().includes(lastName)) ?? null;

      const recentStarts = (gamelog?.games ?? []).slice(0, 3);
      const avgK3Raw = recentStarts.length > 0
        ? recentStarts.reduce((s, g) => s + (g.k ?? 0), 0) / recentStarts.length
        : null;
      const avgK3 = avgK3Raw !== null ? avgK3Raw.toFixed(1) : null;

      // Synthetic suggested line — same math as Best Bets Today (fallback when Odds API has no line)
      const avgIPNum = (() => {
        const s = gamelog?.avgIP;
        if (!s || s === "—") return null;
        const [w, f = "0"] = String(s).split(".");
        return parseInt(w) + parseInt(f) / 3;
      })();
      const k9Num   = parseFloat(merged.kPer9 ?? merged.k9) || 0;
      const suggestedLine = type === "k"
        ? (avgK3Raw !== null
            ? Math.max(0.5, Math.round(avgK3Raw) - 0.5)
            : (k9Num > 0 && avgIPNum ? Math.max(0.5, Math.round(k9Num * avgIPNum / 9) - 0.5) : null))
        : (avgIPNum !== null
            ? Math.max(0.5, Math.round(avgIPNum * 3) - 0.5)
            : null);

      candidates.push({
        id:           p.id,
        name:         p.name ?? "TBD",
        team:         isHome ? (game.home?.abbr ?? "?") : (game.away?.abbr ?? "?"),
        hand:         p.hand ?? "R",
        gamePk:       game.gamePk,
        gameLabel:    `${game.away?.abbr ?? "?"} @ ${game.home?.abbr ?? "?"}`,
        facingTeam:   facingTeam ?? "?",
        score,
        era:          merged.era   ?? "—",
        k9:           merged.kPer9 ?? merged.k9 ?? "—",
        whip:         merged.whip  ?? "—",
        avgIP:        gamelog?.avgIP ?? "—",
        avgK3,
        umpire:       umpire?.name ?? null,
        umpireRating: umpire?.rating ?? null,
        propLine,
        suggestedLine,
      });
    });
  });
  return candidates.sort((a, b) => b.score - a.score).slice(0, 20);
};

// computeBatterBoard: returns top-20 batter candidates sorted by score.
const computeBatterBoard = (type, liveSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits) => {
  const candidates = [];
  (liveSlate ?? []).forEach(game => {
    const lu = liveLineups[game.gamePk];
    if (!lu?.confirmed) return; // skip games without a confirmed lineup
    const pf = PARK_FACTORS[game.home?.abbr] ?? NEUTRAL_PARK;
    const wx = liveWeather[game.gamePk];
    const wxFav = !!(wx?.hrFavorable);
    const ppKey = String(game.gamePk);
    const ppEntry = livePlayerProps[ppKey];
    const props = Array.isArray(ppEntry?.props) ? ppEntry.props : [];

    ["away", "home"].forEach(side => {
      // Away batters face the home SP; home batters face the away SP
      const facingPitcher = side === "away"
        ? game.pitcher
        : (game.awayPitcher ?? game.pitcher);
      const pitcherHand = facingPitcher?.hand ?? "R";
      const batters = lu[side] ?? [];

      batters.forEach(b => {
        if (!b?.id) return;
        const hlog = liveHittingLog[b.id];
        const sdKey = `${b.id}:hitting`;
        const sd = liveStatSplits[sdKey];

        const score = type === "hr"
          ? hrBoardScore(hlog, b.order, pitcherHand, pf, wxFav, sd)
          : hitBoardScore(hlog, b.order, pitcherHand, pf, sd);

        if (score === null) return; // no hlog yet

        const market = type === "hr" ? "batter_home_runs" : "batter_hits";
        // Match prop by last name (Odds API names are usually full names)
        const lastName = b.name.split(" ").pop().toLowerCase();
        const propLine = props.find(p =>
          p.market === market && p.player.toLowerCase().includes(lastName)
        ) ?? null;

        candidates.push({
          id:           b.id,
          name:         b.name,
          hand:         b.hand,
          order:        b.order,
          team:         side === "away" ? (game.away?.abbr ?? "?") : (game.home?.abbr ?? "?"),
          gamePk:       game.gamePk,
          gameLabel:    `${game.away?.abbr ?? "?"} @ ${game.home?.abbr ?? "?"}`,
          pitcher:      facingPitcher?.name ?? "—",
          pitcherHand,
          park:         game.stadium ?? "—",
          parkFactor:   type === "hr" ? pf.hr : pf.hit,
          windFav:      wxFav,
          score,
          avg:          hlog?.avg ?? "—",
          slg:          hlog?.slg ?? "—",
          hr:           hlog?.hr  ?? 0,
          ops:          hlog?.ops ?? "—",
          hitRate:      hlog?.hitRate ?? [],
          propLine,
        });
      });
    });
  });

  return candidates.sort((a, b) => b.score - a.score).slice(0, 20);
};

function computeLiveProps({
  IS_SAVANT_SANDBOX,
  IS_STATS_SANDBOX,
  pitcher,
  umpire,
  weather,
  parkFactor,
  game,
  batterSplits,
  batterMatchupScore,
  liveOddsMap,
  activeBatter,
  calcMatchupScore,
  activeMatchupPitcher,
  liveH2H,
  liveRbiCtx,
}) {
  try {
    const out = [];
    if (IS_SAVANT_SANDBOX) return out;

    // ── 1. PITCHER STRIKEOUT PROP ──────────────────────────────────────────────
    const kPer9Num = parseFloat(pitcher.kPer9) || 0;
    const avgIPNum = parseFloat(pitcher.avgIP) || 5.5;
    const rawAvgK  = parseFloat(pitcher.avgK);
    // Use avgK if available (mock or future stat), else derive from kPer9 × avgIP
    const baseK    = (!isNaN(rawAvgK) && rawAvgK > 0) ? rawAvgK : (kPer9Num / 9) * avgIPNum;

    if (baseK >= 3 && kPer9Num > 0) {
      const line = Math.ceil(baseK) - 0.5;
      let score  = 50;
      let projK  = baseK;
      const kR   = [`Avg ${baseK.toFixed(1)} K/start`];

      if (pitcher.arsenalLive && pitcher.arsenal.length > 0) {
        const totalPct  = pitcher.arsenal.reduce((s, p) => s + (p.pct || 0), 0) || 1;
        const wAvgWhiff = pitcher.arsenal.reduce((s, p) => s + ((parseFloat(p.whiffPct) || 25) * (p.pct || 0)), 0) / totalPct;
        const dW        = wAvgWhiff - 26;
        if      (dW >  5) { score += 8; projK += 0.8; kR.push(`Arsenal: ${Math.round(wAvgWhiff)}% whiff (elite)`); }
        else if (dW >  2) { score += 4; projK += 0.4; kR.push(`${Math.round(wAvgWhiff)}% arsenal whiff`); }
        else if (dW < -4) { score -= 6; projK -= 0.6; kR.push(`Low arsenal whiff (${Math.round(wAvgWhiff)}%)`); }
        const bestP = [...pitcher.arsenal].sort((a, b) => (parseFloat(b.whiffPct) || 0) - (parseFloat(a.whiffPct) || 0))[0];
        if (bestP && parseFloat(bestP.whiffPct) >= 35) kR.push(`${bestP.type}: ${bestP.whiffPct}% whiff`);
      }

      const umpK = parseFloat(umpire?.kRate) || 22.5;
      const dU   = umpK - 22.5;
      if      (dU >  2.5) { score += 7; projK += 0.5; kR.push(`${umpire.name || "Ump"}: wide K zone (${umpire.kRate})`); }
      else if (dU >  0.8) { score += 3; kR.push(`${umpire.name || "Ump"} favors pitchers`); }
      else if (dU < -2.0) { score -= 5; projK -= 0.4; kR.push(`${umpire.name || "Ump"}: tight zone (${umpire.kRate})`); }

      if (!weather?.roof) {
        const t = parseInt(weather?.temp) || 72;
        if      (t < 48) { score += 4; kR.push(`Cold ${t}° — offense suppressed`); }
        else if (t < 58) { score += 2; kR.push(`Cool ${t}°`); }
        else if (t > 85) { score -= 2; kR.push(`Hot ${t}° — hitter-friendly`); }
      }

      if (parkFactor.k >= 1.03) { score += 4; kR.push(`${game.home.abbr} suppresses offense (K ${parkFactor.k}x)`); }
      else if (parkFactor.k <= 0.95) { score -= 3; kR.push(`${game.home.abbr} hitter-friendly (K ${parkFactor.k}x)`); }

      const awayBatters = game.lineups?.away ?? [];
      const withSplits  = awayBatters.filter(lb => batterSplits[lb.id]);
      if (withSplits.length >= 3) {
        const topAbbrs = pitcher.arsenal.slice(0, 3).map(p => p.abbr);
        let wSum = 0, wN = 0;
        withSplits.forEach(lb => {
          topAbbrs.forEach(abbr => {
            const sp = batterSplits[lb.id]?.[abbr];
            if (sp) { wSum += parseFloat(sp.whiff) || 0; wN++; }
          });
        });
        if (wN > 0) {
          const lW = wSum / wN;
          if      (lW > 30) { score += 5; projK += 0.4; kR.push(`Lineup whiffs ${Math.round(lW)}% vs arsenal`); }
          else if (lW < 18) { score -= 5; projK -= 0.4; kR.push(`Lineup makes contact vs arsenal`); }
        }
      }

      if (pitcher.arsenalLive && pitcher.arsenal.length > 0) {
        const fbTypes = ["FF", "SI", "FC", "FS"];
        const primaryFb = pitcher.arsenal.find(p => fbTypes.includes(p.abbr)) ?? pitcher.arsenal[0];
        const curVelo = parseFloat(primaryFb?.velo);
        const prvVelo = parseFloat(primaryFb?.prevVelo);
        if (!isNaN(curVelo) && !isNaN(prvVelo) && primaryFb?.prevVelo) {
          const veloDelta = curVelo - prvVelo;
          const abbrLabel = primaryFb.abbr;
          if      (veloDelta <= -1.5) { score -= 4; projK -= 0.3; kR.push(`${abbrLabel} velo down ${veloDelta.toFixed(1)} mph YoY`); }
          else if (veloDelta <= -0.8) { score -= 2; kR.push(`${abbrLabel} velo down ${veloDelta.toFixed(1)} mph YoY`); }
          else if (veloDelta >=  0.8) { score += 3; projK += 0.2; kR.push(`${abbrLabel} velo up +${veloDelta.toFixed(1)} mph YoY`); }
        }
      }

      score = Math.max(38, Math.min(75, score));
      const kLean = projK >= line ? "OVER" : "UNDER";
      out.push({
        label:      `${pitcher.name?.split(" ").slice(-1)[0] ?? pitcher.name} K's O/U ${line}`,
        propType:   "K",
        confidence: Math.round(score),
        lean:       kLean,
        positive:   kLean === "OVER",
        reason:     kR.slice(0, 3).join(" · "),
      });
    }

    {
      const avgIPNum2 = parseFloat(pitcher.avgIP) || 0;
      if (avgIPNum2 >= 4) {
        const baseOuts = avgIPNum2 * 3;
        const line     = Math.round(baseOuts) - 0.5;
        let   score    = 50;
        let   projOuts = baseOuts;
        const oR       = [`Avg ${avgIPNum2.toFixed(1)} IP/start (${Math.round(baseOuts)} outs)`];

        const whipNum = parseFloat(pitcher.whip);
        if (!isNaN(whipNum)) {
          if      (whipNum >= 1.40) { score -= 7; projOuts -= 1.0; oR.push(`High WHIP ${whipNum} — bullpen risk`); }
          else if (whipNum >= 1.25) { score -= 3; projOuts -= 0.5; oR.push(`WHIP ${whipNum}`); }
          else if (whipNum <= 1.05) { score += 6; projOuts += 0.7; oR.push(`Elite WHIP ${whipNum}`); }
          else if (whipNum <= 1.15) { score += 3; projOuts += 0.3; oR.push(`Solid WHIP ${whipNum}`); }
        }

        const bbNum = parseFloat(pitcher.bbPer9 ?? pitcher.bb9);
        if (!isNaN(bbNum)) {
          if      (bbNum >= 3.8) { score -= 6; projOuts -= 0.8; oR.push(`High walk rate (${bbNum} BB/9)`); }
          else if (bbNum >= 3.0) { score -= 2; oR.push(`${bbNum} BB/9`); }
          else if (bbNum <= 1.8) { score += 5; projOuts += 0.6; oR.push(`Elite control (${bbNum} BB/9)`); }
          else if (bbNum <= 2.3) { score += 2; oR.push(`Good control (${bbNum} BB/9)`); }
        }

        const oppBatters = game.lineups?.away ?? [];
        if (oppBatters.length >= 6) {
          const scores = oppBatters.map(b => batterMatchupScore(b, pitcher)).filter(s => s > 0);
          if (scores.length >= 4) {
            const avgSc = scores.reduce((a, b) => a + b, 0) / scores.length;
            if      (avgSc >= 55) { score -= 7; projOuts -= 1.0; oR.push(`Tough lineup (avg score ${Math.round(avgSc)})`); }
            else if (avgSc >= 47) { score -= 3; projOuts -= 0.4; oR.push(`Solid lineup (avg ${Math.round(avgSc)})`); }
            else if (avgSc <= 30) { score += 5; projOuts += 0.6; oR.push(`Weak lineup (avg ${Math.round(avgSc)})`); }
            else if (avgSc <= 38) { score += 2; projOuts += 0.3; oR.push(`Below-avg lineup`); }
          }
        }

        if (!weather?.roof) {
          const t = parseInt(weather?.temp) || 72;
          if      (t < 48) { score += 3; projOuts += 0.3; oR.push(`Cold ${t}° — offense suppressed`); }
          else if (t > 88) { score -= 3; projOuts -= 0.3; oR.push(`Hot ${t}° — hitter-friendly`); }
        }

        if      (parkFactor.hit >= 1.06) { score -= 4; projOuts -= 0.4; oR.push(`${game.home.abbr} hitter-friendly (${parkFactor.hit}x hits)`); }
        else if (parkFactor.hit <= 0.93) { score += 4; projOuts += 0.4; oR.push(`${game.home.abbr} pitcher-friendly (${parkFactor.hit}x hits)`); }

        score = Math.max(38, Math.min(74, score));
        const outsLean = projOuts >= line ? "OVER" : "UNDER";
        out.push({
          label:      `${pitcher.name?.split(" ").slice(-1)[0] ?? pitcher.name} Outs O/U ${line}`,
          propType:   "Outs",
          confidence: Math.round(score),
          lean:       outsLean,
          positive:   outsLean === "OVER",
          reason:     oR.slice(0, 3).join(" · "),
        });
      }
    }

    {
      const homeSp = pitcher;
      const awaySp = game.awayPitcher;
      const homeEra = parseFloat(homeSp?.era);
      const awayEra = parseFloat(awaySp?.era);
      const hasSpData = (!isNaN(homeEra) && homeEra > 0) || (!isNaN(awayEra) && awayEra > 0);

      if (hasSpData) {
        let f5Score = 50;
        const f5R = [];
        const f5GameKey = `${game.away.name}|${game.home.name}`;
        const f5LineRaw = liveOddsMap[f5GameKey]?.f5Total ?? null;
        const f5Label   = f5LineRaw ? `F5 O/U ${f5LineRaw}` : "F5 O/U";

        const eras = [homeEra, awayEra].filter(n => !isNaN(n) && n > 0);
        if (eras.length > 0) {
          const avgEra = eras.reduce((a, b) => a + b, 0) / eras.length;
          if      (avgEra < 3.00) { f5Score -= 8; f5R.push(`Avg SP ERA ${avgEra.toFixed(2)} — elite`); }
          else if (avgEra < 3.80) { f5Score -= 4; f5R.push(`Avg SP ERA ${avgEra.toFixed(2)}`); }
          else if (avgEra > 5.00) { f5Score += 8; f5R.push(`Avg SP ERA ${avgEra.toFixed(2)} — vulnerable`); }
          else if (avgEra > 4.20) { f5Score += 4; f5R.push(`Avg SP ERA ${avgEra.toFixed(2)}`); }
        }

        const k9s = [parseFloat(homeSp?.kPer9), parseFloat(awaySp?.kPer9)].filter(n => !isNaN(n) && n > 0);
        if (k9s.length > 0) {
          const avgK9 = k9s.reduce((a, b) => a + b, 0) / k9s.length;
          if      (avgK9 >= 10.5) { f5Score -= 7; f5R.push(`Avg K/9 ${avgK9.toFixed(1)} — swing-miss arms`); }
          else if (avgK9 >=  9.0) { f5Score -= 3; f5R.push(`Avg K/9 ${avgK9.toFixed(1)}`); }
          else if (avgK9 <=  6.5) { f5Score += 6; f5R.push(`Avg K/9 ${avgK9.toFixed(1)} — contact-heavy`); }
          else if (avgK9 <=  7.5) { f5Score += 2; f5R.push(`Avg K/9 ${avgK9.toFixed(1)}`); }
        }

        const pHit = parkFactor?.hit ?? 1.00;
        if      (pHit >= 1.15) { f5Score += 7; f5R.push(`${game.home.abbr} hitter-friendly park (${pHit}x)`); }
        else if (pHit >= 1.08) { f5Score += 3; f5R.push(`Hitter-friendly park`); }
        else if (pHit <= 0.90) { f5Score -= 6; f5R.push(`Pitcher-friendly park (${pHit}x)`); }
        else if (pHit <= 0.95) { f5Score -= 3; f5R.push(`Pitcher-friendly park`); }

        if (!weather?.roof) {
          const f5Temp = parseInt(weather?.temp) || 72;
          if      (f5Temp < 48) { f5Score -= 5; f5R.push(`Cold ${f5Temp}° — suppresses scoring`); }
          else if (f5Temp < 58) { f5Score -= 2; f5R.push(`Cool ${f5Temp}°`); }
          else if (f5Temp > 85) { f5Score += 3; f5R.push(`Hot ${f5Temp}° — hitter-friendly`); }
          if      (weather?.hrFavorable)                                  { f5Score += 4; f5R.push("Wind blowing OUT"); }
          else if ((weather?.wind || "").toLowerCase().includes(" in ")) { f5Score -= 3; f5R.push("Wind blowing IN"); }
        }

        const nrfiLeanVal = game.nrfi?.lean;
        const nrfiConfVal = parseInt(game.nrfi?.confidence) || 50;
        if      (nrfiLeanVal === "NRFI" && nrfiConfVal >= 62) { f5Score -= 5; f5R.push(`NRFI lean ${nrfiConfVal}% — both SPs lock in early`); }
        else if (nrfiLeanVal === "NRFI" && nrfiConfVal >= 55) { f5Score -= 2; f5R.push(`Moderate NRFI lean`); }
        else if (nrfiLeanVal === "YRFI" && nrfiConfVal >= 62) { f5Score += 4; f5R.push(`YRFI lean ${nrfiConfVal}% — active F1`); }

        f5Score = Math.max(35, Math.min(72, f5Score));
        const f5Lean = f5Score >= 50 ? "OVER" : "UNDER";
        out.push({
          label:      f5Label,
          propType:   "F5",
          confidence: Math.round(f5Score),
          lean:       f5Lean,
          positive:   f5Lean === "OVER",
          reason:     f5R.slice(0, 3).join(" · "),
        });
      }
    }

    const batAvg = parseFloat(activeBatter?.avg) || 0;
    if (IS_STATS_SANDBOX && batAvg >= 0.180 && activeBatter?.name) {
      const hitProb = 1 - Math.pow(1 - batAvg, 4);
      let hitScore  = Math.round(hitProb * 85);
      const hR      = [`${activeBatter.avg} season AVG`];

      const ms = calcMatchupScore(activeBatter.hand, activeBatter.vsPitches, activeMatchupPitcher.arsenal, activeMatchupPitcher.hand);
      if      (ms >= 55) { hitScore += 6; hR.push(`Batter edge matchup (${ms}/100)`); }
      else if (ms <  35) { hitScore -= 8; hR.push(`Pitcher edge matchup (${ms}/100)`); }
      else               {               hR.push(`Neutral matchup (${ms}/100)`); }

      if (Array.isArray(activeBatter.hitRate) && activeBatter.hitRate.length > 0) {
        const last5 = activeBatter.hitRate.slice(-5);
        const hits5 = last5.filter(h => h > 0).length;
        if      (hits5 >= 4) { hitScore += 5; hR.push(`Hot — ${hits5}/5 recent with a hit`); }
        else if (hits5 <= 1) { hitScore -= 5; hR.push(`Cold — ${hits5}/5 recent with a hit`); }
      }

      if (!weather?.roof && parseInt(weather?.temp) < 50) {
        hitScore -= 3;
        hR.push(`Cold ${weather.temp}° — suppresses offense`);
      }

      if      (parkFactor.hit >= 1.10) { hitScore += 5; hR.push(`${game.home.abbr} hit-friendly park (${parkFactor.hit}x)`); }
      else if (parkFactor.hit >= 1.05) { hitScore += 3; hR.push(`${game.home.abbr} hitter-friendly park`); }
      else if (parkFactor.hit <= 0.96) { hitScore -= 4; hR.push(`${game.home.abbr} suppresses hits (${parkFactor.hit}x)`); }

      if (activeMatchupPitcher.arsenalLive && activeMatchupPitcher.arsenal.length > 0 && activeBatter.vsPitches) {
        const primary = activeMatchupPitcher.arsenal[0];
        const vsP = activeBatter.vsPitches?.[primary.abbr];
        if (vsP) {
          const pvAvg = parseFloat(typeof vsP === "object" ? vsP.avg : vsP) || 0;
          const pvNote = pvAvg >= 0.280
            ? `${activeBatter.name?.split(" ").slice(-1)[0]} hits ${typeof vsP === "object" ? vsP.avg : vsP} vs ${primary.type} (${primary.pct}% usage)`
            : pvAvg <= 0.215
            ? `Struggles vs ${primary.type} (${typeof vsP === "object" ? vsP.avg : vsP} avg — pitcher's primary pitch)`
            : null;
          if (pvNote) hR.push(pvNote);
        }
      }

      const h2hOpposingId = activeMatchupPitcher?.id;
      if (!IS_STATS_SANDBOX && h2hOpposingId && activeBatter?.id) {
        const h2hEngineKey = `${activeBatter.id}_${h2hOpposingId}`;
        const h2hData = liveH2H[h2hEngineKey];
        if (h2hData && (h2hData.atBats ?? 0) >= 10) {
          const h2hAvg = parseFloat(h2hData.avg) || 0;
          const sampleTag = h2hData.atBats >= 20 ? "" : " (sm sample)";
          if      (h2hAvg >= 0.320) { hitScore += 8; hR.push(`${h2hData.avg} career H2H avg${sampleTag}`); }
          else if (h2hAvg >= 0.270) { hitScore += 4; hR.push(`${h2hData.avg} career H2H avg${sampleTag}`); }
          else if (h2hAvg <= 0.170) { hitScore -= 8; hR.push(`${h2hData.avg} career H2H avg${sampleTag}`); }
          else if (h2hAvg <= 0.210) { hitScore -= 4; hR.push(`${h2hData.avg} career H2H avg${sampleTag}`); }
        }
      }

      hitScore = Math.max(38, Math.min(75, hitScore));
      const hitLean = hitScore >= 50 ? "OVER" : "UNDER";
      out.push({
        label:      `${activeBatter.name?.split(" ").slice(-1)[0] ?? activeBatter.name} Hits O/U 0.5`,
        propType:   "Hits",
        confidence: hitScore,
        lean:       hitLean,
        positive:   hitLean === "OVER",
        reason:     hR.slice(0, 3).join(" · "),
      });

      const batOps = parseFloat(activeBatter?.ops) || 0;
      if (batOps >= 0.600) {
        let tbScore = Math.round(Math.max(0, Math.min(1, (batOps - 0.600) / 0.500)) * 40) + 40;
        const tR    = [`${activeBatter.ops} OPS`];

        if (!weather?.roof) {
          const windStr = (weather?.wind || "").toLowerCase();
          if (weather?.hrFavorable) {
            tbScore += 6; tR.push("Wind blowing OUT — power favorable");
          } else if (/\bin\b/.test(windStr)) {
            tbScore -= 5; tR.push("Wind blowing IN — suppresses XBH");
          }
        }

        if      (parkFactor.hr >= 1.15) { tbScore += 8; tR.push(`${game.home.abbr} launches HRs (${parkFactor.hr}x HR factor)`); }
        else if (parkFactor.hr >= 1.08) { tbScore += 4; tR.push(`${game.home.abbr} hitter-friendly park`); }
        else if (parkFactor.hr <= 0.87) { tbScore -= 6; tR.push(`${game.home.abbr} suppresses HRs (${parkFactor.hr}x HR factor)`); }
        else if (parkFactor.hr <= 0.93) { tbScore -= 3; tR.push(`${game.home.abbr} pitcher-friendly park`); }

        if (activeBatter.vsPitches && activeMatchupPitcher.arsenal.length > 0) {
          let slgSum = 0, slgN = 0;
          activeMatchupPitcher.arsenal.slice(0, 3).forEach(p => {
            const vs = activeBatter.vsPitches?.[p.abbr];
            if (vs && typeof vs === "object" && vs.slg) { slgSum += parseFloat(vs.slg) || 0; slgN++; }
          });
          if (slgN > 0) {
            const avgSlg = slgSum / slgN;
            const slgFmt = `.${String(Math.round(avgSlg * 1000)).padStart(3, "0")}`;
            if      (avgSlg > 0.500) { tbScore += 7; tR.push(`${slgFmt} SLG vs this arsenal`); }
            else if (avgSlg < 0.300) { tbScore -= 6; tR.push(`Low SLG vs arsenal (${slgFmt})`); }
          }
        }

        tbScore = Math.max(38, Math.min(75, tbScore));
        const tbLean = tbScore >= 50 ? "OVER" : "UNDER";
        out.push({
          label:      `${activeBatter.name?.split(" ").slice(-1)[0] ?? activeBatter.name} TB O/U 1.5`,
          propType:   "TB",
          confidence: tbScore,
          lean:       tbLean,
          positive:   tbLean === "OVER",
          reason:     tR.slice(0, 3).join(" · "),
        });

        let hrScore = 45;
        const hrR = [];
        const hrBatterLast = activeBatter.name?.split(" ").slice(-1)[0] ?? activeBatter.name;
        const pHr = parkFactor?.hr ?? 100;
        if      (pHr >= 115) { hrScore += 8; hrR.push(`HR park (${parkFactor?.label ?? ""})`); }
        else if (pHr >= 108) { hrScore += 4; hrR.push(`HR-friendly park`); }
        else if (pHr <= 85)  { hrScore -= 6; hrR.push(`HR-suppressing park (${parkFactor?.label ?? ""})`); }
        else if (pHr <= 93)  { hrScore -= 3; hrR.push(`Below-avg HR park`); }

        if (!weather?.roof) {
          if (weather?.hrFavorable) { hrScore += 8; hrR.push(`Wind blowing out`); }
          else {
            const windStr = (weather?.wind || "").toLowerCase();
            if (windStr.includes("in"))  { hrScore -= 5; hrR.push(`Wind blowing in`); }
          }
          const hrTemp = parseInt(weather?.temp) || 72;
          if      (hrTemp < 50) { hrScore -= 4; hrR.push(`Cold (${hrTemp}°F)`); }
          else if (hrTemp < 58) { hrScore -= 2; hrR.push(`Cool (${hrTemp}°F)`); }
        }

        if (activeBatter.vsPitches && activeMatchupPitcher.arsenal.length > 0) {
          let hrSlgSum = 0, hrSlgN = 0;
          activeMatchupPitcher.arsenal.slice(0, 3).forEach(p => {
            const vs = activeBatter.vsPitches?.[p.abbr];
            if (vs && typeof vs === "object" && vs.slg) { hrSlgSum += parseFloat(vs.slg) || 0; hrSlgN++; }
          });
          if (hrSlgN > 0) {
            const hrAvgSlg = hrSlgSum / hrSlgN;
            const hrSlgFmt = `.${String(Math.round(hrAvgSlg * 1000)).padStart(3, "0")}`;
            if      (hrAvgSlg > 0.500) { hrScore += 6; hrR.push(`${hrSlgFmt} SLG vs arsenal`); }
            else if (hrAvgSlg < 0.300) { hrScore -= 5; hrR.push(`Low SLG vs arsenal (${hrSlgFmt})`); }
          }
        }

        const hrWhip = parseFloat(activeMatchupPitcher.whip) || 1.25;
        if      (hrWhip > 1.40) { hrScore += 4; hrR.push(`Pitcher WHIP ${hrWhip.toFixed(2)} (hittable)`); }
        else if (hrWhip < 1.10) { hrScore -= 3; hrR.push(`Pitcher WHIP ${hrWhip.toFixed(2)} (stingy)`); }

        hrScore = Math.max(38, Math.min(72, hrScore));
        const hrLean = hrScore >= 50 ? "OVER" : "UNDER";
        out.push({
          label:      `${hrBatterLast} HR O/U 0.5`,
          propType:   "HR",
          confidence: hrScore,
          lean:       hrLean,
          positive:   hrLean === "OVER",
          reason:     hrR.slice(0, 3).join(" · "),
        });

        const rbiCtxData   = liveRbiCtx[activeBatter.id];
        const rbiLast      = activeBatter.name?.split(" ").slice(-1)[0] ?? activeBatter.name;
        let   rbiScore     = 45;
        const rbiR         = [];
        const rbiPerGame   = rbiCtxData?.rbiPerGame ?? null;
        const batOrder     = activeBatter.battingOrder ?? null;

        if (rbiPerGame !== null) {
          rbiR.push(`${rbiPerGame.toFixed(3)} RBI/G career`);
          if      (rbiPerGame >= 0.75) { rbiScore += 10; }
          else if (rbiPerGame >= 0.60) { rbiScore += 6;  }
          else if (rbiPerGame >= 0.45) { rbiScore += 2;  }
          else if (rbiPerGame <= 0.25) { rbiScore -= 8;  }
          else if (rbiPerGame <= 0.35) { rbiScore -= 4;  }
        }

        if (batOrder !== null) {
          const pos = Number(batOrder);
          if      (pos >= 3 && pos <= 5) { rbiScore += 6;  rbiR.push(`Cleanup spot (#${pos})`); }
          else if (pos === 6 || pos === 7){ rbiScore += 2;  rbiR.push(`Mid-order (#${pos})`); }
          else if (pos <= 2)             { rbiScore -= 5;  rbiR.push(`Leadoff (#${pos}) — fewer RBI chances`); }
          else if (pos >= 8)             { rbiScore -= 4;  rbiR.push(`Bottom of order (#${pos})`); }
        }

        const xbh = rbiCtxData?.extraBaseHits ?? null;
        if (xbh !== null) {
          if      (xbh >= 400) { rbiScore += 5; rbiR.push(`${xbh} career XBH (elite power)`); }
          else if (xbh >= 250) { rbiScore += 3; rbiR.push(`${xbh} career XBH`); }
          else if (xbh <= 80)  { rbiScore -= 4; rbiR.push(`${xbh} career XBH (slap hitter)`); }
        }

        const rbiEra = parseFloat(activeMatchupPitcher.whip) || 1.25;
        if      (rbiEra > 1.40) { rbiScore += 4; rbiR.push(`Pitcher WHIP ${rbiEra.toFixed(2)} — hittable`); }
        else if (rbiEra < 1.10) { rbiScore -= 4; rbiR.push(`Pitcher WHIP ${rbiEra.toFixed(2)} — limits damage`); }

        if (!weather?.roof && parseInt(weather?.temp) < 50) {
          rbiScore -= 3; rbiR.push(`Cold ${weather.temp}° — fewer runs scored`);
        }

        rbiScore = Math.max(38, Math.min(70, rbiScore));
        const rbiLean = rbiScore >= 50 ? "OVER" : "UNDER";
        out.push({
          label:      `${rbiLast} RBI O/U 0.5`,
          propType:   "RBI",
          confidence: Math.round(rbiScore),
          lean:       rbiLean,
          positive:   rbiLean === "OVER",
          reason:     rbiR.slice(0, 3).join(" · "),
        });
      }
    }

    return out;
  } catch (e) {
    console.error("Prop engine error:", e);
    return [];
  }
}

function computeEraNrfiLean({ IS_STATS_SANDBOX, apiNrfi, game, weather }) {
  if (IS_STATS_SANDBOX || apiNrfi) return null;
  const era = parseFloat(game.pitcher?.era);
  if (isNaN(era) || !game.pitcher?.era || game.pitcher.era === "—") return null;
  let score = 0;
  if      (era < 2.50) score += 15;
  else if (era < 3.50) score += 8;
  else if (era < 4.50) score += 2;
  else if (era > 5.50) score -= 12;
  else                 score -= 6;
  if (!weather?.roof) {
    const temp = parseInt(weather?.temp) || 72;
    if (temp < 50) score += 10;
    else if (temp < 60) score += 5;
    if (weather?.hrFavorable) score -= 8;
    else if (/\bin\b/.test((weather?.wind || "").toLowerCase())) score += 6;
  }
  const pf = PARK_FACTORS[game.home?.abbr];
  if (pf) {
    if      (pf.hr >= 1.15) score -= 10;
    else if (pf.hr >= 1.08) score -= 5;
    else if (pf.hr <= 0.87) score += 8;
    else if (pf.hr <= 0.93) score += 4;
  }
  return { lean: score >= 0 ? "NRFI" : "YRFI", confidence: Math.min(75, Math.max(38, 50 + Math.abs(score))) };
}

function computePitchMatchupGood(avg, whiff) {
  const a = parseFloat(avg) || 0;
  const w = parseFloat(whiff) || 0;
  if (a >= 0.280 && w < 25) return true;
  if (a <= 0.215 || w >= 35) return false;
  return null;
}

function computePitchMatchupNote(abbr, avg, whiff) {
  const a = parseFloat(avg) || 0;
  const w = parseFloat(whiff) || 0;
  if (a >= 0.300 && w < 20) return `Elite contact vs ${abbr}`;
  if (a >= 0.280)            return `Solid contact rate vs ${abbr}`;
  if (a <= 0.180 || w >= 40) return `Severe weakness vs ${abbr} — high K exposure`;
  if (a <= 0.215)            return `Weak contact vs ${abbr}`;
  if (w >= 30)               return `High whiff rate (${whiff}) — chases out of zone`;
  return `Average results vs ${abbr}`;
}

function calcMatchupScoreForPitchSet(batterHand, vsPitches, arsenal, pitcherHand) {
  const handPenalty = (pitcherHand === batterHand) ? 0.92 : 1.0;

  let weightedSum = 0;
  let totalWeight = 0;

  arsenal.forEach(({ abbr, pct }) => {
    const p = vsPitches?.[abbr];
    if (!p) return;

    const capPct = Math.min(pct, 40);
    const weight = capPct / 100;

    const avg   = parseFloat(typeof p === "object" ? p.avg   : p) || 0;
    const whiff = parseFloat(typeof p === "object" ? p.whiff : "20") || 20;
    const slg   = parseFloat(typeof p === "object" ? p.slg   : String(avg * 1.6)) || avg * 1.6;

    const avgScore   = Math.max(0, Math.min(1, (avg - 0.150) / 0.250));
    const whiffScore = Math.max(0, Math.min(1, 1 - (whiff / 50)));
    const slgScore   = Math.max(0, Math.min(1, (slg - 0.200) / 0.500));
    const pitchScore = (avgScore * 0.45) + (whiffScore * 0.35) + (slgScore * 0.20);

    weightedSum += pitchScore * weight * handPenalty;
    totalWeight += weight;
  });

  if (totalWeight === 0) return 50;
  const normalized = (weightedSum / totalWeight) * 100;
  return Math.round(normalized * 10) / 10;
}

function augmentBatterWithSplits(batter, batterSplits) {
  if (!batter?.id) return batter;
  const liveSplits = batterSplits[batter.id];
  if (!liveSplits) return batter;
  const enriched = {};
  Object.entries(liveSplits).forEach(([abbr, split]) => {
    enriched[abbr] = {
      ...split,
      good: computePitchMatchupGood(split.avg, split.whiff),
      note: computePitchMatchupNote(abbr, split.avg, split.whiff),
    };
  });
  return { ...batter, vsPitches: enriched, splitsLive: true };
}

function batterMatchupScoreForPitcher(batter, matchupPitcher, batterSplits) {
  const augmentedBatter = augmentBatterWithSplits(batter, batterSplits);
  return calcMatchupScoreForPitchSet(
    augmentedBatter.hand,
    augmentedBatter.vsPitches,
    matchupPitcher.arsenal,
    matchupPitcher.hand
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  // ── Auth state ────────────────────────────────────────────────────────────
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("propscout_token") || null);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const t = localStorage.getItem("propscout_token");
      if (!t) return null;
      const payload = JSON.parse(atob(t.split(".")[1]));
      return { userId: payload.userId, username: payload.username };
    } catch { return null; }
  });
  const [loginUser,    setLoginUser]    = useState("");
  const [loginPass,    setLoginPass]    = useState("");
  const [loginError,   setLoginError]   = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [selectedId, setSelectedId] = useState(1);
  const [view, setView] = useState("slate"); // "slate" | "game" | "picks" | "model" | "board"
  const [showHelp, setShowHelp] = useState(false);
  const [whyModal, setWhyModal] = useState(null); // { c, type: boardTab, rank }
  const [picksFilter, setPicksFilter] = useState("all"); // "all" | "pending" | "hit" | "miss"
  const [showTrends, setShowTrends] = useState(true);   // collapse/expand Trends card in Picks view
  const [liveDigest, setLiveDigest] = useState(null);   // { period, total, hits, misses, pct, bestHit, worstMiss, byType }
  const [digestLoading, setDigestLoading] = useState(false);
  const [showDigest, setShowDigest] = useState(true);   // collapse/expand 7-day digest card
  // Prop result tracker — persisted to localStorage
  const [propLog, setPropLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem("propscout_log") || "[]"); }
    catch { return []; }
  });
  const [syncStatus, setSyncStatus] = useState(null); // null | "syncing" | "done" | "error"
  const [syncMessage, setSyncMessage] = useState("");
  const [picksServerReachable, setPicksServerReachable] = useState(false);
  const [tab, setTab] = useState("overview");
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [liveWeather, setLiveWeather] = useState({});
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [liveOddsMap, setLiveOddsMap] = useState({});
  const [oddsApiInfo, setOddsApiInfo] = useState(null); // { remaining, used, fetchedAt }
  const [oddsLoading, setOddsLoading] = useState(false);
  // These MUST live here — before any early return — to satisfy Rules of Hooks
  const [lineupSide, setLineupSide] = useState("away");
  const [expandedBatter, setExpandedBatter] = useState(null);
  const [expandedPropRow, setExpandedPropRow] = useState(null); // "market:player" key for props table expand
  const [pitcherSide, setPitcherSide] = useState("home");  // "home" | "away"
  const [arsenalSide, setArsenalSide] = useState("home");  // "home" | "away"
  // Live Stats API state
  const [liveSlate, setLiveSlate] = useState(null);
  const [slateLoading, setSlateLoading] = useState(false);
  const [researchMode, setResearchMode]   = useState(false);
  const [logoClicks,   setLogoClicks]     = useState(0);
  const [slateDate,    setSlateDate]      = useState(null); // null = today
  const [liveLineups, setLiveLineups] = useState({});
  const [liveUmpires, setLiveUmpires] = useState({});
  const [livePitcherStats, setLivePitcherStats] = useState({});
  const [liveGameLog, setLiveGameLog] = useState({});
  // Baseball Savant data — keyed by MLB player ID
  const [pitcherArsenal, setPitcherArsenal] = useState({}); // pitcherId → arsenal array
  const [batterSplits, setBatterSplits] = useState({});     // batterId  → splits object
  const [liveHittingLog, setLiveHittingLog] = useState({});
  const [liveH2H, setLiveH2H] = useState({});               // `${batterId}_${pitcherId}` → h2h object
  const [liveRbiCtx, setLiveRbiCtx] = useState({});        // batterId → { rbiPerGame, rbiRate, slg, extraBaseHits }
  const [liveBullpen,  setLiveBullpen]  = useState({});     // gamePk    → { away, home } bullpen object
  const [liveNrfiData, setLiveNrfiData] = useState({});     // gamePk    → { awayFirst, homeFirst, lean, confidence }
  const [liveScores,   setLiveScores]   = useState({});     // gamePk    → { inning, halfInning, awayScore, homeScore, outs }
  const [liveInjuries, setLiveInjuries] = useState([]);
  const [gameNotes,    setGameNotes]    = useState({});     // gamePk → note string
  const [liveTrends,   setLiveTrends]   = useState({});     // gamePk → summary string | "loading" | null
  const trendsFetched  = useRef(new Set());                  // tracks gamePks already fetched (avoids stale-closure re-fetch)
  const [liveAiProps,    setLiveAiProps]    = useState({});  // gamePk → [...props] | "loading" | null
  const aiPropsFetched   = useRef(new Set());                 // guards against stale-closure re-fetch
  const [livePlayerProps, setLivePlayerProps] = useState({}); // gamePk → { props: [] } | "loading" | null
  const [dailyCard,      setDailyCard]      = useState(null);  // null | "loading" | { card, date, gamesAnalyzed, cap, ... }
  const [dailyCardOpen,  setDailyCardOpen]  = useState(false); // controls panel visibility
  const playerPropsFetched = useRef(new Set());               // guards sportsbook lines fetch
  const [pitcherPlatoonSplits, setPitcherPlatoonSplits] = useState({}); // pitcherId → {vsL,vsR} | "loading" | null
  const [liveStatSplits,       setLiveStatSplits]       = useState({}); // `${id}:${group}` → splits obj | "loading" | null
  const [boardTab,             setBoardTab]             = useState("hr"); // "hr" | "hits" | "k" | "outs"
  const boardPropsFetched = useRef(new Set());                            // guards board-level props pre-fetch
  const [noteSaveState, setNoteSaveState] = useState(null); // null | "saving" | "saved"
  const [copiedPickId, setCopiedPickId] = useState(null);   // id of pick just copied to clipboard
  const [parlayLabels, setParlayLabels] = useState([]);      // labels of props selected for parlay (max 3)
  const [parlaySlipCopied, setParlaySlipCopied] = useState(false);
  const [liveBoxscores, setLiveBoxscores] = useState({});    // gamePk → boxscore object | null
  const [boxSide,       setBoxSide]       = useState("away");// batting + pitching toggle: "away" | "home"
  const boxscoreFetched = useRef(new Set());                  // gamePks whose final boxscore is cached
  const gradedGames     = useRef(new Set());                  // idempotency: gamePks already auto-graded
  const [liveBoardResults, setLiveBoardResults] = useState({}); // playerId → { h, hr, ab, live }
  const boardBoxFetched = useRef(new Set());                  // gamePks already fetched for Board results

  // Fetch weather when a game card is opened
  useEffect(() => {
    if (view !== "game") return;
    // Works for both mock (id-keyed) and live (gamePk-keyed) slates
    const sg       = !IS_STATS_SANDBOX && liveSlate ? liveSlate.find(g => g.gamePk === selectedId) : null;
    const mockGame = SLATE.find(g => g.id === selectedId);
    const stadium  = sg?.stadium ?? mockGame?.stadium;
    const gameTime = sg?.time    ?? mockGame?.time ?? "";
    const mockWx   = mockGame?.weather ?? {};
    if (!stadium) return;
    if (STADIUMS[stadium]?.roof) return; // dome — skip fetch
    if (liveWeather[selectedId]) return;
    setWeatherLoading(true);
    fetchWeather(selectedId, stadium, gameTime, mockWx).then(data => {
      setLiveWeather(prev => ({ ...prev, [selectedId]: data }));
      setWeatherLoading(false);
    });
  }, [selectedId, view, liveSlate]);

  // Fetch live schedule — re-runs when slateDate changes (research mode date nav)
  useEffect(() => {
    if (IS_STATS_SANDBOX) return;
    setSlateLoading(true);
    setLiveSlate(null);
    const url = slateDate ? `/api/schedule?date=${slateDate}` : "/api/schedule";
    apiFetch(url)
      .then(games => {
        setLiveSlate(games);
        if (games.length > 0) setSelectedId(games[0].gamePk);
      })
      .catch(err => console.error("Schedule fetch failed:", err))
      .finally(() => setSlateLoading(false));
  }, [slateDate]);

  // Hydrate pick log from backend on mount (Option A: backend-first, localStorage fallback)
  useEffect(() => {
    fetch(`${API_BASE}/api/picks`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.picks) return;
        setPicksServerReachable(true);
        if (!data?.picks?.length) return; // backend empty or down → keep localStorage as-is
        setPropLog(data.picks);
        localStorage.setItem("propscout_log", JSON.stringify(data.picks));
      })
      .catch(() => { setPicksServerReachable(false); }); // silent — localStorage already loaded as initial state
  }, []);

  // Fetch recent IL / DL placements for lineup flags
  useEffect(() => {
    if (IS_STATS_SANDBOX) return;
    apiFetch("/api/injuries")
      .then(data => setLiveInjuries(data?.injuries ?? []))
      .catch(() => {});
  }, []);

  // Fetch game note when a game card opens (lazy — skip if already loaded)
  useEffect(() => {
    if (view !== "game" || !selectedId) return;
    const key = String(selectedId);
    if (gameNotes[key] !== undefined) return;
    apiFetch(`/api/notes/${key}`)
      .then(d => setGameNotes(prev => ({ ...prev, [key]: d.note ?? "" })))
      .catch(() => setGameNotes(prev => ({ ...prev, [key]: "" })));
  }, [view, selectedId]);

  // Fetch AI Trends Summary when Intel tab opens (lazy — ref guards against stale-closure re-fetch)
  useEffect(() => {
    if (IS_STATS_SANDBOX) return;
    if (view !== "game" || !selectedId || tab !== "intel") return;
    const key = String(selectedId);
    if (trendsFetched.current.has(key)) return; // already fetched or in-flight

    const game = activeSlate.find(g => (g.gamePk ?? g.id) === selectedId);
    if (!game) return;

    trendsFetched.current.add(key); // mark before async so concurrent triggers are blocked
    const odds = getGameOdds(game);
    const context = buildTrendsContext(game, odds, PARK_FACTORS);

    setLiveTrends(prev => ({ ...prev, [key]: "loading" }));
    apiMutate(`/api/trends/${key}`, "POST", { context })
      .then(d => {
        const summary = d?.summary ?? null;
        setLiveTrends(prev => ({ ...prev, [key]: summary }));
        if (!summary) trendsFetched.current.delete(key); // allow retry if API returned empty
      })
      .catch(() => {
        trendsFetched.current.delete(key); // allow retry on network error
        setLiveTrends(prev => ({ ...prev, [key]: null }));
      });
  }, [view, selectedId, tab]);

  // Fetch sportsbook player prop lines when Props tab opens (client-side, uses VITE_ODDS_API_KEY)
  useEffect(() => {
    if (IS_ODDS_SANDBOX || IS_STATS_SANDBOX || view !== "game" || !selectedId || tab !== "props") return;
    const key  = String(selectedId);
    if (playerPropsFetched.current.has(key)) return;
    const game = activeSlate.find(g => (g.gamePk ?? g.id) === selectedId);
    if (!game) return;
    playerPropsFetched.current.add(key);
    setLivePlayerProps(prev => ({ ...prev, [key]: "loading" }));
    fetchPlayerPropsDirect(game.away.name, game.home.name, game.gamePk)
      .then(result => {
        // result is { props, reason } — store full object
        const normalized = result?.props ? result : { props: result ?? [], reason: "ok" };
        setLivePlayerProps(prev => ({ ...prev, [key]: normalized }));
      })
      .catch(() => {
        playerPropsFetched.current.delete(key);
        setLivePlayerProps(prev => ({ ...prev, [key]: { props: [], error: true } }));
      });
  }, [view, selectedId, tab]);

  // Fetch AI Props when Props tab opens — waits for sportsbook lines so they can be included in context
  // livePlayerProps in dependency array: re-fires when lines load, ref blocks duplicate AI calls
  useEffect(() => {
    if (IS_STATS_SANDBOX) return;
    if (view !== "game" || !selectedId || tab !== "props") return;
    const key = String(selectedId);

    // Wait for player props to resolve before building context (skip wait in sandbox)
    const ppState = livePlayerProps[key];
    const ppReady = IS_ODDS_SANDBOX || (ppState !== undefined && ppState !== "loading" && typeof ppState === "object");
    if (!ppReady) return;

    if (aiPropsFetched.current.has(key)) return;

    const game = activeSlate.find(g => (g.gamePk ?? g.id) === selectedId);
    if (!game) return;

    aiPropsFetched.current.add(key);
    const odds           = getGameOdds(game);
    const playerLines    = Array.isArray(ppState?.props) ? ppState.props : null;
    const context        = buildPropsContext(game, odds, PARK_FACTORS, playerLines);

    setLiveAiProps(prev => ({ ...prev, [key]: "loading" }));
    apiMutate(`/api/props/${key}`, "POST", { context })
      .then(d => {
        const props = Array.isArray(d?.props) ? d.props : null;
        // Store full response so searchUsed flag is preserved alongside props
        const result = props ? { props, searchUsed: d.searchUsed ?? false } : null;
        setLiveAiProps(prev => ({ ...prev, [key]: result }));
        if (!props || props.length === 0) aiPropsFetched.current.delete(key); // allow retry
      })
      .catch(() => {
        aiPropsFetched.current.delete(key);
        setLiveAiProps(prev => ({ ...prev, [key]: null }));
      });
  }, [view, selectedId, tab, livePlayerProps]);

  // Pre-fetch all data needed by the Board + Model views when opened
  useEffect(() => {
    if (view !== "board" && view !== "model") return;

    // ── Batter data (HR + Hits tabs) ──────────────────────────────────────────
    Object.values(liveLineups).forEach(lu => {
      [...(lu.away ?? []), ...(lu.home ?? [])].forEach(b => {
        if (!b?.id || liveHittingLog[b.id]) return;
        apiFetch(`/api/players/${b.id}/gamelog?group=hitting`)
          .then(data => setLiveHittingLog(prev => ({ ...prev, [b.id]: data })))
          .catch(() => {});
      });
    });

    // ── Pitcher data (K + Outs tabs) ──────────────────────────────────────────
    // liveSlate items use raw schedule format: probablePitchers.home / .away
    (liveSlate ?? []).forEach(game => {
      const pitchers = [
        game.probablePitchers?.home,
        game.probablePitchers?.away,
      ];
      pitchers.forEach(p => {
        if (!p?.id) return;
        if (!livePitcherStats[p.id]) {
          apiFetch(`/api/players/${p.id}/stats?group=pitching`)
            .then(data => setLivePitcherStats(prev => ({ ...prev, [p.id]: data })))
            .catch(() => {});
        }
        if (!liveGameLog[p.id]) {
          apiFetch(`/api/players/${p.id}/gamelog?group=pitching`)
            .then(data => setLiveGameLog(prev => ({ ...prev, [p.id]: data })))
            .catch(() => {});
        }
      });
    });

    // ── Player props (all tabs need odds lines) ───────────────────────────────
    if (!IS_ODDS_SANDBOX && ODDS_API_KEY) {
      (liveSlate ?? []).forEach(game => {
        const key = String(game.gamePk);
        if (livePlayerProps[key] || boardPropsFetched.current.has(key)) return;
        boardPropsFetched.current.add(key);
        setLivePlayerProps(prev => ({ ...prev, [key]: "loading" }));
        fetchPlayerPropsDirect(game.away?.name ?? "", game.home?.name ?? "", game.gamePk)
          .then(props => setLivePlayerProps(prev => ({ ...prev, [key]: { props } })))
          .catch(() => {
            boardPropsFetched.current.delete(key);
            setLivePlayerProps(prev => ({ ...prev, [key]: { props: [] } }));
          });
      });
    }
  }, [view, liveLineups, liveSlate]);

  // Fetch pitcher platoon splits (vs LHH / vs RHH) when Overview pitcher card is visible
  useEffect(() => {
    if (IS_SAVANT_SANDBOX || view !== "game" || !selectedId) return;
    const game = activeSlate.find(g => (g.gamePk ?? g.id) === selectedId);
    if (!game) return;
    const p = pitcherSide === "home" ? game.pitcher : (game.awayPitcher ?? game.pitcher);
    if (!p?.id) return;
    const key = String(p.id);
    if (key in pitcherPlatoonSplits) return; // already fetched or in-flight
    setPitcherPlatoonSplits(prev => ({ ...prev, [key]: "loading" }));
    apiFetch(`/api/pitcher-splits/${key}`)
      .then(d => setPitcherPlatoonSplits(prev => ({ ...prev, [key]: d ?? null })))
      .catch(() => setPitcherPlatoonSplits(prev => ({ ...prev, [key]: null })));
  }, [view, selectedId, pitcherSide]);

  // Fetch pitcher home/away stat splits when Overview pitcher card is visible
  useEffect(() => {
    if (IS_STATS_SANDBOX || view !== "game" || !selectedId) return;
    const game = activeSlate.find(g => (g.gamePk ?? g.id) === selectedId);
    if (!game) return;
    const p = pitcherSide === "home" ? game.pitcher : (game.awayPitcher ?? game.pitcher);
    if (!p?.id) return;
    const key = `${p.id}:pitching`;
    if (key in liveStatSplits) return;
    setLiveStatSplits(prev => ({ ...prev, [key]: "loading" }));
    apiFetch(`/api/stat-splits/${p.id}?group=pitching`)
      .then(d => setLiveStatSplits(prev => ({ ...prev, [key]: d ?? null })))
      .catch(() => setLiveStatSplits(prev => ({ ...prev, [key]: null })));
  }, [view, selectedId, pitcherSide]);

  // Keep module-level _authToken in sync with React state
  useEffect(() => { _authToken = authToken; }, [authToken]);

  // Listen for 401s dispatched by apiFetch/apiMutate — bounce to login
  useEffect(() => {
    const handler = () => {
      localStorage.removeItem("propscout_token");
      setAuthToken(null);
      setCurrentUser(null);
    };
    window.addEventListener("propscout:unauthorized", handler);
    return () => window.removeEventListener("propscout:unauthorized", handler);
  }, []);

  // ── Auth helpers ─────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const data = await apiMutate("/api/auth/login", "POST", { username: loginUser.trim(), password: loginPass });
      _authToken = data.token;
      localStorage.setItem("propscout_token", data.token);
      setAuthToken(data.token);
      setCurrentUser({ userId: data.userId, username: data.username });
      setLoginPass("");
    } catch (err) {
      setLoginError(err.message === "Unauthorized" || err.message?.includes("401")
        ? "Invalid username or password."
        : "Connection error — is the server running?");
    }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("propscout_token");
    _authToken = null;
    setAuthToken(null);
    setCurrentUser(null);
    setPropLog([]);
    setLiveDigest(null);
  };

  // Fetch 7-day digest when Picks view opens (lazy — only if not already loaded)
  useEffect(() => {
    if (view !== "picks" || liveDigest !== null || digestLoading) return;
    setDigestLoading(true);
    apiFetch("/api/digest")
      .then(d => setLiveDigest(d))
      .catch(() => {})
      .finally(() => setDigestLoading(false));
  }, [view]);

  // Background prefetch: home pitcher stats + lineups for ALL slate games
  // so the cross-slate Best Bets card can compute and update reactively.
  useEffect(() => {
    if (IS_STATS_SANDBOX || !liveSlate?.length) return;
    liveSlate.forEach(sg => {
      // Pitcher stats
      const pid = sg.probablePitchers?.home?.id;
      if (pid && !livePitcherStats[pid]) {
        apiFetch(`/api/players/${pid}/stats?group=pitching`)
          .then(data => setLivePitcherStats(prev => ({ ...prev, [pid]: data })))
          .catch(() => {});
      }
      // Lineup — re-fetch if not yet confirmed (1-min TTL on backend keeps it fresh)
      if (!liveLineups[sg.gamePk]?.confirmed) {
        apiFetch(`/api/lineups/${sg.gamePk}`)
          .then(data => setLiveLineups(prev => ({ ...prev, [sg.gamePk]: data })))
          .catch(() => {});
      }
      // Weather — fetchWeather handles domes internally (no API call, returns roof:true immediately)
      if (!liveWeather[sg.gamePk]) {
        fetchWeather(sg.gamePk, sg.stadium, sg.time, SLATE[0].weather)
          .then(data => setLiveWeather(prev => ({ ...prev, [sg.gamePk]: data })))
          .catch(() => {});
      }
      // NRFI first-inning tendencies
      if (!liveNrfiData[sg.gamePk]) {
        apiFetch(`/api/nrfi/${sg.gamePk}`)
          .then(data => setLiveNrfiData(prev => ({ ...prev, [sg.gamePk]: data })))
          .catch(() => {});
      }
    });
  }, [liveSlate]);

  // Poll linescore every 60s for all in-progress games
  useEffect(() => {
    if (IS_STATS_SANDBOX || !liveSlate?.length) return;

    const pollScores = () => {
      liveSlate.forEach(sg => {
        const status = sg.status ?? "";
        const inProgress = status === "In Progress" || status === "Warmup";
        const finished   = status === "Final" || status === "Game Over";
        // Poll in-progress every 60s; fetch final once (skip if already cached)
        if (!inProgress && !(finished && !liveScores[sg.gamePk])) return;
        apiFetch(`/api/linescore/${sg.gamePk}`)
          .then(data => setLiveScores(prev => ({ ...prev, [sg.gamePk]: data })))
          .catch(() => {});
      });
    };

    pollScores(); // immediate first fetch
    const interval = setInterval(pollScores, 60_000);
    return () => clearInterval(interval);
  }, [liveSlate]);

  // Fetch boxscore when boxscore tab opens (poll 60s for live games, once for finals)
  useEffect(() => {
    if (IS_STATS_SANDBOX || view !== "game" || !liveSlate || tab !== "boxscore") return;
    const sg = liveSlate.find(g => g.gamePk === selectedId);
    if (!sg) return;
    const { gamePk } = sg;
    const isLiveGame  = sg.status === "In Progress" || sg.status === "Warmup";
    const isFinalGame = sg.status === "Final" || sg.status === "Game Over";

    // Skip if already have final data
    if (isFinalGame && boxscoreFetched.current.has(gamePk)) return;

    const fetchBS = () => {
      apiFetch(`/api/boxscore/${gamePk}`)
        .then(data => {
          setLiveBoxscores(prev => ({ ...prev, [gamePk]: data }));
          if (data?.isFinal) boxscoreFetched.current.add(gamePk);
        })
        .catch(() => setLiveBoxscores(prev => ({ ...prev, [gamePk]: null })));
    };

    fetchBS();
    if (!isLiveGame) return;
    const bsInterval = setInterval(fetchBS, 60_000);
    return () => clearInterval(bsInterval);
  }, [view, selectedId, tab, liveSlate]);

  // Auto-grade pending picks when a game goes final
  useEffect(() => {
    if (IS_STATS_SANDBOX || !liveSlate?.length) return;

    liveSlate.forEach(sg => {
      const { gamePk } = sg;
      // Primary signal: slate status (set on page load)
      // Fallback: linescore has been polled and currentInning is null + runs scored
      // (covers games that finish while the app is open without a page reload)
      const ls = liveScores[gamePk];
      const linescoreFinished = ls && ls.inning === null && (ls.awayScore > 0 || ls.homeScore > 0);
      const isFinalGame = sg.status === "Final" || sg.status === "Game Over" || linescoreFinished;
      if (!isFinalGame) return;
      if (gradedGames.current.has(gamePk)) return;

      // eslint-disable-next-line eqeqeq — gamePk may be string (localStorage) or number
      const pendingPicks = propLog.filter(p => p.gamePk == gamePk && p.result === null);
      if (!pendingPicks.length) return;

      const box = liveBoxscores[gamePk];
      if (!box?.isFinal) {
        // Fetch boxscore so the next effect run can grade
        if (!boxscoreFetched.current.has(gamePk)) {
          apiFetch(`/api/boxscore/${gamePk}`)
            .then(data => {
              if (!data?.isFinal) return;
              setLiveBoxscores(prev => ({ ...prev, [gamePk]: data }));
              boxscoreFetched.current.add(gamePk);
            })
            .catch(() => {});
        }
        return;
      }

      gradedGames.current.add(gamePk);
      pendingPicks.forEach(pick => {
        const grade = computeGrade(pick, box);
        if (grade !== null) markResult(pick.id, grade);
      });
    });
  }, [liveSlate, liveScores, liveBoxscores, propLog]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch boxscores for live/final games on the Board + Model views to show today's results
  useEffect(() => {
    if (IS_STATS_SANDBOX || (view !== "board" && view !== "model") || !liveSlate) return;
    liveSlate.forEach(g => {
      const status = g.status ?? "";
      const isLive  = status === "In Progress" || status === "Warmup";
      const isFinal = status === "Final" || status === "Game Over";
      if (!isLive && !isFinal) return;
      if (isFinal && boardBoxFetched.current.has(g.gamePk)) return; // don't re-fetch finals
      apiFetch(`/api/boxscore/${g.gamePk}`)
        .then(box => {
          if (!box?.batting) return;
          boardBoxFetched.current.add(g.gamePk);
          const results = {};
          ["away", "home"].forEach(side => {
            (box.batting?.[side] ?? []).forEach(b => {
              if (b?.id) results[b.id] = { h: b.h ?? 0, hr: b.hr ?? 0, ab: b.ab ?? 0, live: isLive };
            });
            (box.pitching?.[side] ?? []).forEach(p => {
              if (p?.id) results[p.id] = { ...(results[p.id] ?? {}), k: p.k ?? 0, outs: parseIpToOuts(p.ip), ip: p.ip ?? "0.0", live: isLive };
            });
          });
          setLiveBoardResults(prev => ({ ...prev, ...results }));
        })
        .catch(() => {});
    });
  }, [view, liveSlate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch lineups, umpire, + pitcher stats when a live game card opens
  useEffect(() => {
    if (IS_STATS_SANDBOX || view !== "game" || !liveSlate) return;
    const sg = liveSlate.find(g => g.gamePk === selectedId);
    if (!sg) return;
    const { gamePk } = sg;

    if (!liveLineups[gamePk]) {
      apiFetch(`/api/lineups/${gamePk}`)
        .then(data => setLiveLineups(prev => ({ ...prev, [gamePk]: data })))
        .catch(err => console.error("Lineups:", err));
    }
    if (!liveUmpires[gamePk]) {
      apiFetch(`/api/umpires/${gamePk}`)
        .then(data => setLiveUmpires(prev => ({ ...prev, [gamePk]: data })))
        .catch(err => console.error("Umpires:", err));
    }
    const pitcherId     = sg.probablePitchers?.home?.id;
    const awayPitcherId = sg.probablePitchers?.away?.id;
    // Home pitcher stats + arsenal
    if (pitcherId && !livePitcherStats[pitcherId]) {
      apiFetch(`/api/players/${pitcherId}/stats?group=pitching`)
        .then(data => setLivePitcherStats(prev => ({ ...prev, [pitcherId]: data })))
        .catch(err => console.error("Home pitcher stats:", err));
    }
    if (pitcherId && !liveGameLog[pitcherId]) {
      apiFetch(`/api/players/${pitcherId}/gamelog?group=pitching`)
        .then(data => setLiveGameLog(prev => ({ ...prev, [pitcherId]: data })))
        .catch(err => console.error("Home pitcher gamelog:", err));
    }
    if (!IS_SAVANT_SANDBOX && pitcherId && !pitcherArsenal[pitcherId]) {
      apiFetch(`/api/arsenal/${pitcherId}`)
        .then(data => { if (data?.arsenal?.length) setPitcherArsenal(prev => ({ ...prev, [pitcherId]: data.arsenal })); })
        .catch(err => console.error("Home arsenal fetch:", err));
    }
    // Away pitcher stats + arsenal
    if (awayPitcherId && !livePitcherStats[awayPitcherId]) {
      apiFetch(`/api/players/${awayPitcherId}/stats?group=pitching`)
        .then(data => setLivePitcherStats(prev => ({ ...prev, [awayPitcherId]: data })))
        .catch(err => console.error("Away pitcher stats:", err));
    }
    if (awayPitcherId && !liveGameLog[awayPitcherId]) {
      apiFetch(`/api/players/${awayPitcherId}/gamelog?group=pitching`)
        .then(data => setLiveGameLog(prev => ({ ...prev, [awayPitcherId]: data })))
        .catch(err => console.error("Away pitcher gamelog:", err));
    }
    if (!IS_SAVANT_SANDBOX && awayPitcherId && !pitcherArsenal[awayPitcherId]) {
      apiFetch(`/api/arsenal/${awayPitcherId}`)
        .then(data => { if (data?.arsenal?.length) setPitcherArsenal(prev => ({ ...prev, [awayPitcherId]: data.arsenal })); })
        .catch(err => console.error("Away arsenal fetch:", err));
    }
    // Fetch bullpen data via gamePk — one call returns both away + home
    if (!liveBullpen[gamePk]) {
      apiFetch(`/api/bullpen/${gamePk}`)
        .then(data => setLiveBullpen(prev => ({ ...prev, [gamePk]: data })))
        .catch(err => console.error("Bullpen:", err));
    }
    // Fetch live NRFI first-inning scoring tendencies
    if (!liveNrfiData[gamePk]) {
      apiFetch(`/api/nrfi/${gamePk}`)
        .then(data => setLiveNrfiData(prev => ({ ...prev, [gamePk]: data })))
        .catch(err => console.error("NRFI:", err));
    }
  }, [selectedId, view, liveSlate]);


  // Fetch live odds on mount (and on manual refresh)
  const refreshOdds = async () => {
    if (IS_ODDS_SANDBOX) return;
    setOddsLoading(true);
    oddsCache.ts = 0; // force refetch
    const result = await fetchOdds(true);
    if (result?.data) {
      setLiveOddsMap(result.data);
      setOddsApiInfo({ remaining: result.remaining, used: result.used, fetchedAt: result.fetchedAt });
    }
    setOddsLoading(false);
  };

  useEffect(() => { refreshOdds(); }, []);

  // Watch resize — must use useEffect, not useState, so cleanup runs properly
  useEffect(() => {
    const handler = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);


  // Active slate: live schedule games when backend is on, mock SLATE otherwise
  const activeSlate = (!IS_STATS_SANDBOX && liveSlate)
    ? liveSlate.map(sg => {
        const built = buildLiveGame(sg);
        if (liveWeather[sg.gamePk])  built.weather = liveWeather[sg.gamePk];
        if (liveNrfiData[sg.gamePk]) built.nrfi = { ...built.nrfi, ...liveNrfiData[sg.gamePk] };
        return built;
      })
    : SLATE;

  // Base game from active slate; fall back to first game if selectedId is stale
  const baseGame = activeSlate.find(g => g.id === selectedId) ?? activeSlate[0];

  // Overlay live data onto base game object
  const gamePkKey = baseGame?.gamePk ?? baseGame?.id;
  const game = !baseGame ? SLATE[0] : {
    ...baseGame,
    // Lineups: swap in confirmed live batting order
    lineups: (() => {
      const ll = liveLineups[gamePkKey];
      return ll?.confirmed ? { away: ll.away, home: ll.home } : baseGame.lineups;
    })(),
    // Umpire: prefer real UmpScorecards accuracy data; keep UMPIRE_STATS static
    // lookup alongside it for zone tendency text + kRate (used by K prop engine).
    umpire: (() => {
      const lu = liveUmpires[gamePkKey];
      if (!lu?.homePlate) return baseGame.umpire;
      const staticStats = UMPIRE_STATS[lu.homePlate.name] ?? null;
      return {
        ...baseGame.umpire,
        name:       lu.homePlate.name,
        scorecards: lu.homePlate.stats ?? null,   // real UmpScorecards accuracy data
        // Static zone stats kept as fallback — still drives K prop engine + tendency text
        ...(staticStats ? {
          kRate:    staticStats.kRate,
          bbRate:   staticStats.bbRate,
          tendency: staticStats.tendency,
          rating:   staticStats.rating,
        } : {}),
      };
    })(),
    // Pitcher stats: overlay real ERA/WHIP/K etc when loaded
    pitcher: (() => {
      const ps  = livePitcherStats[baseGame.pitcher?.id];
      const pid = baseGame.pitcher?.id;
      const liveArsenal = pid ? pitcherArsenal[pid] : null;
      return {
        ...baseGame.pitcher,
        ...(ps ? {
          era:    ps.era    ?? baseGame.pitcher.era,
          whip:   ps.whip   ?? baseGame.pitcher.whip,
          kPer9:  ps.kPer9  ?? baseGame.pitcher.kPer9,
          bbPer9: ps.bbPer9 ?? baseGame.pitcher.bbPer9,
          wins:   ps.wins,  losses: ps.losses,
          k:      ps.k,     bb:     ps.bb,    ip: ps.ip,
        } : {}),
        // Overlay real Savant arsenal when available (preserves mock arsenal as fallback)
        arsenal: liveArsenal ?? baseGame.pitcher.arsenal ?? [],
        arsenalLive: !!liveArsenal,
      };
    })(),
    // Away pitcher stats + arsenal overlay
    awayPitcher: (() => {
      const ap = baseGame.awayPitcher ?? { name: "TBD", team: "—", hand: "?", number: "—", era: "—", whip: "—", kPer9: "—", bbPer9: "—", avgIP: "—", arsenal: [], arsenalLive: false };
      const ps = livePitcherStats[ap?.id];
      const liveArsenal = ap?.id ? pitcherArsenal[ap.id] : null;
      return {
        ...ap,
        ...(ps ? {
          era:    ps.era    ?? ap.era,
          whip:   ps.whip   ?? ap.whip,
          kPer9:  ps.kPer9  ?? ap.kPer9,
          bbPer9: ps.bbPer9 ?? ap.bbPer9,
          wins:   ps.wins,  losses: ps.losses,
          k:      ps.k,     bb:     ps.bb,    ip: ps.ip,
        } : {}),
        arsenal:     liveArsenal ?? ap.arsenal ?? [],
        arsenalLive: !!liveArsenal,
      };
    })(),
    // Bullpen: overlay live data (keyed by gamePk, shape { away, home })
    bullpen: (() => {
      const liveData = liveBullpen[gamePkKey];
      return {
        away: liveData?.away ?? baseGame.bullpen?.away,
        home: liveData?.home ?? baseGame.bullpen?.home,
      };
    })(),
  };

  const { pitcher, batter, props: mockProps, umpire, bullpen } = game;
  const awayLineup = game.lineups?.away ?? [];
  const homeLineup = game.lineups?.home ?? [];
  const injuredIds = new Set((liveInjuries ?? []).map(i => String(i.playerId)));

  // activeBatter = mock featured batter (pinning removed)
  const activeBatter = batter;
  const activeBatterVsPitches = activeBatter?.vsPitches ?? {};
  const activeMatchupPitcher = pitcherSide === "home"
    ? pitcher
    : (game.awayPitcher ?? pitcher);

  // ── Park Factor ───────────────────────────────────────────────────────────
  const parkFactor = PARK_FACTORS[game.home?.abbr] ?? NEUTRAL_PARK;

  // Use live weather if fetched, fall back to mock
  const weather = liveWeather[selectedId] ?? game.weather;
  // Merge live odds over mock — preserves movement text when no live data
  const getGameOdds = (g) => {
    const key = `${g.away.name}|${g.home.name}`;
    const live = liveOddsMap[key];
    if (!live) return g.odds;
    return {
      ...g.odds,
      awayML:         live.awayML         ?? g.odds.awayML,
      homeML:         live.homeML         ?? g.odds.homeML,
      total:          live.total          ?? g.odds.total,
      overOdds:       live.overOdds       ?? g.odds.overOdds,
      underOdds:      live.underOdds      ?? g.odds.underOdds,
      awaySpread:     live.awaySpread     ?? g.odds.awaySpread,
      awaySpreadOdds: live.awaySpreadOdds ?? g.odds.awaySpreadOdds,
      homeSpread:     live.homeSpread     ?? g.odds.homeSpread,
      homeSpreadOdds: live.homeSpreadOdds ?? g.odds.homeSpreadOdds,
      live:      true,
      book:      live.book,
      books:     live.books ?? {},
    };
  };
  const odds = getGameOdds(game);

  // ── Hardened multi-factor matchup scoring engine ─────────────
  // Inputs per pitch: avg (0–1), whiff (0–100), slg (0–1)
  // Usage capped at 40% so no single pitch dominates
  // Handedness multiplier: same-hand matchup is harder for batter
  // Output: 0–100 where < 35 = pitcher edge, 35–55 = neutral, 56+ = batter edge

  const scoreColor = (s) => s >= 55 ? "#ef4444" : s >= 35 ? "#f59e0b" : "#22c55e";

  const TABS = ["overview", "lineup", "arsenal", "intel", "props", "bullpen", "boxscore"];

  // ── Savant splits helpers ─────────────────────────────────
  // Derive HANDLES / NEUTRAL / WEAK SPOT from live split numbers
  const parseIpToOuts = (ip) => {
    if (!ip) return 0;
    const [whole, frac = "0"] = String(ip).split(".");
    return ((parseInt(whole, 10) || 0) * 3) + (parseInt(frac, 10) || 0);
  };

  const last3EraSummary = (games = []) => {
    const last3 = games.slice(0, 3);
    const outs = last3.reduce((sum, g) => sum + parseIpToOuts(g.ip), 0);
    const er = last3.reduce((sum, g) => sum + (g.er ?? 0), 0);
    return outs > 0 ? ((er * 27) / outs) : null;
  };

  const normalizePitchMatchup = (abbr, rawVs) => {
    if (!rawVs) return null;
    if (typeof rawVs === "string" || typeof rawVs === "number") {
      const avg = `${rawVs}`;
      return {
        avg,
        whiff: null,
        good: computePitchMatchupGood(avg, null),
        note: computePitchMatchupNote(abbr, avg, null),
      };
    }
    if (typeof rawVs === "object") {
      if ("good" in rawVs) return rawVs;
      return {
        ...rawVs,
        good: computePitchMatchupGood(rawVs.avg, rawVs.whiff),
        note: computePitchMatchupNote(abbr, rawVs.avg, rawVs.whiff),
      };
    }
    return null;
  };

  // Lazily fetch Savant splits + H2H when a batter's drawer opens.
  // opposingPitcherId: the pitcher this batter actually faces (from lineupSide context).
  const onBatterExpand = (b, openingDrawer, opposingPitcherId) => {
    if (!openingDrawer || !b?.id) return;
    if (!IS_SAVANT_SANDBOX && !batterSplits[b.id]) {
      apiFetch(`/api/splits/${b.id}`)
        .then(data => {
          if (data?.splits) setBatterSplits(prev => ({ ...prev, [b.id]: data.splits }));
        })
        .catch(err => console.error("Batter splits:", err));
    }
    // Batter vs L/R stat splits (MLB Stats API)
    const batterSplitKey = `${b.id}:hitting`;
    if (!IS_STATS_SANDBOX && !(batterSplitKey in liveStatSplits)) {
      setLiveStatSplits(prev => ({ ...prev, [batterSplitKey]: "loading" }));
      apiFetch(`/api/stat-splits/${b.id}?group=hitting`)
        .then(d => setLiveStatSplits(prev => ({ ...prev, [batterSplitKey]: d ?? null })))
        .catch(() => setLiveStatSplits(prev => ({ ...prev, [batterSplitKey]: null })));
    }
    if (!IS_STATS_SANDBOX && !liveHittingLog[b.id]) {
      apiFetch(`/api/players/${b.id}/gamelog?group=hitting`)
        .then(data => setLiveHittingLog(prev => ({ ...prev, [b.id]: data })))
        .catch(err => console.error("Batter gamelog:", err));
    }
    // Career H2H vs opposing pitcher
    if (!IS_STATS_SANDBOX && opposingPitcherId && b.id) {
      const h2hKey = `${b.id}_${opposingPitcherId}`;
      if (!liveH2H[h2hKey]) {
        apiFetch(`/api/players/${b.id}/vs/${opposingPitcherId}`)
          .then(data => setLiveH2H(prev => ({ ...prev, [h2hKey]: data })))
          .catch(() => {});
      }
    }
    // Career RBI context — lazy-fetch once per batter
    if (!IS_STATS_SANDBOX && b.id && !liveRbiCtx[b.id]) {
      apiFetch(`/api/players/${b.id}/rbi-context`)
        .then(data => setLiveRbiCtx(prev => ({ ...prev, [b.id]: data })))
        .catch(() => {});
    }
  };

  // ── Lineup prefetch on game open ─────────────────────────────────────────────
  // Fires when the user selects a game from the slate — prefetches splits,
  // gamelog, H2H, and RBI context for ALL batters on BOTH sides so the Lineup
  // tab loads instantly without any per-batter spinner.
  useEffect(() => {
    if (IS_STATS_SANDBOX || !selectedId) return;
    const awayBatters = game.lineups?.away ?? [];
    const homeBatters = game.lineups?.home ?? [];
    const allBatters  = [...awayBatters, ...homeBatters];
    if (!allBatters.length) return;

    allBatters.forEach(b => {
      if (!b?.id) return;
      const opposingPitcherId = awayBatters.includes(b)
        ? game.pitcher?.id       // away batters face home pitcher
        : game.awayPitcher?.id;  // home batters face away pitcher

      if (!IS_SAVANT_SANDBOX && !batterSplits[b.id]) {
        apiFetch(`/api/splits/${b.id}`)
          .then(data => { if (data?.splits) setBatterSplits(prev => ({ ...prev, [b.id]: data.splits })); })
          .catch(() => {});
      }
      if (!liveHittingLog[b.id]) {
        apiFetch(`/api/players/${b.id}/gamelog?group=hitting`)
          .then(data => setLiveHittingLog(prev => ({ ...prev, [b.id]: data })))
          .catch(() => {});
      }
      if (opposingPitcherId) {
        const h2hKey = `${b.id}_${opposingPitcherId}`;
        if (!liveH2H[h2hKey]) {
          apiFetch(`/api/players/${b.id}/vs/${opposingPitcherId}`)
            .then(data => setLiveH2H(prev => ({ ...prev, [h2hKey]: data })))
            .catch(() => {});
        }
      }
      if (!liveRbiCtx[b.id]) {
        apiFetch(`/api/players/${b.id}/rbi-context`)
          .then(data => setLiveRbiCtx(prev => ({ ...prev, [b.id]: data })))
          .catch(() => {});
      }
    });
  }, [selectedId, game.lineups]);

  // ── Prop Engine ─────────────────────────────────────────────────────────────
  // Kept at module scope to avoid production minifier TDZ collisions in App().
  const liveProps = computeLiveProps({
    IS_SAVANT_SANDBOX,
    IS_STATS_SANDBOX,
    pitcher,
    umpire,
    weather,
    parkFactor,
    game,
    batterSplits,
    batterMatchupScore: (b, matchupPitcher = pitcher) => batterMatchupScoreForPitcher(b, matchupPitcher, batterSplits),
    liveOddsMap,
    activeBatter,
    calcMatchupScore: calcMatchupScoreForPitchSet,
    activeMatchupPitcher,
    liveH2H,
    liveRbiCtx,
  });

  // Use live props when available; fall back to mock SLATE props
  const displayProps = liveProps.length > 0 ? liveProps : mockProps;

  // ── Live NRFI from API ───────────────────────────────────────────────────
  // Prefers real first-inning scoring data from /api/nrfi/:gamePk.
  // Falls back to ERA/weather-derived estimate while the fetch is in-flight.
  const apiNrfi = !IS_STATS_SANDBOX ? liveNrfiData[gamePkKey] : null;

  // ERA+weather fallback — used only until the API responds
  const eraLean = computeEraNrfiLean({ IS_STATS_SANDBOX, apiNrfi, game, weather });

  // Merge: real API data > ERA fallback > mock
  const nrfi = apiNrfi
    ? {
        ...game.nrfi,
        lean:       apiNrfi.lean,
        confidence: apiNrfi.confidence,
        awayFirst:  apiNrfi.awayFirst,
        homeFirst:  apiNrfi.homeFirst,
        live:       true,
      }
    : eraLean
    ? { ...game.nrfi, lean: eraLean.lean, confidence: eraLean.confidence, live: true }
    : game.nrfi;

  // ── Cross-slate Best Bets ────────────────────────────────────────────────
  // Delegates to module-level computeTopSlatePicks() to avoid minifier
  // variable-name collisions (TDZ) with render-body locals.
  const topSlatePicks = !IS_STATS_SANDBOX && liveSlate?.length
    ? computeTopSlatePicks(liveSlate, livePitcherStats, liveLineups, liveWeather)
    : [];

  // Group model picks by tier for display
  const highPicks   = topSlatePicks.filter(p => p.tier === "HIGH");
  const mediumPicks = topSlatePicks.filter(p => p.tier === "MEDIUM");
  const specPicks   = topSlatePicks.filter(p => p.tier === "SPEC");

  const openGame = (id) => { setSelectedId(id); setView("game"); setTab("overview"); setLineupSide("away"); setExpandedBatter(null); setPitcherSide("home"); setArsenalSide("home"); setParlayLabels([]); setParlaySlipCopied(false); };

  // ── Pick tracker helpers ──────────────────────────────────────────────────
  const logPick = (prop) => {
    const isBatterProp = prop.propType === "Hits" || prop.propType === "TB" || prop.propType === "HR" || prop.propType === "RBI"; // F5 is a game prop, not batter-specific
    const entry = {
      id:          `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp:   new Date().toISOString(),
      date:        new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      game:        `${game.away.abbr} @ ${game.home.abbr}`,
      gamePk:      selectedId,
      label:       prop.label,
      lean:        prop.lean,
      confidence:  prop.confidence,
      // Enriched schema (Trends Full)
      propType:    prop.propType   ?? null,
      homeTeam:    game.home?.abbr ?? null,
      awayTeam:    game.away?.abbr ?? null,
      pitcherId:   pitcher?.id     ?? null,
      pitcherName: pitcher?.name   ?? null,
      playerId:    isBatterProp ? (activeBatter?.id   ?? null) : null,
      playerName:  isBatterProp ? (activeBatter?.name ?? null) : null,
      result:      null,
    };
    setPropLog(prev => {
      const updated = [entry, ...prev];
      localStorage.setItem("propscout_log", JSON.stringify(updated));
      return updated;
    });
    // Background sync — fire-and-forget, UI never blocks on this
    apiMutate("/api/picks", "POST", entry).catch(() => {});
    // Invalidate digest so next Picks view open gets fresh data
    apiMutate("/api/digest/refresh", "POST").catch(() => {});
    setLiveDigest(null);
  };
  // ── Auto-grade a pick from final boxscore data ───────────────────────────
  // Returns "hit" | "miss" | null (null = can't determine from available data)
  const computeGrade = (pick, box) => {
    if (!box?.isFinal) return null;
    const label = (pick.label ?? "").toUpperCase();
    const lean  = (pick.lean  ?? "").toUpperCase();
    const innings   = box.linescore?.innings ?? [];
    const awayRuns  = box.linescore?.away?.runs ?? 0;
    const homeRuns  = box.linescore?.home?.runs ?? 0;
    const totalRuns = awayRuns + homeRuns;

    // NRFI — no runs scored in 1st inning
    // label may have game appended: "NRFI" or "NRFI · TEX @ SEA"
    if (label.startsWith("NRFI")) {
      const first   = innings[0];
      const scored  = first ? ((first.away ?? 0) + (first.home ?? 0)) > 0 : false;
      return scored ? "miss" : "hit";
    }

    // YRFI — at least one run in 1st inning
    if (label.startsWith("YRFI")) {
      const first   = innings[0];
      const scored  = first ? ((first.away ?? 0) + (first.home ?? 0)) > 0 : false;
      return scored ? "hit" : "miss";
    }

    // Game Total (OVER / UNDER)
    if (label.includes("GAME TOTAL") || (label.includes("TOTAL") && (label.includes("OVER") || label.includes("UNDER") || label.includes("O/U")))) {
      const m = label.match(/(\d+\.?\d*)/);
      if (!m) return null;
      const line = parseFloat(m[1]);
      if (lean === "OVER")  return totalRuns > line  ? "hit" : "miss";
      if (lean === "UNDER") return totalRuns < line  ? "hit" : "miss";
      return null;
    }

    // F5 — first 5 innings total
    if (label.includes("F5") || label.includes("FIRST 5")) {
      const f5 = innings.slice(0, 5).reduce((s, i) => s + (i.away ?? 0) + (i.home ?? 0), 0);
      const m  = label.match(/(\d+\.?\d*)/);
      if (!m) return null;
      const line = parseFloat(m[1]);
      if (lean === "OVER")  return f5 > line ? "hit" : "miss";
      if (lean === "UNDER") return f5 < line ? "hit" : "miss";
      return null;
    }

    // Run Line (margin-based)
    if (label.includes("RUN LINE") || label.includes("RL -") || label.includes("RL +")) {
      const margin = awayRuns - homeRuns;
      if (label.includes("AWAY")) {
        // Away RL -1.5: away wins by 2+ = hit for OVER lean
        return lean === "OVER"
          ? (margin >= 2  ? "hit" : "miss")
          : (margin < 2   ? "hit" : "miss");
      }
      if (label.includes("HOME")) {
        // Home RL +1.5: home wins or loses by <2 = hit for OVER lean
        return lean === "OVER"
          ? (homeRuns - awayRuns >= 2 ? "hit" : "miss")
          : (homeRuns - awayRuns < 2  ? "hit" : "miss");
      }
      return null;
    }

    // Pitcher Strikeouts — "Wheeler K's O/U 7.5" or "Pitcher Strikeouts O/U"
    if (label.includes("K'S") || label.includes("STRIKEOUT") || (label.includes(" K ") && label.includes("O/U"))) {
      const m = label.match(/(\d+\.?\d*)/);
      if (!m) return null;
      const line = parseFloat(m[1]);
      const allPitchers = [...(box.pitching?.away ?? []), ...(box.pitching?.home ?? [])];
      // Try to match by pitcherName stored on the pick
      const storedName = (pick.pitcherName ?? "").toUpperCase();
      let pitcher = storedName
        ? allPitchers.find(p => p.name.toUpperCase().includes(storedName) || storedName.includes(p.name.toUpperCase().split(" ").pop()))
        : null;
      // Fallback: extract last name from label (first word)
      if (!pitcher) {
        const lastName = label.split(" ")[0];
        pitcher = allPitchers.find(p => p.name.toUpperCase().includes(lastName));
      }
      if (!pitcher) return null;
      if (lean === "OVER")  return (pitcher.k ?? 0) > line  ? "hit" : "miss";
      if (lean === "UNDER") return (pitcher.k ?? 0) < line  ? "hit" : "miss";
      return null;
    }

    // Pitcher Outs recorded
    if (label.includes("OUTS") && label.includes("O/U")) {
      const m = label.match(/(\d+\.?\d*)/);
      if (!m) return null;
      const line = parseFloat(m[1]);
      const allPitchers = [...(box.pitching?.away ?? []), ...(box.pitching?.home ?? [])];
      const storedName  = (pick.pitcherName ?? "").toUpperCase();
      let pitcher = storedName
        ? allPitchers.find(p => p.name.toUpperCase().includes(storedName))
        : null;
      if (!pitcher) {
        const lastName = label.split(" ")[0];
        pitcher = allPitchers.find(p => p.name.toUpperCase().includes(lastName));
      }
      if (!pitcher) return null;
      const outs = parseIpToOuts(pitcher.ip);
      if (lean === "OVER")  return outs > line  ? "hit" : "miss";
      if (lean === "UNDER") return outs < line  ? "hit" : "miss";
      return null;
    }

    return null; // prop type not gradeable from boxscore alone
  };

  const markResult = (id, result) => {
    setPropLog(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, result } : p);
      localStorage.setItem("propscout_log", JSON.stringify(updated));
      return updated;
    });
    apiMutate(`/api/picks/${id}`, "PATCH", { result }).catch(() => {});
    // Invalidate digest — result change affects 7-day stats
    apiMutate("/api/digest/refresh", "POST").catch(() => {});
    setLiveDigest(null);
  };
  const deletePick = (id) => {
    setPropLog(prev => {
      const updated = prev.filter(p => p.id !== id);
      localStorage.setItem("propscout_log", JSON.stringify(updated));
      return updated;
    });
    apiMutate(`/api/picks/${id}`, "DELETE").catch(() => {});
  };
  const isLogged = (prop) => propLog.some(p => p.gamePk === selectedId && p.label === prop.label);

  const saveNote = (key, text) => {
    setNoteSaveState("saving");
    apiMutate(`/api/notes/${key}`, "POST", { note: text })
      .then(() => { setNoteSaveState("saved"); setTimeout(() => setNoteSaveState(null), 2000); })
      .catch(() => setNoteSaveState(null));
  };
  const syncPicksToServer = async () => {
    setSyncStatus("syncing");
    setSyncMessage(`Syncing… 0/${propLog.length}`);

    try {
      const data = await apiFetch("/api/picks");
      setPicksServerReachable(true);
      const existingIds = new Set((data?.picks ?? []).map(p => p.id));
      const missing = propLog.filter(p => !existingIds.has(p.id));
      let completed = propLog.length - missing.length;

      if (missing.length === 0) {
        setSyncStatus("done");
        setSyncMessage("✓ Synced");
        return;
      }

      setSyncMessage(`Syncing… ${completed}/${propLog.length}`);
      for (const pick of missing) {
        await apiMutate("/api/picks", "POST", pick);
        completed += 1;
        setSyncMessage(`Syncing… ${completed}/${propLog.length}`);
      }

      setSyncStatus("done");
      setSyncMessage("✓ Synced");
    } catch (_err) {
      setPicksServerReachable(false);
      setSyncStatus("error");
      setSyncMessage("✗ Failed");
    }
  };

  const getBookLine = (pick) => {
    const ppState = livePlayerProps[String(pick.gamePk)];
    const props   = Array.isArray(ppState?.props) ? ppState.props : [];
    const match   = props.find(pr =>
      pr.market === pick.market &&
      pr.player?.toLowerCase().includes(pick.fullName?.split(" ").pop()?.toLowerCase() ?? "")
    );
    if (!match) return null;
    const books = match.books ?? {};
    const lines = Object.entries(books).filter(([, b]) => b?.line);
    if (!lines.length) return null;
    const bestBook = lines.sort((a, b) => a[1].line - b[1].line)[0];
    return { book: bestBook[0], line: bestBook[1].line, overOdds: bestBook[1].overOdds };
  };

  const TierSection = ({ picks: tierPicks, tierLabel, tierColor, borderColor }) => {
    if (!tierPicks.length) return null;
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 8, fontWeight: 800, color: tierColor, background: `${tierColor}18`, border: `1px solid ${tierColor}44`, borderRadius: 4, padding: "2px 6px", letterSpacing: "0.07em" }}>{tierLabel}</span>
          <span style={{ fontSize: 8, color: "#374151" }}>{tierPicks.length} pick{tierPicks.length > 1 ? "s" : ""}</span>
        </div>
        {tierPicks.map((p, i) => {
          const bookLine = getBookLine(p);
          const lineMismatch = bookLine && Math.abs(bookLine.line - p.modelLine) >= 0.5;
          const overPick = { label: `${p.fullName} ${p.propType === "K" ? "Strikeouts" : "Outs"} OVER ${bookLine?.line ?? p.modelLine}`, lean: "OVER", positive: true, confidence: p.confidence, propType: p.propType, gamePk: p.gamePk };
          const logged = propLog.some(pl => pl.gamePk === p.gamePk && pl.label === overPick.label);
          const result = liveBoardResults[p.pitcherId ?? p.playerId ?? p.id] ?? null;
          const isResolved = !!result && !result.live;
          const modelHit = isResolved && (
            (p.propType === "K" || p.market === "pitcher_strikeouts")
              ? (p.lean === "UNDER" ? result.k < p.modelLine : result.k > p.modelLine)
              : (p.lean === "UNDER" ? result.outs < p.modelLine : result.outs > p.modelLine)
          );
          const resultBorderColor = isResolved ? (modelHit ? "#22c55e" : "#ef4444") : null;
          const resultCardStyle = resultBorderColor
            ? { borderLeft: `3px solid ${resultBorderColor}`, paddingLeft: 10 }
            : {};
          const gameStatus = (() => {
            const g = (activeSlate ?? []).find(game => (game.gamePk ?? game.id) === p.gamePk);
            const status = g?.status ?? "";
            if (status === "In Progress" || status === "Warmup") return "LIVE";
            if (status === "Final" || status === "Game Over") return "FINAL";
            return null;
          })();
          return (
            <div key={i} style={{ background: "#0f1020", border: `1px solid ${borderColor}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6, ...resultCardStyle }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <div
                  style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                  onClick={() => { openGame(p.gamePk); setTab("props"); }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb" }}>{p.label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                    <span style={{ fontSize: 9, color: "#6b7280" }}>{p.game}</span>
                    {p.lineupConfirmed && <span style={{ fontSize: 8, color: "#22c55e", fontWeight: 700 }}>✓ LINEUP</span>}
                    {gameStatus === "LIVE" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 5, padding: "1px 6px" }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 5px #ef4444", animation: "pulse 1.2s infinite" }} />
                        <span style={{ fontSize: 8, fontWeight: 700, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.05em" }}>LIVE</span>
                      </div>
                    )}
                    {gameStatus === "FINAL" && (
                      <div style={{ background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.3)", borderRadius: 5, padding: "1px 6px" }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.05em" }}>FINAL</span>
                      </div>
                    )}
                    {isResolved && modelHit && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 4, padding: "1px 6px" }}>✓ HIT</span>
                    )}
                    {isResolved && !modelHit && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>✗ MISS</span>
                    )}
                    {p.avgIP < 5.0 && <span style={{ fontSize: 8, color: "#ef4444", fontWeight: 700 }}>⚠ LOW IP</span>}
                  </div>
                </div>
                <LeanBadge label={p.lean} positive={p.positive} small />
                <div style={{ fontSize: 13, fontWeight: 800, color: tierColor, fontFamily: "monospace", minWidth: 34, textAlign: "right" }}>{p.confidence}%</div>
              </div>

              {bookLine && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, padding: "5px 8px", background: lineMismatch ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.03)", borderRadius: 6, border: `1px solid ${lineMismatch ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.05)"}` }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: "#4b5563" }}>BOOK LINE</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>{bookLine.line}</span>
                  <span style={{ fontSize: 9, color: "#22c55e", fontFamily: "monospace" }}>{bookLine.overOdds ?? ""}</span>
                  <span style={{ fontSize: 8, color: "#4b5563" }}>via {bookLine.book}</span>
                  {lineMismatch && <span style={{ fontSize: 8, fontWeight: 700, color: "#fbbf24", marginLeft: "auto" }}>model: {p.modelLine}</span>}
                </div>
              )}

              {p.signals?.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  {p.signals.map((s, si) => (
                    <div key={si} style={{ fontSize: 9, color: "#6b7280", lineHeight: 1.5 }}>· {s}</div>
                  ))}
                </div>
              )}

              <button
                onClick={() => !logged && logPick(overPick)}
                style={{ width: "100%", fontSize: 10, fontWeight: 700, background: logged ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${logged ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "6px", cursor: logged ? "default" : "pointer", color: logged ? "#22c55e" : "#6b7280" }}
              >
                {logged ? "✓ Logged" : `+ Log OVER ${bookLine?.line ?? p.modelLine}`}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const getPickLoggedAt = (pick) => pick?.loggedAt ?? pick?.timestamp ?? "";
  const getPickOutcome = (pick) => {
    if (pick?.outcome) return pick.outcome;
    if (pick?.result === "hit") return "won";
    if (pick?.result === "miss") return "lost";
    return "pending";
  };
  const isModelLog = (pick) => pick?.propType === "K" || pick?.propType === "Outs";
  const todayStr = new Date().toLocaleDateString("en-CA");
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayModelLogs = propLog.filter(p => isModelLog(p) && getPickLoggedAt(p).startsWith(todayStr));
  const todaySettledModelLogs = todayModelLogs.filter(p => {
    const outcome = getPickOutcome(p);
    return outcome === "won" || outcome === "lost";
  });
  const modelWins = todaySettledModelLogs.filter(p => getPickOutcome(p) === "won").length;
  const modelLosses = todaySettledModelLogs.filter(p => getPickOutcome(p) === "lost").length;
  const modelPending = todayModelLogs.filter(p => getPickOutcome(p) === "pending").length;
  const l7SettledModelLogs = propLog.filter(p => {
    if (!isModelLog(p)) return false;
    const datePart = getPickLoggedAt(p).slice(0, 10);
    const outcome = getPickOutcome(p);
    return datePart >= sevenDaysAgo && (outcome === "won" || outcome === "lost");
  });
  const l7WinRate = l7SettledModelLogs.length
    ? Math.round((l7SettledModelLogs.filter(p => getPickOutcome(p) === "won").length / l7SettledModelLogs.length) * 100)
    : null;
  const modelBoardResolved = topSlatePicks
    .map((p) => {
      const result = liveBoardResults[p.pitcherId ?? p.playerId ?? p.id];
      if (!result || result.live) return null;
      const line = p.modelLine;
      if (line === null || line === undefined) return null;
      if (p.propType === "K" || p.market === "pitcher_strikeouts") {
        if (result.k === undefined) return null;
        return p.lean === "UNDER" ? result.k < line : result.k > line;
      }
      if (p.propType === "Outs" || p.market === "pitcher_outs_recorded") {
        if (result.outs === undefined) return null;
        return p.lean === "UNDER" ? result.outs < line : result.outs > line;
      }
      return null;
    })
    .filter(v => v !== null);
  const modelBoardHits = modelBoardResolved.filter(Boolean).length;

  // ── Login screen — shown before the app when not authenticated ─────────
  if (!authToken) {
    return (
      <>
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } body { background: #0e0f1a; }`}</style>
        <div style={{ background: "#0e0f1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "monospace" }}>
          <div style={{ width: "100%", maxWidth: 360 }}>
            {/* Logo / branding */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>⚾</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f9fafb", letterSpacing: "0.05em" }}>PROP SCOUT</div>
              <div style={{ fontSize: 10, color: "#4b5563", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>MLB Research</div>
            </div>

            {/* Login card */}
            <div style={{ background: "#161827", border: "1px solid #1f2437", borderRadius: 12, padding: "24px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", marginBottom: 18, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sign In</div>
              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", marginBottom: 5, letterSpacing: "0.07em" }}>Username</div>
                  <input
                    type="text"
                    value={loginUser}
                    onChange={e => setLoginUser(e.target.value)}
                    autoComplete="username"
                    placeholder="username"
                    style={{ width: "100%", background: "#0e0f1a", border: `1px solid ${loginError ? "rgba(239,68,68,0.5)" : "#2d3148"}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#f9fafb", fontFamily: "monospace", outline: "none" }}
                  />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", marginBottom: 5, letterSpacing: "0.07em" }}>Password</div>
                  <input
                    type="password"
                    value={loginPass}
                    onChange={e => setLoginPass(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    style={{ width: "100%", background: "#0e0f1a", border: `1px solid ${loginError ? "rgba(239,68,68,0.5)" : "#2d3148"}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#f9fafb", fontFamily: "monospace", outline: "none" }}
                  />
                </div>
                {loginError && (
                  <div style={{ fontSize: 10, color: "#ef4444", marginBottom: 14, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, padding: "7px 10px" }}>{loginError}</div>
                )}
                <button
                  type="submit"
                  disabled={loginLoading || !loginUser || !loginPass}
                  style={{ width: "100%", background: loginLoading || !loginUser || !loginPass ? "#1e2030" : "#22c55e", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 12, fontWeight: 800, color: loginLoading || !loginUser || !loginPass ? "#4b5563" : "#000", fontFamily: "monospace", cursor: loginLoading || !loginUser || !loginPass ? "default" : "pointer", textTransform: "uppercase", letterSpacing: "0.08em", transition: "background 0.15s" }}
                >
                  {loginLoading ? "Signing in…" : "Sign In"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } body { background: #0e0f1a; } ::-webkit-scrollbar { width: 4px; height: 4px; } ::-webkit-scrollbar-thumb { background: #374151; border-radius: 2px; }`}</style>
      <div style={{ background: "#0e0f1a", minHeight: "100vh", color: "#e5e7eb", fontFamily: "monospace", maxWidth: 960, margin: "0 auto", padding: windowWidth > 640 ? "20px 24px 64px" : "16px 14px 48px" }}>

        {/* ── APP HEADER ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.1em" }}>MLB RESEARCH</div>
            <div
              style={{ fontSize: 20, fontWeight: 800, color: "#f9fafb", cursor: "default", userSelect: "none" }}
              onClick={() => {
                const next = logoClicks + 1;
                setLogoClicks(next);
                if (next >= 7) {
                  setResearchMode(true);
                  setLogoClicks(0);
                }
              }}
            >⚾ Prop Scout</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setView("slate")} style={{ background: view === "slate" ? "#22c55e" : "#161827", border: `1px solid ${view === "slate" ? "#22c55e" : "#1f2437"}`, borderRadius: 8, padding: "6px 12px", fontSize: 10, color: view === "slate" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Slate</button>
            <button onClick={() => setView("game")}  style={{ background: view === "game"  ? "#22c55e" : "#161827", border: `1px solid ${view === "game"  ? "#22c55e" : "#1f2437"}`, borderRadius: 8, padding: "6px 12px", fontSize: 10, color: view === "game"  ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Game</button>
            <button onClick={() => setView("picks")} style={{ position: "relative", background: view === "picks" ? "#a78bfa" : "#161827", border: `1px solid ${view === "picks" ? "#a78bfa" : "#1f2437"}`, borderRadius: 8, padding: "6px 12px", fontSize: 10, color: view === "picks" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
              Picks
              {propLog.length > 0 && <span style={{ position: "absolute", top: -5, right: -5, background: "#a78bfa", color: "#000", fontSize: 8, fontWeight: 800, borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{propLog.length > 99 ? "99" : propLog.length}</span>}
            </button>
            <button onClick={() => setView("model")} style={{ background: view === "model" ? "#fbbf24" : "#161827", border: `1px solid ${view === "model" ? "#fbbf24" : "#1f2437"}`, borderRadius: 8, padding: "6px 12px", fontSize: 10, color: view === "model" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>🎯 Model</button>
            <button onClick={() => setView("board")} style={{ background: view === "board" ? "#fbbf24" : "#161827", border: `1px solid ${view === "board" ? "#fbbf24" : "#1f2437"}`, borderRadius: 8, padding: "6px 12px", fontSize: 10, color: view === "board" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Board</button>
          </div>
        </div>

        {/* ════════════════════════════════════
            SLATE VIEW
        ════════════════════════════════════ */}
        {/* ── Yesterday's picks reminder banner ─────────────────────────────── */}
        {(() => {
          const now = Date.now();
          const stale = propLog.filter(p => !p.result && p.timestamp && (now - p.timestamp) > 12 * 60 * 60 * 1000);
          if (stale.length === 0) return null;
          return (
            <div onClick={() => setView("picks")} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", borderLeft: "3px solid #fbbf24", borderRadius: 10, padding: "10px 12px", marginBottom: 12, cursor: "pointer" }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>⏰</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24" }}>{stale.length} pick{stale.length > 1 ? "s" : ""} need{stale.length === 1 ? "s" : ""} grading</div>
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>Tap to grade yesterday's picks →</div>
              </div>
            </div>
          );
        })()}

        {view === "slate" && (<>
          {/* ── Compact Model Picks summary ── */}
          {topSlatePicks.length > 0 && (
            <div style={{ border: "1px solid rgba(251,191,36,0.32)", background: "rgba(251,191,36,0.04)", borderRadius: 14, padding: "11px 12px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <SLabel style={{ marginBottom: 0 }}>🎯 Model Picks</SLabel>
                <button
                  onClick={() => setView("model")}
                  style={{ background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.30)", borderRadius: 6, padding: "4px 8px", color: "#fbbf24", fontSize: 9, fontWeight: 800, fontFamily: "monospace", cursor: "pointer", letterSpacing: "0.04em" }}
                >
                  VIEW ALL →
                </button>
              </div>
              {topSlatePicks.slice(0, 3).map((p, i) => (
                <div
                  key={`${p.gamePk}-${p.label}-${i}`}
                  onClick={() => setView("model")}
                  style={{ display: "flex", alignItems: "center", gap: 9, background: "#0f1020", border: "1px solid rgba(251,191,36,0.14)", borderRadius: 10, padding: "9px 10px", marginBottom: i === 2 ? 0 : 6, cursor: "pointer" }}
                >
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fbbf24", fontSize: 10, fontWeight: 800, fontFamily: "monospace", flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#f9fafb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 9, color: "#6b7280" }}>{p.game}</span>
                      {p.lineupConfirmed && <span style={{ fontSize: 8, color: "#22c55e", fontWeight: 800 }}>✓ LINEUP</span>}
                    </div>
                  </div>
                  <LeanBadge label={p.lean} positive={p.positive} small />
                  <div style={{ fontSize: 12, fontWeight: 900, color: p.confidence >= 70 ? "#22c55e" : "#fbbf24", fontFamily: "monospace", minWidth: 34, textAlign: "right" }}>{p.confidence}%</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Daily Card ─────────────────────────────────────────────── */}
          {!IS_STATS_SANDBOX && (() => {
            const isLoading = dailyCard === "loading";
            const hasCard   = dailyCard && dailyCard !== "loading" && dailyCard.card;
            const isError   = dailyCard && dailyCard !== "loading" && dailyCard.error;
            const isCapped  = dailyCard && dailyCard.status === 429;
            const isPendingCard = dailyCard && dailyCard !== "loading" && dailyCard.status === "pending";

            return (
              <div style={{ marginBottom: 10 }}>
                {/* Header / trigger button */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: dailyCardOpen ? "10px 10px 0 0" : 10, padding: "9px 12px", cursor: "pointer" }}
                  onClick={() => {
                    if (!dailyCardOpen && !dailyCard && !isLoading) {
                      // First open — trigger fetch
                      setDailyCard("loading");
                      fetchDailyCard()
                        .then(d => setDailyCard(d))
                        .catch(err => setDailyCard({ error: err.message, status: err.status, cap: err.cap }));
                    }
                    setDailyCardOpen(o => !o);
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#818cf8", letterSpacing: "0.07em", fontFamily: "monospace" }}>⚡ DAILY CARD</span>
                  {hasCard && (
                    <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 3, padding: "1px 5px" }}>
                      {dailyCard.gamesAnalyzed} games analyzed
                    </span>
                  )}
                  {isLoading && <span style={{ fontSize: 9, color: "#6b7280" }}>Analyzing slate…</span>}
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "#4b5563" }}>{dailyCardOpen ? "▲" : "▼"}</span>
                </div>

                {/* Expandable panel */}
                {dailyCardOpen && (
                  <div style={{ background: "#0a0b12", border: "1px solid rgba(99,102,241,0.2)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "12px" }}>

                    {isLoading && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0" }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#818cf8", flexShrink: 0, animation: "pulse 1.5s ease-in-out infinite" }} />
                        <span style={{ fontSize: 11, color: "#6b7280" }}>Running full-slate analysis across {activeSlate.length} games…</span>
                      </div>
                    )}

                    {isPendingCard && (
                      <div style={{ padding: "8px 0" }}>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
                          Daily Card is waiting to be run.
                        </div>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setDailyCard("loading");
                            fetchDailyCard()
                              .then(d => setDailyCard(d))
                              .catch(err => setDailyCard({ error: err.message, status: err.status, cap: err.cap }));
                          }}
                          style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}
                        >
                          ↻ Check again
                        </button>
                      </div>
                    )}

                    {isError && !isPendingCard && (
                      <div style={{ padding: "8px 0" }}>
                        <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 6 }}>
                          {isCapped
                            ? `Daily analysis cap reached. Resets at midnight. (${dailyCard.cap?.calls ?? "—"}/${(dailyCard.cap?.calls ?? 0) + (dailyCard.cap?.remaining ?? 0)} calls used)`
                            : `Generation failed: ${dailyCard.error}`}
                        </div>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setDailyCard("loading");
                            fetchDailyCard()
                              .then(d => setDailyCard(d))
                              .catch(err => setDailyCard({ error: err.message, status: err.status, cap: err.cap }));
                          }}
                          style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}
                        >
                          ↻ Try again
                        </button>
                      </div>
                    )}

                    {hasCard && (() => {
                      const raw = dailyCard.card ?? "";

                      // Parse named sections from the card text
                      const getSection = (label) => {
                        const re = new RegExp(`(?:^|\\n)\\d+\\.\\s*${label}[^\\n]*\\n([\\s\\S]*?)(?=\\n\\d+\\.|$)`, "i");
                        return (raw.match(re)?.[1] ?? "").trim();
                      };
                      const officialRaw  = getSection("OFFICIAL CARD");
                      const bestBetsRaw  = getSection("BEST BETS SUMMARY");
                      const passesRaw    = getSection("PASSES");
                      const breakdownRaw = getSection("PICK BREAKDOWN");

                      // Parse Official Card lines into individual pick rows
                      const officialPicks = officialRaw
                        .split("\n")
                        .map(l => l.replace(/^[-•*]\s*/, "").trim())
                        .filter(l => l.length > 3 && !/^PASS$/i.test(l));
                      const isAllPass = officialRaw.toUpperCase().includes("PASS") && officialPicks.length === 0;

                      // Parse individual PROP blocks from breakdown
                      const propBlocks = breakdownRaw
                        .split(/\n(?=PROP:)/)
                        .map(b => b.trim())
                        .filter(b => b.startsWith("PROP:"));

                      // Parse bullet lists (Best Bets / Passes) — strip blanks and lone dashes
                      const parseBullets = (text) =>
                        text.split("\n").map(l => l.replace(/^[-•*\d.]\s*/, "").trim()).filter(l => l.length > 2 && !/^[-–—]+$/.test(l));

                      const doRefresh = (e) => {
                        e.stopPropagation();
                        setDailyCard("loading");
                        fetchDailyCard()
                          .then(d => setDailyCard(d))
                          .catch(err => setDailyCard({ error: err.message, status: err.status, cap: err.cap }));
                      };

                      return (
                        <div>
                          {/* ── Meta bar ── */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 9, color: "#4b5563", fontFamily: "monospace" }}>
                              Generated {new Date(dailyCard.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </span>
                            {dailyCard.cap && (
                              <span style={{ fontSize: 9, color: "#374151", fontFamily: "monospace" }}>
                                · Cap: {dailyCard.cap.calls}/{(dailyCard.cap.calls ?? 0) + (dailyCard.cap.remaining ?? 0)} calls today
                              </span>
                            )}
                            <button onClick={doRefresh} style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, color: "#6b7280", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>↻ Refresh</button>
                          </div>

                          {/* ── OFFICIAL CARD (hero section) ── */}
                          <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                            <div style={{ fontSize: 9, fontWeight: 800, color: "#22c55e", letterSpacing: "0.08em", marginBottom: 10 }}>✓ OFFICIAL CARD</div>
                            {isAllPass ? (
                              <div style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic" }}>PASS — no plays meet the standard today.</div>
                            ) : officialPicks.length > 0 ? (
                              officialPicks.map((pick, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: i < officialPicks.length - 1 ? "1px solid rgba(34,197,94,0.1)" : "none" }}>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: "#22c55e", minWidth: 16, flexShrink: 0 }}>{i + 1}</span>
                                  <span style={{ fontSize: 11, color: "#f9fafb", lineHeight: 1.4 }}>{pick}</span>
                                </div>
                              ))
                            ) : (
                              <div style={{ fontSize: 11, color: "#f9fafb", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{officialRaw || "—"}</div>
                            )}
                          </div>

                          {/* ── BEST BETS SUMMARY ── */}
                          {bestBetsRaw.length > 0 && (
                            <div style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                              <div style={{ fontSize: 9, fontWeight: 800, color: "#fbbf24", letterSpacing: "0.08em", marginBottom: 8 }}>★ BEST BETS SUMMARY</div>
                              {parseBullets(bestBetsRaw).map((line, i) => (
                                <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: i < parseBullets(bestBetsRaw).length - 1 ? "1px solid rgba(251,191,36,0.08)" : "none" }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", minWidth: 16, flexShrink: 0 }}>{i + 1}.</span>
                                  <span style={{ fontSize: 11, color: "#d1d5db", lineHeight: 1.4 }}>{line}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* ── PICK BREAKDOWN ── */}
                          {propBlocks.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 9, fontWeight: 800, color: "#818cf8", letterSpacing: "0.08em", marginBottom: 8 }}>◈ PICK BREAKDOWN</div>
                              {propBlocks.map((block, bi) => {
                                const propLine   = block.match(/^PROP:\s*(.+)/m)?.[1]?.trim() ?? "";
                                const confLine   = block.match(/^CONFIDENCE:\s*(.+)/m)?.[1]?.trim() ?? "";
                                const edgeLine   = block.match(/^EDGE:\s*(.+)/m)?.[1]?.trim() ?? "";
                                const signalsTxt = block.match(/^SIGNALS:\n([\s\S]*?)(?=\nRISK:|\nPLAYABILITY:|$)/m)?.[1] ?? "";
                                const riskTxt    = block.match(/^RISK:\n([\s\S]*?)(?=\nPLAYABILITY:|$)/m)?.[1] ?? "";
                                const playTxt    = block.match(/^PLAYABILITY:\n([\s\S]*?)$/m)?.[1] ?? "";
                                const bullets    = (txt) => txt.split("\n").map(l => l.replace(/^\s*[•·\-]\s*/, "").trim()).filter(Boolean);
                                const confNum    = parseFloat(confLine);
                                const confColor  = confNum >= 7.5 ? "#22c55e" : confNum >= 6 ? "#fbbf24" : "#94a3b8";

                                return (
                                  <div key={bi} style={{ background: "#0f1020", border: "1px solid #1f2437", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                                    {/* Header row */}
                                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", lineHeight: 1.3 }}>{propLine}</div>
                                      {confLine && (
                                        <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: confColor, fontFamily: "monospace", background: `${confColor}18`, border: `1px solid ${confColor}44`, borderRadius: 5, padding: "2px 7px" }}>{confLine}</div>
                                      )}
                                    </div>
                                    {edgeLine && <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.4, marginBottom: 8 }}>{edgeLine}</div>}
                                    {bullets(signalsTxt).length > 0 && (
                                      <div style={{ marginBottom: 6 }}>
                                        <div style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", letterSpacing: "0.06em", marginBottom: 3 }}>SIGNALS</div>
                                        {bullets(signalsTxt).map((s, i) => <div key={i} style={{ fontSize: 10, color: "#d1d5db", padding: "1px 0", lineHeight: 1.4 }}>• {s}</div>)}
                                      </div>
                                    )}
                                    {bullets(riskTxt).length > 0 && (
                                      <div style={{ marginBottom: 6 }}>
                                        <div style={{ fontSize: 8, fontWeight: 700, color: "#ef4444", letterSpacing: "0.06em", marginBottom: 3 }}>RISK</div>
                                        {bullets(riskTxt).map((s, i) => <div key={i} style={{ fontSize: 10, color: "#9ca3af", padding: "1px 0", lineHeight: 1.4 }}>• {s}</div>)}
                                      </div>
                                    )}
                                    {bullets(playTxt).length > 0 && (
                                      <div>
                                        <div style={{ fontSize: 8, fontWeight: 700, color: "#60a5fa", letterSpacing: "0.06em", marginBottom: 3 }}>PLAYABILITY</div>
                                        {bullets(playTxt).map((s, i) => <div key={i} style={{ fontSize: 10, color: "#9ca3af", padding: "1px 0", lineHeight: 1.4 }}>• {s}</div>)}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* ── PASSES ── */}
                          {passesRaw.length > 0 && (
                            <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ fontSize: 9, fontWeight: 800, color: "#ef4444", letterSpacing: "0.08em", marginBottom: 8 }}>✕ PASSES</div>
                              {parseBullets(passesRaw).map((line, i) => (
                                <div key={i} style={{ fontSize: 10, color: "#6b7280", padding: "3px 0", lineHeight: 1.4, borderBottom: i < parseBullets(passesRaw).length - 1 ? "1px solid rgba(239,68,68,0.06)" : "none" }}>
                                  {line}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Research Mode: date navigation bar (7-click logo unlock) ── */}
          {researchMode && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#a78bfa", fontFamily: "monospace", letterSpacing: "0.08em", flexShrink: 0 }}>📅 RESEARCH</span>
              <button
                onClick={() => {
                  const base = slateDate ? new Date(slateDate + "T12:00:00") : new Date();
                  base.setDate(base.getDate() - 1);
                  setSlateDate(base.toISOString().slice(0, 10));
                }}
                style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "4px 10px", fontSize: 13, color: "#f9fafb", cursor: "pointer" }}>◀</button>
              <input
                type="date"
                value={slateDate ?? new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" })}
                onChange={e => setSlateDate(e.target.value)}
                style={{ flex: 1, background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#f9fafb", fontFamily: "monospace", colorScheme: "dark" }}
              />
              <button
                onClick={() => {
                  const base = slateDate ? new Date(slateDate + "T12:00:00") : new Date();
                  base.setDate(base.getDate() + 1);
                  setSlateDate(base.toISOString().slice(0, 10));
                }}
                style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "4px 10px", fontSize: 13, color: "#f9fafb", cursor: "pointer" }}>▶</button>
              <button
                onClick={() => { setSlateDate(null); setResearchMode(false); setLogoClicks(0); }}
                style={{ background: "transparent", border: "none", fontSize: 11, color: "#6b7280", cursor: "pointer", fontFamily: "monospace", flexShrink: 0 }}>✕</button>
            </div>
          )}

          <SLabel>{slateDate ? `Slate — ${slateDate}` : "Today's Slate"} — {activeSlate.length} Games{!IS_STATS_SANDBOX && !slateLoading && liveSlate ? " · LIVE" : !IS_STATS_SANDBOX && slateLoading ? " · Loading…" : ""}</SLabel>
          {slateLoading && !liveSlate && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
              <div style={{ width: 18, height: 18, border: "2px solid #1f2437", borderTop: "2px solid #22c55e", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#6b7280" }}>Fetching today's slate…</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }`}</style>
            </div>
          )}
          <div style={windowWidth > 640 ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } : {}}>
            {activeSlate.map(g => (
              <SlateCard key={g.id} game={g} selected={selectedId === g.id} onSelect={openGame} liveOddsMap={liveOddsMap}
                bestBet={topSlatePicks.find(p => p.gamePk === (g.gamePk ?? g.id)) ?? null}
                liveScore={liveScores[g.gamePk ?? g.id] ?? null}
                injuredIds={injuredIds} />
            ))}
          </div>
        </>)}

        {/* ════════════════════════════════════
            MODEL VIEW
        ════════════════════════════════════ */}
        {view === "model" && (<>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <SLabel style={{ marginBottom: 0 }}>🎯 Model Picks</SLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {topSlatePicks.length > 0 && (
                <span style={{ background: modelBoardHits > 0 ? "#22c55e" : "#374151", color: modelBoardHits > 0 ? "#03140a" : "#d1d5db", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 900, lineHeight: 1.2, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                  {modelBoardHits}/{topSlatePicks.length} hit
                </span>
              )}
              <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>ALGO · {topSlatePicks.length} picks</span>
            </div>
          </div>

          <div style={{ background: "#161827", border: "1px solid #1f2437", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
            {todayModelLogs.length === 0 ? (
              <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>No picks logged today</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 10, fontFamily: "monospace", alignItems: "center" }}>
                <span style={{ color: "#6b7280" }}>Today:</span>
                <span style={{ color: "#f9fafb", fontWeight: 800 }}>{modelWins}-{modelLosses}-{modelPending}</span>
                {l7WinRate !== null && (
                  <>
                    <span style={{ color: "#4b5563" }}>|</span>
                    <span style={{ color: "#6b7280" }}>L7:</span>
                    <span style={{ color: "#f9fafb", fontWeight: 800 }}>{l7WinRate}%</span>
                  </>
                )}
                <span style={{ color: "#4b5563" }}>|</span>
                <span style={{ color: "#6b7280" }}>Pending:</span>
                <span style={{ color: "#f9fafb", fontWeight: 800 }}>{modelPending}</span>
              </div>
            )}
          </div>

          {topSlatePicks.length > 0 ? (
            <div style={{ border: "1px solid rgba(251,191,36,0.32)", background: "rgba(251,191,36,0.04)", borderRadius: 14, padding: "11px 12px", marginBottom: 14 }}>
              <TierSection picks={highPicks}   tierLabel="HIGH CONFIDENCE"   tierColor="#22c55e" borderColor="#1a2e1a" />
              <TierSection picks={mediumPicks} tierLabel="MEDIUM CONFIDENCE" tierColor="#fbbf24" borderColor="#2a2510" />
              <TierSection picks={specPicks}   tierLabel="SPECULATIVE"       tierColor="#94a3b8" borderColor="#1a1f2e" />
            </div>
          ) : (
            <Card>
              <div style={{ textAlign: "center", padding: "24px 0", color: "#6b7280", fontSize: 11 }}>
                Model scoring requires probable pitchers — check back closer to game time.
              </div>
            </Card>
          )}
        </>)}

        {/* ════════════════════════════════════
            GAME VIEW
        ════════════════════════════════════ */}
        {view === "game" && (<>

          {/* Game Header Card */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#f9fafb" }}>{game.away.abbr}</div>
                <div style={{ fontSize: 9, color: "#6b7280" }}>{game.away.name}</div>
              </div>
              <div style={{ textAlign: "center", padding: "0 8px" }}>
                <div style={{ fontSize: 11, color: "#374151", fontWeight: 700 }}>@</div>
                <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{game.time}</div>
              </div>
              <div style={{ textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#f9fafb" }}>{game.home.abbr}</div>
                <div style={{ fontSize: 9, color: "#6b7280" }}>{game.home.name}</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#6b7280", textAlign: "center", marginBottom: 10 }}>
              {game.stadium} · {game.location}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
              <LeanBadge label={weather.roof ? "DOME" : `${weather.temp}° ${weather.hrFavorable ? "HR WEATHER" : "WIND IN"}`} positive={weather.hrFavorable} small />
              <LeanBadge label={`O/U ${odds.total}`} positive={null} small />
            </div>
          </Card>

          {/* Game Tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? "#22c55e" : "#161827", border: `1px solid ${tab === t ? "#22c55e" : "#1f2437"}`, borderRadius: 8, padding: "6px 14px", fontSize: 10, color: tab === t ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: tab === t ? 700 : 400, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap", flexShrink: 0 }}>{t}</button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (<>

            {/* ── Pitcher Card ── */}
            <Card>
              {/* Pitcher toggle */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[["away", game.away.abbr], ["home", game.home.abbr]].map(([side, abbr]) => (
                  <button key={side} onClick={() => setPitcherSide(side)}
                    style={{ flex: 1, background: pitcherSide === side ? "#22c55e" : "#1e2030", border: `1px solid ${pitcherSide === side ? "#22c55e" : "#2d3148"}`, borderRadius: 8, padding: "6px", fontSize: 10, color: pitcherSide === side ? "#000" : "#6b7280", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
                    {abbr} SP {pitcherSide === side ? "▾" : ""}
                  </button>
                ))}
              </div>

              {/* Active pitcher card */}
              {(() => {
                const activePitcher = pitcherSide === "home" ? pitcher : (game.awayPitcher ?? pitcher);
                const facingTeam   = pitcherSide === "home" ? game.away.abbr : game.home.abbr;
                const gamelog = activePitcher?.id ? liveGameLog[activePitcher.id] : null;

                const activeKProp = pitcherSide === "home"
                  ? liveProps.find(p => p.propType === "K") ?? null
                  : null;
                const activeKPer9 = parseFloat(activePitcher?.kPer9);
                const kLeanBadge = activeKProp
                  ? { label: `K ${activeKProp.lean}`, positive: activeKProp.positive }
                  : !isNaN(activeKPer9)
                    ? activeKPer9 >= 8.5 ? { label: "K LEAN OVER",  positive: true  }
                    : activeKPer9 >= 7.0 ? { label: "K LEAN OVER",  positive: true  }
                    : activeKPer9 <  5.5 ? { label: "K LEAN UNDER", positive: false }
                    : null
                  : null;
                const recentStarts = gamelog?.games ?? [];
                const last3Era = last3EraSummary(recentStarts);
                const seasonEra = parseFloat(gamelog?.seasonEra ?? activePitcher.era);
                const summaryColor = last3Era == null || Number.isNaN(seasonEra)
                  ? "#6b7280"
                  : last3Era > seasonEra + 1.5
                    ? "#ef4444"
                    : last3Era < seasonEra
                      ? "#22c55e"
                      : "#9ca3af";

                // Wins/Losses/K season totals from live pitcher stats
                const pitcherRecord = activePitcher.wins != null
                  ? `${activePitcher.wins}W–${activePitcher.losses}L · ${activePitcher.k ?? "—"}K`
                  : null;

                // Recent starts: count clean outings (0 ER) for NRFI context
                const cleanStarts = recentStarts.filter(g => (g.er ?? 0) === 0).length;
                const totalRecentStarts = recentStarts.length;

                return (<>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: pitcherSide === "home" ? "linear-gradient(135deg, #E81828, #002D72)" : "linear-gradient(135deg, #002D72, #E81828)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{activePitcher.number ?? "#"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb" }}>{activePitcher.name ?? "TBD"}</div>
                            {injuredIds.has(String(activePitcher?.id)) && (
                              <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 999, padding: "1px 6px", letterSpacing: "0.06em" }}>⚠ IL</span>
                            )}
                          </div>
                          <div style={{ fontSize: 9, color: "#6b7280" }}>{activePitcher.team} · SP · {activePitcher.hand ?? "?"}HP · vs {facingTeam}</div>
                        </div>
                        {kLeanBadge && <LeanBadge label={kLeanBadge.label} positive={kLeanBadge.positive} small />}
                      </div>
                    </div>
                  </div>

                  {/* Season stat row */}
                  <div style={{ display: "flex", gap: 5, marginBottom: 4 }}>
                    {[
                      ["ERA",   activePitcher.era,   parseFloat(activePitcher.era)  < 3.5  ? "#22c55e" : parseFloat(activePitcher.era)  > 4.5  ? "#ef4444" : "#f9fafb"],
                      ["WHIP",  activePitcher.whip,  parseFloat(activePitcher.whip) < 1.2  ? "#22c55e" : parseFloat(activePitcher.whip) > 1.4  ? "#ef4444" : "#f9fafb"],
                      ["K/9",   activePitcher.kPer9, "#22c55e"],
                      ["BB/9",  activePitcher.bbPer9, null],
                      ["Avg IP", activePitcher.avgIP && activePitcher.avgIP !== "—" ? activePitcher.avgIP : (gamelog?.avgIP ?? "—"), null],
                    ].map(([l, v, c]) => (
                      <StatMini key={l} label={l} value={v ?? "—"} color={c} />
                    ))}
                  </div>

                  {/* Pitcher platoon splits — vs LHH / vs RHH */}
                  {(() => {
                    const key = String(activePitcher.id);
                    const splitsData = pitcherPlatoonSplits[key];
                    // Loading state — show skeleton boxes so user knows they're coming
                    if (splitsData === "loading") return (
                      <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                        {["vs LHH", "vs RHH"].map(label => (
                          <div key={label} style={{ flex: 1, background: "#0e0f1a", borderRadius: 8, padding: "6px 9px" }}>
                            <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                            <div style={{ fontSize: 9, color: "#4b5563" }}>loading…</div>
                          </div>
                        ))}
                      </div>
                    );
                    if (!splitsData) return null; // not yet fetched (shouldn't happen) or IS_SAVANT_SANDBOX
                    const { vsL, vsR } = splitsData;
                    // Both null = no data available for this pitcher
                    if (!vsL && !vsR) return (
                      <div style={{ fontSize: 8, color: "#4b5563", marginBottom: 6, fontStyle: "italic" }}>Platoon splits unavailable (small sample)</div>
                    );
                    return (
                      <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                        {[["vs LHH", vsL], ["vs RHH", vsR]].map(([label, d]) => (
                          <div key={label} style={{ flex: 1, background: "#0e0f1a", borderRadius: 8, padding: "6px 9px" }}>
                            <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                            {d ? (<>
                              <div style={{ fontSize: 11, fontWeight: 700, color: parseFloat(d.avg) >= 0.280 ? "#ef4444" : parseFloat(d.avg) <= 0.220 ? "#22c55e" : "#e5e7eb", fontFamily: "monospace" }}>{d.avg} AVG</div>
                              <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>{d.kPct} K · {d.bbPct} BB · {d.pa} PA</div>
                            </>) : <div style={{ fontSize: 9, color: "#4b5563" }}>—</div>}
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Pitcher home / away splits */}
                  {(() => {
                    const key = `${activePitcher.id}:pitching`;
                    const sd  = liveStatSplits[key];
                    // Not yet fetched — nothing shown until effect fires
                    if (sd === undefined) return null;
                    if (sd === "loading") return (
                      <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                        {["Home", "Away"].map(l => (
                          <div key={l} style={{ flex: 1, background: "#0e0f1a", borderRadius: 8, padding: "6px 9px" }}>
                            <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{l}</div>
                            <div style={{ fontSize: 9, color: "#4b5563" }}>loading…</div>
                          </div>
                        ))}
                      </div>
                    );
                    if (!sd) return (
                      <div style={{ fontSize: 8, color: "#4b5563", marginBottom: 6, fontStyle: "italic" }}>Home/Away splits unavailable</div>
                    );
                    const { home, away } = sd;
                    if (!home && !away) return (
                      <div style={{ fontSize: 8, color: "#4b5563", marginBottom: 6, fontStyle: "italic" }}>Home/Away splits unavailable</div>
                    );
                    return (
                      <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                        {[["Home", home], ["Away", away]].map(([label, d]) => {
                          const era = parseFloat(d?.era) || 0;
                          const eraColor = era <= 3.00 ? "#22c55e" : era <= 4.50 ? "#f59e0b" : "#ef4444";
                          return (
                            <div key={label} style={{ flex: 1, background: "#0e0f1a", borderRadius: 8, padding: "6px 9px" }}>
                              <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                              {d ? (<>
                                <div style={{ fontSize: 11, fontWeight: 700, color: eraColor, fontFamily: "monospace" }}>{d.era} ERA</div>
                                <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>{d.whip} WHIP · {d.ip} IP</div>
                              </>) : <div style={{ fontSize: 9, color: "#4b5563" }}>—</div>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Pitcher day / night splits */}
                  {(() => {
                    const key = `${activePitcher.id}:pitching`;
                    const sd  = liveStatSplits[key];
                    if (!sd || sd === "loading" || sd === undefined) return null;
                    const { day, night } = sd;
                    if (!day && !night) return null;
                    // Determine today's game context: day = before 5 PM
                    const isDayGame = (() => {
                      if (!game?.time) return null;
                      const m = game.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
                      if (!m) return null;
                      let h = parseInt(m[1], 10);
                      const isPM = m[3].toUpperCase() === "PM";
                      if (isPM && h !== 12) h += 12;
                      if (!isPM && h === 12) h = 0;
                      return h < 17; // before 5 PM
                    })();
                    return (
                      <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                        {[["Day", day, true], ["Night", night, false]].map(([label, d, isDay]) => {
                          const isToday = isDayGame === true ? isDay : isDayGame === false ? !isDay : false;
                          const era = parseFloat(d?.era) || 0;
                          const eraColor = era <= 3.00 ? "#22c55e" : era <= 4.50 ? "#f59e0b" : "#ef4444";
                          return (
                            <div key={label} style={{ flex: 1, background: isToday ? "rgba(56,189,248,0.06)" : "#0e0f1a", borderRadius: 8, padding: "6px 9px", border: isToday ? "1px solid rgba(56,189,248,0.25)" : "1px solid transparent" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                                <div style={{ fontSize: 8, color: isToday ? "#38bdf8" : "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: isToday ? 700 : 400 }}>{label}</div>
                                {isToday && <div style={{ fontSize: 7, color: "#38bdf8", fontWeight: 800 }}>TODAY</div>}
                              </div>
                              {d ? (<>
                                <div style={{ fontSize: 11, fontWeight: 700, color: eraColor, fontFamily: "monospace" }}>{d.era} ERA</div>
                                <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>{d.whip} WHIP · {d.ip} IP</div>
                              </>) : <div style={{ fontSize: 9, color: "#4b5563" }}>—</div>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Season record + clean start rate */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, marginBottom: 6 }}>
                    {pitcherRecord && <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>{pitcherRecord}</span>}
                    {totalRecentStarts > 0 && (
                      <span style={{ fontSize: 9, color: cleanStarts >= 3 ? "#22c55e" : cleanStarts >= 2 ? "#f59e0b" : "#ef4444", fontFamily: "monospace" }}>
                        {cleanStarts}/{totalRecentStarts} clean recent starts
                      </span>
                    )}
                  </div>

                  {/* ERA sparkline */}
                  {recentStarts.length >= 2 && (() => {
                    const starts = recentStarts.slice(0, 5).reverse();
                    const MAX_ERA_SCALE = 9;
                    return (
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, marginBottom: 8 }}>
                        {starts.map((g, idx) => {
                          const era = g.ip > 0 ? (g.er / parseIpToOuts(g.ip)) * 27 : 0;
                          const heightPct = Math.min(era / MAX_ERA_SCALE, 1);
                          const barH = Math.max(3, Math.round(heightPct * 24));
                          const barColor = g.er <= 2 ? "#22c55e" : g.er <= 4 ? "#f59e0b" : "#ef4444";
                          const isLatest = idx === starts.length - 1;
                          return (
                            <div key={idx} title={`${g.date} · ${g.er} ER · ${g.ip} IP`}
                              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                              <div style={{ width: "100%", height: barH, background: barColor, borderRadius: "2px 2px 0 0", opacity: isLatest ? 1 : 0.7, border: isLatest ? `1px solid ${barColor}` : "none" }} />
                              {isLatest && <div style={{ width: 4, height: 4, borderRadius: "50%", background: barColor, flexShrink: 0 }} />}
                              <div style={{ fontSize: 8, fontWeight: 700, color: barColor, fontFamily: "monospace", marginTop: isLatest ? 0 : 4 }}>{g.er}ER</div>
                            </div>
                          );
                        })}
                        <div style={{ fontSize: 8, color: "#4b5563", alignSelf: "flex-start", paddingLeft: 4, whiteSpace: "nowrap" }}>ERA trend</div>
                      </div>
                    );
                  })()}

                  {/* Last 3 starts mini table */}
                  {recentStarts.length >= 1 && (() => {
                    const last3 = recentStarts.slice(0, 3);
                    return (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 32px 20px 20px 20px 34px", gap: "3px 6px", alignItems: "center" }}>
                          {/* Header */}
                          {["OPP", "", "IP", "K", "ER", "RES", "PC"].map(h => (
                            <div key={h} style={{ fontSize: 8, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "monospace" }}>{h}</div>
                          ))}
                          {/* Rows */}
                          {last3.map((g, i) => {
                            const resultColor = g.result === "W" ? "#22c55e" : g.result === "L" ? "#ef4444" : "#6b7280";
                            const erColor     = g.er === 0 ? "#22c55e" : g.er <= 2 ? "#f59e0b" : "#ef4444";
                            return [
                              <div key={`opp-${i}`}  style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", fontFamily: "monospace" }}>{g.opponent}</div>,
                              <div key={`dt-${i}`}   style={{ fontSize: 8, color: "#4b5563" }}>{g.date ? g.date.slice(5).replace("-", "/") : ""}</div>,
                              <div key={`ip-${i}`}   style={{ fontSize: 9, color: "#e5e7eb", fontFamily: "monospace" }}>{g.ip}</div>,
                              <div key={`k-${i}`}    style={{ fontSize: 9, color: "#a78bfa", fontFamily: "monospace" }}>{g.k}</div>,
                              <div key={`er-${i}`}   style={{ fontSize: 9, color: erColor,  fontFamily: "monospace" }}>{g.er}</div>,
                              <div key={`res-${i}`}  style={{ fontSize: 9, color: resultColor, fontFamily: "monospace" }}>{g.result}</div>,
                              <div key={`pc-${i}`}   style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>{g.pc != null ? `${g.pc}p` : "—"}</div>,
                            ];
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {last3Era != null && (
                    <div style={{ fontSize: 10, color: summaryColor, lineHeight: 1.5 }}>
                      Last 3 ERA: {last3Era.toFixed(2)} vs season {gamelog?.seasonEra ?? activePitcher.era ?? "—"}
                    </div>
                  )}
                </>);
              })()}
            </Card>

            {/* ── Lineup Matchup Intel ── */}
            {(() => {
              const activePitcher = pitcherSide === "home" ? pitcher : (game.awayPitcher ?? pitcher);
              const facingLineup  = pitcherSide === "home" ? awayLineup : homeLineup;
              const facingAbbr    = pitcherSide === "home" ? game.away.abbr : game.home.abbr;

              if (!facingLineup.length) return (
                <Card>
                  <SLabel>Lineup Matchup Intel</SLabel>
                  <div style={{ fontSize: 11, color: "#4b5563", textAlign: "center", padding: "8px 0" }}>⏳ Waiting for {facingAbbr} lineup…</div>
                </Card>
              );

              // Compute matchup score for every batter in the facing lineup
              const scored = facingLineup.map(b => {
                const enriched = augmentBatterWithSplits(b, batterSplits);
                return { ...enriched, matchupScore: batterMatchupScoreForPitcher(enriched, activePitcher, batterSplits) };
              });
              const avgScore = Math.round(scored.reduce((s, b) => s + b.matchupScore, 0) / (scored.length || 1));
              const danger   = [...scored].sort((a, b) => b.matchupScore - a.matchupScore).slice(0, 3);

              // Handedness breakdown
              const lhCount = facingLineup.filter(b => b.hand === "L").length;
              const rhCount = facingLineup.filter(b => b.hand === "R").length;
              const shCount = facingLineup.filter(b => b.hand === "S").length;
              const pitHand  = activePitcher.hand ?? "R";
              // Same-hand matchups favor pitcher; opposite-hand favors batter
              const dominantHand = lhCount >= rhCount ? "L" : "R";
              const handEdge = dominantHand === pitHand ? "Pitcher Hand Edge" : "Batter Hand Edge";
              const handEdgeColor = dominantHand === pitHand ? "#22c55e" : "#ef4444";

              const avgScoreColor = avgScore >= 55 ? "#ef4444" : avgScore >= 35 ? "#f59e0b" : "#22c55e";

              return (
                <Card>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <SLabel style={{ marginBottom: 0 }}>{facingAbbr} Lineup vs {activePitcher.name?.split(" ").slice(-1)[0]}</SLabel>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 9, color: "#6b7280" }}>Avg score</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: avgScoreColor, fontFamily: "monospace" }}>{avgScore}</span>
                    </div>
                  </div>

                  {/* Handedness row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0e0f1a", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>
                      {rhCount > 0 && <span>{rhCount} RHB</span>}
                      {rhCount > 0 && lhCount > 0 && <span style={{ color: "#374151" }}> · </span>}
                      {lhCount > 0 && <span>{lhCount} LHB</span>}
                      {shCount > 0 && <span style={{ color: "#374151" }}> · </span>}
                      {shCount > 0 && <span>{shCount} SH</span>}
                      <span style={{ color: "#374151" }}> vs </span>
                      <span style={{ color: pitHand === "L" ? "#a78bfa" : "#f9fafb" }}>{pitHand}HP</span>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: handEdgeColor }}>{handEdge}</span>
                  </div>

                  {/* Danger batters */}
                  <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Top Matchups</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {danger.map((b, idx) => {
                      const sc = b.matchupScore;
                      const scColor = scoreColor(sc);
                      const hlog = liveHittingLog[b.id];
                      const avg  = hlog?.avg ?? b.avg ?? ".---";
                      const hand = (hlog?.hand && hlog.hand !== "?") ? hlog.hand : (b.hand ?? "?");
                      return (
                        <div key={b.id ?? idx} style={{ display: "flex", alignItems: "center", gap: 8, background: "#0e0f1a", borderRadius: 8, padding: "6px 10px" }}>
                          <div style={{ width: 18, height: 18, borderRadius: 5, background: "#1e2030", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#6b7280", flexShrink: 0 }}>{b.order ?? idx + 1}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#f9fafb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
                            <div style={{ fontSize: 9, color: "#6b7280" }}>{b.pos} · {hand}H · {avg}</div>
                          </div>
                          <div style={{ background: `${scColor}18`, border: `1px solid ${scColor}44`, borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 700, color: scColor, fontFamily: "monospace", flexShrink: 0 }}>{sc}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Item 1: Primary pitch edge callout ── */}
                  {activePitcher.arsenalLive && activePitcher.arsenal?.length > 0 && (() => {
                    // Best swing-and-miss pitch by whiff %
                    const bestWhiff = [...activePitcher.arsenal].sort((a, b) => (parseFloat(b.whiffPct) || 0) - (parseFloat(a.whiffPct) || 0))[0];
                    const whiffNum  = parseFloat(bestWhiff?.whiffPct);
                    if (isNaN(whiffNum) || whiffNum < 25) return null;

                    // Check if any loaded splits tell us how the lineup handles this pitch
                    const abbr = bestWhiff.abbr;
                    const splitsForPitch = facingLineup
                      .map(b => batterSplits[b.id]?.[abbr])
                      .filter(Boolean);
                    const avgLineupAvg = splitsForPitch.length >= 3
                      ? splitsForPitch.reduce((s, sp) => s + (parseFloat(sp.avg) || 0), 0) / splitsForPitch.length
                      : null;

                    const pitchLabel = bestWhiff.type ?? bestWhiff.abbr;
                    const isElite    = whiffNum >= 38;
                    const lineupNote = avgLineupAvg != null
                      ? avgLineupAvg >= 0.270 ? ` · lineup AVG .${Math.round(avgLineupAvg * 1000).toString().padStart(3, "0")} vs it (handles)`
                      : avgLineupAvg <= 0.220 ? ` · lineup AVG .${Math.round(avgLineupAvg * 1000).toString().padStart(3, "0")} vs it (weak spot)`
                      : ""
                      : "";

                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, background: "#0e0f1a", borderRadius: 8, padding: "7px 10px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Primary Chase Pitch</div>
                          <div style={{ fontSize: 11, color: "#f9fafb", fontWeight: 600 }}>{pitchLabel} — {Math.round(whiffNum)}% whiff{lineupNote}</div>
                        </div>
                        <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                          color: isElite ? "#22c55e" : "#f59e0b",
                          background: isElite ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
                          border: `1px solid ${isElite ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}` }}>
                          {isElite ? "ELITE" : "SOLID"}
                        </span>
                      </div>
                    );
                  })()}

                  {/* ── Item 3: K% confluence note ── */}
                  {(() => {
                    const k9 = parseFloat(activePitcher?.kPer9);
                    if (isNaN(k9)) return null;

                    let note = null;
                    if      (k9 >= 9.0 && avgScore <= 45) note = { text: `High K environment — K/9 ${k9.toFixed(1)}, lineup avg score ${avgScore}`, color: "#22c55e" };
                    else if (k9 >= 8.0 && avgScore <= 38) note = { text: `K-friendly matchup — K/9 ${k9.toFixed(1)} meets a weak-contact lineup (avg score ${avgScore})`, color: "#22c55e" };
                    else if (k9 <= 5.5 && avgScore >= 42) note = { text: `Low K environment — K/9 ${k9.toFixed(1)}, lineup avg score ${avgScore} (batter edge)`, color: "#ef4444" };
                    else if (k9 <= 6.5 && avgScore >= 42) note = { text: `Contact matchup — K/9 ${k9.toFixed(1)} vs a lineup that makes contact (avg score ${avgScore})`, color: "#f59e0b" };

                    if (!note) return null;
                    return (
                      <div style={{ marginTop: 8, fontSize: 10, color: note.color, background: `${note.color}0f`, border: `1px solid ${note.color}28`, borderRadius: 8, padding: "6px 10px", lineHeight: 1.4 }}>
                        {note.text}
                      </div>
                    );
                  })()}
                </Card>
              );
            })()}

            {/* ── F5 Lean ── */}
            {(() => {
              const homePitcher = pitcher;
              const awayPitcher = game.awayPitcher ?? null;

              // F5 lean: both SPs' ERA as combined proxy
              const homeEra = parseFloat(homePitcher?.era);
              const awayEra = parseFloat(awayPitcher?.era ?? homePitcher?.era);
              const avgEra  = (!isNaN(homeEra) && !isNaN(awayEra)) ? (homeEra + awayEra) / 2 : null;

              const f5Lean = avgEra !== null
                ? avgEra < 3.5  ? { label: "F5 UNDER LEAN", color: "#22c55e" }
                : avgEra > 4.5  ? { label: "F5 OVER LEAN",  color: "#ef4444" }
                : { label: "F5 NEUTRAL", color: "#f59e0b" }
                : null;

              if (!f5Lean) return null;

              return (
                <Card>
                  <SLabel>F5 Lean</SLabel>
                  <div style={{ background: "#0e0f1a", borderRadius: 8, padding: "12px", textAlign: "center" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: f5Lean.color, fontFamily: "monospace", marginBottom: 6 }}>{f5Lean.label}</div>
                    {avgEra !== null && (
                      <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
                        <div style={{ fontSize: 10, color: "#6b7280" }}>
                          <span style={{ color: "#9ca3af", fontWeight: 600 }}>{game.home.abbr}</span> ERA {isNaN(homeEra) ? "—" : homeEra.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 10, color: "#6b7280" }}>
                          <span style={{ color: "#9ca3af", fontWeight: 600 }}>{game.away.abbr}</span> ERA {isNaN(awayEra) ? "—" : awayEra.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })()}

            {/* ── First Inning Tendencies ── */}
            <SLabel>First Inning Tendencies</SLabel>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <LeanBadge label={`${nrfi.lean} ${nrfi.confidence}%`} positive={nrfi.lean === "NRFI"} />
                  {nrfi.live && <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "2px 6px" }}>LIVE</span>}
                </div>
                {(() => {
                  const nrfiLogged = propLog.some(p => p.gamePk === selectedId && p.propType === "NRFI");
                  return (
                    <button
                      onClick={() => !nrfiLogged && logPick({
                        label:      `NRFI · ${game.away.abbr} @ ${game.home.abbr}`,
                        lean:       nrfi.lean,
                        confidence: nrfi.confidence,
                        propType:   "NRFI",
                      })}
                      title={nrfiLogged ? "Already logged" : "Log this pick"}
                      style={{ background: nrfiLogged ? "rgba(34,197,94,0.12)" : "rgba(167,139,250,0.1)", border: `1px solid ${nrfiLogged ? "rgba(34,197,94,0.3)" : "rgba(167,139,250,0.3)"}`, borderRadius: 6, padding: "3px 8px", fontSize: 11, color: nrfiLogged ? "#22c55e" : "#a78bfa", cursor: nrfiLogged ? "default" : "pointer", fontWeight: 700, lineHeight: 1 }}>
                      {nrfiLogged ? "✓" : "＋"}
                    </button>
                  );
                })()}
              </div>
              {(nrfi.awayFirst?.avgRuns !== undefined || nrfi.liveTendency) && (
                <div style={{ fontSize: 10, color: "#9ca3af", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 6, padding: "6px 10px", marginBottom: 10, lineHeight: 1.5 }}>
                  {nrfi.awayFirst?.avgRuns !== undefined
                    ? `📊 ${game.away.abbr} avg ${nrfi.awayFirst.avgRuns} R/1st inn · ${game.home.abbr} avg ${nrfi.homeFirst?.avgRuns ?? "—"} R/1st inn`
                    : `📊 ${nrfi.liveTendency}`}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <div style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "10px" }}>
                  <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4 }}>{game.away.abbr} 1ST INN</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb" }}>{nrfi.awayFirst.scoredPct}</div>
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>scored</div>
                  <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, lineHeight: 1.4 }}>{nrfi.awayFirst.tendency}</div>
                </div>
                <div style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "10px" }}>
                  <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4 }}>{game.home.abbr} 1ST INN</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb" }}>{nrfi.homeFirst.scoredPct}</div>
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>scored</div>
                  <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, lineHeight: 1.4 }}>{nrfi.homeFirst.tendency}</div>
                </div>
              </div>
            </Card>
          </>)}

          {/* ── LINEUP ── */}
          {tab === "lineup" && (() => {
            const lineup = game.lineups?.[lineupSide] ?? [];
            const facingPitcher = lineupSide === "away"
              ? pitcher
              : (game.awayPitcher ?? { name: "Away Starter", arsenal: [] });
            const label = lineupSide === "away"
              ? `${game.away.abbr} Lineup vs ${facingPitcher.name}`
              : `${game.home.abbr} Lineup vs ${facingPitcher.name}`;
            const lineupConfirmed = liveLineups[gamePkKey]?.confirmed === true;

            return (<>
              {/* Toggle */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {["away", "home"].map(side => (
                  <button key={side} onClick={() => { setLineupSide(side); setExpandedBatter(null); }} style={{ flex: 1, background: lineupSide === side ? "#22c55e" : "#161827", border: `1px solid ${lineupSide === side ? "#22c55e" : "#1f2437"}`, borderRadius: 8, padding: "7px", fontSize: 11, color: lineupSide === side ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
                    {side === "away" ? `${game.away.abbr} Batting` : `${game.home.abbr} Batting`}
                    {lineupConfirmed && <span style={{ marginLeft: 5, fontSize: 8, fontWeight: 700, color: lineupSide === side ? "#000" : "#22c55e", background: lineupSide === side ? "rgba(0,0,0,0.2)" : "rgba(34,197,94,0.15)", borderRadius: 3, padding: "1px 4px", verticalAlign: "middle" }}>LIVE</span>}
                  </button>
                ))}
              </div>

              <SLabel>{label}</SLabel>

              {/* Lineup vulnerability summary */}
              <Card style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Lineup Vulnerability vs {facingPitcher.name}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {facingPitcher.arsenal.map(a => {
                    const weakCount = lineup.filter(b => {
                      const avg = b.vsPitches?.[a.abbr];
                      return avg && parseFloat(avg) < 0.22;
                    }).length;
                    const strongCount = lineup.filter(b => {
                      const avg = b.vsPitches?.[a.abbr];
                      return avg && parseFloat(avg) >= 0.28;
                    }).length;
                    const color = weakCount >= 5 ? "#22c55e" : strongCount >= 5 ? "#ef4444" : "#f59e0b";
                    return (
                      <div key={a.abbr} style={{ background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 44 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: a.color }}>{a.abbr}</div>
                        <div style={{ fontSize: 9, color, marginTop: 1 }}>{weakCount >= 5 ? `${weakCount} weak` : strongCount >= 5 ? `${strongCount} handle` : "mixed"}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Batter rows */}
              <Card style={{ padding: "8px" }}>
                {lineup.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "22px 0" }}>
                    <div style={{ fontSize: 26, marginBottom: 8 }}>📋</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", marginBottom: 6 }}>Lineups Not Yet Posted</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Check back closer to first pitch.</div>
                  </div>
                ) : lineup.map((rawB, i) => {
                  const hittingLog = rawB.id ? liveHittingLog[rawB.id] : null;
                  // Merge season stats from hitting log into batter so stat boxes populate
                  const rawBEnriched = hittingLog ? {
                    ...rawB,
                    avg:     hittingLog.avg    ?? rawB.avg,
                    hr:      hittingLog.hr     ?? rawB.hr,
                    tb:      hittingLog.avgTB  ?? rawB.tb,
                    ops:     hittingLog.ops    ?? rawB.ops,
                    hitRate: hittingLog.hitRate ?? rawB.hitRate,
                    // Use gamelog hand if lineup API returned "?" — person endpoint is more reliable
                    hand:    (hittingLog.hand && hittingLog.hand !== "?") ? hittingLog.hand : rawB.hand,
                  } : rawB;
                  const b = augmentBatterWithSplits(rawBEnriched, batterSplits);
                  const sc = batterMatchupScoreForPitcher(b, facingPitcher, batterSplits);
                  const scColor = scoreColor(sc);
                  const isExpanded = expandedBatter === i;
                  const recentHits = (b.hitRate || []).reduce((a, v) => a + v, 0);
                  const seasonAvgNumRaw = parseFloat(hittingLog?.seasonAvg);
                  const last7AvgNumRaw = parseFloat(hittingLog?.last7Avg);
                  const seasonAvgNum = Number.isNaN(seasonAvgNumRaw) ? null : seasonAvgNumRaw;
                  const last7AvgNum = Number.isNaN(last7AvgNumRaw) ? null : last7AvgNumRaw;
                  const streakTone = seasonAvgNum != null && last7AvgNum != null
                    ? last7AvgNum >= seasonAvgNum + 0.035
                      ? { label: "▲ HOT", color: "#22c55e", bg: "rgba(34,197,94,0.14)", border: "rgba(34,197,94,0.35)" }
                      : last7AvgNum <= seasonAvgNum - 0.035
                        ? { label: "▼ COLD", color: "#ef4444", bg: "rgba(239,68,68,0.14)", border: "rgba(239,68,68,0.35)" }
                        : null
                    : null;

                  return (
                    <div key={i}>
                      {/* Row */}
                      <div onClick={() => { const opening = !isExpanded; setExpandedBatter(opening ? i : null); onBatterExpand(b, opening, facingPitcher?.id); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", cursor: "pointer", borderRadius: 8, background: isExpanded ? "rgba(34,197,94,0.05)" : "transparent", transition: "background 0.15s" }}>

                        {/* Order number */}
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: "#1e2030", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#6b7280", flexShrink: 0 }}>{b.order}</div>

                        {/* Name + position */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
                            {injuredIds.has(String(b.id)) && (
                              <span style={{ background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 999, padding: "1px 5px", fontSize: 8, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>⚠ IL</span>
                            )}
                            {streakTone && (
                              <span style={{ background: streakTone.bg, border: `1px solid ${streakTone.border}`, borderRadius: 999, padding: "1px 5px", fontSize: 8, fontWeight: 800, color: streakTone.color, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>{streakTone.label}</span>
                            )}
                            {(() => {
                              const OF = new Set(["LF","CF","RF"]);
                              const oop = b.primaryPos && b.pos !== b.primaryPos
                                && b.pos !== "DH" && b.primaryPos !== "DH"
                                && !(OF.has(b.pos) && OF.has(b.primaryPos));
                              return oop ? (
                                <span style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 999, padding: "1px 5px", fontSize: 8, fontWeight: 800, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>⚠ {b.pos} (norm. {b.primaryPos})</span>
                              ) : null;
                            })()}
                          </div>
                          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>{b.pos} · {b.hand}H · {b.avg}</div>
                        </div>

                        {/* Last 5 hit dots */}
                        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                          {(b.hitRate || [0,0,0,0,0]).map((h, di) => (
                            <div key={di} style={{ width: 7, height: 7, borderRadius: "50%", background: h ? "#22c55e" : "#374151" }} />
                          ))}
                        </div>

                        {/* Matchup score */}
                        <div style={{ background: `${scColor}18`, border: `1px solid ${scColor}44`, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: scColor, fontFamily: "monospace", flexShrink: 0, minWidth: 34, textAlign: "center" }}>{sc}</div>

                        {/* Expand chevron */}
                        <div style={{ color: "#374151", fontSize: 10, flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</div>
                      </div>

                      {/* Divider between rows */}
                      {i < lineup.length - 1 && !isExpanded && <div style={{ height: 1, background: "#1f2437", margin: "0 8px" }} />}

                      {/* Expanded drawer */}
                      {isExpanded && (
                        <div style={{ background: "#0e0f1a", borderRadius: 10, margin: "4px 4px 8px", padding: "12px" }}>
                          {/* Season stats */}
                          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                            <StatMini label="AVG"  value={b.avg}  color="#22c55e" />
                            <StatMini label="HR"   value={b.hr}   color="#fbbf24" />
                            <StatMini label="Avg TB" value={b.tb} color="#fbbf24" />
                            <StatMini label="L5 Hits" value={`${recentHits}/5`} color={recentHits >= 4 ? "#22c55e" : recentHits >= 2 ? "#f59e0b" : "#ef4444"} />
                          </div>

                          {/* Career H2H vs opposing pitcher */}
                          {(() => {
                            // Use facingPitcher (derived from lineupSide) — always the correct opponent
                            const opposingId = facingPitcher?.id;
                            const h2hKey = b.id && opposingId ? `${b.id}_${opposingId}` : null;
                            const h2h = h2hKey ? liveH2H[h2hKey] : null;
                            const pitcherLast = facingPitcher?.name?.split(" ").slice(-1)[0] ?? "pitcher";
                            if (!opposingId) return null;
                            if (!h2h) return (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>Career vs {pitcherLast}</span>
                                <span style={{ fontSize: 9, color: "#374151" }}>loading…</span>
                              </div>
                            );
                            if (!h2h.atBats || h2h.atBats === 0) return (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>Career vs {pitcherLast}</span>
                                <span style={{ fontSize: 9, color: "#374151" }}>No H2H history</span>
                              </div>
                            );
                            const avgNum  = parseFloat(h2h.avg) || 0;
                            const avgColor = avgNum >= 0.300 ? "#22c55e" : avgNum < 0.220 ? "#ef4444" : "#f59e0b";
                            const sampleWeak = h2h.atBats < 10;
                            return (
                              <div style={{ background: "#1a1b2e", borderRadius: 8, padding: "8px 10px", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>Career vs {pitcherLast}</span>
                                    {sampleWeak && <span style={{ fontSize: 8, color: "#4b5563", fontStyle: "italic" }}>small sample</span>}
                                  </div>
                                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    <span style={{ fontSize: 14, fontWeight: 800, color: avgColor, fontFamily: "monospace" }}>{h2h.avg || ".---"}</span>
                                    <span style={{ fontSize: 10, color: "#9ca3af" }}>{h2h.hits ?? 0}-{h2h.atBats} AB</span>
                                    <span style={{ fontSize: 10, color: "#fbbf24" }}>{h2h.homeRuns ?? 0} HR</span>
                                    <span style={{ fontSize: 10, color: "#6b7280" }}>{h2h.strikeOuts ?? 0} K</span>
                                    {h2h.obp && <span style={{ fontSize: 10, color: "#9ca3af" }}>OBP {h2h.obp}</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Batter vs L/R platoon splits */}
                          {(() => {
                            const key = `${b.id}:hitting`;
                            const sd  = liveStatSplits[key];
                            if (!sd) return null;
                            if (sd === "loading") return (
                              <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
                                {["vs LHP", "vs RHP"].map(l => (
                                  <div key={l} style={{ flex: 1, background: "#1a1b2e", borderRadius: 8, padding: "6px 9px" }}>
                                    <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{l}</div>
                                    <div style={{ fontSize: 9, color: "#4b5563" }}>loading…</div>
                                  </div>
                                ))}
                              </div>
                            );
                            const { vsL, vsR } = sd;
                            if (!vsL && !vsR) return null;
                            // Highlight the relevant side based on the facing pitcher's hand
                            const facingHand = facingPitcher?.hand ?? null; // "L" or "R"
                            return (
                              <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
                                {[["vs LHP", vsL, "L"], ["vs RHP", vsR, "R"]].map(([label, d, hand]) => {
                                  const isMatchup = facingHand === hand;
                                  const avgNum = parseFloat(d?.avg) || 0;
                                  const avgColor = avgNum >= 0.280 ? "#22c55e" : avgNum >= 0.230 ? "#f59e0b" : "#ef4444";
                                  return (
                                    <div key={label} style={{ flex: 1, background: isMatchup ? "rgba(56,189,248,0.06)" : "#1a1b2e", borderRadius: 8, padding: "6px 9px", border: isMatchup ? "1px solid rgba(56,189,248,0.25)" : "1px solid transparent" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                                        <div style={{ fontSize: 8, color: isMatchup ? "#38bdf8" : "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: isMatchup ? 700 : 400 }}>{label}</div>
                                        {isMatchup && <div style={{ fontSize: 7, color: "#38bdf8", fontWeight: 800 }}>TODAY</div>}
                                      </div>
                                      {d ? (<>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: avgColor, fontFamily: "monospace" }}>{d.avg}</div>
                                        <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>OBP {d.obp} · SLG {d.slg}</div>
                                        {d.ab > 0 && <div style={{ fontSize: 7, color: "#4b5563", marginTop: 1 }}>{d.ab} AB</div>}
                                      </>) : <div style={{ fontSize: 9, color: "#4b5563" }}>—</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* Batter day / night splits */}
                          {(() => {
                            const key = `${b.id}:hitting`;
                            const sd  = liveStatSplits[key];
                            if (!sd || sd === "loading") return null;
                            const { day, night } = sd;
                            if (!day && !night) return null;
                            const isDayGame = (() => {
                              if (!game?.time) return null;
                              const m = game.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
                              if (!m) return null;
                              let h = parseInt(m[1], 10);
                              const isPM = m[3].toUpperCase() === "PM";
                              if (isPM && h !== 12) h += 12;
                              if (!isPM && h === 12) h = 0;
                              return h < 17;
                            })();
                            return (
                              <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
                                {[["Day", day, true], ["Night", night, false]].map(([label, d, isDay]) => {
                                  const isToday = isDayGame === true ? isDay : isDayGame === false ? !isDay : false;
                                  const avgNum = parseFloat(d?.avg) || 0;
                                  const avgColor = avgNum >= 0.280 ? "#22c55e" : avgNum >= 0.230 ? "#f59e0b" : "#ef4444";
                                  return (
                                    <div key={label} style={{ flex: 1, background: isToday ? "rgba(56,189,248,0.06)" : "#1a1b2e", borderRadius: 8, padding: "6px 9px", border: isToday ? "1px solid rgba(56,189,248,0.25)" : "1px solid transparent" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                                        <div style={{ fontSize: 8, color: isToday ? "#38bdf8" : "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: isToday ? 700 : 400 }}>{label}</div>
                                        {isToday && <div style={{ fontSize: 7, color: "#38bdf8", fontWeight: 800 }}>TODAY</div>}
                                      </div>
                                      {d ? (<>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: avgColor, fontFamily: "monospace" }}>{d.avg}</div>
                                        <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>OBP {d.obp} · SLG {d.slg}</div>
                                        {d.ab > 0 && <div style={{ fontSize: 7, color: "#4b5563", marginTop: 1 }}>{d.ab} AB</div>}
                                      </>) : <div style={{ fontSize: 9, color: "#4b5563" }}>—</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* Batter home / away splits */}
                          {(() => {
                            const key = `${b.id}:hitting`;
                            const sd  = liveStatSplits[key];
                            if (!sd || sd === "loading") return null;
                            const { home, away } = sd;
                            if (!home && !away) return null;
                            // lineupSide tells us which team's batters we're viewing
                            // "away" side → batter is the visiting team → playing AWAY today
                            const todaySide = lineupSide === "home" ? "home" : "away";
                            return (
                              <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
                                {[["Home", home, "home"], ["Away", away, "away"]].map(([label, d, side]) => {
                                  const isToday = todaySide === side;
                                  const avgNum = parseFloat(d?.avg) || 0;
                                  const avgColor = avgNum >= 0.280 ? "#22c55e" : avgNum >= 0.230 ? "#f59e0b" : "#ef4444";
                                  return (
                                    <div key={label} style={{ flex: 1, background: isToday ? "rgba(56,189,248,0.06)" : "#1a1b2e", borderRadius: 8, padding: "6px 9px", border: isToday ? "1px solid rgba(56,189,248,0.25)" : "1px solid transparent" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                                        <div style={{ fontSize: 8, color: isToday ? "#38bdf8" : "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: isToday ? 700 : 400 }}>{label}</div>
                                        {isToday && <div style={{ fontSize: 7, color: "#38bdf8", fontWeight: 800 }}>TODAY</div>}
                                      </div>
                                      {d ? (<>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: avgColor, fontFamily: "monospace" }}>{d.avg}</div>
                                        <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>OBP {d.obp} · SLG {d.slg}</div>
                                        {d.ab > 0 && <div style={{ fontSize: 7, color: "#4b5563", marginTop: 1 }}>{d.ab} AB</div>}
                                      </>) : <div style={{ fontSize: 9, color: "#4b5563" }}>—</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* vs pitcher arsenal */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <span style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>vs {facingPitcher.name}'s Pitches</span>
                            {b.splitsLive && <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.12)", borderRadius: 4, padding: "1px 5px" }}>SAVANT</span>}
                            {!b.splitsLive && b.id && !IS_SAVANT_SANDBOX && <span style={{ fontSize: 8, color: "#6b7280" }}>loading…</span>}
                          </div>
                          {facingPitcher.arsenal.map(a => {
                            const p = b.vsPitches?.[a.abbr];
                            if (!p) return null;
                            const avg    = parseFloat(typeof p === "object" ? p.avg   : p) || 0;
                            const whiff  = parseFloat(typeof p === "object" ? p.whiff : "20") || 20;
                            const slg    = parseFloat(typeof p === "object" ? p.slg   : String(avg * 1.6)) || avg * 1.6;
                            const note   = typeof p === "object" ? p.note : null;
                            const color  = avg >= 0.28 ? "#22c55e" : avg < 0.22 ? "#ef4444" : "#f59e0b";
                            const wColor = whiff >= 30 ? "#ef4444" : whiff >= 22 ? "#f59e0b" : "#22c55e";
                            const sColor = slg >= 0.45 ? "#22c55e" : slg < 0.32 ? "#ef4444" : "#f59e0b";
                            const pctWidth = Math.min((avg / 0.400) * 100, 100);
                            return (
                              <div key={a.abbr} style={{ marginBottom: 10 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: a.color, background: `${a.color}22`, borderRadius: 3, padding: "1px 5px" }}>{a.abbr}</span>
                                    <span style={{ fontSize: 10, color: "#9ca3af" }}>{a.type} · {a.pct}%</span>
                                  </div>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <span style={{ fontSize: 10, color: wColor, fontFamily: "monospace" }}>{Math.round(whiff)}% K</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "monospace" }}>{typeof p === "object" ? p.avg : p}</span>
                                    {typeof p === "object" && <span style={{ fontSize: 10, color: sColor, fontFamily: "monospace" }}>SLG {p.slg}</span>}
                                  </div>
                                </div>
                                <div style={{ background: "#1e2030", borderRadius: 3, height: 5, marginBottom: note ? 4 : 0 }}>
                                  <div style={{ width: `${pctWidth}%`, height: "100%", background: color, borderRadius: 3 }} />
                                </div>
                                {note && (
                                  <div style={{ fontSize: 9, color: "#6b7280", fontStyle: "italic", marginTop: 2 }}>{note}</div>
                                )}
                              </div>
                            );
                          })}

                          {/* Lean summary */}
                          <div style={{ marginTop: 10, borderLeft: `3px solid ${scColor}`, background: `${scColor}08`, borderRadius: "0 6px 6px 0", padding: "8px 10px", fontSize: 11, color: "#d1d5db", lineHeight: 1.5 }}>
                            <strong style={{ color: "#f9fafb" }}>Matchup Score ({sc}/100):</strong>{" "}
                            {sc >= 55 ? `${b.name} handles this arsenal — hit & TB props have upside.` : sc < 35 ? `${b.name} is vulnerable here — pitcher-friendly matchup, K prop boosted.` : `Mixed matchup for ${b.name} — no strong lean.`}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Card>

              {/* Score legend */}

              <Card>
                <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Matchup Score Legend · AVG + Whiff + SLG + Handedness</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[["< 35", "#22c55e", "Pitcher Edge"], ["35–54", "#f59e0b", "Neutral"], ["55+", "#ef4444", "Batter Edge"]].map(([range, color, label]) => (
                    <div key={range} style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "8px", textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color }}>{range}</div>
                      <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </>);
          })()}

          {/* ── ARSENAL ── */}
          {tab === "arsenal" && (() => {
            const arsPitcher = arsenalSide === "home" ? pitcher : (game.awayPitcher ?? pitcher);
            const facingTeam = arsenalSide === "home" ? game.away.abbr : game.home.abbr;
            return (<>
            {/* Side toggle */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[["away", game.away.abbr], ["home", game.home.abbr]].map(([side, abbr]) => (
                <button key={side} onClick={() => setArsenalSide(side)}
                  style={{ flex: 1, background: arsenalSide === side ? "#22c55e" : "#161827", border: `1px solid ${arsenalSide === side ? "#22c55e" : "#1f2437"}`, borderRadius: 8, padding: "7px", fontSize: 10, color: arsenalSide === side ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
                  {abbr} SP
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase" }}>— {arsPitcher.name}'s Arsenal vs {facingTeam} Lineup</div>
              {arsPitcher.arsenalLive
                ? <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 5px #22c55e" }} /><span style={{ fontSize: 9, color: "#22c55e", fontFamily: "monospace" }}>SAVANT LIVE</span></div>
                : <div style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>{!IS_SAVANT_SANDBOX && arsPitcher.id ? "Fetching…" : "DEMO"}</div>
              }
            </div>
            {arsPitcher.arsenal.length === 0 && (
              <Card style={{ textAlign: "center", padding: "24px 14px" }}>
                <div style={{ fontSize: 20, marginBottom: 10 }}>⏳</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", marginBottom: 6 }}>Fetching Arsenal…</div>
                <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.6 }}>Loading pitch mix from Baseball Savant. Requires backend to be running.</div>
              </Card>
            )}
            {arsPitcher.arsenal.map(a => {
              const rawVs = activeBatterVsPitches?.[a.abbr];
              const vs = normalizePitchMatchup(a.abbr, rawVs);
              if (!vs) return null;
              const color = vs.good === true ? "#22c55e" : vs.good === false ? "#ef4444" : "#f59e0b";
              const heavy = a.pct >= 25;
              return (
                <Card key={a.abbr} style={heavy ? { borderColor: `${color}44` } : {}}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${a.color}22`, border: `1px solid ${a.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: a.color, flexShrink: 0 }}>{a.abbr}</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb" }}>{a.type}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 9, color: "#6b7280" }}>
                            {a.velo ? `${a.velo} mph · ` : ""}{a.pct}% usage
                            {a.whiffPct != null ? ` · ${a.whiffPct}% whiff` : ""}
                          </span>
                          {(() => {
                            const cur = parseFloat(a.velo);
                            const prv = parseFloat(a.prevVelo);
                            if (!a.prevVelo || isNaN(cur) || isNaN(prv)) return null;
                            const delta = cur - prv;
                            if (Math.abs(delta) < 0.4) return null;
                            const up = delta > 0;
                            const big = Math.abs(delta) >= 1.5;
                            const clr = up ? "#22c55e" : big ? "#ef4444" : "#f59e0b";
                            return (
                              <span style={{ fontSize: 8, fontWeight: 700, color: clr, background: `${clr}18`, border: `1px solid ${clr}44`, borderRadius: 4, padding: "1px 4px", whiteSpace: "nowrap" }}>
                                {up ? "▲" : "▼"} {up ? "+" : ""}{delta.toFixed(1)} mph YoY
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    <LeanBadge label={vs.good === true ? "HANDLES" : vs.good === false ? "WEAK SPOT" : "NEUTRAL"} positive={vs.good} small />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ background: "#1e2030", borderRadius: 3, height: 5 }}>
                      <div style={{ width: `${a.pct * 2}%`, height: "100%", background: a.color, borderRadius: 3, opacity: 0.8 }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <div style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "8px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color }}>{vs.avg}</div>
                      <div style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>BATTER AVG</div>
                    </div>
                    <div style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "8px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: parseFloat(vs.whiff) >= 30 ? "#ef4444" : "#e5e7eb" }}>{vs.whiff}</div>
                      <div style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>BATTER WHIFF</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{vs.note}</div>
                  {heavy && vs.good === false && <div style={{ marginTop: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "7px 10px", fontSize: 10, color: "#fca5a5" }}>⚠ Heavy usage ({a.pct}%) + weak spot = significant risk</div>}
                  {heavy && vs.good === true  && <div style={{ marginTop: 8, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "7px 10px", fontSize: 10, color: "#86efac" }}>✓ Heavy usage ({a.pct}%) + handles well = prop multiplier</div>}
                </Card>
              );
            })}
          </>);
          })()}

          {/* ── INTEL ── */}
          {tab === "intel" && (<>

            {/* Weather */}
            <SLabel>Weather · {game.stadium}</SLabel>
            <Card>
              {weatherLoading && !liveWeather[selectedId] ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                  <div style={{ width: 20, height: 20, border: "2px solid #1f2437", borderTop: "2px solid #22c55e", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Fetching live weather…</span>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 34, fontWeight: 800, color: "#f9fafb", lineHeight: 1 }}>
                        {weather.roof ? "DOME" : `${weather.temp}°F`}
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>{weather.condition}</div>
                      {weather.roof
                        ? null
                        : weather.live
                          ? <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 5px #22c55e" }} />
                              <span style={{ fontSize: 9, color: "#22c55e", fontFamily: "monospace" }}>LIVE · {weather.fetchedAt}</span>
                            </div>
                          : <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
                              <span style={{ fontSize: 9, color: "#f59e0b", fontFamily: "monospace" }}>DEMO · live when deployed</span>
                            </div>
                      }
                    </div>
                    <LeanBadge label={weather.hrFavorable ? "HR WEATHER" : weather.roof ? "DOME" : "WIND IN"} positive={weather.hrFavorable} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: weather.rainChance ? 8 : 0 }}>
                    {[
                      { label: "Wind",      value: weather.wind ?? "N/A",       color: weather.hrFavorable ? "#fbbf24" : "#e5e7eb" },
                      { label: "Humidity",  value: weather.humidity ?? "N/A",    color: "#e5e7eb" },
                      { label: "Roof",      value: weather.roof ? "Dome" : "Open Air", color: "#e5e7eb" },
                      { label: "Temp",      value: weather.roof ? "Climate Ctrl" : `${weather.temp}°F`, color: "#22c55e" },
                    ].map(w => (
                      <div key={w.label} style={{ background: "#1e2030", borderRadius: 8, padding: "9px 12px" }}>
                        <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{w.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: w.color }}>{w.value}</div>
                      </div>
                    ))}
                  </div>
                  {weather.rainChance && weather.rainChance !== "N/A" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <div style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "9px 12px" }}>
                        <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Rain Chance</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: parseInt(weather.rainChance) > 40 ? "#ef4444" : "#22c55e" }}>{weather.rainChance}</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* Park Factors */}
            <SLabel>Park Factors · {game.stadium || game.home.abbr}</SLabel>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb" }}>{game.home.abbr} · {parkFactor.label}</div>
                <LeanBadge
                  label={parkFactor.hr >= 1.08 ? "HITTER PARK" : parkFactor.hr <= 0.93 ? "PITCHER PARK" : "NEUTRAL"}
                  positive={parkFactor.hr >= 1.08 ? true : parkFactor.hr <= 0.93 ? false : null}
                  small
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {[
                  { label: "HR Factor", value: `${parkFactor.hr}x`, color: parkFactor.hr >= 1.10 ? "#fbbf24" : parkFactor.hr <= 0.90 ? "#22c55e" : "#e5e7eb" },
                  { label: "Hit Factor", value: `${parkFactor.hit}x`, color: parkFactor.hit >= 1.05 ? "#fbbf24" : parkFactor.hit <= 0.97 ? "#22c55e" : "#e5e7eb" },
                  { label: "K Factor",   value: `${parkFactor.k}x`,  color: parkFactor.k >= 1.02 ? "#22c55e" : parkFactor.k <= 0.96 ? "#fbbf24" : "#e5e7eb" },
                ].map(f => (
                  <div key={f.label} style={{ background: "#1e2030", borderRadius: 8, padding: "9px 10px" }}>
                    <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{f.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: f.color }}>{f.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 9, color: "#4b5563", marginTop: 8, lineHeight: 1.5 }}>
                Multi-year FanGraphs avg · &gt;1.0 = hitter-friendly · affects Hit, TB &amp; NRFI props
              </div>
            </Card>

            {/* Umpire */}
            <SLabel>Home Plate Umpire</SLabel>
            <Card>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb" }}>{umpire.name}</div>
                    {umpire.scorecards && (
                      <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "2px 5px", fontFamily: "monospace" }}>SCORECARD LIVE</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                    {umpire.tendency ?? (umpire.scorecards ? "UmpScorecards data loaded" : "Awaiting assignment")}
                  </div>
                </div>
                {/* Badge: derive from real accuracy data when available */}
                {(() => {
                  const sc = umpire.scorecards;
                  if (sc) {
                    const ace = sc.accuracyAboveExpected ?? 0;
                    if (ace >= 0.5)  return <LeanBadge label="ACCURATE"     positive={true}  small />;
                    if (ace <= -1.0) return <LeanBadge label="INCONSISTENT" positive={false} small />;
                  }
                  return <LeanBadge label={umpire.rating === "pitcher" ? "PITCHER UMP" : "NEUTRAL UMP"} positive={umpire.rating === "pitcher" ? false : null} small />;
                })()}
              </div>

              {/* Stats — real scorecards data preferred, static kRate/bbRate as fallback */}
              {umpire.scorecards ? (() => {
                const sc = umpire.scorecards;
                return (
                  <div style={{ display: "flex", gap: 5 }}>
                    <StatMini
                      label="Accuracy"
                      value={sc.overallAccuracy != null ? `${sc.overallAccuracy.toFixed(1)}%` : "—"}
                      color={sc.overallAccuracy >= 93.5 ? "#22c55e" : sc.overallAccuracy < 91.5 ? "#f59e0b" : "#e5e7eb"}
                    />
                    <StatMini
                      label="vs Exp"
                      value={sc.accuracyAboveExpected != null ? `${sc.accuracyAboveExpected >= 0 ? "+" : ""}${sc.accuracyAboveExpected.toFixed(2)}%` : "—"}
                      color={sc.accuracyAboveExpected >= 0 ? "#22c55e" : "#f59e0b"}
                    />
                    <StatMini
                      label="Consist."
                      value={sc.consistency != null ? `${sc.consistency.toFixed(1)}%` : "—"}
                      color={sc.consistency >= 93 ? "#22c55e" : "#e5e7eb"}
                    />
                    <StatMini
                      label="Favor/Gm"
                      value={sc.averageAbsoluteFavor != null ? sc.averageAbsoluteFavor.toFixed(2) : "—"}
                      color={sc.averageAbsoluteFavor > 0.5 ? "#f59e0b" : "#e5e7eb"}
                    />
                  </div>
                );
              })() : (
                <div style={{ display: "flex", gap: 6 }}>
                  <StatMini label="K Rate"  value={umpire.kRate}  color={parseFloat(umpire.kRate)  > 21 ? "#22c55e" : "#e5e7eb"} />
                  <StatMini label="BB Rate" value={umpire.bbRate} color={parseFloat(umpire.bbRate) > 9  ? "#ef4444" : "#e5e7eb"} />
                </div>
              )}
            </Card>

            {/* Odds & Line Movement */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase" }}>— Odds &amp; Line Movement</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {odds.live
                  ? <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 5px #22c55e" }} />
                      <span style={{ fontSize: 9, color: "#22c55e", fontFamily: "monospace" }}>LIVE · {odds.book}</span>
                    </div>
                  : (() => {
                      const gs = game.status ?? "";
                      const isGameLive = gs === "In Progress" || gs === "Warmup" || gs === "Final" || gs === "Game Over";
                      return isGameLive
                        ? <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6b7280" }} />
                            <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>PRE-GAME LINES</span>
                          </div>
                        : <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
                            <span style={{ fontSize: 9, color: "#f59e0b", fontFamily: "monospace" }}>DEMO · live when deployed</span>
                          </div>;
                    })()
                }
                {!IS_ODDS_SANDBOX && (
                  <button
                    onClick={refreshOdds}
                    disabled={oddsLoading}
                    style={{ background: "#1e2030", border: "1px solid #2d3748", borderRadius: 6, padding: "3px 8px", fontSize: 10, color: oddsLoading ? "#374151" : "#9ca3af", cursor: oddsLoading ? "default" : "pointer", fontFamily: "monospace" }}
                  >
                    {oddsLoading ? "…" : "↺"}
                  </button>
                )}
              </div>
            </div>
            <Card>
              {/* Multi-book comparison table — shows when live odds have book data */}
              {odds.live && odds.books && Object.keys(odds.books).length > 0 ? (() => {
                const bookEntries = Object.entries(odds.books);
                const mlColor = (v) => !v ? "#4b5563" : v.startsWith("+") ? "#22c55e" : "#e5e7eb";
                return (
                  <>
                    {/* Header row */}
                    <div style={{ display: "grid", gridTemplateColumns: "36px repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
                      {["", `${game.away.abbr} ML`, `${game.home.abbr} ML`, "Total", "O Odds", "U Odds", `${game.away.abbr} RL`, `${game.home.abbr} RL`].map((h, i) => (
                        <div key={i} style={{ fontSize: 7, color: "#6b7280", textTransform: "uppercase", textAlign: "center", letterSpacing: "0.04em" }}>{h}</div>
                      ))}
                    </div>
                    {/* Book rows */}
                    {bookEntries.map(([label, b]) => (
                      <div key={label} style={{ display: "grid", gridTemplateColumns: "36px repeat(7, 1fr)", gap: 2, marginBottom: 3, background: "#1a1f2e", borderRadius: 6, padding: "5px 4px", alignItems: "center" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b", textAlign: "center", fontFamily: "monospace" }}>{label}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: mlColor(b.awayML), textAlign: "center", fontFamily: "monospace" }}>{b.awayML ?? "—"}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: mlColor(b.homeML), textAlign: "center", fontFamily: "monospace" }}>{b.homeML ?? "—"}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#f9fafb", textAlign: "center", fontFamily: "monospace" }}>{b.total ?? "—"}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>{b.overOdds ?? "—"}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>{b.underOdds ?? "—"}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>
                          {b.awaySpread && b.awaySpreadOdds ? <><span style={{ color: "#e5e7eb" }}>{b.awaySpread}</span><span style={{ fontSize: 8 }}> ({b.awaySpreadOdds})</span></> : "—"}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>
                          {b.homeSpread && b.homeSpreadOdds ? <><span style={{ color: "#e5e7eb" }}>{b.homeSpread}</span><span style={{ fontSize: 8 }}> ({b.homeSpreadOdds})</span></> : "—"}
                        </div>
                      </div>
                    ))}
                  </>
                );
              })() : (
                <>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <StatMini label={`${game.away.abbr} ML`} value={odds.awayML} color={odds.awayML.startsWith("+") ? "#22c55e" : "#e5e7eb"} />
                    <StatMini label={`${game.home.abbr} ML`} value={odds.homeML} color={odds.homeML.startsWith("-") ? "#ef4444" : "#e5e7eb"} />
                    <StatMini label="Total" value={odds.total} color="#f9fafb" />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <StatMini label="Over Odds" value={odds.overOdds} />
                    <StatMini label="Under Odds" value={odds.underOdds} />
                  </div>
                  {(odds.awaySpread || odds.homeSpread) && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                      <StatMini label={`${game.away.abbr} RL`} value={odds.awaySpread ? `${odds.awaySpread} (${odds.awaySpreadOdds})` : "—"} color="#9ca3af" />
                      <StatMini label={`${game.home.abbr} RL`} value={odds.homeSpread ? `${odds.homeSpread} (${odds.homeSpreadOdds})` : "—"} color="#9ca3af" />
                    </div>
                  )}
                </>
              )}
              {/* Line movement — always shown */}
              <div style={{ borderLeft: `3px solid ${odds.lineMove === "over" ? "#f59e0b" : odds.lineMove === "under" ? "#38bdf8" : "#6b7280"}`, background: odds.lineMove === "over" ? "rgba(245,158,11,0.05)" : odds.lineMove === "under" ? "rgba(56,189,248,0.05)" : "rgba(107,114,128,0.05)", borderRadius: "0 8px 8px 0", padding: "10px 12px", fontSize: 12, color: "#d1d5db", lineHeight: 1.5, marginTop: 10 }}>
                <strong style={{ color: "#f9fafb" }}>Movement:</strong> {odds.movement}
              </div>
              {oddsApiInfo && (
                <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                  <div style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase" }}>API Calls Left</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: parseInt(oddsApiInfo.remaining) < 50 ? "#ef4444" : "#22c55e", fontFamily: "monospace" }}>{oddsApiInfo.remaining ?? "—"}</span>
                  </div>
                  <div style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase" }}>Updated</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", fontFamily: "monospace" }}>{oddsApiInfo.fetchedAt ?? "—"}</span>
                  </div>
                </div>
              )}
            </Card>

            {/* AI Trends Summary */}
            {(() => {
              const key = String(selectedId);
              const trendsState = liveTrends[key];
              const isLoading = trendsState === "loading";
              const summary = typeof trendsState === "string" && trendsState !== "loading" ? trendsState : null;
              if (!isLoading && !summary) return null;
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <SLabel style={{ marginBottom: 0 }}>AI Trends</SLabel>
                    <span style={{ fontSize: 8, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 4, padding: "2px 6px" }}>AI</span>
                  </div>
                  <Card>
                    {isLoading ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa", animation: "pulse 1.2s ease-in-out infinite" }} />
                        <span style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>Generating trend summary…</span>
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.7, margin: 0 }}>{summary}</p>
                    )}
                  </Card>
                </>
              );
            })()}
          </>)}

          {/* ── PROPS ── */}
          {tab === "props" && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <SLabel style={{ marginBottom: 0 }}>Prop Confidence Meters</SLabel>
              {liveProps.length > 0
                ? <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "2px 6px" }}>LIVE</span>
                : <span style={{ fontSize: 8, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, padding: "2px 6px" }}>DEMO</span>
              }
            </div>
            {displayProps.length === 0 ? (
              <Card>
                <div style={{ textAlign: "center", padding: "18px 0" }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>⏳</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", marginBottom: 6 }}>Loading Prop Data…</div>
                  <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>
                    Waiting for pitcher stats to load.<br />
                    <span style={{ color: "#4b5563" }}>Check Arsenal tab — Savant data loads independently.</span>
                  </div>
                </div>
              </Card>
            ) : (<>
              {/* ── Parlay slip (appears when 2+ props selected) ── */}
              {parlayLabels.length >= 1 && (() => {
                const legs = displayProps.filter(p => parlayLabels.includes(p.label));
                const n = legs.length;
                // Combined probability with correlation discount (0.92 per added leg)
                const raw = legs.reduce((acc, p) => acc * (p.confidence / 100), 1);
                const combined = Math.round(raw * Math.pow(0.92, n - 1) * 100);
                const allOver  = legs.every(p => p.lean === "OVER");
                const allUnder = legs.every(p => p.lean === "UNDER");
                const combinedLean = allOver ? "ALL OVER" : allUnder ? "ALL UNDER" : "MIXED";
                const combinedPositive = allOver ? true : allUnder ? false : null;
                const gameLabel = `${game.away.abbr} @ ${game.home.abbr}`;
                return (
                  <Card style={{ borderColor: "rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.04)", marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24" }}>🔗 Parlay</span>
                        <span style={{ fontSize: 9, color: "#6b7280" }}>{n} leg{n !== 1 ? "s" : ""} · {n < 2 ? "select 1 more" : `${combined}% combined`}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {n >= 2 && <LeanBadge label={combinedLean} positive={combinedPositive} small />}
                        <button onClick={() => { setParlayLabels([]); setParlaySlipCopied(false); }}
                          style={{ fontSize: 9, color: "#4b5563", background: "none", border: "none", cursor: "pointer" }}>clear</button>
                      </div>
                    </div>

                    {/* Legs */}
                    {legs.map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: "#fbbf24", fontWeight: 700, width: 14, flexShrink: 0 }}>{i + 1}.</div>
                        <div style={{ fontSize: 10, color: "#e5e7eb", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</div>
                        <LeanBadge label={p.lean} positive={p.positive} small />
                        <span style={{ fontSize: 9, color: "#6b7280", flexShrink: 0 }}>{p.confidence}%</span>
                      </div>
                    ))}

                    {/* Combined confidence bar + copy */}
                    {n >= 2 && (
                      <>
                        <div style={{ height: 1, background: "rgba(251,191,36,0.15)", margin: "8px 0" }} />
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div style={{ flex: 1, height: 5, background: "#1e2030", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${combined}%`, height: "100%", background: combined >= 40 ? "#fbbf24" : "#6b7280", borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24", fontFamily: "monospace", flexShrink: 0 }}>{combined}%</span>
                        </div>
                        <button
                          onClick={() => {
                            const legLines = legs.map((p, i) => `  ${i + 1}. ${p.label} — ${p.lean} (${p.confidence}%)`).join("\n");
                            const text = `🔗 ${n}-Leg Parlay · ${combined}% confidence\n${legLines}\n${gameLabel}`;
                            navigator.clipboard.writeText(text).then(() => {
                              setParlaySlipCopied(true);
                              setTimeout(() => setParlaySlipCopied(false), 2000);
                            }).catch(() => {});
                          }}
                          style={{ width: "100%", background: parlaySlipCopied ? "rgba(34,197,94,0.12)" : "rgba(251,191,36,0.1)", border: `1px solid ${parlaySlipCopied ? "rgba(34,197,94,0.35)" : "rgba(251,191,36,0.3)"}`, borderRadius: 8, padding: "7px", fontSize: 10, fontWeight: 700, color: parlaySlipCopied ? "#22c55e" : "#fbbf24", cursor: "pointer", fontFamily: "monospace" }}>
                          {parlaySlipCopied ? "✓ Copied!" : "⎘ Copy Parlay Slip"}
                        </button>
                      </>
                    )}
                  </Card>
                );
              })()}

              {/* Prop cards */}
              {displayProps.map((p, i) => {
                const logged = isLogged(p);
                const inParlay = parlayLabels.includes(p.label);
                const parlayFull = parlayLabels.length >= 3 && !inParlay;
                return (
                  <Card key={i} style={inParlay ? { borderColor: "rgba(251,191,36,0.4)" } : {}}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", flex: 1, paddingRight: 8, lineHeight: 1.4 }}>{p.label}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        <LeanBadge label={p.lean} positive={p.positive} small />
                        {/* Parlay toggle */}
                        <button
                          onClick={() => {
                            if (parlayFull) return;
                            setParlayLabels(prev => inParlay ? prev.filter(l => l !== p.label) : [...prev, p.label]);
                          }}
                          title={parlayFull ? "Max 3 legs" : inParlay ? "Remove from parlay" : "Add to parlay"}
                          style={{ fontSize: 10, fontWeight: 700, background: inParlay ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${inParlay ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "3px 6px", cursor: parlayFull ? "default" : "pointer", color: inParlay ? "#fbbf24" : "#4b5563", opacity: parlayFull ? 0.35 : 1, lineHeight: 1 }}>
                          🔗
                        </button>
                        {/* Log pick */}
                        <button
                          onClick={() => !logged && logPick(p)}
                          title={logged ? "Already logged" : "Log this pick"}
                          style={{ fontSize: 13, background: logged ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${logged ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "3px 7px", cursor: logged ? "default" : "pointer", color: logged ? "#22c55e" : "#6b7280", transition: "all 0.15s", lineHeight: 1 }}>
                          {logged ? "✓" : "＋"}
                        </button>
                      </div>
                    </div>
                    <ConfBar pct={p.confidence} positive={p.positive} />
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8, lineHeight: 1.4 }}>{p.reason}</div>
                  </Card>
                );
              })}

              {/* ── SPORTSBOOK LINES section ─────────────────── */}
              {!IS_ODDS_SANDBOX && !IS_STATS_SANDBOX && (() => {
                const spKey   = String(selectedId);
                const spState = livePlayerProps[spKey];
                if (spState === undefined) return null;

                const allProps  = Array.isArray(spState?.props) ? spState.props : [];
                const hasError  = spState?.error === true;
                const hasData   = allProps.length > 0;
                const propReason = spState?.reason ?? null; // "ok" | "no_props" | "no_event" | null

                const BOOKS      = ["DK", "FD", "CZR", "MGM"];
                const BOOK_COLORS = { DK: "#38bdf8", FD: "#34d399", CZR: "#fb923c", MGM: "#a78bfa" };

                const grouped = {
                  pitcher_strikeouts: allProps.filter(p => p.market === "pitcher_strikeouts"),
                  batter_home_runs:   allProps.filter(p => p.market === "batter_home_runs"),
                  batter_total_bases: allProps.filter(p => p.market === "batter_total_bases"),
                  batter_hits:        allProps.filter(p => p.market === "batter_hits"),
                };

                const fmtO = (s) => s ?? "—";

                return (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, marginBottom: 8 }}>
                      <SLabel style={{ marginBottom: 0 }}>Sportsbook Lines</SLabel>
                      {hasData && <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "2px 6px" }}>LIVE</span>}
                      {hasData && (
                        <span style={{ fontSize: 8, color: "#4b5563", fontStyle: "italic" }}>tap row to expand</span>
                      )}
                    </div>

                    {spState === "loading" ? (
                      <Card>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", flexShrink: 0, animation: "pulse 1.5s ease-in-out infinite" }} />
                          <span style={{ fontSize: 12, color: "#6b7280" }}>Fetching sportsbook lines…</span>
                        </div>
                      </Card>
                    ) : !hasData ? (
                      <Card>
                        <div style={{ textAlign: "center", padding: "8px 0" }}>
                          <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 8 }}>
                            {hasError
                              ? "Could not load lines — Odds API unavailable"
                              : propReason === "no_event"
                                ? "This game wasn't found in the Odds API — may be too early or not yet listed"
                                : "No player prop lines posted yet — books typically post 1–2 hrs before game time"}
                          </div>
                          <button
                            onClick={() => {
                              const k = String(selectedId);
                              const game = activeSlate.find(g => (g.gamePk ?? g.id) === selectedId);
                              if (!game) return;
                              // Bust both client-side cache and in-flight guard, then re-fetch
                              const ck = String(game.gamePk ?? `${game.away.name}|${game.home.name}`);
                              delete playerPropsCache[ck];
                              playerPropsFetched.current.delete(k);
                              setLivePlayerProps(prev => ({ ...prev, [k]: "loading" }));
                              fetchPlayerPropsDirect(game.away.name, game.home.name, game.gamePk)
                                .then(result => {
                                  const normalized = result?.props ? result : { props: result ?? [], reason: "ok" };
                                  setLivePlayerProps(prev => ({ ...prev, [k]: normalized }));
                                })
                                .catch(() => {
                                  setLivePlayerProps(prev => ({ ...prev, [k]: { props: [], error: true } }));
                                });
                            }}
                            style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}
                          >
                            ↻ Refresh
                          </button>
                        </div>
                      </Card>
                    ) : (
                      <>
                        {[
                          { mKey: "pitcher_strikeouts", label: "Strikeouts",  badge: "K",  color: "#a78bfa" },
                          { mKey: "batter_home_runs",   label: "Home Runs",   badge: "HR", color: "#fbbf24" },
                          { mKey: "batter_total_bases", label: "Total Bases", badge: "TB", color: "#60a5fa" },
                          { mKey: "batter_hits",        label: "Hits",        badge: "H",  color: "#34d399" },
                        ].map(({ mKey, label, badge, color }) => {
                          const rows = grouped[mKey];
                          if (!rows?.length) return null;

                          // Which books have at least one line in this market group?
                          const activeBooks = BOOKS.filter(bk => rows.some(p => p.books?.[bk]));

                          return (
                            <Card key={mKey} style={{ padding: "0", marginBottom: 10, overflow: "hidden" }}>
                              {/* Market header */}
                              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px 6px", borderBottom: "1px solid #1f2437" }}>
                                <span style={{ fontSize: 8, fontWeight: 700, color, background: `${color}1a`, border: `1px solid ${color}40`, borderRadius: 4, padding: "1px 5px" }}>{badge}</span>
                                <span style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>{label}</span>
                                {/* Active book legend for this market */}
                                <div style={{ display: "flex", gap: 3 }}>
                                  {activeBooks.map(bk => (
                                    <span key={bk} style={{ fontSize: 7, fontWeight: 700, color: BOOK_COLORS[bk], background: `${BOOK_COLORS[bk]}18`, border: `1px solid ${BOOK_COLORS[bk]}40`, borderRadius: 3, padding: "1px 4px" }}>{bk}</span>
                                  ))}
                                </div>
                              </div>

                              {/* Column header row */}
                              <div style={{ display: "grid", gridTemplateColumns: `1fr ${activeBooks.map(() => "52px").join(" ")}`, gap: 0, padding: "4px 10px", background: "#0e0f1a" }}>
                                <div style={{ fontSize: 7, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.05em" }}>Player</div>
                                {activeBooks.map(bk => (
                                  <div key={bk} style={{ fontSize: 7, fontWeight: 700, color: BOOK_COLORS[bk], textAlign: "center" }}>{bk}</div>
                                ))}
                              </div>

                              {/* Player rows */}
                              {rows.map((p, i) => {
                                const books          = p.books ?? {};
                                const rowKey         = `${mKey}:${p.player}`;
                                const isExpanded     = expandedPropRow === rowKey;
                                const lastName       = p.player.split(" ").slice(-1)[0];
                                const overLabel      = `${lastName} OVER ${p.line} ${badge}`;
                                const underLabel     = `${lastName} UNDER ${p.line} ${badge}`;
                                const overPick       = { label: overLabel,  lean: "OVER",  positive: true,  confidence: null, propType: badge };
                                const underPick      = { label: underLabel, lean: "UNDER", positive: false, confidence: null, propType: badge };
                                const overLogged     = isLogged(overPick);
                                const underLogged    = isLogged(underPick);

                                // Line discrepancy detection
                                const availLines     = activeBooks.map(bk => books[bk]?.line).filter(Boolean);
                                const uniqueLines    = [...new Set(availLines)];
                                const hasDiscrepancy = uniqueLines.length > 1;
                                const lowestLine     = hasDiscrepancy ? Math.min(...uniqueLines) : null;

                                // Sharp vs square book confidence signal
                                // Sharp books (DK/FD) set tighter lines; when they're lower than square
                                // books (CZR/MGM), it signals the market leans toward the OVER on that line
                                const SHARP_BOOKS  = ["DK", "FD"];
                                const SQUARE_BOOKS = ["CZR", "MGM"];
                                const sharpLines   = SHARP_BOOKS.map(bk => books[bk]?.line).filter(Boolean);
                                const squareLines  = SQUARE_BOOKS.map(bk => books[bk]?.line).filter(Boolean);
                                const sharpAvg     = sharpLines.length  ? sharpLines.reduce((s, v) => s + v, 0)  / sharpLines.length  : null;
                                const squareAvg    = squareLines.length ? squareLines.reduce((s, v) => s + v, 0) / squareLines.length : null;
                                const lineGap      = (sharpAvg !== null && squareAvg !== null) ? (squareAvg - sharpAvg) : null;
                                // lineGap > 0 means sharp books are lower → over-edge signal
                                const hasEdge      = lineGap !== null && lineGap >= 0.5;
                                const confidencePct = hasEdge
                                  ? Math.min(80, Math.round(55 + (lineGap / 0.5) * 10))
                                  : null;
                                const confidenceLabel = confidencePct !== null
                                  ? (confidencePct >= 75 ? "HIGH" : confidencePct >= 65 ? "MOD" : "MILD")
                                  : null;
                                const confidenceColor = confidenceLabel === "HIGH" ? "#22c55e"
                                  : confidenceLabel === "MOD"  ? "#fbbf24"
                                  : confidenceLabel === "MILD" ? "#94a3b8"
                                  : "#fbbf24";

                                // Best over odds among all books
                                const bestOverOdds = activeBooks
                                  .map(bk => books[bk]?.overOdds)
                                  .filter(Boolean)
                                  .sort((a, b) => parseInt(b) - parseInt(a))[0] ?? null;

                                return (
                                  <div key={i}>
                                    {/* ── Compact row (Option A) ── */}
                                    <div
                                      onClick={() => setExpandedPropRow(isExpanded ? null : rowKey)}
                                      style={{ display: "grid", gridTemplateColumns: `1fr ${activeBooks.map(() => "52px").join(" ")}`, gap: 0, padding: "7px 10px", cursor: "pointer", background: isExpanded ? "rgba(255,255,255,0.03)" : "transparent", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "center" }}
                                    >
                                      {/* Player name */}
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                          <span style={{ fontSize: 11, fontWeight: 600, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.player}</span>
                                          {hasDiscrepancy && (
                                            <span style={{ fontSize: 7, fontWeight: 800, color: confidenceColor, background: `${confidenceColor}18`, border: `1px solid ${confidenceColor}44`, borderRadius: 3, padding: "1px 4px", flexShrink: 0 }}>
                                              {hasEdge ? `SPLIT ${confidencePct}%` : "SPLIT"}
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ fontSize: 8, color: "#4b5563", fontFamily: "monospace" }}>
                                          best O {bestOverOdds ?? "—"}  ·  {isExpanded ? "▲" : "▼"}
                                        </div>
                                      </div>

                                      {/* Per-book line cells */}
                                      {activeBooks.map(bk => {
                                        const b      = books[bk];
                                        const isLow  = hasDiscrepancy && b?.line === lowestLine;
                                        const bkColor = BOOK_COLORS[bk];
                                        return (
                                          <div key={bk} style={{ textAlign: "center" }}>
                                            {b ? (
                                              <>
                                                <div style={{ fontSize: 12, fontWeight: 800, color: isLow ? bkColor : "#f9fafb", fontFamily: "monospace", lineHeight: 1 }}>{b.line}</div>
                                                <div style={{ fontSize: 8, color: "#22c55e", fontFamily: "monospace" }}>{b.overOdds ?? "—"}</div>
                                              </>
                                            ) : (
                                              <div style={{ fontSize: 9, color: "#2d3748" }}>—</div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* ── Expanded detail (Option B) ── */}
                                    {isExpanded && (
                                      <div style={{ background: "#0a0b12", borderTop: "1px solid #1a1f2e", padding: "10px" }}>
                                        {/* Full book comparison grid — only books with lines */}
                                        <div style={{ display: "grid", gridTemplateColumns: `repeat(${activeBooks.length}, 1fr)`, gap: 6, marginBottom: 10 }}>
                                          {activeBooks.map(bk => {
                                            const b      = books[bk];
                                            const isLow  = hasDiscrepancy && b?.line === lowestLine;
                                            const bkColor = BOOK_COLORS[bk];
                                            return (
                                              <div key={bk} style={{ background: isLow ? `${bkColor}15` : "#161827", border: `1px solid ${isLow ? `${bkColor}55` : "#1f2437"}`, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                                                <div style={{ fontSize: 8, fontWeight: 700, color: bkColor, marginBottom: 4 }}>{bk}</div>
                                                <div style={{ fontSize: 14, fontWeight: 800, color: isLow ? bkColor : "#f9fafb", fontFamily: "monospace", lineHeight: 1, marginBottom: 4 }}>{b.line}</div>
                                                <div style={{ fontSize: 9, fontFamily: "monospace" }}>
                                                  <span style={{ color: "#22c55e" }}>{fmtO(b.overOdds)}</span>
                                                  <span style={{ color: "#374151" }}> / </span>
                                                  <span style={{ color: "#ef4444" }}>{fmtO(b.underOdds)}</span>
                                                </div>
                                                {isLow && <div style={{ fontSize: 7, color: bkColor, marginTop: 3, fontWeight: 700 }}>BEST LINE</div>}
                                              </div>
                                            );
                                          })}
                                        </div>

                                        {/* ── Line Intelligence panel (shown when sharp ≠ square) ── */}
                                        {hasEdge && (
                                          <div style={{ background: `${confidenceColor}0d`, border: `1px solid ${confidenceColor}33`, borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                                              <span style={{ fontSize: 9, fontWeight: 800, color: confidenceColor, letterSpacing: "0.06em" }}>LINE INTELLIGENCE</span>
                                              <span style={{ fontSize: 9, fontWeight: 700, color: confidenceColor, background: `${confidenceColor}22`, border: `1px solid ${confidenceColor}55`, borderRadius: 3, padding: "1px 5px" }}>{confidenceLabel} {confidencePct}%</span>
                                            </div>
                                            <div style={{ fontSize: 9, color: "#9ca3af", lineHeight: 1.5 }}>
                                              <span style={{ color: "#38bdf8", fontWeight: 700 }}>Sharp books</span>
                                              <span> (DK/FD) have this at </span>
                                              <span style={{ color: "#f9fafb", fontWeight: 700 }}>{sharpAvg % 1 === 0 ? sharpAvg.toFixed(1) : sharpAvg.toFixed(1)}</span>
                                              <span>, while </span>
                                              <span style={{ color: "#a78bfa", fontWeight: 700 }}>square books</span>
                                              <span> (CZR/MGM) are at </span>
                                              <span style={{ color: "#f9fafb", fontWeight: 700 }}>{squareAvg.toFixed(1)}</span>
                                              <span>.</span>
                                              {lineGap >= 0.5 && (
                                                <span style={{ display: "block", marginTop: 3, color: confidenceColor }}>
                                                  A {lineGap.toFixed(1)}-point gap suggests market confidence on the OVER {sharpAvg.toFixed(1)}.
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        {/* Log buttons */}
                                        <div style={{ display: "flex", gap: 6 }}>
                                          <button
                                            onClick={() => !overLogged && logPick(overPick)}
                                            style={{ flex: 1, fontSize: 10, fontWeight: 700, background: overLogged ? "rgba(34,197,94,0.15)" : "rgba(34,197,94,0.08)", border: `1px solid ${overLogged ? "rgba(34,197,94,0.5)" : "rgba(34,197,94,0.2)"}`, borderRadius: 8, padding: "7px", cursor: overLogged ? "default" : "pointer", color: overLogged ? "#22c55e" : "#6b7280", lineHeight: 1 }}>
                                            {overLogged ? "✓ OVER logged" : `OVER ${p.line} ${badge}  ${fmtO(p.overOdds)}`}
                                          </button>
                                          <button
                                            onClick={() => !underLogged && logPick(underPick)}
                                            style={{ flex: 1, fontSize: 10, fontWeight: 700, background: underLogged ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.08)", border: `1px solid ${underLogged ? "rgba(239,68,68,0.5)" : "rgba(239,68,68,0.2)"}`, borderRadius: 8, padding: "7px", cursor: underLogged ? "default" : "pointer", color: underLogged ? "#ef4444" : "#6b7280", lineHeight: 1 }}>
                                            {underLogged ? "✓ UNDER logged" : `UNDER ${p.line} ${badge}  ${fmtO(p.underOdds)}`}
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </Card>
                          );
                        })}
                      </>
                    )}
                  </>
                );
              })()}

              {/* ── AI ANALYSIS section ───────────────────────── */}
              {!IS_STATS_SANDBOX && (() => {
                const aiKey    = String(selectedId);
                const aiState  = liveAiProps[aiKey];
                if (aiState === null) return null; // silent failure — don't show anything
                // aiState is { props: [...], searchUsed: bool } | "loading" | null
                const aiProps    = Array.isArray(aiState?.props) ? aiState.props : [];
                const searchUsed = aiState?.searchUsed === true;
                return (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, marginBottom: 8 }}>
                      <SLabel style={{ marginBottom: 0 }}>AI Analysis</SLabel>
                      <span style={{ fontSize: 8, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 4, padding: "2px 6px" }}>AI</span>
                      {searchUsed && <span style={{ fontSize: 8, fontWeight: 700, color: "#38bdf8", background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.3)", borderRadius: 4, padding: "2px 6px" }}>WEB</span>}
                    </div>

                    {aiState === "loading" ? (
                      <Card>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa", flexShrink: 0, animation: "pulse 1.5s ease-in-out infinite" }} />
                          <span style={{ fontSize: 12, color: "#6b7280" }}>Analyzing game data…</span>
                        </div>
                      </Card>
                    ) : aiProps.map((p, i) => {
                      const logged   = isLogged(p);
                      const inParlay = parlayLabels.includes(p.label);
                      const parlayFull = parlayLabels.length >= 3 && !inParlay;
                      return (
                        <Card key={i} style={inParlay ? { borderColor: "rgba(251,191,36,0.4)" } : {}}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", flex: 1, paddingRight: 8, lineHeight: 1.4 }}>{p.label}</div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                              <LeanBadge label={p.lean} positive={p.positive} small />
                              <button
                                onClick={() => { if (parlayFull) return; setParlayLabels(prev => inParlay ? prev.filter(l => l !== p.label) : [...prev, p.label]); }}
                                title={parlayFull ? "Max 3 legs" : inParlay ? "Remove from parlay" : "Add to parlay"}
                                style={{ fontSize: 10, fontWeight: 700, background: inParlay ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${inParlay ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "3px 6px", cursor: parlayFull ? "default" : "pointer", color: inParlay ? "#fbbf24" : "#4b5563", opacity: parlayFull ? 0.35 : 1, lineHeight: 1 }}>
                                🔗
                              </button>
                              <button
                                onClick={() => !logged && logPick(p)}
                                title={logged ? "Already logged" : "Log this pick"}
                                style={{ fontSize: 13, background: logged ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${logged ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "3px 7px", cursor: logged ? "default" : "pointer", color: logged ? "#22c55e" : "#6b7280", transition: "all 0.15s", lineHeight: 1 }}>
                                {logged ? "✓" : "＋"}
                              </button>
                            </div>
                          </div>
                          <ConfBar pct={p.confidence} positive={p.positive} />
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8, lineHeight: 1.4 }}>{p.reason}</div>
                        </Card>
                      );
                    })}
                  </>
                );
              })()}
            </>)}
          </>)}

          {/* ── BULLPEN TAB ─────────────────────────────────── */}
          {tab === "bullpen" && (<>
            {/* Header row with LIVE badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <SLabel style={{ marginBottom: 0 }}>Bullpen Strength &amp; Fatigue</SLabel>
              {bullpen.away?.live && (
                <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "2px 6px" }}>LIVE</span>
              )}
            </div>

            {/* Quick-glance summary row */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[{ abbr: game.away.abbr, data: bullpen.away }, { abbr: game.home.abbr, data: bullpen.home }].map(({ abbr, data }) => {
                const grade = data?.grade ?? "—";
                const gc    = data?.gradeColor ?? "#6b7280";
                const fat   = data?.fatigueLevel ?? "—";
                const fatC  = fat === "LOW" ? "#22c55e" : fat === "HIGH" ? "#ef4444" : "#f59e0b";
                return (
                  <div key={abbr} style={{ flex: 1, background: "#161827", border: "1px solid #1f2437", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", marginBottom: 6 }}>{abbr} Bullpen</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: "#9ca3af" }}>Grade</span>
                      <span style={{ fontSize: 16, fontWeight: 900, color: gc }}>{grade}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 9, color: "#9ca3af" }}>Fatigue</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: fatC }}>{fat}</span>
                    </div>
                    {data?.note && (
                      <div style={{ fontSize: 9, color: "#6b7280", marginTop: 6, lineHeight: 1.4, borderTop: "1px solid #1f2437", paddingTop: 6 }}>{data.note}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Full bullpen cards */}
            <BullpenCard label={game.away.abbr} data={bullpen.away} />
            <BullpenCard label={game.home.abbr} data={bullpen.home} />
          </>)}
          {/* ── END BULLPEN TAB ─────────────────────────────── */}

          {/* ── BOXSCORE TAB ─────────────────────────────────── */}
          {tab === "boxscore" && (() => {
            const sg  = liveSlate?.find(g => g.gamePk === selectedId);
            const box = liveBoxscores[selectedId];
            const isLiveGame  = sg?.status === "In Progress" || sg?.status === "Warmup";
            const isFinalGame = sg?.status === "Final" || sg?.status === "Game Over";

            // Loading state
            if (box === undefined) {
              return (
                <Card style={{ textAlign: "center", padding: "32px 16px" }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>📊</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Loading boxscore…</div>
                </Card>
              );
            }

            // Error / unavailable
            if (box === null) {
              return (
                <Card style={{ textAlign: "center", padding: "32px 16px" }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>⚠️</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Boxscore unavailable</div>
                  <div style={{ fontSize: 9, color: "#4b5563", marginTop: 4 }}>Game may not have started yet</div>
                </Card>
              );
            }

            // Not started yet (no innings)
            if (!box.linescore?.innings?.length) {
              return (
                <Card style={{ textAlign: "center", padding: "32px 16px" }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>⏳</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Game hasn't started yet</div>
                </Card>
              );
            }

            const innings = box.linescore.innings;
            const ls      = box.linescore;

            // ── Linescore grid ────────────────────────────────
            const linescoreGrid = (
              <Card style={{ marginBottom: 10, overflowX: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#f9fafb" }}>Linescore</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isLiveGame && <div style={{ fontSize: 9, color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 999, padding: "2px 7px", fontWeight: 700 }}>● LIVE</div>}
                    {isFinalGame && <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700 }}>FINAL</div>}
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", color: "#4b5563", fontWeight: 600, paddingRight: 8, paddingBottom: 6, whiteSpace: "nowrap", width: 40 }}></th>
                        {innings.map(inn => (
                          <th key={inn.num} style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 6, minWidth: 22 }}>{inn.num}</th>
                        ))}
                        <th style={{ textAlign: "center", color: "#9ca3af", fontWeight: 800, paddingLeft: 10, paddingBottom: 6, minWidth: 24 }}>R</th>
                        <th style={{ textAlign: "center", color: "#6b7280", fontWeight: 600, paddingLeft: 6, paddingBottom: 6, minWidth: 24 }}>H</th>
                        <th style={{ textAlign: "center", color: "#6b7280", fontWeight: 600, paddingLeft: 6, paddingBottom: 6, minWidth: 24 }}>E</th>
                      </tr>
                    </thead>
                    <tbody>
                      {["away", "home"].map(side => {
                        const abbr = side === "away" ? game.away.abbr : game.home.abbr;
                        const totals = ls[side] ?? {};
                        const isWinner = isFinalGame && (
                          side === "away" ? totals.runs > ls.home?.runs : totals.runs > ls.away?.runs
                        );
                        return (
                          <tr key={side}>
                            <td style={{ textAlign: "left", paddingRight: 8, paddingBottom: 4, color: isWinner ? "#f9fafb" : "#9ca3af", fontWeight: isWinner ? 800 : 600, whiteSpace: "nowrap" }}>{abbr}</td>
                            {innings.map(inn => {
                              const runs = inn[side];
                              return (
                                <td key={inn.num} style={{ textAlign: "center", paddingBottom: 4, color: runs > 0 ? "#e5e7eb" : "#4b5563" }}>
                                  {runs === null ? "—" : runs}
                                </td>
                              );
                            })}
                            <td style={{ textAlign: "center", paddingLeft: 10, paddingBottom: 4, color: isWinner ? "#22c55e" : "#9ca3af", fontWeight: 800 }}>{totals.runs ?? 0}</td>
                            <td style={{ textAlign: "center", paddingLeft: 6, paddingBottom: 4, color: "#6b7280" }}>{totals.hits ?? 0}</td>
                            <td style={{ textAlign: "center", paddingLeft: 6, paddingBottom: 4, color: (totals.errors ?? 0) > 0 ? "#ef4444" : "#4b5563" }}>{totals.errors ?? 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            );

            // ── Batting section ───────────────────────────────
            const batters = box.batting?.[boxSide] ?? [];
            const battingSection = (
              <Card style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#f9fafb" }}>Batting</div>
                  {/* Away / Home toggle */}
                  <div style={{ display: "flex", background: "#0e0f1a", borderRadius: 8, padding: 2, gap: 2 }}>
                    {["away", "home"].map(s => (
                      <button key={s} onClick={() => setBoxSide(s)}
                        style={{ fontSize: 9, fontWeight: 700, padding: "4px 9px", borderRadius: 6, border: "none", cursor: "pointer", transition: "all 0.15s",
                          background: boxSide === s ? "#1f2437" : "transparent",
                          color:      boxSide === s ? "#f9fafb"  : "#4b5563",
                        }}>
                        {s === "away" ? game.away.abbr : game.home.abbr}
                      </button>
                    ))}
                  </div>
                </div>

                {batters.length === 0 ? (
                  <div style={{ fontSize: 10, color: "#4b5563", textAlign: "center", padding: "12px 0" }}>No batting data yet</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #1f2437" }}>
                          <th style={{ textAlign: "left",   color: "#4b5563", fontWeight: 600, paddingBottom: 5, paddingRight: 4 }}>Batter</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 26 }}>AB</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 26 }}>R</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 26 }}>H</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 26 }}>RBI</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 26 }}>HR</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 26 }}>BB</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 26 }}>K</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 38 }}>AVG</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batters.map((b, i) => (
                          <tr key={b.id} style={{ borderBottom: i < batters.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                            <td style={{ paddingTop: 5, paddingBottom: 5, paddingRight: 4 }}>
                              <div style={{ fontSize: 10, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{b.name}</div>
                              <div style={{ fontSize: 8,  color: "#4b5563" }}>{b.pos}</div>
                            </td>
                            <td style={{ textAlign: "center", color: "#9ca3af", paddingTop: 5, paddingBottom: 5 }}>{b.ab}</td>
                            <td style={{ textAlign: "center", color: b.r  > 0 ? "#38bdf8" : "#4b5563", paddingTop: 5, paddingBottom: 5 }}>{b.r}</td>
                            <td style={{ textAlign: "center", color: b.h  > 0 ? "#e5e7eb" : "#4b5563", fontWeight: b.h > 0 ? 700 : 400, paddingTop: 5, paddingBottom: 5 }}>{b.h}</td>
                            <td style={{ textAlign: "center", color: b.rbi > 0 ? "#fbbf24" : "#4b5563", paddingTop: 5, paddingBottom: 5 }}>{b.rbi}</td>
                            <td style={{ textAlign: "center", color: b.hr > 0 ? "#f97316" : "#4b5563", fontWeight: b.hr > 0 ? 800 : 400, paddingTop: 5, paddingBottom: 5 }}>{b.hr || "—"}</td>
                            <td style={{ textAlign: "center", color: "#4b5563", paddingTop: 5, paddingBottom: 5 }}>{b.bb}</td>
                            <td style={{ textAlign: "center", color: b.k  > 0 ? "#ef4444" : "#4b5563", paddingTop: 5, paddingBottom: 5 }}>{b.k}</td>
                            <td style={{ textAlign: "center", color: "#6b7280", paddingTop: 5, paddingBottom: 5 }}>{b.avg}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );

            // ── Pitching section (shares toggle with batting) ────────────
            const pitchers = box.pitching?.[boxSide] ?? [];
            const pitchAbbr = boxSide === "away" ? game.away.abbr : game.home.abbr;
            const pitchingSection = (
              <Card style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#f9fafb", marginBottom: 10 }}>Pitching · {pitchAbbr}</div>

                {pitchers.length === 0 ? (
                  <div style={{ fontSize: 10, color: "#4b5563", textAlign: "center", padding: "12px 0" }}>No pitching data yet</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #1f2437" }}>
                          <th style={{ textAlign: "left",   color: "#4b5563", fontWeight: 600, paddingBottom: 5, paddingRight: 4 }}>Pitcher</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 32 }}>IP</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 26 }}>H</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 26 }}>R</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 26 }}>ER</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 26 }}>BB</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 26 }}>K</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 32 }}>PC</th>
                          <th style={{ textAlign: "center", color: "#4b5563", fontWeight: 600, paddingBottom: 5, width: 44 }}>ERA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pitchers.map((p, i) => (
                          <tr key={p.id} style={{ borderBottom: i < pitchers.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                            <td style={{ paddingTop: 5, paddingBottom: 5, paddingRight: 4 }}>
                              <div style={{ fontSize: 10, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{p.name}</div>
                              {i === 0 && <div style={{ fontSize: 8, color: "#38bdf8" }}>SP</div>}
                            </td>
                            <td style={{ textAlign: "center", color: "#9ca3af", paddingTop: 5, paddingBottom: 5 }}>{p.ip}</td>
                            <td style={{ textAlign: "center", color: "#6b7280", paddingTop: 5, paddingBottom: 5 }}>{p.h}</td>
                            <td style={{ textAlign: "center", color: p.r  > 0 ? "#ef4444" : "#4b5563", paddingTop: 5, paddingBottom: 5 }}>{p.r}</td>
                            <td style={{ textAlign: "center", color: p.er > 0 ? "#ef4444" : "#4b5563", paddingTop: 5, paddingBottom: 5 }}>{p.er}</td>
                            <td style={{ textAlign: "center", color: "#4b5563", paddingTop: 5, paddingBottom: 5 }}>{p.bb}</td>
                            <td style={{ textAlign: "center", color: p.k  > 0 ? "#22c55e" : "#4b5563", fontWeight: p.k >= 7 ? 800 : 400, paddingTop: 5, paddingBottom: 5 }}>{p.k}</td>
                            <td style={{ textAlign: "center", color: "#6b7280", paddingTop: 5, paddingBottom: 5 }}>{p.pc}</td>
                            <td style={{ textAlign: "center", color: "#6b7280", paddingTop: 5, paddingBottom: 5 }}>{p.era}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );

            return (
              <>
                {linescoreGrid}
                {battingSection}
                {pitchingSection}
              </>
            );
          })()}
          {/* ── END BOXSCORE TAB ─────────────────────────────── */}

        </>)}

        {/* ════════════════════════════════════
            PICKS VIEW
        ════════════════════════════════════ */}
        {view === "picks" && (() => {
          const hits    = propLog.filter(p => p.result === "hit").length;
          const misses  = propLog.filter(p => p.result === "miss").length;
          const pending = propLog.filter(p => p.result === null).length;
          const graded  = hits + misses;
          const pct     = graded > 0 ? Math.round((hits / graded) * 100) : null;

          const filtered = propLog.filter(p =>
            picksFilter === "all"     ? true :
            picksFilter === "pending" ? p.result === null :
            picksFilter === "hit"     ? p.result === "hit" :
            picksFilter === "miss"    ? p.result === "miss" : true
          );

          return (<>
            {/* Stats bar */}
            <Card style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>My Pick Log</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {propLog.length > 0 && picksServerReachable && (
                    <button
                      onClick={syncPicksToServer}
                      disabled={syncStatus === "syncing"}
                      style={{
                        background: syncStatus === "syncing" ? "#161827" : "rgba(56,189,248,0.12)",
                        border: `1px solid ${syncStatus === "error" ? "rgba(239,68,68,0.35)" : "rgba(56,189,248,0.35)"}`,
                        borderRadius: 999,
                        padding: "4px 9px",
                        fontSize: 10,
                        fontWeight: 800,
                        color: syncStatus === "error" ? "#ef4444" : "#38bdf8",
                        cursor: syncStatus === "syncing" ? "default" : "pointer",
                        opacity: syncStatus === "syncing" ? 0.75 : 1,
                      }}
                    >
                      ☁ Sync to server
                    </button>
                  )}
                  {syncMessage && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: syncStatus === "error" ? "#ef4444" : syncStatus === "done" ? "#22c55e" : "#9ca3af" }}>{syncMessage}</div>
                  )}
                  {pct !== null && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: pct >= 55 ? "#22c55e" : pct >= 45 ? "#f9fafb" : "#ef4444" }}>{pct}% accuracy</div>
                  )}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                {[
                  { label: "Total",   value: propLog.length, color: "#9ca3af" },
                  { label: "Pending", value: pending,         color: "#f59e0b" },
                  { label: "Hits",    value: hits,            color: "#22c55e" },
                  { label: "Misses",  value: misses,          color: "#ef4444" },
                ].map(s => (
                  <div key={s.label} style={{ background: "#1e2030", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {graded > 0 && (
                <div style={{ marginTop: 8, height: 4, background: "#1e2030", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: pct >= 55 ? "#22c55e" : pct >= 45 ? "#f59e0b" : "#ef4444", borderRadius: 2, transition: "width 0.4s" }} />
                </div>
              )}

              {/* ── ROI row ── */}
              {graded > 0 && (() => {
                // Flat -110 assumption: win returns +0.909u, loss costs -1u
                const netUnits   = hits * 0.909 - misses;
                const roiPct     = ((netUnits / graded) * 100).toFixed(1);
                const netColor   = netUnits > 0 ? "#22c55e" : netUnits < 0 ? "#ef4444" : "#9ca3af";
                const netLabel   = `${netUnits >= 0 ? "+" : ""}${netUnits.toFixed(1)}u`;

                // Best prop type — highest hit rate with ≥3 graded picks
                const getPropType = (p) => {
                  if (p.propType) return p.propType;
                  const lbl = p.label || "";
                  if (/\bK\b|strikeout/i.test(lbl)) return "K";
                  if (/\bF5\b|first.?5/i.test(lbl)) return "F5";
                  if (/\bNRFI\b/i.test(lbl))        return "NRFI";
                  if (/\bHR\b|home run/i.test(lbl)) return "HR";
                  if (/\bRBI\b/i.test(lbl))         return "RBI";
                  if (/TB|total base/i.test(lbl))   return "TB";
                  if (/hit/i.test(lbl))              return "Hits";
                  return "Other";
                };
                const typeMap = {};
                propLog.filter(p => p.result !== null).forEach(p => {
                  const t = getPropType(p);
                  if (!typeMap[t]) typeMap[t] = { h: 0, tot: 0 };
                  typeMap[t].tot++;
                  if (p.result === "hit") typeMap[t].h++;
                });
                const bestType = Object.entries(typeMap)
                  .filter(([, v]) => v.tot >= 3)
                  .sort(([, a], [, b]) => (b.h / b.tot) - (a.h / a.tot))[0];

                return (
                  <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "stretch" }}>
                    {/* Net units — big number */}
                    <div style={{ flex: 1, background: `${netColor}10`, border: `1px solid ${netColor}30`, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: netColor, fontFamily: "monospace", lineHeight: 1 }}>{netLabel}</div>
                      <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginTop: 4, letterSpacing: "0.06em" }}>Net units</div>
                      <div style={{ fontSize: 8, color: "#4b5563", marginTop: 2 }}>at −110</div>
                    </div>

                    {/* ROI % */}
                    <div style={{ flex: 1, background: "#161827", border: "1px solid #1f2437", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: parseFloat(roiPct) >= 0 ? "#22c55e" : "#ef4444", fontFamily: "monospace", lineHeight: 1 }}>{roiPct}%</div>
                      <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginTop: 4, letterSpacing: "0.06em" }}>ROI</div>
                      <div style={{ fontSize: 8, color: "#4b5563", marginTop: 2 }}>{graded} graded</div>
                    </div>

                    {/* Best prop type */}
                    <div style={{ flex: 1, background: "#161827", border: "1px solid #1f2437", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                      {bestType ? (<>
                        <div style={{ fontSize: 16, fontWeight: 900, color: "#a78bfa", fontFamily: "monospace", lineHeight: 1 }}>{bestType[0]}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginTop: 2 }}>{Math.round((bestType[1].h / bestType[1].tot) * 100)}%</div>
                        <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginTop: 2, letterSpacing: "0.06em" }}>Best type</div>
                      </>) : (<>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#4b5563", lineHeight: 1 }}>—</div>
                        <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginTop: 6, letterSpacing: "0.06em" }}>Best type</div>
                        <div style={{ fontSize: 8, color: "#4b5563", marginTop: 2 }}>need 3+ per type</div>
                      </>)}
                    </div>
                  </div>
                );
              })()}
            </Card>

            {/* ── TRENDS ───────────────────────────────────── */}
            {(() => {
              const graded2 = propLog.filter(p => p.result !== null);
              if (graded2.length === 0) return null;

              // ── propType resolver: structured field first, regex fallback for old picks ──
              const getPropType = (p) => {
                if (p.propType) return p.propType;
                const lbl = p.label || "";
                if (/\bK\b|strikeout/i.test(lbl))   return "K";
                if (/\bF5\b|first.?5/i.test(lbl))   return "F5";
                if (/\bHR\b|home run/i.test(lbl))   return "HR";
                if (/\bRBI\b/i.test(lbl))           return "RBI";
                if (/TB|total base/i.test(lbl))     return "TB";
                if (/hit/i.test(lbl))               return "Hits";
                return "Other";
              };

              // ── By prop type ───────────────────────────────
              const typeGroups = { K: [], F5: [], Hits: [], TB: [], HR: [], RBI: [], Other: [] };
              graded2.forEach(p => {
                const t = getPropType(p);
                (typeGroups[t] ?? typeGroups.Other).push(p);
              });
              const typeStats = Object.entries(typeGroups)
                .filter(([, arr]) => arr.length > 0)
                .map(([type, arr]) => {
                  const h = arr.filter(p => p.result === "hit").length;
                  return { type, total: arr.length, hits: h, pct: Math.round((h / arr.length) * 100) };
                });

              // ── By confidence tier ─────────────────────────
              const tierGroups = { High: [], Mid: [], Low: [] };
              graded2.forEach(p => {
                const c = p.confidence ?? 0;
                if      (c >= 65) tierGroups.High.push(p);
                else if (c >= 50) tierGroups.Mid.push(p);
                else              tierGroups.Low.push(p);
              });
              const tierStats = Object.entries(tierGroups)
                .filter(([, arr]) => arr.length > 0)
                .map(([tier, arr]) => {
                  const h = arr.filter(p => p.result === "hit").length;
                  return { tier, total: arr.length, hits: h, pct: Math.round((h / arr.length) * 100) };
                });

              // ── Recent form: last 10 vs all-time ──────────
              const last10 = graded2.slice(0, 10);
              const last10Hits = last10.filter(p => p.result === "hit").length;
              const last10Pct  = last10.length > 0 ? Math.round((last10Hits / last10.length) * 100) : null;
              const allPct     = graded2.length  > 0 ? Math.round((graded2.filter(p => p.result === "hit").length / graded2.length) * 100) : null;
              const formDelta  = last10Pct !== null && allPct !== null ? last10Pct - allPct : null;

              // ── Current streak ────────────────────────────
              let streakCount = 0, streakType = null;
              for (const p of graded2) {
                if (streakType === null) { streakType = p.result; streakCount = 1; }
                else if (p.result === streakType) streakCount++;
                else break;
              }

              const trendAccColor = (pct) => pct >= 60 ? "#22c55e" : pct >= 45 ? "#f59e0b" : "#ef4444";

              return (
                <div style={{ marginBottom: 12 }}>
                  {/* Header row — collapsible */}
                  <button
                    onClick={() => setShowTrends(s => !s)}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#161827", border: "1px solid #1f2437", borderRadius: showTrends ? "8px 8px 0 0" : 8, padding: "8px 12px", cursor: "pointer", marginBottom: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.05em" }}>📈 Trends</span>
                    <span style={{ fontSize: 9, color: "#4b5563" }}>{showTrends ? "▲ hide" : "▼ show"}</span>
                  </button>

                  {showTrends && (
                    <div style={{ background: "#0f1117", border: "1px solid #1f2437", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "10px 12px" }}>

                      {/* Recent form + streak row */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        {/* Recent form */}
                        <div style={{ flex: 1, background: "#161827", borderRadius: 8, padding: "8px 10px" }}>
                          <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Last 10</div>
                          <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                            {last10.map((p, i) => (
                              <div key={i} style={{ flex: 1, height: 6, borderRadius: 2, background: p.result === "hit" ? "#22c55e" : "#ef4444" }} />
                            ))}
                            {/* empty slots */}
                            {Array.from({ length: Math.max(0, 10 - last10.length) }).map((_, i) => (
                              <div key={`e${i}`} style={{ flex: 1, height: 6, borderRadius: 2, background: "#1e2030" }} />
                            ))}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: last10Pct !== null ? trendAccColor(last10Pct) : "#6b7280" }}>
                              {last10Pct !== null ? `${last10Pct}%` : "—"}
                            </span>
                            {formDelta !== null && (
                              <span style={{ fontSize: 9, color: formDelta > 0 ? "#22c55e" : formDelta < 0 ? "#ef4444" : "#6b7280" }}>
                                {formDelta > 0 ? `▲ +${formDelta}` : formDelta < 0 ? `▼ ${formDelta}` : "= flat"} vs all-time
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Current streak */}
                        <div style={{ flex: 1, background: "#161827", borderRadius: 8, padding: "8px 10px" }}>
                          <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Streak</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: streakType === "hit" ? "#22c55e" : streakType === "miss" ? "#ef4444" : "#6b7280", lineHeight: 1.1 }}>
                            {streakType ? `${streakCount}` : "—"}
                          </div>
                          <div style={{ fontSize: 9, color: streakType === "hit" ? "#22c55e" : streakType === "miss" ? "#ef4444" : "#6b7280", marginTop: 2 }}>
                            {streakType === "hit" ? `HIT${streakCount > 1 ? "S" : ""} in a row` : streakType === "miss" ? `MISS${streakCount > 1 ? "ES" : ""} in a row` : "no data"}
                          </div>
                        </div>
                      </div>

                      {/* By prop type */}
                      {typeStats.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 5 }}>By Prop Type</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {typeStats.map(({ type, total, hits, pct }) => (
                              <div key={type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", width: 32, flexShrink: 0 }}>{type}</div>
                                <div style={{ flex: 1, height: 6, background: "#1e2030", borderRadius: 3, overflow: "hidden" }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: trendAccColor(pct), borderRadius: 3 }} />
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 700, color: trendAccColor(pct), width: 28, textAlign: "right", flexShrink: 0 }}>{pct}%</div>
                                <div style={{ fontSize: 8, color: "#4b5563", width: 28, flexShrink: 0 }}>{hits}/{total}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* By confidence tier + calibration insight */}
                      {tierStats.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 5 }}>By Confidence</div>
                          <div style={{ display: "flex", gap: 6, marginBottom: 7 }}>
                            {tierStats.map(({ tier, total, hits, pct }) => {
                              const tierColor = tier === "High" ? "#a78bfa" : tier === "Mid" ? "#f59e0b" : "#6b7280";
                              return (
                                <div key={tier} style={{ flex: 1, background: "#161827", borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
                                  <div style={{ fontSize: 8, color: tierColor, textTransform: "uppercase", marginBottom: 3 }}>{tier}</div>
                                  <div style={{ fontSize: 14, fontWeight: 800, color: trendAccColor(pct) }}>{pct}%</div>
                                  <div style={{ fontSize: 8, color: "#4b5563", marginTop: 2 }}>{hits}/{total}</div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Confidence calibration insight */}
                          {(() => {
                            const highStat = tierStats.find(t => t.tier === "High");
                            const midStat  = tierStats.find(t => t.tier === "Mid");
                            const lowStat  = tierStats.find(t => t.tier === "Low");
                            // Need at least two tiers with enough picks to say anything meaningful
                            const tiersWithData = [highStat, midStat, lowStat].filter(t => t && t.total >= 3);
                            if (tiersWithData.length < 2) return (
                              <div style={{ fontSize: 9, color: "#374151", fontStyle: "italic", textAlign: "center" }}>
                                Log more graded picks to see calibration data
                              </div>
                            );
                            // Check if confidence is predictive: High > Mid and/or High > Low
                            const highPct = highStat?.total >= 3 ? highStat.pct : null;
                            const midPct  = midStat?.total  >= 3 ? midStat.pct  : null;
                            const lowPct  = lowStat?.total  >= 3 ? lowStat.pct  : null;
                            const highBeatsOthers = (
                              (highPct !== null && midPct !== null && highPct > midPct) ||
                              (highPct !== null && lowPct  !== null && highPct > lowPct)
                            );
                            const inverted = highPct !== null && midPct !== null && highPct < midPct - 10;
                            if (inverted) return (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "6px 8px" }}>
                                <span style={{ fontSize: 12 }}>⚠️</span>
                                <div>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: "#ef4444" }}>Confidence not predictive</div>
                                  <div style={{ fontSize: 8, color: "#6b7280" }}>High picks hitting less than Mid — recalibrate your lean threshold</div>
                                </div>
                              </div>
                            );
                            if (highBeatsOthers) return (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 6, padding: "6px 8px" }}>
                                <span style={{ fontSize: 12 }}>✅</span>
                                <div>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: "#a78bfa" }}>Confidence is predictive</div>
                                  <div style={{ fontSize: 8, color: "#6b7280" }}>High-confidence picks are outperforming — trust your edges</div>
                                </div>
                              </div>
                            );
                            return (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 6, padding: "6px 8px" }}>
                                <span style={{ fontSize: 12 }}>📊</span>
                                <div>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b" }}>Calibration unclear</div>
                                  <div style={{ fontSize: 8, color: "#6b7280" }}>Tiers hitting at similar rates — keep logging for signal</div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* ── TRENDS FULL sections (enriched picks only) ── */}
                      {(() => {
                        // Only show Full sections when enough enriched picks exist (propType set)
                        const enriched = graded2.filter(p => p.propType);
                        if (enriched.length < 2) return null;

                        // ── By Batter (Hits + TB props with playerName) ─
                        const batterPicks = enriched.filter(p => (p.propType === "Hits" || p.propType === "TB" || p.propType === "HR" || p.propType === "RBI") && p.playerName);
                        const batterMap = {};
                        batterPicks.forEach(p => {
                          if (!batterMap[p.playerName]) batterMap[p.playerName] = [];
                          batterMap[p.playerName].push(p);
                        });
                        const batterStats = Object.entries(batterMap)
                          .filter(([, arr]) => arr.length >= 2)
                          .map(([name, arr]) => {
                            const h = arr.filter(p => p.result === "hit").length;
                            return { name, total: arr.length, hits: h, pct: Math.round((h / arr.length) * 100) };
                          })
                          .sort((a, b) => b.total - a.total);

                        // ── K prop by Pitcher ──────────────────────────
                        const kPicks = enriched.filter(p => p.propType === "K" && p.pitcherName);
                        const pitcherMap = {};
                        kPicks.forEach(p => {
                          if (!pitcherMap[p.pitcherName]) pitcherMap[p.pitcherName] = [];
                          pitcherMap[p.pitcherName].push(p);
                        });
                        const pitcherStats = Object.entries(pitcherMap)
                          .filter(([, arr]) => arr.length >= 2)
                          .map(([name, arr]) => {
                            const h = arr.filter(p => p.result === "hit").length;
                            return { name, total: arr.length, hits: h, pct: Math.round((h / arr.length) * 100) };
                          })
                          .sort((a, b) => b.total - a.total);

                        // ── K prop by Park (homeTeam = venue) ─────────
                        const kParkPicks = enriched.filter(p => p.propType === "K" && p.homeTeam);
                        const parkMap = {};
                        kParkPicks.forEach(p => {
                          if (!parkMap[p.homeTeam]) parkMap[p.homeTeam] = [];
                          parkMap[p.homeTeam].push(p);
                        });
                        const parkStats = Object.entries(parkMap)
                          .filter(([, arr]) => arr.length >= 2)
                          .map(([park, arr]) => {
                            const h = arr.filter(p => p.result === "hit").length;
                            return { park, total: arr.length, hits: h, pct: Math.round((h / arr.length) * 100) };
                          })
                          .sort((a, b) => b.total - a.total);

                        // Shared row renderer for name + bar + pct + fraction
                        const FullRow = ({ label, pct, hits, total }) => (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", flex: "0 0 90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                 title={label}>{label}</div>
                            <div style={{ flex: 1, height: 6, background: "#1e2030", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: trendAccColor(pct), borderRadius: 3 }} />
                            </div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: trendAccColor(pct), width: 28, textAlign: "right", flexShrink: 0 }}>{pct}%</div>
                            <div style={{ fontSize: 8, color: "#4b5563", width: 28, flexShrink: 0 }}>{hits}/{total}</div>
                          </div>
                        );

                        return (<>
                          {/* Divider */}
                          <div style={{ height: 1, background: "#1f2437", margin: "4px 0 10px" }} />

                          {/* By Batter */}
                          {batterStats.length > 0 && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 5 }}>Hit · TB Props by Batter</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {batterStats.map(s => <FullRow key={s.name} label={s.name} pct={s.pct} hits={s.hits} total={s.total} />)}
                              </div>
                            </div>
                          )}

                          {/* K Prop by Pitcher */}
                          {pitcherStats.length > 0 && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 5 }}>K Prop by Pitcher</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {pitcherStats.map(s => <FullRow key={s.name} label={s.name} pct={s.pct} hits={s.hits} total={s.total} />)}
                              </div>
                            </div>
                          )}

                          {/* K Prop by Park */}
                          {parkStats.length > 0 && (
                            <div>
                              <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginBottom: 5 }}>K Prop by Park</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {parkStats.map(s => <FullRow key={s.park} label={s.park} pct={s.pct} hits={s.hits} total={s.total} />)}
                              </div>
                            </div>
                          )}

                          {/* Placeholder when enriched picks exist but none have enough history yet */}
                          {batterStats.length === 0 && pitcherStats.length === 0 && parkStats.length === 0 && (
                            <div style={{ textAlign: "center", padding: "8px 0" }}>
                              <div style={{ fontSize: 9, color: "#4b5563", lineHeight: 1.6 }}>
                                Log and grade more picks to unlock<br />per-player · per-pitcher · per-park breakdowns.
                              </div>
                            </div>
                          )}
                        </>);
                      })()}

                    </div>
                  )}
                </div>
              );
            })()}
            {/* ── END TRENDS ───────────────────────────────── */}

            {/* ── 7-DAY DIGEST ───────────────────────────── */}
            {(liveDigest || digestLoading) && (() => {
              const d = liveDigest;
              const pctColor = !d ? "#6b7280" : d.pct >= 55 ? "#22c55e" : d.pct >= 45 ? "#f59e0b" : "#ef4444";
              const typeEntries = d
                ? Object.entries(d.byType).filter(([, v]) => v.total > 0)
                : [];
              return (
                <div style={{ marginBottom: 10 }}>
                  {/* Collapsible header */}
                  <button
                    onClick={() => setShowDigest(s => !s)}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#161827", border: "1px solid #1f2437", borderRadius: showDigest ? "8px 8px 0 0" : 8, padding: "8px 12px", cursor: "pointer", marginBottom: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.05em" }}>📅 7-Day Digest</span>
                      {digestLoading && <span style={{ fontSize: 8, color: "#6b7280" }}>loading…</span>}
                      {d && <span style={{ fontSize: 10, fontWeight: 800, color: pctColor, fontFamily: "monospace" }}>{d.pct}%</span>}
                    </div>
                    <span style={{ fontSize: 9, color: "#4b5563" }}>{showDigest ? "▲ hide" : "▼ show"}</span>
                  </button>

                  {showDigest && (
                    <div style={{ background: "#0f1117", border: "1px solid #1f2437", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "10px 12px" }}>
                      {digestLoading && (
                        <div style={{ textAlign: "center", padding: "12px 0", color: "#4b5563", fontSize: 11 }}>Computing digest…</div>
                      )}
                      {d && d.total === 0 && (
                        <div style={{ textAlign: "center", padding: "8px 0", color: "#4b5563", fontSize: 10 }}>No graded picks in the last 7 days.</div>
                      )}
                      {d && d.total > 0 && (<>
                        {/* Accuracy row */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                          {[
                            { label: "Graded", val: d.total,  color: "#9ca3af" },
                            { label: "Hits",   val: d.hits,   color: "#22c55e" },
                            { label: "Misses", val: d.misses, color: "#ef4444" },
                          ].map(s => (
                            <div key={s.label} style={{ background: "#1e2030", borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
                              <div style={{ fontSize: 15, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.val}</div>
                              <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", marginTop: 1 }}>{s.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Accuracy bar */}
                        <div style={{ height: 4, background: "#1e2030", borderRadius: 2, overflow: "hidden", marginBottom: 10 }}>
                          <div style={{ width: `${d.pct}%`, height: "100%", background: pctColor, borderRadius: 2, transition: "width 0.4s" }} />
                        </div>

                        {/* Best hit + worst miss */}
                        {(d.bestHit || d.worstMiss) && (
                          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                            {d.bestHit && (
                              <div style={{ flex: 1, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "7px 8px" }}>
                                <div style={{ fontSize: 8, color: "#22c55e", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>✅ Best Hit</div>
                                <div style={{ fontSize: 10, color: "#f9fafb", fontWeight: 700, lineHeight: 1.3, marginBottom: 2 }}>{d.bestHit.label}</div>
                                <div style={{ fontSize: 9, color: "#6b7280" }}>{d.bestHit.awayTeam} @ {d.bestHit.homeTeam} · {d.bestHit.confidence}%</div>
                              </div>
                            )}
                            {d.worstMiss && (
                              <div style={{ flex: 1, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "7px 8px" }}>
                                <div style={{ fontSize: 8, color: "#ef4444", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>❌ Worst Miss</div>
                                <div style={{ fontSize: 10, color: "#f9fafb", fontWeight: 700, lineHeight: 1.3, marginBottom: 2 }}>{d.worstMiss.label}</div>
                                <div style={{ fontSize: 9, color: "#6b7280" }}>{d.worstMiss.awayTeam} @ {d.worstMiss.homeTeam} · {d.worstMiss.confidence}%</div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* By type chips */}
                        {typeEntries.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {typeEntries.map(([type, v]) => {
                              const typePct = v.total > 0 ? Math.round((v.hits / v.total) * 100) : 0;
                              const tc = typePct >= 55 ? "#22c55e" : typePct >= 45 ? "#f59e0b" : "#ef4444";
                              return (
                                <div key={type} style={{ background: `${tc}12`, border: `1px solid ${tc}44`, borderRadius: 6, padding: "3px 8px", display: "flex", gap: 5, alignItems: "center" }}>
                                  <span style={{ fontSize: 9, fontWeight: 800, color: tc, fontFamily: "monospace" }}>{type}</span>
                                  <span style={{ fontSize: 8, color: "#9ca3af" }}>{v.hits}/{v.total}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>)}
                    </div>
                  )}
                </div>
              );
            })()}
            {/* ── END DIGEST ───────────────────────────────── */}

            {/* Filter buttons */}
            <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
              {["all","pending","hit","miss"].map(f => (
                <button key={f} onClick={() => setPicksFilter(f)}
                  style={{ flex: 1, background: picksFilter === f ? "#a78bfa" : "#161827", border: `1px solid ${picksFilter === f ? "#a78bfa" : "#1f2437"}`, borderRadius: 6, padding: "5px 0", fontSize: 9, color: picksFilter === f ? "#000" : "#6b7280", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
                  {f}
                </button>
              ))}
            </div>

            {/* Pick cards */}
            {filtered.length === 0 ? (
              <Card>
                <div style={{ textAlign: "center", padding: "18px 0" }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", marginBottom: 6 }}>No picks yet</div>
                  <div style={{ fontSize: 10, color: "#4b5563", lineHeight: 1.5 }}>Go to a game → Props tab → tap ＋ on any prop to log it here.</div>
                </div>
              </Card>
            ) : filtered.map(p => (
              <Card key={p.id} style={{ borderColor: p.result === "hit" ? "rgba(34,197,94,0.25)" : p.result === "miss" ? "rgba(239,68,68,0.25)" : "#1f2437" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>{p.date} · {p.game}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", lineHeight: 1.4 }}>{p.label}</div>
                  </div>
                  <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0, marginLeft: 8 }}>
                    <LeanBadge label={p.lean} positive={p.lean === "OVER"} small />
                    <button
                      onClick={() => {
                        const resultStr = p.result === "hit" ? " ✓ HIT" : p.result === "miss" ? " ✗ MISS" : "";
                        const text = `${p.label} · ${p.lean} · ${p.confidence}% confidence · ${p.game}${resultStr}`;
                        navigator.clipboard.writeText(text).then(() => {
                          setCopiedPickId(p.id);
                          setTimeout(() => setCopiedPickId(null), 2000);
                        }).catch(() => {});
                      }}
                      title="Copy pick to clipboard"
                      style={{ background: "none", border: "none", color: copiedPickId === p.id ? "#22c55e" : "#4b5563", fontSize: 11, cursor: "pointer", padding: "0 2px", lineHeight: 1, transition: "color 0.15s" }}>
                      {copiedPickId === p.id ? "✓" : "⎘"}
                    </button>
                    <button onClick={() => deletePick(p.id)} title="Remove pick" style={{ background: "none", border: "none", color: "#4b5563", fontSize: 12, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>✕</button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: p.result ? 0 : 8 }}>
                  <div style={{ flex: 1, height: 4, background: "#1e2030", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${p.confidence}%`, height: "100%", background: p.lean === "OVER" ? "#22c55e" : "#ef4444", borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", flexShrink: 0 }}>{p.confidence}%</div>
                </div>
                {p.result ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: p.result === "hit" ? "#22c55e" : "#ef4444", background: p.result === "hit" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${p.result === "hit" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: 6, padding: "3px 10px" }}>
                      {p.result === "hit" ? "✓ HIT" : "✗ MISS"}
                    </div>
                    <button onClick={() => markResult(p.id, null)} style={{ fontSize: 9, color: "#4b5563", background: "none", border: "none", cursor: "pointer" }}>undo</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => markResult(p.id, "hit")}
                      style={{ flex: 1, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 6, padding: "6px", fontSize: 10, color: "#22c55e", fontFamily: "monospace", fontWeight: 700, cursor: "pointer" }}>
                      ✓ HIT
                    </button>
                    <button onClick={() => markResult(p.id, "miss")}
                      style={{ flex: 1, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, padding: "6px", fontSize: 10, color: "#ef4444", fontFamily: "monospace", fontWeight: 700, cursor: "pointer" }}>
                      ✗ MISS
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </>);
        })()}

        {/* ════════════════════════════════════
            BOARD VIEW — HR / Hits / K Props / Outs
        ════════════════════════════════════ */}
        {view === "board" && (() => {
          const isPitcherBoard = boardTab === "k" || boardTab === "outs";
          const boardCandidatesByType = {
            hr:   computeBatterBoard("hr", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits),
            hits: computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits),
            k:    computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps),
            outs: computePitcherBoard("outs", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps),
          };
          const boardCandidates = boardCandidatesByType[boardTab] ?? [];
          const totalPitcherSlots = isPitcherBoard
            ? (activeSlate ?? []).filter(g => g.pitcher?.id || g.awayPitcher?.id).length * 2
            : 0;
          const totalBatters = isPitcherBoard
            ? totalPitcherSlots
            : Object.values(liveLineups).flatMap(lu => [...(lu.away ?? []), ...(lu.home ?? [])]).length;
          const loadedBatters = boardCandidates.length;

          const scoreColor = (s) =>
            s >= 70 ? "#22c55e" : s >= 55 ? "#f59e0b" : s >= 40 ? "#ef4444" : "#6b7280";

          const getBoardGameStatus = (gamePk) => {
            const game = (activeSlate ?? []).find(g => (g.gamePk ?? g.id) === gamePk);
            const status = game?.status ?? "";
            if (status === "In Progress" || status === "Warmup") return "LIVE";
            if (status === "Final" || status === "Game Over") return "FINAL";
            return null;
          };

          const boardOutcome = (type, item) => {
            const id = item.id;
            const result = liveBoardResults[id];
            if (!result || result.live) return null;

            if (type === "hr") return result.ab > 0 ? result.hr > 0 : null;
            if (type === "hits") return result.ab > 0 ? result.h > 0 : null;

            const line = item.propLine?.line ?? item.suggestedLine;
            const lean = item.score >= 55 ? "OVER" : "UNDER";
            if (line === null || line === undefined) return null;

            if (type === "k" || item.propType === "K" || item.market === "pitcher_strikeouts") {
              if (result.k === undefined) return null;
              return lean === "UNDER" ? result.k < line : result.k > line;
            }

            if (type === "outs" || item.propType === "Outs" || item.market === "pitcher_outs_recorded") {
              if (result.outs === undefined) return null;
              return lean === "UNDER" ? result.outs < line : result.outs > line;
            }

            return null;
          };

          const hitSummary = (type, items) => {
            if (!items.length) return null;
            const resolved = items
              .map(item => boardOutcome(type, item))
              .filter(v => v !== null);
            return {
              hits: resolved.filter(Boolean).length,
              total: items.length,
            };
          };

          const tabHitSummary = {
            hr:    hitSummary("hr", boardCandidatesByType.hr),
            hits:  hitSummary("hits", boardCandidatesByType.hits),
            k:     hitSummary("k", boardCandidatesByType.k),
            outs:  hitSummary("outs", boardCandidatesByType.outs),
          };

          return (
            <div>
              {/* Toggle */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[["hr", "⚾ HR"], ["hits", "🎯 Hits"], ["k", "⚡ K"], ["outs", "📋 Outs"]].map(([type, label]) => (
                  <button key={type} onClick={() => setBoardTab(type)}
                    style={{ position: "relative", flex: 1, background: boardTab === type ? "#fbbf24" : "#161827",
                      border: `1px solid ${boardTab === type ? "#fbbf24" : "#1f2437"}`,
                      borderRadius: 8, padding: "7px", fontSize: 11, fontFamily: "monospace",
                      fontWeight: 700, color: boardTab === type ? "#000" : "#9ca3af", cursor: "pointer" }}>
                    {label}
                    {tabHitSummary[type] && (
                      <span style={{ position: "absolute", top: -7, right: -5, background: tabHitSummary[type].hits > 0 ? "#22c55e" : "#374151", color: tabHitSummary[type].hits > 0 ? "#03140a" : "#d1d5db", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999, padding: "1px 5px", fontSize: 7, fontWeight: 900, lineHeight: 1.2, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                        {tabHitSummary[type].hits}/{tabHitSummary[type].total} hit
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Sub-header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {boardTab === "hr" ? "Ranked by power · park · wind · matchup"
                   : boardTab === "hits" ? "Ranked by avg · recent form · park · matchup"
                   : boardTab === "k" ? "Ranked by K/9 · umpire · pitch mix · park · recent form"
                   : "Ranked by avg IP · control · recent workload · park"}
                </span>
                <span style={{ fontSize: 9, color: "#4b5563", fontFamily: "monospace" }}>
                  {isPitcherBoard
                    ? (totalPitcherSlots > 0 ? `${loadedBatters}/${totalPitcherSlots} loaded` : `${(activeSlate ?? []).length} games · awaiting pitchers`)
                    : `${loadedBatters}/${totalBatters || "?"} loaded`}
                </span>
              </div>

              {boardCandidates.length === 0 ? (
                <Card>
                  <div style={{ textAlign: "center", padding: "24px 0", color: "#6b7280", fontSize: 11 }}>
                    {isPitcherBoard
                      ? (!activeSlate?.length ? "Loading today's slate…"
                         : totalPitcherSlots === 0 ? "No probable pitchers announced yet — check back closer to first pitch"
                         : "Loading pitcher stats…")
                      : (() => {
                          const confirmedCount = Object.values(liveLineups).filter(lu => lu?.confirmed).length;
                          const totalGames = (activeSlate ?? []).length;
                          if (totalGames === 0) return "Loading today's slate…";
                          if (confirmedCount === 0) return "Waiting for confirmed lineups — check back closer to first pitch";
                          return `${confirmedCount} lineup${confirmedCount > 1 ? "s" : ""} confirmed — loading player stats…`;
                        })()}
                  </div>
                </Card>
              ) : boardCandidates.map((c, i) => {
                const sc = scoreColor(c.score);

                if (isPitcherBoard) {
                  // ── Pitcher card (K Props / Outs) ──────────────────────────
                  const boardGameStatus = getBoardGameStatus(c.gamePk);
                  const todayResult = liveBoardResults[c.id] ?? null;
                  const hasResolvedResult = !!todayResult && !todayResult.live;
                  const propLineValue = c.propLine?.line ?? c.suggestedLine;
                  const pitcherHit = hasResolvedResult && propLineValue !== null && propLineValue !== undefined && (
                    boardTab === "k"
                      ? ((c.score >= 55 ? "OVER" : "UNDER") === "UNDER" ? todayResult.k < propLineValue : todayResult.k > propLineValue)
                      : ((c.score >= 55 ? "OVER" : "UNDER") === "UNDER" ? todayResult.outs < propLineValue : todayResult.outs > propLineValue)
                  );
                  const resultBorderColor = hasResolvedResult ? (pitcherHit ? "#22c55e" : "#ef4444") : null;
                  const resultCardStyle = resultBorderColor
                    ? { borderLeft: `3px solid ${resultBorderColor}`, paddingLeft: 10 }
                    : {};
                  return (
                    <Card key={`${c.id}-${c.gamePk}`} style={{ marginBottom: 8, cursor: "pointer", padding: "10px 12px", ...resultCardStyle }} onClick={() => setWhyModal({ c, type: boardTab, rank: i + 1 })}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        {/* Rank */}
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: "#1e2030", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#6b7280", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                        {/* Main info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{c.name}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, color: "#000", background: "#374151", borderRadius: 4, padding: "1px 5px" }}>{c.team}</span>
                            <span style={{ fontSize: 9, color: "#9ca3af" }}>{c.hand}HP</span>
                            {boardGameStatus === "LIVE" && (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 5, padding: "1px 6px" }}>
                                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 5px #ef4444", animation: "pulse 1.2s infinite" }} />
                                <span style={{ fontSize: 8, fontWeight: 700, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.05em" }}>LIVE</span>
                              </div>
                            )}
                            {boardGameStatus === "FINAL" && (
                              <div style={{ background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.3)", borderRadius: 5, padding: "1px 6px" }}>
                                <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.05em" }}>FINAL</span>
                              </div>
                            )}
                            {hasResolvedResult && pitcherHit && (
                              <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 4, padding: "1px 6px" }}>✓ HIT</span>
                            )}
                            {hasResolvedResult && !pitcherHit && (
                              <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>✗ MISS</span>
                            )}
                            {c.umpireRating === "pitcher" && boardTab === "k" && (
                              <span style={{ fontSize: 8, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,0.12)", borderRadius: 4, padding: "1px 5px" }}>⚖ UMP+K</span>
                            )}
                          </div>
                          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
                            vs {c.facingTeam} · {c.gameLabel}
                            {c.umpire && <span style={{ color: "#4b5563" }}> · {c.umpire}</span>}
                          </div>
                          {/* Pitcher stats row */}
                          <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
                            {c.era !== "—" && (
                              <span style={{ fontSize: 10, color: parseFloat(c.era) <= 3.20 ? "#22c55e" : parseFloat(c.era) <= 4.50 ? "#f59e0b" : "#ef4444", fontFamily: "monospace", fontWeight: 700 }}>{c.era} ERA</span>
                            )}
                            {c.k9 !== "—" && boardTab === "k" && (
                              <span style={{ fontSize: 10, color: parseFloat(c.k9) >= 10.0 ? "#22c55e" : parseFloat(c.k9) >= 8.0 ? "#f59e0b" : "#ef4444", fontFamily: "monospace", fontWeight: 700 }}>{c.k9} K/9</span>
                            )}
                            {c.whip !== "—" && (
                              <span style={{ fontSize: 10, color: parseFloat(c.whip) <= 1.10 ? "#22c55e" : parseFloat(c.whip) <= 1.35 ? "#f59e0b" : "#ef4444", fontFamily: "monospace" }}>{c.whip} WHIP</span>
                            )}
                            {c.avgIP !== "—" && c.avgIP && (
                              <span style={{ fontSize: 10, color: parseFloat(c.avgIP) >= 6.0 ? "#22c55e" : parseFloat(c.avgIP) >= 5.0 ? "#f59e0b" : "#9ca3af", fontFamily: "monospace" }}>{c.avgIP} IP/gs</span>
                            )}
                          </div>
                          {/* Prop line + lean row */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                            {c.avgK3 !== null && boardTab === "k" && (
                              <span style={{ fontSize: 9, color: "#d1d5db", fontFamily: "monospace" }}>
                                L3 avg <span style={{ color: "#f9fafb", fontWeight: 700 }}>{c.avgK3}K</span>
                              </span>
                            )}
                            {(() => {
                              const line = c.propLine ? c.propLine.line : c.suggestedLine;
                              if (line === null) return null;
                              const lean = c.score >= 55 ? "OVER" : "UNDER";
                              const positive = lean === "OVER";
                              const conf = Math.min(85, Math.round(50 + (c.score - 40) * 35 / 55));
                              const color  = positive ? "#22c55e" : "#ef4444";
                              const bg     = positive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";
                              const border = positive ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)";
                              const propLabel = boardTab === "k" ? "K" : "Outs";
                              const lineLabel = c.propLine ? `O${line}` : `O/U ~${line}`;
                              const bookLabel = c.propLine ? ` ${c.propLine.overOdds} · ${c.propLine.book}` : "";
                              return (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace" }}>{propLabel} {lineLabel}{bookLabel}</span>
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: "2px 7px", fontSize: 8, fontWeight: 700, color, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                    {lean}
                                  </div>
                                  <span style={{ fontSize: 9, fontWeight: 800, color: conf >= 65 ? "#22c55e" : "#fbbf24", fontFamily: "monospace" }}>{conf}%</span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        {/* Score badge */}
                        <div style={{ flexShrink: 0, width: 44, borderRadius: 10, background: `${sc}22`, border: `1px solid ${sc}55`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5px 0 4px", gap: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: sc, fontFamily: "monospace", lineHeight: 1 }}>{c.score}</span>
                          <span style={{ fontSize: 7, fontWeight: 700, color: sc, fontFamily: "monospace", opacity: 0.7, letterSpacing: "0.05em" }}>WHY?</span>
                        </div>
                      </div>
                    </Card>
                  );
                }

                // ── Batter card (HR / Hits) ────────────────────────────────
                const l5dots = Array.from({ length: 5 }, (_, j) => c.hitRate[j] ?? null);
                const todayResult = liveBoardResults[c.id] ?? null;
                const boardGameStatus = getBoardGameStatus(c.gamePk);
                const hasResult   = todayResult && todayResult.ab > 0;
                const isHrBoard   = boardTab === "hr";
                const gotHR       = hasResult && todayResult.hr > 0;
                const gotHit      = hasResult && todayResult.h > 0 && !gotHR;
                const ohFer       = hasResult && todayResult.h === 0;
                const resultBorderColor = isHrBoard
                  ? (gotHR ? "#fbbf24" : (boardGameStatus === "FINAL" ? "#ef4444" : null))
                  : (gotHR ? "#fbbf24" : (gotHit ? "#22c55e" : (ohFer ? "#ef4444" : null)));
                const resultCardStyle   = resultBorderColor
                  ? { borderLeft: `3px solid ${resultBorderColor}`, paddingLeft: 10 }
                  : {};
                return (
                  <Card key={`${c.id}-${c.gamePk}`} style={{ marginBottom: 8, cursor: "pointer", padding: "10px 12px", ...resultCardStyle }} onClick={() => setWhyModal({ c, type: boardTab, rank: i + 1 })}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      {/* Rank */}
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: "#1e2030", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#6b7280", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>

                      {/* Main info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{c.name}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#000", background: "#374151", borderRadius: 4, padding: "1px 5px" }}>{c.team}</span>
                          <span style={{ fontSize: 9, color: "#6b7280" }}>#{c.order}</span>
                          {boardGameStatus === "LIVE" && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 5, padding: "1px 6px" }}>
                              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 5px #ef4444", animation: "pulse 1.2s infinite" }} />
                              <span style={{ fontSize: 8, fontWeight: 700, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.05em" }}>LIVE</span>
                            </div>
                          )}
                          {boardGameStatus === "FINAL" && (
                            <div style={{ background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.3)", borderRadius: 5, padding: "1px 6px" }}>
                              <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.05em" }}>FINAL</span>
                            </div>
                          )}
                          {/* Today's result badge */}
                          {gotHR  && <span style={{ fontSize: 8, fontWeight: 800, color: "#fbbf24", background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 4, padding: "1px 6px" }}>⚾ HR{todayResult.hr > 1 ? ` ×${todayResult.hr}` : ""}</span>}
                          {!isHrBoard && gotHit && <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.12)",  border: "1px solid rgba(34,197,94,0.35)",  borderRadius: 4, padding: "1px 6px" }}>✓ HIT{todayResult.h > 1 ? ` ×${todayResult.h}` : ""}</span>}
                          {!isHrBoard && boardGameStatus === "FINAL" && ohFer && (
                            <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>✗ NO HIT</span>
                          )}
                          {isHrBoard && boardGameStatus === "FINAL" && !gotHR && (
                            <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>✗ NO HR</span>
                          )}
                          {c.windFav && boardTab === "hr" && (
                            <span style={{ fontSize: 8, fontWeight: 700, color: "#fbbf24", background: "rgba(251,191,36,0.12)", borderRadius: 4, padding: "1px 5px" }}>↑ WIND</span>
                          )}
                        </div>
                        <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
                          vs {c.pitcher} ({c.pitcherHand}HP) · {c.gameLabel}
                        </div>
                        {/* Stats row */}
                        <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
                          {c.avg !== "—" && (
                            <span style={{ fontSize: 10, color: parseFloat(c.avg) >= 0.280 ? "#22c55e" : parseFloat(c.avg) >= 0.240 ? "#f59e0b" : "#ef4444", fontFamily: "monospace", fontWeight: 700 }}>{c.avg} AVG</span>
                          )}
                          {boardTab === "hr" && c.hr > 0 && (
                            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", fontWeight: 600 }}>{c.hr} HR</span>
                          )}
                          {c.slg !== "—" && c.slg !== ".000" && boardTab === "hr" && (
                            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>{c.slg} SLG</span>
                          )}
                          {c.ops !== "—" && (
                            <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>{c.ops} OPS</span>
                          )}
                          {c.parkFactor !== 1.0 && (
                            <span style={{ fontSize: 9, color: c.parkFactor >= 1.10 ? "#22c55e" : c.parkFactor <= 0.93 ? "#ef4444" : "#6b7280", fontFamily: "monospace" }}>
                              {boardTab === "hr" ? "HR" : "HIT"} {c.parkFactor >= 1.0 ? "+" : ""}{((c.parkFactor - 1) * 100).toFixed(0)}% park
                            </span>
                          )}
                        </div>
                        {/* L5 dots + prop odds */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                          <div style={{ display: "flex", gap: 3 }}>
                            {l5dots.map((v, j) => (
                              <div key={j} style={{ width: 7, height: 7, borderRadius: "50%",
                                background: v === 1 ? "#22c55e" : v === 0 ? "#374151" : "#1e2030",
                                border: v === null ? "1px solid #374151" : "none" }} />
                            ))}
                          </div>
                          {c.propLine && (
                            <span style={{ fontSize: 9, color: "#38bdf8", fontFamily: "monospace" }}>
                              {boardTab === "hr" ? "HR" : "H"} O{c.propLine.line} {c.propLine.overOdds} · {c.propLine.book}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Score badge */}
                      <div style={{ flexShrink: 0, width: 44, borderRadius: 10, background: `${sc}22`, border: `1px solid ${sc}55`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5px 0 4px", gap: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: sc, fontFamily: "monospace", lineHeight: 1 }}>{c.score}</span>
                        <span style={{ fontSize: 7, fontWeight: 700, color: sc, fontFamily: "monospace", opacity: 0.7, letterSpacing: "0.05em" }}>WHY?</span>
                      </div>
                    </div>
                    </Card>
                  );
                })}
            </div>
          );
        })()}

        {/* Footer */}
        <div style={{ marginTop: 10 }}>
          {/* User row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
                👤 <span style={{ color: "#9ca3af" }}>{currentUser?.username ?? "—"}</span>
              </div>
              <button
                onClick={() => setShowHelp(true)}
                style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.35)", borderRadius: 8, padding: "7px 12px", fontSize: 13, color: "#818cf8", fontFamily: "monospace", cursor: "pointer", fontWeight: 700, minHeight: 36, lineHeight: 1 }}
                title="Help & Glossary"
              >?</button>
            </div>
            <button
              onClick={handleLogout}
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "7px 16px", fontSize: 12, color: "#f87171", fontFamily: "monospace", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, minWidth: 90, minHeight: 36 }}
            >
              Sign Out
            </button>
          </div>
          {/* Data source line */}
          <div style={{ fontSize: 10, color: "#374151", textAlign: "center", lineHeight: 1.8 }}>
            {(() => {
              const allMock  = IS_SANDBOX && IS_ODDS_SANDBOX && IS_STATS_SANDBOX;
              const allLive  = !IS_SANDBOX && !IS_ODDS_SANDBOX && !IS_STATS_SANDBOX;
              if (allMock)  return "⚠ Demo mode — all mock data · Flip IS_SANDBOX / IS_ODDS_SANDBOX / IS_STATS_SANDBOX to go live";
              if (allLive)  return "⚡ Full live mode — weather · odds · MLB stats · Savant arsenal & splits";
              const parts = [];
              if (!IS_SANDBOX)        parts.push("Weather: LIVE");
              if (!IS_ODDS_SANDBOX)   parts.push("Odds: LIVE");
              if (!IS_STATS_SANDBOX)  parts.push("MLB Stats: LIVE");
              if (!IS_SAVANT_SANDBOX) parts.push("Savant: LIVE");
              if (IS_SANDBOX)         parts.push("Weather: demo");
              if (IS_ODDS_SANDBOX)    parts.push("Odds: demo");
              if (IS_STATS_SANDBOX)   parts.push("Stats: demo");
              if (IS_SAVANT_SANDBOX)  parts.push("Savant: demo");
              return `⚡ ${parts.join(" · ")}`;
            })()}
          </div>
        </div>
      </div>
      {/* ── Why? Modal ── */}
      {whyModal && (() => {
        const { c, type, rank } = whyModal;
        const factors = generateWhyFactors(c, type);
        const sc = c.score >= 70 ? "#22c55e" : c.score >= 55 ? "#f59e0b" : c.score >= 40 ? "#ef4444" : "#6b7280";
        const conf = Math.min(85, Math.round(50 + (c.score - 40) * 35 / 55));
        const lean = c.score >= 55 ? "OVER" : "UNDER";
        const leanColor = lean === "OVER" ? "#22c55e" : "#ef4444";
        const typeLabel = type === "k" ? "⚡ K PROPS" : type === "outs" ? "📋 OUTS" : type === "hr" ? "⚾ HR" : "🎯 HITS";
        return (
          <div
            onClick={() => setWhyModal(null)}
            style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", maxWidth: 440, background: "#161827", borderRadius: 16, border: "1px solid #1f2437", maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              {/* Header */}
              <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #1f2437", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                    #{rank} · {typeLabel}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{c.gameLabel}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: sc, fontFamily: "monospace", lineHeight: 1 }}>{c.score}</div>
                    <div style={{ fontSize: 8, color: "#6b7280", fontFamily: "monospace", marginTop: 2 }}>SCORE</div>
                  </div>
                  <button
                    onClick={() => setWhyModal(null)}
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid #2d3148", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#9ca3af", cursor: "pointer" }}
                  >✕</button>
                </div>
              </div>

              {/* Factor list */}
              <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {factors.length === 0 && (
                  <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", textAlign: "center", padding: "20px 0" }}>No factor data available.</div>
                )}
                {factors.map((f, idx) => {
                  const pct = f.max > 0 ? Math.max(0, Math.min(1, f.pts / f.max)) : 0;
                  const barColor = f.pts >= f.max * 0.7 ? "#22c55e" : f.pts >= f.max * 0.4 ? "#f59e0b" : f.pts > 0 ? "#ef4444" : "#374151";
                  return (
                    <div key={idx} style={{ background: "#1a1c2e", border: "1px solid #1f2437", borderRadius: 10, padding: "9px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#d1d5db", fontFamily: "monospace" }}>{f.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, color: barColor, fontFamily: "monospace" }}>{f.pts > 0 ? "+" : ""}{f.pts} / {f.max}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: "#0b0c17", marginBottom: 5, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct * 100}%`, background: barColor, borderRadius: 2 }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>{f.value}</span>
                        <span style={{ fontSize: 9, color: "#4b5563", fontFamily: "monospace", fontStyle: "italic" }}>{f.detail}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{ padding: "12px 16px 20px", borderTop: "1px solid #1f2437", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#161827" }}>
                <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>
                  {c.score >= 70 ? "Strong play — multiple positive signals" : c.score >= 55 ? "Moderate edge — worth a look" : c.score >= 40 ? "Weak — proceed with caution" : "Skip — insufficient edge"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <div style={{ background: lean === "OVER" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${leanColor}55`, borderRadius: 8, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: leanColor }} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: leanColor, fontFamily: "monospace" }}>{lean}</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 900, color: conf >= 65 ? "#22c55e" : "#fbbf24", fontFamily: "monospace" }}>{conf}%</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Help Overlay ── */}
      {showHelp && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "#0b0c17", overflowY: "auto", padding: "0 0 40px 0" }}>
          {/* Header */}
          <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#0b0c17", borderBottom: "1px solid #1f2437", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb", fontFamily: "monospace", letterSpacing: "0.05em" }}>⚾ PROP SCOUT GUIDE</div>
            <button onClick={() => setShowHelp(false)} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid #2d3148", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#9ca3af", fontFamily: "monospace", cursor: "pointer", fontWeight: 700 }}>✕ CLOSE</button>
          </div>

          <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Color Guide */}
            {(() => {
              const Section = ({ title, children }) => (
                <div style={{ background: "#161827", border: "1px solid #1f2437", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ background: "#1a1c2e", padding: "9px 14px", fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>{title}</div>
                  <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
                </div>
              );
              const Row = ({ color, label, sub }) => (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", fontFamily: "monospace" }}>{label}</div>
                    {sub && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
                  </div>
                </div>
              );
              const Stat = ({ term, def }) => (
                <div style={{ borderBottom: "1px solid #1f2437", paddingBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", fontFamily: "monospace" }}>{term}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3, lineHeight: 1.5 }}>{def}</div>
                </div>
              );
              const PropRow = ({ type, def }) => (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700, color: "#22c55e", fontFamily: "monospace", flexShrink: 0, minWidth: 44, textAlign: "center" }}>{type}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{def}</div>
                </div>
              );
              return (<>
                <Section title="🃏 Reading the Slate Card">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                    Each game card in the Slate view packs several data points into a compact layout. Here's what everything means:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["Selected card", "The active game is highlighted with a green background and border — tap any card to open that game."],
                      ["O/U  7  •", "The total runs line for the game. The green dot means live odds are loaded. Bet over or under this number."],
                      ["ML  +126 / -148", "Moneyline — the odds to win the game outright. Away team listed first. Positive (+) = underdog, negative (−) = favorite."],
                      ["O/U Odds  −110 / −110", "The juice (vig) on the over and under. −110 is standard. When uneven (e.g. −115 / −105) the book is shading one side — that's often where sharp money sits."],
                      ["RL  +1.5(−168) / −1.5(+142)", "Runline — MLB's version of the spread. Always ±1.5 runs. The underdog gets +1.5 (must lose by 1 or win outright to cover). The favorite gives −1.5 (must win by 2+). The number in parentheses is the price."],
                      ["NRFI badge", "Model leans toward No Run First Inning with 62%+ confidence. Only shown on green-bordered cards where the signal is strong enough to act on — gray or amber borders mean the lean isn't confident enough to display."],
                      ["Temperature / DOME badge", "Live weather at game time from Open-Meteo. Cold temps suppress offense. DOME = retractable roof stadium, climate controlled."],
                      ["↑ OVER / ↓ UNDER badge", "Line movement detected — the total shifted up or down from its opening number. Sharp bettors often drive these moves, so it's a useful fade or follow signal."],
                      ["FINAL score row", "On completed games the right column switches to results: final score, O/U result (green O or red U), ML winner + their line, and RL result (−1.5 if the favorite covered, +1.5 if the dog covered). A small NRFI ✓ or YRFI chip shows whether the first inning was scoreless."],
                      ["● LIVE  3–1 ▼6", "In-progress games show a live score chip: away–home runs, a ▲/▼ arrow for top/bottom of the inning, and the current inning number. Updates every 60 seconds."],
                      ["⚠ SP IL", "One of the probable starting pitchers has an active IL placement in the last 14 days. Could mean a bullpen game — verify before betting K props or Outs lines."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#22c55e", fontFamily: "monospace", flexShrink: 0, minWidth: 60, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="🎨 Color Guide — What Do the Colors Mean?">
                  <Row color="#22c55e" label="Green  →  Pitcher Edge (score < 35)" sub="The pitcher has the advantage in this matchup. Good for K props and unders." />
                  <Row color="#fbbf24" label="Yellow  →  Neutral (score 35–54)" sub="No clear edge either way. Look for other factors before betting." />
                  <Row color="#ef4444" label="Red  →  Batter Edge (score 55+)" sub="The batter has the advantage. Good for hit, TB, and HR props." />
                  <Row color="#a78bfa" label="Purple  →  Picks & logged data" sub="Used for your saved prop picks and the picks tracker." />
                  <div style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, padding: "10px 12px", marginTop: 4 }}>
                    <div style={{ fontSize: 11, color: "#818cf8", lineHeight: 1.6 }}>
                      <strong style={{ color: "#a78bfa" }}>Quick rule:</strong> Green favors the pitcher, red favors the batter. A red matchup score on a hitter = good spot for a hits or TB prop. A green matchup score = good spot for a K prop, Outs over, or under.
                    </div>
                  </div>
                </Section>

                <Section title="📊 How the Matchup Score Works">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                    Each batter gets a <span style={{ color: "#f9fafb", fontWeight: 700 }}>0–100 matchup score</span> based on how they historically perform against the pitcher's specific pitch types (fastball, slider, curveball, etc.).
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[["AVG vs pitch type", "45%", "How often they get a hit on that pitch"], ["Whiff rate", "35%", "How often they swing and miss (lower = batter wins)"], ["Slugging vs pitch", "20%", "Power when they make contact"]].map(([f, w, d]) => (
                      <div key={f} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", fontFamily: "monospace", minWidth: 36, marginTop: 1 }}>{w}</div>
                        <div>
                          <div style={{ fontSize: 11, color: "#f9fafb", fontWeight: 600 }}>{f}</div>
                          <div style={{ fontSize: 10, color: "#6b7280" }}>{d}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: "#86efac", fontWeight: 700, marginBottom: 4 }}>Pitcher Wins / Batter Wins boxes</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                      Below the overall score you'll see two boxes breaking it down by <strong style={{ color: "#f9fafb" }}>individual pitch type</strong>. For example:<br />
                      <span style={{ color: "#22c55e" }}>Pitcher Wins: CH · SL</span> — the batter struggles against the changeup and slider (low AVG, high whiff rate).<br />
                      <span style={{ color: "#ef4444" }}>Batter Wins: FF · SI</span> — the batter handles the fastball and sinker well.<br /><br />
                      Even if the overall score is neutral, this tells you <em>why</em>. If the pitcher leans on his "wins" pitches, it boosts K and under props. If he's forced into the batter's "wins" pitches, hit and TB props get a bump.
                    </div>
                  </div>
                  <div style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: "#fde68a", fontWeight: 700, marginBottom: 4 }}>Pitch scouting notes</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.7 }}>
                      Each pitch card shows a one-line note describing how the batter matches up against it. These are generated from their actual stats:<br />
                      <span style={{ color: "#f9fafb" }}>"Crushes elevated FF"</span> — high AVG + low whiff on fastballs. Batter handles it well.<br />
                      <span style={{ color: "#f9fafb" }}>"Chases in the dirt"</span> — swings at breaking balls below the zone. High whiff rate.<br />
                      <span style={{ color: "#f9fafb" }}>"Drives sinker well"</span> — solid contact on sinkers. Good AVG vs that pitch.<br />
                      <span style={{ color: "#f9fafb" }}>"Chases down and away"</span> — gets fooled by sliders/changeups off the outer edge.<br />
                      <span style={{ color: "#f9fafb" }}>"Severe weakness — high K exposure"</span> — AVG under .180 or whiff over 40%. Prime K prop pitch.<br /><br />
                      <span style={{ color: "#818cf8" }}>💡 Tip: go to the <strong>Lineup tab</strong> and expand any batter — their drawer shows real Statcast splits against this pitcher's arsenal along with a live H2H matchup score.</span>
                    </div>
                  </div>
                  <div style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 700, marginBottom: 4 }}>Handedness penalty</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                      Same-hand matchups (RHP vs RHB, LHP vs LHB) apply an <span style={{ color: "#f9fafb", fontWeight: 600 }}>8% score reduction</span> across all pitch components. Breaking balls naturally run away from same-handed batters, giving the pitcher a built-in edge. Opposite-hand matchups (RHP vs LHB) get no penalty — historically easier for the batter.
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                    The <span style={{ color: "#f9fafb", fontWeight: 700 }}>Confidence Meter</span> (0–100%) on each prop shows how strongly the engine leans. <span style={{ color: "#22c55e" }}>70%+</span> is a strong signal worth considering.
                  </div>
                </Section>

                <Section title="📋 Overview Tab — What's on Each Card">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6, marginBottom: 4 }}>
                    The Overview tab gives you a quick pre-game read on the starter and how the opposing lineup matches up. Three cards:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["Pitcher Card", "Season ERA, WHIP, K/9, BB/9, avg IP/K/PC/ER, and a sparkline of recent outings. Shows W-L record and how many of his last 5 starts were clean (0 ER). A red ⚠ IL badge next to the pitcher name means he has an active IL placement — verify before logging any K or Outs props. Use this for K props and Outs lines."],
                      ["Lineup Matchup Intel", "Counts how many RHB, LHB, and switch hitters are in the opposing lineup vs the pitcher's hand — higher same-hand count = pitcher edge. Shows the aggregate matchup score across all opposing batters and flags the top 3 danger hitters by score. Use this for deciding whether to lean Over or Under on team runs."],
                      ["Game Lean Card", "NRFI lean derived from both SPs' clean-start rate (0 ER starts / recent starts). F5 lean from combined SP ERA. Quick directional read for F5 and NRFI props."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#a78bfa", fontFamily: "monospace", flexShrink: 0, minWidth: 60, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="🔍 Reading the Intel Tab">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6, marginBottom: 4 }}>
                    The Intel tab covers four pre-game context layers: umpire, first inning tendencies, bullpen health, and odds/line movement.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["Umpire Card", "Shows the home plate ump with a SCORECARD LIVE badge when real UmpScorecards data is loaded. Four accuracy metrics: Accuracy (overall ball/strike %, avg ~92–93%), vs Exp (how many points above/below expected — positive is sharper), Consistency (zone reliability across the game), and Favor/Gm (run impact per game). Without live data, falls back to historical K Rate / BB Rate estimates. Badge: ACCURATE (≥+0.5% vs expected), INCONSISTENT (≤−1.0%), or PITCHER/NEUTRAL UMP from static data."],
                      ["NRFI / YRFI Card", "First inning scoring tendencies for both teams — scored % of games and avg 1st inning runs. Lean (NRFI or YRFI) with a confidence %. The NRFI badge on the slate card only shows when confidence hits 62%+."],
                      ["Bullpen Card", "Grade (A–C), fatigue level (FRESH / MODERATE / HIGH based on pitches thrown last 3 days), setup depth, and L/R balance. Expand the Relievers drawer to see each arm: ERA, WHIP, Last App, Pitches from last outing, K/9 (swing-and-miss rate — 10+ is elite), and BB/9 (walk rate — under 3 is sharp). High fatigue + thin depth = lean toward OVER on totals and caution on F5 unders."],
                      ["Odds & Line Movement", "Multi-book table (DK / FD / CZR / MGM) showing moneyline, total, O/U odds, and runline for each book. Missing books omitted. Shows PRE-GAME LINES for in-progress and final games (The Odds API removes games at first pitch). Line movement arrow on the slate card shows direction the total shifted from open."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#38bdf8", fontFamily: "monospace", flexShrink: 0, minWidth: 60, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="🏆 Board View — HR / Hits / K Props / Outs">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                    The <span style={{ color: "#fbbf24", fontWeight: 700 }}>Board</span> tab ranks every player across the full day's slate by prop attractiveness. Four tabs cover batters (⚾ HR, 🎯 Hits) and starting pitchers (⚡ K Props, 📋 Outs). Use it to quickly spot the best individual player props without opening each game manually. <span style={{ color: "#fbbf24", fontWeight: 600 }}>Tap any card to see a full factor breakdown explaining why the score is what it is.</span>
                  </div>

                  {/* Board scoring tabs */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["⚾ HR tab", "Scores every batter in today's lineups for HR prop attractiveness. Key factors: SLG/power profile, season HR pace, park HR factor, wind direction, batting order spot, and platoon hand split. Coors Field, Great American Ball Park, and wind-out parks push scores up significantly. A score of 70+ means multiple factors are aligned — power hitter, friendly park, favorable order spot."],
                      ["🎯 Hits tab", "Scores batters for getting at least 1 hit. Key factors: season AVG, last-7 game form (recent hot/cold streaks carry heavy weight), park hit factor, batting order, and platoon split. Leadoff and 2-hole hitters score higher due to extra plate appearances. A score of 70+ usually means a hitter batting .280+ who's been hitting in 5 of his last 7 games in a hitter-friendly park."],
                      ["⚡ K Props tab", "Scores starting pitchers for strikeout over props. Key factors: K/9 rate (career strikeout ability), last-3-start average Ks (recent form), park K factor (some parks suppress contact), umpire zone tendencies (tight zone = more Ks), and WHIP (control — pitchers with low WHIP stay in games longer to rack up Ks). A score of 80+ means an elite strikeout pitcher in a favorable environment with an ump who rings people up."],
                      ["📋 Outs tab", "Scores starting pitchers for outs recorded (innings pitched) props. Key factors: average IP over recent starts (the biggest signal — deep starters score highest), WHIP and control (high walk rates drive up pitch counts and shorten outings), season ERA (struggling pitchers get pulled earlier), and park environment. A score of 80+ means a pitcher who consistently goes 6+ innings with strong control."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace", flexShrink: 0, minWidth: 70, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>


                  {/* Why modal section */}
                  <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", fontFamily: "monospace" }}>WHY? Modal — Reading the Factor Breakdown</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                      Tap any card on the Board to open the <span style={{ color: "#f9fafb", fontWeight: 600 }}>Why? modal</span> — a breakdown of exactly which factors drove the score up or down.
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        ["Score (top right)", "The 0–95 board score. This is the authoritative number used to rank all players. Green = 70+, amber = 55–69, red = 40–54, gray = below 40."],
                        ["Factor rows", "Each row is one scoring input (e.g. K/9, Park factor, Umpire). The bar fills green when that factor is strongly in your favor, amber for partial credit, red for a negative signal. The +X / Y number shows how many points that factor contributed out of its maximum possible."],
                        ["Progress bar color", "Green bar = strong positive signal for that factor. Amber = moderate. Red = weak or negative. Dark (no fill) = neutral or no data available (e.g. umpire TBD)."],
                        ["OVER / UNDER lean", "Derived from the score: 55+ = OVER lean (the edge is in favor of the prop hitting), below 55 = UNDER lean. Green = over, red = under."],
                        ["Confidence %", "A scaled version of the score mapped to a 50–85% range. 50% means no edge, 85% is the ceiling for the strongest plays. It is not a win probability — it reflects how many signals are aligned, not how often it will hit."],
                        ["What a high score doesn't mean", "A score of 95 doesn't guarantee the prop hits. It means all the factors the model can see (stats, park, umpire, weather) are pointing in the same direction. Use it as one input alongside line shopping, injury news, and your own read."],
                      ].map(([label, desc]) => (
                        <div key={label} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#818cf8", fontFamily: "monospace", minWidth: 90, flexShrink: 0, marginTop: 1 }}>{label}</div>
                          <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Badges and indicators */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["⚖ UMP+K badge", "K Props tab only. Flags games where the home plate umpire historically favors pitchers — tight zone, elevated K rate. A notable tailwind for strikeout overs. A pitcher scoring 70+ with this badge is among the strongest K prop setups of the day."],
                      ["↑ WIND badge", "HR tab only. Wind is blowing out to center or right field — historically adds ~5–8% to HR rates. Combined with a power hitter and a homer-friendly park, this is a strong environmental edge."],
                      ["L5 dots", "Batter tabs only. Last 5 games: green dot = got at least 1 hit that game, dark dot = hitless. Five green dots = on a tear. Three or fewer = cold. Use this alongside the season AVG to separate a hot hitter from a paper stat."],
                      ["L3 avg K", "K Props tab only. Average strikeouts per start over the pitcher's last 3 outings. If the sportsbook line is 5.5 Ks and his L3 avg is 8.0, that's a meaningful gap in your favor. If it's 5.0 vs a 6.5 line, the over needs more work."],
                      ["Prop line", "If sportsbook data is loaded, shows the over line and odds directly on the card. A synthetic line (~X.X) is shown when book data is unavailable, derived from the pitcher's recent stats."],
                      ["X/Y loaded", "How many players have full stats loaded vs total expected. Cards fill in as lineups post and stats fetch in the background — the board gets more accurate as the day progresses and lineups confirm."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace", flexShrink: 0, minWidth: 70, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: "#86efac", fontWeight: 700, marginBottom: 4 }}>💡 How to use the Board effectively</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.7 }}>
                      <span style={{ color: "#f9fafb" }}>1. Start with score 70+.</span> These are the plays where multiple signals agree. Below 70, you're often leaning on one or two factors.<br />
                      <span style={{ color: "#f9fafb" }}>2. Tap the card and read the factors.</span> A 75 score built on K/9 + umpire + WHIP is more reliable than a 75 built mostly on K/9 alone with weak bars elsewhere.<br />
                      <span style={{ color: "#f9fafb" }}>3. Cross-check with the Game tab.</span> Open the game for the full pitcher card, lineup matchups, and Intel (umpire zone, bullpen, line movement).<br />
                      <span style={{ color: "#f9fafb" }}>4. Watch for TBD umpires.</span> Umpire is one of the highest-weight factors for K Props. A TBD ump means partial credit — rescore mentally once the assignment is posted (usually ~3 hrs before first pitch).<br />
                      <span style={{ color: "#f9fafb" }}>5. Outs props need deep starters.</span> If the avg IP row on the Outs card is below 5.0 IP, the score likely came from control/ERA factors. Shorter starters are risky for outs overs even with good numbers.
                    </div>
                  </div>
                </Section>

                <Section title="🎯 Prop Types Explained">
                  <PropRow type="K" def="Pitcher strikeouts — Over/Under on how many batters the starter fans. High K/9 + green matchup scores = good over spot." />
                  <PropRow type="Outs" def="Pitcher outs recorded — Over/Under on how many outs the starter gets before leaving the game. 3 outs = 1 inning. A line of 17.5 means roughly 6 innings. Elite control (low WHIP + BB/9) and a weak lineup push this over." />
                  <PropRow type="Hits" def="Batter hits — typically Over 0.5 hits (get at least one hit) or Under 1.5. Red matchup score = good over spot." />
                  <PropRow type="TB" def="Total Bases — counts singles (1), doubles (2), triples (3), home runs (4). Over 1.5 TB is a popular line." />
                  <PropRow type="HR" def="Home Run — will this batter hit at least one HR? Looks at power metrics, park factor, and pitcher tendencies." />
                  <PropRow type="F5" def="First 5 Innings Over/Under — the game total through just the first 5 innings. Depends heavily on starting pitchers since relievers haven't entered yet." />
                  <PropRow type="NRFI" def="No Run First Inning — neither team scores in the 1st inning. Good when both SPs have low first-inning scoring rates and low walk rates." />
                  <PropRow type="RBI" def="Runs Batted In — will this batter drive in at least one run? Looks at batting order position, runners on base tendencies, and extra-base hit rate." />
                </Section>

                <Section title="📖 Stat Glossary">
                  {[
                    ["ML", "Moneyline — odds to win the game outright. +150 means bet $100 to win $150. −150 means bet $150 to win $100. The minus side is always the favorite."],
                    ["RL", "Runline — MLB's version of the point spread, always set at ±1.5 runs. The favorite gives 1.5 runs (must win by 2+), the underdog gets 1.5 runs (can lose by 1 and still cover). The price next to it is the juice."],
                    ["O/U Odds", "The juice (vig) attached to each side of the over/under total. Standard is −110/−110 (bet $110 to win $100). When it's uneven like −115/−105, the book is adjusting for lopsided betting action — often a sharp money signal."],
                    ["Line Movement", "A change in the total or moneyline from its opening number. Sharp bettors (wiseguys) tend to move lines early; public bettors move them closer to game time. A line that moves against the public betting direction is called a 'sharp move.'"],
                    ["ERA", "Earned Run Average — runs a pitcher allows per 9 innings pitched. Under 3.00 = elite, 3–4 = solid, 5+ = hittable."],
                    ["WHIP", "Walks + Hits per Inning Pitched. Measures how many baserunners a pitcher allows. Under 1.10 = elite, 1.10–1.30 = average, 1.40+ = concerning."],
                    ["K/9", "Strikeouts per 9 innings. Measures a pitcher's swing-and-miss ability. 10+ = high strikeout pitcher, great for K props."],
                    ["BB/9", "Walks per 9 innings. Measures control. Lower is better — pitchers under 2.5 BB/9 are very controlled."],
                    ["AVG", "Batting Average — hits divided by at-bats. .300+ = excellent hitter, .250 = average, under .220 = struggling."],
                    ["OPS", "On-base Plus Slugging. Combines how often a batter gets on base with their power. .900+ = elite, .800 = solid, under .700 = below average."],
                    ["SLG", "Slugging Percentage — total bases per at-bat. Measures raw power. .500+ = power hitter."],
                    ["wOBA", "Weighted On-Base Average — advanced hitting stat that values each outcome (walk, single, HR, etc.) by how many runs it's worth. .340+ = above average."],
                    ["IP", "Innings Pitched — how deep into the game a starter typically goes. Avg IP of 6+ means they usually work into the late innings."],
                    ["PC", "Pitch Count — average pitches thrown per start. High PC + deep IP = efficient pitcher."],
                    ["K%", "Strikeout rate — percentage of batters struck out. 28%+ is high for a pitcher; above 25% is concerning for a hitter facing this pitcher."],
                    ["HR Factor", "Park Factor for home runs — over 1.0 means the stadium inflates HR rates (hitter-friendly), under 1.0 suppresses them (pitcher-friendly)."],
                    ["Reliever K/9", "Strikeouts per 9 innings for a bullpen arm. 10+ = swing-and-miss threat, useful for late-inning K props. Under 7 = contact-heavy reliever."],
                    ["Reliever BB/9", "Walks per 9 innings for a bullpen arm. Under 3 = sharp control. 5+ = walk-prone, increases YRFI and total runs risk in high-leverage spots."],
                    ["Ump Accuracy", "Overall ball/strike call accuracy for the umpire (from UmpScorecards). MLB average is around 92–93%. Shown when real scorecard data is available; falls back to K Rate / BB Rate otherwise."],
                    ["vs Expected", "How many accuracy percentage points above or below expected the umpire performs, given pitch difficulty. Positive = sharper than expected. Negative = more errors than expected on the same pitch locations."],
                    ["Consistency", "How consistently the umpire applies the same strike zone throughout a game. High consistency = reliable zone, low variance. Matters for late-inning K props."],
                    ["Favor/Gm", "Average absolute run favor per game — how many runs the umpire's calls are worth cumulatively. Higher values (> 0.5) mean the ump's zone meaningfully shifts expected run scoring, which can create an edge on totals."],
                    ["ACCURATE / INCONSISTENT", "Badge on the Umpire card when real scorecard data is loaded. ACCURATE = above expected accuracy (+0.5% or better). INCONSISTENT = below expected (−1.0% or worse). Falls back to PITCHER UMP / NEUTRAL UMP when only static data is available."],
                    ["PITCHER UMP / NEUTRAL UMP", "Badge shown when real scorecard data isn't loaded yet. Based on historical K rate estimates — PITCHER UMP = wider zone, above-average strikeout environment. NEUTRAL = average zone."],
                    ["Net Units", "Your total profit or loss in units assuming flat −110 betting. Each win returns +0.909u (the standard −110 payout), each loss costs −1u. Shown in the Pick Log header once you have graded picks."],
                    ["ROI %", "Return on investment as a percentage — net units divided by total graded picks × 100. Positive ROI over a large sample (50+ picks) is the key long-term edge indicator. Break-even at −110 is roughly 52.4%."],
                    ["Best Type", "The prop type (K, Hits, TB, HR, etc.) where your hit rate is highest, based on picks with at least 3 graded results. Use this to identify where the model's signals align best with your own research."],
                    ["⚠ IL", "Injured List flag — shown next to a player name in the Lineup tab or pitcher card when that player has an active IL placement in the last 14 days. Data from the MLB Stats API transactions feed, updated every 30 minutes."],
                  ].map(([t, d]) => <Stat key={t} term={t} def={d} />)}
                </Section>
              </>);
            })()}

          </div>
        </div>
      )}
    </>
  );
}
