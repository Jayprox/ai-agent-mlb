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
  "Rogers Centre":             { lat: 43.6414,  lon: -79.3894, orientation: 10,  tz: "America/Toronto",  roof: true },
  "Yankee Stadium":            { lat: 40.8296,  lon: -73.9262, orientation: 30,  tz: "America/New_York"    },
  "Fenway Park":               { lat: 42.3467,  lon: -71.0972, orientation: 90,  tz: "America/New_York"    },
  "Wrigley Field":             { lat: 41.9484,  lon: -87.6553, orientation: 30,  tz: "America/Chicago"     },
  "Busch Stadium":             { lat: 38.6226,  lon: -90.1928, orientation: 10,  tz: "America/Chicago"     },
  "T-Mobile Park":             { lat: 47.5914,  lon: -122.3325,orientation: 5,   tz: "America/Los_Angeles" },
  "Camden Yards":              { lat: 39.2838,  lon: -76.6218, orientation: 5,   tz: "America/New_York"    },
  "Petco Park":                { lat: 32.7076,  lon: -117.1570,orientation: 35,  tz: "America/Los_Angeles" },
  "Truist Park":               { lat: 33.8907,  lon: -84.4677, orientation: 20,  tz: "America/New_York"    },
  "Great American Ball Park":  { lat: 39.0979,  lon: -84.5082, orientation: 10,  tz: "America/New_York"    },
  "loanDepot park":            { lat: 25.7781,  lon: -80.2197, orientation: 5,   tz: "America/New_York",  roof: true },
  "Minute Maid Park":          { lat: 29.7572,  lon: -95.3555, orientation: 30,  tz: "America/Chicago",  roof: true },
  "Tropicana Field":           { lat: 27.7683,  lon: -82.6534, orientation: 0,   tz: "America/New_York",  roof: true },
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
  OAK: { hr: 0.93, hit: 0.97, k: 1.01, label: "Pitcher-Friendly"}, // Oakland Coliseum
  LAD: { hr: 0.93, hit: 0.97, k: 1.02, label: "Pitcher-Friendly"}, // Dodger Stadium
  KC:  { hr: 0.91, hit: 0.98, k: 1.01, label: "Pitcher-Friendly"}, // Kauffman Stadium
  SEA: { hr: 0.90, hit: 0.97, k: 1.02, label: "Pitcher-Friendly"}, // T-Mobile Park
  SD:  { hr: 0.87, hit: 0.96, k: 1.03, label: "Pitcher Haven"  },  // Petco Park
  SF:  { hr: 0.83, hit: 0.96, k: 1.03, label: "Pitcher Haven"  },  // Oracle Park
};
const NEUTRAL_PARK = { hr: 1.0, hit: 1.0, k: 1.0, label: "Neutral" };

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

  // Live path — runs in real environment
  const parseHour = (timeStr, tz) => {
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-CA", { timeZone: tz });
      const clean = timeStr.replace(/ [A-Z]{2,3}$/,"");
      const d = new Date(`${dateStr} ${clean}`);
      return isNaN(d) ? now : d;
    } catch { return new Date(); }
  };

  const targetHour = parseHour(gameTimeStr, stadium.tz).getHours();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${stadium.lat}&longitude=${stadium.lon}&hourly=temperature_2m,windspeed_10m,winddirection_10m,weathercode,precipitation_probability,relativehumidity_2m&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=${stadium.tz}&forecast_days=1`;

  try {
    const res  = await fetch(url);
    const json = await res.json();
    const h    = json.hourly;
    const idx  = h.time.findIndex(t => new Date(t).getHours() === targetHour);
    const i    = idx >= 0 ? idx : targetHour;

    const windDeg = h.winddirection_10m[i];
    const windSpd = h.windspeed_10m[i];
    const temp    = Math.round(h.temperature_2m[i]);

    const data = {
      temp,
      condition:   WMO_CODES[h.weathercode[i]] ?? "Unknown",
      wind:        windDescription(windDeg, windSpd, stadium.orientation),
      humidity:    `${Math.round(h.relativehumidity_2m[i])}%`,
      rainChance:  `${h.precipitation_probability[i]}%`,
      roof:        false,
      hrFavorable: isHrFavorable(windDeg, windSpd, stadium.orientation, temp),
      live:        true,
      fetchedAt:   new Date().toLocaleTimeString(),
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

const oddsCache = { data: null, ts: 0, remaining: null, used: null, fetchedAt: null, error: null };
const ODDS_CACHE_TTL_MS = 15 * 60 * 1000;

const fetchOdds = async (forceRefresh = false) => {
  if (IS_ODDS_SANDBOX) return null;

  // Return cached data if still fresh
  if (!forceRefresh && oddsCache.data && (Date.now() - oddsCache.ts) < ODDS_CACHE_TTL_MS) {
    return oddsCache;
  }

  oddsCache.error = null;
  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,totals,totals_h1&oddsFormat=american&dateFormat=iso`
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? `HTTP ${res.status}`);
    }

    const remaining = res.headers.get("x-requests-remaining");
    const used      = res.headers.get("x-requests-used");
    const games     = await res.json();

    // Build lookup map keyed by "AwayTeamFullName|HomeTeamFullName"
    // Books to extract, in display order
    const TARGET_BOOKS = [
      { key: "draftkings",    label: "DK"      },
      { key: "fanduel",       label: "FD"      },
      { key: "williamhill_us",label: "CZR"     },
      { key: "betmgm",        label: "MGM"     },
    ];

    const extractBook = (bk, awayTeam) => {
      let awayML = null, homeML = null, total = null, overOdds = null, underOdds = null, f5Total = null;
      const h2h = bk.markets.find(m => m.key === "h2h");
      if (h2h) {
        const awayOut = h2h.outcomes.find(o => o.name === awayTeam);
        const homeOut = h2h.outcomes.find(o => o.name !== awayTeam);
        if (awayOut) awayML = awayOut.price > 0 ? `+${awayOut.price}` : `${awayOut.price}`;
        if (homeOut) homeML = homeOut.price > 0 ? `+${homeOut.price}` : `${homeOut.price}`;
      }
      const totals = bk.markets.find(m => m.key === "totals");
      if (totals) {
        const over  = totals.outcomes.find(o => o.name === "Over");
        const under = totals.outcomes.find(o => o.name === "Under");
        if (over)  { total = String(over.point); overOdds  = over.price  > 0 ? `+${over.price}`  : `${over.price}`;  }
        if (under) {                              underOdds = under.price > 0 ? `+${under.price}` : `${under.price}`; }
      }
      // F5 (first 5 innings) total — market key "totals_h1"
      const totalsH1 = bk.markets.find(m => m.key === "totals_h1");
      if (totalsH1) {
        const f5Over = totalsH1.outcomes.find(o => o.name === "Over");
        if (f5Over) f5Total = String(f5Over.point);
      }
      return { awayML, homeML, total, overOdds, underOdds, f5Total };
    };

    const map = {};
    games.forEach(g => {
      const key = `${g.away_team}|${g.home_team}`;

      // Build per-book data for each target book
      const books = {};
      TARGET_BOOKS.forEach(({ key: bKey, label }) => {
        const bk = g.bookmakers.find(b => b.key === bKey);
        if (bk) books[label] = extractBook(bk, g.away_team);
      });

      // Primary line: first available target book, else first bookmaker
      const primaryBk = TARGET_BOOKS.map(t => g.bookmakers.find(b => b.key === t.key)).find(Boolean)
                        ?? g.bookmakers[0];
      if (!primaryBk) return;

      const primary = extractBook(primaryBk, g.away_team);
      const primaryLabel = TARGET_BOOKS.find(t => t.key === primaryBk.key)?.label ?? primaryBk.title;

      map[key] = { ...primary, book: primaryLabel, books };
    });

    oddsCache.data      = map;
    oddsCache.ts        = Date.now();
    oddsCache.remaining = remaining;
    oddsCache.used      = used;
    oddsCache.fetchedAt = new Date().toLocaleTimeString();
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
    odds: { awayML: "+115", homeML: "-135", total: "8.5", overOdds: "-110", underOdds: "-110", movement: "Total opened 9 — moved DOWN 0.5. Sharp under action.", lineMove: "under" },
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
    odds: { awayML: "+142", homeML: "-162", total: "7.5", overOdds: "-115", underOdds: "-105", movement: "Total opened 8 — moved DOWN 0.5. Heavy under action early.", lineMove: "under" },
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
    odds: { awayML: "-108", homeML: "-112", total: "9.0", overOdds: "-110", underOdds: "-110", movement: "Total opened 8.5 — moved UP 0.5. Public over money flowing in.", lineMove: "over" },
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
    odds: { awayML: "+128", homeML: "-148", total: "7.0", overOdds: "-110", underOdds: "-110", movement: "Total opened 7.5 — moved DOWN 0.5. Cold, wind in — sharp under action.", lineMove: "under" },
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
    odds: { awayML: "-122", homeML: "+104", total: "7.5", overOdds: "-110", underOdds: "-110", movement: "Total steady at 7.5. No significant movement. Public split.", lineMove: "none" },
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
    odds: { awayML: "+105", homeML: "-125", total: "8.0", overOdds: "-112", underOdds: "-108", movement: "Total opened 8 — held steady. Slight over lean from public.", lineMove: "over" },
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
    time:        sg.time,
    stadium:     sg.stadium,
    location:    "",
    weather:     tpl.weather,  // overridden by Open-Meteo when IS_SANDBOX = false
    umpire:      { name: "TBD", kRate: "—", bbRate: "—", tendency: "Awaiting assignment", rating: "neutral" },
    odds:        tpl.odds,     // overridden by Odds API when IS_ODDS_SANDBOX = false
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

const Card = ({ children, style }) => (
  <div style={{ background: "#161827", border: "1px solid #1f2437", borderRadius: 14, padding: "14px", marginBottom: 12, ...style }}>{children}</div>
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
                  <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>vs LHB</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: parseFloat(r.vsL) < 0.22 ? "#22c55e" : parseFloat(r.vsL) > 0.26 ? "#ef4444" : "#f59e0b", fontFamily: "monospace" }}>{r.vsL}</div>
                </div>
                <div style={{ flex: 1, background: "#161827", borderRadius: 6, padding: "6px 8px" }}>
                  <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>vs RHB</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: parseFloat(r.vsR) < 0.22 ? "#22c55e" : parseFloat(r.vsR) > 0.26 ? "#ef4444" : "#f59e0b", fontFamily: "monospace" }}>{r.vsR}</div>
                </div>
                <div style={{ flex: 2, background: "#161827", borderRadius: 6, padding: "6px 8px" }}>
                  <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>Platoon Edge</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: parseFloat(r.vsL) < parseFloat(r.vsR) ? "#c084fc" : "#38bdf8" }}>
                    {parseFloat(r.vsL) < parseFloat(r.vsR) ? "Better vs LHB" : "Better vs RHB"}
                  </div>
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
const SlateCard = ({ game, selected, onSelect, liveOddsMap = {} }) => {
  const topProp = game.props[0];
  // Merge live odds if available for this game
  const liveKey  = `${game.away.name}|${game.home.name}`;
  const liveOdds = liveOddsMap[liveKey];
  const total    = liveOdds?.total    ?? game.odds.total;
  const awayML   = liveOdds?.awayML   ?? game.odds.awayML;
  const homeML   = liveOdds?.homeML   ?? game.odds.homeML;
  const isLive   = !!liveOdds;

  // ── Slate card accent border ──────────────────────────────────────────────
  // Left-border color signal: green = strong NRFI + favorable props,
  // red = YRFI lean, amber = mixed / no strong read.
  const nrfiConf  = game.nrfi?.confidence ?? 50;
  const nrfiLean  = game.nrfi?.lean ?? "NRFI";
  const propConf  = topProp?.confidence ?? 50;
  const propOver  = topProp?.positive === true;
  const accentColor = selected
    ? "#22c55e"  // always green when selected
    : nrfiLean === "YRFI"
      ? "#ef4444"                                              // red — YRFI lean
      : nrfiLean === "NRFI" && nrfiConf >= 62 && (propOver || propConf >= 60)
        ? "#22c55e"                                            // green — strong NRFI + solid prop lean
        : nrfiLean === "NRFI" && nrfiConf >= 55
          ? "#f59e0b"                                          // amber — moderate NRFI, mixed prop
          : "#374151";                                         // neutral grey — no clear read

  return (
    <div onClick={() => onSelect(game.id)} style={{ background: selected ? "rgba(34,197,94,0.06)" : "#161827", border: `1px solid ${selected ? "rgba(34,197,94,0.25)" : "#1f2437"}`, borderLeft: `3px solid ${accentColor}`, borderRadius: 12, padding: "12px", cursor: "pointer", marginBottom: 8, transition: "all 0.15s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#f9fafb" }}>{game.away.abbr} <span style={{ color: "#6b7280", fontWeight: 400 }}>@</span> {game.home.abbr}</div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{game.time} · {game.stadium}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
            <div style={{ fontSize: 11, color: "#f9fafb", fontWeight: 700 }}>O/U {total}</div>
            {isLive && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 4px #22c55e", flexShrink: 0 }} />}
          </div>
          <div style={{ fontSize: 10, color: isLive ? "#22c55e" : (game.odds.lineMove === "over" ? "#f59e0b" : game.odds.lineMove === "under" ? "#38bdf8" : "#6b7280"), marginTop: 2 }}>
            {isLive
              ? `${awayML} / ${homeML}`
              : (game.odds.lineMove === "none" ? "No move" : `↓ ${game.odds.lineMove.toUpperCase()}`)}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <LeanBadge label={game.nrfi.lean} positive={game.nrfi.lean === "NRFI"} small />
        <LeanBadge label={game.weather.roof ? "DOME" : `${game.weather.temp}°`} positive={game.weather.hrFavorable} small />
        <LeanBadge label={`${game.pitcher.name.split(" ")[1]} K ${game.props[0]?.lean}`} positive={game.props[0]?.positive} small />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// DESKTOP WARNING
// ─────────────────────────────────────────────
const DesktopWarning = () => (
  <div style={{ position: "fixed", inset: 0, background: "#0e0f1a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 32, textAlign: "center" }}>
    <div style={{ fontSize: 40, marginBottom: 16 }}>📱</div>
    <div style={{ fontSize: 20, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace", marginBottom: 10 }}>Mobile View Required</div>
    <div style={{ fontSize: 13, color: "#6b7280", fontFamily: "monospace", lineHeight: 1.8, maxWidth: 320 }}>
      This app is built for mobile screens.<br />
      Please resize your browser window to a narrower width (under 520px) to view the app.<br /><br />
      <span style={{ color: "#22c55e" }}>Tip: Use your browser's DevTools → Toggle Device Toolbar</span>
    </div>
  </div>
);

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
  const [view, setView] = useState("slate"); // "slate" | "game" | "picks"
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
  const [isWide, setIsWide] = useState(window.innerWidth > 520);
  const [liveWeather, setLiveWeather] = useState({});
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [liveOddsMap, setLiveOddsMap] = useState({});
  const [oddsApiInfo, setOddsApiInfo] = useState(null); // { remaining, used, fetchedAt }
  const [oddsLoading, setOddsLoading] = useState(false);
  // These MUST live here — before any early return — to satisfy Rules of Hooks
  const [lineupSide, setLineupSide] = useState("away");
  const [expandedBatter, setExpandedBatter] = useState(null);
  const [pinnedBatterId, setPinnedBatterId] = useState(null);
  const [pitcherSide, setPitcherSide] = useState("home");  // "home" | "away"
  const [arsenalSide, setArsenalSide] = useState("home");  // "home" | "away"
  // Live Stats API state
  const [liveSlate, setLiveSlate] = useState(null);
  const [slateLoading, setSlateLoading] = useState(false);
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
  const [liveBullpen,  setLiveBullpen]  = useState({});     // teamId    → bullpen object
  const [liveInjuries, setLiveInjuries] = useState([]);
  const [gameNotes, setGameNotes]       = useState({});  // gamePk → note string
  const [noteSaveState, setNoteSaveState] = useState(null); // null | "saving" | "saved"
  const [copiedPickId, setCopiedPickId] = useState(null);   // id of pick just copied to clipboard
  const [parlayLabels, setParlayLabels] = useState([]);      // labels of props selected for parlay (max 3)
  const [parlaySlipCopied, setParlaySlipCopied] = useState(false);

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

  // Fetch live schedule on mount
  useEffect(() => {
    if (IS_STATS_SANDBOX) return;
    setSlateLoading(true);
    apiFetch("/api/schedule")
      .then(games => {
        setLiveSlate(games);
        if (games.length > 0) setSelectedId(games[0].gamePk);
      })
      .catch(err => console.error("Schedule fetch failed:", err))
      .finally(() => setSlateLoading(false));
  }, []);

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
    // Fetch bullpen data for both teams
    const awayId = sg.away?.id;
    const homeId = sg.home?.id;
    if (awayId && !liveBullpen[awayId]) {
      apiFetch(`/api/bullpen/${awayId}`)
        .then(data => setLiveBullpen(prev => ({ ...prev, [awayId]: data })))
        .catch(err => console.error("Away bullpen:", err));
    }
    if (homeId && !liveBullpen[homeId]) {
      apiFetch(`/api/bullpen/${homeId}`)
        .then(data => setLiveBullpen(prev => ({ ...prev, [homeId]: data })))
        .catch(err => console.error("Home bullpen:", err));
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
    const handler = () => setIsWide(window.innerWidth > 520);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  if (isWide) return <DesktopWarning />;

  // Active slate: live schedule games when backend is on, mock SLATE otherwise
  const activeSlate = (!IS_STATS_SANDBOX && liveSlate)
    ? liveSlate.map(buildLiveGame)
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
    // Umpire: use live name if available
    umpire: (() => {
      const lu = liveUmpires[gamePkKey];
      return lu?.homePlate ? { ...baseGame.umpire, name: lu.homePlate.name } : baseGame.umpire;
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
    // Bullpen: overlay live data per team when fetched
    bullpen: (() => {
      const awayId = baseGame?.away?.id;
      const homeId = baseGame?.home?.id;
      const liveAway = awayId ? liveBullpen[awayId] : null;
      const liveHome = homeId ? liveBullpen[homeId] : null;
      return {
        away: liveAway ?? baseGame.bullpen?.away,
        home: liveHome ?? baseGame.bullpen?.home,
      };
    })(),
  };

  const { pitcher, batter, props: mockProps, umpire, bullpen } = game;
  const awayLineup = game.lineups?.away ?? [];
  const homeLineup = game.lineups?.home ?? [];
  const injuredIds = new Set((liveInjuries ?? []).map(i => String(i.playerId)));

  // Pinned batter: search both lineup sides for the pinned id; fall back to mock featured batter
  const pinnedBatterSide = pinnedBatterId
    ? (awayLineup.some(b => b.id === pinnedBatterId) ? "away"
      : homeLineup.some(b => b.id === pinnedBatterId) ? "home"
      : null)
    : null;
  const pinnedLineupBatter = pinnedBatterId
    ? ([...awayLineup, ...homeLineup]).find(b => b.id === pinnedBatterId)
    : null;
  const activeBatter = pinnedLineupBatter
    ? (() => {
        const lb = augmentBatter(pinnedLineupBatter);
        // Lineup batters lack `ops` — estimate from avg + slg profile so TB prop can fire
        const avgNum = parseFloat(lb.avg) || 0;
        const estOps = lb.ops ?? String(((avgNum + 0.07) + (avgNum * 1.65)).toFixed(3));
        return { ...lb, ops: estOps };
      })()
    : batter;
  const activeBatterVsPitches = activeBatter?.vsPitches ?? {};
  const activeMatchupPitcher = pinnedBatterSide === "home"
    ? (game.awayPitcher ?? pitcher)
    : pitcher;

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
      awayML:    live.awayML    ?? g.odds.awayML,
      homeML:    live.homeML    ?? g.odds.homeML,
      total:     live.total     ?? g.odds.total,
      overOdds:  live.overOdds  ?? g.odds.overOdds,
      underOdds: live.underOdds ?? g.odds.underOdds,
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

  const calcMatchupScore = (batterHand, vsPitches, arsenal, pitcherHand) => {
    // Same-hand matchups favor pitcher (e.g. RHP vs RHB for breaking balls)
    const handPenalty = (pitcherHand === batterHand) ? 0.92 : 1.0;

    let weightedSum = 0;
    let totalWeight = 0;

    arsenal.forEach(({ abbr, pct }) => {
      const p = vsPitches?.[abbr];
      if (!p) return;

      const capPct = Math.min(pct, 40); // cap usage influence at 40%
      const weight = capPct / 100;

      const avg   = parseFloat(typeof p === "object" ? p.avg   : p) || 0;
      const whiff = parseFloat(typeof p === "object" ? p.whiff : "20") || 20;
      const slg   = parseFloat(typeof p === "object" ? p.slg   : String(avg * 1.6)) || avg * 1.6;

      // Component scores (all normalized 0–1):
      // avg component: 0.400 ceiling is elite, 0.150 floor is brutal
      const avgScore   = Math.max(0, Math.min(1, (avg - 0.150) / 0.250));
      // whiff component: 0% whiff = best, 50%+ = worst
      const whiffScore = Math.max(0, Math.min(1, 1 - (whiff / 50)));
      // slg component: 0.700 ceiling, 0.200 floor
      const slgScore   = Math.max(0, Math.min(1, (slg - 0.200) / 0.500));

      // Weighted blend: avg 45%, whiff 35%, slg 20%
      const pitchScore = (avgScore * 0.45) + (whiffScore * 0.35) + (slgScore * 0.20);

      weightedSum += pitchScore * weight * handPenalty;
      totalWeight += weight;
    });

    if (totalWeight === 0) return 50;
    const normalized = (weightedSum / totalWeight) * 100;
    return Math.round(normalized * 10) / 10;
  };

  const overviewBatter = activeBatter ?? batter;
  const overviewVsPitches = activeBatterVsPitches ?? batter.vsPitches;
  const score = calcMatchupScore(
    overviewBatter.hand, overviewVsPitches, activeMatchupPitcher.arsenal, activeMatchupPitcher.hand
  );

  // Score thresholds: < 35 pitcher edge, 35–54 neutral, 55+ batter edge
  const pitcherEdge = score < 35;
  const scoreLabel  = score >= 55 ? "BATTER EDGE" : score >= 35 ? "NEUTRAL" : "PITCHER EDGE";
  const scoreColor  = (s) => s >= 55 ? "#ef4444" : s >= 35 ? "#f59e0b" : "#22c55e";

  const TABS = ["overview", "lineup", "arsenal", "intel", "props", "bullpen"];

  // ── Savant splits helpers ─────────────────────────────────
  // Derive HANDLES / NEUTRAL / WEAK SPOT from live split numbers
  const computeGood = (avg, whiff) => {
    const a = parseFloat(avg) || 0;
    const w = parseFloat(whiff) || 0;
    if (a >= 0.280 && w < 25) return true;
    if (a <= 0.215 || w >= 35) return false;
    return null;
  };

  const autoNote = (abbr, avg, whiff) => {
    const a = parseFloat(avg) || 0;
    const w = parseFloat(whiff) || 0;
    if (a >= 0.300 && w < 20) return `Elite contact vs ${abbr}`;
    if (a >= 0.280)            return `Solid contact rate vs ${abbr}`;
    if (a <= 0.180 || w >= 40) return `Severe weakness vs ${abbr} — high K exposure`;
    if (a <= 0.215)            return `Weak contact vs ${abbr}`;
    if (w >= 30)               return `High whiff rate (${whiff}) — chases out of zone`;
    return `Average results vs ${abbr}`;
  };

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
        good: computeGood(avg, null),
        note: autoNote(abbr, avg, null),
      };
    }
    if (typeof rawVs === "object") {
      if ("good" in rawVs) return rawVs;
      return {
        ...rawVs,
        good: computeGood(rawVs.avg, rawVs.whiff),
        note: autoNote(abbr, rawVs.avg, rawVs.whiff),
      };
    }
    return null;
  };

  // Augment a batter object with live Savant splits when available.
  // Preserves mock vsPitches as fallback.
  const augmentBatter = (b) => {
    if (!b?.id) return b;
    const liveSplits = batterSplits[b.id];
    if (!liveSplits) return b;
    // Build enriched vsPitches: add computed `good` and `note` to each live split
    const enriched = {};
    Object.entries(liveSplits).forEach(([abbr, s]) => {
      enriched[abbr] = { ...s, good: computeGood(s.avg, s.whiff), note: autoNote(abbr, s.avg, s.whiff) };
    });
    return { ...b, vsPitches: enriched, splitsLive: true };
  };

  const batterMatchupScore = (b, matchupPitcher = pitcher) => {
    const aug = augmentBatter(b);
    return calcMatchupScore(aug.hand, aug.vsPitches, matchupPitcher.arsenal, matchupPitcher.hand);
  };

  // Lazily fetch Savant splits for a batter when their drawer opens
  const onBatterExpand = (b, openingDrawer) => {
    if (!openingDrawer || !b?.id) return;
    if (!IS_SAVANT_SANDBOX && !batterSplits[b.id]) {
      apiFetch(`/api/splits/${b.id}`)
        .then(data => {
          if (data?.splits) setBatterSplits(prev => ({ ...prev, [b.id]: data.splits }));
        })
        .catch(err => console.error("Batter splits:", err));
    }
    if (!IS_STATS_SANDBOX && !liveHittingLog[b.id]) {
      apiFetch(`/api/players/${b.id}/gamelog?group=hitting`)
        .then(data => setLiveHittingLog(prev => ({ ...prev, [b.id]: data })))
        .catch(err => console.error("Batter gamelog:", err));
    }
    // Career H2H vs opposing pitcher — lazy-fetch once per batter+pitcher pair
    const opposingId = activeMatchupPitcher?.id;
    if (!IS_STATS_SANDBOX && opposingId && b.id) {
      const h2hKey = `${b.id}_${opposingId}`;
      if (!liveH2H[h2hKey]) {
        apiFetch(`/api/players/${b.id}/vs/${opposingId}`)
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

  // ── Prop Engine ─────────────────────────────────────────────────────────────
  // Generates live confidence props from pitcher stats, Savant arsenal, umpire, weather.
  // Runs synchronously each render — fast pure computation, no async.
  // Falls back to mockProps (from SLATE) when live data is insufficient.
  const liveProps = (() => {
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
      const line = Math.ceil(baseK) - 0.5;  // 7.2 → 7.5 | 8.7 → 8.5
      let score  = 50;
      let projK  = baseK;
      const kR   = [`Avg ${baseK.toFixed(1)} K/start`];

      // Factor 1: Arsenal whiff quality (Savant live data)
      if (pitcher.arsenalLive && pitcher.arsenal.length > 0) {
        const totalPct  = pitcher.arsenal.reduce((s, p) => s + (p.pct || 0), 0) || 1;
        const wAvgWhiff = pitcher.arsenal.reduce((s, p) => s + ((parseFloat(p.whiffPct) || 25) * (p.pct || 0)), 0) / totalPct;
        const dW        = wAvgWhiff - 26; // 26% ≈ league avg whiff
        if      (dW >  5) { score += 8; projK += 0.8; kR.push(`Arsenal: ${Math.round(wAvgWhiff)}% whiff (elite)`); }
        else if (dW >  2) { score += 4; projK += 0.4; kR.push(`${Math.round(wAvgWhiff)}% arsenal whiff`); }
        else if (dW < -4) { score -= 6; projK -= 0.6; kR.push(`Low arsenal whiff (${Math.round(wAvgWhiff)}%)`); }
        const bestP = [...pitcher.arsenal].sort((a, b) => (parseFloat(b.whiffPct) || 0) - (parseFloat(a.whiffPct) || 0))[0];
        if (bestP && parseFloat(bestP.whiffPct) >= 35) kR.push(`${bestP.type}: ${bestP.whiffPct}% whiff`);
      }

      // Factor 2: Umpire K rate (league avg ~22.5%)
      const umpK = parseFloat(umpire?.kRate) || 22.5;
      const dU   = umpK - 22.5;
      if      (dU >  2.5) { score += 7; projK += 0.5; kR.push(`${umpire.name || "Ump"}: wide K zone (${umpire.kRate})`); }
      else if (dU >  0.8) { score += 3; kR.push(`${umpire.name || "Ump"} favors pitchers`); }
      else if (dU < -2.0) { score -= 5; projK -= 0.4; kR.push(`${umpire.name || "Ump"}: tight zone (${umpire.kRate})`); }

      // Factor 3: Weather — cold suppresses offense (outdoor only)
      if (!weather?.roof) {
        const t = parseInt(weather?.temp) || 72;
        if      (t < 48) { score += 4; kR.push(`Cold ${t}° — offense suppressed`); }
        else if (t < 58) { score += 2; kR.push(`Cool ${t}°`); }
        else if (t > 85) { score -= 2; kR.push(`Hot ${t}° — hitter-friendly`); }
      }

      // Factor 5: Park K factor (Petco/Oracle boost Ks; Coors/Fenway suppress)
      if (parkFactor.k >= 1.03) { score += 4; kR.push(`${game.home.abbr} suppresses offense (K ${parkFactor.k}x)`); }
      else if (parkFactor.k <= 0.95) { score -= 3; kR.push(`${game.home.abbr} hitter-friendly (K ${parkFactor.k}x)`); }

      // Factor 4: Lineup whiff profile (3+ batters with splits loaded)
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

      // Factor 6: Fastball velocity trend (YoY delta from Savant prevVelo)
      // Only applies when Savant arsenal is live and at least one pitch has prevVelo
      if (pitcher.arsenalLive && pitcher.arsenal.length > 0) {
        // Use primary fastball (FF/SI/FC/FS) first; fall back to highest-usage pitch
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

    // ── 2. F5 TOTAL (First 5 Innings O/U) ─────────────────────────────────────
    // Game-level prop — fires whenever a game is open, no batter pin required.
    // Uses both SPs' ERA + K/9, park factor, weather, and NRFI lean.
    // F5 line from Odds API (totals_h1 market) used for label only — avoids circular
    // logic. Gracefully shows "F5 O/U" when line isn't available.
    {
      const homeSp = pitcher;
      const awaySp = game.awayPitcher;
      const homeEra = parseFloat(homeSp?.era);
      const awayEra = parseFloat(awaySp?.era);
      const hasSpData = (!isNaN(homeEra) && homeEra > 0) || (!isNaN(awayEra) && awayEra > 0);

      if (hasSpData) {
        let f5Score = 50;
        const f5R = [];

        // F5 line label from Odds API (totals_h1 market)
        const f5GameKey = `${game.away.name}|${game.home.name}`;
        const f5LineRaw = liveOddsMap[f5GameKey]?.f5Total ?? null;
        const f5Label   = f5LineRaw ? `F5 O/U ${f5LineRaw}` : "F5 O/U";

        // Factor 1: Combined starter ERA (lower ERA → UNDER lean)
        const eras = [homeEra, awayEra].filter(n => !isNaN(n) && n > 0);
        if (eras.length > 0) {
          const avgEra = eras.reduce((a, b) => a + b, 0) / eras.length;
          if      (avgEra < 3.00) { f5Score -= 8; f5R.push(`Avg SP ERA ${avgEra.toFixed(2)} — elite`); }
          else if (avgEra < 3.80) { f5Score -= 4; f5R.push(`Avg SP ERA ${avgEra.toFixed(2)}`); }
          else if (avgEra > 5.00) { f5Score += 8; f5R.push(`Avg SP ERA ${avgEra.toFixed(2)} — vulnerable`); }
          else if (avgEra > 4.20) { f5Score += 4; f5R.push(`Avg SP ERA ${avgEra.toFixed(2)}`); }
        }

        // Factor 2: Combined K/9 (higher K rate → fewer balls in play → UNDER)
        const k9s = [parseFloat(homeSp?.kPer9), parseFloat(awaySp?.kPer9)].filter(n => !isNaN(n) && n > 0);
        if (k9s.length > 0) {
          const avgK9 = k9s.reduce((a, b) => a + b, 0) / k9s.length;
          if      (avgK9 >= 10.5) { f5Score -= 7; f5R.push(`Avg K/9 ${avgK9.toFixed(1)} — swing-miss arms`); }
          else if (avgK9 >=  9.0) { f5Score -= 3; f5R.push(`Avg K/9 ${avgK9.toFixed(1)}`); }
          else if (avgK9 <=  6.5) { f5Score += 6; f5R.push(`Avg K/9 ${avgK9.toFixed(1)} — contact-heavy`); }
          else if (avgK9 <=  7.5) { f5Score += 2; f5R.push(`Avg K/9 ${avgK9.toFixed(1)}`); }
        }

        // Factor 3: Park hit factor
        const pHit = parkFactor?.hit ?? 1.00;
        if      (pHit >= 1.15) { f5Score += 7; f5R.push(`${game.home.abbr} hitter-friendly park (${pHit}x)`); }
        else if (pHit >= 1.08) { f5Score += 3; f5R.push(`Hitter-friendly park`); }
        else if (pHit <= 0.90) { f5Score -= 6; f5R.push(`Pitcher-friendly park (${pHit}x)`); }
        else if (pHit <= 0.95) { f5Score -= 3; f5R.push(`Pitcher-friendly park`); }

        // Factor 4: Weather (outdoor only)
        if (!weather?.roof) {
          const f5Temp = parseInt(weather?.temp) || 72;
          if      (f5Temp < 48) { f5Score -= 5; f5R.push(`Cold ${f5Temp}° — suppresses scoring`); }
          else if (f5Temp < 58) { f5Score -= 2; f5R.push(`Cool ${f5Temp}°`); }
          else if (f5Temp > 85) { f5Score += 3; f5R.push(`Hot ${f5Temp}° — hitter-friendly`); }
          if      (weather?.hrFavorable)                                   { f5Score += 4; f5R.push("Wind blowing OUT"); }
          else if ((weather?.wind || "").toLowerCase().includes(" in "))  { f5Score -= 3; f5R.push("Wind blowing IN"); }
        }

        // Factor 5: NRFI lean — if both pitchers have strong NRFI tendency lean UNDER
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

    // ── 3. FEATURED BATTER HIT PROP (O/U 0.5 hits) ────────────────────────────
    // Only run batter props when a real batter is available:
    // - In sandbox mode (mock data is self-consistent)
    // - Or when a lineup batter is explicitly pinned (real player for this game)
    const hasPinnedBatter = IS_STATS_SANDBOX || !!pinnedBatterId;
    const batAvg = parseFloat(activeBatter?.avg) || 0;
    if (hasPinnedBatter && batAvg >= 0.180 && activeBatter?.name) {
      // Binomial: P(at least 1 hit in ~4 AB)
      const hitProb = 1 - Math.pow(1 - batAvg, 4);
      let hitScore  = Math.round(hitProb * 85);
      const hR      = [`${activeBatter.avg} season AVG`];

      // Matchup score adjustment
      const ms = calcMatchupScore(activeBatter.hand, activeBatter.vsPitches, activeMatchupPitcher.arsenal, activeMatchupPitcher.hand);
      if      (ms >= 55) { hitScore += 6; hR.push(`Batter edge matchup (${ms}/100)`); }
      else if (ms <  35) { hitScore -= 8; hR.push(`Pitcher edge matchup (${ms}/100)`); }
      else               {               hR.push(`Neutral matchup (${ms}/100)`); }

      // Recent form (last 5 games) — only apply when hitRate is a real array
      if (Array.isArray(activeBatter.hitRate) && activeBatter.hitRate.length > 0) {
        const last5 = activeBatter.hitRate.slice(-5);
        const hits5 = last5.filter(h => h > 0).length;
        if      (hits5 >= 4) { hitScore += 5; hR.push(`Hot — ${hits5}/5 recent with a hit`); }
        else if (hits5 <= 1) { hitScore -= 5; hR.push(`Cold — ${hits5}/5 recent with a hit`); }
      }

      // Cold weather suppresses offense
      if (!weather?.roof && parseInt(weather?.temp) < 50) {
        hitScore -= 3;
        hR.push(`Cold ${weather.temp}° — suppresses offense`);
      }

      // Park hit factor
      if      (parkFactor.hit >= 1.10) { hitScore += 5; hR.push(`${game.home.abbr} hit-friendly park (${parkFactor.hit}x)`); }
      else if (parkFactor.hit >= 1.05) { hitScore += 3; hR.push(`${game.home.abbr} hitter-friendly park`); }
      else if (parkFactor.hit <= 0.96) { hitScore -= 4; hR.push(`${game.home.abbr} suppresses hits (${parkFactor.hit}x)`); }

      // Primary pitch matchup — use live arsenal to call out batter vs pitcher's best weapon
      if (activeMatchupPitcher.arsenalLive && activeMatchupPitcher.arsenal.length > 0 && activeBatter.vsPitches) {
        const primary = activeMatchupPitcher.arsenal[0]; // already sorted by usage %
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

      // Career H2H vs this pitcher — strongest single-matchup signal when sample >= 10 AB
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

      // ── 3. FEATURED BATTER TOTAL BASES (O/U 1.5 TB) ────────────────────────
      const batOps = parseFloat(activeBatter?.ops) || 0;
      if (batOps >= 0.600) {
        let tbScore = Math.round(Math.max(0, Math.min(1, (batOps - 0.600) / 0.500)) * 40) + 40;
        const tR    = [`${activeBatter.ops} OPS`];

        // Wind factor
        if (!weather?.roof) {
          const windStr = (weather?.wind || "").toLowerCase();
          if (weather?.hrFavorable) {
            tbScore += 6; tR.push("Wind blowing OUT — power favorable");
          } else if (/\bin\b/.test(windStr)) {
            tbScore -= 5; tR.push("Wind blowing IN — suppresses XBH");
          }
        }

        // Park HR factor
        if      (parkFactor.hr >= 1.15) { tbScore += 8; tR.push(`${game.home.abbr} launches HRs (${parkFactor.hr}x HR factor)`); }
        else if (parkFactor.hr >= 1.08) { tbScore += 4; tR.push(`${game.home.abbr} hitter-friendly park`); }
        else if (parkFactor.hr <= 0.87) { tbScore -= 6; tR.push(`${game.home.abbr} suppresses HRs (${parkFactor.hr}x HR factor)`); }
        else if (parkFactor.hr <= 0.93) { tbScore -= 3; tR.push(`${game.home.abbr} pitcher-friendly park`); }

        // Batter SLG vs top 3 arsenal pitches (only when slg field present — live splits only)
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

        // ── 4. HR PROP ────────────────────────────────────────────────────────
        // Base 45 (default UNDER — HRs are rare events, ~1-in-12 PA)
        let hrScore = 45;
        const hrR = [];
        const hrBatterLast = activeBatter.name?.split(" ").slice(-1)[0] ?? activeBatter.name;

        // Factor 1: Park HR factor (biggest signal)
        const pHr = parkFactor?.hr ?? 100;
        if      (pHr >= 115) { hrScore += 8; hrR.push(`HR park (${parkFactor?.label ?? ""})`); }
        else if (pHr >= 108) { hrScore += 4; hrR.push(`HR-friendly park`); }
        else if (pHr <= 85)  { hrScore -= 6; hrR.push(`HR-suppressing park (${parkFactor?.label ?? ""})`); }
        else if (pHr <= 93)  { hrScore -= 3; hrR.push(`Below-avg HR park`); }

        // Factor 2: Wind — blowing out favors HR, in suppresses
        if (!weather?.roof) {
          if (weather?.hrFavorable) { hrScore += 8; hrR.push(`Wind blowing out`); }
          else {
            const windStr = (weather?.wind || "").toLowerCase();
            if (windStr.includes("in"))  { hrScore -= 5; hrR.push(`Wind blowing in`); }
          }
          // Factor 3: Cold temp suppresses power
          const hrTemp = parseInt(weather?.temp) || 72;
          if      (hrTemp < 50) { hrScore -= 4; hrR.push(`Cold (${hrTemp}°F)`); }
          else if (hrTemp < 58) { hrScore -= 2; hrR.push(`Cool (${hrTemp}°F)`); }
        }

        // Factor 4: Batter SLG vs top-3 arsenal pitches (same data as TB)
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

        // Factor 5: Pitcher WHIP — high WHIP = more baserunners + more pitches in zone
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

        // ── 5. RBI PROP ────────────────────────────────────────────────────────
        // Base 45 — RBIs require both hitting and runners on base, so slight UNDER lean.
        // Uses career rbiPerGame/rbiRate from /api/players/:id/rbi-context (Codex Session 24).
        const rbiCtxData   = liveRbiCtx[activeBatter.id];
        const rbiLast      = activeBatter.name?.split(" ").slice(-1)[0] ?? activeBatter.name;
        let   rbiScore     = 45;
        const rbiR         = [];
        const rbiPerGame   = rbiCtxData?.rbiPerGame ?? null;
        const batOrder     = activeBatter.battingOrder ?? null;

        // Factor 1: Career RBI rate (primary signal — most predictive across seasons)
        if (rbiPerGame !== null) {
          rbiR.push(`${rbiPerGame.toFixed(3)} RBI/G career`);
          if      (rbiPerGame >= 0.75) { rbiScore += 10; }
          else if (rbiPerGame >= 0.60) { rbiScore += 6;  }
          else if (rbiPerGame >= 0.45) { rbiScore += 2;  }
          else if (rbiPerGame <= 0.25) { rbiScore -= 8;  }
          else if (rbiPerGame <= 0.35) { rbiScore -= 4;  }
        }

        // Factor 2: Batting order position — cleanup (3–5) has most RBI opportunities
        if (batOrder !== null) {
          const pos = Number(batOrder);
          if      (pos >= 3 && pos <= 5) { rbiScore += 6;  rbiR.push(`Cleanup spot (#${pos})`); }
          else if (pos === 6 || pos === 7){ rbiScore += 2;  rbiR.push(`Mid-order (#${pos})`); }
          else if (pos <= 2)             { rbiScore -= 5;  rbiR.push(`Leadoff (#${pos}) — fewer RBI chances`); }
          else if (pos >= 8)             { rbiScore -= 4;  rbiR.push(`Bottom of order (#${pos})`); }
        }

        // Factor 3: Extra-base power proxy (career XBH) — big bats drive in more runs
        const xbh = rbiCtxData?.extraBaseHits ?? null;
        if (xbh !== null) {
          if      (xbh >= 400) { rbiScore += 5; rbiR.push(`${xbh} career XBH (elite power)`); }
          else if (xbh >= 250) { rbiScore += 3; rbiR.push(`${xbh} career XBH`); }
          else if (xbh <= 80)  { rbiScore -= 4; rbiR.push(`${xbh} career XBH (slap hitter)`); }
        }

        // Factor 4: Opposing pitcher ERA — high ERA = more runners scoring = RBI chance
        const rbiEra = parseFloat(activeMatchupPitcher.whip) || 1.25;
        if      (rbiEra > 1.40) { rbiScore += 4; rbiR.push(`Pitcher WHIP ${rbiEra.toFixed(2)} — hittable`); }
        else if (rbiEra < 1.10) { rbiScore -= 4; rbiR.push(`Pitcher WHIP ${rbiEra.toFixed(2)} — limits damage`); }

        // Factor 5: Weather — cold suppresses run-scoring environment
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
    } catch (e) { console.error("Prop engine error:", e); return []; }
  })();

  // Use live props when available; fall back to mock SLATE props
  const displayProps = liveProps.length > 0 ? liveProps : mockProps;

  // ── Computed live NRFI ────────────────────────────────────────────────────
  // Derives NRFI/YRFI lean + confidence from pitcher ERA + weather.
  // Runs after `game` is built (needs game.pitcher.era + weather).
  // Keeps mock awayFirst/homeFirst scoredPct — we don't have live 1st-inn rates yet.
  const liveNrfi = (() => {
    if (IS_STATS_SANDBOX) return null;
    const era = parseFloat(game.pitcher?.era);
    if (isNaN(era) || !game.pitcher?.era || game.pitcher.era === "—") return null;

    let score = 0;
    const reasons = [];
    const lastName = game.pitcher.name?.split(" ").slice(-1)[0] ?? game.pitcher.name ?? "";

    // ERA factor — home pitcher ERA as primary signal
    if      (era < 2.50) { score += 15; reasons.push(`${lastName} ERA ${game.pitcher.era} — elite`); }
    else if (era < 3.50) { score += 8;  reasons.push(`${lastName} ERA ${game.pitcher.era}`); }
    else if (era < 4.50) { score += 2; }
    else if (era > 5.50) { score -= 12; reasons.push(`ERA ${game.pitcher.era} — hitter-friendly`); }
    else                 { score -= 6; }

    // Weather factor (outdoor only)
    if (!weather?.roof) {
      const temp     = parseInt(weather?.temp) || 72;
      const windStr  = (weather?.wind || "").toLowerCase();
      if      (temp < 50)               { score += 10; reasons.push(`Cold ${temp}° suppresses offense`); }
      else if (temp < 60)               { score += 5;  reasons.push(`Cool ${temp}° favors pitchers`); }
      if      (weather?.hrFavorable)    { score -= 8;  reasons.push("Wind blowing OUT — power favorable"); }
      else if (/\bin\b/.test(windStr))  { score += 6;  reasons.push("Wind blowing IN"); }
    } else {
      reasons.push("Dome — neutral conditions");
    }

    // Park factor — HR-friendly parks lean YRFI, pitcher-friendly lean NRFI
    const pf = PARK_FACTORS[game.home?.abbr];
    if (pf) {
      if      (pf.hr >= 1.15) { score -= 10; reasons.push(`${game.home.abbr} hitter-friendly park (HR ${pf.hr}x)`); }
      else if (pf.hr >= 1.08) { score -= 5;  reasons.push(`${game.home.abbr} hitter-friendly park`); }
      else if (pf.hr <= 0.87) { score += 8;  reasons.push(`${game.home.abbr} pitcher-friendly park (HR ${pf.hr}x)`); }
      else if (pf.hr <= 0.93) { score += 4;  reasons.push(`${game.home.abbr} pitcher-friendly park`); }
    }

    const lean       = score >= 0 ? "NRFI" : "YRFI";
    const confidence = Math.min(75, Math.max(38, 50 + Math.abs(score)));
    return { lean, confidence, tendency: reasons.slice(0, 2).join(" · "), live: true };
  })();

  // Merge live NRFI over mock if computed
  const nrfi = liveNrfi
    ? { ...game.nrfi, lean: liveNrfi.lean, confidence: liveNrfi.confidence, live: true, liveTendency: liveNrfi.tendency }
    : game.nrfi;

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
      <div style={{ background: "#0e0f1a", minHeight: "100vh", color: "#e5e7eb", fontFamily: "monospace", maxWidth: 480, margin: "0 auto", padding: "16px 14px 48px" }}>

        {/* ── APP HEADER ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.1em" }}>MLB RESEARCH</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#f9fafb" }}>⚾ Prop Scout</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setView("slate")} style={{ background: view === "slate" ? "#22c55e" : "#161827", border: `1px solid ${view === "slate" ? "#22c55e" : "#1f2437"}`, borderRadius: 8, padding: "6px 12px", fontSize: 10, color: view === "slate" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Slate</button>
            <button onClick={() => setView("game")}  style={{ background: view === "game"  ? "#22c55e" : "#161827", border: `1px solid ${view === "game"  ? "#22c55e" : "#1f2437"}`, borderRadius: 8, padding: "6px 12px", fontSize: 10, color: view === "game"  ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Game</button>
            <button onClick={() => setView("picks")} style={{ position: "relative", background: view === "picks" ? "#a78bfa" : "#161827", border: `1px solid ${view === "picks" ? "#a78bfa" : "#1f2437"}`, borderRadius: 8, padding: "6px 12px", fontSize: 10, color: view === "picks" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
              Picks
              {propLog.length > 0 && <span style={{ position: "absolute", top: -5, right: -5, background: "#a78bfa", color: "#000", fontSize: 8, fontWeight: 800, borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{propLog.length > 99 ? "99" : propLog.length}</span>}
            </button>
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
          <SLabel>Today's Slate — {activeSlate.length} Games{!IS_STATS_SANDBOX && !slateLoading && liveSlate ? " · LIVE" : !IS_STATS_SANDBOX && slateLoading ? " · Loading…" : ""}</SLabel>
          {slateLoading && !liveSlate && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
              <div style={{ width: 18, height: 18, border: "2px solid #1f2437", borderTop: "2px solid #22c55e", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#6b7280" }}>Fetching today's slate…</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {activeSlate.map(g => (
            <SlateCard key={g.id} game={g} selected={selectedId === g.id} onSelect={openGame} liveOddsMap={liveOddsMap} />
          ))}
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
              <LeanBadge label={scoreLabel} positive={score >= 55 ? false : score >= 35 ? null : true} small />
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

            {/* H2H Score */}
            <Card style={{ background: pitcherEdge ? "rgba(34,197,94,0.04)" : score >= 55 ? "rgba(239,68,68,0.04)" : "rgba(245,158,11,0.04)", border: `1px solid ${pitcherEdge ? "rgba(34,197,94,0.2)" : score >= 55 ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}` }}>
              <SLabel>Head-to-Head Matchup Score</SLabel>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 44, fontWeight: 800, color: scoreColor(score), lineHeight: 1 }}>{score}</div>
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>OUT OF 100</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5, marginBottom: 8 }}>AVG · Whiff · SLG weighted by pitch usage. Handedness adjusted.</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "7px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>PITCHER WINS</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>{activeMatchupPitcher.arsenal.filter(a => activeBatterVsPitches[a.abbr]?.good === false).map(a => a.abbr).join(" · ") || "—"}</div>
                    </div>
                    <div style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "7px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>BATTER WINS</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>{activeMatchupPitcher.arsenal.filter(a => activeBatterVsPitches[a.abbr]?.good === true).map(a => a.abbr).join(" · ") || "—"}</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Pitchers */}
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
                return (<>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: pitcherSide === "home" ? "linear-gradient(135deg, #E81828, #002D72)" : "linear-gradient(135deg, #002D72, #E81828)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{activePitcher.number ?? "#"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb" }}>{activePitcher.name ?? "TBD"}</div>
                          <div style={{ fontSize: 9, color: "#6b7280" }}>{activePitcher.team} · SP · {activePitcher.hand ?? "?"}HP · vs {facingTeam}</div>
                        </div>
                        {pitcherSide === "home" && <LeanBadge label="K LEAN OVER" positive={true} small />}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5, marginBottom: 4 }}>
                    {[
                      ["ERA",   activePitcher.era,   parseFloat(activePitcher.era)  < 3.5  ? "#22c55e" : parseFloat(activePitcher.era)  > 4.5  ? "#ef4444" : "#f9fafb"],
                      ["WHIP",  activePitcher.whip,  parseFloat(activePitcher.whip) < 1.2  ? "#22c55e" : parseFloat(activePitcher.whip) > 1.4  ? "#ef4444" : "#f9fafb"],
                      ["K/9",   activePitcher.kPer9, "#22c55e"],
                      ["BB/9",  activePitcher.bbPer9, null],
                      ["Avg IP",activePitcher.avgIP,  null],
                    ].map(([l, v, c]) => (
                      <StatMini key={l} label={l} value={v ?? "—"} color={c} />
                    ))}
                  </div>
                  {recentStarts.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {/* Sparkline — ERA bar chart for last 5 starts (oldest → newest, left → right) */}
                      {recentStarts.length >= 2 && (() => {
                        const starts = recentStarts.slice(0, 5).reverse(); // oldest first
                        const MAX_ERA_SCALE = 9;
                        return (
                          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 28, marginBottom: 8 }}>
                            {starts.map((g, idx) => {
                              const era = g.ip > 0 ? (g.er / parseIpToOuts(g.ip)) * 27 : 0; // rough ERA equiv for that start
                              const heightPct = Math.min(era / MAX_ERA_SCALE, 1);
                              const barH = Math.max(3, Math.round(heightPct * 24));
                              const barColor = g.er <= 2 ? "#22c55e" : g.er <= 4 ? "#f59e0b" : "#ef4444";
                              const isLatest = idx === starts.length - 1;
                              return (
                                <div key={idx} title={`${g.date} · ${g.er} ER · ${g.ip} IP`}
                                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                  <div style={{ width: "100%", height: barH, background: barColor, borderRadius: "2px 2px 0 0", opacity: isLatest ? 1 : 0.6, border: isLatest ? `1px solid ${barColor}` : "none" }} />
                                  {isLatest && <div style={{ width: 4, height: 4, borderRadius: "50%", background: barColor, flexShrink: 0 }} />}
                                </div>
                              );
                            })}
                            <div style={{ fontSize: 8, color: "#4b5563", alignSelf: "flex-start", paddingLeft: 4, whiteSpace: "nowrap" }}>ERA trend</div>
                          </div>
                        );
                      })()}
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                        {recentStarts.slice(0, 5).map((g, idx) => {
                          const chipColor = g.er <= 2 ? "#22c55e" : g.er <= 4 ? "#f59e0b" : "#ef4444";
                          return (
                            <div
                              key={`${g.date}-${idx}`}
                              title={`${g.date} vs ${g.opponent} · ${g.ip} IP · ${g.k} K · ${g.er} ER · ${g.result}`}
                              style={{ background: `${chipColor}18`, border: `1px solid ${chipColor}44`, borderRadius: 999, padding: "3px 7px", fontSize: 9, fontWeight: 700, color: chipColor, fontFamily: "monospace" }}
                            >
                              {g.er} ER
                            </div>
                          );
                        })}
                      </div>
                      {last3Era != null && (
                        <div style={{ fontSize: 10, color: summaryColor, lineHeight: 1.5 }}>
                          Last 3 ERA: {last3Era.toFixed(2)} vs season {gamelog?.seasonEra ?? activePitcher.era ?? "—"}
                        </div>
                      )}
                    </div>
                  )}
                </>);
              })()}

              <Divider />

              {/* Batter — pinned lineup batter or placeholder when live + no pin */}
              {!IS_STATS_SANDBOX && !pinnedBatterId ? (
                <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
                  <div style={{ fontSize: 11, color: "#4b5563" }}>📌 Go to <strong style={{ color: "#9ca3af" }}>Lineup</strong> tab and pin a batter to see their stats here.</div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: "linear-gradient(135deg, #003087, #C4CED4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{activeBatter.number ?? activeBatter.order ?? "–"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb" }}>{activeBatter.name}</div>
                          <div style={{ fontSize: 9, color: "#6b7280" }}>{activeBatter.team ?? activeBatter.pos ?? "–"} · {activeBatter.hand}H</div>
                        </div>
                        <LeanBadge label="HR LEAN OVER" positive={true} small />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    {[["AVG", activeBatter.avg, "#22c55e"], ["OPS", activeBatter.ops, "#fbbf24"], ["Avg H", activeBatter.avgH ?? "—", "#22c55e"], ["Avg HR", activeBatter.avgHR ?? "—", "#fbbf24"], ["Avg TB", activeBatter.avgTB ?? activeBatter.tb ?? "—", "#fbbf24"]].map(([l, v, c]) => (
                      <StatMini key={l} label={l} value={v} color={c} />
                    ))}
                  </div>
                </>
              )}
            </Card>

            {/* Hit Rates — only show when data available (mock mode or pinned batter with string hitRate) */}
            {(IS_STATS_SANDBOX || (pinnedBatterId && activeBatter.hitRate && !Array.isArray(activeBatter.hitRate))) && (
            <Card>
              <SLabel>Batter Hit Rates · Last 10 Games</SLabel>
              <div style={{ display: "flex", gap: 6 }}>
                {[["Hit Games", activeBatter.hitRate, "#22c55e"], ["HR Games", activeBatter.hrRate, "#fbbf24"], ["2+ TB Games", activeBatter.tbOver, "#fbbf24"]].map(([l, v, c]) => (
                  <StatMini key={l} label={l} value={v} color={c} />
                ))}
              </div>
            </Card>
            )}
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
                  const b = augmentBatter(rawB);
                  const sc = batterMatchupScore(b, facingPitcher);
                  const scColor = scoreColor(sc);
                  const isExpanded = expandedBatter === i;
                  const recentHits = (b.hitRate || []).reduce((a, v) => a + v, 0);
                  const hittingLog = b.id ? liveHittingLog[b.id] : null;
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

                  const isPinned = pinnedBatterId === b.id;
                  return (
                    <div key={i}>
                      {/* Row */}
                      <div onClick={() => { const opening = !isExpanded; setExpandedBatter(opening ? i : null); onBatterExpand(b, opening); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", cursor: "pointer", borderRadius: 8, background: isExpanded ? "rgba(34,197,94,0.05)" : "transparent", transition: "background 0.15s" }}>

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

                        {/* Pin to Props button */}
                        <div onClick={e => { e.stopPropagation(); setPinnedBatterId(isPinned ? null : b.id); }} title={isPinned ? "Unpin from Props" : "Pin to Props tab"} style={{ fontSize: 13, flexShrink: 0, cursor: "pointer", opacity: isPinned ? 1 : 0.35, filter: isPinned ? "none" : "grayscale(1)", transition: "opacity 0.15s" }}>📌</div>

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
                            const opposingId = activeMatchupPitcher?.id;
                            const h2hKey = b.id && opposingId ? `${b.id}_${opposingId}` : null;
                            const h2h = h2hKey ? liveH2H[h2hKey] : null;
                            const pitcherLast = activeMatchupPitcher?.name?.split(" ").slice(-1)[0] ?? "pitcher";
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
              <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase" }}>— {arsPitcher.name}'s Arsenal vs {pinnedBatterId ? activeBatter.name : facingTeam + " Lineup"}</div>
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
                      {weather.live
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb" }}>{umpire.name}</div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{umpire.tendency}</div>
                </div>
                <LeanBadge label={umpire.rating === "pitcher" ? "PITCHER UMP" : "NEUTRAL UMP"} positive={umpire.rating === "pitcher" ? false : null} small />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <StatMini label="K Rate" value={umpire.kRate} color={parseFloat(umpire.kRate) > 21 ? "#22c55e" : "#e5e7eb"} />
                <StatMini label="BB Rate" value={umpire.bbRate} color={parseFloat(umpire.bbRate) > 9 ? "#ef4444" : "#e5e7eb"} />
              </div>
            </Card>

            {/* NRFI */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <SLabel style={{ marginBottom: 0 }}>First Inning Tendencies</SLabel>
              {nrfi.live && <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "2px 6px" }}>LIVE</span>}
            </div>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb" }}>NRFI / YRFI Lean</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <LeanBadge label={`${nrfi.lean} ${nrfi.confidence}%`} positive={nrfi.lean === "NRFI"} small />
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
              </div>
              {nrfi.liveTendency && (
                <div style={{ fontSize: 10, color: "#9ca3af", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 6, padding: "6px 10px", marginBottom: 10, lineHeight: 1.5 }}>
                  📊 {nrfi.liveTendency}
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

            {/* Odds & Line Movement */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase" }}>— Odds &amp; Line Movement</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {odds.live
                  ? <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 5px #22c55e" }} />
                      <span style={{ fontSize: 9, color: "#22c55e", fontFamily: "monospace" }}>LIVE · {odds.book}</span>
                    </div>
                  : <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
                      <span style={{ fontSize: 9, color: "#f59e0b", fontFamily: "monospace" }}>DEMO · live when deployed</span>
                    </div>
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
                    <div style={{ display: "grid", gridTemplateColumns: "44px repeat(5, 1fr)", gap: 2, marginBottom: 4 }}>
                      {["", `${game.away.abbr} ML`, `${game.home.abbr} ML`, "Total", "O Odds", "U Odds"].map((h, i) => (
                        <div key={i} style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", textAlign: "center", letterSpacing: "0.05em" }}>{h}</div>
                      ))}
                    </div>
                    {/* Book rows */}
                    {bookEntries.map(([label, b]) => (
                      <div key={label} style={{ display: "grid", gridTemplateColumns: "44px repeat(5, 1fr)", gap: 2, marginBottom: 3, background: "#1a1f2e", borderRadius: 6, padding: "5px 4px", alignItems: "center" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b", textAlign: "center", fontFamily: "monospace" }}>{label}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: mlColor(b.awayML), textAlign: "center", fontFamily: "monospace" }}>{b.awayML ?? "—"}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: mlColor(b.homeML), textAlign: "center", fontFamily: "monospace" }}>{b.homeML ?? "—"}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#f9fafb", textAlign: "center", fontFamily: "monospace" }}>{b.total ?? "—"}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>{b.overOdds ?? "—"}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>{b.underOdds ?? "—"}</div>
                      </div>
                    ))}
                  </>
                );
              })() : (
                <>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    <StatMini label={`${game.away.abbr} ML`} value={odds.awayML} color={odds.awayML.startsWith("+") ? "#22c55e" : "#e5e7eb"} />
                    <StatMini label={`${game.home.abbr} ML`} value={odds.homeML} color={odds.homeML.startsWith("-") ? "#ef4444" : "#e5e7eb"} />
                    <StatMini label="Total" value={odds.total} color="#f9fafb" />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    <StatMini label="Over Odds" value={odds.overOdds} />
                    <StatMini label="Under Odds" value={odds.underOdds} />
                  </div>
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

            {/* Game Notes */}
            <SLabel>Game Notes</SLabel>
            <Card>
              {(() => {
                const key = String(selectedId);
                const note = gameNotes[key] ?? "";
                const fetched = gameNotes[key] !== undefined;
                return (
                  <div>
                    <textarea
                      value={note}
                      onChange={e => {
                        setNoteSaveState(null);
                        setGameNotes(prev => ({ ...prev, [key]: e.target.value }));
                      }}
                      onBlur={e => { if (fetched) saveNote(key, e.target.value); }}
                      placeholder={fetched ? 'Jot a note… "Wheeler velo looked low" or "rain delay likely"' : "Loading…"}
                      disabled={!fetched}
                      maxLength={500}
                      style={{ width: "100%", background: "#1e2030", border: "1px solid #374151", borderRadius: 8, padding: "10px", color: "#e5e7eb", fontSize: 11, fontFamily: "monospace", resize: "none", minHeight: 68, lineHeight: 1.5, outline: "none", opacity: fetched ? 1 : 0.4 }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 9, color: "#374151" }}>{note.length}/500</span>
                      {noteSaveState === "saving" && <span style={{ fontSize: 9, color: "#6b7280" }}>saving…</span>}
                      {noteSaveState === "saved"  && <span style={{ fontSize: 9, color: "#22c55e" }}>✓ saved</span>}
                    </div>
                  </div>
                );
              })()}
            </Card>
          </>)}

          {/* ── PROPS ── */}
          {tab === "props" && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <SLabel style={{ marginBottom: 0 }}>Prop Confidence Meters</SLabel>
              {liveProps.length > 0
                ? <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "2px 6px" }}>LIVE</span>
                : <span style={{ fontSize: 8, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, padding: "2px 6px" }}>DEMO</span>
              }
              {pinnedLineupBatter && (
                <span style={{ fontSize: 8, color: "#9ca3af", marginLeft: "auto" }}>
                  📌 {pinnedLineupBatter.name?.split(" ").slice(-1)[0]}
                  <span onClick={() => setPinnedBatterId(null)} style={{ marginLeft: 4, cursor: "pointer", color: "#4b5563" }}>✕</span>
                </span>
              )}
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
            </>)}
            {!IS_STATS_SANDBOX && !pinnedBatterId && (
              <Card style={{ borderStyle: "dashed", borderColor: "#2d3148" }}>
                <div style={{ textAlign: "center", padding: "6px 0" }}>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>📌</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 4 }}>Pin a Batter for Hit & TB Props</div>
                  <div style={{ fontSize: 10, color: "#4b5563", lineHeight: 1.5 }}>Go to Lineup tab → tap 📌 on any batter row<br />to generate real hit & total bases props.</div>
                </div>
              </Card>
            )}
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

        {/* Footer */}
        <div style={{ marginTop: 10 }}>
          {/* User row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
              👤 <span style={{ color: "#9ca3af" }}>{currentUser?.username ?? "—"}</span>
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
    </>
  );
}
