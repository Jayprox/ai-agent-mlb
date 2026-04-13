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
const IS_SANDBOX = true;
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
const ODDS_API_KEY    = "cf101f7e894bb067cbe5ab35b171c8f1";
const IS_ODDS_SANDBOX = true; // flip to false to enable live odds

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
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,totals&oddsFormat=american&dateFormat=iso`
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? `HTTP ${res.status}`);
    }

    const remaining = res.headers.get("x-requests-remaining");
    const used      = res.headers.get("x-requests-used");
    const games     = await res.json();

    // Build lookup map keyed by "AwayTeamFullName|HomeTeamFullName"
    const map = {};
    games.forEach(g => {
      const key = `${g.away_team}|${g.home_team}`;

      // Prefer DraftKings; fall back to first available bookmaker
      const bk = g.bookmakers.find(b => b.key === "draftkings") || g.bookmakers[0];
      if (!bk) return;

      let awayML = null, homeML = null, total = null, overOdds = null, underOdds = null;

      const h2h = bk.markets.find(m => m.key === "h2h");
      if (h2h) {
        const awayOut = h2h.outcomes.find(o => o.name === g.away_team);
        const homeOut = h2h.outcomes.find(o => o.name === g.home_team);
        if (awayOut) awayML = awayOut.price > 0 ? `+${awayOut.price}` : `${awayOut.price}`;
        if (homeOut) homeML = homeOut.price > 0 ? `+${homeOut.price}` : `${homeOut.price}`;
      }

      const totals = bk.markets.find(m => m.key === "totals");
      if (totals) {
        const over  = totals.outcomes.find(o => o.name === "Over");
        const under = totals.outcomes.find(o => o.name === "Under");
        if (over)  { total = String(over.point);  overOdds  = over.price  > 0 ? `+${over.price}`  : `${over.price}`;  }
        if (under) {                               underOdds = under.price > 0 ? `+${under.price}` : `${under.price}`; }
      }

      map[key] = { awayML, homeML, total, overOdds, underOdds, book: bk.title };
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

  return (
    <div onClick={() => onSelect(game.id)} style={{ background: selected ? "rgba(34,197,94,0.06)" : "#161827", border: `1px solid ${selected ? "rgba(34,197,94,0.4)" : "#1f2437"}`, borderRadius: 12, padding: "12px", cursor: "pointer", marginBottom: 8, transition: "all 0.15s" }}>
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
  const [selectedId, setSelectedId] = useState(1);
  const [view, setView] = useState("slate"); // "slate" | "game"
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

  // Fetch weather when a game card is opened
  useEffect(() => {
    if (view !== "game") return;
    const game = SLATE.find(g => g.id === selectedId);
    if (!game || game.weather?.roof) return;
    if (liveWeather[selectedId]) return; // already fetched
    setWeatherLoading(true);
    fetchWeather(selectedId, game.stadium, game.time, game.weather).then(data => {
      setLiveWeather(prev => ({ ...prev, [selectedId]: data }));
      setWeatherLoading(false);
    });
  }, [selectedId, view]);

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

  const game = SLATE.find(g => g.id === selectedId);
  const { pitcher, batter, props, umpire, nrfi, bullpen } = game;
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

  const score = calcMatchupScore(
    batter.hand, batter.vsPitches, pitcher.arsenal, pitcher.hand
  );

  // Score thresholds: < 35 pitcher edge, 35–54 neutral, 55+ batter edge
  const pitcherEdge = score < 35;
  const scoreLabel  = score >= 55 ? "BATTER EDGE" : score >= 35 ? "NEUTRAL" : "PITCHER EDGE";
  const scoreColor  = (s) => s >= 55 ? "#ef4444" : s >= 35 ? "#f59e0b" : "#22c55e";

  const TABS = ["overview", "lineup", "arsenal", "intel", "props"];

  const batterMatchupScore = (b) =>
    calcMatchupScore(b.hand, b.vsPitches, pitcher.arsenal, pitcher.hand);

  const openGame = (id) => { setSelectedId(id); setView("game"); setTab("overview"); setLineupSide("away"); setExpandedBatter(null); };

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
            <button onClick={() => setView("game")} style={{ background: view === "game" ? "#22c55e" : "#161827", border: `1px solid ${view === "game" ? "#22c55e" : "#1f2437"}`, borderRadius: 8, padding: "6px 12px", fontSize: 10, color: view === "game" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Game</button>
          </div>
        </div>

        {/* ════════════════════════════════════
            SLATE VIEW
        ════════════════════════════════════ */}
        {view === "slate" && (<>
          <SLabel>Today's Slate — {SLATE.length} Games</SLabel>
          {SLATE.map(g => (
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
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>{pitcher.arsenal.filter(a => batter.vsPitches[a.abbr]?.good === false).map(a => a.abbr).join(" · ") || "—"}</div>
                    </div>
                    <div style={{ flex: 1, background: "#1e2030", borderRadius: 8, padding: "7px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>BATTER WINS</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>{pitcher.arsenal.filter(a => batter.vsPitches[a.abbr]?.good === true).map(a => a.abbr).join(" · ") || "—"}</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Unified Pitcher + Batter */}
            <Card>
              {/* Pitcher */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: "linear-gradient(135deg, #E81828, #002D72)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{pitcher.number}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb" }}>{pitcher.name}</div>
                      <div style={{ fontSize: 9, color: "#6b7280" }}>{pitcher.team} · SP · {pitcher.hand}HP</div>
                    </div>
                    <LeanBadge label="K LEAN OVER" positive={true} small />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
                {[["ERA", pitcher.era, "#22c55e"], ["WHIP", pitcher.whip, null], ["Avg K", pitcher.avgK, "#22c55e"], ["Avg IP", pitcher.avgIP, null], ["Avg ER", pitcher.avgER, "#22c55e"]].map(([l, v, c]) => (
                  <StatMini key={l} label={l} value={v} color={c} />
                ))}
              </div>

              <Divider />

              {/* Batter */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: "linear-gradient(135deg, #003087, #C4CED4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{batter.number}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb" }}>{batter.name}</div>
                      <div style={{ fontSize: 9, color: "#6b7280" }}>{batter.team} · {batter.hand}H</div>
                    </div>
                    <LeanBadge label="HR LEAN OVER" positive={true} small />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {[["AVG", batter.avg, "#22c55e"], ["OPS", batter.ops, "#fbbf24"], ["Avg H", batter.avgH, "#22c55e"], ["Avg HR", batter.avgHR, "#fbbf24"], ["Avg TB", batter.avgTB, "#fbbf24"]].map(([l, v, c]) => (
                  <StatMini key={l} label={l} value={v} color={c} />
                ))}
              </div>
            </Card>

            {/* Hit Rates */}
            <Card>
              <SLabel>Batter Hit Rates · Last 10 Games</SLabel>
              <div style={{ display: "flex", gap: 6 }}>
                {[["Hit Games", batter.hitRate, "#22c55e"], ["HR Games", batter.hrRate, "#fbbf24"], ["2+ TB Games", batter.tbOver, "#fbbf24"]].map(([l, v, c]) => (
                  <StatMini key={l} label={l} value={v} color={c} />
                ))}
              </div>
            </Card>
          </>)}

          {/* ── LINEUP ── */}
          {tab === "lineup" && (() => {
            const lineup = game.lineups?.[lineupSide] ?? [];
            const facingPitcher = lineupSide === "away" ? game.pitcher : { name: "Home Starter", arsenal: [] };
            const label = lineupSide === "away"
              ? `${game.away.abbr} Lineup vs ${pitcher.name}`
              : `${game.home.abbr} Lineup`;

            return (<>
              {/* Toggle */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {["away", "home"].map(side => (
                  <button key={side} onClick={() => { setLineupSide(side); setExpandedBatter(null); }} style={{ flex: 1, background: lineupSide === side ? "#22c55e" : "#161827", border: `1px solid ${lineupSide === side ? "#22c55e" : "#1f2437"}`, borderRadius: 8, padding: "7px", fontSize: 11, color: lineupSide === side ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
                    {side === "away" ? `${game.away.abbr} Batting` : `${game.home.abbr} Batting`}
                  </button>
                ))}
              </div>

              <SLabel>{label}</SLabel>

              {/* Lineup vulnerability summary */}
              <Card style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Lineup Vulnerability vs {pitcher.name}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {pitcher.arsenal.map(a => {
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
                {lineup.map((b, i) => {
                  const sc = batterMatchupScore(b);
                  const scColor = scoreColor(sc);
                  const isExpanded = expandedBatter === i;
                  const recentHits = b.hitRate.reduce((a, v) => a + v, 0);

                  return (
                    <div key={i}>
                      {/* Row */}
                      <div onClick={() => setExpandedBatter(isExpanded ? null : i)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", cursor: "pointer", borderRadius: 8, background: isExpanded ? "rgba(34,197,94,0.05)" : "transparent", transition: "background 0.15s" }}>

                        {/* Order number */}
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: "#1e2030", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#6b7280", flexShrink: 0 }}>{b.order}</div>

                        {/* Name + position */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
                          <div style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>{b.pos} · {b.hand}H · {b.avg}</div>
                        </div>

                        {/* Last 5 hit dots */}
                        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                          {b.hitRate.map((h, di) => (
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

                          {/* vs pitcher arsenal */}
                          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>vs {pitcher.name}'s Pitches</div>
                          {pitcher.arsenal.map(a => {
                            const p = b.vsPitches?.[a.abbr];
                            if (!p) return null;
                            const avg    = parseFloat(typeof p === "object" ? p.avg   : p) || 0;
                            const whiff  = parseFloat(typeof p === "object" ? p.whiff : "20") || 20;
                            const slg    = parseFloat(typeof p === "object" ? p.slg   : String(avg * 1.6)) || avg * 1.6;
                            const color  = avg >= 0.28 ? "#22c55e" : avg < 0.22 ? "#ef4444" : "#f59e0b";
                            const wColor = whiff >= 30 ? "#ef4444" : whiff >= 22 ? "#f59e0b" : "#22c55e";
                            const pctWidth = Math.min((avg / 0.400) * 100, 100);
                            return (
                              <div key={a.abbr} style={{ marginBottom: 10 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: a.color, background: `${a.color}22`, borderRadius: 3, padding: "1px 5px" }}>{a.abbr}</span>
                                    <span style={{ fontSize: 10, color: "#9ca3af" }}>{a.type} · {a.pct}%</span>
                                  </div>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <span style={{ fontSize: 10, color: wColor, fontFamily: "monospace" }}>{whiff}% K</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "monospace" }}>{typeof p === "object" ? p.avg : p}</span>
                                  </div>
                                </div>
                                <div style={{ background: "#1e2030", borderRadius: 3, height: 5 }}>
                                  <div style={{ width: `${pctWidth}%`, height: "100%", background: color, borderRadius: 3 }} />
                                </div>
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
          {tab === "arsenal" && (<>
            <SLabel>{pitcher.name}'s Arsenal vs {batter.name}</SLabel>
            {pitcher.arsenal.map(a => {
              const vs = batter.vsPitches[a.abbr];
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
                        <div style={{ fontSize: 9, color: "#6b7280" }}>{a.velo} mph · {a.pct}% usage</div>
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
                      <div style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>WHIFF RATE</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{vs.note}</div>
                  {heavy && vs.good === false && <div style={{ marginTop: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "7px 10px", fontSize: 10, color: "#fca5a5" }}>⚠ Heavy usage ({a.pct}%) + weak spot = significant risk</div>}
                  {heavy && vs.good === true  && <div style={{ marginTop: 8, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "7px 10px", fontSize: 10, color: "#86efac" }}>✓ Heavy usage ({a.pct}%) + handles well = prop multiplier</div>}
                </Card>
              );
            })}
          </>)}

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
            <SLabel>First Inning Tendencies</SLabel>
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb" }}>NRFI / YRFI Lean</div>
                <LeanBadge label={`${nrfi.lean} ${nrfi.confidence}%`} positive={nrfi.lean === "NRFI"} small />
              </div>
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

            {/* Bullpen Strength */}
            <SLabel>Bullpen Strength &amp; Fatigue</SLabel>
            <BullpenCard label={game.away.abbr} data={bullpen.away} />
            <BullpenCard label={game.home.abbr} data={bullpen.home} />

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
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <StatMini label={`${game.away.abbr} ML`} value={odds.awayML} color={odds.awayML.startsWith("+") ? "#22c55e" : "#e5e7eb"} />
                <StatMini label={`${game.home.abbr} ML`} value={odds.homeML} color={odds.homeML.startsWith("-") ? "#ef4444" : "#e5e7eb"} />
                <StatMini label="Total" value={odds.total} color="#f9fafb" />
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <StatMini label="Over Odds" value={odds.overOdds} />
                <StatMini label="Under Odds" value={odds.underOdds} />
              </div>
              <div style={{ borderLeft: `3px solid ${odds.lineMove === "over" ? "#f59e0b" : odds.lineMove === "under" ? "#38bdf8" : "#6b7280"}`, background: odds.lineMove === "over" ? "rgba(245,158,11,0.05)" : odds.lineMove === "under" ? "rgba(56,189,248,0.05)" : "rgba(107,114,128,0.05)", borderRadius: "0 8px 8px 0", padding: "10px 12px", fontSize: 12, color: "#d1d5db", lineHeight: 1.5 }}>
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
          </>)}

          {/* ── PROPS ── */}
          {tab === "props" && (<>
            <SLabel>Prop Confidence Meters</SLabel>
            {props.map((p, i) => (
              <Card key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", flex: 1, paddingRight: 8, lineHeight: 1.4 }}>{p.label}</div>
                  <LeanBadge label={p.lean} positive={p.positive} small />
                </div>
                <ConfBar pct={p.confidence} positive={p.positive} />
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8, lineHeight: 1.4 }}>{p.reason}</div>
              </Card>
            ))}
          </>)}

        </>)}

        {/* Footer */}
        <div style={{ fontSize: 10, color: "#374151", textAlign: "center", marginTop: 10, lineHeight: 1.8 }}>
          {IS_SANDBOX && IS_ODDS_SANDBOX
            ? "⚠ Demo mode — mock data · Flip IS_SANDBOX + IS_ODDS_SANDBOX to go live"
            : IS_SANDBOX
              ? "⚡ Odds: LIVE · Weather: Demo · Flip IS_SANDBOX = false to add live weather"
              : IS_ODDS_SANDBOX
                ? "⚡ Weather: LIVE · Odds: Demo · Flip IS_ODDS_SANDBOX = false to add live odds"
                : "⚡ Live mode — weather + odds from real APIs"
          }
        </div>
      </div>
    </>
  );
}
