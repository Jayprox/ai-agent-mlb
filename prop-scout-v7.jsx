import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  PARK_FACTORS,
  NEUTRAL_PARK,
  HOME_FIELD_ADV,
  DEFAULT_HOME_ADV,
  MODEL_TIER,
  UMPIRE_STATS,
} from "./src/constants.js";
import {
  mlToImplied,
  formatLocalTime,
  resultBorderStyle,
  summarizeOutcomes,
  normalizeScratchName,
  vigStrip,
  propEdgeData,
  kellyFraction,
  useLongPress,
} from "./src/utils.js";
import { hrBoardScore, hitBoardScore } from "./src/scoring/batter.js";
import { LeanBadge, TierBadge, GameStatusBadge, RankScoreColumn, Card, Divider } from "./src/components/shared.jsx";
import {
  computePitcherBoard,
  computeBatterBoard,
  computeGameBoard,
  buildAiBoardPayload,
} from "./src/board/index.js";
import PitcherBoardCard from "./src/components/PitcherBoardCard.jsx";
import BatterBoardCard from "./src/components/BatterBoardCard.jsx";
import GameBoardCard from "./src/components/GameBoardCard.jsx";
import EdgeCard from "./src/components/EdgeCard.jsx";
import BoardGameGroup from "./src/components/BoardGameGroup.jsx";
import TabHitBadge from "./src/components/TabHitBadge.jsx";
import ScoutPickCard from "./src/components/ScoutPickCard.jsx";

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

const GAME_MARKETS_SET = new Set(["ml", "spread", "total", "nrfi", "f5ml", "f5spread"]);
const PROP_MARKETS_SET = new Set(["k", "outs", "hr", "hits"]);

const parseIpToOutsLocal = (ip) => {
  if (!ip) return 0;
  const [whole, frac = "0"] = String(ip).split(".");
  return ((parseInt(whole, 10) || 0) * 3) + (parseInt(frac, 10) || 0);
};

const calcPickPnl = (resultHit, odds, units) => {
  if (resultHit === null || resultHit === undefined) return null;
  if (!resultHit) return -(Number(units) || 0);
  if (odds == null) return Number(units) || 0; // no odds logged — flat +units per win
  const oddsNum = Number(odds);
  const unitsNum = Number(units) || 0;
  if (!Number.isFinite(oddsNum) || oddsNum === 0 || !Number.isFinite(unitsNum)) return null;
  const profit = oddsNum > 0
    ? unitsNum * (oddsNum / 100)
    : unitsNum * (100 / Math.abs(oddsNum));
  return Math.round(profit * 100) / 100;
};

const gradePickLocally = (pick, { liveBoxscores, liveScores, liveSlate }) => {
  if (!pick?.market) return null;

  const market = String(pick.market).toLowerCase();
  if (!GAME_MARKETS_SET.has(market) && !PROP_MARKETS_SET.has(market)) return null;

  const slateGame = GAME_MARKETS_SET.has(market)
    ? (liveSlate ?? []).find((g) => String(g.gamePk) === String(pick.playerId))
    : (liveSlate ?? []).find((g) => `${g.away?.abbr ?? ""} @ ${g.home?.abbr ?? ""}` === pick.gameLabel);
  const gamePk = slateGame?.gamePk ?? (GAME_MARKETS_SET.has(market) ? pick.playerId : null);
  if (!gamePk) return null;

  const statusText = String(slateGame?.status ?? "").toLowerCase();
  if (statusText.includes("postponed") || statusText.includes("cancelled") || statusText.includes("canceled") || statusText.includes("suspended")) {
    return { resultHit: null, actualStat: null, gradeStatus: "ppd" };
  }

  const isFinal = statusText === "final" || statusText === "game over" || statusText === "completed early";
  if (!isFinal) return null;

  const box = liveBoxscores?.[gamePk];
  const liveScore = liveScores?.[gamePk];
  const linescore = box?.linescore ?? null;

  const awayRuns = Number.isFinite(linescore?.away?.runs) ? Number(linescore.away.runs) : Number(liveScore?.awayScore);
  const homeRuns = Number.isFinite(linescore?.home?.runs) ? Number(linescore.home.runs) : Number(liveScore?.homeScore);
  const innings = Array.isArray(linescore?.innings) ? linescore.innings : null;
  const sideText = String(pick.side ?? "").trim().toUpperCase();
  const bookLine = pick.bookLine != null && Number.isFinite(Number(pick.bookLine)) ? Number(pick.bookLine) : null;

  if (GAME_MARKETS_SET.has(market)) {
    if (!Number.isFinite(awayRuns) || !Number.isFinite(homeRuns)) return null;

    if (market === "nrfi") {
      if (!Array.isArray(innings) || innings.length < 1) return null;
      const first = innings[0] ?? {};
      const firstRuns = (Number(first.away) || 0) + (Number(first.home) || 0);
      const wantNrfi = sideText === "NRFI" || sideText === "OVER";
      return { resultHit: wantNrfi ? firstRuns === 0 : firstRuns > 0, actualStat: firstRuns, gradeStatus: null };
    }

    if (market === "total") {
      if (bookLine == null) return null;
      const actualTotal = awayRuns + homeRuns;
      if (actualTotal === bookLine) return { resultHit: null, actualStat: actualTotal, gradeStatus: "push" };
      const wantOver = sideText === "OVER";
      return { resultHit: wantOver ? actualTotal > bookLine : actualTotal < bookLine, actualStat: actualTotal, gradeStatus: null };
    }

    if (market === "spread") {
      if (bookLine == null || !slateGame) return null;
      const pickHome = sideText === "HOME" || sideText === String(slateGame.home?.abbr ?? "").toUpperCase();
      const pickAway = sideText === "AWAY" || sideText === String(slateGame.away?.abbr ?? "").toUpperCase();
      if (!pickHome && !pickAway) return null;
      const spreadResult = pickHome ? (homeRuns + bookLine) - awayRuns : (awayRuns + bookLine) - homeRuns;
      if (spreadResult === 0) return { resultHit: null, actualStat: pickHome ? homeRuns - awayRuns : awayRuns - homeRuns, gradeStatus: "push" };
      return { resultHit: spreadResult > 0, actualStat: pickHome ? homeRuns - awayRuns : awayRuns - homeRuns, gradeStatus: null };
    }

    if (market === "ml") {
      if (awayRuns === homeRuns || !slateGame) return { resultHit: null, actualStat: awayRuns - homeRuns, gradeStatus: "push" };
      const pickHome = sideText === "HOME" || sideText === String(slateGame.home?.abbr ?? "").toUpperCase();
      const pickAway = sideText === "AWAY" || sideText === String(slateGame.away?.abbr ?? "").toUpperCase();
      if (!pickHome && !pickAway) return null;
      return { resultHit: pickHome ? homeRuns > awayRuns : awayRuns > homeRuns, actualStat: pickHome ? homeRuns - awayRuns : awayRuns - homeRuns, gradeStatus: null };
    }

    if (market === "f5ml" || market === "f5spread") {
      if (!Array.isArray(innings) || innings.length < 5 || !slateGame) return null;
      const f5Away = innings.slice(0, 5).reduce((sum, inn) => sum + (Number(inn?.away) || 0), 0);
      const f5Home = innings.slice(0, 5).reduce((sum, inn) => sum + (Number(inn?.home) || 0), 0);
      const pickHome = sideText === "HOME" || sideText === String(slateGame.home?.abbr ?? "").toUpperCase();
      const pickAway = sideText === "AWAY" || sideText === String(slateGame.away?.abbr ?? "").toUpperCase();
      if (!pickHome && !pickAway) return null;
      if (market === "f5ml") {
        if (f5Away === f5Home) return { resultHit: null, actualStat: f5Away - f5Home, gradeStatus: "push" };
        return { resultHit: pickHome ? f5Home > f5Away : f5Away > f5Home, actualStat: pickHome ? f5Home - f5Away : f5Away - f5Home, gradeStatus: null };
      }
      if (bookLine == null) return null;
      const f5SpreadResult = pickHome ? (f5Home + bookLine) - f5Away : (f5Away + bookLine) - f5Home;
      if (f5SpreadResult === 0) return { resultHit: null, actualStat: pickHome ? f5Home - f5Away : f5Away - f5Home, gradeStatus: "push" };
      return { resultHit: f5SpreadResult > 0, actualStat: pickHome ? f5Home - f5Away : f5Away - f5Home, gradeStatus: null };
    }

    return null;
  }

  if (!box) return null;

  const battingRows = [
    ...(Array.isArray(box?.batting?.away) ? box.batting.away : Object.values(box?.batting?.away ?? {})),
    ...(Array.isArray(box?.batting?.home) ? box.batting.home : Object.values(box?.batting?.home ?? {})),
  ];
  const pitchingRows = [
    ...(Array.isArray(box?.pitching?.away) ? box.pitching.away : Object.values(box?.pitching?.away ?? {})),
    ...(Array.isArray(box?.pitching?.home) ? box.pitching.home : Object.values(box?.pitching?.home ?? {})),
  ];
  const playerId = String(pick.playerId ?? "");

  if (market === "hr" || market === "hits") {
    const batter = battingRows.find((row) => String(row?.id ?? "") === playerId);
    if (!batter) return { resultHit: null, actualStat: null, gradeStatus: "scratch" };
    const actualStat = market === "hr" ? Number(batter?.hr ?? 0) : Number(batter?.h ?? 0);
    return { resultHit: actualStat > 0, actualStat, gradeStatus: null };
  }

  if (market === "k" || market === "outs") {
    const pitcher = pitchingRows.find((row) => String(row?.id ?? "") === playerId);
    if (!pitcher) return { resultHit: null, actualStat: null, gradeStatus: "scratch" };
    const actualStat = market === "k"
      ? Number(pitcher?.so ?? pitcher?.k ?? 0)
      : parseIpToOutsLocal(pitcher?.ip);
    if (bookLine == null) return null;
    if (actualStat === bookLine) return { resultHit: null, actualStat, gradeStatus: "push" };
    const wantOver = sideText === "OVER";
    return { resultHit: wantOver ? actualStat > bookLine : actualStat < bookLine, actualStat, gradeStatus: null };
  }

  return null;
};

// ─────────────────────────────────────────────
// SANDBOX DETECTION
// Claude artifact sandbox blocks outbound fetch.
// Flip this to false when running in a real environment.
// ─────────────────────────────────────────────
const IS_SANDBOX = false;

// ─────────────────────────────────────────────
// UMPIRE STATS — keyed by full name as returned by the MLB Stats API.
// kRate / bbRate: career per-game K% / BB% with that umpire behind the plate.
// rating: "pitcher" (tight/wide zone benefits pitcher), "hitter", or "neutral".
// Source: UmpScorecards.com multi-season averages (updated pre-season).
// ─────────────────────────────────────────────

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

const buildPropsContext = (game, odds, parkFactors, pitcher, umpire, playerPropsData) => {
  const lines = [];
  lines.push(`Game: ${game.away.abbr} @ ${game.home.abbr} at ${game.stadium ?? "Unknown Stadium"}`);

  if (pitcher) {
    lines.push(`Away SP: ${game.awayPitcher?.name ?? "TBD"} (${game.awayPitcher?.hand ?? "?"}HP) — ERA ${game.awayPitcher?.era ?? "—"}, K/9 ${game.awayPitcher?.k9 ?? "—"}, WHIP ${game.awayPitcher?.whip ?? "—"}, avgIP ${game.awayPitcher?.avgIP ?? "—"}`);
    lines.push(`Home SP: ${pitcher.name ?? "TBD"} (${pitcher.hand ?? "?"}HP) — ERA ${pitcher.era ?? "—"}, K/9 ${pitcher.kPer9 ?? pitcher.k9 ?? "—"}, WHIP ${pitcher.whip ?? "—"}, avgIP ${pitcher.avgIP ?? "—"}`);
  }

  if (umpire?.name && umpire.name !== "TBD") {
    const parts = [`Umpire: ${umpire.name}`];
    if (umpire.tendency) parts.push(umpire.tendency);
    if (umpire.kRate) parts.push(`K Rate ${umpire.kRate}`);
    lines.push(parts.join(" — "));
  }

  if (game.weather) {
    const w = game.weather;
    lines.push(w.roof
      ? "Weather: Dome — controlled environment"
      : `Weather: ${w.temp ?? "?"}°F, ${w.wind ?? "calm"}${w.hrFavorable ? " — HR-favorable wind" : ""}`
    );
  }

  if (game.bullpen?.away) lines.push(`Away Bullpen: Grade ${game.bullpen.away.grade ?? "?"}, ${game.bullpen.away.fatigueLevel ?? "?"} fatigue`);
  if (game.bullpen?.home) lines.push(`Home Bullpen: Grade ${game.bullpen.home.grade ?? "?"}, ${game.bullpen.home.fatigueLevel ?? "?"} fatigue`);

  if (game.nrfi?.lean) lines.push(`NRFI lean: ${game.nrfi.lean} at ${game.nrfi.confidence ?? "?"}% confidence`);

  const pf = parkFactors?.[game.home?.abbr];
  if (pf) lines.push(`Park: ${game.stadium ?? game.home.abbr} — ${pf.label} (HR ${pf.hr}x, Hit ${pf.hit}x)`);

  if (odds?.total) {
    const ml = odds.awayML && odds.homeML ? ` | ML: ${game.away.abbr} ${odds.awayML} / ${game.home.abbr} ${odds.homeML}` : "";
    lines.push(`Total: O/U ${odds.total}${ml}`);
  }

  if (Array.isArray(playerPropsData?.props)) {
    const lastName = (pitcher?.name ?? "").split(" ").pop().toLowerCase();
    const kLine = playerPropsData.props.find((p) => p.market === "pitcher_strikeouts" && (p.player ?? "").toLowerCase().includes(lastName));
    const outLine = playerPropsData.props.find((p) => p.market === "pitcher_outs" && (p.player ?? "").toLowerCase().includes(lastName));
    if (kLine?.line) lines.push(`Market K line: ${kLine.line}`);
    if (outLine?.line) lines.push(`Market Outs line: ${outLine.line}`);
  }

  return lines.filter(Boolean).join("\n");
};

// ─────────────────────────────────────────────────────────────
// PLAYER PROPS — routed through backend (shared server-side 10-min cache)
// Passes the Odds API eventId (from oddsCache) to the backend so it can skip
// its own events-list lookup — saves a credit per game.
// ─────────────────────────────────────────────────────────────
const playerPropsCache   = {};  // browser-side dedup: key = gamePk string
const PLAYER_PROP_LABELS = { pitcher_strikeouts: "K", pitcher_outs: "Outs", batter_total_bases: "TB", batter_hits: "H", batter_home_runs: "HR" };

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

// Module-level auth token — set by App on login/logout so every fetch auto-includes it.
// Initialized directly from localStorage so it's available before any useEffect runs,
// preventing a 401 race on page reload that would log the user out.
let _authToken = (() => { try { return localStorage.getItem("propscout_token") || null; } catch { return null; } })();

const apiFetch = async (path, init = {}) => {
  const headers = { ...(init.headers ?? {}) };
  if (_authToken) headers["Authorization"] = `Bearer ${_authToken}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    _authToken = null;
    window.dispatchEvent(new Event("propscout:unauthorized"));
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
  }
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
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
};

const SUMMARY_NEGATIVE_RE = /\b(caution|concern|risk|risky|elevated|low|poor|short|below|struggling|suppresses|suppressing|tough|mixed|neutral|unavailable|not directly actionable)\b/i;

const topPositiveSummaryLines = (factors = [], count = 2) =>
  [...(factors ?? [])]
    .filter(f => (f?.pts ?? 0) > 0)
    .sort((a, b) => (b?.pts ?? 0) - (a?.pts ?? 0))
    .slice(0, count)
    .map(f => String(f?.detail ?? f?.label ?? "").trim())
    .filter(Boolean);

const topCautionSummaryLine = (factors = []) => {
  const cautionFactor = [...(factors ?? [])]
    .filter(f => (f?.pts ?? 0) <= 0 || SUMMARY_NEGATIVE_RE.test(String(f?.detail ?? "")))
    .sort((a, b) => (a?.pts ?? 0) - (b?.pts ?? 0))[0];
  return cautionFactor ? String(cautionFactor.detail ?? cautionFactor.label ?? "").trim() : null;
};

/** Normalize GET /api/ai-board/edges rows for AI Board + Predict display. */
function normalizeAiBoardEdge(raw) {
  const inner = raw?._candidate && typeof raw._candidate === "object" ? raw._candidate : {};
  const merged = { ...inner, ...raw };
  return {
    ...merged,
    id: raw.id,
    entityId: raw.entityId ?? inner.id ?? raw.id,
    market: raw.market,
    name: merged.name ?? raw.playerName ?? null,
    playerName: raw.playerName ?? merged.name ?? null,
    team: merged.team ?? raw.team,
    gameLabel: merged.gameLabel ?? raw.gameLabel,
    gamePk: merged.gamePk ?? raw.gamePk ?? null,
    gameTime: merged.gameTime ?? raw.gameTime ?? null,
    score: merged.score ?? raw.score,
    simConfidence: merged.simConfidence ?? raw.simConfidence,
    bookLine: raw.bookLine ?? merged.bookLine ?? null,
    lean: raw.lean ?? merged.lean ?? (merged.score >= 55 ? "OVER" : "UNDER"),
    bookOdds: raw.bookOdds ?? merged.bookOdds,
    edge: raw.edge ?? null,
    aiScore: raw.aiScore,
    aiReason: raw.aiReason ?? null,
    propLine: merged.propLine ?? raw.propLine,
    suggestedLine: merged.suggestedLine ?? raw.suggestedLine,
    signals: merged.signals ?? raw.signals ?? [],
    stats: raw.stats ?? {},
    leanLabel: merged.leanLabel ?? raw.leanLabel,
    odds: merged.odds ?? raw.odds,
    homeSP: merged.homeSP,
    awaySP: merged.awaySP,
    home: merged.home,
    away: merged.away,
  };
}

const fallbackCardSummary = ({ positives = [], caution = null, lean = "", market = "" }) => {
  const top = positives.filter(Boolean).slice(0, 2);
  if (top.length >= 2) return caution ? `${top[0]}; ${top[1]}. ${caution}.` : `${top[0]}; ${top[1]}.`;
  if (top.length === 1) return caution ? `${top[0]}. ${caution}.` : `${top[0]}.`;
  return caution || `${market || "This matchup"} leans ${String(lean || "neutral").toLowerCase()} from the current factor mix.`;
};

function buildPerfMatrix(rows) {
  const MARKETS = ["hr", "hits", "k", "outs"];
  const TIERS = ["high", "mid", "low"];
  const matrix = {};
  for (const market of MARKETS) {
    matrix[market] = {};
    for (const tier of TIERS) {
      matrix[market][tier] = { total: 0, resolved: 0, hits: 0, misses: 0 };
    }
  }
  for (const row of rows ?? []) {
    const cell = matrix[row.market]?.[row.scoreTier];
    if (!cell) continue;
    cell.total += Number(row.total) || 0;
    cell.resolved += Number(row.resolved) || 0;
    cell.hits += Number(row.hits) || 0;
    cell.misses += Number(row.misses) || 0;
  }
  return matrix;
}

function buildScoutCandidates({
  liveSlate, liveLineups, liveWeather, livePlayerProps,
  livePitcherStats, liveGameLog, liveUmpires, liveTeamStats,
  liveHittingLog, liveStatSplits, pitcherArsenal,
  liveNrfiData, liveOddsMap,
}) {
  const candidates = [];

  const kCards = computePitcherBoard("k", liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);
  const outCards = computePitcherBoard("outs", liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);
  const totalGames = computeGameBoard("total", liveSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires, liveLineups);
  const spreadGames = computeGameBoard("spread", liveSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires, liveLineups);
  const mlGames = computeGameBoard("ml", liveSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires, liveLineups);
  const f5mlGames = computeGameBoard("f5ml", liveSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires, liveLineups);
  const f5spreadGames = computeGameBoard("f5spread", liveSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires, liveLineups);

  const mapPropFactors = (c, market) => {
    const facts = [];
    if (c.avgK3 != null)    facts.push(`Avg ${market === "k" ? "Ks" : "IP×3"} last 3 starts: ${c.avgK3}`);
    const k9 = parseFloat(c.k9);
    if (!isNaN(k9) && k9 > 0) facts.push(`K/9: ${k9.toFixed(1)}`);
    const era = parseFloat(c.era);
    if (!isNaN(era))        facts.push(`ERA: ${era.toFixed(2)}`);
    const whip = parseFloat(c.whip);
    if (!isNaN(whip))       facts.push(`WHIP: ${whip.toFixed(2)}`);
    if (c.avgIP && c.avgIP !== "—") facts.push(`Avg IP: ${c.avgIP}`);
    if (c.umpire)           facts.push(`Umpire: ${c.umpire}${c.umpireRating != null ? ` (K rate: ${c.umpireRating})` : ""}`);
    if (c.swStrPct != null) facts.push(`Whiff rate: ${(c.swStrPct * 100).toFixed(1)}%`);
    if (c.chasePct != null) facts.push(`Chase rate: ${(c.chasePct * 100).toFixed(1)}%`);
    // append any model signals (e.g. opp K%)
    (c.signals ?? []).forEach(s => facts.push(s));
    return facts.slice(0, 6);
  };

  for (const c of kCards) {
    const lean = c.score >= 55 ? "OVER" : "UNDER";
    const { bookOdds, impliedProb } = propEdgeData(c.propLine ?? null, lean);
    if (!bookOdds || impliedProb == null) continue;
    if (c.score < 62 || (c.simConfidence ?? 0) < 55) continue;
    const modelProb = (c.simConfidence ?? 50) / 100;
    if (modelProb <= impliedProb) continue;
    const kelly = kellyFraction(modelProb, bookOdds);
    if (kelly <= 0) continue;
    candidates.push({
      id: `${c.id}-k`,
      entityId: c.id,
      gamePk: c.gamePk,
      market: "k",
      playerName: c.name,
      gameLabel: c.gameLabel,
      lean,
      bookLine: c.bookLine ?? c.propLine?.line ?? c.suggestedLine ?? null,
      bookOdds,
      score: c.score,
      simConfidence: c.simConfidence,
      impliedProb,
      modelProb,
      kellyFraction: kelly,
      factors: mapPropFactors(c, "k"),
      risks: [],
    });
  }

  for (const c of outCards) {
    const lean = c.score >= 55 ? "OVER" : "UNDER";
    const { bookOdds, impliedProb } = propEdgeData(c.propLine ?? null, lean);
    if (!bookOdds || impliedProb == null) continue;
    if (c.score < 62 || (c.simConfidence ?? 0) < 55) continue;
    const modelProb = (c.simConfidence ?? 50) / 100;
    if (modelProb <= impliedProb) continue;
    const kelly = kellyFraction(modelProb, bookOdds);
    if (kelly <= 0) continue;
    candidates.push({
      id: `${c.id}-outs`,
      entityId: c.id,
      gamePk: c.gamePk,
      market: "outs",
      playerName: c.name,
      gameLabel: c.gameLabel,
      lean,
      bookLine: c.bookLine ?? c.propLine?.line ?? c.suggestedLine ?? null,
      bookOdds,
      score: c.score,
      simConfidence: c.simConfidence,
      impliedProb,
      modelProb,
      kellyFraction: kelly,
      factors: mapPropFactors(c, "outs"),
      risks: [],
    });
  }

  const gameDisplayScore = (g) => g.score ?? 0;
  const gameLists = [
    [totalGames, "total"],
    [spreadGames, "spread"],
    [mlGames, "ml"],
    [f5mlGames, "f5ml"],
    [f5spreadGames, "f5spread"],
  ];

  for (const [gameList, market] of gameLists) {
    for (const g of gameList) {
      const dispScore = gameDisplayScore(g);
      if (dispScore < 55) continue;
      const oddsField = market === "total"
        ? (g.lean === "OVER" ? g.odds?.overOdds : g.odds?.underOdds)
        : market === "spread"
        ? (g.lean === "HOME" ? g.odds?.homeSpreadOdds : g.odds?.awaySpreadOdds)
        : market === "ml"
        ? (g.lean === "HOME" ? g.odds?.homeML : g.odds?.awayML)
        : market === "f5ml"
        ? (g.lean === "HOME" ? (g.odds?.f5HomeML ?? g.odds?.homeML) : (g.odds?.f5AwayML ?? g.odds?.awayML))
        : (g.lean === "HOME"
          ? (g.odds?.f5HomeSpreadOdds ?? g.odds?.homeSpreadOdds)
          : (g.odds?.f5AwaySpreadOdds ?? g.odds?.awaySpreadOdds));
      const bookOdds = oddsField != null ? parseInt(oddsField, 10) : null;
      const impliedProb = bookOdds != null ? mlToImplied(bookOdds) : null;
      if (!bookOdds || impliedProb == null) continue;
      const modelProb = Math.min(0.90, Math.max(0.50, dispScore / 100));
      if (modelProb <= impliedProb) continue;
      const kelly = kellyFraction(modelProb, bookOdds);
      if (kelly <= 0) continue;
      candidates.push({
        id: `${g.gamePk}-${market}`,
        entityId: g.gamePk,
        gamePk: g.gamePk,
        market,
        playerName: null,
        gameLabel: g.gameLabel ?? `${g.away?.abbr ?? "?"} @ ${g.home?.abbr ?? "?"}`,
        lean: g.lean,
        leanLabel: g.leanLabel ?? g.lean,
        bookLine: g.bookLine ?? g.line ?? null,
        bookOdds,
        score: dispScore,
        simConfidence: null,
        impliedProb,
        modelProb,
        kellyFraction: kelly,
        factors: (g.factors ?? []).map((s) => s.detail ?? s.label).filter(Boolean).slice(0, 4),
        risks: [],
      });
    }
  }

  return candidates.sort((a, b) => b.kellyFraction - a.kellyFraction);
}

function scoutMath(picks, unitSize, dailyGoal) {
  if (!picks.length) {
    return {
      picksCount: 0,
      totalRisked: 0,
      hitsAt625: 0,
      net625: 0,
      breakEvenHits: 0,
      breakEvenPct: 0,
      dailyGoal,
    };
  }
  const payouts = picks.map((p) => {
    const odds = p.bookOdds ?? -110;
    const winAmt = odds > 0 ? (unitSize * odds / 100) : (unitSize * 100 / Math.abs(odds));
    return { win: winAmt, lose: unitSize };
  });
  const totalRisked = unitSize * picks.length;
  const avgWin = payouts.reduce((s, p) => s + p.win, 0) / picks.length;
  const hitsAt625 = Math.round(picks.length * 0.625);
  const net625 = payouts.slice(0, hitsAt625).reduce((s, p) => s + p.win, 0)
    - payouts.slice(hitsAt625).reduce((s, p) => s + p.lose, 0);
  const breakEvenHits = totalRisked / (avgWin + unitSize);
  return {
    picksCount: picks.length,
    totalRisked,
    hitsAt625,
    net625: Math.round(net625 * 100) / 100,
    breakEvenHits: Math.round(breakEvenHits * 10) / 10,
    breakEvenPct: picks.length ? Math.round((breakEvenHits / picks.length) * 100) : 0,
    dailyGoal,
  };
}

function picksNeeded(dailyGoal, unitSize, avgOdds = -110) {
  const b = avgOdds > 0 ? avgOdds / 100 : 100 / Math.abs(avgOdds);
  const evPerUnit = 0.625 * b - 0.375;
  if (evPerUnit <= 0) return 10;
  return Math.ceil(dailyGoal / (unitSize * evPerUnit));
}


const buildBoardSummaryRequest = (c, type) => {
  const factors = c?.factors ?? generateWhyFactors(c, type);
  const score   = c?.score ?? null;

  // scoreTier drives AI tone: "high" → confident edge, "mid" → balanced, "low" → honest risk assessment
  const scoreTier = score == null ? "mid" : score >= 75 ? "high" : score >= 55 ? "mid" : "low";

  // For game-board markets the score is HOME-biased (> 50 = lean HOME/NRFI/OVER).
  // When the lean is toward the AWAY side the factors with pts > 0 are actually
  // working AGAINST the lean — don't feed them to the AI as "positives."
  const GAME_BOARD_TYPES = new Set(["nrfi", "total", "spread", "ml", "f5ml", "f5spread"]);
  let positives, negatives, caution;
  if (GAME_BOARD_TYPES.has(type) && c?.lean) {
    const leanHigh = ["HOME", "NRFI", "OVER"].includes(c.lean); // score > 50
    const sortedByImpact = [...(factors ?? [])].sort(
      (a, b) => Math.abs(b?.pts ?? 0) - Math.abs(a?.pts ?? 0)
    );
    // Factors that SUPPORT the lean direction
    const supporting = sortedByImpact.filter(f => leanHigh ? (f?.pts ?? 0) > 0 : (f?.pts ?? 0) < 0);
    // Factors that WORK AGAINST the lean
    const headwinds  = sortedByImpact.filter(f => leanHigh ? (f?.pts ?? 0) < 0 : (f?.pts ?? 0) > 0);
    positives = supporting.slice(0, 2).map(f => String(f?.detail ?? f?.label ?? "").trim()).filter(Boolean);
    negatives = headwinds.slice(0, 2).map(f => String(f?.detail ?? f?.label ?? "").trim()).filter(Boolean);
    const topHeadwind = headwinds[0];
    caution   = topHeadwind ? (String(topHeadwind?.detail ?? topHeadwind?.label ?? "").trim() || null) : null;
  } else {
    // Sort all factors: positives descending, negatives ascending (most negative first)
    const sortedPos = [...(factors ?? [])].filter(f => (f?.pts ?? 0) > 0).sort((a, b) => (b?.pts ?? 0) - (a?.pts ?? 0));
    const sortedNeg = [...(factors ?? [])].filter(f => (f?.pts ?? 0) <= 0).sort((a, b) => (a?.pts ?? 0) - (b?.pts ?? 0));
    positives = sortedPos.slice(0, 2).map(f => String(f?.detail ?? f?.label ?? "").trim()).filter(Boolean);
    negatives = sortedNeg.slice(0, 2).map(f => String(f?.detail ?? f?.label ?? "").trim()).filter(Boolean);
    caution   = topCautionSummaryLine(factors);
  }

  // For game boards, explicitly pass home/away team abbreviations so the AI
  // cannot confuse which side has home-field advantage.
  const awayAbbr = c?.away?.abbr ?? null;
  const homeAbbr = c?.home?.abbr ?? null;
  const gameMatchup = (awayAbbr && homeAbbr)
    ? `${awayAbbr} (away) @ ${homeAbbr} (home)`
    : (c?.matchup ?? null);

  return {
    id: `board:${type}:${c?.id ?? c?.gamePk}:${score ?? "na"}`,
    // Canonical market slug — must match backend card_summaries card_key (Phase A)
    market: type,
    lean:      c?.leanAbbr ?? c?.lean ?? "",
    positives,
    negatives,
    caution,
    matchup:      gameMatchup,
    signals:      Array.isArray(c?.signals) ? c.signals.slice(0, 4) : [],
    name:         c?.name ?? null,
    hand:         c?.hand ?? null,
    facingTeam:   c?.facingTeam ?? null,
    avgK3:        c?.avgK3 ?? null,
    avgIP:        c?.avgIP ?? null,
    era:          c?.era ?? null,
    whip:         c?.whip ?? null,
    oppKPct:      c?.oppKPct ?? null,
    umpire:       c?.umpire ?? null,
    umpireRating: c?.umpireRating ?? null,
    bookLine:     c?.bookLine ?? null,
    windFav:      c?.windFav ?? null,
    order:        c?.order ?? null,
    score,
    scoreTier,
  };
};

const buildModelSummaryRequest = (p) => {
  const allSignals = (p?.signals ?? []).filter(Boolean);
  const positives  = allSignals.filter(s => !SUMMARY_NEGATIVE_RE.test(String(s))).slice(0, 2);
  const negatives    = allSignals.filter(s => SUMMARY_NEGATIVE_RE.test(String(s))).slice(0, 2).map(s => String(s).trim());
  const caution      = allSignals.find(s => SUMMARY_NEGATIVE_RE.test(String(s))) ?? null;
  const score        = p?.confidence ?? null;
  const scoreTier    = score == null ? "mid" : score >= 75 ? "high" : score >= 55 ? "mid" : "low";
  return {
    id: `model:${p?.gamePk}:${p?.label}:${p?.confidence ?? "na"}`,
    market: `${p?.propType ?? "Model"} Picks`,
    lean: p?.lean ?? "",
    positives,
    negatives,
    caution,
    signals:    allSignals.slice(0, 4),
    name:       p?.player ?? p?.playerName ?? null,
    hand:       p?.hand ?? null,
    facingTeam: p?.opponent ?? p?.facingTeam ?? null,
    score,
    scoreTier,
  };
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
  // Game-level types: factors are pre-computed in computeGameBoard
  if (type === "nrfi" || type === "total" || type === "spread" || type === "ml" || type === "f5ml" || type === "f5spread") {
    return c.factors ?? [];
  }

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
// Converts a slate schedule entry into a game-card-compatible
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
    gameTime:    sg.gameTime ?? null,
    time:        formatLocalTime(sg.gameTime) ?? sg.time,
    status:      sg.status ?? "Scheduled",
    stadium:     sg.stadium,
    location:    "",
    weather:     tpl.weather,  // overridden by Open-Meteo when IS_SANDBOX = false
    umpire:      { name: "TBD", kRate: "—", bbRate: "—", tendency: "Awaiting assignment", rating: "neutral" },
    odds:        { ...tpl.odds, lineMove: "none" },  // lineMove reset — overridden by Odds API when live
    nrfi:        tpl.nrfi,     // mock — pending historical data integration
    bullpen:     tpl.bullpen,  // mock — pending bullpen data integration
    pitcher:          mkPitcher(hp),       // home SP — faces the away lineup
    awayPitcher:      mkPitcher(ap),       // away SP — faces the home lineup
    probablePitchers: sg.probablePitchers, // preserved so computePitcherBoard + totalPitcherSlots work on activeSlate
    batter:           tpl.batter,          // featured batter — pending player selection logic
    lineups:          { away: [], home: [] },
    props:            [],
  };
};

const formatSlateWeatherEntry = (game, rawWeather) => {
  const stadium = STADIUMS[game?.stadium];
  if (stadium?.roof && !rawWeather) {
    return {
      condition: "Dome",
      wind: "N/A",
      humidity: "N/A",
      rainChance: "N/A",
      roof: true,
      hrFavorable: false,
      live: false,
    };
  }
  if (!rawWeather || !stadium) {
    return {
      condition: "Unavailable",
      wind: "N/A",
      humidity: "N/A",
      rainChance: "N/A",
      roof: !!stadium?.roof,
      hrFavorable: false,
      live: false,
    };
  }
  return {
    temp:        rawWeather.temp,
    condition:   WMO_CODES[rawWeather.weathercode] ?? "Unknown",
    wind:        windDescription(rawWeather.winddirection, rawWeather.windspeed, stadium.orientation),
    humidity:    `${Math.round(rawWeather.relativehumidity ?? 0)}%`,
    rainChance:  `${rawWeather.precipitation_probability ?? 0}%`,
    roof:        !!stadium.roof,
    hrFavorable: isHrFavorable(rawWeather.winddirection, rawWeather.windspeed, stadium.orientation, rawWeather.temp),
    live:        true,
    fetchedAt:   rawWeather.fetchedAt,
  };
};

const formatSlateWeatherMap = (games, weatherMap) => {
  const next = {};
  (games ?? []).forEach((game) => {
    next[game.gamePk] = formatSlateWeatherEntry(game, weatherMap?.[game.gamePk] ?? null);
  });
  return next;
};

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

const PROP_MARKET_MAP = {
  pitcher_strikeouts: "k",
  pitcher_outs: "outs",
  batter_hits: "hits",
  batter_home_runs: "hr",
  batter_total_bases: "hits",
};

const MARKET_LABELS = { k: "K", outs: "Outs", hr: "HR", hits: "Hits" };
const MARKET_COLORS = { k: "#38bdf8", outs: "#34d399", hr: "#fbbf24", hits: "#f87171" };

const PropsSportsbookRow = ({
  p,
  i,
  mKey,
  activeBooks,
  allActiveBooks,
  expandedPropRow,
  setExpandedPropRow,
  lineupScratchNames,
  BOOK_COLORS,
  currentUser,
  loggedPickIds,
  selectedGame,
  slateDate,
  openAddPickSheet,
}) => {
  const books = p.books ?? {};
  const rowKey = `${mKey}:${p.player}`;
  const isExpanded = expandedPropRow === rowKey;
  const scratchedRow = lineupScratchNames.has(normalizeScratchName(p.player));
  const availLines = allActiveBooks.map((bk) => books[bk]?.line).filter(Boolean);
  const uniqueLines = [...new Set(availLines)];
  const hasDiscrepancy = uniqueLines.length > 1;
  const lowestLine = hasDiscrepancy ? Math.min(...uniqueLines) : null;
  const SHARP_BOOKS = ["DK", "FD"];
  const SQUARE_BOOKS = ["CZR", "MGM", "BOV"];
  const sharpLines = SHARP_BOOKS.map((bk) => books[bk]?.line).filter(Boolean);
  const squareLines = SQUARE_BOOKS.map((bk) => books[bk]?.line).filter(Boolean);
  const sharpAvg = sharpLines.length ? sharpLines.reduce((s, v) => s + v, 0) / sharpLines.length : null;
  const squareAvg = squareLines.length ? squareLines.reduce((s, v) => s + v, 0) / squareLines.length : null;
  const lineGap = (sharpAvg !== null && squareAvg !== null) ? (squareAvg - sharpAvg) : null;
  const hasEdge = lineGap !== null && lineGap >= 0.5;
  const rawConfidencePct = hasEdge
    ? Math.min(80, Math.round(55 + (lineGap / 0.5) * 10))
    : null;
  const confidencePct = rawConfidencePct == null
    ? (scratchedRow ? 40 : null)
    : Math.max(40, rawConfidencePct - (scratchedRow ? 20 : 0));
  const confidenceLabel = confidencePct !== null
    ? (scratchedRow ? "SCRATCHED" : confidencePct >= 75 ? "HIGH" : confidencePct >= 65 ? "MOD" : "MILD")
    : null;
  const confidenceColor = confidenceLabel === "SCRATCHED" ? "#ef4444"
    : confidenceLabel === "HIGH" ? "#22c55e"
    : confidenceLabel === "MOD" ? "#fbbf24"
    : confidenceLabel === "MILD" ? "#94a3b8"
    : "#fbbf24";
  const bestOverOdds = allActiveBooks
    .map((bk) => books[bk]?.overOdds)
    .filter(Boolean)
    .sort((a, b) => parseInt(b, 10) - parseInt(a, 10))[0] ?? null;
  const propMarket = PROP_MARKET_MAP[mKey] ?? null;
  const propPlayerId = p.playerId ? String(p.playerId) : p.player;
  const propBookLine = p.books?.DK?.line ?? p.books?.FD?.line ?? null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  const propPickId = `${currentUser?.userId ?? currentUser?.username}:${propPlayerId}:${propMarket}:${today}`;
  const isPropLogged = !!propMarket && loggedPickIds.has(propPickId);
  const propGameLabel = selectedGame
    ? `${selectedGame.away?.abbr ?? selectedGame.away?.name ?? "?"} @ ${selectedGame.home?.abbr ?? selectedGame.home?.name ?? "?"}`
    : "";
  const longPressHandlers = useLongPress(() => {
    if (!propMarket || !currentUser) return;
    if (slateDate && slateDate < today) return;
    openAddPickSheet({
      playerId: propPlayerId,
      playerName: p.player,
      gameLabel: propGameLabel,
      market: propMarket,
      side: "over",
      bookLine: propBookLine != null && Number.isFinite(Number(propBookLine)) ? Number(propBookLine) : null,
      source: "props",
    });
  });
  const fmtO = (s) => s ?? "—";

  return (
    <div key={i}>
      <div
        onClick={() => setExpandedPropRow(isExpanded ? null : rowKey)}
        {...longPressHandlers}
        style={{ display: "grid", gridTemplateColumns: `1fr ${activeBooks.map(() => "52px").join(" ")}`, gap: 0, padding: "7px 10px", cursor: "pointer", background: isExpanded ? "rgba(255,255,255,0.03)" : "transparent", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "center" }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.player}</span>
            {isPropLogged && (
              <span style={{ fontSize: 8, fontWeight: 800, color: "#3b82f6", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.35)", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>
                ✓
              </span>
            )}
            {scratchedRow && (
              <span style={{ fontSize: 7, fontWeight: 800, color: "#fca5a5", background: "rgba(239,68,68,0.16)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 3, padding: "1px 4px", flexShrink: 0 }}>
                SCRATCHED
              </span>
            )}
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

        {activeBooks.map((bk) => {
          const b = books[bk];
          const isLow = hasDiscrepancy && b?.line === lowestLine;
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

      {isExpanded && (
        <div style={{ background: "#0a0b12", borderTop: "1px solid #1a1f2e", padding: "10px" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${activeBooks.length}, 1fr)`, gap: 6, marginBottom: 10 }}>
            {activeBooks.map((bk) => {
              const b = books[bk];
              const isLow = hasDiscrepancy && b?.line === lowestLine;
              const bkColor = BOOK_COLORS[bk];
              return (
                <div key={bk} style={{ background: isLow ? `${bkColor}15` : "#161827", border: `1px solid ${isLow ? `${bkColor}55` : "#1f2437"}`, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: bkColor, marginBottom: 4 }}>{bk}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: isLow ? bkColor : "#f9fafb", fontFamily: "monospace", lineHeight: 1, marginBottom: 4 }}>{b?.line ?? "—"}</div>
                  <div style={{ fontSize: 9, fontFamily: "monospace" }}>
                    <span style={{ color: "#22c55e" }}>{fmtO(b?.overOdds)}</span>
                    <span style={{ color: "#374151" }}> / </span>
                    <span style={{ color: "#ef4444" }}>{fmtO(b?.underOdds)}</span>
                  </div>
                  {isLow && <div style={{ fontSize: 7, color: bkColor, marginTop: 3, fontWeight: 700 }}>BEST LINE</div>}
                </div>
              );
            })}
          </div>

          {hasEdge && (
            <div style={{ background: `${confidenceColor}0d`, border: `1px solid ${confidenceColor}33`, borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: confidenceColor, letterSpacing: "0.06em" }}>LINE INTELLIGENCE</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: confidenceColor, background: `${confidenceColor}22`, border: `1px solid ${confidenceColor}55`, borderRadius: 3, padding: "1px 5px" }}>{confidenceLabel} {confidencePct}%</span>
              </div>
              <div style={{ fontSize: 9, color: "#9ca3af", lineHeight: 1.5 }}>
                <span style={{ color: "#38bdf8", fontWeight: 700 }}>Sharp books</span>
                <span> (DK/FD) have this at </span>
                <span style={{ color: "#f9fafb", fontWeight: 700 }}>{sharpAvg.toFixed(1)}</span>
                <span>, while </span>
                <span style={{ color: "#a78bfa", fontWeight: 700 }}>square books</span>
                <span> (CZR/MGM) are at </span>
                <span style={{ color: "#f9fafb", fontWeight: 700 }}>{squareAvg.toFixed(1)}</span>.
                {lineGap >= 0.5 && (
                  <span style={{ display: "block", marginTop: 3, color: confidenceColor }}>
                    Lower sharp-book line suggests the OVER is being priced more aggressively by sharper markets.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
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
const SlateCard = ({ game, selected, onSelect, liveOddsMap = {}, bestBet = null, liveScore = null, injuredIds = new Set(), preferredBook = "DK" }) => {
  const topProp = bestBet ?? (game.props[0]?.lean ? game.props[0] : null);
  const awaySpLast = game.awayPitcher?.name?.split(" ").slice(-1)[0] ?? null;
  const homeSpLast = game.pitcher?.name?.split(" ").slice(-1)[0] ?? null;
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
  const lineMove      = liveOdds?.totalMoveDir === "up" ? "over"
                     : liveOdds?.totalMoveDir === "down" ? "under"
                     : game.odds.lineMove ?? "none";
  const gameStatus    = game.status ?? "Scheduled";
  const isFinal       = gameStatus === "Final" || gameStatus === "Game Over";
  // liveScore.inning is a number while a game is active; use as fallback when
  // schedule cache is stale (can lag up to 1h). Guard with !isFinal to avoid
  // showing LIVE on games the schedule already confirmed are finished.
  const liveScoreIsLive = !isFinal && liveScore && typeof liveScore.inning === "number";
  const isInProgress  = gameStatus === "In Progress" || gameStatus === "Warmup" || liveScoreIsLive;
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
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{formatLocalTime(game.gameTime) ?? game.time} · {game.stadium}</div>
          {(awaySpLast || homeSpLast) && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
              <span style={{ fontSize: 8, color: "#4b5563", fontFamily: "monospace", letterSpacing: "0.05em" }}>SP</span>
              {awaySpLast && (
                <span style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace" }}>
                  {game.away.abbr} {awaySpLast}
                </span>
              )}
              {awaySpLast && homeSpLast && <span style={{ fontSize: 8, color: "#374151" }}>vs</span>}
              {homeSpLast && (
                <span style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace" }}>
                  {game.home.abbr} {homeSpLast}
                </span>
              )}
            </div>
          )}
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
                <span style={{ fontSize: 7, fontWeight: 800, color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace", letterSpacing: "0.04em" }}>{preferredBook}</span>
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
        {(() => {
          const wx = game.weather ?? {};
          const wxLabel = wx.roof ? "DOME" : wx.temp != null && wx.temp !== "" ? `${wx.temp}°` : null;
          return wxLabel ? <LeanBadge label={wxLabel} positive={!!wx.hrFavorable} small /> : null;
        })()}
        {game.nrfi?.lean === "NRFI" && (game.nrfi?.confidence ?? 0) >= 62 && <LeanBadge label="NRFI" positive={true} small />}
        {lineMove === "over"  && <LeanBadge label="↑ OVER"  positive={true}  small />}
        {lineMove === "under" && <LeanBadge label="↓ UNDER" positive={false} small />}
        {(injuredIds.has(String(game.pitcher?.id)) || injuredIds.has(String(game.awayPitcher?.id))) && (
          <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 999, padding: "2px 7px", letterSpacing: "0.06em" }}>
            ⚠ SP IL
          </span>
        )}
        {topProp?.lean && (() => {
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
function computeTopSlatePicks(liveSlate, livePitcherStats, liveLineups, liveWeather, playerPropsMap = {}) {
  const picks = [];

  liveSlate.forEach(sg => {
    const sgGameLabel = `${sg.away?.abbr ?? "?"} @ ${sg.home?.abbr ?? "?"}`;
    const sgLu        = liveLineups[sg.gamePk];
    const sgConfirmed  = sgLu?.confirmed ?? false;
    const sgHasLineup  = sgConfirmed || sgLu?.source === "roster";
    const sgWx         = liveWeather[sg.gamePk];
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

      // ── DraftKings line lookup for this pitcher ────────────────────────────────
      const gamePropsState = playerPropsMap[String(sg.gamePk)];
      const gameProps = (gamePropsState && gamePropsState !== "loading" && Array.isArray(gamePropsState.props))
        ? gamePropsState.props
        : [];
      const findDKLine = (market) => {
        const prop = gameProps.find(p =>
          p.market === market &&
          (p.player ?? "").toLowerCase().includes(lastName.toLowerCase())
        );
        return prop?.books?.DK?.line ?? null;
      };

      // ── Lineup platoon adjustment ──────────────────────────────────────────
      let lineupAdj    = 0;
      let lineupSignal = null;
      if (sgHasLineup && opposingBatters.length >= 7) {
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
      if      (avgIP >= 6.0) { kScore += 6; kSigs.push(`Avg IP ${avgIP.toFixed(1)} (deep outings, more K opportunities)`); }
      else if (avgIP >= 5.5) { kScore += 3; kSigs.push(`Avg IP ${avgIP.toFixed(1)} (consistent depth)`); }
      else if (avgIP < 4.5)  { kScore -= 6; kSigs.push(`Avg IP ${avgIP.toFixed(1)} (short outings, fewer Ks)`); }
      else if (avgIP < 5.0)  { kScore -= 3; kSigs.push(`Avg IP ${avgIP.toFixed(1)} (below average depth)`); }

      kScore = Math.max(38, Math.min(88, kScore));
      const dkKLine = findDKLine("pitcher_strikeouts");
      if (dkKLine != null) {
        const projectedK = avgK;
        const kLean = projectedK > dkKLine ? "OVER" : "UNDER";
        picks.push({
          label:           `${lastName} K O/U ${dkKLine}`,
          fullName,
          pitcherId:       pitcher.id,
          lean:            kLean,
          positive:        kLean === "OVER",
          confidence:      kScore,
          tier:            MODEL_TIER(kScore),
          propType:        "K",
          market:          "pitcher_strikeouts",
          modelLine:       dkKLine,
          projectedValue:  +projectedK.toFixed(1),
          lineSource:      "DK",
          gamePk:          sg.gamePk,
          game:            sgGameLabel,
          lineupConfirmed: sgConfirmed,
          signals:         kSigs,
          avgIP,
        });
      }

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
      if      (avgIP >= 6.0) { oScore += 8; oSigs.push(`Avg IP ${avgIP.toFixed(1)} (consistently works deep)`); }
      else if (avgIP >= 5.5) { oScore += 4; oSigs.push(`Avg IP ${avgIP.toFixed(1)} (deep outings)`); }
      else if (avgIP < 4.5)  { oScore -= 8; oSigs.push(`Avg IP ${avgIP.toFixed(1)} (short outing risk)`); }
      else if (avgIP < 5.0)  { oScore -= 4; oSigs.push(`Avg IP ${avgIP.toFixed(1)} (below average depth)`); }

      oScore = Math.max(38, Math.min(88, oScore));
      const dkOutsLine = findDKLine("pitcher_outs");
      if (dkOutsLine != null) {
        const projectedOuts = +(avgIP * 3).toFixed(1);
        const outsLean = projectedOuts > dkOutsLine ? "OVER" : "UNDER";
        picks.push({
          label:           `${lastName} Outs O/U ${dkOutsLine}`,
          fullName,
          pitcherId:       pitcher.id,
          lean:            outsLean,
          positive:        outsLean === "OVER",
          confidence:      oScore,
          tier:            MODEL_TIER(oScore),
          propType:        "Outs",
          market:          "pitcher_outs",
          modelLine:       dkOutsLine,
          projectedValue:  projectedOuts,
          lineSource:      "DK",
          gamePk:          sg.gamePk,
          game:            sgGameLabel,
          lineupConfirmed: sgConfirmed,
          signals:         oSigs,
          avgIP,
        });
      }
    });
  });

  // Sort by confidence, filter to positive-lean only, cap at 10 for readability
  return picks
    .filter(p => p.positive)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

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

      const swStr = pitcher.pitcherStats?.swStrPct ?? null;
      if (swStr !== null) {
        if      (swStr >= 14) { score += 5; projK += 0.4; kR.push(`SwStr% ${swStr}% (elite)`); }
        else if (swStr >= 12) { score += 3; projK += 0.2; kR.push(`SwStr% ${swStr}% (above avg)`); }
        else if (swStr <= 8)  { score -= 3; projK -= 0.2; kR.push(`SwStr% ${swStr}% (below avg)`); }
      }

      const oSwing = pitcher.pitcherStats?.oSwingPct ?? null;
      if (oSwing !== null) {
        if      (oSwing >= 33) { score += 3; projK += 0.2; kR.push(`Chase rate ${oSwing}% (high)`); }
        else if (oSwing <= 26) { score -= 2; kR.push(`Chase rate ${oSwing}% (low)`); }
      }

      const fStrike = pitcher.pitcherStats?.fStrikePct ?? null;
      if (fStrike !== null) {
        if      (fStrike >= 65) { score += 2; kR.push(`F-Strike% ${fStrike}% (elite command)`); }
        else if (fStrike <= 57) { score -= 2; kR.push(`F-Strike% ${fStrike}% (poor command)`); }
      }

      const barrelPct = pitcher.pitcherStats?.barrelPct ?? null;
      if (barrelPct !== null) {
        if      (barrelPct <= 5)  { score += 3; kR.push(`Barrel% ${barrelPct}% (elite suppression)`); }
        else if (barrelPct <= 7)  { score += 1; kR.push(`Barrel% ${barrelPct}% (above avg)`); }
        else if (barrelPct >= 12) { score -= 3; kR.push(`Barrel% ${barrelPct}% (high contact risk)`); }
        else if (barrelPct >= 10) { score -= 1; kR.push(`Barrel% ${barrelPct}% (elevated)`); }
      }

      const hardHitPct = pitcher.pitcherStats?.hardHitPct ?? null;
      if (hardHitPct !== null) {
        if      (hardHitPct <= 32) { score += 2; kR.push(`HH% ${hardHitPct}% (elite)`); }
        else if (hardHitPct >= 42) { score -= 2; kR.push(`HH% ${hardHitPct}% (elevated)`); }
      }

      const xwOBA = pitcher.pitcherStats?.xwOBAAllowed ?? null;
      if (xwOBA !== null) {
        if      (xwOBA <= 0.270) { score += 5; kR.push(`xwOBA ${xwOBA} (elite contact suppression)`); }
        else if (xwOBA <= 0.290) { score += 3; kR.push(`xwOBA ${xwOBA} (above avg)`); }
        else if (xwOBA <= 0.310) { score += 1; kR.push(`xwOBA ${xwOBA} (solid)`); }
        else if (xwOBA >= 0.350) { score -= 4; kR.push(`xwOBA ${xwOBA} (poor contact suppression)`); }
        else if (xwOBA >= 0.330) { score -= 2; kR.push(`xwOBA ${xwOBA} (below avg)`); }
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

function fallbackAiScore(c) {
  return Math.round((c.score ?? 50) * 0.6 + (c.simConfidence ?? 50) * 0.4);
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
      return { userId: payload.userId, username: payload.username, email: payload.email ?? null };
    } catch { return null; }
  });
  const [loginUser,    setLoginUser]    = useState("");
  const [loginPass,    setLoginPass]    = useState("");
  const [loginError,   setLoginError]   = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const SCOUT_ALLOWLIST = ["leadoffkaiba"];
  const scoutIdentity = (currentUser?.username ?? currentUser?.email ?? "").toLowerCase();
  const isScoutUser = !!currentUser && SCOUT_ALLOWLIST.includes(scoutIdentity);
  const CHAT_ALLOWLIST = ["leadoffkaiba"];
  const isChatUser = !!currentUser && CHAT_ALLOWLIST.includes((currentUser?.username ?? currentUser?.email ?? "").toLowerCase());
  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  }, []);

  const [preferredBook,    setPreferredBook]    = useState("DK"); // "DK"|"FD"|"CZR"|"MGM"|"BOV" — DK is app default
  const [propsBookFilter,  setPropsBookFilter]  = useState("DK");
  const [prefSaving,       setPrefSaving]       = useState(false);
  const [prefSaveMsg,      setPrefSaveMsg]      = useState("");

  const [selectedId, setSelectedId] = useState(1);
  const [view, setView] = useState("slate"); // "slate" | "game" | "model" | "board" | "scout" | "chat" | "settings"
  const [showHelp, setShowHelp] = useState(false);
  const [whyModal, setWhyModal] = useState(null); // { c, type: boardTab, rank }
  const [addPickSheet, setAddPickSheet] = useState(null);
  const [addPickOdds, setAddPickOdds] = useState("");
  const [addPickUnits, setAddPickUnits] = useState("1");
  const [loggedPickIds, setLoggedPickIds] = useState(new Set());
  const [toastMsg, setToastMsg] = useState(null);
  const [picksViewData, setPicksViewData] = useState(null);
  const [picksViewStats, setPicksViewStats] = useState(null);
  const [picksViewLoading, setPicksViewLoading] = useState(false);
  const [picksViewDays, setPicksViewDays] = useState(0);
  const [picksShowLegacy,      setPicksShowLegacy]      = useState(false);
  const [collapsedPickDates,   setCollapsedPickDates]   = useState(new Set()); // user manually closed
  const [expandedPickDates,    setExpandedPickDates]    = useState(new Set()); // user reopened auto-archived
  const [collapsedMarkets, setCollapsedMarkets] = useState({
    pitcher_strikeouts: true,
    batter_home_runs: true,
    batter_total_bases: true,
    batter_hits: true,
  });
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [chatMessagesLeft, setChatMessagesLeft] = useState(30);
  const [labSubTab, setLabSubTab] = useState("f5ml");
  const [modelsSubTab, setModelsSubTab] = useState("f5ml");
  const [labData, setLabData] = useState(null);
  const [labLoading, setLabLoading] = useState(false);
  const [labFgData, setLabFgData] = useState(null);
  const [labFgLoading, setLabFgLoading] = useState(false);
  const [labKData, setLabKData] = useState(null);
  const [labKLoading, setLabKLoading] = useState(false);
  const [labTotalsData, setLabTotalsData] = useState(null);
  const [labTotalsLoading, setLabTotalsLoading] = useState(false);
  const [labCalibration, setLabCalibration] = useState(null);
  const [labCalibrationLoading, setLabCalibrationLoading] = useState(false);
  const [aiBoardData, setAiBoardData] = useState(null);
  const [lockedAiBoardSnapshot, setLockedAiBoardSnapshot] = useState(() => {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
      const stored = JSON.parse(localStorage.getItem("ai_board_snapshot") || "{}");
      return stored.date === today ? (stored.data ?? null) : null;
    } catch { return null; }
  });
  const [aiBoardLoading, setAiBoardLoading] = useState(false);
  const [aiBoardEdgesMeta, setAiBoardEdgesMeta] = useState({ fallback: false, generatedAt: null });
  const [boardDailySnapshot, setBoardDailySnapshot] = useState(null);
  const [boardSnapshotLoading, setBoardSnapshotLoading] = useState(false);
  const [boardSnapshotRefreshing, setBoardSnapshotRefreshing] = useState(false);

  const boardSnapshotCoversToday = useCallback(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    return !!(boardDailySnapshot?.date === today && boardDailySnapshot?.empty !== true);
  }, [boardDailySnapshot]);

  /** Snapshot rows for a market (may be []). Null only when no shared snapshot for today. */
  const getBoardMarketSnapshot = useCallback((market) => {
    if (!boardSnapshotCoversToday()) return null;
    if (!Object.prototype.hasOwnProperty.call(boardDailySnapshot ?? {}, market)) return null;
    const snapshotCards = boardDailySnapshot[market];
    return Array.isArray(snapshotCards) ? snapshotCards : [];
  }, [boardDailySnapshot, boardSnapshotCoversToday]);

  /** Mirrors backend BOARD_MARKETS (boardSnapshotDb.js) — used only to detect stale-empty markets. */
  const BOARD_SNAPSHOT_MARKETS = ["k", "outs", "hits", "hr", "nrfi", "total", "spread", "ml", "f5ml", "f5spread"];

  /** True if `snapshot` covers today but at least one market is still an empty array. */
  const boardSnapshotHasEmptyMarket = useCallback((snapshot) => {
    if (!snapshot || snapshot.empty === true) return false;
    return BOARD_SNAPSHOT_MARKETS.some(
      (market) => Array.isArray(snapshot[market]) && snapshot[market].length === 0
    );
  }, []);

  /** Manual "force refresh" — bypasses both the response cache and the negative cache (CODEX TASK 145). */
  const refreshBoardSnapshot = useCallback(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    setBoardSnapshotRefreshing(true);
    apiFetch(`/api/board/snapshot?date=${today}&refresh=1`)
      .then(data => {
        if (data && !data.empty) setBoardDailySnapshot({ ...data, date: today });
      })
      .catch(() => {})
      .finally(() => setBoardSnapshotRefreshing(false));
  }, []);

  const [aiBoardTab, setAiBoardTab] = useState("all");
  const [showLabTrackRecord, setShowLabTrackRecord] = useState(true);
  const [tab, setTab] = useState("overview");
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [liveWeather, setLiveWeather] = useState({});
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [liveOddsMap, setLiveOddsMap] = useState({});
  const [lockedOddsMap, setLockedOddsMap] = useState(() => {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
      const stored = JSON.parse(localStorage.getItem("locked_odds_snapshot") || "{}");
      return stored.date === today ? (stored.data ?? {}) : {};
    } catch { return {}; }
  });
  const [livePredMarkets, setLivePredMarkets] = useState(null);
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
  const [scheduleError, setScheduleError] = useState(null);
  const [slateLoading, setSlateLoading] = useState(false);
  const [researchMode, setResearchMode]   = useState(false);
  const [logoClicks,   setLogoClicks]     = useState(0);
  const [slateDate,    setSlateDate]      = useState(null); // null = today
  const [historicalSnapshot, setHistoricalSnapshot] = useState(null);
  const [historicalSnapshotLoading, setHistoricalSnapshotLoading] = useState(false);
  const [perfStats,    setPerfStats]      = useState(null);
  const [perfDays,     setPerfDays]       = useState(30);
  const [scoutGoal, setScoutGoal] = useState(50);
  const [scoutUnit, setScoutUnit] = useState(25);
  const [scoutSlate, setScoutSlate] = useState(null);
  const [scoutSlateLoading, setScoutSlateLoading] = useState(false);
  const [scoutSlateError, setScoutSlateError] = useState(null);
  const [liveLineups, setLiveLineups] = useState({});
  const [liveUmpires, setLiveUmpires] = useState({});
  const [livePitcherStats, setLivePitcherStats] = useState({});
  const [liveGameLog, setLiveGameLog] = useState({});
  const [liveTeamStats, setLiveTeamStats] = useState({});
  // Baseball Savant data — keyed by MLB player ID
  const [pitcherArsenal, setPitcherArsenal] = useState({}); // pitcherId → { arsenal, pitcherStats, ... }
  const [batterSplits, setBatterSplits] = useState({});     // batterId  → splits object
  const [liveHittingLog, setLiveHittingLog] = useState({});
  const [liveH2H, setLiveH2H] = useState({});               // `${batterId}_${pitcherId}` → h2h object
  const [liveRbiCtx, setLiveRbiCtx] = useState({});        // batterId → { rbiPerGame, rbiRate, slg, extraBaseHits }
  const [liveBullpen,  setLiveBullpen]  = useState({});     // gamePk    → { away, home } bullpen object
  const [liveNrfiData, setLiveNrfiData] = useState({});     // gamePk    → { awayFirst, homeFirst, lean, confidence }
  const [liveScores,   setLiveScores]   = useState({});     // gamePk    → { inning, halfInning, awayScore, homeScore, outs }
  const liveScoresRef = useRef({});                          // always-current mirror, avoids dep-array re-fires
  const gradingPickIdsRef  = useRef(new Set());
  const backfillRanRef     = useRef(false);       // run historical backfill once per session
  const [liveInjuries, setLiveInjuries] = useState([]);
  const [gameNotes,    setGameNotes]    = useState({});     // gamePk → note string
  const [liveTrends,   setLiveTrends]   = useState({});     // gamePk → summary string | "loading" | null
  const [liveAiProps,  setLiveAiProps]  = useState({});     // gamePk → { props: [] } | "loading" | null
  const [aiCardSummaries, setAiCardSummaries] = useState({}); // summaryKey -> sentence
  const trendsFetched  = useRef(new Set());                  // tracks gamePks already fetched (avoids stale-closure re-fetch)
  const aiPropsFetched = useRef(new Set());                  // prevents repeat fetches per gamePk
  const aiSummaryInFlight = useRef(new Set());               // summaryKey values currently fetching
  const aiBoardPayloadSig = useRef("");
  const [livePlayerProps, setLivePlayerProps] = useState({}); // gamePk → { props: [] } | "loading" | null
  const [dailyCard,      setDailyCard]      = useState(null);  // null | "loading" | { card, date, gamesAnalyzed, cap, ... }
  const [dailyCardOpen,  setDailyCardOpen]  = useState(false); // controls panel visibility
  const playerPropsFetched = useRef(new Set());               // guards sportsbook lines fetch
  const gameDetailFetched = useRef(new Set());                // prevents repeat unified game-detail fetches
  const [pitcherPlatoonSplits, setPitcherPlatoonSplits] = useState({}); // pitcherId → {vsL,vsR} | "loading" | null
  const [liveStatSplits,       setLiveStatSplits]       = useState({}); // `${id}:${group}` → splits obj | "loading" | null
  const [boardTab,             setBoardTab]             = useState("hr"); // "hr" | "hits" | "k" | "outs" | "games"
  const [boardTop20,           setBoardTop20]           = useState(false);
  const [lockedBoardCandidates, setLockedBoardCandidates] = useState(() => {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
      const stored = JSON.parse(localStorage.getItem("board_locked_snapshot") || "{}");
      return stored.date === today ? (stored.candidates ?? {}) : {};
    } catch { return {}; }
  });
  const [lockedGameBoardCandidates, setLockedGameBoardCandidates] = useState(() => {
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
      const stored = JSON.parse(localStorage.getItem("game_board_locked_snapshot") || "{}");
      return stored.date === today ? (stored.candidates ?? {}) : {};
    } catch { return {}; }
  });
  const [gameSubTab,           setGameSubTab]           = useState("nrfi"); // "nrfi" | "total" | "spread" | "ml" | "f5ml" | "f5spread"
  const boardPropsFetched = useRef(new Set());                            // guards board-level props pre-fetch
  const [noteSaveState, setNoteSaveState] = useState(null); // null | "saving" | "saved"
  const [copiedPickId, setCopiedPickId] = useState(null);   // id of pick just copied to clipboard
  const [parlayLabels, setParlayLabels] = useState([]);      // labels of props selected for parlay (max 3)
  const [parlaySlipCopied, setParlaySlipCopied] = useState(false);
  const [liveBoxscores, setLiveBoxscores] = useState({});    // gamePk → boxscore object | null
  const [boxSide,       setBoxSide]       = useState("away");// batting + pitching toggle: "away" | "home"
  const boxscoreFetched = useRef(new Set());                  // gamePks whose final boxscore is cached
  const [liveBoardResults, setLiveBoardResults] = useState({}); // playerId → { h, hr, ab, live }
  const boardBoxFetched = useRef(new Set());                  // gamePks already fetched for Board results
  const chatBottomRef = useRef(null);
  const labCalibrationRecorded = useRef(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const labCalibrationResolved = useRef(new Set());
  const effectiveOddsMap = useMemo(() => {
    if (!liveSlate?.length) return liveOddsMap;
    const map = { ...liveOddsMap };
    liveSlate.forEach(game => {
      if (!lockedOddsMap[game.gamePk]) return;
      const key = `${game.away.name}|${game.home.name}`;
      map[key] = lockedOddsMap[game.gamePk];
    });
    return map;
  }, [liveOddsMap, lockedOddsMap, liveSlate]);

  // Blended pitcher stats for game board — 45% season ERA / 55% recent 3-start ERA.
  // Prevents a starter with a great season ERA but poor recent form from being over-ranked.
  // Falls back to season-only when fewer than 2 recent starts are available.
  const blendedPitcherStatsForGameBoard = useMemo(() => {
    if (!livePitcherStats) return livePitcherStats ?? {};
    const result = {};
    Object.entries(livePitcherStats).forEach(([id, stats]) => {
      const gamelog = liveGameLog?.[id];
      const last3   = (gamelog?.games ?? []).slice(0, 3);
      if (last3.length < 2) { result[id] = stats; return; }
      let totalOuts = 0; let totalER = 0;
      last3.forEach(g => {
        const [w, f = "0"] = String(g.ip ?? "0").split(".");
        totalOuts += parseInt(w) * 3 + parseInt(f);
        totalER   += (g.er ?? 0);
      });
      const recentEra  = totalOuts > 0 ? (totalER * 27) / totalOuts : null;
      const seasonEra  = parseFloat(stats.era) || null;
      if (recentEra === null || seasonEra === null) { result[id] = stats; return; }
      const blendedEra = (seasonEra * 0.45 + recentEra * 0.55);
      result[id] = {
        ...stats,
        era:        blendedEra.toFixed(2),
        _seasonEra: seasonEra.toFixed(2),
        _recentEra: recentEra.toFixed(2),
      };
    });
    return result;
  }, [livePitcherStats, liveGameLog]);

  useEffect(() => {
    if (!currentUser?.userId) {
      setLoggedPickIds(new Set());
      return;
    }
    apiFetch("/api/picks")
      .then((data) => {
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
        const todayIds = new Set(
          (data?.picks ?? [])
            .filter((p) => p.slateDate === today)
            .map((p) => p.id)
        );
        setLoggedPickIds(todayIds);
      })
      .catch(() => {});
  }, [currentUser]);

  const openAddPickSheet = useCallback((payload) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    if (!currentUser || (slateDate && slateDate < today)) return;
    const pickId = `${currentUser?.userId ?? currentUser?.username}:${payload.playerId}:${payload.market}:${today}`;
    if (loggedPickIds.has(pickId)) {
      showToast("Already in your log");
      return;
    }
    setAddPickOdds("");
    setAddPickUnits("1");
    setAddPickSheet({ ...payload, slateDate: today });
  }, [currentUser, slateDate, loggedPickIds, showToast]);

  const submitAddPick = useCallback(async () => {
    if (!addPickSheet || !currentUser?.userId) return;

    const oddsVal = addPickOdds.trim() !== "" ? parseInt(addPickOdds.trim(), 10) : null;
    const unitsVal = addPickUnits.trim() !== "" ? parseFloat(addPickUnits.trim()) : 1.0;

    if (oddsVal !== null && !Number.isFinite(oddsVal)) {
      showToast("Invalid odds — use e.g. -125 or +110");
      return;
    }
    if (!Number.isFinite(unitsVal) || unitsVal <= 0) {
      showToast("Invalid units");
      return;
    }

    try {
      const res = await apiMutate("/api/picks", "POST", {
        playerId: addPickSheet.playerId,
        playerName: addPickSheet.playerName,
        gameLabel: addPickSheet.gameLabel,
        market: addPickSheet.market,
        side: addPickSheet.side,
        bookLine: addPickSheet.bookLine,
        odds: oddsVal,
        units: unitsVal,
        slateDate: addPickSheet.slateDate,
        source: addPickSheet.source ?? "board",
      });

      if (res?.error === "already_logged") {
        showToast("Already in your log");
      } else if (res?.ok) {
        setLoggedPickIds((prev) => new Set([...prev, res.id]));
        showToast("Pick logged ✓");
      }
    } catch (err) {
      if ((err?.message ?? "").includes("already_logged")) showToast("Already in your log");
      else showToast("Could not save pick — try again");
    } finally {
      setAddPickSheet(null);
    }
  }, [addPickSheet, addPickOdds, addPickUnits, currentUser, showToast]);

  useEffect(() => {
    if (view !== "picks" || !currentUser) return;
    setPicksViewLoading(true);

    Promise.all([
      apiFetch(`/api/picks?days=${picksViewDays}`),
      apiFetch(`/api/picks/stats?days=${picksViewDays}`),
    ])
      .then(([picksRes, statsRes]) => {
        setPicksViewData(picksRes ?? { picks: [] });
        setPicksViewStats(statsRes ?? null);
      })
      .catch(() => {
        setPicksViewData({ picks: [] });
        setPicksViewStats(null);
      })
      .finally(() => setPicksViewLoading(false));
  }, [view, currentUser, picksViewDays]);

  // Pre-fetch player props for today's pending prop picks so the live-line lookup works in the Picks tab
  useEffect(() => {
    if (!picksViewData?.picks?.length || !liveSlate?.length) return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const pendingPropPicks = picksViewData.picks.filter(p =>
      !p.voided &&
      p.resultHit === null &&
      p.gradeStatus == null &&
      p.slateDate === today &&
      PROP_MARKETS_SET.has((p.market ?? "").toLowerCase()) &&
      p.bookLine == null &&
      p.gameLabel
    );
    const gamePksToFetch = new Set();
    pendingPropPicks.forEach(pick => {
      const g = liveSlate.find(g => `${g.away?.abbr ?? ""} @ ${g.home?.abbr ?? ""}` === pick.gameLabel);
      if (g?.gamePk && !livePlayerProps[String(g.gamePk)]) gamePksToFetch.add(String(g.gamePk));
    });
    gamePksToFetch.forEach(gamePk => {
      const game = liveSlate.find(g => String(g.gamePk) === gamePk);
      if (!game) return;
      fetchPlayerPropsDirect(game.away?.name ?? "", game.home?.name ?? "", gamePk)
        .then(data => setLivePlayerProps(prev => ({ ...prev, [gamePk]: data })))
        .catch(() => {});
    });
  }, [picksViewData, liveSlate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentUser || !(picksViewData?.picks?.length > 0)) return;

    const ungradedPicks = picksViewData.picks.filter((p) => (
      !p.voided &&
      p.resultHit === null &&
      p.gradeStatus == null &&
      !gradingPickIdsRef.current.has(p.id)
    ));
    if (ungradedPicks.length === 0) return;

    ungradedPicks.forEach((pick) => {
      const grade = gradePickLocally(pick, { liveBoxscores, liveScores, liveSlate });
      if (!grade) return;

      gradingPickIdsRef.current.add(pick.id);
      setPicksViewData((prev) => {
        if (!prev?.picks) return prev;
        return {
          ...prev,
          picks: prev.picks.map((row) => (
            row.id === pick.id
              ? {
                  ...row,
                  resultHit: grade.resultHit,
                  actualStat: grade.actualStat,
                  gradeStatus: grade.gradeStatus,
                  pnl: grade.resultHit !== null ? calcPickPnl(grade.resultHit, row.odds, row.units) : null,
                }
              : row
          )),
        };
      });

      apiFetch(`/api/picks/${encodeURIComponent(pick.id)}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultHit: grade.resultHit,
          actualStat: grade.actualStat,
          gradeStatus: grade.gradeStatus,
        }),
      })
        .then(() => apiFetch(`/api/picks/stats?days=${picksViewDays}`))
        .then((stats) => setPicksViewStats(stats))
        .catch(() => {})
        .finally(() => {
          gradingPickIdsRef.current.delete(pick.id);
        });
    });
  }, [picksViewData, liveBoxscores, liveScores, liveSlate, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // One-time historical backfill: grade past picks whose boxscores aren't in liveBoxscores.
  // Runs once per session when picks first load. For each ungraded historical pick:
  //   - Game picks (ml/spread/total/nrfi/f5ml/f5spread): gamePk = playerId
  //   - Prop picks (k/outs/hr/hits): fetch historical schedule to resolve gamePk
  // Builds a synthetic liveSlate entry from game_label ("SEA @ DET") so gradePickLocally works.
  useEffect(() => {
    if (!currentUser || !picksViewData?.picks?.length || backfillRanRef.current) return;

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const historicalUngraded = picksViewData.picks.filter(p =>
      !p.voided &&
      p.resultHit === null &&
      p.gradeStatus == null &&
      p.slateDate &&
      p.slateDate < today &&
      !gradingPickIdsRef.current.has(p.id)
    );
    if (!historicalUngraded.length) return;

    backfillRanRef.current = true;

    (async () => {
      // For prop picks we need gamePk from the historical schedule.
      // Key: "YYYY-MM-DD:AWAY @ HOME" → gamePk
      const gameLabelIndex = {};
      const propPicks = historicalUngraded.filter(p => PROP_MARKETS_SET.has(p.market));
      const uniquePropDates = [...new Set(propPicks.map(p => p.slateDate))];
      for (const date of uniquePropDates) {
        try {
          const schedGames = await apiFetch(`/api/schedule?date=${date}`);
          if (Array.isArray(schedGames)) {
            schedGames.forEach(g => {
              const label = `${g.away?.abbr ?? ""} @ ${g.home?.abbr ?? ""}`;
              gameLabelIndex[`${date}:${label}`] = g.gamePk;
            });
          }
        } catch (_) {}
      }

      // Collect all gamePks we need boxscores for
      const gamePkSet = new Set();
      historicalUngraded.forEach(p => {
        if (GAME_MARKETS_SET.has(p.market) && p.playerId) {
          gamePkSet.add(String(p.playerId));
        } else if (PROP_MARKETS_SET.has(p.market) && p.gameLabel && p.slateDate) {
          const gp = gameLabelIndex[`${p.slateDate}:${p.gameLabel}`];
          if (gp) gamePkSet.add(String(gp));
        }
      });

      // Fetch missing boxscores (skip any already in liveBoxscores)
      const extraBoxscores = {};
      for (const gamePk of gamePkSet) {
        if (liveBoxscores[gamePk]) continue; // already loaded
        try {
          const box = await apiFetch(`/api/boxscore/${gamePk}`);
          if (box?.batting) extraBoxscores[gamePk] = box;
        } catch (_) {}
      }

      const allBoxscores = { ...liveBoxscores, ...extraBoxscores };

      // Grade and persist each historical pick
      historicalUngraded.forEach(pick => {
        // Resolve gamePk
        let gamePk;
        if (GAME_MARKETS_SET.has(pick.market)) {
          gamePk = String(pick.playerId ?? "");
        } else {
          const gp = gameLabelIndex[`${pick.slateDate}:${pick.gameLabel}`];
          gamePk = gp ? String(gp) : null;
        }
        if (!gamePk || !allBoxscores[gamePk]) return;

        // Build a synthetic liveSlate entry so gradePickLocally can resolve teams and status.
        // Parse away/home abbrs from the stored "AWAY @ HOME" game_label.
        const [awayAbbr = "", homeAbbr = ""] = (pick.gameLabel ?? "").split(" @ ");
        const syntheticSlate = [{
          gamePk: Number(gamePk),
          status: "Final",
          away: { abbr: awayAbbr.trim() },
          home: { abbr: homeAbbr.trim() },
        }];

        if (gradingPickIdsRef.current.has(pick.id)) return;
        gradingPickIdsRef.current.add(pick.id);

        const grade = gradePickLocally(pick, {
          liveBoxscores: allBoxscores,
          liveScores: {},
          liveSlate: syntheticSlate,
        });

        if (!grade) { gradingPickIdsRef.current.delete(pick.id); return; }

        // Optimistic UI update
        setPicksViewData(prev => {
          if (!prev?.picks) return prev;
          return {
            ...prev,
            picks: prev.picks.map(row =>
              row.id === pick.id
                ? { ...row, resultHit: grade.resultHit, actualStat: grade.actualStat,
                    gradeStatus: grade.gradeStatus,
                    pnl: grade.resultHit !== null ? calcPickPnl(grade.resultHit, row.odds, row.units) : null }
                : row
            ),
          };
        });

        // Persist
        apiFetch(`/api/picks/${encodeURIComponent(pick.id)}/grade`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resultHit: grade.resultHit, actualStat: grade.actualStat, gradeStatus: grade.gradeStatus }),
        })
          .then(() => apiFetch(`/api/picks/stats?days=${picksViewDays}`))
          .then(stats => setPicksViewStats(stats))
          .catch(() => {})
          .finally(() => gradingPickIdsRef.current.delete(pick.id));
      });
    })();
  }, [picksViewData?.picks?.length, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const voidPick = useCallback(async (pickId) => {
    try {
      await apiFetch(`/api/picks/${pickId}/void`, { method: "PATCH" });
      setPicksViewData((prev) => ({
        picks: (prev?.picks ?? []).filter((p) => p.id !== pickId),
      }));
      setLoggedPickIds((prev) => {
        const next = new Set(prev);
        next.delete(pickId);
        return next;
      });
      apiFetch(`/api/picks/stats?days=${picksViewDays}`)
        .then((s) => setPicksViewStats(s))
        .catch(() => {});
    } catch (_err) {
      showToast("Could not void pick — try again");
    }
  }, [picksViewDays, showToast]);

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
    setScheduleError(null);
    setLiveSlate(null);
    const url = slateDate ? `/api/slate?date=${slateDate}` : "/api/slate";
    apiFetch(url)
      .then(bundle => {
        const games = Array.isArray(bundle?.schedule) ? bundle.schedule : (Array.isArray(bundle) ? bundle : []);
        setLiveSlate(games);
        if (bundle?.oddsMap) setLiveOddsMap(bundle.oddsMap);
        if (bundle?.nrfiMap) setLiveNrfiData(bundle.nrfiMap);
        if (bundle?.weatherMap) setLiveWeather(formatSlateWeatherMap(games, bundle.weatherMap));
        if (bundle?.pitcherStatsMap) {
          setLivePitcherStats(prev => ({ ...prev, ...bundle.pitcherStatsMap }));
        }
        if (games?.length > 0) setSelectedId(games[0].gamePk);
      })
      .catch(err => {
        console.error("Slate fetch failed:", err);
        const msg = err.message ?? "Slate unavailable";
        const friendly = /failed to fetch|networkerror|load failed/i.test(msg)
          ? "Cannot reach API — is the backend running? (npm start on port 3001)"
          : msg.startsWith("HTTP ")
          ? msg.includes("502")
            ? "Slate service temporarily unavailable — retry in a moment"
            : `${msg} — check that npm start is running on port 3001`
          : msg;
        setScheduleError(friendly);
        setLiveSlate(null);
      })
      .finally(() => setSlateLoading(false));
  }, [slateDate]);

  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    if (!slateDate || view !== "board" || slateDate >= today) {
      setHistoricalSnapshot(null);
      setHistoricalSnapshotLoading(false);
      return;
    }

    let cancelled = false;
    setHistoricalSnapshot(null);
    setHistoricalSnapshotLoading(true);

    apiFetch(`/api/board-snapshot/${slateDate}`)
      .then(data => {
        if (cancelled) return;
        setHistoricalSnapshot({ date: slateDate, ...data });
      })
      .catch(() => {
        if (cancelled) return;
        setHistoricalSnapshot({ date: slateDate, hits: [], hr: [], k: [], outs: [] });
      })
      .finally(() => {
        if (!cancelled) setHistoricalSnapshotLoading(false);
      });

    return () => { cancelled = true; };
  }, [slateDate, view]);

  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const isHistoricalBoard = !!(slateDate && slateDate < today);
    if (view !== "board" || isHistoricalBoard) {
      setBoardSnapshotLoading(false);
      return;
    }
    if ((boardDailySnapshot?.date === today && boardDailySnapshot?.empty !== true) || boardSnapshotLoading) return;

    let cancelled = false;
    setBoardSnapshotLoading(true);

    apiFetch(`/api/board/snapshot?date=${today}`)
      .then(data => {
        if (cancelled) return;
        if (data && !data.empty) setBoardDailySnapshot({ ...data, date: today });
        else setBoardDailySnapshot({ date: today, empty: true, reason: data?.reason ?? "no_snapshot" });
      })
      .catch(() => {
        if (!cancelled) setBoardDailySnapshot({ date: today, empty: true, reason: "fetch_failed" });
      })
      .finally(() => {
        if (!cancelled) setBoardSnapshotLoading(false);
      });

    return () => { cancelled = true; };
  }, [view, slateDate]);

  // Poll until today's shared board snapshot exists AND every market has data
  // (midnight / 10 AM HI jobs, plus the on-demand fallback filling in
  // stale-empty markets like hits/hr once lineups post — see CODEX TASK 145).
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const isHistoricalBoard = !!(slateDate && slateDate < today);
    if (view !== "board" || isHistoricalBoard) return;
    if (boardSnapshotCoversToday() && !boardSnapshotHasEmptyMarket(boardDailySnapshot)) return;

    const poll = () => {
      apiFetch(`/api/board/snapshot?date=${today}`)
        .then(data => {
          if (data && !data.empty) setBoardDailySnapshot({ ...data, date: today });
        })
        .catch(() => {});
    };

    const interval = setInterval(poll, 90_000);
    return () => clearInterval(interval);
  }, [view, slateDate, boardDailySnapshot, boardSnapshotCoversToday, boardSnapshotHasEmptyMarket]);

  useEffect(() => {
    if (!researchMode || view !== "research-perf") return;
    setPerfStats(null);
    apiFetch(`/api/board-snapshot/stats?days=${perfDays}`)
      .then(data => setPerfStats(data))
      .catch(() => setPerfStats({ days: perfDays, rows: [] }));
  }, [researchMode, view, perfDays]);

  // Auto-refresh slate every 5 min to keep game statuses current and bundled
  // data reasonably fresh without fan-out calls from the client.
  useEffect(() => {
    if (IS_STATS_SANDBOX) return;
    const interval = setInterval(() => {
      const url = slateDate ? `/api/slate?date=${slateDate}` : "/api/slate";
      apiFetch(url)
        .then(bundle => {
          const games = Array.isArray(bundle?.schedule) ? bundle.schedule : [];
          setLiveSlate(prev => {
            if (!prev || !games?.length) return prev;
            // Merge updated statuses without replacing the full slate (avoids re-fetch cascade)
            return prev.map(g => {
              const fresh = games.find(fg => fg.gamePk === g.gamePk);
              return fresh ? { ...g, status: fresh.status } : g;
            });
          });
          if (bundle?.oddsMap) setLiveOddsMap(bundle.oddsMap);
          if (bundle?.nrfiMap) setLiveNrfiData(prev => ({ ...prev, ...bundle.nrfiMap }));
          if (bundle?.weatherMap) setLiveWeather(prev => ({ ...prev, ...formatSlateWeatherMap(games, bundle.weatherMap) }));
          if (bundle?.pitcherStatsMap) {
            setLivePitcherStats(prev => ({ ...prev, ...bundle.pitcherStatsMap }));
          }
        })
        .catch(() => {});
    }, 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(interval);
  }, [slateDate]);

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

  useEffect(() => {
    if (view !== "game" || tab !== "intel" || livePredMarkets !== null) return;
    apiFetch("/api/prediction-markets/mlb-game-odds")
      .then((data) => setLivePredMarkets(data ?? null))
      .catch(() => {});
  }, [view, tab, livePredMarkets]);

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

  // Fetch AI prop recommendations when Props tab opens
  useEffect(() => {
    if (IS_STATS_SANDBOX || view !== "game" || !selectedId || tab !== "props") return;
    const key = String(selectedId);
    if (aiPropsFetched.current.has(key)) return;

    const game = activeSlate.find(g => (g.gamePk ?? g.id) === selectedId);
    if (!game) return;

    aiPropsFetched.current.add(key);
    setLiveAiProps(prev => ({ ...prev, [key]: "loading" }));

    const playerPropsData = livePlayerProps[key];
    const odds = getGameOdds(game);
    const context = buildPropsContext(game, odds, PARK_FACTORS, pitcher, umpire, playerPropsData);

    apiMutate(`/api/props/${selectedId}`, "POST", { context })
      .then(data => {
        const props = Array.isArray(data?.props) ? data.props : [];
        setLiveAiProps(prev => ({ ...prev, [key]: { props } }));
        if (!props.length) aiPropsFetched.current.delete(key);
      })
      .catch(() => {
        aiPropsFetched.current.delete(key);
        setLiveAiProps(prev => ({ ...prev, [key]: null }));
      });
  }, [view, selectedId, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fetch all data needed by the Board + Model + AI Board + Predict views when opened
  useEffect(() => {
    if (view !== "board" && view !== "model" && view !== "ai-board" && view !== "predict") return;

    // ── Batter data (HR + Hits tabs) — single batch call ─────────────────────
    const missingBatterIds = [];
    Object.values(liveLineups).forEach(lu => {
      [...(lu.away ?? []), ...(lu.home ?? [])].forEach(b => {
        if (b?.id && !liveHittingLog[b.id]) missingBatterIds.push(b.id);
      });
    });
    if (missingBatterIds.length) {
      apiMutate("/api/players/gamelogs/batch", "POST", {
        playerIds: [...new Set(missingBatterIds)],
        group: "hitting",
      })
        .then(data => {
          if (data?.results) setLiveHittingLog(prev => ({ ...prev, ...data.results }));
        })
        .catch(() => {});
    }

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
        const existingProps = Array.isArray(livePlayerProps[key]?.props) ? livePlayerProps[key].props : [];
        if (livePlayerProps[key] === "loading") return;
        const hasBatterProps = existingProps.some(p =>
          p.market === "batter_home_runs" || p.market === "batter_hits"
        );
        if (hasBatterProps) return;
        if (boardPropsFetched.current.has(key)) return;
        boardPropsFetched.current.add(key);
        if (!existingProps.length) {
          setLivePlayerProps(prev => ({ ...prev, [key]: "loading" }));
        }
        fetchPlayerPropsDirect(game.away?.name ?? "", game.home?.name ?? "", game.gamePk)
          .then(result => {
            const normalized = result?.props ? result : { props: result ?? [], reason: "ok" };
            setLivePlayerProps(prev => ({ ...prev, [key]: normalized }));
            const gotBatterProps = normalized.props?.some(p =>
              p.market === "batter_home_runs" || p.market === "batter_hits"
            );
            if (!gotBatterProps) {
              boardPropsFetched.current.delete(key);
              delete playerPropsCache[key];
            }
          })
          .catch(() => {
            boardPropsFetched.current.delete(key);
            if (!existingProps.length) {
              setLivePlayerProps(prev => ({ ...prev, [key]: { props: [] } }));
            }
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

  // Load preferences on app start if already authenticated
  useEffect(() => {
    if (!authToken) return;
    apiFetch("/api/auth/preferences")
      .then(d => {
        const nextBook = d.preferences?.preferredBook ?? "DK";
        setPreferredBook(nextBook);
        setPropsBookFilter(nextBook);
      })
      .catch(() => {});
  }, [authToken]);

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
      setCurrentUser({ userId: data.userId, username: data.username, email: data.email ?? null });
      setLoginPass("");
      // Load preferences after login
      apiFetch("/api/auth/preferences")
        .then(d => {
          const nextBook = d.preferences?.preferredBook ?? "DK";
          setPreferredBook(nextBook);
          setPropsBookFilter(nextBook);
        })
        .catch(() => {});
    } catch (err) {
      setLoginError(err.message === "Unauthorized" || err.message?.includes("401")
        ? "Invalid username or password."
        : "Connection error — is the server running?");
    }
    setLoginLoading(false);
  };

  const handleSoftRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    oddsCache.ts = 0;
    setLiveSlate(null);
    setLiveOddsMap({});
    setLivePredMarkets(null);
    setLiveNrfiData({});
    liveScoresRef.current = {};
    setLiveScores({});
    setLiveInjuries([]);
    setLiveBoardResults({});
    setAiCardSummaries({});
    setAiBoardData(null);
    aiBoardPayloadSig.current = "";
    setAiBoardTab("all");
    setScoutSlate(null);
    setScoutSlateError(null);
    setLastRefreshed(new Date());
    setTimeout(() => setIsRefreshing(false), 2000);
  };

  const getBoardGameStatus = (gamePk) => {
    const game = (activeSlate ?? []).find(g => (g.gamePk ?? g.id) === gamePk);
    const status = game?.status ?? "";
    if (status === "In Progress" || status === "Warmup") return "LIVE";
    if (status === "Final" || status === "Game Over") return "FINAL";
    return null;
  };

  const handleLogout = () => {
    localStorage.removeItem("propscout_token");
    _authToken = null;
    setAuthToken(null);
    setCurrentUser(null);
    setPreferredBook(null);
    setPropsBookFilter("ALL");
    setChatHistory([]);
    setChatInput("");
    setChatLoading(false);
    setChatError(null);
    setChatMessagesLeft(30);
    setView("slate");
  };

  const toggleMarket = (mKey) => setCollapsedMarkets(prev => ({ ...prev, [mKey]: !prev[mKey] }));
  const getBoardGamePhase = (gamePk) => {
    const game = (liveSlate ?? []).find(g => String(g.gamePk) === String(gamePk));
    const s = game?.status ?? "";
    if (s === "Final" || s === "Game Over" || s === "Completed Early") return "final";
    if (s === "In Progress" || s === "Warmup") return "live";
    return "upcoming";
  };

  useEffect(() => {
    setBoardTop20(false);
  }, [boardTab]);

  const handleBuildScoutSlate = async ({ force = false } = {}) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const slateKey = slateDate ?? today;
    const cacheKey = "scout_slate_v1";

    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
        if (
          cached?.date === slateKey &&
          Number(cached?.goal) === Number(scoutGoal) &&
          Number(cached?.unit) === Number(scoutUnit) &&
          Array.isArray(cached?.picks)
        ) {
          setScoutSlate(cached);
          setScoutSlateError(null);
          return;
        }
      } catch {}
    }

    setScoutSlateLoading(true);
    setScoutSlateError(null);
    try {
      const allCandidates = buildScoutCandidates({
        liveSlate,
        liveLineups,
        liveWeather,
        livePlayerProps,
        livePitcherStats,
        liveGameLog,
        liveUmpires,
        liveTeamStats,
        liveHittingLog,
        liveStatSplits,
        pitcherArsenal,
        liveNrfiData,
        liveOddsMap: effectiveOddsMap,
      });

      const needed = picksNeeded(scoutGoal, scoutUnit);
      const picks = allCandidates.slice(0, Math.min(needed, 20));

      if (!picks.length) {
        const emptySlate = {
          date: slateKey,
          goal: scoutGoal,
          unit: scoutUnit,
          createdAt: new Date().toISOString(),
          picks: [],
          math: scoutMath([], scoutUnit, scoutGoal),
        };
        setScoutSlate(emptySlate);
        localStorage.setItem(cacheKey, JSON.stringify(emptySlate));
        return;
      }

      const data = await apiMutate("/api/scout/build-slate", "POST", { picks });
      // Backend returns a plain array; guard against both shapes
      const reasoning = Array.isArray(data) ? data : (Array.isArray(data?.picks) ? data.picks : []);
      const reasoningMap = Object.fromEntries(reasoning.map((p) => [p.id, p]));
      const mergedPicks = picks.map((p) => ({
        ...p,
        shortReason: reasoningMap[p.id]?.shortReason ?? null,
        confidenceStatement: reasoningMap[p.id]?.confidenceStatement ?? null,
        keyRisk: reasoningMap[p.id]?.keyRisk ?? null,
      }));
      const builtSlate = {
        date: slateKey,
        goal: scoutGoal,
        unit: scoutUnit,
        createdAt: new Date().toISOString(),
        picks: mergedPicks,
        math: scoutMath(mergedPicks, scoutUnit, scoutGoal),
      };
      setScoutSlate(builtSlate);
      localStorage.setItem(cacheKey, JSON.stringify(builtSlate));
    } catch (err) {
      setScoutSlateError(err?.message ?? "Failed to build Scout slate.");
    } finally {
      setScoutSlateLoading(false);
    }
  };

  useEffect(() => {
    if ((view !== "lab" && view !== "models") || (view === "lab" ? labSubTab : modelsSubTab) !== "f5ml" || !currentUser || !isScoutUser || labData !== null || labLoading) return;
    fetchLabData();
  }, [view, labSubTab, modelsSubTab, currentUser, isScoutUser, labData, labLoading]);

  useEffect(() => {
    if ((view !== "lab" && view !== "models") || (view === "lab" ? labSubTab : modelsSubTab) !== "fullgame" || !currentUser || !isScoutUser || labFgData !== null || labFgLoading) return;
    fetchLabFgData();
  }, [view, labSubTab, modelsSubTab, currentUser, isScoutUser, labFgData, labFgLoading]);

  useEffect(() => {
    if ((view !== "lab" && view !== "models") || (view === "lab" ? labSubTab : modelsSubTab) !== "kprop" || !currentUser || !isScoutUser || labKData !== null || labKLoading) return;
    fetchLabKData();
  }, [view, labSubTab, modelsSubTab, currentUser, isScoutUser, labKData, labKLoading]);

  useEffect(() => {
    if ((view !== "lab" && view !== "models") || (view === "lab" ? labSubTab : modelsSubTab) !== "totals" || !currentUser || !isScoutUser || labTotalsData !== null || labTotalsLoading) return;
    fetchLabTotalsData();
  }, [view, labSubTab, modelsSubTab, currentUser, isScoutUser, labTotalsData, labTotalsLoading]);

  useEffect(() => {
    if (view !== "lab" || !currentUser || !isScoutUser || labCalibration !== null || labCalibrationLoading) return;
    fetchLabCalibration();
  }, [view, currentUser, isScoutUser, labCalibration, labCalibrationLoading]);

  // Shared daily AI edges — one GET for all users (no POST /api/ai-board/score on tab open)
  useEffect(() => {
    if ((view !== "ai-board" && view !== "predict" && view !== "chat") || !currentUser || !isScoutUser) return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const dateParam = slateDate && slateDate <= today ? slateDate : today;

    let cancelled = false;
    setAiBoardLoading(true);

    apiFetch(`/api/ai-board/edges?date=${encodeURIComponent(dateParam)}`)
      .then((data) => {
        if (cancelled) return;
        const edges = (Array.isArray(data?.edges) ? data.edges : []).map(normalizeAiBoardEdge);
        edges.sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0));
        setAiBoardEdgesMeta({
          fallback: !!data?.fallback,
          generatedAt: data?.generatedAt ?? null,
          slateDate: data?.slateDate ?? dateParam,
        });
        setAiBoardData(edges);
        setAiCardSummaries(prev => {
          const updates = {};
          edges.forEach(c => {
            if (c.aiReason && !prev[c.id]) updates[c.id] = c.aiReason;
          });
          return Object.keys(updates).length ? { ...prev, ...updates } : prev;
        });
        if (dateParam === today && edges.length > 0) {
          setLockedAiBoardSnapshot(prev => {
            if (prev !== null) return prev;
            localStorage.setItem("ai_board_snapshot", JSON.stringify({ date: today, data: edges }));
            return edges;
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAiBoardData([]);
        setAiBoardEdgesMeta({ fallback: true, generatedAt: null, slateDate: dateParam });
      })
      .finally(() => {
        if (!cancelled) setAiBoardLoading(false);
      });

    return () => { cancelled = true; };
  }, [view, currentUser, isScoutUser, slateDate]);

  useEffect(() => {
    if (!currentUser || !isScoutUser || !labData?.games?.length || !labData?.date) return;
    labData.games.forEach((g) => {
      const key = `f5ml:${labData.date}:${g.gamePk}`;
      if (labCalibrationRecorded.current.has(key)) return;
      if (!g.model?.leanSide || g.model?.leanEdge == null) return;
      labCalibrationRecorded.current.add(key);
      apiMutate("/api/model/calibration/record", "POST", {
        gamePk: g.gamePk,
        date: labData.date,
        leanSide: g.model.leanSide,
        leanProb: g.model.leanSide === "home" ? g.model.homeProb : g.model.awayProb,
        leanEdge: g.model.leanEdge,
        hasEdge: g.model.hasEdge === true,
        model: "f5ml",
      }).catch(() => {});
    });
  }, [currentUser, isScoutUser, labData]);

  useEffect(() => {
    if (!currentUser || !isScoutUser || !labFgData?.games?.length || !labFgData?.date) return;
    labFgData.games.forEach((g) => {
      const key = `fullgame:${labFgData.date}:${g.gamePk}`;
      if (labCalibrationRecorded.current.has(key)) return;
      if (!g.model?.leanSide || g.model?.leanEdge == null) return;
      labCalibrationRecorded.current.add(key);
      apiMutate("/api/model/calibration/record", "POST", {
        gamePk: g.gamePk,
        date: labFgData.date,
        leanSide: g.model.leanSide,
        leanProb: g.model.leanSide === "home" ? g.model.homeProb : g.model.awayProb,
        leanEdge: g.model.leanEdge,
        hasEdge: g.model.hasEdge === true,
        model: "fullgame",
      }).catch(() => {});
    });
  }, [currentUser, isScoutUser, labFgData]);

  useEffect(() => {
    if (!currentUser || !isScoutUser || !labKData?.games?.length || !labKData?.date) return;
    labKData.games.forEach((g) => {
      [
        { side: "away", prop: g.awayKProp, pitcher: g.awayPitcher },
        { side: "home", prop: g.homeKProp, pitcher: g.homePitcher },
      ].forEach(({ side, prop, pitcher }) => {
        const key = `kprop:${labKData.date}:${g.gamePk}:${side}`;
        if (labCalibrationRecorded.current.has(key)) return;
        if (!prop?.lean || prop?.overUnderEdge == null || prop?.leanProb == null) return;
        labCalibrationRecorded.current.add(key);
        apiMutate("/api/model/calibration/record", "POST", {
          gamePk: g.gamePk,
          date: labKData.date,
          leanSide: prop.lean,
          leanProb: prop.leanProb,
          leanEdge: prop.overUnderEdge,
          hasEdge: prop.hasEdge === true,
          model: "kprop",
          subjectKey: side,
          bookLine: prop.bookLine ?? null,
          pitcherLastName: String(pitcher?.name ?? "").split(" ").pop() || null,
        }).catch(() => {});
      });
    });
  }, [currentUser, isScoutUser, labKData]);

  useEffect(() => {
    if (!currentUser || !isScoutUser || !labTotalsData?.games?.length || !labTotalsData?.date) return;
    labTotalsData.games.forEach((g) => {
      const key = `totals:${labTotalsData.date}:${g.gamePk}`;
      if (labCalibrationRecorded.current.has(key)) return;
      if (!g.model?.lean || g.model?.overUnderEdge == null || g.model?.leanProb == null) return;
      labCalibrationRecorded.current.add(key);
      apiMutate("/api/model/calibration/record", "POST", {
        gamePk: g.gamePk,
        date: labTotalsData.date,
        leanSide: g.model.lean,
        leanProb: g.model.leanProb,
        leanEdge: g.model.overUnderEdge,
        hasEdge: g.model.hasEdge === true,
        model: "totals",
        bookTotal: g.model.bookTotal ?? null,
      }).catch(() => {});
    });
  }, [currentUser, isScoutUser, labTotalsData]);

  useEffect(() => {
    if (!currentUser || !isScoutUser) return;
    const resolveLab = (games, date, model) => {
      if (!games?.length || !date) return;
      games.forEach((g) => {
        const key = `${model}:${date}:${g.gamePk}`;
        if (labCalibrationResolved.current.has(key)) return;
        const box = liveBoxscores[String(g.gamePk)] ?? liveBoxscores[g.gamePk];
        if (!box) return;

        let result = null;
        if (model === "f5ml") {
          const innings = box.linescore?.innings ?? [];
          if (innings.length < 5) return;
          const f5Away = innings.slice(0, 5).reduce((s, i) => s + (i?.away ?? 0), 0);
          const f5Home = innings.slice(0, 5).reduce((s, i) => s + (i?.home ?? 0), 0);
          if (f5Away === f5Home) result = "PUSH";
          else result = g.model?.leanSide === "home"
            ? (f5Home > f5Away ? "HIT" : "MISS")
            : (f5Away > f5Home ? "HIT" : "MISS");
        } else {
          if (!box?.isFinal) return;
          const awayRuns = box.linescore?.away?.runs;
          const homeRuns = box.linescore?.home?.runs;
          if (awayRuns == null || homeRuns == null) return;
          if (awayRuns === homeRuns) result = "PUSH";
          else result = g.model?.leanSide === "home"
            ? (homeRuns > awayRuns ? "HIT" : "MISS")
            : (awayRuns > homeRuns ? "HIT" : "MISS");
        }

        if (!result) return;
        labCalibrationResolved.current.add(key);
        apiMutate("/api/model/calibration/resolve", "POST", {
          gamePk: g.gamePk,
          model,
          result,
        })
          .then(() => fetchLabCalibration())
          .catch(() => {});
      });
    };

    resolveLab(labData?.games, labData?.date, "f5ml");
    resolveLab(labFgData?.games, labFgData?.date, "fullgame");

    if (labKData?.games?.length && labKData?.date) {
      labKData.games.forEach((g) => {
        const box = liveBoxscores[String(g.gamePk)] ?? liveBoxscores[g.gamePk];
        if (!box?.isFinal) return;
        [
          { side: "away", prop: g.awayKProp, pitcher: g.awayPitcher },
          { side: "home", prop: g.homeKProp, pitcher: g.homePitcher },
        ].forEach(({ side, prop, pitcher }) => {
          if (!prop?.lean || prop?.bookLine == null || !pitcher?.name) return;
          const key = `kprop:${labKData.date}:${g.gamePk}:${side}`;
          if (labCalibrationResolved.current.has(key)) return;
          const grade = computeLabKPropGrade({
            leanSide: prop.lean,
            bookLine: prop.bookLine,
            pitcherSide: side,
            pitcherLastName: String(pitcher.name ?? "").split(" ").pop(),
          }, box);
          if (grade == null) return;
          labCalibrationResolved.current.add(key);
          apiMutate("/api/model/calibration/resolve", "POST", {
            gamePk: g.gamePk,
            model: "kprop",
            result: grade === "hit" ? "HIT" : "MISS",
            subjectKey: side,
          })
            .then(() => fetchLabCalibration())
            .catch(() => {});
        });
      });
    }

    if (labTotalsData?.games?.length && labTotalsData?.date) {
      labTotalsData.games.forEach((g) => {
        const box = liveBoxscores[String(g.gamePk)] ?? liveBoxscores[g.gamePk];
        if (!box?.isFinal) return;
        const key = `totals:${labTotalsData.date}:${g.gamePk}`;
        if (labCalibrationResolved.current.has(key)) return;
        const grade = computeLabTotalsGrade({
          leanSide: g.model?.lean,
          bookTotal: g.model?.bookTotal,
        }, box);
        if (grade == null) return;
        labCalibrationResolved.current.add(key);
        apiMutate("/api/model/calibration/resolve", "POST", {
          gamePk: g.gamePk,
          model: "totals",
          result: grade === "hit" ? "HIT" : "MISS",
        })
          .then(() => fetchLabCalibration())
          .catch(() => {});
      });
    }
  }, [currentUser, isScoutUser, liveBoxscores, labData, labFgData, labKData, labTotalsData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatHistory, chatLoading]);

  // Background prefetch: pitcher gamelogs + lineups for ALL slate games so the
  // Games board and cross-slate cards can compute reactively. Slate bundle
  // already seeds odds, NRFI, weather, and pitcher season stats on load.
  useEffect(() => {
    if (IS_STATS_SANDBOX || !liveSlate?.length) return;
    liveSlate.forEach(sg => {
      // Home pitcher game log
      const pid = sg.probablePitchers?.home?.id;
      if (pid && !liveGameLog[pid]) {
        apiFetch(`/api/players/${pid}/gamelog?group=pitching`)
          .then(data => setLiveGameLog(prev => ({ ...prev, [pid]: data })))
          .catch(() => {});
      }
      // Away pitcher game log (needed for Games board scoring)
      const apid = sg.probablePitchers?.away?.id;
      if (apid && !liveGameLog[apid]) {
        apiFetch(`/api/players/${apid}/gamelog?group=pitching`)
          .then(data => setLiveGameLog(prev => ({ ...prev, [apid]: data })))
          .catch(() => {});
      }
      // Lineup — re-fetch if not yet confirmed (1-min TTL on backend keeps it fresh)
      if (!liveLineups[sg.gamePk]?.confirmed) {
        apiFetch(`/api/lineups/${sg.gamePk}`)
          .then(data => setLiveLineups(prev => ({ ...prev, [sg.gamePk]: data })))
          .catch(() => {});
      }
    });
  }, [liveSlate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll unconfirmed lineups every 3 minutes so Model Picks update automatically
  // when lineups are posted closer to game time — no manual refresh needed.
  useEffect(() => {
    if (IS_STATS_SANDBOX || !liveSlate?.length) return;

    const pollUnconfirmed = () => {
      liveSlate.forEach(sg => {
        if (liveLineups[sg.gamePk]?.confirmed) return; // already confirmed — skip
        apiFetch(`/api/lineups/${sg.gamePk}`)
          .then(data => setLiveLineups(prev => ({ ...prev, [sg.gamePk]: data })))
          .catch(() => {});
      });
    };

    const id = setInterval(pollUnconfirmed, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, [liveSlate, liveLineups]);

  // Auto-refresh odds every 10 minutes so Games board and Model Picks stay current
  useEffect(() => {
    if (IS_ODDS_SANDBOX || !liveSlate?.length) return;
    const id = setInterval(async () => {
      const result = await fetchOdds(true);
      if (result?.data) setLiveOddsMap(result.data);
    }, 20 * 60 * 1000);
    return () => clearInterval(id);
  }, [liveSlate]);

  // Lock odds at first pitch — prevents live in-game lines from overwriting pre-game odds.
  useEffect(() => {
    if (!liveSlate?.length || !Object.keys(liveOddsMap).length) return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    let updated = false;
    const next = { ...lockedOddsMap };

    liveSlate.forEach(game => {
      if (next[game.gamePk]) return; // already locked — idempotent
      const s = game.status ?? "";
      const isLiveOrFinal =
        s === "In Progress" || s === "Warmup" ||
        s === "Final" || s === "Game Over" || s === "Completed Early";
      if (!isLiveOrFinal) return;
      const key = `${game.away.name}|${game.home.name}`;
      const oddsEntry = liveOddsMap[key];
      if (!oddsEntry) return; // no odds loaded yet — will catch on next liveOddsMap update
      next[game.gamePk] = oddsEntry;
      updated = true;
    });

    if (!updated) return;
    localStorage.setItem("locked_odds_snapshot", JSON.stringify({ date: today, data: next }));
    setLockedOddsMap(next);
  }, [liveSlate, liveOddsMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll linescore every 60s for all in-progress games
  useEffect(() => {
    if (IS_STATS_SANDBOX || !liveSlate?.length) return;

    const pollScores = () => {
      const now = Date.now();
      liveSlate.forEach(sg => {
        const status = sg.status ?? "";
        const inProgress = status === "In Progress" || status === "Warmup";
        const finished   = status === "Final" || status === "Game Over";
        // Also poll games past their scheduled start time — schedule cache can be
        // stale for up to 1 hour, so "Scheduled" status doesn't mean not started.
        const gameTimeMs   = sg.gameTime ? Date.parse(sg.gameTime) : null;
        const msSinceStart = gameTimeMs ? now - gameTimeMs : null;
        const likelyActive = msSinceStart != null && msSinceStart > 0 && msSinceStart < 5 * 60 * 60 * 1000;
        // Poll if: in-progress, past start time, or final-once
        if (!inProgress && !likelyActive && !(finished && !liveScoresRef.current[sg.gamePk])) return;
        apiFetch(`/api/linescore/${sg.gamePk}`)
          .then(data => {
            liveScoresRef.current = { ...liveScoresRef.current, [sg.gamePk]: data };
            setLiveScores(prev => ({ ...prev, [sg.gamePk]: data }));
          })
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

  // Fetch boxscores for live/final games on the Board + Model views to show today's results
  useEffect(() => {
    if (IS_STATS_SANDBOX || (view !== "board" && view !== "model") || !liveSlate) return;
    liveSlate.forEach(g => {
      const status = g.status ?? "";
      const isLive  = status === "In Progress" || status === "Warmup";
      const ls = liveScoresRef.current[g.gamePk];
      const linescoreFinished = ls && ls.inning === null && ((ls.awayScore ?? 0) > 0 || (ls.homeScore ?? 0) > 0);
      const isFinal = status === "Final" || status === "Game Over" || linescoreFinished;
      if (!isLive && !isFinal) return;
      const liveKey  = `live:${g.gamePk}`;
      const finalKey = `final:${g.gamePk}`;
      if (isLive && boardBoxFetched.current.has(liveKey)) return;
      if (isFinal && boardBoxFetched.current.has(finalKey)) return;
      apiFetch(`/api/boxscore/${g.gamePk}`)
        .then(box => {
          if (!box?.batting) return;
          setLiveBoxscores(prev => ({ ...prev, [g.gamePk]: box }));
          if (box?.isFinal) boardBoxFetched.current.add(finalKey);
          else if (isLive) boardBoxFetched.current.add(liveKey);
          const resultLive = !box?.isFinal && isLive;
          const results = {};
          ["away", "home"].forEach(side => {
            (box.batting?.[side] ?? []).forEach(b => {
              if (b?.id) results[b.id] = { h: b.h ?? 0, hr: b.hr ?? 0, ab: b.ab ?? 0, live: resultLive };
            });
            (box.pitching?.[side] ?? []).forEach(p => {
              if (p?.id) results[p.id] = { ...(results[p.id] ?? {}), k: p.k ?? 0, outs: parseIpToOuts(p.ip), ip: p.ip ?? "0.0", live: resultLive };
            });
          });
          setLiveBoardResults(prev => ({ ...prev, ...results }));
        })
        .catch(() => {});
    });
  }, [view, liveSlate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch unified game detail bundle when a live game card opens; fall back to
  // individual endpoints only for any missing sub-components.
  useEffect(() => {
    if (IS_STATS_SANDBOX || view !== "game" || !liveSlate) return;
    const sg = liveSlate.find(g => g.gamePk === selectedId);
    if (!sg) return;
    const { gamePk } = sg;
    const detailKey = String(gamePk);
    const pitcherId = sg.probablePitchers?.home?.id;
    const awayPitcherId = sg.probablePitchers?.away?.id;
    const homeTeamId = sg.home?.id;
    const awayTeamId = sg.away?.id;
    const homeAbbr = sg.home?.abbr;
    const awayAbbr = sg.away?.abbr;

    const needsLineups = !liveLineups[gamePk];
    const needsUmpires = !liveUmpires[gamePk];
    const needsBullpen = !liveBullpen[gamePk];
    const needsNrfi = !liveNrfiData[gamePk];
    const needsWeather = !liveWeather[gamePk];
    const needsHomeStats = pitcherId && !livePitcherStats[pitcherId];
    const needsAwayStats = awayPitcherId && !livePitcherStats[awayPitcherId];
    const needsHomeGamelog = pitcherId && !liveGameLog[pitcherId];
    const needsAwayGamelog = awayPitcherId && !liveGameLog[awayPitcherId];
    const needsHomeArsenal = !IS_SAVANT_SANDBOX && pitcherId && !pitcherArsenal[pitcherId];
    const needsAwayArsenal = !IS_SAVANT_SANDBOX && awayPitcherId && !pitcherArsenal[awayPitcherId];
    const needsHomeTeamStats = homeTeamId && homeAbbr && !liveTeamStats[homeAbbr];
    const needsAwayTeamStats = awayTeamId && awayAbbr && !liveTeamStats[awayAbbr];
    const needsDetail = [
      needsLineups,
      needsUmpires,
      needsBullpen,
      needsNrfi,
      needsWeather,
      needsHomeStats,
      needsAwayStats,
      needsHomeGamelog,
      needsAwayGamelog,
      needsHomeArsenal,
      needsAwayArsenal,
      needsHomeTeamStats,
      needsAwayTeamStats,
    ].some(Boolean);

    let kickedOffUnifiedDetail = false;
    if (needsDetail && !gameDetailFetched.current.has(detailKey)) {
      kickedOffUnifiedDetail = true;
      gameDetailFetched.current.add(detailKey);
      const detailUrl = slateDate ? `/api/game/${gamePk}?date=${slateDate}` : `/api/game/${gamePk}`;
      apiFetch(detailUrl)
        .then(detail => {
          if (detail?.lineups) {
            setLiveLineups(prev => ({ ...prev, [gamePk]: detail.lineups }));
          }
          if (detail?.umpire) {
            setLiveUmpires(prev => ({ ...prev, [gamePk]: detail.umpire }));
          }
          if (detail?.nrfi) {
            setLiveNrfiData(prev => ({ ...prev, [gamePk]: detail.nrfi }));
          }
          if (detail?.weather) {
            setLiveWeather(prev => ({ ...prev, [gamePk]: formatSlateWeatherEntry(sg, detail.weather) }));
          }
          if (detail?.bullpen) {
            setLiveBullpen(prev => ({ ...prev, [gamePk]: detail.bullpen }));
          }
          if (pitcherId && detail?.homePitcher?.stats) {
            setLivePitcherStats(prev => ({ ...prev, [pitcherId]: detail.homePitcher.stats }));
          }
          if (pitcherId && detail?.homePitcher?.gamelog) {
            setLiveGameLog(prev => ({ ...prev, [pitcherId]: detail.homePitcher.gamelog }));
          }
          if (!IS_SAVANT_SANDBOX && pitcherId && detail?.homePitcher?.arsenal) {
            setPitcherArsenal(prev => ({ ...prev, [pitcherId]: detail.homePitcher.arsenal }));
          }
          if (awayPitcherId && detail?.awayPitcher?.stats) {
            setLivePitcherStats(prev => ({ ...prev, [awayPitcherId]: detail.awayPitcher.stats }));
          }
          if (awayPitcherId && detail?.awayPitcher?.gamelog) {
            setLiveGameLog(prev => ({ ...prev, [awayPitcherId]: detail.awayPitcher.gamelog }));
          }
          if (!IS_SAVANT_SANDBOX && awayPitcherId && detail?.awayPitcher?.arsenal) {
            setPitcherArsenal(prev => ({ ...prev, [awayPitcherId]: detail.awayPitcher.arsenal }));
          }
          if (homeAbbr && detail?.teamStats?.home) {
            setLiveTeamStats(prev => ({ ...prev, [homeAbbr]: detail.teamStats.home }));
          }
          if (awayAbbr && detail?.teamStats?.away) {
            setLiveTeamStats(prev => ({ ...prev, [awayAbbr]: detail.teamStats.away }));
          }
        })
        .catch(() => {
          gameDetailFetched.current.delete(detailKey);
        });
    }

    if (kickedOffUnifiedDetail) return;

    if (needsLineups) {
      apiFetch(`/api/lineups/${gamePk}`)
        .then(data => setLiveLineups(prev => ({ ...prev, [gamePk]: data })))
        .catch(err => console.error("Lineups:", err));
    }
    if (needsUmpires) {
      apiFetch(`/api/umpires/${gamePk}`)
        .then(data => setLiveUmpires(prev => ({ ...prev, [gamePk]: data })))
        .catch(err => console.error("Umpires:", err));
    }
    if (needsHomeStats) {
      apiFetch(`/api/players/${pitcherId}/stats?group=pitching`)
        .then(data => setLivePitcherStats(prev => ({ ...prev, [pitcherId]: data })))
        .catch(err => console.error("Home pitcher stats:", err));
    }
    if (needsHomeGamelog) {
      apiFetch(`/api/players/${pitcherId}/gamelog?group=pitching`)
        .then(data => setLiveGameLog(prev => ({ ...prev, [pitcherId]: data })))
        .catch(err => console.error("Home pitcher gamelog:", err));
    }
    if (needsHomeArsenal) {
      apiFetch(`/api/arsenal/${pitcherId}`)
        .then(data => { if (data?.arsenal?.length || data?.pitcherStats) setPitcherArsenal(prev => ({ ...prev, [pitcherId]: data })); })
        .catch(err => console.error("Home arsenal fetch:", err));
    }
    if (needsAwayStats) {
      apiFetch(`/api/players/${awayPitcherId}/stats?group=pitching`)
        .then(data => setLivePitcherStats(prev => ({ ...prev, [awayPitcherId]: data })))
        .catch(err => console.error("Away pitcher stats:", err));
    }
    if (needsAwayGamelog) {
      apiFetch(`/api/players/${awayPitcherId}/gamelog?group=pitching`)
        .then(data => setLiveGameLog(prev => ({ ...prev, [awayPitcherId]: data })))
        .catch(err => console.error("Away pitcher gamelog:", err));
    }
    if (needsAwayArsenal) {
      apiFetch(`/api/arsenal/${awayPitcherId}`)
        .then(data => { if (data?.arsenal?.length || data?.pitcherStats) setPitcherArsenal(prev => ({ ...prev, [awayPitcherId]: data })); })
        .catch(err => console.error("Away arsenal fetch:", err));
    }
    if (needsBullpen) {
      apiFetch(`/api/bullpen/${gamePk}`)
        .then(data => setLiveBullpen(prev => ({ ...prev, [gamePk]: data })))
        .catch(err => console.error("Bullpen:", err));
    }
    if (needsNrfi) {
      apiFetch(`/api/nrfi/${gamePk}`)
        .then(data => setLiveNrfiData(prev => ({ ...prev, [gamePk]: data })))
        .catch(err => console.error("NRFI:", err));
    }
    [
      { id: awayTeamId, abbr: awayAbbr },
      { id: homeTeamId, abbr: homeAbbr },
    ].forEach(({ id, abbr }) => {
      if (id && abbr && !liveTeamStats[abbr]) {
        apiFetch(`/api/team-stats/${id}`)
          .then(data => {
            if (data?.kPct != null) setLiveTeamStats(prev => ({ ...prev, [abbr]: data }));
          })
          .catch(() => {});
      }
    });
  }, [selectedId, view, liveSlate, liveLineups, liveUmpires, liveBullpen, liveNrfiData, liveWeather, livePitcherStats, liveGameLog, liveTeamStats, pitcherArsenal, slateDate]);


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


  // Active slate: live API for everyone when backend is on — never mix mock SLATE with production users
  const activeSlate = !IS_STATS_SANDBOX
    ? (liveSlate ?? []).map(sg => {
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
      return ll?.confirmed
        ? { away: ll.away ?? [], home: ll.home ?? [] }
        : baseGame.lineups;
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
      const liveArsenalData = pid ? pitcherArsenal[pid] : null;
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
        arsenal: liveArsenalData?.arsenal ?? baseGame.pitcher.arsenal ?? [],
        pitcherStats: liveArsenalData?.pitcherStats ?? baseGame.pitcher.pitcherStats ?? null,
        arsenalLive: !!liveArsenalData,
      };
    })(),
    // Away pitcher stats + arsenal overlay
    awayPitcher: (() => {
      const ap = baseGame.awayPitcher ?? { name: "TBD", team: "—", hand: "?", number: "—", era: "—", whip: "—", kPer9: "—", bbPer9: "—", avgIP: "—", arsenal: [], arsenalLive: false };
      const ps = livePitcherStats[ap?.id];
      const liveArsenalData = ap?.id ? pitcherArsenal[ap.id] : null;
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
        arsenal:     liveArsenalData?.arsenal ?? ap.arsenal ?? [],
        pitcherStats: liveArsenalData?.pitcherStats ?? ap.pitcherStats ?? null,
        arsenalLive: !!liveArsenalData,
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
  const lineupScratchMap = liveLineups[gamePkKey]?.scratches ?? { away: [], home: [] };
  const lineupScratchNames = new Set([
    ...(lineupScratchMap.away ?? []).map(s => normalizeScratchName(s.name)),
    ...(lineupScratchMap.home ?? []).map(s => normalizeScratchName(s.name)),
  ]);

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
    const live = effectiveOddsMap[key];
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
      lineMove:       live.totalMoveDir === "up" ? "over" : live.totalMoveDir === "down" ? "under" : g.odds.lineMove ?? "none",
      movement:       live.movementText ?? g.odds.movement ?? "No movement data.",
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
    if (IS_STATS_SANDBOX || view !== "game" || !selectedId) return;
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
  }, [view, selectedId, !!liveLineups[selectedId]?.confirmed]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const propTypeKey = (p) => {
    const t = (p.propType ?? "").toUpperCase();
    if (["HITS", "HR", "TB", "RBI"].includes(t)) return `${t}:${(p.label ?? "").split(" ")[0].toUpperCase()}`;
    if (t) return t;
    const lbl = (p.label ?? "").toUpperCase();
    if (lbl.startsWith("NRFI")) return "NRFI";
    if (lbl.startsWith("YRFI")) return "YRFI";
    return lbl.slice(0, 12);
  };

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
  const isAvailableAtPreferredBook = (pick) => {
    const ppState = livePlayerProps[String(pick.gamePk)];
    // Odds not loaded yet — don't hide the pick prematurely
    if (!ppState || ppState === "loading" || !Array.isArray(ppState?.props)) return true;
    const lastName = (pick.fullName ?? "").split(" ").pop().toLowerCase();
    const match = ppState.props.find(pr =>
      pr.market === pick.market &&
      pr.player?.toLowerCase().includes(lastName)
    );
    // Prop not in odds API yet — don't hide
    if (!match) return true;
    // Prop IS posted — only show if preferred book has a line
    return match.books?.[preferredBook]?.line != null;
  };

  const parseOddsInt = (str) => {
    if (!str) return -115;
    const n = parseInt(String(str).replace("+", ""), 10);
    return Number.isFinite(n) ? n : -115;
  };

  const getPreferredOdds = (pick) => {
    const props = livePlayerProps[String(pick.gamePk)]?.props ?? [];
    const lastName = (pick.fullName ?? "").split(" ").pop().toLowerCase();
    const match = props.find(p =>
      p.market === pick.market &&
      (p.player ?? "").toLowerCase().includes(lastName)
    );
    const book = match?.books?.[preferredBook];
    const oddsStr = pick.lean === "OVER" ? book?.overOdds : book?.underOdds;
    return parseOddsInt(oddsStr);
  };

  const rawSlatePicks = !IS_STATS_SANDBOX && liveSlate?.length
    ? computeTopSlatePicks(liveSlate, livePitcherStats, liveLineups, liveWeather, livePlayerProps)
    : [];
  const topSlatePicks = preferredBook
    ? rawSlatePicks
        .filter(isAvailableAtPreferredBook)
        .sort((a, b) => {
          // Primary: confidence (higher = better)
          if (b.confidence !== a.confidence) return b.confidence - a.confidence;
          // Secondary: odds value at preferred book (more positive = better value)
          return getPreferredOdds(b) - getPreferredOdds(a);
        })
    : rawSlatePicks;

  // Group model picks by tier for display
  const highPicks   = topSlatePicks.filter(p => p.tier === "HIGH");
  const mediumPicks = topSlatePicks.filter(p => p.tier === "MEDIUM");
  const specPicks   = topSlatePicks.filter(p => p.tier === "SPEC");

  const hydrateCardSummaries = useCallback(async (requests, { premium = false } = {}) => {
    const premiumKey = (id) => premium ? `premium:${id}` : id;
    const pending = (requests ?? []).filter(req =>
      req?.id &&
      !aiCardSummaries[premiumKey(req.id)] &&
      !aiSummaryInFlight.current.has(premiumKey(req.id))
    );
    if (!pending.length) return;

    pending.forEach(req => aiSummaryInFlight.current.add(premiumKey(req.id)));
    try {
      const data = await apiMutate("/api/card-summary", "POST", {
        premium,
        cards: pending.map(({ id, market, lean, score, scoreTier, positives, negatives, caution, matchup, signals, name, hand, facingTeam, avgK3, avgIP, era, whip, oppKPct, umpire, umpireRating, bookLine, windFav, order }) => ({
          id, market, lean,
          score:     score     ?? null,
          scoreTier: scoreTier ?? "mid",
          positives, negatives: negatives ?? [],
          caution, matchup: matchup ?? null,
          signals: signals ?? [], name: name ?? null, hand: hand ?? null,
          facingTeam: facingTeam ?? null, avgK3: avgK3 ?? null, avgIP: avgIP ?? null,
          era: era ?? null, whip: whip ?? null, oppKPct: oppKPct ?? null,
          umpire: umpire ?? null, umpireRating: umpireRating ?? null,
          bookLine: bookLine ?? null, windFav: windFav ?? null, order: order ?? null,
        })),
      });
      setAiCardSummaries(prev => ({
        ...prev,
        ...Object.fromEntries(
          pending.map(req => [premiumKey(req.id), data?.summaries?.[req.id] ?? fallbackCardSummary(req)])
        ),
      }));
    } catch {
      setAiCardSummaries(prev => ({
        ...prev,
        ...Object.fromEntries(pending.map(req => [premiumKey(req.id), fallbackCardSummary(req)])),
      }));
    } finally {
      pending.forEach(req => aiSummaryInFlight.current.delete(premiumKey(req.id)));
    }
  }, [aiCardSummaries]);

  const getCardSummaryText = useCallback((request) => {
    if (!request?.id) return null;
    return aiCardSummaries[`premium:${request.id}`]
      ?? aiCardSummaries[request.id]
      ?? fallbackCardSummary(request);
  }, [aiCardSummaries]);

  /** Single source of truth: snapshot fields first, then shared DB-backed cache, then fallback. */
  const resolveCardSummaryText = useCallback((c, request, { allowPremium = true } = {}) => {
    const fromSnapshot = c?._boardSummary ?? c?.aiSummary ?? null;
    if (fromSnapshot) return fromSnapshot;
    if (!request?.id) return null;
    if (allowPremium) {
      const premium = aiCardSummaries[`premium:${request.id}`];
      if (premium) return premium;
    }
    return aiCardSummaries[request.id] ?? fallbackCardSummary(request);
  }, [aiCardSummaries]);

  useEffect(() => {
    if (view !== "board") return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    const isHistoricalBoard = !!(slateDate && slateDate < today);
    if (isHistoricalBoard) return;
    // Shared daily snapshot is authoritative for all tabs — no per-client POST /api/card-summary
    if (boardSnapshotCoversToday()) return;
    const isGameBoard = boardTab === "games";
    const snapshotCards = isGameBoard ? getBoardMarketSnapshot(gameSubTab) : getBoardMarketSnapshot(boardTab);
    if (Array.isArray(snapshotCards)) return;
    const requests = (
      isGameBoard
        ? computeGameBoard(gameSubTab, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, blendedPitcherStatsForGameBoard, liveUmpires)
        : boardTab === "hr"
        ? computeBatterBoard("hr", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits)
        : boardTab === "hits"
        ? computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits)
        : boardTab === "k"
        ? computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal)
        : computePitcherBoard("outs", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal)
    )
      .slice(0, 60)  // cover top 60 live candidates (board renders well past rank 20 for multi-game slates)
      .map(c => buildBoardSummaryRequest(c, isGameBoard ? gameSubTab : boardTab));

    // Also include any locked candidates for this tab so they get summaries too
    const lockedRequests = Object.values(lockedBoardCandidates)
      .flatMap(entry => {
        const tabCandidates = isGameBoard ? [] : (entry[boardTab] ?? []);
        return tabCandidates.map(c => buildBoardSummaryRequest(c, boardTab));
      });

    const allRequests = [...requests, ...lockedRequests.filter(r => !requests.some(lr => lr.id === r.id))];
    let cancelled = false;
    void (async () => {
      await hydrateCardSummaries(allRequests);
    })();
    return () => { cancelled = true; };
  }, [view, boardTab, gameSubTab, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, livePitcherStats, liveUmpires, liveLineups, livePlayerProps, liveHittingLog, liveStatSplits, liveGameLog, liveTeamStats, lockedBoardCandidates, hydrateCardSummaries, boardDailySnapshot, slateDate, getBoardMarketSnapshot, boardSnapshotCoversToday]);

  // Lock board candidates when a game goes live — prevents survivorship bias in result tracking.
  // Re-runs when hitting logs arrive so batter tabs (Hits/HR) aren't stored empty.
  // Uses activeSlate (enriched with game.pitcher/awayPitcher) so platoon hands are correct.
  useEffect(() => {
    if (!liveSlate || view !== "board") return;
    if (boardSnapshotCoversToday()) return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });

    liveSlate.forEach(game => {
      const phase = getBoardGamePhase(game.gamePk);
      if (phase === "upcoming") return;

      // Allow re-locking if batter tabs are still empty (hitting logs may have arrived late)
      const existing = lockedBoardCandidates[game.gamePk];
      const batterLocked  = existing?.hits?.length > 0 || existing?.hr?.length > 0;
      const pitcherLocked = existing?.k?.length   > 0 || existing?.outs?.length > 0;
      if (batterLocked && pitcherLocked) return; // fully locked — nothing to do

      // Use activeSlate (enriched) so game.pitcher/awayPitcher are correct for platoon splits
      const newEntry = {
        hits: batterLocked  ? (existing?.hits ?? []) :
              computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits)
                .filter(c => String(c.gamePk) === String(game.gamePk)),
        hr:   batterLocked  ? (existing?.hr ?? []) :
              computeBatterBoard("hr", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits)
                .filter(c => String(c.gamePk) === String(game.gamePk)),
        k:    pitcherLocked ? (existing?.k ?? []) :
              computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats)
                .filter(c => String(c.gamePk) === String(game.gamePk)),
        outs: pitcherLocked ? (existing?.outs ?? []) :
              computePitcherBoard("outs", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats)
                .filter(c => String(c.gamePk) === String(game.gamePk)),
      };

      // Only commit when we have genuinely new content — avoids re-writing identical empty arrays
      const hasNewBatters  = !batterLocked  && (newEntry.hits.length > 0 || newEntry.hr.length > 0);
      const hasNewPitchers = !pitcherLocked && (newEntry.k.length   > 0 || newEntry.outs.length > 0);
      if (!hasNewBatters && !hasNewPitchers) return;

      // ── Persist newly-locked cards to backend for backtesting (fire-and-forget) ──
      if (!IS_SANDBOX) {
        const tierFromScore = (s) => (s == null ? "mid" : s >= 75 ? "high" : s >= 55 ? "mid" : "low");
        const leanFromScore = (s) => ((s ?? 0) >= 55 ? "over" : "under");
        const bookLineFromCard = (c) => {
          const v = c.propLine?.books?.DK?.line ?? c.propLine?.books?.FD?.line ?? c.propLine?.books?.CZR?.line
            ?? c.propLine?.line ?? c.suggestedLine;
          return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
        };
        const enrich = (c, market) => ({
          ...c,
          market,
          lean: leanFromScore(c.score),
          scoreTier: tierFromScore(c.score),
          bookLine: bookLineFromCard(c),
        });
        const newlyLocked = [];
        if (hasNewBatters) {
          newlyLocked.push(...newEntry.hits.map(c => enrich(c, "hits")), ...newEntry.hr.map(c => enrich(c, "hr")));
        }
        if (hasNewPitchers) {
          newlyLocked.push(...newEntry.k.map(c => enrich(c, "k")), ...newEntry.outs.map(c => enrich(c, "outs")));
        }
        if (newlyLocked.length > 0) {
          fetch(`${API_BASE}/api/board-snapshot`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ slateDate: today, cards: newlyLocked }),
          }).catch(() => {}); // never block or error the lock
        }
      }

      setLockedBoardCandidates(prev => {
        const updated = { ...prev, [game.gamePk]: newEntry };
        localStorage.setItem("board_locked_snapshot", JSON.stringify({ date: today, candidates: updated }));
        return updated;
      });
    });
  }, [liveSlate, view, liveLineups, liveHittingLog, boardSnapshotCoversToday]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock game board candidates when a game goes live — prevents rankings shifting mid-game.
  useEffect(() => {
    if (!liveSlate || view !== "board") return;
    if (boardSnapshotCoversToday()) return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });

    liveSlate.forEach(game => {
      const phase = getBoardGamePhase(game.gamePk);
      if (phase === "upcoming") return;
      if (lockedGameBoardCandidates[game.gamePk]) return;

      const SUB_TABS = ["nrfi", "total", "spread", "ml", "f5ml", "f5spread"];
      const entry = {};
      SUB_TABS.forEach(sub => {
        const all = computeGameBoard(sub, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, blendedPitcherStatsForGameBoard, liveUmpires);
        entry[sub] = all.find(c => String(c.gamePk) === String(game.gamePk)) ?? null;
      });

      if (!Object.values(entry).some(v => v !== null)) return;

      setLockedGameBoardCandidates(prev => {
        const updated = { ...prev, [game.gamePk]: entry };
        localStorage.setItem(
          "game_board_locked_snapshot",
          JSON.stringify({ date: today, candidates: updated })
        );
        return updated;
      });
    });
  }, [liveSlate, view, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, blendedPitcherStatsForGameBoard, liveUmpires]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view !== "model" || !topSlatePicks.length) return;
    const modelRequests = topSlatePicks.slice(0, 12).map(buildModelSummaryRequest);
    let cancelled = false;
    void (async () => {
      await hydrateCardSummaries(modelRequests);
      if (cancelled) return;
      const premiumModel = modelRequests.filter(r => (r.score ?? 0) >= 75);
      if (premiumModel.length) await hydrateCardSummaries(premiumModel, { premium: true });
    })();
    return () => { cancelled = true; };
  }, [view, topSlatePicks, hydrateCardSummaries]);

  const QUICK_CHIPS = [
    "Build me a 3-leg parlay",
    "Best K props tonight",
    "Best hits props tonight",
    "Top plays across all markets",
    "Any injury alerts?",
  ];

  const openGame = (id) => { setSelectedId(id); setView("game"); setTab("overview"); setLineupSide("away"); setExpandedBatter(null); setPitcherSide("home"); setArsenalSide("home"); setParlayLabels([]); setParlaySlipCopied(false); };

  const handleChatSend = async (messageOverride) => {
    const message = messageOverride ?? chatInput.trim();
    if (!message || chatLoading || chatMessagesLeft <= 0) return;

    const userMsg = { role: "user", content: message };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);

    const historyPayload = newHistory.slice(-10).map((entry) => ({ role: entry.role, content: entry.content }));

    // Build board context from AI Board data — top 6 per market, ranked by aiScore
    const boardCandidates = (() => {
      const source = aiBoardData ?? [];
      if (!source.length) return [];
      const markets = ["k", "outs", "hits", "hr", "f5ml"];
      return markets.flatMap(mkt =>
        source
          .filter(c => c.market === mkt)
          .sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))
          .slice(0, 6)
          .map(c => ({
            market:    c.market,
            name:      c.name ?? c.playerName ?? null,
            team:      c.team ?? null,
            gameLabel: c.gameLabel ?? null,
            gamePk:    c.gamePk ?? null,
            aiScore:   c.aiScore ?? null,
            aiReason:  c.aiReason ?? null,
            bookLine:  c.bookLine ?? null,
            lean:      c.lean ?? null,
            stats:     c.stats ?? {},
          }))
      );
    })();

    try {
      const data = await apiMutate("/api/chat", "POST", {
        message,
        history: historyPayload.slice(0, -1),
        boardCandidates: boardCandidates.length ? boardCandidates : undefined,
      });
      const assistantMsg = {
        role: "assistant",
        content: data.response,
        confidence: data.confidence,
        confidenceLabel: data.confidenceLabel,
        signals: data.signals ?? [],
        webSearched: data.webSearched ?? false,
      };
      setChatHistory((prev) => [...prev, assistantMsg]);
      setChatMessagesLeft(Math.max(0, (data.maxMessagesPerDay ?? 30) - (data.messagesUsedToday ?? 0)));
    } catch (err) {
      setChatError(err.message ?? "Something went wrong");
      setChatHistory((prev) => prev.slice(0, -1));
    } finally {
      setChatLoading(false);
    }
  };

  async function fetchLabData(force = false) {
    if (labLoading) return;
    if (force) setLabData(null);
    setLabLoading(true);
    try {
      const data = await apiFetch("/api/model/f5");
      setLabData(data);
    } catch (err) {
      console.error("Lab fetch failed:", err);
      setLabData({ date: null, games: [], error: err.message ?? "Failed to load Lab model" });
    } finally {
      setLabLoading(false);
    }
  }

  async function fetchLabFgData(force = false) {
    if (labFgLoading) return;
    if (force) setLabFgData(null);
    setLabFgLoading(true);
    try {
      const data = await apiFetch("/api/model/fullgame");
      setLabFgData(data);
    } catch (err) {
      console.error("Full-game Lab fetch failed:", err);
      setLabFgData({ date: null, games: [], error: err.message ?? "Failed to load full-game Lab model" });
    } finally {
      setLabFgLoading(false);
    }
  }

  async function fetchLabKData(force = false) {
    if (labKLoading) return;
    if (force) setLabKData(null);
    setLabKLoading(true);
    try {
      const data = await apiFetch("/api/model/kprop");
      setLabKData(data);
    } catch (err) {
      console.error("Lab K data error:", err);
      setLabKData({ date: null, games: [], error: err.message ?? "Failed to load Lab K model" });
    } finally {
      setLabKLoading(false);
    }
  }

  async function fetchLabTotalsData(force = false) {
    if (labTotalsLoading) return;
    if (force) setLabTotalsData(null);
    setLabTotalsLoading(true);
    try {
      const data = await apiFetch("/api/model/totals");
      setLabTotalsData(data);
    } catch (err) {
      console.error("Lab totals error:", err);
      setLabTotalsData({ date: null, games: [], error: err.message ?? "Failed to load Lab totals model" });
    } finally {
      setLabTotalsLoading(false);
    }
  }

  async function fetchLabCalibration() {
    if (labCalibrationLoading) return;
    setLabCalibrationLoading(true);
    try {
      const data = await apiFetch("/api/model/calibration");
      setLabCalibration(data);
    } catch (err) {
      console.error("Lab calibration fetch failed:", err);
    } finally {
      setLabCalibrationLoading(false);
    }
  }

  // ── Lab card boxscore grading (display only) ───────────────────────────────
  const computeLabF5MlGrade = (pick, box) => {
    if (!box?.isFinal) return null;
    const innings = box.linescore?.innings ?? [];
    if (innings.length < 5) return null;
    const f5Away = innings.slice(0, 5).reduce((sum, inn) => sum + (inn?.away ?? 0), 0);
    const f5Home = innings.slice(0, 5).reduce((sum, inn) => sum + (inn?.home ?? 0), 0);
    if (f5Away === f5Home) return null;
    const lean = (pick.lean ?? "").toUpperCase();
    const leanWon = lean === "HOME" ? f5Home > f5Away : lean === "AWAY" ? f5Away > f5Home : null;
    if (leanWon == null) return null;
    return leanWon ? "hit" : "miss";
  };
  const computeLabFgMlGrade = (pick, box) => {
    if (!box?.isFinal) return null;
    const awayRuns = box?.linescore?.away?.runs;
    const homeRuns = box?.linescore?.home?.runs;
    if (!Number.isFinite(awayRuns) || !Number.isFinite(homeRuns)) return null;
    if (awayRuns === homeRuns) return null;
    const lean = (pick.lean ?? "").toUpperCase();
    const leanWon = lean === "HOME" ? homeRuns > awayRuns : lean === "AWAY" ? awayRuns > homeRuns : null;
    if (leanWon == null) return null;
    return leanWon ? "hit" : "miss";
  };
  const computeLabKPropGrade = (pick, box) => {
    if (!box?.isFinal) return null;
    const pitcherSide = pick.pitcherSide;
    const lastName = (pick.pitcherLastName ?? "").toLowerCase();
    const pitcherBox = Object.values(box?.pitching?.[pitcherSide] ?? {})
      .find(p => (p?.name ?? "").toLowerCase().includes(lastName));
    const actualKs = pitcherBox?.so ?? pitcherBox?.k ?? null;
    if (actualKs == null || pick.bookLine == null) return null;
    if (actualKs === pick.bookLine) return null;
    return (pick.leanSide === "OVER" ? actualKs > pick.bookLine : actualKs < pick.bookLine) ? "hit" : "miss";
  };
  const computeLabTotalsGrade = (pick, box) => {
    if (!box?.isFinal) return null;
    const awayRuns = box?.linescore?.away?.runs;
    const homeRuns = box?.linescore?.home?.runs;
    if (!Number.isFinite(awayRuns) || !Number.isFinite(homeRuns)) return null;
    const actualTotal = awayRuns + homeRuns;
    if (pick.bookTotal == null) return null;
    if (actualTotal === pick.bookTotal) return null;
    return (pick.leanSide === "OVER" ? actualTotal > pick.bookTotal : actualTotal < pick.bookTotal) ? "hit" : "miss";
  };

  const saveNote = (key, text) => {
    setNoteSaveState("saving");
    apiMutate(`/api/notes/${key}`, "POST", { note: text })
      .then(() => { setNoteSaveState("saved"); setTimeout(() => setNoteSaveState(null), 2000); })
      .catch(() => setNoteSaveState(null));
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

    // Build ordered list of all 5 target books that have a line posted.
    // Preferred book (default: DK) always floats to front.
    const bookOrder = [preferredBook, ...["DK","FD","CZR","MGM","BOV"].filter(b => b !== preferredBook)];
    const allBooks = bookOrder
      .map(bk => ({ book: bk, ...books[bk] }))
      .filter(b => b.line != null);
    if (!allBooks.length) return null;

    // Best line = lowest (most favorable for over bettors)
    const best = allBooks.reduce((a, b) => a.line <= b.line ? a : b);

    // Sharp (DK/FD) vs square (CZR/MGM) gap signal
    const sharpLines  = allBooks.filter(b => ["DK","FD"].includes(b.book)).map(b => b.line);
    const squareLines = allBooks.filter(b => ["CZR","MGM","BOV"].includes(b.book)).map(b => b.line);
    const sharpAvg    = sharpLines.length  ? sharpLines.reduce((s,v)=>s+v,0)/sharpLines.length   : null;
    const squareAvg   = squareLines.length ? squareLines.reduce((s,v)=>s+v,0)/squareLines.length : null;
    const gap         = (sharpAvg !== null && squareAvg !== null) ? +(squareAvg - sharpAvg).toFixed(2) : null;

    return {
      book:     best.book,
      line:     best.line,
      overOdds: best.overOdds,
      allBooks,
      gap,
      hasEdge:  gap !== null && gap >= 0.5,
    };
  };

  // ── Live book-line hydration for AI Board / Predict cards ──────────────────
  // Snapshot bookLine may be null if props weren't loaded at snapshot time.
  // This falls back to livePlayerProps at render time (same data getBookLine uses).
  const AI_MARKET_TO_PROP = {
    k:    "pitcher_strikeouts",
    outs: "pitcher_outs",
    hr:   "batter_home_runs",
    hits: "batter_hits",
  };
  const getAiBookLine = (c) => {
    if (c.bookLine != null) return c.bookLine; // snapshot already has it
    const apiMarket = AI_MARKET_TO_PROP[c.market];
    if (!apiMarket) return null;
    const props = livePlayerProps[String(c.gamePk)]?.props ?? [];
    const lastName = (c.name ?? "").split(" ").pop().toLowerCase();
    if (!lastName) return null;
    const match = props.find(pr =>
      pr.market === apiMarket &&
      (pr.player ?? "").toLowerCase().includes(lastName)
    );
    if (!match) return null;
    const allLines = Object.values(match.books ?? {}).map(b => b.line).filter(l => l != null);
    if (!allLines.length) return null;
    // Return the consensus line (lowest = most favorable for over)
    return Math.min(...allLines);
  };

  // ── Convergence: does the Daily Card's Official Card mention this Model Pick? ──
  // Two-factor match: pitcher last name + market type (K or Outs).
  // Both must match to avoid false positives from common last names.
  const cardMatchesPick = (pick) => {
    if (!dailyCard || dailyCard === "loading" || !dailyCard.card) return false;
    const raw       = dailyCard.card ?? "";
    const re        = /(?:^|\n)\d+\.\s*OFFICIAL CARD[^\n]*\n([\s\S]*?)(?=\n\d+\.|$)/i;
    const officialRaw = (raw.match(re)?.[1] ?? "").trim();
    if (!officialRaw) return false;

    const lastName = (pick.fullName ?? "").split(" ").pop().toLowerCase();
    if (!lastName || lastName.length < 3) return false;

    // Market keyword guard — K prop vs Outs prop
    const mktRe = pick.propType === "K"
      ? /\bk\b|strikeout/i
      : /\bouts?\b|\bip\b|innings/i;

    return officialRaw.split("\n").some(line => {
      const l = line.toLowerCase();
      return l.includes(lastName) && mktRe.test(line);
    });
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
          const mv = (() => {
            if (!bookLine) {
              const ppState = livePlayerProps[String(p.gamePk)];
              if (!ppState || ppState === "loading") return { status: "ODDS_PULL_FAILED",    label: "Checking Odds…",    color: "#4b5563", icon: "⟳" };
              return                                        { status: "MARKET_UNAVAILABLE",  label: "Odds Unavailable", color: "#4b5563", icon: "—" };
            }
            const diff      = Math.abs((p.modelLine ?? 0) - bookLine.line);
            const bookCount = bookLine.allBooks?.length ?? 0;
            if (diff === 0)    return { status: "MARKET_MATCHED",    label: "Verified Market",   color: "#22c55e", icon: "✓", diff, bookCount };
            if (diff <= 1.0)   return { status: "MARKET_NEARBY",     label: "Alt Line",          color: "#f59e0b", icon: "~", diff, bookCount };
            return                    { status: "MARKET_MISMATCH",   label: "Projection Mismatch",  color: "#ef4444", icon: "⚠", diff, bookCount };
          })();
          const result = liveBoardResults[p.pitcherId ?? p.playerId ?? p.id] ?? null;
          const isResolved = !!result && !result.live;
          const modelHit = isResolved && (
            (p.propType === "K" || p.market === "pitcher_strikeouts")
              ? (p.lean === "UNDER" ? result.k < p.modelLine : result.k > p.modelLine)
              : (p.lean === "UNDER" ? result.outs < p.modelLine : result.outs > p.modelLine)
          );
          const modelSummaryRequest = buildModelSummaryRequest(p);
          const gameStatus = (() => {
            const g = (activeSlate ?? []).find(game => (game.gamePk ?? game.id) === p.gamePk);
            const status = g?.status ?? "";
            if (status === "In Progress" || status === "Warmup") return "LIVE";
            if (status === "Final" || status === "Game Over") return "FINAL";
            return null;
          })();
          // Only show red border (miss) once game is final — never mid-game
          const resultCardStyle = resultBorderStyle(
            isResolved ? (modelHit ? "#22c55e" : (gameStatus === "FINAL" ? "#ef4444" : null)) : null
          );
          const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
          const pickPlayerId = String(p.pitcherId ?? p.playerId ?? p.id ?? p.gamePk);
          const pickMarket = (p.propType === "K" || p.market === "pitcher_strikeouts") ? "k" : "outs";
          const pickId = `${currentUser?.userId ?? currentUser?.username}:${pickPlayerId}:${pickMarket}:${today}`;
          const isPickLogged = loggedPickIds.has(pickId);
          const isGameDone = gameStatus === "LIVE" || gameStatus === "FINAL";
          const handleModelAddPick = () => {
            if (!currentUser || isGameDone || isPickLogged) return;
            openAddPickSheet({
              playerId: pickPlayerId,
              playerName: p.label,
              gameLabel: p.game ?? "",
              market: pickMarket,
              side: (p.lean ?? "OVER").toLowerCase(),
              bookLine: bookLine?.line ?? null,
              source: "model",
            });
          };
          return (
            <div key={i} style={{ position: "relative", background: "#0f1020", border: `1px solid ${borderColor}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6, ...resultCardStyle }}>
              <button
                onClick={handleModelAddPick}
                style={{
                  position: "absolute", bottom: 6, right: 8,
                  width: 18, height: 18, borderRadius: "50%",
                  fontSize: 12, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: isPickLogged
                    ? "1px solid rgba(59,130,246,0.4)"
                    : isGameDone
                      ? "1px solid rgba(55,65,81,0.4)"
                      : "1px solid rgba(107,114,128,0.4)",
                  background: "transparent",
                  color: isPickLogged ? "#3b82f6" : isGameDone ? "#374151" : "#6b7280",
                  cursor: isPickLogged ? "not-allowed" : isGameDone ? "default" : "pointer",
                }}
                title={isPickLogged ? "Already logged" : isGameDone ? "Game started" : "Log pick"}
              >
                {isPickLogged ? "✓" : "+"}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <div
                  style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                  onClick={() => { openGame(p.gamePk); setTab("props"); }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb" }}>{p.label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                    <span style={{ fontSize: 9, color: "#6b7280" }}>{p.game}</span>
                    <TierBadge tier="algorithmic" />
                    {p.lineupConfirmed && <span style={{ fontSize: 8, color: "#22c55e", fontWeight: 700 }}>✓ LINEUP</span>}
                    <GameStatusBadge status={gameStatus} />
                    {isResolved && modelHit && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 4, padding: "1px 6px" }}>✓ HIT</span>
                    )}
                    {cardMatchesPick(p) && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: "#818cf8", background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.4)", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.03em" }}>✦ CARD AGREES</span>
                    )}
                    {isResolved && !modelHit && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>✗ MISS</span>
                    )}
                    {p.avgIP < 5.0 && <span style={{ fontSize: 8, color: "#ef4444", fontWeight: 700 }}>⚠ LOW IP</span>}
                  </div>
                </div>
                {p.lineSource && (
                  <span style={{ fontSize: 7, fontWeight: 800, color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace", letterSpacing: "0.04em", flexShrink: 0 }}>{p.lineSource}</span>
                )}
                <LeanBadge label={p.lean} positive={p.positive} small />
                <div style={{ fontSize: 13, fontWeight: 800, color: tierColor, fontFamily: "monospace", minWidth: 34, textAlign: "right" }}>{p.confidence}%</div>
              </div>

              {bookLine && (
                <div style={{ marginBottom: 6, padding: "6px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 6, border: `1px solid ${bookLine.hasEdge ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.05)"}` }}>
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: "#4b5563", letterSpacing: "0.05em" }}>LINES</span>
                    {bookLine.hasEdge && (
                      <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 3, padding: "1px 5px", marginLeft: 6 }}>
                        ⬆ SHARP {bookLine.gap > 0 ? "−" : "+"}{Math.abs(bookLine.gap)}
                      </span>
                    )}
                    {p.projectedValue != null && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                        <TierBadge tier="projection" />
                        <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280" }}>Est. {p.projectedValue}</span>
                      </span>
                    )}
                  </div>
                  {/* Per-book grid */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {bookLine.allBooks.map(b => {
                      const isSharp     = ["DK","FD"].includes(b.book);  // BOV = square
                      const isBest      = b.line === bookLine.line;
                      const isPreferred = b.book === preferredBook;
                      return (
                        <div key={b.book} style={{ display: "flex", flexDirection: "column", alignItems: "center", background: isBest ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${isBest ? "rgba(34,197,94,0.35)" : isPreferred ? "rgba(251,191,36,0.4)" : isSharp ? "rgba(129,140,248,0.25)" : "rgba(255,255,255,0.06)"}`, borderRadius: 5, padding: "3px 8px", minWidth: 44 }}>
                          <span style={{ fontSize: 7, fontWeight: 700, color: isPreferred ? "#fbbf24" : isSharp ? "#818cf8" : "#4b5563", letterSpacing: "0.06em" }}>{isPreferred ? `★ ${b.book}` : b.book}</span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: isBest ? "#22c55e" : "#f9fafb", fontFamily: "monospace" }}>{b.line}</span>
                          <span style={{ fontSize: 8, color: "#6b7280", fontFamily: "monospace" }}>{b.overOdds ?? "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Market Validation Badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: mv.status !== "ODDS_PULL_FAILED" ? 6 : 0, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                  color: mv.color,
                  background: `${mv.color}18`,
                  border: `1px solid ${mv.color}44`,
                  fontFamily: "monospace",
                  letterSpacing: "0.04em"
                }}>
                  {mv.icon} {mv.label}
                  {mv.status === "MARKET_MATCHED" && mv.bookCount > 0 && ` · ${mv.bookCount} book${mv.bookCount > 1 ? "s" : ""}`}
                  {mv.status === "MARKET_NEARBY"  && ` · Model: ${p.modelLine} · Books: ${bookLine?.line}`}
                  {mv.status === "MARKET_MISMATCH" && ` · Model: ${p.modelLine} · Books: ${bookLine?.line}`}
                </span>
                {mv.status === "MARKET_MATCHED" && bookLine?.overOdds && (
                  <span style={{ fontSize: 8, color: "#6b7280", fontFamily: "monospace" }}>
                    Best: {bookLine.book} {bookLine.overOdds}
                  </span>
                )}
                {mv.status === "MARKET_NEARBY" && (
                  <span style={{ fontSize: 8, color: "#6b7280", fontStyle: "italic" }}>Check before betting</span>
                )}
                {mv.status === "MARKET_MISMATCH" && (
                  <span style={{ fontSize: 8, color: "#6b7280", fontStyle: "italic" }}>Not directly actionable</span>
                )}
              </div>

              {(() => {
                const summaryText = getCardSummaryText(modelSummaryRequest);
                const isPremium = !!aiCardSummaries[`premium:${modelSummaryRequest?.id}`];
                if (!summaryText) return null;
                return (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 6 }}>
                    {isPremium && (
                      <span style={{ fontSize: 8, color: "#a78bfa", fontFamily: "monospace", fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✦</span>
                    )}
                    <div style={{ fontSize: 10, color: "#d1d5db", lineHeight: 1.5, fontStyle: "italic" }}>{summaryText}</div>
                  </div>
                );
              })()}

              {p.signals?.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  {p.signals.map((s, si) => (
                    <div key={si} style={{ fontSize: 9, color: "#6b7280", lineHeight: 1.5 }}>· {s}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

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
      if (p.propType === "Outs" || p.market === "pitcher_outs") {
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
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f9fafb", letterSpacing: "0.05em" }}>CHALK THAT</div>
              <div style={{ fontSize: 10, color: "#4b5563", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>AI Props Research</div>
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

  const isNarrowPhone = windowWidth <= 430;

  return (
    <>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } body { background: #0e0f1a; } ::-webkit-scrollbar { width: 4px; height: 4px; } ::-webkit-scrollbar-thumb { background: #374151; border-radius: 2px; }`}</style>
      <div style={{ background: "#0e0f1a", minHeight: "100vh", color: "#e5e7eb", fontFamily: "monospace", maxWidth: 960, margin: "0 auto", padding: windowWidth > 640 ? "20px 24px 64px" : isNarrowPhone ? "14px 12px 44px" : "16px 14px 48px" }}>

        {/* ── APP HEADER ── */}
        <div style={{ display: "flex", flexDirection: isNarrowPhone ? "column" : "row", justifyContent: "space-between", alignItems: isNarrowPhone ? "flex-start" : "center", gap: isNarrowPhone ? 10 : 0, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: isNarrowPhone ? 10 : 11, color: "#6b7280", letterSpacing: "0.1em" }}>AI PROPS RESEARCH</div>
            <div
              style={{ fontSize: isNarrowPhone ? 18 : 20, lineHeight: 1.05, fontWeight: 800, color: "#f9fafb", cursor: "default", userSelect: "none" }}
              onClick={() => {
                const next = logoClicks + 1;
                setLogoClicks(next);
                if (next >= 7) {
                  setResearchMode(true);
                  setLogoClicks(0);
                }
              }}
            >⚾ Chalk That</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, width: isNarrowPhone ? "100%" : "auto" }}>
            <button onClick={() => setView("slate")} style={{ background: view === "slate" ? "#22c55e" : "#161827", border: `1px solid ${view === "slate" ? "#22c55e" : "#1f2437"}`, borderRadius: 8, padding: isNarrowPhone ? "6px 10px" : "6px 12px", fontSize: isNarrowPhone ? 9 : 10, color: view === "slate" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Slate</button>
            <button onClick={() => setView("game")}  style={{ background: view === "game"  ? "#22c55e" : "#161827", border: `1px solid ${view === "game"  ? "#22c55e" : "#1f2437"}`, borderRadius: 8, padding: isNarrowPhone ? "6px 10px" : "6px 12px", fontSize: isNarrowPhone ? 9 : 10, color: view === "game"  ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Game</button>
            <button onClick={() => setView("model")} style={{ background: view === "model" ? "#fbbf24" : "#161827", border: `1px solid ${view === "model" ? "#fbbf24" : "#1f2437"}`, borderRadius: 8, padding: isNarrowPhone ? "6px 10px" : "6px 12px", fontSize: isNarrowPhone ? 9 : 10, color: view === "model" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>🎯 Model</button>
            {isChatUser && (
              <button onClick={() => setView("chat")} style={{ background: view === "chat" ? "#a78bfa" : "#161827", border: `1px solid ${view === "chat" ? "#a78bfa" : "#1f2437"}`, borderRadius: 8, padding: isNarrowPhone ? "6px 10px" : "6px 12px", fontSize: isNarrowPhone ? 9 : 10, color: view === "chat" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>💬 Chat</button>
            )}
            <button onClick={() => setView("board")} style={{ background: view === "board" ? "#fbbf24" : "#161827", border: `1px solid ${view === "board" ? "#fbbf24" : "#1f2437"}`, borderRadius: 8, padding: isNarrowPhone ? "6px 10px" : "6px 12px", fontSize: isNarrowPhone ? 9 : 10, color: view === "board" ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Board</button>
            {isScoutUser && (
              <button
                onClick={() => setView("ai-board")}
                style={{
                  background: view === "ai-board" ? "#a78bfa" : "#161827",
                  border: `1px solid ${view === "ai-board" ? "#a78bfa" : "#1f2437"}`,
                  borderRadius: 8,
                  padding: isNarrowPhone ? "6px 10px" : "6px 12px",
                  fontSize: isNarrowPhone ? 9 : 10,
                  color: view === "ai-board" ? "#000" : "#9ca3af",
                  fontFamily: "monospace",
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                🤖 AI Board
              </button>
            )}
            {isScoutUser && (
              <button
                onClick={() => setView("scout")}
                style={{
                  background: view === "scout" ? "#22c55e" : "#161827",
                  border: `1px solid ${view === "scout" ? "#22c55e" : "#1f2437"}`,
                  borderRadius: 8,
                  padding: isNarrowPhone ? "6px 10px" : "6px 12px",
                  fontSize: isNarrowPhone ? 9 : 10,
                  color: view === "scout" ? "#000" : "#9ca3af",
                  fontFamily: "monospace",
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                🎯 Scout
              </button>
            )}
            {isScoutUser && (
              <button
                onClick={() => setView("predict")}
                style={{
                  background: view === "predict" ? "#fbbf24" : "#161827",
                  border: `1px solid ${view === "predict" ? "#fbbf24" : "#1f2437"}`,
                  borderRadius: 8,
                  padding: isNarrowPhone ? "6px 10px" : "6px 12px",
                  fontSize: isNarrowPhone ? 9 : 10,
                  color: view === "predict" ? "#000" : "#9ca3af",
                  fontFamily: "monospace",
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                ⚡ Predict
              </button>
            )}
            {currentUser && (
              <button
                onClick={() => setView("picks")}
                style={{
                  background: view === "picks" ? "#3b82f6" : "#161827",
                  border: `1px solid ${view === "picks" ? "#3b82f6" : "#1f2437"}`,
                  borderRadius: 8,
                  padding: isNarrowPhone ? "6px 10px" : "6px 12px",
                  fontSize: isNarrowPhone ? 9 : 10,
                  color: view === "picks" ? "#fff" : "#9ca3af",
                  fontFamily: "monospace",
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                📋 Picks
              </button>
            )}
          </div>
        </div>

        {researchMode && (view === "slate" || view === "research-perf") && (
          <div style={{ display: "flex", flexDirection: isNarrowPhone ? "column" : "row", alignItems: isNarrowPhone ? "stretch" : "center", gap: 8, background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#a78bfa", fontFamily: "monospace", letterSpacing: "0.08em", flexShrink: 0 }}>📅 RESEARCH</span>
              <button
                onClick={() => setView("slate")}
                style={{ background: view === "slate" ? "#a78bfa" : "#1a1c2e", border: `1px solid ${view === "slate" ? "#a78bfa" : "#2d3148"}`, borderRadius: 6, padding: "4px 10px", fontSize: 10, color: view === "slate" ? "#000" : "#f9fafb", cursor: "pointer", fontFamily: "monospace", fontWeight: 700 }}
              >
                Slate
              </button>
              <button
                onClick={() => setView("research-perf")}
                style={{ background: view === "research-perf" ? "#a78bfa" : "#1a1c2e", border: `1px solid ${view === "research-perf" ? "#a78bfa" : "#2d3148"}`, borderRadius: 6, padding: "4px 10px", fontSize: 10, color: view === "research-perf" ? "#000" : "#f9fafb", cursor: "pointer", fontFamily: "monospace", fontWeight: 700 }}
              >
                📊 Performance
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
              <button
                onClick={() => {
                  const base = slateDate ? new Date(slateDate + "T12:00:00") : new Date();
                  base.setDate(base.getDate() - 1);
                  setSlateDate(base.toISOString().slice(0, 10));
                }}
                style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "4px 10px", fontSize: 13, color: "#f9fafb", cursor: "pointer" }}
              >
                ◀
              </button>
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
                style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "4px 10px", fontSize: 13, color: "#f9fafb", cursor: "pointer" }}
              >
                ▶
              </button>
              <button
                onClick={() => { setSlateDate(null); setResearchMode(false); setLogoClicks(0); setView("slate"); }}
                style={{ background: "transparent", border: "none", fontSize: 11, color: "#6b7280", cursor: "pointer", fontFamily: "monospace", flexShrink: 0 }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════
            SLATE VIEW
        ════════════════════════════════════ */}
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

          <SLabel>{slateDate ? `Slate — ${slateDate}` : "Today's Slate"} — {activeSlate.length} Games{!IS_STATS_SANDBOX && !slateLoading && liveSlate?.length ? " · LIVE" : !IS_STATS_SANDBOX && slateLoading ? " · Loading…" : ""}</SLabel>
          {slateLoading && liveSlate === null && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
              <div style={{ width: 18, height: 18, border: "2px solid #1f2437", borderTop: "2px solid #22c55e", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#6b7280" }}>Fetching today's slate…</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }`}</style>
            </div>
          )}
          {!IS_STATS_SANDBOX && !slateLoading && liveSlate === null && scheduleError && (
            <Card>
              <div style={{ padding: "16px 0", fontSize: 11, color: "#ef4444", lineHeight: 1.5 }}>
                Could not load today&apos;s slate: {scheduleError}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSlateLoading(true);
                  setScheduleError(null);
                  apiFetch(slateDate ? `/api/slate?date=${slateDate}` : "/api/slate")
                    .then(bundle => {
                      const games = Array.isArray(bundle?.schedule) ? bundle.schedule : (Array.isArray(bundle) ? bundle : []);
                      setLiveSlate(Array.isArray(games) ? games : []);
                      if (bundle?.oddsMap) setLiveOddsMap(bundle.oddsMap);
                      if (bundle?.nrfiMap) setLiveNrfiData(bundle.nrfiMap);
                      if (bundle?.weatherMap) setLiveWeather(formatSlateWeatherMap(games, bundle.weatherMap));
                      if (bundle?.pitcherStatsMap) {
                        setLivePitcherStats(prev => ({ ...prev, ...bundle.pitcherStatsMap }));
                      }
                      if (games?.length > 0) setSelectedId(games[0].gamePk);
                    })
                    .catch(err => setScheduleError(err.message ?? "Slate unavailable"))
                    .finally(() => setSlateLoading(false));
                }}
                style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontFamily: "monospace" }}
              >
                Retry
              </button>
            </Card>
          )}
          {!IS_STATS_SANDBOX && !slateLoading && Array.isArray(liveSlate) && liveSlate.length === 0 && !scheduleError && (
            <Card>
              <div style={{ padding: "16px 0", fontSize: 11, color: "#6b7280" }}>No games on the slate for this date.</div>
            </Card>
          )}
          <div style={windowWidth > 640 ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } : {}}>
            {activeSlate.map(g => (
              <SlateCard key={g.id} game={g} selected={selectedId === g.id} onSelect={openGame} liveOddsMap={effectiveOddsMap}
                bestBet={topSlatePicks.find(p => p.gamePk === (g.gamePk ?? g.id)) ?? null}
                liveScore={liveScores[g.gamePk ?? g.id] ?? null}
                injuredIds={injuredIds}
                preferredBook={preferredBook} />
            ))}
          </div>
        </>)}

        {view === "research-perf" && researchMode && (() => {
          const MARKET_LABELS = {
            hr: { label: "Home Runs", icon: "🏠" },
            hits: { label: "Hits", icon: "🎯" },
            k: { label: "Strikeouts", icon: "🔥" },
            outs: { label: "Outs Recorded", icon: "🛑" },
          };
          const TIER_LABELS = {
            high: "HIGH (75+)",
            mid: "MID (55–74)",
            low: "LOW (<55)",
          };
          const marketOrder = ["hr", "hits", "k", "outs"];
          const tierOrder = ["high", "mid", "low"];
          const matrix = buildPerfMatrix(perfStats?.rows ?? []);
          const visibleMarkets = marketOrder.filter((market) =>
            tierOrder.some((tier) => (matrix[market]?.[tier]?.total ?? 0) > 0)
          );
          const overall = (perfStats?.rows ?? []).reduce((acc, row) => {
            acc.total += Number(row.total) || 0;
            acc.resolved += Number(row.resolved) || 0;
            acc.hits += Number(row.hits) || 0;
            acc.misses += Number(row.misses) || 0;
            return acc;
          }, { total: 0, resolved: 0, hits: 0, misses: 0 });
          const overallHitRate = overall.resolved > 0 ? (overall.hits / overall.resolved) * 100 : null;
          const pillStyle = (active) => ({
            background: active ? "#a78bfa" : "#161827",
            border: `1px solid ${active ? "#a78bfa" : "#1f2437"}`,
            borderRadius: 999,
            padding: "6px 12px",
            fontSize: 10,
            color: active ? "#000" : "#9ca3af",
            fontFamily: "monospace",
            fontWeight: 700,
            cursor: "pointer",
          });
          const fmtPct = (hits, resolved) => (resolved > 0 ? `${((hits / resolved) * 100).toFixed(1)}%` : "—");
          const barColor = (hitRate) => {
            if (hitRate == null) return "#374151";
            if (hitRate >= 60) return "#22c55e";
            if (hitRate >= 45) return "#f59e0b";
            return "#ef4444";
          };

          return (
            <div style={{ border: "1px solid rgba(167,139,250,0.25)", background: "rgba(167,139,250,0.04)", borderRadius: 14, padding: "14px 14px 16px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 10, color: "#a78bfa", letterSpacing: "0.08em", fontWeight: 800 }}>📊 PERFORMANCE</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>Historical board-card hit rates by market and score tier.</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => setPerfDays(7)} style={pillStyle(perfDays === 7)}>Last 7 days</button>
                  <button onClick={() => setPerfDays(30)} style={pillStyle(perfDays === 30)}>Last 30 days</button>
                  <button onClick={() => setPerfDays(0)} style={pillStyle(perfDays === 0)}>All Time</button>
                </div>
              </div>

              {perfStats === null && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
                  <div style={{ width: 18, height: 18, border: "2px solid #1f2437", borderTop: "2px solid #a78bfa", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>Loading performance data…</span>
                </div>
              )}

              {perfStats !== null && visibleMarkets.length === 0 && (
                <div style={{ background: "#0f1020", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 12px", color: "#9ca3af", fontSize: 11, lineHeight: 1.5 }}>
                  <div>No resolved picks found for this date range.</div>
                  <div>Snapshots are saved from the date board-snapshot persistence was deployed.</div>
                </div>
              )}

              {perfStats !== null && visibleMarkets.length > 0 && (
                <div style={{ display: "grid", gap: 12 }}>
                  {visibleMarkets.map((market) => {
                    const marketRows = tierOrder.map((tier) => ({ tier, ...matrix[market][tier] }));
                    const marketTotals = marketRows.reduce((acc, row) => {
                      acc.total += row.total;
                      acc.resolved += row.resolved;
                      acc.hits += row.hits;
                      acc.misses += row.misses;
                      return acc;
                    }, { total: 0, resolved: 0, hits: 0, misses: 0 });
                    const marketHitRate = marketTotals.resolved > 0 ? (marketTotals.hits / marketTotals.resolved) * 100 : null;

                    return (
                      <div key={market} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden", background: "#0f1020" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap" }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#f9fafb" }}>{MARKET_LABELS[market].icon} {MARKET_LABELS[market].label}</div>
                          <div style={{ fontSize: 10, color: "#9ca3af", display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <span>Total: {marketTotals.total}</span>
                            <span>Resolved: {marketTotals.resolved}</span>
                            <span>Hit Rate: {marketHitRate != null ? `${marketHitRate.toFixed(1)}%` : "—"}</span>
                          </div>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                <th style={{ textAlign: "left", padding: "9px 12px", fontSize: 9, color: "#6b7280", fontWeight: 800 }}>Tier</th>
                                <th style={{ textAlign: "right", padding: "9px 12px", fontSize: 9, color: "#6b7280", fontWeight: 800 }}>Picks</th>
                                <th style={{ textAlign: "right", padding: "9px 12px", fontSize: 9, color: "#6b7280", fontWeight: 800 }}>Resolved</th>
                                <th style={{ textAlign: "right", padding: "9px 12px", fontSize: 9, color: "#6b7280", fontWeight: 800 }}>Hits</th>
                                <th style={{ textAlign: "right", padding: "9px 12px", fontSize: 9, color: "#6b7280", fontWeight: 800 }}>Misses</th>
                                <th style={{ textAlign: "right", padding: "9px 12px", fontSize: 9, color: "#6b7280", fontWeight: 800 }}>Hit %</th>
                                <th style={{ textAlign: "left", padding: "9px 12px", fontSize: 9, color: "#6b7280", fontWeight: 800, minWidth: 140 }}>Bar</th>
                              </tr>
                            </thead>
                            <tbody>
                              {marketRows.map((row) => {
                                const hasPicks = row.total > 0;
                                const hitRate = row.resolved > 0 ? (row.hits / row.resolved) * 100 : null;
                                return (
                                  <tr key={row.tier} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                    <td style={{ padding: "10px 12px", fontSize: 11, color: "#f3f4f6", fontWeight: 700 }}>{TIER_LABELS[row.tier]}</td>
                                    <td style={{ padding: "10px 12px", fontSize: 11, color: "#d1d5db", textAlign: "right" }}>{hasPicks ? row.total : "—"}</td>
                                    <td style={{ padding: "10px 12px", fontSize: 11, color: "#d1d5db", textAlign: "right" }}>{hasPicks ? row.resolved : "—"}</td>
                                    <td style={{ padding: "10px 12px", fontSize: 11, color: "#22c55e", textAlign: "right" }}>{hasPicks ? row.hits : "—"}</td>
                                    <td style={{ padding: "10px 12px", fontSize: 11, color: "#ef4444", textAlign: "right" }}>{hasPicks ? row.misses : "—"}</td>
                                    <td style={{ padding: "10px 12px", fontSize: 11, color: "#f9fafb", textAlign: "right" }}>{hasPicks ? fmtPct(row.hits, row.resolved) : "—"}</td>
                                    <td style={{ padding: "10px 12px" }}>
                                      {hasPicks ? (
                                        <div style={{ width: "100%", height: 10, borderRadius: 999, background: "#111827", border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden" }}>
                                          <div style={{ width: `${Math.max(0, Math.min(100, hitRate ?? 0))}%`, height: "100%", background: barColor(hitRate) }} />
                                        </div>
                                      ) : (
                                        <span style={{ fontSize: 11, color: "#6b7280" }}>—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.16)", borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#d1d5db" }}>
                    Overall (resolved picks only): {overall.total} picked · {overall.resolved} resolved · {overall.hits} hits · {overallHitRate != null ? `${overallHitRate.toFixed(1)}% hit rate` : "—"}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ════════════════════════════════════
            MODEL VIEW
        ════════════════════════════════════ */}
        {view === "model" && (<>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <SLabel style={{ marginBottom: 0 }}>🎯 Model Picks</SLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TierBadge tier="algorithmic" small={false} />
              {topSlatePicks.length > 0 && (
                <span style={{ background: modelBoardHits > 0 ? "#22c55e" : "#374151", color: modelBoardHits > 0 ? "#03140a" : "#d1d5db", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 900, lineHeight: 1.2, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                  {modelBoardHits}/{topSlatePicks.length} hit
                </span>
              )}
              <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>{topSlatePicks.length} picks</span>
            </div>
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

        {view === "chat" && isChatUser && (
          <div style={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace", letterSpacing: "0.05em" }}>💬 CHAT RESEARCH</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>Smart slate assistant with injury, odds, props, and optional web context</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace", background: "rgba(255,255,255,0.04)", border: "1px solid #1f2437", borderRadius: 999, padding: "4px 8px" }}>
                  {chatMessagesLeft} left today
                </div>
                <button
                  onClick={() => { setChatHistory([]); setChatError(null); }}
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1f2437", borderRadius: 8, padding: "6px 10px", fontSize: 9, color: "#9ca3af", fontFamily: "monospace", cursor: "pointer" }}
                >
                  Clear
                </button>
              </div>
            </div>

            {chatHistory.length === 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {QUICK_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleChatSend(chip)}
                    disabled={chatLoading || chatMessagesLeft <= 0}
                    style={{ background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.28)", borderRadius: 999, padding: "7px 10px", fontSize: 9, color: "#c4b5fd", fontFamily: "monospace", fontWeight: 700, cursor: chatLoading || chatMessagesLeft <= 0 ? "default" : "pointer" }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {chatError && (
              <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#fca5a5" }}>
                {chatError}
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "#101220", border: "1px solid #1f2437", borderRadius: 14, padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
              {chatHistory.length === 0 ? (
                <div style={{ margin: "auto 0", textAlign: "center", color: "#6b7280", fontSize: 11, lineHeight: 1.7 }}>
                  Ask about today's slate, top K props, line movement, injury impact, or a specific pitcher/game.
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div key={`${msg.role}-${idx}`} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "85%",
                      background: msg.role === "user" ? "rgba(167,139,250,0.18)" : "#171a2b",
                      border: `1px solid ${msg.role === "user" ? "rgba(167,139,250,0.35)" : "#232840"}`,
                      borderRadius: 12,
                      padding: "10px 12px",
                    }}>
                      <div style={{ fontSize: 11, color: "#f3f4f6", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg.content}</div>
                      {msg.role === "assistant" && (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                            {msg.confidenceLabel && (
                              <span style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.28)", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#86efac", fontFamily: "monospace", fontWeight: 800 }}>
                                {msg.confidenceLabel}{typeof msg.confidence === "number" ? ` ${msg.confidence}%` : ""}
                              </span>
                            )}
                            {msg.webSearched && (
                              <span style={{ background: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.28)", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#7dd3fc", fontFamily: "monospace", fontWeight: 800 }}>
                                WEB
                              </span>
                            )}
                          </div>
                          {msg.signals?.length > 0 && (
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                              {msg.signals.map((signal, signalIdx) => (
                                <span key={signalIdx} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                  {signal}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{ background: "#171a2b", border: "1px solid #232840", borderRadius: 12, padding: "10px 12px", fontSize: 10, color: "#6b7280" }}>
                    Researching…
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#161827", border: "1px solid #1f2437", borderRadius: 14, padding: "10px" }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSend();
                  }
                }}
                placeholder={chatMessagesLeft > 0 ? "Ask Chalk That about today's slate..." : "Daily chat limit reached"}
                disabled={chatLoading || chatMessagesLeft <= 0}
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f9fafb", fontSize: 12, fontFamily: "monospace" }}
              />
              <button
                onClick={() => handleChatSend()}
                disabled={chatLoading || !chatInput.trim() || chatMessagesLeft <= 0}
                style={{ background: chatLoading || !chatInput.trim() || chatMessagesLeft <= 0 ? "#1f2437" : "#a78bfa", border: "1px solid transparent", borderRadius: 10, padding: "8px 12px", color: chatLoading || !chatInput.trim() || chatMessagesLeft <= 0 ? "#4b5563" : "#000", fontSize: 10, fontFamily: "monospace", fontWeight: 800, cursor: chatLoading || !chatInput.trim() || chatMessagesLeft <= 0 ? "default" : "pointer" }}
              >
                Send
              </button>
            </div>
          </div>
        )}

        {view === "lab" && isScoutUser && (() => {
          const isLabF5 = labSubTab === "f5ml";
          const isLabFullGame = labSubTab === "fullgame";
          const isLabKProp = labSubTab === "kprop";
          const isLabTotals = labSubTab === "totals";
          const activeLabData = isLabF5 ? labData : isLabFullGame ? labFgData : isLabKProp ? labKData : labTotalsData;
          const activeLabLoading = isLabF5 ? labLoading : isLabFullGame ? labFgLoading : isLabKProp ? labKLoading : labTotalsLoading;
          const refreshLab = () => (isLabF5 ? fetchLabData(true) : isLabFullGame ? fetchLabFgData(true) : isLabKProp ? fetchLabKData(true) : fetchLabTotalsData(true));
          const calibrationEntries = Array.isArray(labCalibration?.entries) ? labCalibration.entries : [];
          const combinedSummary = labCalibration?.summary?.combined ?? null;
          const labModelRows = [
            { key: "f5ml", title: "F5 ML", color: "#34d399", summary: labCalibration?.summary?.f5ml ?? null },
            { key: "fullgame", title: "Full-Game ML", color: "#a78bfa", summary: labCalibration?.summary?.fullgame ?? null },
            { key: "kprop", title: "K Prop", color: "#38bdf8", summary: labCalibration?.summary?.kprop ?? null },
            { key: "totals", title: "Totals", color: "#fbbf24", summary: labCalibration?.summary?.totals ?? null },
          ];
          const bestLabModelKey = labModelRows
            .filter(({ summary }) => (summary?.total ?? 0) > 0 && summary?.accuracy != null)
            .sort((a, b) => (b.summary?.accuracy ?? -1) - (a.summary?.accuracy ?? -1))[0]?.key ?? null;
          const edgeHits = combinedSummary?.edgeHits ?? 0;
          const edgeMisses = Math.max(0, (combinedSummary?.edgeTotal ?? 0) - edgeHits);
          const edgeRoi = (edgeHits * 100) - (edgeMisses * 110);
          const edgeRoiLabel = `${edgeRoi >= 0 ? "+" : "-"}$${Math.abs(edgeRoi).toLocaleString()}`;
          const settledPicks = combinedSummary?.total ?? 0;
          const calibrationBuckets = [
            { label: "50-54%", min: 0.50, max: 0.55 },
            { label: "55-64%", min: 0.55, max: 0.65 },
            { label: "65-74%", min: 0.65, max: 0.75 },
            { label: "75-84%", min: 0.75, max: 0.85 },
            { label: "85%+", min: 0.85, max: 1.01 },
          ];
          const getCalibrationSeries = (modelKey) => {
            const settled = calibrationEntries.filter((entry) =>
              entry?.model === modelKey &&
              (entry?.result === "HIT" || entry?.result === "MISS") &&
              typeof entry?.leanProb === "number" &&
              entry.leanProb >= 0.5
            );
            return calibrationBuckets.map((bucket) => {
              const rows = settled.filter((entry) => entry.leanProb >= bucket.min && entry.leanProb < bucket.max);
              const count = rows.length;
              const hits = rows.filter((entry) => entry.result === "HIT").length;
              const expectedPct = count ? (rows.reduce((sum, entry) => sum + ((entry.leanProb ?? 0) * 100), 0) / count) : null;
              const actualPct = count ? ((hits / count) * 100) : null;
              return { ...bucket, count, expectedPct, actualPct };
            });
          };
          const renderCalibrationCurve = (modelKey) => {
            const series = getCalibrationSeries(modelKey);
            const hasPoints = series.some((bucket) => bucket.count > 0);
            if (!hasPoints) {
              return (
                <div style={{ background: "#141726", border: "1px solid #1f2437", borderRadius: 8, padding: "10px 12px", fontSize: 9, color: "#6b7280" }}>
                  No settled picks yet for calibration buckets.
                </div>
              );
            }

            const svgWidth = 320;
            const svgHeight = 150;
            const left = 26;
            const right = 10;
            const top = 12;
            const bottom = 34;
            const chartWidth = svgWidth - left - right;
            const chartHeight = svgHeight - top - bottom;
            const barWidth = chartWidth / series.length;
            const yForPct = (pct) => top + chartHeight - ((pct / 100) * chartHeight);

            return (
              <div style={{ background: "#141726", border: "1px solid #1f2437", borderRadius: 8, padding: "8px 8px 4px", marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <div style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Calibration Curve</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 8, color: "#6b7280", fontFamily: "monospace" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, background: "#14b8a6", borderRadius: 2, display: "inline-block" }} /> actual</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, background: "#f9fafb", transform: "rotate(45deg)", display: "inline-block" }} /> expected</span>
                  </div>
                </div>
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: "100%", height: "auto", display: "block" }}>
                  <line x1={left} y1={yForPct(0)} x2={left + chartWidth} y2={yForPct(100)} stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4 4" />
                  {[0, 50, 100].map((pct) => (
                    <g key={pct}>
                      <line x1={left} y1={yForPct(pct)} x2={left + chartWidth} y2={yForPct(pct)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                      <text x={left - 6} y={yForPct(pct) + 3} textAnchor="end" fill="#4b5563" fontSize="8" fontFamily="monospace">{pct}</text>
                    </g>
                  ))}
                  {series.map((bucket, idx) => {
                    const cx = left + (idx * barWidth) + (barWidth / 2);
                    const rectWidth = Math.max(18, barWidth - 14);
                    const actualY = bucket.actualPct != null ? yForPct(bucket.actualPct) : yForPct(0);
                    const actualHeight = bucket.actualPct != null ? (top + chartHeight - actualY) : 0;
                    const expectedY = bucket.expectedPct != null ? yForPct(bucket.expectedPct) : null;
                    return (
                      <g key={bucket.label}>
                        <rect
                          x={cx - (rectWidth / 2)}
                          y={actualY}
                          width={rectWidth}
                          height={actualHeight}
                          rx="4"
                          fill="#14b8a6"
                          fillOpacity={bucket.count > 0 ? 0.9 : 0.2}
                        />
                        {expectedY != null && (
                          <polygon
                            points={`${cx},${expectedY - 6} ${cx + 6},${expectedY} ${cx},${expectedY + 6} ${cx - 6},${expectedY}`}
                            fill="#f9fafb"
                          />
                        )}
                        <text x={cx} y={svgHeight - 14} textAnchor="middle" fill="#9ca3af" fontSize="8" fontFamily="monospace">{bucket.label}</text>
                        <text x={cx} y={svgHeight - 4} textAnchor="middle" fill="#4b5563" fontSize="7" fontFamily="monospace">{bucket.count}p</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            );
          };

          return (
            <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace", letterSpacing: "0.05em" }}>🔬 LAB</div>
                    <TierBadge tier="predictive" />
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                    {isLabF5 ? "F5 Moneyline" : isLabFullGame ? "Full-Game Moneyline" : isLabKProp ? "K Prop" : "Totals"} · Predictive model · Pre-calibrated coefficients · Experimental
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <div style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace", background: "rgba(255,255,255,0.04)", border: "1px solid #1f2437", borderRadius: 999, padding: "4px 8px" }}>
                    {activeLabData?.date ?? "today"}
                  </div>
                  <button
                    onClick={refreshLab}
                    disabled={activeLabLoading}
                    style={{
                      background: activeLabLoading ? "rgba(255,255,255,0.04)" : "rgba(52,211,153,0.15)",
                      border: `1px solid ${activeLabLoading ? "#2d3148" : "rgba(52,211,153,0.35)"}`,
                      borderRadius: 8,
                      padding: "6px 10px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: activeLabLoading ? "#4b5563" : "#34d399",
                      cursor: activeLabLoading ? "default" : "pointer",
                      fontFamily: "monospace",
                    }}
                  >
                    ↺ Refresh
                  </button>
                </div>
              </div>

              {(labCalibration || labCalibrationLoading) && (
                <Card style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace", letterSpacing: "0.05em" }}>📈 Season Overview</div>
                      <span style={{ fontSize: 8, fontWeight: 700, color: "#34d399", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.28)", borderRadius: 999, padding: "2px 7px", fontFamily: "monospace" }}>
                        EDGE ROI SIM
                      </span>
                    </div>
                    {labCalibrationLoading && <span style={{ fontSize: 8, color: "#6b7280" }}>refreshing calibration…</span>}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isNarrowPhone ? "1fr 1fr" : "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
                    <div style={{ background: "#1e2030", borderRadius: 10, padding: "9px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: edgeRoi >= 0 ? "#34d399" : "#f87171", fontFamily: "monospace" }}>{edgeRoiLabel}</div>
                      <div style={{ fontSize: 8, color: "#6b7280", marginTop: 2 }}>Edge ROI</div>
                    </div>
                    <div style={{ background: "#1e2030", borderRadius: 10, padding: "9px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: "#34d399", fontFamily: "monospace" }}>{combinedSummary?.accuracy != null ? `${combinedSummary.accuracy}%` : "—"}</div>
                      <div style={{ fontSize: 8, color: "#6b7280", marginTop: 2 }}>Combined Accuracy</div>
                    </div>
                    <div style={{ background: "#1e2030", borderRadius: 10, padding: "9px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: "#fbbf24", fontFamily: "monospace" }}>{combinedSummary?.brierScore != null ? combinedSummary.brierScore.toFixed(2) : "—"}</div>
                      <div style={{ fontSize: 8, color: "#6b7280", marginTop: 2 }}>Brier Score</div>
                    </div>
                    <div style={{ background: "#1e2030", borderRadius: 10, padding: "9px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: "#f9fafb", fontFamily: "monospace" }}>{settledPicks}</div>
                      <div style={{ fontSize: 8, color: "#6b7280", marginTop: 2 }}>Settled Picks</div>
                    </div>
                  </div>

                  <div style={{ border: "1px solid #1f2437", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(86px, 1.2fr) repeat(4, 1fr)", gap: 0, background: "#141726", borderBottom: "1px solid #1f2437" }}>
                      {["Model", "Record", "Accuracy", "Brier", "Edge ROI"].map((label) => (
                        <div key={label} style={{ padding: "8px 10px", fontSize: 8, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "monospace" }}>
                          {label}
                        </div>
                      ))}
                    </div>
                    {labModelRows.map(({ key, title, color, summary }) => {
                      const rowEdgeHits = summary?.edgeHits ?? 0;
                      const rowEdgeMisses = Math.max(0, (summary?.edgeTotal ?? 0) - rowEdgeHits);
                      const rowEdgeRoi = (rowEdgeHits * 100) - (rowEdgeMisses * 110);
                      const isBest = bestLabModelKey === key && (summary?.total ?? 0) > 0;
                      return (
                        <div
                          key={key}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(86px, 1.2fr) repeat(4, 1fr)",
                            gap: 0,
                            background: isBest ? `${color}12` : "#11131c",
                            borderTop: "1px solid #1f2437",
                          }}
                        >
                          <div style={{ padding: "9px 10px", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: 9, fontWeight: 800, color: isBest ? "#f9fafb" : "#d1d5db", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
                            {isBest && (
                              <span style={{ fontSize: 7, fontWeight: 800, color: color, background: `${color}18`, border: `1px solid ${color}33`, borderRadius: 999, padding: "1px 5px", fontFamily: "monospace" }}>
                                BEST
                              </span>
                            )}
                          </div>
                          <div style={{ padding: "9px 10px", fontSize: 9, color: "#f9fafb", fontFamily: "monospace" }}>
                            {summary ? `${summary.hits}-${summary.misses}` : "—"}
                          </div>
                          <div style={{ padding: "9px 10px", fontSize: 9, color: color, fontFamily: "monospace", fontWeight: 800 }}>
                            {summary?.accuracy != null ? `${summary.accuracy}%` : "—"}
                          </div>
                          <div style={{ padding: "9px 10px", fontSize: 9, color: "#fbbf24", fontFamily: "monospace", fontWeight: 800 }}>
                            {summary?.brierScore != null ? summary.brierScore.toFixed(2) : "—"}
                          </div>
                          <div style={{ padding: "9px 10px", fontSize: 9, color: rowEdgeRoi >= 0 ? "#34d399" : "#f87171", fontFamily: "monospace", fontWeight: 800 }}>
                            {summary ? `${rowEdgeRoi >= 0 ? "+" : "-"}$${Math.abs(rowEdgeRoi)}` : "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              <div style={{ display: "flex", gap: 6 }}>
                {[["f5ml", "F5 ML"], ["fullgame", "Full-Game ML"], ["kprop", "K Prop"], ["totals", "Totals"]].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setLabSubTab(key)}
                    style={{
                      background: labSubTab === key ? "rgba(52,211,153,0.18)" : "#161827",
                      border: `1px solid ${labSubTab === key ? "rgba(52,211,153,0.45)" : "#1f2437"}`,
                      borderRadius: 8,
                      padding: "6px 10px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: labSubTab === key ? "#34d399" : "#9ca3af",
                      cursor: "pointer",
                      fontFamily: "monospace",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#34d399", marginBottom: 3 }}>⚗ EXPERIMENTAL MODEL</div>
                <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.5 }}>
                  {isLabF5
                    ? "Win probabilities generated by a pre-calibrated logistic regression using SP quality, command, form, umpire, and home field. Not a trained ML system. Not financial advice. Edge = model prob minus book implied prob."
                    : isLabFullGame
                      ? "Full-Game Moneyline · Logistic model · Adds bullpen ERA differential vs F5 model. Not a trained ML system. Not financial advice. Edge = model prob minus book implied prob."
                      : isLabKProp
                        ? "Strikeout props modeled from pitcher K/9, opponent team K%, umpire tendency, and recent form. Not a trained ML system. Not financial advice. Edge = model projection minus book line."
                        : "Game totals modeled from team runs per game, both SP ERAs, and combined bullpen ERA. Not a trained ML system. Not financial advice. Edge = model projection minus book total."}
                </div>
              </div>

              {activeLabLoading && !activeLabData && (
                <Card>
                  <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>Running {isLabF5 ? "F5" : isLabFullGame ? "full-game" : isLabKProp ? "K prop" : "totals"} predictive model across today&apos;s slate…</div>
                </Card>
              )}

              {activeLabData?.error && (
                <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#fca5a5" }}>
                  {activeLabData.error}
                </div>
              )}

              {!activeLabLoading && activeLabData && (activeLabData.games?.length ?? 0) === 0 && !activeLabData.error && (
                <Card>
                  <div style={{ textAlign: "center", padding: 30, color: "#6b7280", fontSize: 11 }}>No {isLabF5 ? "F5" : isLabFullGame ? "full-game" : isLabKProp ? "K prop" : "totals"} model games available yet.</div>
                </Card>
              )}

              {activeLabData?.games?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {isLabTotals ? activeLabData.games.map((g) => {
                    const labBox = liveBoxscores[String(g.gamePk)];
                    const labGrade = computeLabTotalsGrade({
                      leanSide: g.model?.lean,
                      bookTotal: g.model?.bookTotal,
                    }, labBox);
                    const edgeColor = g.model?.hasEdge ? "#34d399" : (g.model?.overUnderEdge ?? 0) >= 0 ? "#fbbf24" : "#6b7280";
                    const leanColor = g.model?.lean === "OVER" ? "#22c55e" : "#ef4444";
                    const modelProbPct = g.model?.leanProb != null ? `${Math.round(g.model.leanProb * 100)}%` : "—";
                    const edgeLabel = g.model?.overUnderEdge != null ? `${g.model.overUnderEdge >= 0 ? "+" : ""}${g.model.overUnderEdge.toFixed(1)} R` : "—";
                    const combinedBullpenEraDisplay = g.model?.features?.combinedBullpenEra != null ? g.model.features.combinedBullpenEra.toFixed(2) : "—";

                    return (
                      <Card key={g.gamePk} style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>{g.away?.abbr} @ {g.home?.abbr}</div>
                              {g.model?.hasEdge && (
                                <span style={{ background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#34d399", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                                  EDGE
                                </span>
                              )}
                              {labGrade === "hit" && (
                                <span style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#22c55e", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                                  ✓ HIT
                                </span>
                              )}
                              {labGrade === "miss" && (
                                <span style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                                  ✗ MISS
                                </span>
                              )}
                              {g.dataWarning && (
                                <span style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.30)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#fbbf24", fontFamily: "monospace" }}>
                                  PARTIAL DATA
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 7 }}>
                              {g.awayPitcher?.name} vs {g.homePitcher?.name}
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                              <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                Away RPG {g.teamStats?.awayRPG != null ? g.teamStats.awayRPG.toFixed(2) : "—"}
                              </span>
                              <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                Home RPG {g.teamStats?.homeRPG != null ? g.teamStats.homeRPG.toFixed(2) : "—"}
                              </span>
                              <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                Away ERA {g.awayPitcher?.era != null ? g.awayPitcher.era.toFixed(2) : "—"}
                              </span>
                              <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                Home ERA {g.homePitcher?.era != null ? g.homePitcher.era.toFixed(2) : "—"}
                              </span>
                              <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                BP ERA {combinedBullpenEraDisplay}
                              </span>
                            </div>
                            <div style={{ fontSize: 10, color: "#d1d5db", fontFamily: "monospace" }}>
                              Model: {g.model?.predictedTotal != null ? g.model.predictedTotal.toFixed(1) : "—"} vs Line: {g.model?.bookTotal != null ? g.model.bookTotal.toFixed(1) : "—"}
                            </div>
                          </div>

                          <div style={{ minWidth: 118, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7, flexShrink: 0 }}>
                            <div style={{ background: `${edgeColor}15`, border: `1px solid ${edgeColor}33`, borderRadius: 10, padding: "7px 10px", textAlign: "right", minWidth: 110 }}>
                              <div style={{ fontSize: 10, color: leanColor, fontWeight: 800, fontFamily: "monospace", marginBottom: 2 }}>
                                {g.model?.lean ?? "—"} {g.model?.bookTotal != null ? g.model.bookTotal.toFixed(1) : "—"}
                              </div>
                              <div style={{ fontSize: 16, fontWeight: 900, color: "#f9fafb", fontFamily: "monospace", lineHeight: 1 }}>{modelProbPct}</div>
                              <div style={{ fontSize: 8, color: "#6b7280", fontFamily: "monospace", marginTop: 3 }}>{edgeLabel}</div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  }) : isLabKProp ? activeLabData.games.flatMap((g) => {
                    const cards = [
                      { side: "away", pitcher: g.awayPitcher, kProp: g.awayKProp, oppTeam: g.home },
                      { side: "home", pitcher: g.homePitcher, kProp: g.homeKProp, oppTeam: g.away },
                    ]
                      .filter(({ kProp }) => kProp != null)
                      .map(({ side, pitcher, kProp, oppTeam }) => {
                        const labBox = liveBoxscores[String(g.gamePk)];
                        const labGrade = computeLabKPropGrade({
                          leanSide: kProp?.lean,
                          bookLine: kProp?.bookLine,
                          pitcherSide: side,
                          pitcherLastName: String(pitcher?.name ?? "").split(" ").pop(),
                        }, labBox);
                        const edgeColor = kProp?.hasEdge ? "#34d399" : (kProp?.overUnderEdge ?? 0) >= 0 ? "#fbbf24" : "#6b7280";
                        const leanColor = kProp?.lean === "OVER" ? "#22c55e" : "#ef4444";
                        const modelProbPct = kProp?.leanProb != null ? `${Math.round(kProp.leanProb * 100)}%` : "—";
                        const edgeLabel = kProp?.overUnderEdge != null ? `${kProp.overUnderEdge >= 0 ? "+" : ""}${kProp.overUnderEdge.toFixed(1)} K` : "—";
                        const oppKPct = kProp?.features?.oppKPctDecimal != null ? `${(kProp.features.oppKPctDecimal * 100).toFixed(1)}%` : "—";
                        const umpDelta = g.umpire?.kTendency != null ? `${g.umpire.kTendency >= 0 ? "+" : ""}${g.umpire.kTendency.toFixed(2)}` : "—";
                        const formDelta = kProp?.features?.formDelta != null ? `${kProp.features.formDelta >= 0 ? "+" : ""}${kProp.features.formDelta.toFixed(1)}` : "—";

                        return (
                          <Card key={`${g.gamePk}:${side}`} style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
                                  <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>
                                    [{side === "away" ? "AWAY" : "HOME"}] {pitcher?.name} K Prop
                                  </div>
                                  {kProp?.hasEdge && (
                                    <span style={{ background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#34d399", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                                      EDGE
                                    </span>
                                  )}
                                  {labGrade === "hit" && (
                                    <span style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#22c55e", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                                      ✓ HIT
                                    </span>
                                  )}
                                  {labGrade === "miss" && (
                                    <span style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                                      ✗ MISS
                                    </span>
                                  )}
                                  {kProp?.dataWarning && (
                                    <span style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.30)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#fbbf24", fontFamily: "monospace" }}>
                                      PARTIAL DATA
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 7 }}>
                                  {g.away?.abbr} @ {g.home?.abbr} · Opp {oppTeam?.abbr ?? "—"} · Ump {g.umpire?.name ?? "TBD"}
                                </div>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                                  <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                    K/9 {pitcher?.k9 != null ? pitcher.k9.toFixed(2) : "—"}
                                  </span>
                                  <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                    Opp K% {oppKPct}
                                  </span>
                                  <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                    Ump Δ {umpDelta}
                                  </span>
                                  <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                    Form Δ {formDelta}
                                  </span>
                                </div>
                                <div style={{ fontSize: 10, color: "#d1d5db", fontFamily: "monospace" }}>
                                  Model: {kProp?.predictedKs != null ? `${kProp.predictedKs} K` : "—"} vs Line: {kProp?.bookLine ?? "—"}
                                </div>
                              </div>

                              <div style={{ minWidth: 118, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7, flexShrink: 0 }}>
                                <div style={{ background: `${edgeColor}15`, border: `1px solid ${edgeColor}33`, borderRadius: 10, padding: "7px 10px", textAlign: "right", minWidth: 110 }}>
                                  <div style={{ fontSize: 10, color: leanColor, fontWeight: 800, fontFamily: "monospace", marginBottom: 2 }}>
                                    {kProp?.lean ?? "—"} {kProp?.bookLine ?? "—"}
                                  </div>
                                  <div style={{ fontSize: 16, fontWeight: 900, color: "#f9fafb", fontFamily: "monospace", lineHeight: 1 }}>{modelProbPct}</div>
                                  <div style={{ fontSize: 8, color: "#6b7280", fontFamily: "monospace", marginTop: 3 }}>{edgeLabel}</div>
                                </div>
                              </div>
                            </div>
                          </Card>
                        );
                      });
                    return cards;
                  }) : activeLabData.games.map((g) => {
                    const leanIsHome = g.model?.leanSide === "home";
                    const leanTeam = leanIsHome ? g.home : g.away;
                    const bookLine = isLabF5
                      ? (leanIsHome ? g.odds?.f5HomeML : g.odds?.f5AwayML)
                      : (leanIsHome ? g.odds?.homeML : g.odds?.awayML);
                    const modelProb = leanIsHome ? g.model?.homeProb : g.model?.awayProb;
                    const impliedProb = leanIsHome ? g.model?.homeImplied : g.model?.awayImplied;
                    const leanEdge = g.model?.leanEdge ?? 0;
                    const edgeColor = g.model?.hasEdge ? "#34d399" : leanEdge >= 0 ? "#fbbf24" : "#6b7280";
                    const labBox = liveBoxscores[String(g.gamePk)];
                    const f5Innings = Array.isArray(labBox?.linescore?.innings) ? labBox.linescore.innings.slice(0, 5) : [];
                    const hasResolvedF5 = f5Innings.length >= 5;
                    const f5Away = hasResolvedF5 ? f5Innings.reduce((sum, inn) => sum + (inn?.away ?? 0), 0) : null;
                    const f5Home = hasResolvedF5 ? f5Innings.reduce((sum, inn) => sum + (inn?.home ?? 0), 0) : null;
                    const finalAway = labBox?.linescore?.away?.runs ?? null;
                    const finalHome = labBox?.linescore?.home?.runs ?? null;
                    const labHit = isLabF5
                      ? (!hasResolvedF5 || f5Away == null || f5Home == null || f5Away === f5Home
                          ? null
                          : g.model?.leanSide === "home"
                            ? f5Home > f5Away
                            : g.model?.leanSide === "away"
                              ? f5Away > f5Home
                              : null)
                      : (labBox?.isFinal !== true || finalAway == null || finalHome == null || finalAway === finalHome
                          ? null
                          : g.model?.leanSide === "home"
                            ? finalHome > finalAway
                            : g.model?.leanSide === "away"
                              ? finalAway > finalHome
                              : null);
                    const homeProbPct = g.model?.homeProb != null ? `${Math.round(g.model.homeProb * 100)}%` : "—";
                    const awayProbPct = g.model?.awayProb != null ? `${Math.round(g.model.awayProb * 100)}%` : "—";
                    const modelProbPct = modelProb != null ? `${Math.round(modelProb * 100)}%` : "—";
                    const bookProbPct = impliedProb != null ? `${Math.round(impliedProb * 100)}%` : "—";
                    const edgeLabel = `${leanEdge >= 0 ? "+" : ""}${(leanEdge * 100).toFixed(1)}pp`;

                    return (
                      <Card key={g.gamePk} style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>{g.away?.abbr} @ {g.home?.abbr}</div>
                              {g.model?.hasEdge && (
                                <span style={{ background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#34d399", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                                  EDGE
                                </span>
                              )}
                              {labHit === true && (
                                <span style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#22c55e", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                                  ✓ HIT
                                </span>
                              )}
                              {labHit === false && (
                                <span style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#ef4444", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                                  ✗ MISS
                                </span>
                              )}
                              {g.dataWarning && (
                                <span style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.30)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#fbbf24", fontFamily: "monospace" }}>
                                  PARTIAL DATA
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 7 }}>
                              {g.awayPitcher?.name} vs {g.homePitcher?.name}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: isNarrowPhone ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 8 }}>
                              <div style={{ background: "#1a1c2e", border: "1px solid #1f2437", borderRadius: 10, padding: "8px 10px" }}>
                                <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4 }}>{g.away?.abbr} starter</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#f9fafb", marginBottom: 3 }}>{g.awayPitcher?.name}</div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 9, fontFamily: "monospace" }}>
                                  <span style={{ color: "#f59e0b" }}>ERA {g.awayPitcher?.era != null ? g.awayPitcher.era.toFixed(2) : "—"}</span>
                                  <span style={{ color: "#22c55e" }}>WHIP {g.awayPitcher?.whip != null ? g.awayPitcher.whip.toFixed(2) : "—"}</span>
                                  <span style={{ color: "#9ca3af" }}>L3 ERA {g.awayPitcher?.lastThreeEra != null ? g.awayPitcher.lastThreeEra.toFixed(2) : "—"}</span>
                                </div>
                              </div>
                              <div style={{ background: "#1a1c2e", border: "1px solid #1f2437", borderRadius: 10, padding: "8px 10px" }}>
                                <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4 }}>{g.home?.abbr} starter</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#f9fafb", marginBottom: 3 }}>{g.homePitcher?.name}</div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 9, fontFamily: "monospace" }}>
                                  <span style={{ color: "#f59e0b" }}>ERA {g.homePitcher?.era != null ? g.homePitcher.era.toFixed(2) : "—"}</span>
                                  <span style={{ color: "#22c55e" }}>WHIP {g.homePitcher?.whip != null ? g.homePitcher.whip.toFixed(2) : "—"}</span>
                                  <span style={{ color: "#9ca3af" }}>L3 ERA {g.homePitcher?.lastThreeEra != null ? g.homePitcher.lastThreeEra.toFixed(2) : "—"}</span>
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                              <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                Ump {g.umpire?.name ?? "TBD"}
                              </span>
                              <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                K tendency {g.umpire?.kTendency != null ? `${g.umpire.kTendency >= 0 ? "+" : ""}${g.umpire.kTendency.toFixed(2)}` : "—"}
                              </span>
                              <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                ERA Δ {g.model?.features?.eraDiff != null ? `${g.model.features.eraDiff >= 0 ? "+" : ""}${g.model.features.eraDiff.toFixed(2)}` : "—"}
                              </span>
                              <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                WHIP Δ {g.model?.features?.whipDiff != null ? `${g.model.features.whipDiff >= 0 ? "+" : ""}${g.model.features.whipDiff.toFixed(2)}` : "—"}
                              </span>
                              {!isLabF5 && (
                                <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2d3148", borderRadius: 999, padding: "2px 7px", fontSize: 8, color: "#9ca3af", fontFamily: "monospace" }}>
                                  BP ERA Δ {g.model?.features?.bullpenEraDiff != null ? `${g.model.features.bullpenEraDiff >= 0 ? "+" : ""}${g.model.features.bullpenEraDiff.toFixed(2)}` : "—"}
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ minWidth: 118, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7, flexShrink: 0 }}>
                            <div style={{ background: `${edgeColor}15`, border: `1px solid ${edgeColor}33`, borderRadius: 10, padding: "7px 10px", textAlign: "right", minWidth: 110 }}>
                              <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", marginBottom: 2 }}>{leanTeam?.abbr} {isLabF5 ? "F5 ML" : "ML"}</div>
                              <div style={{ fontSize: 16, fontWeight: 900, color: "#f9fafb", fontFamily: "monospace", lineHeight: 1 }}>{modelProbPct}</div>
                              <div style={{ fontSize: 8, color: "#6b7280", fontFamily: "monospace", marginTop: 3 }}>Book {bookProbPct} · {bookLine ?? "—"}</div>
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: edgeColor, fontFamily: "monospace" }}>{edgeLabel}</div>
                            <div style={{ fontSize: 8, color: "#6b7280", fontFamily: "monospace", textAlign: "right" }}>
                              {g.away?.abbr} {awayProbPct} / {g.home?.abbr} {homeProbPct}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}

              {(labCalibration || labCalibrationLoading) && (
                <div>
                  <button
                    onClick={() => setShowLabTrackRecord((s) => !s)}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#161827", border: "1px solid #1f2437", borderRadius: showLabTrackRecord ? "8px 8px 0 0" : 8, padding: "8px 12px", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#34d399", textTransform: "uppercase", letterSpacing: "0.05em" }}>📊 Track Record</span>
                      {labCalibrationLoading && <span style={{ fontSize: 8, color: "#6b7280" }}>loading…</span>}
                    </div>
                    <span style={{ fontSize: 9, color: "#4b5563" }}>{showLabTrackRecord ? "▲ hide" : "▼ show"}</span>
                  </button>

                  {showLabTrackRecord && (
                    <div style={{ background: "#0f1117", border: "1px solid #1f2437", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "10px 12px" }}>
                      {labModelRows.map(({ key: modelKey, title }) => {
                        const summary = labCalibration?.summary?.[modelKey];
                        if (!summary) return null;
                        const sampleSmall = (summary.total ?? 0) < 20;
                        return (
                          <div key={modelKey} style={{ marginBottom: modelKey !== "totals" ? 12 : 0 }}>
                            <div style={{ fontSize: 9, fontWeight: 800, color: "#f9fafb", letterSpacing: "0.05em", marginBottom: 6 }}>{title}</div>
                            <div style={{ display: "grid", gridTemplateColumns: isNarrowPhone ? "1fr 1fr" : "repeat(5, 1fr)", gap: 6, marginBottom: sampleSmall ? 6 : 0 }}>
                              <div style={{ background: "#1e2030", borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>{summary.hits}-{summary.misses} {summary.pushes ? `(${summary.pushes})` : ""}</div>
                                <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>Record</div>
                              </div>
                              <div style={{ background: "#1e2030", borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#34d399", fontFamily: "monospace" }}>{summary.accuracy != null ? `${summary.accuracy}%` : "—"}</div>
                                <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>Accuracy</div>
                              </div>
                              <div style={{ background: "#1e2030", borderRadius: 8, padding: "7px 8px", textAlign: "center" }} title="Closer to 0 is better; 0.25 = coin flip">
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#fbbf24", fontFamily: "monospace" }}>{summary.brierScore != null ? summary.brierScore.toFixed(2) : "—"}</div>
                                <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>Brier</div>
                              </div>
                              <div style={{ background: "#1e2030", borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#a78bfa", fontFamily: "monospace" }}>{summary.edgeHits ?? 0}-{(summary.edgeTotal ?? 0) - (summary.edgeHits ?? 0)}</div>
                                <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>Edge</div>
                              </div>
                              <div style={{ background: "#1e2030", borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: "#38bdf8", fontFamily: "monospace" }}>{summary.edgeAccuracy != null ? `${summary.edgeAccuracy}%` : "—"}</div>
                                <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>Edge Acc.</div>
                              </div>
                            </div>
                            {renderCalibrationCurve(modelKey)}
                            {sampleSmall && (
                              <div style={{ fontSize: 9, color: "#6b7280", marginTop: 6 }}>Small sample — calibration improves over time.</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {view === "models" && isScoutUser && (() => {
          const isModF5 = modelsSubTab === "f5ml";
          const isModFG = modelsSubTab === "fullgame";
          const isModK = modelsSubTab === "kprop";
          const isModTot = modelsSubTab === "totals";
          const activeData = isModF5 ? labData : isModFG ? labFgData : isModK ? labKData : labTotalsData;
          const activeLoading = isModF5 ? labLoading : isModFG ? labFgLoading : isModK ? labKLoading : labTotalsLoading;
          const doRefresh = () => (isModF5 ? fetchLabData(true) : isModFG ? fetchLabFgData(true) : isModK ? fetchLabKData(true) : fetchLabTotalsData(true));

          function getTopFactors(g) {
            if (isModTot) {
              const f = g.model?.features ?? {};
              return [
                { label: "Home offense", value: f.homeRPG != null ? `${f.homeRPG.toFixed(1)} R/G` : null },
                { label: "Away offense", value: f.awayRPG != null ? `${f.awayRPG.toFixed(1)} R/G` : null },
                { label: "Home SP ERA", value: f.homeSpEra != null ? f.homeSpEra.toFixed(2) : null },
                { label: "Away SP ERA", value: f.awaySpEra != null ? f.awaySpEra.toFixed(2) : null },
                { label: "Bullpen ERA", value: f.combinedBullpenEra != null ? f.combinedBullpenEra.toFixed(2) : null },
              ].filter(x => x.value != null).slice(0, 3);
            }
            if (isModK) return [];
            const m = g.model ?? {};
            const f = m.features ?? {};
            const awayName = g.away?.abbr ?? "Away";
            const homeName = g.home?.abbr ?? "Home";
            const rawFactors = [
              { label: "SP ERA edge", raw: f.eraDiff ?? 0 },
              { label: "WHIP edge", raw: f.whipDiff ?? 0 },
              { label: "Form trend", raw: f.formDiff ?? 0 },
              { label: "Ump tendency", raw: f.umpKTendency ?? 0 },
              { label: "Bullpen ERA edge", raw: f.bullpenEraDiff ?? 0 },
            ].filter(x => Math.abs(x.raw) > 0.001);
            rawFactors.sort((a, b) => Math.abs(b.raw) - Math.abs(a.raw));
            return rawFactors.slice(0, 3).map(x => ({
              label: x.label,
              value: x.raw > 0
                ? `favors ${awayName} (+${x.raw.toFixed(2)})`
                : `favors ${homeName} (${x.raw.toFixed(2)})`,
            }));
          }

          return (
            <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace", letterSpacing: "0.05em" }}>📊 MODELS</div>
                    <TierBadge tier="predictive" />
                    <span style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#fca5a5", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                      EXPERIMENTAL
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                    Private model output — not for distribution
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <div style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace", background: "rgba(255,255,255,0.04)", border: "1px solid #1f2437", borderRadius: 999, padding: "4px 8px" }}>
                    {activeData?.date ?? "today"}
                  </div>
                  <button
                    onClick={doRefresh}
                    disabled={activeLoading}
                    style={{
                      background: activeLoading ? "rgba(255,255,255,0.04)" : "rgba(167,139,250,0.15)",
                      border: `1px solid ${activeLoading ? "#2d3148" : "rgba(167,139,250,0.35)"}`,
                      borderRadius: 8,
                      padding: "6px 10px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: activeLoading ? "#4b5563" : "#a78bfa",
                      cursor: activeLoading ? "default" : "pointer",
                      fontFamily: "monospace",
                    }}
                  >
                    ↺ Refresh
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["f5ml", "F5 ML"], ["fullgame", "Full-Game ML"], ["kprop", "K Prop"], ["totals", "Totals"]].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setModelsSubTab(key)}
                    style={{
                      background: modelsSubTab === key ? "rgba(167,139,250,0.18)" : "#161827",
                      border: `1px solid ${modelsSubTab === key ? "rgba(167,139,250,0.45)" : "#1f2437"}`,
                      borderRadius: 8,
                      padding: "6px 10px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: modelsSubTab === key ? "#a78bfa" : "#9ca3af",
                      cursor: "pointer",
                      fontFamily: "monospace",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeLoading && !activeData && (
                <Card>
                  <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>
                    Running {isModF5 ? "F5" : isModFG ? "full-game" : isModK ? "K prop" : "totals"} model across today's slate…
                  </div>
                </Card>
              )}

              {activeData?.error && (
                <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#fca5a5" }}>
                  {activeData.error}
                </div>
              )}

              {!activeLoading && activeData && (activeData.games?.length ?? 0) === 0 && !activeData.error && (
                <Card>
                  <div style={{ textAlign: "center", padding: 30, color: "#6b7280", fontSize: 11 }}>
                    No {isModF5 ? "F5" : isModFG ? "full-game" : isModK ? "K prop" : "totals"} model games available yet.
                  </div>
                </Card>
              )}

              {activeData?.games?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(isModF5 || isModFG) && activeData.games.map((g) => {
                    const m = g.model ?? {};
                    const lean = m.leanSide === "home" ? g.home?.abbr : g.away?.abbr;
                    const leanProb = m.leanSide === "home" ? m.homeProb : m.awayProb;
                    const probPct = leanProb != null ? `${Math.round(leanProb * 100)}%` : "—";
                    const leanColor = m.hasEdge ? "#a78bfa" : "#9ca3af";
                    const factors = getTopFactors(g);
                    const awayOdds = m.awayEdge != null ? `${m.awayEdge >= 0 ? "+" : ""}${(m.awayEdge * 100).toFixed(0)}` : null;
                    const homeOdds = m.homeEdge != null ? `${m.homeEdge >= 0 ? "+" : ""}${(m.homeEdge * 100).toFixed(0)}` : null;
                    return (
                      <Card key={g.gamePk} style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>
                                {g.away?.abbr ?? "?"} @ {g.home?.abbr ?? "?"}
                              </div>
                              {g.gameTime && (
                                <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>
                                  {formatLocalTime(g.gameTime)}
                                </div>
                              )}
                              {m.hasEdge && (
                                <span style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#a78bfa", fontFamily: "monospace" }}>
                                  EDGE
                                </span>
                              )}
                              {g.dataWarning && (
                                <span style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace" }}>
                                  DATA GAP
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6 }}>
                              {g.awayPitcher?.name ?? "TBD"} vs {g.homePitcher?.name ?? "TBD"}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>LEAN</span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: leanColor, fontFamily: "monospace" }}>{lean ?? "—"}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: leanColor, fontFamily: "monospace" }}>{probPct}</span>
                              </div>
                              {awayOdds && homeOdds && (
                                <div style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace" }}>
                                  edge: {g.away?.abbr} {awayOdds}% · {g.home?.abbr} {homeOdds}%
                                </div>
                              )}
                            </div>
                            {factors.length > 0 && (
                              <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 2 }}>
                                {factors.map((f, i) => (
                                  <div key={i} style={{ fontSize: 10, color: "#6b7280" }}>
                                    <span style={{ color: "#4b5563", fontFamily: "monospace" }}>· </span>
                                    <span style={{ color: "#9ca3af" }}>{f.label}: </span>
                                    <span style={{ color: "#d1d5db" }}>{f.value}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            <TierBadge tier="predictive" />
                          </div>
                        </div>
                      </Card>
                    );
                  })}

                  {isModK && activeData.games.map((g) => {
                    const umpTend = g.umpire?.kTendency != null ? (g.umpire.kTendency > 0 ? `+${(g.umpire.kTendency * 100).toFixed(0)}% K` : `${(g.umpire.kTendency * 100).toFixed(0)}% K`) : null;
                    const renderKProp = (kp, pitcher, side) => {
                      if (!kp || kp.dataWarning) return null;
                      const edgeColor = kp.hasEdge ? "#a78bfa" : kp.lean === "OVER" ? "#22c55e" : "#ef4444";
                      return (
                        <div key={side} style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#d1d5db", fontFamily: "monospace" }}>{pitcher?.name ?? side}</span>
                            <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>line {kp.bookLine ?? "—"} K</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: edgeColor, fontFamily: "monospace" }}>
                              {kp.lean ?? "—"} {kp.predictedKs != null ? kp.predictedKs.toFixed(1) : "—"}
                            </span>
                            {kp.hasEdge && (
                              <span style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.35)", borderRadius: 999, padding: "2px 6px", fontSize: 8, fontWeight: 800, color: "#a78bfa", fontFamily: "monospace" }}>EDGE</span>
                            )}
                          </div>
                        </div>
                      );
                    };
                    return (
                      <Card key={g.gamePk} style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>
                                {g.away?.abbr ?? "?"} @ {g.home?.abbr ?? "?"}
                              </div>
                              {g.gameTime && (
                                <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>{formatLocalTime(g.gameTime)}</div>
                              )}
                              {umpTend && (
                                <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>ump {umpTend}</span>
                              )}
                            </div>
                            {renderKProp(g.awayKProp, g.awayPitcher, "away")}
                            {renderKProp(g.homeKProp, g.homePitcher, "home")}
                            {!g.awayKProp && !g.homeKProp && (
                              <div style={{ fontSize: 10, color: "#4b5563" }}>No K prop data available</div>
                            )}
                          </div>
                          <TierBadge tier="predictive" />
                        </div>
                      </Card>
                    );
                  })}

                  {isModTot && activeData.games.map((g) => {
                    const m = g.model ?? {};
                    const edgeColor = m.hasEdge ? "#a78bfa" : m.lean === "OVER" ? "#22c55e" : "#ef4444";
                    const factors = getTopFactors(g);
                    return (
                      <Card key={g.gamePk} style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>
                                {g.away?.abbr ?? "?"} @ {g.home?.abbr ?? "?"}
                              </div>
                              {g.gameTime && (
                                <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>{formatLocalTime(g.gameTime)}</div>
                              )}
                              {m.hasEdge && (
                                <span style={{ background: "rgba(167,139,250,0.14)", border: "1px solid rgba(167,139,250,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#a78bfa", fontFamily: "monospace" }}>EDGE</span>
                              )}
                              {g.dataWarning && (
                                <span style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace" }}>DATA GAP</span>
                              )}
                            </div>
                            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6 }}>
                              {g.awayPitcher?.name ?? "TBD"} vs {g.homePitcher?.name ?? "TBD"}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>TOTAL</span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: edgeColor, fontFamily: "monospace" }}>
                                  {m.lean ?? "—"} {m.predictedTotal != null ? m.predictedTotal.toFixed(1) : "—"}
                                </span>
                                <span style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace" }}>
                                  (book {m.bookTotal ?? "—"})
                                </span>
                              </div>
                            </div>
                            {factors.length > 0 && (
                              <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 2 }}>
                                {factors.map((f, i) => (
                                  <div key={i} style={{ fontSize: 10, color: "#6b7280" }}>
                                    <span style={{ color: "#4b5563", fontFamily: "monospace" }}>· </span>
                                    <span style={{ color: "#9ca3af" }}>{f.label}: </span>
                                    <span style={{ color: "#d1d5db" }}>{f.value}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <TierBadge tier="predictive" />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

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
                <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{formatLocalTime(game.gameTime) ?? game.time}</div>
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
                              <div style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>{d.k9} K/9 · {d.bb9} BB/9{d.ops && d.ops !== "—" ? ` · ${d.ops} OPS` : ""}</div>
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

                  {(() => {
                    const stats = activePitcher.pitcherStats ?? null;
                    if (!stats) return null;
                    const hasAny = stats.swStrPct != null || stats.oSwingPct != null || stats.fStrikePct != null || stats.barrelPct != null || stats.hardHitPct != null || stats.xwOBAAllowed != null || stats.flyBallPctInclPopup != null;
                    if (!hasAny) return null;
                    const xwOBAColor = stats.xwOBAAllowed == null
                      ? "#f9fafb"
                      : stats.xwOBAAllowed < 0.290
                        ? "#4ade80"
                        : stats.xwOBAAllowed >= 0.350
                          ? "#ef4444"
                          : stats.xwOBAAllowed >= 0.330
                            ? "#f97316"
                            : "#f9fafb";
                    return (
                      <>
                        <div style={{ background: "#0e0f1a", borderRadius: 8, padding: "6px 10px", marginBottom: 8, fontSize: 9, color: "#9ca3af", fontFamily: "monospace" }}>
                          SwStr%: <span style={{ color: "#f9fafb" }}>{stats.swStrPct != null ? `${stats.swStrPct}%` : "—"}</span>
                          <span style={{ color: "#374151" }}> · </span>
                          Chase: <span style={{ color: "#f9fafb" }}>{stats.oSwingPct != null ? `${stats.oSwingPct}%` : "—"}</span>
                          <span style={{ color: "#374151" }}> · </span>
                          F-Str%: <span style={{ color: "#f9fafb" }}>{stats.fStrikePct != null ? `${stats.fStrikePct}%` : "—"}</span>
                          <span style={{ color: "#374151" }}> · </span>
                          Barrel%: <span style={{ color: "#f9fafb" }}>{stats.barrelPct != null ? `${stats.barrelPct}%` : "—"}</span>
                          <span style={{ color: "#374151" }}> · </span>
                          HH%: <span style={{ color: "#f9fafb" }}>{stats.hardHitPct != null ? `${stats.hardHitPct}%` : "—"}</span>
                          <span style={{ color: "#374151" }}> · </span>
                          xwOBA: <span style={{ color: xwOBAColor }}>{stats.xwOBAAllowed != null ? stats.xwOBAAllowed.toFixed(3) : "—"}</span>
                          <span style={{ color: "#374151" }}> · </span>
                          FB%: <span style={{ color: "#f59e0b" }}>{stats.flyBallPctInclPopup != null ? `${stats.flyBallPctInclPopup}%` : "—"}</span>
                        </div>
                        {(stats.vsLeft || stats.vsRight) && (
                          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                            {["vsLeft", "vsRight"].map(side => {
                              const split = stats[side];
                              if (!split) return null;
                              const label = side === "vsLeft" ? "vs LHH" : "vs RHH";
                              const color = "#94a3b8";
                              return (
                                <div key={side} style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 5, padding: "3px 8px", fontSize: 9, color, fontFamily: "monospace" }}>
                                  {label} · {split.hrAllowed} HR · {split.barrelPct}% Brl · {split.hardHitPct}% HH{split.flyBallPct != null ? ` · ${split.flyBallPct}% FB` : ""}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}

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

              // Compute matchup score for every batter in the facing lineup.
              // Use backend-computed score if present; fall back to client-side.
              const scored = facingLineup.map(b => {
                const enriched = augmentBatterWithSplits(b, batterSplits);
                const score = b.matchupScore ?? batterMatchupScoreForPitcher(enriched, activePitcher, batterSplits);
                return { ...enriched, matchupScore: score };
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

            {/* ── First Inning Tendencies ── */}
            <SLabel>First Inning Tendencies</SLabel>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <LeanBadge label={`${nrfi.lean} ${nrfi.confidence}%`} positive={nrfi.lean === "NRFI"} />
                {nrfi.live && <span style={{ fontSize: 8, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "2px 6px" }}>LIVE</span>}
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
            const isRosterFallback = liveLineups[gamePkKey]?.source === "roster";
            const sideScratches = lineupScratchMap?.[lineupSide] ?? [];
            const label = isRosterFallback
              ? `${lineupSide === "away" ? game.away.abbr : game.home.abbr} Roster (Lineup Pending)`
              : (lineupSide === "away"
                ? `${game.away.abbr} Lineup vs ${facingPitcher.name}`
                : `${game.home.abbr} Lineup vs ${facingPitcher.name}`);
            const lineupConfirmed = liveLineups[gamePkKey]?.confirmed === true;
            const displayLineup = (lineupConfirmed || isRosterFallback) ? lineup : [];

            return (<>
              {/* Toggle */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {["away", "home"].map(side => (
                  <button key={side} onClick={() => { setLineupSide(side); setExpandedBatter(null); }} style={{ flex: 1, background: lineupSide === side ? "#22c55e" : "#161827", border: `1px solid ${lineupSide === side ? "#22c55e" : "#1f2437"}`, borderRadius: 8, padding: "7px", fontSize: 11, color: lineupSide === side ? "#000" : "#9ca3af", fontFamily: "monospace", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
                    {side === "away" ? `${game.away.abbr} Batting` : `${game.home.abbr} Batting`}
                    {lineupConfirmed && <span style={{ marginLeft: 5, fontSize: 8, fontWeight: 700, color: lineupSide === side ? "#000" : "#22c55e", background: lineupSide === side ? "rgba(0,0,0,0.2)" : "rgba(34,197,94,0.15)", borderRadius: 3, padding: "1px 4px", verticalAlign: "middle" }}>LIVE</span>}
                    {!lineupConfirmed && isRosterFallback && <span style={{ marginLeft: 5, fontSize: 8, fontWeight: 700, color: lineupSide === side ? "#000" : "#6b7280", background: lineupSide === side ? "rgba(0,0,0,0.2)" : "rgba(107,114,128,0.15)", borderRadius: 3, padding: "1px 4px", verticalAlign: "middle" }}>ROSTER</span>}
                  </button>
                ))}
              </div>

              <SLabel>{label}</SLabel>

              {/* Lineup vulnerability summary */}
              {lineupConfirmed ? (
                <Card style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Lineup Vulnerability vs {facingPitcher.name}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {facingPitcher.arsenal.map(a => {
                      const weakCount = displayLineup.filter(b => {
                        const avg = b.vsPitches?.[a.abbr];
                        return avg && parseFloat(avg) < 0.22;
                      }).length;
                      const strongCount = displayLineup.filter(b => {
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
              ) : isRosterFallback ? (
                <Card style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Lineup Vulnerability vs {facingPitcher.name}</div>
                  <div style={{ fontSize: 10, color: "#4b5563", fontStyle: "italic" }}>Available once lineup is confirmed · Batting order TBD</div>
                </Card>
              ) : null}

              {/* Batter rows */}
              <Card style={{ padding: "8px" }}>
                {!isRosterFallback && sideScratches.length > 0 && (
                  <div style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.24)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    marginBottom: 10,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", marginBottom: 6 }}>🚨 Scratch Alert</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {sideScratches.map((s) => (
                        <span
                          key={`${s.id ?? s.name}`}
                          style={{ background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 999, padding: "2px 7px", fontSize: 8, fontWeight: 800, color: "#fca5a5", textTransform: "uppercase", letterSpacing: "0.05em" }}
                        >
                          {s.name} SCRATCHED
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {displayLineup.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "22px 0" }}>
                    <div style={{ fontSize: 26, marginBottom: 8 }}>📋</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", marginBottom: 6 }}>Lineups Not Yet Posted</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>Check back closer to first pitch.</div>
                  </div>
                ) : displayLineup.map((rawB, i) => {
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
                  // Prefer backend-computed score (same formula, avoids extra client fetches).
                  // Fall back to client-side computation if API didn't return one yet.
                  const sc = rawBEnriched.matchupScore ?? batterMatchupScoreForPitcher(b, facingPitcher, batterSplits);
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
                        <div style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          background: "#1e2030",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: isRosterFallback ? 600 : 700,
                          color: isRosterFallback ? "#6b7280" : "#6b7280",
                          flexShrink: 0,
                          fontFamily: isRosterFallback ? "inherit" : "inherit",
                        }}>{isRosterFallback && b.order === null ? (b.pos ?? "—") : b.order}</div>

                        {/* Name + position */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Name row — always full width, never truncated by badges */}
                          <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>{b.name}</div>
                            {injuredIds.has(String(b.id)) && (
                              <span style={{ background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 999, padding: "1px 5px", fontSize: 8, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>⚠ IL</span>
                            )}
                          </div>
                          {/* Badge row — only rendered when at least one badge exists */}
                          {(() => {
                            const OF = new Set(["LF","CF","RF"]);
                            const oop = b.primaryPos && b.pos !== b.primaryPos
                              && b.pos !== "DH" && b.primaryPos !== "DH"
                              && !(OF.has(b.pos) && OF.has(b.primaryPos));
                            if (!streakTone && !oop) return null;
                            return (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                                {streakTone && (
                                  <span style={{ background: streakTone.bg, border: `1px solid ${streakTone.border}`, borderRadius: 999, padding: "1px 5px", fontSize: 8, fontWeight: 800, color: streakTone.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{streakTone.label}</span>
                                )}
                                {oop && (
                                  <span style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 999, padding: "1px 5px", fontSize: 8, fontWeight: 800, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.06em" }}>⚠ {b.pos} (norm. {b.primaryPos})</span>
                                )}
                              </div>
                            );
                          })()}
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
                          {(() => {
                            const rev = b.powerProfile?.recentEv;
                            if (!rev) return null;
                            const deltaColor = rev.evDelta >= 4  ? "#22c55e"
                              : rev.evDelta >= 2  ? "#86efac"
                                : rev.evDelta <= -3 ? "#ef4444"
                                  : "#6b7280";
                            const deltaStr = rev.evDelta != null
                              ? `${rev.evDelta >= 0 ? "+" : ""}${rev.evDelta} vs szn`
                              : null;
                            return (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, background: "#1a1b2e", borderRadius: 8, padding: "6px 10px" }}>
                                <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>L7 EV</span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>{rev.evL7} mph</span>
                                {deltaStr && <span style={{ fontSize: 10, fontWeight: 700, color: deltaColor, fontFamily: "monospace" }}>{deltaStr}</span>}
                                <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>HH {rev.hardHitPctL7}%</span>
                                <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>Brl {rev.barrelPctL7}%</span>
                                <span style={{ fontSize: 8, color: "#4b5563", marginLeft: "auto", flexShrink: 0 }}>{rev.bbL7} BB</span>
                              </div>
                            );
                          })()}

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
                                {(() => {
                                  const s = b.powerProfile?.pitchTypeSplits?.[a.abbr];
                                  if (!s || s.battedBalls < 15) return null;
                                  const brlColor = s.barrelPct >= 12 ? "#fb923c" : s.barrelPct >= 7 ? "#f59e0b" : "#6b7280";
                                  const hhColor  = s.hardHitPct >= 45 ? "#22c55e" : s.hardHitPct >= 35 ? "#f59e0b" : "#6b7280";
                                  return (
                                    <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                                      <span style={{ fontSize: 8, color: brlColor, fontFamily: "monospace" }}>Brl {s.barrelPct}%</span>
                                      <span style={{ fontSize: 8, color: hhColor,  fontFamily: "monospace" }}>HH {s.hardHitPct}%</span>
                                      {s.flyBallPct != null && <span style={{ fontSize: 8, color: "#6b7280", fontFamily: "monospace" }}>FB {s.flyBallPct}%</span>}
                                      <span style={{ fontSize: 8, color: "#4b5563", fontFamily: "monospace" }}>{s.hrCount} HR · {s.battedBalls} BB</span>
                                    </div>
                                  );
                                })()}
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
                    {(() => {
                      if (!livePredMarkets) return null;
                      const awayAbbr = game.away?.abbr;
                      const homeAbbr = game.home?.abbr;
                      const fwdKey = `${awayAbbr}|${homeAbbr}`;
                      const revKey = `${homeAbbr}|${awayAbbr}`;

                      const kd = livePredMarkets.kalshi?.[fwdKey] ?? livePredMarkets.kalshi?.[revKey];
                      const kalshiRow = kd ? (() => {
                        const ourAwayIsKalshiAway = kd.awayAbbr === awayAbbr;
                        const awayProb = ourAwayIsKalshiAway ? kd.awayProb : kd.homeProb;
                        const homeProb = ourAwayIsKalshiAway ? kd.homeProb : kd.awayProb;
                        return (
                          <div style={{ display: "grid", gridTemplateColumns: "36px repeat(7, 1fr)", gap: 2, marginBottom: 3, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.18)", borderRadius: 6, padding: "5px 4px", alignItems: "center" }}>
                            <div style={{ fontSize: 8, fontWeight: 800, color: "#34d399", textAlign: "center", fontFamily: "monospace" }}>KSHI</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: awayProb > homeProb ? "#34d399" : "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>{awayProb}%</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: homeProb > awayProb ? "#34d399" : "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>{homeProb}%</div>
                            {["—","—","—","—","—"].map((d, i) => <div key={i} style={{ fontSize: 9, color: "#4b5563", textAlign: "center", fontFamily: "monospace" }}>{d}</div>)}
                          </div>
                        );
                      })() : null;

                      const pd = livePredMarkets.polymarket?.[fwdKey] ?? livePredMarkets.polymarket?.[revKey];
                      const polyRow = pd ? (() => {
                        const awayIsWinner = pd.winnerAbbr === awayAbbr;
                        const awayProb = awayIsWinner ? pd.winnerProb : pd.loserProb;
                        const homeProb = awayIsWinner ? pd.loserProb : pd.winnerProb;
                        return (
                          <div style={{ display: "grid", gridTemplateColumns: "36px repeat(7, 1fr)", gap: 2, marginBottom: 3, background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.18)", borderRadius: 6, padding: "5px 4px", alignItems: "center" }}>
                            <div style={{ fontSize: 8, fontWeight: 800, color: "#a78bfa", textAlign: "center", fontFamily: "monospace" }}>POLY</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: awayProb > homeProb ? "#a78bfa" : "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>{awayProb}%</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: homeProb > awayProb ? "#a78bfa" : "#9ca3af", textAlign: "center", fontFamily: "monospace" }}>{homeProb}%</div>
                            {["—","—","—","—","—"].map((d, i) => <div key={i} style={{ fontSize: 9, color: "#4b5563", textAlign: "center", fontFamily: "monospace" }}>{d}</div>)}
                          </div>
                        );
                      })() : null;

                      if (!kalshiRow && !polyRow) return null;
                      return <>{kalshiRow}{polyRow}</>;
                    })()}
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
                    <TierBadge tier="ai" />
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
              <TierBadge tier="ai" />
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
              {(() => {
                const key = String(selectedId);
                const aiData = liveAiProps[key];
                const aiPicks = (aiData && aiData !== "loading" && Array.isArray(aiData.props)) ? aiData.props : [];
                const aiMatched = new Set();
                const merged = displayProps.map(algo => {
                  const algoKey = propTypeKey(algo);
                  const matchIdx = aiPicks.findIndex((ai, i) => !aiMatched.has(i) && propTypeKey(ai) === algoKey);
                  if (matchIdx >= 0) {
                    aiMatched.add(matchIdx);
                    return { kind: "dual", algo, ai: aiPicks[matchIdx] };
                  }
                  return { kind: "algo", algo };
                });
                aiPicks.forEach((ai, i) => { if (!aiMatched.has(i)) merged.push({ kind: "ai", ai }); });

                return merged.map((entry, i) => {
                  const p = entry.kind === "ai" ? entry.ai : entry.algo;
                  const inParlay = parlayLabels.includes(p.label);
                  const parlayFull = parlayLabels.length >= 3 && !inParlay;
                  const bothAgree = entry.kind === "dual" && entry.algo.lean === entry.ai.lean;

                  return (
                    <Card key={i} style={inParlay ? { borderColor: "rgba(251,191,36,0.4)" } : {}}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, paddingRight: 8, minWidth: 0, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#f9fafb", lineHeight: 1.4 }}>{p.label}</span>
                          {entry.kind === "algo" && (
                            <TierBadge tier="projection" />
                          )}
                          {entry.kind === "ai" && (
                            <TierBadge tier="ai" />
                          )}
                          {bothAgree && (
                            <span style={{ fontSize: 7, fontWeight: 800, color: "#818cf8", background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.4)", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace", flexShrink: 0 }}
                              title="The projection and AI-assisted analysis agree on this pick.">✦ BOTH AGREE</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                          <LeanBadge label={p.lean} positive={p.positive} small />
                          <button
                            onClick={() => { if (parlayFull) return; setParlayLabels(prev => inParlay ? prev.filter(l => l !== p.label) : [...prev, p.label]); }}
                            title={parlayFull ? "Max 3 legs" : inParlay ? "Remove from parlay" : "Add to parlay"}
                            style={{ fontSize: 10, fontWeight: 700, background: inParlay ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${inParlay ? "rgba(251,191,36,0.5)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "3px 6px", cursor: parlayFull ? "default" : "pointer", color: inParlay ? "#fbbf24" : "#4b5563", opacity: parlayFull ? 0.35 : 1, lineHeight: 1 }}>🔗</button>
                        </div>
                      </div>

                      {entry.kind === "dual" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 7, fontWeight: 800, color: "#94a3b8", fontFamily: "monospace", width: 18, flexShrink: 0 }}>⚙</span>
                            <ConfBar pct={entry.algo.confidence} positive={entry.algo.positive} />
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 7, fontWeight: 800, color: "#818cf8", fontFamily: "monospace", width: 18, flexShrink: 0 }}>✦</span>
                            <ConfBar pct={entry.ai.confidence} positive={entry.ai.positive} />
                          </div>
                        </div>
                      ) : (
                        <ConfBar pct={p.confidence} positive={p.positive} />
                      )}

                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8, lineHeight: 1.4 }}>{p.reason}</div>
                      {entry.kind === "dual" && entry.ai.reason !== entry.algo.reason && (
                        <div style={{ fontSize: 10, color: "#4b5563", marginTop: 4, lineHeight: 1.4, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 4 }}>
                          <span style={{ color: "#818cf8", fontFamily: "monospace", fontSize: 9 }}>✦</span> {entry.ai.reason}
                        </div>
                      )}
                    </Card>
                  );
                });
              })()}

              {(() => {
                const key = String(selectedId);
                if (liveAiProps[key] !== "loading") return null;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 4px" }}>
                    <span style={{ fontSize: 9, color: "#818cf8", fontFamily: "monospace" }}>✦</span>
                    <span style={{ fontSize: 10, color: "#4b5563" }}>AI-assisted analysis loading…</span>
                  </div>
                );
              })()}

              {/* ── SPORTSBOOK LINES section ─────────────────── */}
              {!IS_ODDS_SANDBOX && !IS_STATS_SANDBOX && (() => {
                const spKey   = String(selectedId);
                const spState = livePlayerProps[spKey];
                if (spState === undefined) return null;

                const allProps  = Array.isArray(spState?.props) ? spState.props : [];
                const hasError  = spState?.error === true;
                const hasData   = allProps.length > 0;
                const propReason = spState?.reason ?? null; // "ok" | "no_props" | "no_event" | null

                const ALL_BOOKS  = ["DK", "FD", "CZR", "MGM", "BOV"];
                const BOOKS      = propsBookFilter === "ALL"
                  ? ALL_BOOKS
                  : ALL_BOOKS.filter(b => b === propsBookFilter);
                const BOOK_COLORS = { DK: "#38bdf8", FD: "#34d399", CZR: "#fb923c", MGM: "#a78bfa", BOV: "#f87171" };

                const grouped = {
                  pitcher_strikeouts: allProps.filter(p => p.market === "pitcher_strikeouts"),
                  batter_home_runs:   allProps.filter(p => p.market === "batter_home_runs"),
                  batter_total_bases: allProps.filter(p => p.market === "batter_total_bases"),
                  batter_hits:        allProps.filter(p => p.market === "batter_hits"),
                };

                return (
                  <>
                    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                      {["ALL", "DK", "FD", "CZR", "MGM", "BOV"].map(bk => {
                        const active = propsBookFilter === bk;
                        return (
                          <button
                            key={bk}
                            onClick={() => setPropsBookFilter(bk)}
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "3px 8px",
                              borderRadius: 6,
                              cursor: "pointer",
                              background: active ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.04)",
                              border: `1px solid ${active ? "rgba(139,92,246,0.6)" : "rgba(255,255,255,0.08)"}`,
                              color: active ? "#c4b5fd" : "#6b7280",
                            }}
                          >
                            {bk}{bk === preferredBook ? " ★" : ""}
                          </button>
                        );
                      })}
                    </div>
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
                          const isCollapsed = !!collapsedMarkets[mKey];

                          // Keep scoring/best-line logic on the full book set; chips only hide visible columns.
                          const allActiveBooks = ALL_BOOKS.filter(bk => rows.some(p => p.books?.[bk]));
                          const activeBooks = BOOKS.filter(bk => rows.some(p => p.books?.[bk]));

                          return (
                            <Card key={mKey} style={{ padding: "0", marginBottom: 10, overflow: "hidden" }}>
                              {/* Market header */}
                              <div
                                onClick={() => toggleMarket(mKey)}
                                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px 6px", borderBottom: "1px solid #1f2437", cursor: "pointer" }}
                              >
                                <span style={{ fontSize: 8, fontWeight: 700, color, background: `${color}1a`, border: `1px solid ${color}40`, borderRadius: 4, padding: "1px 5px" }}>{badge}</span>
                                <span style={{ fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>{label}</span>
                                {/* Active book legend for this market */}
                                <div style={{ display: "flex", gap: 3 }}>
                                  {activeBooks.map(bk => (
                                    <span key={bk} style={{ fontSize: 7, fontWeight: 700, color: BOOK_COLORS[bk], background: `${BOOK_COLORS[bk]}18`, border: `1px solid ${BOOK_COLORS[bk]}40`, borderRadius: 3, padding: "1px 4px" }}>{bk}</span>
                                  ))}
                                </div>
                                <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 6 }}>{isCollapsed ? "▶" : "▼"}</span>
                              </div>

                              {!isCollapsed && (
                                <>
                                  {/* Column header row */}
                                  <div style={{ display: "grid", gridTemplateColumns: `1fr ${activeBooks.map(() => "52px").join(" ")}`, gap: 0, padding: "4px 10px", background: "#0e0f1a" }}>
                                    <div style={{ fontSize: 7, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.05em" }}>Player</div>
                                    {activeBooks.map(bk => (
                                      <div key={bk} style={{ fontSize: 7, fontWeight: 700, color: BOOK_COLORS[bk], textAlign: "center" }}>{bk}</div>
                                    ))}
                                  </div>

                                  {/* Player rows */}
                                  {rows.map((p, i) => (
                                    <PropsSportsbookRow
                                      key={`${mKey}:${p.player}:${i}`}
                                      p={p}
                                      i={i}
                                      mKey={mKey}
                                      activeBooks={activeBooks}
                                      allActiveBooks={allActiveBooks}
                                      expandedPropRow={expandedPropRow}
                                      setExpandedPropRow={setExpandedPropRow}
                                      lineupScratchNames={lineupScratchNames}
                                      BOOK_COLORS={BOOK_COLORS}
                                      currentUser={currentUser}
                                      loggedPickIds={loggedPickIds}
                                      selectedGame={game}
                                      slateDate={slateDate}
                                      openAddPickSheet={openAddPickSheet}
                                    />
                                  ))}
                                </>
                              )}
                            </Card>
                          );
                        })}
                      </>
                    )}
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
            BOARD VIEW — HR / Hits / K / Outs / Games
        ════════════════════════════════════ */}
        {view === "board" && (() => {
          const isGameBoard    = boardTab === "games";
          const isPitcherBoard = !isGameBoard && (boardTab === "k" || boardTab === "outs");
          const todayHonolulu = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
          const isHistoricalBoard = !!(researchMode && slateDate && slateDate < todayHonolulu);

          if (isHistoricalBoard) {
            const historyRowsByTab = historicalSnapshot ?? { hits: [], hr: [], k: [], outs: [] };
            const marketOrder = ["hr", "hits", "k", "outs"];
            const totalHistoricalCards = marketOrder.reduce((sum, market) => sum + ((historyRowsByTab[market] ?? []).length), 0);
            const historicalSummary = marketOrder.map((market) => {
              const cards = historyRowsByTab[market] ?? [];
              const resolved = cards.filter(c => c.resultHit !== null && c.resultHit !== undefined);
              const hits = resolved.filter(c => c.resultHit === true).length;
              const pct = resolved.length > 0 ? Math.round((hits / resolved.length) * 100) : null;
              return { market, hits, resolved: resolved.length, pct };
            });
            const marketLabels = { hr: "HR", hits: "Hits", k: "K", outs: "Outs" };
            const boardScoreColor = (s) =>
              s >= 70 ? "#22c55e" : s >= 55 ? "#f59e0b" : s >= 40 ? "#ef4444" : "#6b7280";
            const historicalCards = isGameBoard ? [] : (historyRowsByTab[boardTab] ?? []);
            const historicalRankByKey = historicalCards.reduce((acc, card, idx) => {
              acc[`${card.id}-${card.gamePk}`] = idx + 1;
              return acc;
            }, {});
            const groupedHistoricalCards = (() => {
              const groups = {};
              historicalCards.forEach(c => {
                if (!groups[c.gamePk]) {
                  groups[c.gamePk] = {
                    gamePk: c.gamePk,
                    gameLabel: c.gameLabel ?? `${c.awayTeam ?? "?"} @ ${c.homeTeam ?? "?"}`,
                    gameTime: c.gameTime ?? null,
                    candidates: [],
                  };
                }
                groups[c.gamePk].candidates.push(c);
              });
              return Object.values(groups).sort((a, b) => {
                const ta = a.gameTime ? Date.parse(a.gameTime) : Infinity;
                const tb = b.gameTime ? Date.parse(b.gameTime) : Infinity;
                return ta - tb;
              });
            })();
            const historicalTodayResult = (card) => {
              if (card.resultHit === null || card.resultHit === undefined || card.actualStat == null) return null;
              if (boardTab === "k") return { k: Number(card.actualStat) || 0, live: false };
              if (boardTab === "outs") return { outs: Number(card.actualStat) || 0, live: false };
              if (boardTab === "hits") return { h: Number(card.actualStat) || 0, hr: 0, ab: 3, live: false };
              if (boardTab === "hr") {
                const hr = Number(card.actualStat) || 0;
                return { hr, h: hr > 0 ? 1 : 0, ab: 4, live: false };
              }
              return null;
            };
            const renderHistoricalBoardCandidateCard = (c, i) => {
              const sc = boardScoreColor(c.score ?? 0);
              const boardSummaryRequest = buildBoardSummaryRequest(c, boardTab);
              const summaryText = resolveCardSummaryText(c, boardSummaryRequest, { allowPremium: false });
              const isPremium = false;
              const todayResult = historicalTodayResult(c);

              if (isPitcherBoard) {
                const pitcherMetrics = { ...c };
                return (
                  <PitcherBoardCard
                    key={`${c.id}-${c.gamePk}`}
                    c={c}
                    rank={i + 1}
                    boardTab={boardTab}
                    sc={sc}
                    boardGameStatus="FINAL"
                    todayResult={todayResult}
                    pitcherMetrics={pitcherMetrics}
                    summaryText={summaryText}
                    isPremium={isPremium}
                    preferredBook={preferredBook}
                    onCardClick={() => setWhyModal({ c, type: boardTab, rank: i + 1 })}
                  />
                );
              }

              return (
                <BatterBoardCard
                  key={`${c.id}-${c.gamePk}`}
                  c={c}
                  rank={i + 1}
                  boardTab={boardTab}
                  sc={sc}
                  boardGameStatus="FINAL"
                  todayResult={todayResult}
                  evEdge={null}
                  summaryText={summaryText}
                  isPremium={isPremium}
                  preferredBook={preferredBook}
                  onCardClick={() => setWhyModal({ c, type: boardTab, rank: i + 1 })}
                />
              );
            };

            return (
              <div>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {[["hr", "⚾ HR"], ["hits", "🎯 Hits"], ["k", "⚡ K"], ["outs", "📋 Outs"], ["games", "🎲 Games"]].map(([type, label]) => (
                    <button key={type} onClick={() => setBoardTab(type)}
                      style={{ position: "relative", flex: 1, background: boardTab === type ? "#fbbf24" : "#161827",
                        border: `1px solid ${boardTab === type ? "#fbbf24" : "#1f2437"}`,
                        borderRadius: 8, padding: "7px", fontSize: 10, fontFamily: "monospace",
                        fontWeight: 700, color: boardTab === type ? "#000" : "#9ca3af", cursor: "pointer" }}>
                      {label}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
                    <TierBadge tier="algorithmic" />
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>📅 History — {slateDate}</span>
                  </div>
                  <span style={{ fontSize: 9, color: "#4b5563", fontFamily: "monospace" }}>{totalHistoricalCards} cards snapshotted</span>
                </div>

                {historicalSnapshotLoading && (
                  <Card>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0", justifyContent: "center" }}>
                      <div style={{ width: 18, height: 18, border: "2px solid #1f2437", borderTop: "2px solid #fbbf24", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#6b7280" }}>Loading snapshot for {slateDate}…</span>
                    </div>
                  </Card>
                )}

                {!historicalSnapshotLoading && (
                  <>
                    <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", marginBottom: 10, lineHeight: 1.5 }}>
                      {historicalSummary.map((entry, idx) => (
                        <span key={entry.market}>
                          {marketLabels[entry.market]}: {entry.resolved > 0 ? `${entry.hits}/${entry.resolved} hit (${entry.pct}%)` : "—"}
                          {idx < historicalSummary.length - 1 ? "  ·  " : ""}
                        </span>
                      ))}
                    </div>

                    {isGameBoard && (
                      <Card>
                        <div style={{ textAlign: "center", padding: "24px 0", color: "#6b7280", fontSize: 11 }}>
                          No data available for "Games" tab in history.
                        </div>
                      </Card>
                    )}

                    {!isGameBoard && totalHistoricalCards === 0 && (
                      <Card>
                        <div style={{ textAlign: "center", padding: "24px 0", color: "#6b7280", fontSize: 11, lineHeight: 1.6 }}>
                          <div>No board snapshot found for {slateDate}.</div>
                          <div>Snapshots are saved starting from the date this feature was deployed.</div>
                        </div>
                      </Card>
                    )}

                    {!isGameBoard && totalHistoricalCards > 0 && historicalCards.length === 0 && (
                      <Card>
                        <div style={{ textAlign: "center", padding: "24px 0", color: "#6b7280", fontSize: 11 }}>
                          No {boardTab.toUpperCase()} snapshot cards found for {slateDate}.
                        </div>
                      </Card>
                    )}

                    {!isGameBoard && historicalCards.length > 0 && (
                      <div>
                        {groupedHistoricalCards.map(group => (
                          <BoardGameGroup key={group.gamePk} gameLabel={group.gameLabel} gameTime={group.gameTime} phase="final">
                            {group.candidates.map((item) => renderHistoricalBoardCandidateCard(
                              item,
                              (historicalRankByKey[`${item.id}-${item.gamePk}`] ?? 1) - 1
                            ))}
                          </BoardGameGroup>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          }

          const useSharedBoard = boardSnapshotCoversToday();
          const allowLiveBoardFallback = IS_STATS_SANDBOX || import.meta.env.DEV;
          const boardTabButtons = (
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[["hr", "⚾ HR"], ["hits", "🎯 Hits"], ["k", "⚡ K"], ["outs", "📋 Outs"], ["games", "🎲 Games"]].map(([type, label]) => (
                <button key={type} onClick={() => setBoardTab(type)}
                  style={{ position: "relative", flex: 1, background: boardTab === type ? "#fbbf24" : "#161827",
                    border: `1px solid ${boardTab === type ? "#fbbf24" : "#1f2437"}`,
                    borderRadius: 8, padding: "7px", fontSize: 10, fontFamily: "monospace",
                    fontWeight: 700, color: boardTab === type ? "#000" : "#9ca3af", cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>
          );

          const formatBoardSnapshotTime = (iso) => {
            if (!iso) return null;
            try {
              return new Date(iso).toLocaleString("en-US", {
                timeZone: "Pacific/Honolulu",
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              });
            } catch { return null; }
          };

          if (!useSharedBoard && !allowLiveBoardFallback) {
            if (boardSnapshotLoading) {
              return (
                <div>
                  {boardTabButtons}
                  <Card>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0", justifyContent: "center" }}>
                      <div style={{ width: 18, height: 18, border: "2px solid #1f2437", borderTop: "2px solid #fbbf24", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#6b7280" }}>Loading shared board…</span>
                    </div>
                  </Card>
                </div>
              );
            }
            return (
              <div>
                {boardTabButtons}
                <Card>
                  <div style={{ textAlign: "center", padding: "28px 16px", color: "#9ca3af", fontSize: 11, lineHeight: 1.6 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", marginBottom: 8 }}>Shared board is being built</div>
                    <div>Every user sees the same scores, SIM %, and card text once the daily snapshot is ready.</div>
                    <div style={{ marginTop: 8, color: "#6b7280" }}>
                      Runs at midnight and refreshes at 10 AM Hawaii time. This page rechecks every 90 seconds.
                    </div>
                  </div>
                </Card>
              </div>
            );
          }

          const snapshotPropCandidates = getBoardMarketSnapshot(boardTab);
          const snapshotGameCandidates = getBoardMarketSnapshot(gameSubTab);
          const livePropBoardCandidatesByType = {
            hr:   computeBatterBoard("hr", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits),
            hits: computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits),
            k:    computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal),
            outs: computePitcherBoard("outs", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal),
          };
          const sharedMarketOrLive = (market, liveCandidates) => {
            if (!useSharedBoard) return liveCandidates;
            const snapshotCandidates = getBoardMarketSnapshot(market);
            if (snapshotCandidates === null) return liveCandidates;
            if (Array.isArray(snapshotCandidates) && snapshotCandidates.length > 0) return snapshotCandidates;
            return liveCandidates.length > 0 ? liveCandidates : snapshotCandidates;
          };
          const boardCandidatesByType = {
            hr:   boardTab === "hr"   && useSharedBoard && snapshotPropCandidates !== null
              ? (Array.isArray(snapshotPropCandidates) && snapshotPropCandidates.length > 0 ? snapshotPropCandidates : (livePropBoardCandidatesByType.hr.length > 0 ? livePropBoardCandidatesByType.hr : snapshotPropCandidates))
              : sharedMarketOrLive("hr", livePropBoardCandidatesByType.hr),
            hits: boardTab === "hits" && useSharedBoard && snapshotPropCandidates !== null
              ? (Array.isArray(snapshotPropCandidates) && snapshotPropCandidates.length > 0 ? snapshotPropCandidates : (livePropBoardCandidatesByType.hits.length > 0 ? livePropBoardCandidatesByType.hits : snapshotPropCandidates))
              : sharedMarketOrLive("hits", livePropBoardCandidatesByType.hits),
            k:    boardTab === "k"    && useSharedBoard && snapshotPropCandidates !== null
              ? (Array.isArray(snapshotPropCandidates) && snapshotPropCandidates.length > 0 ? snapshotPropCandidates : (livePropBoardCandidatesByType.k.length > 0 ? livePropBoardCandidatesByType.k : snapshotPropCandidates))
              : sharedMarketOrLive("k", livePropBoardCandidatesByType.k),
            outs: boardTab === "outs" && useSharedBoard && snapshotPropCandidates !== null
              ? (Array.isArray(snapshotPropCandidates) && snapshotPropCandidates.length > 0 ? snapshotPropCandidates : (livePropBoardCandidatesByType.outs.length > 0 ? livePropBoardCandidatesByType.outs : snapshotPropCandidates))
              : sharedMarketOrLive("outs", livePropBoardCandidatesByType.outs),
          };
          const allPropBoardCandidates = boardCandidatesByType[boardTab] ?? [];
          const liveBoardCandidates = allPropBoardCandidates.filter(c =>
            getBoardGamePhase(c.gamePk) === "upcoming"
          );
          const groupBoardCandidates = (candidates) => {
            const groups = {};
            candidates.forEach(c => {
              if (!groups[c.gamePk]) groups[c.gamePk] = { gameLabel: c.gameLabel, gameTime: c.gameTime, gamePk: c.gamePk, candidates: [] };
              groups[c.gamePk].candidates.push(c);
            });
            return Object.values(groups).sort((a, b) => {
              const ta = a.gameTime ? Date.parse(a.gameTime) : Infinity;
              const tb = b.gameTime ? Date.parse(b.gameTime) : Infinity;
              return ta - tb;
            });
          };
          const liveCandidatesByGame = groupBoardCandidates(liveBoardCandidates);
          const lockedCandidatesByGame = useSharedBoard
            ? groupBoardCandidates(allPropBoardCandidates.filter(c => getBoardGamePhase(c.gamePk) !== "upcoming"))
            : (() => {
                const groups = {};
                Object.entries(lockedBoardCandidates).forEach(([gamePk, entry]) => {
                  const candidates = (entry[boardTab] ?? []);
                  if (!candidates.length) return;
                  const first = candidates[0];
                  groups[gamePk] = { gameLabel: first?.gameLabel ?? gamePk, gameTime: first?.gameTime ?? null, gamePk, candidates };
                });
                return Object.values(groups).sort((a, b) => {
                  const ta = a.gameTime ? Date.parse(a.gameTime) : Infinity;
                  const tb = b.gameTime ? Date.parse(b.gameTime) : Infinity;
                  return ta - tb;
                });
              })();
          // ── Scratch substitution for locked batter candidates ───────────────────
          // Called at render-time for each locked batter candidate.
          // • Player still in lineup      → keep as-is
          // • Player scratched, good sub  → swap card to replacement (score ≥ 50)
          // • Player scratched, no sub    → drop slot (return [])
          // • Pitcher boards              → drop if SP is no longer the listed starter
          const applySubstitution = (c) => {
            const lu = liveLineups[c.gamePk];
            if (!lu) return [c]; // no lineup data — keep

            if (isPitcherBoard) {
              // For pitcher boards: check if the locked pitcher is still the probable starter
              const game = activeSlate.find(g => String(g.gamePk) === String(c.gamePk));
              if (!game) return [c];
              const sp = c.team === game.home?.abbr ? game.probablePitchers?.home : game.probablePitchers?.away;
              // If the probable starter changed and no longer matches locked candidate, drop
              if (sp?.id && String(sp.id) !== String(c.id)) return [];
              return [c];
            }

            // Batter board (hits / hr)
            const game      = activeSlate.find(g => String(g.gamePk) === String(c.gamePk));
            const side      = game && String(c.team) === String(game.away?.abbr) ? "away" : "home";
            const lineupArr = lu[side] ?? [];
            const scratchIds = new Set((lu?.scratches?.[side] ?? []).map(s => String(s.id)));

            const isScratched = scratchIds.has(String(c.id)) ||
                                !lineupArr.some(b => String(b.id) === String(c.id));

            if (!isScratched) return [c]; // still playing — keep

            // Find the replacement who took their batting order slot
            const replacement = lineupArr.find(b =>
              b.order === c.order && String(b.id) !== String(c.id)
            );
            if (!replacement?.id) return []; // no one in that slot — drop

            const hlog = liveHittingLog[replacement.id];
            if (!hlog) return []; // no stats yet — drop rather than show empty card

            const pf         = PARK_FACTORS[game?.home?.abbr] ?? NEUTRAL_PARK;
            const facingP    = side === "away" ? game?.pitcher : (game?.awayPitcher ?? game?.pitcher);
            const pitHand    = facingP?.hand ?? "R";
            const sd         = liveStatSplits[`${replacement.id}:hitting`];
            const wxFav      = !!(liveWeather[c.gamePk]?.hrFavorable);

            const repScore   = boardTab === "hr"
              ? hrBoardScore(hlog, replacement.order, pitHand, pf, wxFav, sd)
              : hitBoardScore(hlog, replacement.order, pitHand, pf, sd);

            if (!repScore || repScore < 50) return []; // not worth showing — drop slot

            // Build replacement card (inherits game metadata from original locked card)
            const market   = boardTab === "hr" ? "batter_home_runs" : "batter_hits";
            const ppKey    = String(c.gamePk);
            const props    = Array.isArray(livePlayerProps[ppKey]?.props) ? livePlayerProps[ppKey].props : [];
            const lastName = (replacement.name ?? "").split(" ").pop().toLowerCase();
            const propLine = props.find(p =>
              p.market === market && p.player.toLowerCase().includes(lastName)
            ) ?? null;

            return [{
              ...c,
              id:             replacement.id,
              name:           replacement.name,
              hand:           replacement.hand ?? "R",
              order:          replacement.order,
              team:           c.team,
              score:          repScore,
              avg:            hlog.avg ?? "—",
              propLine,
              isSubstitution: true,
              substitutedFor: c.name,
            }];
          };

          const hasLocked = lockedCandidatesByGame.length > 0;
          // Apply substitutions to each game's locked candidates at render-time.
          // This keeps the localStorage snapshot clean (original locked data)
          // while dynamically handling late scratches without dropping the whole game group.
          const lockedBoardCandidatesForTab = useSharedBoard
            ? lockedCandidatesByGame.flatMap(g => g.candidates)
            : lockedCandidatesByGame.flatMap(g => g.candidates.flatMap(c => applySubstitution(c)));
          const shouldApplyTop20 = boardTop20 && (boardTab === "hits" || boardTab === "hr");
          const computeEVEdge = (c, type) => {
            if (!c?.propLine || (type !== "hr" && type !== "hits")) return null;
            const books = c.propLine.books ?? {};
            const lean = c.score >= 55 ? "over" : "under";
            const bookOdds = ["DK", "FD", "CZR", "MGM", "BET365"].map(b => {
              const entry = books[b];
              if (!entry) return null;
              return lean === "over" ? entry.over : entry.under;
            }).filter(v => v != null && Number.isFinite(Number(v)));
            if (!bookOdds.length) return null;
            const bestOdds = bookOdds.reduce((best, v) => (Number(v) > Number(best) ? v : best));
            const bookImpliedRaw = mlToImplied(Number(bestOdds));
            if (!bookImpliedRaw) return null;
            const modelImpliedRaw = c.score / 100;
            return {
              edge: Math.round((modelImpliedRaw - bookImpliedRaw) * 100),
              bestOdds,
              lean,
              modelImplied: Math.round(modelImpliedRaw * 100),
              bookImplied: Math.round(bookImpliedRaw * 100),
            };
          };
          const evSort = (arr) => {
            if (!boardTop20 || (boardTab !== "hits" && boardTab !== "hr")) return arr;
            return [...arr].sort((a, b) => {
              const evA = computeEVEdge(a, boardTab)?.edge ?? -99;
              const evB = computeEVEdge(b, boardTab)?.edge ?? -99;
              return evB - evA;
            });
          };
          // Top 20 mode ranks ALL candidates (live + locked) together, takes the global
          // top 20, then splits for display. This ensures a locked player ranked #10
          // pre-game stays #10 after their game goes live/final, and the board never
          // shows more than 20 cards total when Top 20 is active.
          const [displayLiveCandidates, displayLockedCandidates, allDisplayCandidates] = (() => {
            const sortedAll = [...liveBoardCandidates, ...lockedBoardCandidatesForTab]
              .sort((a, b) => b.score - a.score);
            if (!shouldApplyTop20) {
              return [liveBoardCandidates, lockedBoardCandidatesForTab, sortedAll];
            }
            // EV-aware global sort → take top 20 → split into upcoming vs locked
            const top20 = evSort([...liveBoardCandidates, ...lockedBoardCandidatesForTab]).slice(0, 20);
            return [
              top20.filter(c => getBoardGamePhase(c.gamePk) === "upcoming"),
              top20.filter(c => getBoardGamePhase(c.gamePk) !== "upcoming"),
              top20,
            ];
          })();
          const displayLiveCandidatesByGame = groupBoardCandidates(displayLiveCandidates);
          const displayLockedCandidatesByGame = groupBoardCandidates(displayLockedCandidates);
          // Game board candidates computed on-the-fly for the active sub-tab,
          // but swapped with locked snapshots once games go live/final.
          const gameBoardCandidates = (() => {
            if (!isGameBoard) return [];
            if (useSharedBoard && snapshotGameCandidates !== null) {
              if (Array.isArray(snapshotGameCandidates) && snapshotGameCandidates.length > 0) return snapshotGameCandidates;
            }
            const live = computeGameBoard(
              gameSubTab, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, blendedPitcherStatsForGameBoard, liveUmpires, liveLineups
            );
            return live.map(c => {
              const locked = lockedGameBoardCandidates[c.gamePk]?.[gameSubTab];
              const phase = getBoardGamePhase(c.gamePk);
              return (locked && phase !== "upcoming") ? locked : c;
            });
          })();
          const totalPitcherSlots = isPitcherBoard
            ? (activeSlate ?? []).filter(g => g.probablePitchers?.home?.id || g.probablePitchers?.away?.id).length * 2
            : 0;
          const totalBatters = isPitcherBoard
            ? totalPitcherSlots
            : Object.values(liveLineups).flatMap(lu => [...(lu.away ?? []), ...(lu.home ?? [])]).length;
          const loadedBatters = useSharedBoard ? allPropBoardCandidates.length : liveBoardCandidates.length;
          const lockedCount = lockedCandidatesByGame.reduce((sum, g) => sum + g.candidates.length, 0);

          const boardScoreColor = (s) =>
            s >= 70 ? "#22c55e" : s >= 55 ? "#f59e0b" : s >= 40 ? "#ef4444" : "#6b7280";

          const lookupBoardResult = (item) => {
            // entityId is the plain player ID; item.id may be a composite string like "hr:592450:745461"
            const rawId = item?.entityId ?? item?.id ?? item?.playerId;
            if (rawId == null || rawId === "") return null;
            const direct = liveBoardResults[rawId]
              ?? liveBoardResults[String(rawId)]
              ?? liveBoardResults[Number(rawId)]
              ?? null;
            if (direct) return direct;
            // If id was composite (market:playerId:gamePk), extract the middle segment
            if (typeof rawId === "string" && rawId.includes(":")) {
              const parts = rawId.split(":");
              const extractedId = parts[1];
              return liveBoardResults[extractedId]
                ?? liveBoardResults[Number(extractedId)]
                ?? null;
            }
            return null;
          };

          const boardOutcome = (type, item) => {
            const result = lookupBoardResult(item);
            if (!result) return null;
            // Mid-game stats stay tentative only while the game is still live
            if (result.live && getBoardGamePhase(item.gamePk) === "live") return null;

            if (type === "hr") return result.ab > 0 ? result.hr > 0 : null;
            if (type === "hits") return result.ab > 0 ? result.h > 0 : null;

            const line = item.propLine?.line ?? item.suggestedLine ?? item.bookLine;
            const lean = item.score >= 55 ? "OVER" : "UNDER";
            if (line === null || line === undefined) return null;

            if (type === "k" || item.propType === "K" || item.market === "pitcher_strikeouts") {
              if (result.k === undefined) return null;
              return lean === "UNDER" ? result.k < line : result.k > line;
            }

            if (type === "outs" || item.propType === "Outs" || item.market === "pitcher_outs") {
              if (result.outs === undefined) return null;
              return lean === "UNDER" ? result.outs < line : result.outs > line;
            }

            return null;
          };

          const lockedCandidatesForType = (type) => {
            if (useSharedBoard) {
              // Use boardCandidatesByType which already handles snapshot-or-live fallback
              const pool = boardCandidatesByType[type] ?? [];
              return pool.filter(item => getBoardGamePhase(item.gamePk) !== "upcoming");
            }
            return Object.values(lockedBoardCandidates).flatMap(g => g[type] ?? []);
          };

          const hitSummary = (type) =>
            summarizeOutcomes(lockedCandidatesForType(type), item => boardOutcome(type, item));

          const tabHitSummary = {
            hr:   hitSummary("hr"),
            hits: hitSummary("hits"),
            k:    hitSummary("k"),
            outs: hitSummary("outs"),
          };

          const gameBoardOutcome = (type, item) => {
            const game = (activeSlate ?? []).find(g => (g.gamePk ?? g.id) === item.gamePk);
            const status = game?.status ?? "";
            const isFinal = status === "Final" || status === "Game Over";
            const liveScore = liveScores[item.gamePk];

            if (type === "nrfi") {
              const box = liveBoxscores[item.gamePk];
              const boxF1 = box?.linescore?.innings?.[0] ?? null;
              const f1 = liveScore?.firstInning ?? (boxF1 ? { away: boxF1.away, home: boxF1.home } : null);
              if ((!f1 || f1.away === null || f1.home === null) && liveScore) {
                if ((liveScore.inning ?? 0) >= 2 && (liveScore.awayScore ?? 0) === 0 && (liveScore.homeScore ?? 0) === 0) {
                  return item.lean === "NRFI";
                }
                if ((liveScore.inning ?? 0) === 1 && liveScore.halfInning === "bottom" && (liveScore.awayScore ?? 0) > 0) {
                  return item.lean !== "NRFI";
                }
              }
              if (!f1 || f1.away === null || f1.home === null) return null;
              const wasNrfi = f1.away === 0 && f1.home === 0;
              return item.lean === "NRFI" ? wasNrfi : !wasNrfi;
            }

            if (!isFinal || !liveScore) return null;

            if (type === "total") {
              const line = parseFloat(item.line);
              if (!Number.isFinite(line)) return null;
              const totalRuns = (liveScore.awayScore ?? 0) + (liveScore.homeScore ?? 0);
              return item.lean === "OVER" ? totalRuns > line : totalRuns < line;
            }

            if (type === "spread") {
              const line = parseFloat(item.line);
              if (!Number.isFinite(line)) return null;
              const awayScore = liveScore.awayScore ?? 0;
              const homeScore = liveScore.homeScore ?? 0;
              if (item.lean === "HOME") return (homeScore + line) > awayScore;
              if (item.lean === "AWAY") return (awayScore + line) > homeScore;
              return null;
            }

            if (type === "ml") {
              const awayScore = liveScore.awayScore ?? 0;
              const homeScore = liveScore.homeScore ?? 0;
              if (awayScore === homeScore) return null;
              if (item.lean === "HOME") return homeScore > awayScore;
              if (item.lean === "AWAY") return awayScore > homeScore;
              return null;
            }

            if (type === "f5ml" || type === "f5spread") {
              const box = liveBoxscores[item.gamePk];
              const innings = box?.linescore?.innings ?? [];
              if (innings.length < 5) return null;

              const f5AwayScore = innings.slice(0, 5).reduce((sum, inn) => sum + (inn?.away ?? 0), 0);
              const f5HomeScore = innings.slice(0, 5).reduce((sum, inn) => sum + (inn?.home ?? 0), 0);

              if (type === "f5ml") {
                if (f5AwayScore === f5HomeScore) return null;
                if (item.lean === "HOME") return f5HomeScore > f5AwayScore;
                if (item.lean === "AWAY") return f5AwayScore > f5HomeScore;
                return null;
              }

              const line = parseFloat(item.line);
              if (!Number.isFinite(line)) return null;
              if (item.lean === "HOME") return (f5HomeScore + line) > f5AwayScore;
              if (item.lean === "AWAY") return (f5AwayScore + line) > f5HomeScore;
              return null;
            }

            return null;
          };

          const gameHitSummary = (type, items) =>
            summarizeOutcomes(items, item => gameBoardOutcome(type, item));

          const getGameBoardCandidatesForSubTab = (sub) => {
            const live = computeGameBoard(
              sub, activeSlate, liveNrfiData, liveWeather, effectiveOddsMap, blendedPitcherStatsForGameBoard, liveUmpires, liveLineups
            );
            if (useSharedBoard) {
              const snapshot = getBoardMarketSnapshot(sub);
              if (snapshot !== null) {
                if (Array.isArray(snapshot) && snapshot.length > 0) return snapshot;
                return live.length > 0 ? live : snapshot;
              }
            }
            return live.map(c => {
              const locked = lockedGameBoardCandidates[c.gamePk]?.[sub];
              const phase = getBoardGamePhase(c.gamePk);
              return (locked && phase !== "upcoming") ? locked : c;
            });
          };

          const gameSubtabHitSummary = {
            nrfi: gameHitSummary("nrfi", getGameBoardCandidatesForSubTab("nrfi")),
            total: gameHitSummary("total", getGameBoardCandidatesForSubTab("total")),
            spread: gameHitSummary("spread", getGameBoardCandidatesForSubTab("spread")),
            ml: gameHitSummary("ml", getGameBoardCandidatesForSubTab("ml")),
            f5ml: gameHitSummary("f5ml", getGameBoardCandidatesForSubTab("f5ml")),
            f5spread: gameHitSummary("f5spread", getGameBoardCandidatesForSubTab("f5spread")),
          };

          const displayedGameBoardScore = (item) => {
            if (!item) return 0;
            const lean = item.lean;
            return lean === "YRFI" || lean === "UNDER" || lean === "AWAY"
              ? 100 - (item.score ?? 0)
              : (item.score ?? 0);
          };

          // Lean color for game board cards
          const leanColor = (lean, leanAbbr = null) =>
            leanAbbr
              ? "#22c55e"
              : lean === "NRFI" || lean === "OVER" || lean === "HOME" ? "#22c55e"
              : lean === "YRFI" || lean === "UNDER" || lean === "AWAY" ? "#ef4444"
            : "#f9fafb";

          return (
            <div>
              {/* Tab Toggle — top row */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[["hr", "⚾ HR"], ["hits", "🎯 Hits"], ["k", "⚡ K"], ["outs", "📋 Outs"], ["games", "🎲 Games"]].map(([type, label]) => (
                  <button key={type} onClick={() => setBoardTab(type)}
                    style={{ position: "relative", flex: 1, background: boardTab === type ? "#fbbf24" : "#161827",
                      border: `1px solid ${boardTab === type ? "#fbbf24" : "#1f2437"}`,
                      borderRadius: 8, padding: "7px", fontSize: 10, fontFamily: "monospace",
                      fontWeight: 700, color: boardTab === type ? "#000" : "#9ca3af", cursor: "pointer" }}>
                    {label}
                    {!isGameBoard && tabHitSummary[type] && (
                      <TabHitBadge
                        hits={tabHitSummary[type].hits}
                        total={tabHitSummary[type].resolved ?? tabHitSummary[type].total}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Games sub-tab row */}
              {isGameBoard && (
                <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
                  {[["nrfi", "NRFI"], ["total", "O/U Total"], ["spread", "Run Line"], ["ml", "Moneyline"], ["f5ml", "F5 ML"], ["f5spread", "F5 RL"]].map(([sub, label]) => (
                    <button key={sub} onClick={() => setGameSubTab(sub)}
                      style={{ position: "relative", flex: 1, background: gameSubTab === sub ? "rgba(129,140,248,0.18)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${gameSubTab === sub ? "#818cf8" : "#1f2437"}`,
                        borderRadius: 6, padding: "5px 4px", fontSize: 9, fontFamily: "monospace",
                        fontWeight: 700, color: gameSubTab === sub ? "#818cf8" : "#6b7280", cursor: "pointer" }}>
                      {label}
                      {gameSubtabHitSummary[sub] && (
                        <TabHitBadge
                          hits={gameSubtabHitSummary[sub].hits}
                          total={gameSubtabHitSummary[sub].resolved ?? gameSubtabHitSummary[sub].total}
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {useSharedBoard ? (
                <div style={{
                  marginBottom: 10, padding: "8px 10px", borderRadius: 8,
                  background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.28)",
                  fontSize: 10, color: "#9ca3af", lineHeight: 1.45, fontFamily: "monospace",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                }}>
                  <div>
                    <span style={{ fontWeight: 800, color: "#22c55e" }}>Shared daily board</span>
                    {boardDailySnapshot?.generatedAt && (
                      <span style={{ color: "#6b7280" }}>
                        {" "}· snapshot {formatBoardSnapshotTime(boardDailySnapshot.generatedAt)} HI
                      </span>
                    )}
                    <span style={{ color: "#4b5563" }}> — same scores &amp; text for all users. Refreshes 10 AM HI + pregame.</span>
                  </div>
                  <button
                    onClick={refreshBoardSnapshot}
                    disabled={boardSnapshotRefreshing}
                    style={{
                      flexShrink: 0, background: "rgba(34,197,94,0.12)",
                      border: "1px solid rgba(34,197,94,0.35)", borderRadius: 6,
                      padding: "3px 9px", fontSize: 9, fontWeight: 700,
                      color: boardSnapshotRefreshing ? "#6b7280" : "#22c55e",
                      fontFamily: "monospace", cursor: boardSnapshotRefreshing ? "default" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {boardSnapshotRefreshing ? "Refreshing…" : "↻ Refresh"}
                  </button>
                </div>
              ) : allowLiveBoardFallback ? (
                <div style={{
                  marginBottom: 10, padding: "8px 10px", borderRadius: 8,
                  background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.28)",
                  fontSize: 10, color: "#9ca3af", lineHeight: 1.45, fontFamily: "monospace",
                }}>
                  <span style={{ fontWeight: 800, color: "#fbbf24" }}>Live board (not shared yet)</span>
                  <span style={{ color: "#6b7280" }}>
                    {" "}— SIM &amp; card text can differ per browser until today&apos;s snapshot exists in Postgres.
                    Run <span style={{ color: "#fbbf24" }}>npm run snapshot:today</span> (backend + DATABASE_URL + ANTHROPIC_API_KEY), then hard-refresh.
                  </span>
                </div>
              ) : null}

              {/* Sub-header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  {(isGameBoard || isPitcherBoard) && <TierBadge tier="algorithmic" />}
                  <span style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {isGameBoard
                      ? (gameSubTab === "nrfi" ? "Ranked by edge · SP ERA · park · weather · umpire"
                         : gameSubTab === "total" ? "Ranked by edge · both SPs ERA · park · weather"
                         : gameSubTab === "spread" ? "Ranked by edge · SP differential · home field · market"
                         : gameSubTab === "ml" ? "Ranked by edge · SP matchup · home field · market implied"
                         : gameSubTab === "f5ml" ? "Ranked by edge · F5 SP matchup · command · umpire · market"
                         : "Ranked by edge · F5 SP differential · command · umpire · market")
                      : boardTab === "hr" ? "Ranked by power · park · wind · matchup"
                      : boardTab === "hits" ? "Ranked by avg · recent form · park · matchup"
                      : boardTab === "k" ? "Ranked by K/9 · umpire · pitch mix · park · recent form"
                      : "Ranked by avg IP · control · recent workload · park"}
                  </span>
                  {(boardTab === "hits" || boardTab === "hr") && (
                    <button
                      onClick={() => setBoardTop20(v => !v)}
                      style={{
                        background: boardTop20 ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${boardTop20 ? "#fbbf24" : "#1f2437"}`,
                        borderRadius: 6,
                        padding: "3px 9px",
                        fontSize: 9,
                        fontWeight: 700,
                        color: boardTop20 ? "#fbbf24" : "#6b7280",
                        fontFamily: "monospace",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      TOP 20
                    </button>
                  )}
                </div>
                <span style={{ fontSize: 9, color: "#4b5563", fontFamily: "monospace" }}>
                  {isGameBoard
                    ? `${(activeSlate ?? []).length} games`
                    : isPitcherBoard
                    ? (totalPitcherSlots > 0 ? `${loadedBatters}/${totalPitcherSlots} live${lockedCount ? ` · ${lockedCount} locked` : ""}` : `${(activeSlate ?? []).length} games · awaiting pitchers`)
                    : `${loadedBatters}/${totalBatters || "?"} live${lockedCount ? ` · ${lockedCount} locked` : ""}`}
                </span>
              </div>

              {/* ── GAME BOARD ── */}
              {isGameBoard && (() => {
                if (!activeSlate?.length) return (
                  <Card><div style={{ textAlign: "center", padding: "24px 0", color: "#6b7280", fontSize: 11 }}>Loading today's slate…</div></Card>
                );
                if (gameBoardCandidates.length === 0) return (
                  <Card><div style={{ textAlign: "center", padding: "24px 0", color: "#6b7280", fontSize: 11 }}>
                    No game data available yet — pitcher stats loading…
                  </div></Card>
                );
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {gameBoardCandidates.map((c, i) => {
                      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
                      const displayScore = displayedGameBoardScore(c);
                      const sc = boardScoreColor(displayScore);
                      const lc = leanColor(c.lean, c.leanAbbr);
                      const boardSummaryRequest = buildBoardSummaryRequest(c, gameSubTab);
                      const gameStatus = getBoardGameStatus(c.gamePk);
                      const liveScore = liveScores[c.gamePk];
                      const finalTotalRuns = gameSubTab === "total" && gameStatus === "FINAL" && liveScore
                        ? (liveScore.awayScore ?? 0) + (liveScore.homeScore ?? 0)
                        : null;
                      const gameHit = (gameSubTab === "nrfi" || gameSubTab === "total" || gameSubTab === "spread" || gameSubTab === "ml" || gameSubTab === "f5ml" || gameSubTab === "f5spread")
                        ? gameBoardOutcome(gameSubTab, c)
                        : null;
                      const homeSPEra = (parseFloat(livePitcherStats[c.homeSP?.id]?.era) || parseFloat(c.homeSP?.era)) || null;
                      const awaySPEra = (parseFloat(livePitcherStats[c.awaySP?.id]?.era) || parseFloat(c.awaySP?.era)) || null;
                      const useSnapshotOnly = useSharedBoard && isGameBoard;
                      const summaryText = resolveCardSummaryText(c, boardSummaryRequest, { allowPremium: !useSnapshotOnly });
                      const premiumLine = !useSnapshotOnly ? aiCardSummaries[`premium:${boardSummaryRequest?.id}`] : null;
                      const isPremium = !!(premiumLine && summaryText === premiumLine);
                      const pickId = `${currentUser?.userId ?? currentUser?.username}:${c.gamePk}:${gameSubTab}:${today}`;
                      const isLogged = loggedPickIds.has(pickId);
                      const handleAddPick = () => {
                        if (!currentUser || (slateDate && slateDate < today)) return;
                        const matchup = `${c.away?.abbr ?? "?"} @ ${c.home?.abbr ?? "?"}`;
                        // Derive a sensible book line for the relevant market
                        const dk = c.odds?.books?.DK;
                        const bookLine = (() => {
                          if (gameSubTab === "total") return dk?.total ?? null;
                          if (gameSubTab === "spread") return c.leanAbbr === c.away?.abbr ? dk?.awaySpread : dk?.homeSpread ?? null;
                          if (gameSubTab === "f5spread") return c.leanAbbr === c.away?.abbr ? (dk?.f5AwaySpread ?? dk?.awaySpread) : (dk?.f5HomeSpread ?? dk?.homeSpread) ?? null;
                          return null;
                        })();
                        openAddPickSheet({
                          playerId: String(c.gamePk),
                          playerName: matchup,
                          gameLabel: matchup,
                          market: gameSubTab,
                          side: c.lean ?? c.leanAbbr ?? "over",
                          bookLine: bookLine != null && Number.isFinite(Number(bookLine)) ? Number(bookLine) : null,
                          source: "board",
                        });
                      };
                      return (
                        <GameBoardCard
                          key={c.gamePk}
                          c={c}
                          rank={i + 1}
                          gameSubTab={gameSubTab}
                          sc={sc}
                          lc={lc}
                          displayScore={displayScore}
                          gameStatus={gameStatus}
                          gameHit={gameHit}
                          finalTotalRuns={finalTotalRuns}
                          homeSPEra={homeSPEra}
                          awaySPEra={awaySPEra}
                          summaryText={summaryText}
                          isPremium={isPremium}
                          preferredBook={preferredBook}
                          onCardClick={() => setWhyModal({ c, type: gameSubTab, rank: i + 1 })}
                          onAddPick={handleAddPick}
                          isLogged={isLogged}
                        />
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── PROP BOARD (HR / Hits / K / Outs) ── */}
              {!isGameBoard && liveBoardCandidates.length === 0 && !hasLocked ? (
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
                          return !activeSlate?.length ? "Loading today's slate…" : "Loading player stats — check back shortly";
                        })()}
                  </div>
                </Card>
              ) : !isGameBoard && (() => {
                const renderBoardCandidateCard = (c, i) => {
                  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
                  const sc = boardScoreColor(c.score);
                  const boardGameStatus = getBoardGameStatus(c.gamePk);
                  const boardSummaryRequest = buildBoardSummaryRequest(c, boardTab);
                  const useSnapshotOnly = useSharedBoard;
                  const summaryText = resolveCardSummaryText(c, boardSummaryRequest, { allowPremium: !useSnapshotOnly });
                  const premiumLine = !useSnapshotOnly ? aiCardSummaries[`premium:${boardSummaryRequest?.id}`] : null;
                  const isPremium = !!(premiumLine && summaryText === premiumLine);
                  const todayResult = lookupBoardResult(c);
                  const pickId = `${currentUser?.userId ?? currentUser?.username}:${c.id}:${boardTab}:${today}`;
                  const isLogged = loggedPickIds.has(pickId);
                  const handleAddPick = () => {
                    if (!currentUser || (slateDate && slateDate < today)) return;
                    const rawLine = c.propLine?.books?.DK?.line ?? c.propLine?.line ?? c.suggestedLine;
                    const bookLine = rawLine != null && Number.isFinite(Number(rawLine)) ? Number(rawLine) : null;
                    openAddPickSheet({
                      playerId: String(c.id),
                      playerName: c.name,
                      gameLabel: c.gameLabel ?? "",
                      market: boardTab,
                      side: c.lean ?? (c.score >= 55 ? "over" : "under"),
                      bookLine,
                      source: "board",
                    });
                  };

                  if (isPitcherBoard) {
                    const pitcherMetrics = {
                      ...(livePitcherStats[c.id] ?? {}),
                      ...c,
                      ...(pitcherArsenal[c.id]?.pitcherStats ? {
                        swStrPct: pitcherArsenal[c.id].pitcherStats.swStrPct,
                        chasePct: pitcherArsenal[c.id].pitcherStats.oSwingPct,
                      } : {}),
                    };
                    return (
                      <PitcherBoardCard
                        key={`${c.id}-${c.gamePk}`}
                        c={c}
                        rank={i + 1}
                        boardTab={boardTab}
                        sc={sc}
                        boardGameStatus={boardGameStatus}
                        todayResult={todayResult}
                        pitcherMetrics={pitcherMetrics}
                        summaryText={summaryText}
                        isPremium={isPremium}
                        preferredBook={preferredBook}
                        onCardClick={() => setWhyModal({ c, type: boardTab, rank: i + 1 })}
                        onAddPick={handleAddPick}
                        isLogged={isLogged}
                      />
                    );
                  }

                  return (
                    <BatterBoardCard
                      key={`${c.id}-${c.gamePk}`}
                      c={c}
                      rank={i + 1}
                      boardTab={boardTab}
                      sc={sc}
                      boardGameStatus={boardGameStatus}
                      todayResult={todayResult}
                      evEdge={computeEVEdge(c, boardTab)}
                      summaryText={summaryText}
                      isPremium={isPremium}
                      preferredBook={preferredBook}
                      onCardClick={() => setWhyModal({ c, type: boardTab, rank: i + 1 })}
                      onAddPick={handleAddPick}
                      isLogged={isLogged}
                    />
                  );
                };

                const candidateKey = (item) => `${item.id}-${item.gamePk}`;
                return (
                  <>
                    {displayLiveCandidatesByGame.length > 0 && (
                      <div style={{ marginBottom: hasLocked ? 16 : 0 }}>
                        {displayLiveCandidatesByGame.map(group => (
                          <BoardGameGroup key={group.gamePk} gameLabel={group.gameLabel} gameTime={group.gameTime} phase={null}>
                            {group.candidates.map(item => renderBoardCandidateCard(
                              item,
                              Math.max(0, allDisplayCandidates.findIndex(c => candidateKey(c) === candidateKey(item)))
                            ))}
                          </BoardGameGroup>
                        ))}
                      </div>
                    )}

                    {displayLiveCandidatesByGame.length === 0 && !hasLocked && (
                      <div style={{ textAlign: "center", color: "#4b5563", fontSize: 12, padding: "24px 0" }}>
                        No confirmed lineups yet
                      </div>
                    )}

                    {hasLocked && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: "monospace",
                          letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 2px 8px",
                          display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#a855f7" }}>⊘</span> Locked · in play / final
                        </div>
                        {displayLockedCandidatesByGame.map(group => {
                          const phase = getBoardGamePhase(group.gamePk);
                          return (
                            <BoardGameGroup key={group.gamePk} gameLabel={group.gameLabel} gameTime={group.gameTime} phase={phase}>
                              {group.candidates.map(item => renderBoardCandidateCard(
                                item,
                                Math.max(0, allDisplayCandidates.findIndex(c => candidateKey(c) === candidateKey(item)))
                              ))}
                            </BoardGameGroup>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          );
        })()}

        {/* ════════════════════════════════════
            SCOUT VIEW
        ════════════════════════════════════ */}
        {view === "scout" && isScoutUser && (() => {
          const goalOptions = [25, 50, 75, 100];
          const unitOptions = [10, 25, 50];
          const slatePicks = scoutSlate?.picks ?? [];
          const math = scoutSlate?.math ?? scoutMath([], scoutUnit, scoutGoal);
          const previewNeeded = picksNeeded(scoutGoal, scoutUnit);
          const formatOdds = (odds) => (odds == null ? "—" : odds > 0 ? `+${odds}` : `${odds}`);
          const gradeScoutPick = (pick) => {
            if (pick.market === "k" || pick.market === "outs") {
              const result = liveBoardResults[pick.entityId] ?? null;
              if (!result || result.live || pick.bookLine == null) return null;
              const actual = pick.market === "k" ? result.k : result.outs;
              if (typeof actual !== "number") return null;
              return pick.lean === "UNDER" ? actual < pick.bookLine : actual > pick.bookLine;
            }
            return null;
          };
          const settled = slatePicks.reduce((acc, pick) => {
            const grade = gradeScoutPick(pick);
            if (grade === null) return acc;
            const winAmt = pick.bookOdds > 0 ? (scoutUnit * pick.bookOdds / 100) : (scoutUnit * 100 / Math.abs(pick.bookOdds || 1));
            acc.resolved += 1;
            if (grade) {
              acc.hits += 1;
              acc.net += winAmt;
            } else {
              acc.net -= scoutUnit;
            }
            return acc;
          }, { hits: 0, resolved: 0, net: 0 });

          return (
            <div style={{ padding: "12px 0" }}>
              <Card style={{ padding: "14px 14px 12px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>🎯 THE SCOUT</div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4, lineHeight: 1.5 }}>
                      Builds a bankroll-aware slate from the strongest live edges, then adds short bettor-style reasoning for each play.
                    </div>
                  </div>
                  {settled.resolved > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                      <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                        {settled.hits}/{settled.resolved} hit
                      </span>
                      <span style={{ fontSize: 10, color: settled.net >= 0 ? "#22c55e" : "#f87171", fontFamily: "monospace", fontWeight: 700 }}>
                        {settled.net >= 0 ? "+" : ""}${settled.net.toFixed(2)} tracked
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>DAILY GOAL</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {goalOptions.map((goal) => (
                        <button
                          key={goal}
                          onClick={() => setScoutGoal(goal)}
                          style={{
                            background: scoutGoal === goal ? "#22c55e" : "#161827",
                            border: `1px solid ${scoutGoal === goal ? "#22c55e" : "#2d3148"}`,
                            borderRadius: 7,
                            padding: "5px 10px",
                            fontSize: 10,
                            fontWeight: 700,
                            color: scoutGoal === goal ? "#000" : "#9ca3af",
                            fontFamily: "monospace",
                            cursor: "pointer",
                          }}
                        >
                          ${goal}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>UNIT SIZE</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {unitOptions.map((unit) => (
                        <button
                          key={unit}
                          onClick={() => setScoutUnit(unit)}
                          style={{
                            background: scoutUnit === unit ? "#a78bfa" : "#161827",
                            border: `1px solid ${scoutUnit === unit ? "#a78bfa" : "#2d3148"}`,
                            borderRadius: 7,
                            padding: "5px 10px",
                            fontSize: 10,
                            fontWeight: 700,
                            color: scoutUnit === unit ? "#000" : "#9ca3af",
                            fontFamily: "monospace",
                            cursor: "pointer",
                          }}
                        >
                          ${unit}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: windowWidth > 720 ? "repeat(4, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 14 }}>
                  <div style={{ background: "#111322", border: "1px solid #1f2437", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 8, color: "#4b5563", fontWeight: 700, marginBottom: 4 }}>TARGET</div>
                    <div style={{ fontSize: 14, color: "#f9fafb", fontWeight: 800, fontFamily: "monospace" }}>${scoutGoal}</div>
                  </div>
                  <div style={{ background: "#111322", border: "1px solid #1f2437", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 8, color: "#4b5563", fontWeight: 700, marginBottom: 4 }}>UNITS NEEDED</div>
                    <div style={{ fontSize: 14, color: "#f9fafb", fontWeight: 800, fontFamily: "monospace" }}>{previewNeeded}</div>
                  </div>
                  <div style={{ background: "#111322", border: "1px solid #1f2437", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 8, color: "#4b5563", fontWeight: 700, marginBottom: 4 }}>RISK ESTIMATE</div>
                    <div style={{ fontSize: 14, color: "#f9fafb", fontWeight: 800, fontFamily: "monospace" }}>${(previewNeeded * scoutUnit).toFixed(0)}</div>
                  </div>
                  <div style={{ background: "#111322", border: "1px solid #1f2437", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 8, color: "#4b5563", fontWeight: 700, marginBottom: 4 }}>ASSUMED HIT RATE</div>
                    <div style={{ fontSize: 14, color: "#f9fafb", fontWeight: 800, fontFamily: "monospace" }}>62.5%</div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                  <button
                    onClick={() => handleBuildScoutSlate({ force: false })}
                    disabled={scoutSlateLoading || !liveSlate?.length}
                    style={{
                      background: scoutSlateLoading || !liveSlate?.length ? "#1e2030" : "#22c55e",
                      border: "none",
                      borderRadius: 8,
                      padding: "9px 12px",
                      fontSize: 11,
                      fontWeight: 800,
                      color: scoutSlateLoading || !liveSlate?.length ? "#4b5563" : "#000",
                      fontFamily: "monospace",
                      cursor: scoutSlateLoading || !liveSlate?.length ? "default" : "pointer",
                    }}
                  >
                    {scoutSlateLoading ? "Building…" : "Build Scout Slate"}
                  </button>
                  <button
                    onClick={() => {
                      localStorage.removeItem("scout_slate_v1");
                      handleBuildScoutSlate({ force: true });
                    }}
                    disabled={scoutSlateLoading || !liveSlate?.length}
                    style={{
                      background: "#161827",
                      border: "1px solid #2d3148",
                      borderRadius: 8,
                      padding: "9px 12px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: scoutSlateLoading || !liveSlate?.length ? "#4b5563" : "#9ca3af",
                      fontFamily: "monospace",
                      cursor: scoutSlateLoading || !liveSlate?.length ? "default" : "pointer",
                    }}
                  >
                    Regenerate
                  </button>
                  {scoutSlate?.createdAt && (
                    <span style={{ fontSize: 9, color: "#6b7280", fontFamily: "monospace" }}>
                      Cached {new Date(scoutSlate.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </Card>

              {scoutSlateError && (
                <div style={{ marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", borderRadius: 8, padding: "10px 12px", fontSize: 10, color: "#fca5a5" }}>
                  {scoutSlateError}
                </div>
              )}

              {scoutSlateLoading && (
                <div style={{ textAlign: "center", padding: 48, color: "#6b7280", fontSize: 11 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
                  Scout is building your slate…
                </div>
              )}

              {!scoutSlateLoading && scoutSlate && (
                <Card style={{ padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>
                        {scoutSlate.date === new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" }) ? "Today’s Scout Slate" : `Scout Slate · ${scoutSlate.date}`}
                      </div>
                      <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                        {math.picksCount} play{math.picksCount !== 1 ? "s" : ""} · ${scoutSlate.unit} unit · avg pricing varies by market
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", background: "#141726", border: "1px solid #1f2437", borderRadius: 999, padding: "4px 8px", fontFamily: "monospace" }}>
                        Risk ${math.totalRisked.toFixed(0)}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.28)", borderRadius: 999, padding: "4px 8px", fontFamily: "monospace" }}>
                        62.5% net ${math.net625.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.28)", borderRadius: 999, padding: "4px 8px", fontFamily: "monospace" }}>
                        Break-even {math.breakEvenPct}% ({math.breakEvenHits})
                      </span>
                    </div>
                  </div>
                </Card>
              )}

              {!scoutSlateLoading && scoutSlate && slatePicks.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>
                  No Scout plays qualified from the current slate. This usually means the live edge filter was too thin or odds were missing.
                </div>
              )}

              {!scoutSlateLoading && scoutSlate && slatePicks.length > 0 && (
                <div>
                  {slatePicks.map((pick, idx) => (
                    <ScoutPickCard
                      key={pick.id}
                      c={pick}
                      rank={idx + 1}
                      unitSize={scoutSlate.unit}
                      gradeResult={gradeScoutPick(pick)}
                    />
                  ))}
                  <div style={{ fontSize: 9, color: "#4b5563", marginTop: 8, lineHeight: 1.5 }}>
                    Live grading currently covers K and outs props. Game-market Scout picks stay ungraded until a dedicated resolver is added.
                  </div>
                </div>
              )}

              {!scoutSlateLoading && !scoutSlate && (
                <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>
                  Set your goal and unit size, then let Scout build a slate from the strongest {formatOdds(-110)}-style edge plays on the board.
                </div>
              )}
            </div>
          );
        })()}

        {/* ════════════════════════════════════
            AI BOARD VIEW
        ════════════════════════════════════ */}
        {view === "ai-board" && isScoutUser && (() => {
          const MARKET_META = {
            k:    { label: "K Prop",   color: "#38bdf8" },
            outs: { label: "Outs",     color: "#a78bfa" },
            hr:   { label: "HR",       color: "#fb923c" },
            hits: { label: "Hits",     color: "#34d399" },
            f5ml: { label: "F5 ML",    color: "#fbbf24" },
          };
          const getAiBoardGrade = (c) => {
            const todayResult = liveBoardResults[c.entityId ?? c.id] ?? null;
            if (c.market === "k" || c.market === "outs") {
              const hasResolvedResult = !!todayResult && !todayResult.live;
              const propLineValue = c.propLine?.line ?? c.suggestedLine;
              const boardLean = c.score >= 55 ? "OVER" : "UNDER";
              if (!hasResolvedResult || propLineValue == null) return null;
              return c.market === "k"
                ? (boardLean === "UNDER" ? todayResult.k < propLineValue : todayResult.k > propLineValue)
                : (boardLean === "UNDER" ? todayResult.outs < propLineValue : todayResult.outs > propLineValue);
            }

            const boardGameStatus = getBoardGameStatus(c.gamePk);
            const hasResult = todayResult && todayResult.ab > 0;
            if (c.market === "hr") {
              if (boardGameStatus !== "FINAL") return null;
              return hasResult ? todayResult.hr > 0 : false;
            }
            if (c.market === "hits") {
              if (boardGameStatus !== "FINAL") return null;
              if (!todayResult || typeof todayResult.h !== "number") return null;
              return todayResult.h > 0;
            }
            if (c.market === "f5ml") {
              const box = liveBoxscores[c.gamePk] ?? liveBoxscores[c.entityId];
              if (!box?.isFinal) return null;
              const innings = box.linescore?.innings ?? [];
              if (innings.length < 5) return null;
              const f5Away = innings.slice(0, 5).reduce((sum, inn) => sum + (inn?.away ?? 0), 0);
              const f5Home = innings.slice(0, 5).reduce((sum, inn) => sum + (inn?.home ?? 0), 0);
              if (f5Away === f5Home) return null;
              const leanWon = c.lean === "HOME" ? f5Home > f5Away : f5Away > f5Home;
              return leanWon;
            }
            return null;
          };
          const aiBoardSettled = (lockedAiBoardSnapshot ?? aiBoardData ?? []).reduce((acc, c) => {
            const grade = getAiBoardGrade(c);
            if (grade === true) {
              acc.hits += 1;
              acc.graded += 1;
            } else if (grade === false) {
              acc.graded += 1;
            }
            return acc;
          }, { hits: 0, graded: 0 });
          const aiBoardTabHitSummary = ["k", "outs", "hr", "hits", "f5ml"].reduce((acc, mkt) => {
            const mktCards = (lockedAiBoardSnapshot ?? aiBoardData ?? []).filter(c => c.market === mkt);
            const settled = mktCards.reduce((sum, c) => {
              const grade = getAiBoardGrade(c);
              if (grade === true) sum.hits += 1;
              if (grade !== null) sum.graded += 1;
              return sum;
            }, { hits: 0, graded: 0 });
            acc[mkt] = settled;
            return acc;
          }, {});

          return (
            <div style={{ padding: "12px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>🤖 AI BOARD</span>
                    <TierBadge tier="ai" />
                    {aiBoardSettled.graded > 0 && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                        {aiBoardSettled.hits}/{aiBoardSettled.graded} hit
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>AI-scored picks across all markets · ranked by AI confidence</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {[
                  ["all", "All"],
                  ["k", "K"],
                  ["outs", "Outs"],
                  ["hr", "HR"],
                  ["hits", "Hits"],
                  ["f5ml", "F5 ML"],
                ].map(([mkt, label]) => {
                  const isActive = aiBoardTab === mkt;
                  const summary = mkt !== "all" ? aiBoardTabHitSummary[mkt] : null;
                  return (
                    <button
                      key={mkt}
                      onClick={() => setAiBoardTab(mkt)}
                      style={{
                        background: isActive ? "rgba(167,139,250,0.18)" : "#161827",
                        border: `1px solid ${isActive ? "rgba(167,139,250,0.45)" : "#1f2437"}`,
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontSize: 10,
                        fontWeight: 700,
                        color: isActive ? "#a78bfa" : "#9ca3af",
                        cursor: "pointer",
                        fontFamily: "monospace",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span>{label}</span>
                      {summary?.graded > 0 && (
                        <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 999, padding: "1px 6px", fontFamily: "monospace" }}>
                          {summary.hits}/{summary.graded}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {aiBoardEdgesMeta.generatedAt && (
                <div style={{ fontSize: 9, color: "#4b5563", textAlign: "center", marginBottom: 8, fontFamily: "monospace" }}>
                  Shared daily snapshot
                  {aiBoardEdgesMeta.generatedAt
                    ? ` · ${new Date(aiBoardEdgesMeta.generatedAt).toLocaleString("en-US", { timeZone: "Pacific/Honolulu", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })} HI`
                    : ""}
                </div>
              )}

              {aiBoardLoading && (
                <div style={{ textAlign: "center", padding: 48, color: "#6b7280", fontSize: 11 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
                  Loading today&apos;s AI Board…
                </div>
              )}

              {!aiBoardLoading && aiBoardData === null && (
                <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>
                  Loading AI Board…
                </div>
              )}

              {!aiBoardLoading && aiBoardData?.length > 0 && (
                <div>
                  {(() => {
                    const visibleCards = aiBoardTab === "all"
                      ? aiBoardData
                      : aiBoardData.filter(c => c.market === aiBoardTab);
                    if (visibleCards.length === 0) {
                      const otherMarkets = [...new Set((aiBoardData ?? []).map(c => c.market))];
                      const hasOtherMarkets = aiBoardTab !== "all" && otherMarkets.length > 0;
                      return (
                        <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>
                          {hasOtherMarkets
                            ? `No ${aiBoardTab.toUpperCase()} candidates available yet. Try ${otherMarkets.map(m => (MARKET_META[m]?.label ?? m)).join(" / ")} or All.`
                            : `No ${aiBoardTab.toUpperCase()} candidates available.`}
                        </div>
                      );
                    }
                    return visibleCards.map((c, i) => {
                    const meta = MARKET_META[c.market] ?? { label: c.market, color: "#6b7280" };
                    const aiColor = c.aiScore >= 75 ? "#34d399" : c.aiScore >= 55 ? "#fbbf24" : "#f87171";
                    const aiGrade = getAiBoardGrade(c);
                    const resultBorderColor = aiGrade === true ? "#22c55e" : aiGrade === false ? "#ef4444" : null;
                    const resultCardStyle = {
                      ...resultBorderStyle(resultBorderColor),
                      ...(resultBorderColor ? { borderColor: resultBorderColor } : {}),
                    };
                    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
                    const abEnrichedBookLine = getAiBookLine(c);
                    const abPlayerId = String(c.entityId ?? c.id ?? c.gamePk);
                    const abPickId = `${currentUser?.userId ?? currentUser?.username}:${abPlayerId}:${c.market}:${today}`;
                    const abIsLogged = loggedPickIds.has(abPickId);
                    const abGameStatus = getBoardGameStatus(c.gamePk);
                    const abIsGameDone = abGameStatus === "LIVE" || abGameStatus === "FINAL";
                    return (
                      <Card key={c.id} style={{ position: "relative", marginBottom: 8, padding: "10px 12px", ...resultCardStyle }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!abIsLogged && !abIsGameDone && currentUser) {
                              openAddPickSheet({
                                playerId: abPlayerId,
                                playerName: c.name ?? c.gameLabel ?? "",
                                gameLabel: c.gameLabel ?? "",
                                market: c.market,
                                side: (c.lean ?? "over").toLowerCase(),
                                bookLine: abEnrichedBookLine != null && Number.isFinite(Number(abEnrichedBookLine)) ? Number(abEnrichedBookLine) : null,
                                source: "ai-board",
                              });
                            }
                          }}
                          style={{
                            position: "absolute", bottom: 6, right: 8,
                            width: 18, height: 18, borderRadius: "50%",
                            fontSize: 12, fontWeight: 800,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            border: abIsLogged ? "1px solid rgba(59,130,246,0.4)" : abIsGameDone ? "1px solid rgba(55,65,81,0.4)" : "1px solid rgba(107,114,128,0.4)",
                            background: "transparent",
                            color: abIsLogged ? "#3b82f6" : abIsGameDone ? "#374151" : "#6b7280",
                            cursor: abIsLogged ? "not-allowed" : abIsGameDone ? "default" : "pointer",
                          }}
                          title={abIsLogged ? "Already logged" : abIsGameDone ? "Game started" : "Log pick"}
                        >
                          {abIsLogged ? "✓" : "+"}
                        </button>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
                            <div style={{ width: 22, height: 22, borderRadius: 6, background: "#1e2030", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#6b7280" }}>{i + 1}</div>
                            <div style={{ fontSize: 20, fontWeight: 900, color: aiColor, fontFamily: "monospace", lineHeight: 1 }}>{c.aiScore}</div>
                            <div style={{ fontSize: 7, color: "#4b5563", fontFamily: "monospace" }}>AI</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                              <div style={{ background: "#141726", border: "1px solid #1f2437", borderRadius: 5, padding: "2px 5px", textAlign: "center" }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", fontFamily: "monospace" }}>{c.score}</div>
                                <div style={{ fontSize: 6, color: "#374151" }}>ALG</div>
                              </div>
                              {c.simConfidence != null && (
                                <div style={{ background: "#141726", border: "1px solid #1f2437", borderRadius: 5, padding: "2px 5px", textAlign: "center" }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", fontFamily: "monospace" }}>{c.simConfidence}%</div>
                                  <div style={{ fontSize: 6, color: "#374151" }}>SIM</div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                              {c.market === "f5ml" ? (
                                <>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{c.gameLabel}</span>
                                  <span style={{ fontSize: 8, fontWeight: 700, color: meta.color,
                                    background: `${meta.color}18`, border: `1px solid ${meta.color}40`,
                                    borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>{meta.label}</span>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24",
                                    background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)",
                                    borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>
                                    {c.lean} {c.bookLine ?? "—"}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{c.name}</span>
                                  <span style={{ fontSize: 8, fontWeight: 700, color: meta.color, background: `${meta.color}18`, border: `1px solid ${meta.color}40`, borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>{meta.label}</span>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: "#000", background: "#374151", borderRadius: 4, padding: "1px 5px" }}>{c.team}</span>
                                </>
                              )}
                              {aiGrade === true && (
                                <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 4, padding: "1px 6px" }}>
                                  ✓ HIT
                                </span>
                              )}
                              {aiGrade === false && (
                                <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 4, padding: "1px 6px" }}>
                                  ✗ MISS
                                </span>
                              )}
                            </div>
                            {c.market === "f5ml" ? (
                              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                                {c.stats?.homeSP && c.stats?.awaySP
                                  ? `${c.stats.awaySP} vs ${c.stats.homeSP}`
                                  : c.leanLabel ?? c.gameLabel}
                              </div>
                            ) : (
                              <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: c.aiReason ? 4 : 0 }}>{c.gameLabel}</div>
                            )}
                            {(() => {
                              const premiumText = aiCardSummaries[`premium:${c.id}`];
                              const summaryText = premiumText ?? c.aiReason ?? null;
                              if (!summaryText) return null;
                              return (
                                <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginTop: 2 }}>
                                  {premiumText && (
                                    <span style={{ fontSize: 8, color: "#a78bfa", fontFamily: "monospace", fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✦</span>
                                  )}
                                  <div style={{ fontSize: 10, color: "#d1d5db", fontStyle: "italic", lineHeight: 1.4 }}>{summaryText}</div>
                                </div>
                              );
                            })()}
                            {abEnrichedBookLine != null && (
                              <div style={{ marginTop: 4, fontSize: 9, color: "#6b7280" }}>
                                Line: <span style={{ color: "#9ca3af", fontFamily: "monospace" }}>{abEnrichedBookLine}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                    });
                  })()}
                </div>
              )}

              {!aiBoardLoading && Array.isArray(aiBoardData) && aiBoardData.length === 0 && aiBoardEdgesMeta.fallback && (
                <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11, lineHeight: 1.5 }}>
                  Today&apos;s AI picks are being generated. Check back after 10 AM Hawaii time (or after the midnight preload finishes).
                </div>
              )}

              {!aiBoardLoading && Array.isArray(aiBoardData) && aiBoardData.length === 0 && !aiBoardEdgesMeta.fallback && (
                <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>No AI Board picks available for today&apos;s slate.</div>
              )}
            </div>
          );
        })()}

        {/* ══════════════════════════════════════
            PREDICT VIEW
        ══════════════════════════════════════ */}
        {view === "predict" && isScoutUser && (() => {
          const MIN_EDGE = 0.08;

          const MARKET_META = {
            k:    { label: "K Prop", color: "#38bdf8" },
            outs: { label: "Outs",   color: "#a78bfa" },
            hr:   { label: "HR",     color: "#fb923c" },
            hits: { label: "Hits",   color: "#34d399" },
            f5ml: { label: "F5 ML",  color: "#fbbf24" },
          };

          const gradeCandidate = (c) => {
            const todayResult = liveBoardResults[c.entityId ?? c.id] ?? null;
            if (c.market === "k" || c.market === "outs") {
              const hasResolvedResult = !!todayResult && !todayResult.live;
              const propLineValue = c.bookLine;
              const boardLean = c.lean;
              if (!hasResolvedResult || propLineValue == null) return null;
              return c.market === "k"
                ? (boardLean === "UNDER" ? todayResult.k < propLineValue : todayResult.k > propLineValue)
                : (boardLean === "UNDER" ? todayResult.outs < propLineValue : todayResult.outs > propLineValue);
            }
            const boardGameStatus = getBoardGameStatus(c.gamePk);
            const hasResult = todayResult && todayResult.ab > 0;
            if (c.market === "hr") {
              if (boardGameStatus !== "FINAL") return null;
              return hasResult ? todayResult.hr > 0 : false;
            }
            if (c.market === "hits") {
              if (boardGameStatus !== "FINAL") return null;
              if (!todayResult || typeof todayResult.h !== "number") return null;
              return todayResult.h > 0;
            }
            if (c.market === "f5ml") {
              const box = liveBoxscores[c.gamePk] ?? liveBoxscores[c.entityId];
              if (!box?.isFinal) return null;
              const innings = box.linescore?.innings ?? [];
              if (innings.length < 5) return null;
              const f5Away = innings.slice(0, 5).reduce((sum, inn) => sum + (inn?.away ?? 0), 0);
              const f5Home = innings.slice(0, 5).reduce((sum, inn) => sum + (inn?.home ?? 0), 0);
              if (f5Away === f5Home) return null;
              return c.lean === "HOME" ? f5Home > f5Away : f5Away > f5Home;
            }
            return null;
          };

          const predictSettled = (lockedAiBoardSnapshot ?? aiBoardData ?? [])
            .filter(c => c.edge != null && c.edge >= MIN_EDGE)
            .reduce((acc, c) => {
              const grade = gradeCandidate(c);
              if (grade === true)  { acc.hits++; acc.graded++; }
              if (grade === false) { acc.graded++; }
              return acc;
            }, { hits: 0, graded: 0 });

          const allEdgePlays = (aiBoardData ?? [])
            .filter(c => c.edge != null && c.edge >= MIN_EDGE)
            .sort((a, b) => b.edge - a.edge);

          const upcomingPlays = allEdgePlays.filter(c => getBoardGamePhase(c.gamePk) === "upcoming");
          const lockedPlays   = allEdgePlays.filter(c => getBoardGamePhase(c.gamePk) !== "upcoming");

          const BUCKETS = [
            { label: "55–64%", min: 55, max: 64, mid: 59.5 },
            { label: "65–74%", min: 65, max: 74, mid: 69.5 },
            { label: "75–84%", min: 75, max: 84, mid: 79.5 },
            { label: "85%+",   min: 85, max: 100, mid: 90   },
          ];

          const calibrationBuckets = BUCKETS.map(b => {
            const inBucket = (lockedAiBoardSnapshot ?? []).filter(c =>
              c.simConfidence != null &&
              c.simConfidence >= b.min &&
              c.simConfidence <= b.max
            );
            let hits = 0, total = 0;
            for (const c of inBucket) {
              const grade = gradeCandidate(c);
              if (grade === true)  { hits++; total++; }
              if (grade === false) { total++; }
            }
            const actualRate = total > 0 ? hits / total : null;
            return { ...b, hits, total, actualRate };
          });

          const renderEdgeCard = (c) => {
            const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
            const enrichedC = { ...c, bookLine: getAiBookLine(c) };
            const ePlayerId = String(c.entityId ?? c.id ?? c.gamePk);
            const eMarket = c.market ?? "k";
            const ePickId = `${currentUser?.userId ?? currentUser?.username}:${ePlayerId}:${eMarket}:${today}`;
            const eIsLogged = loggedPickIds.has(ePickId);
            const eIsGameDone = getBoardGamePhase(c.gamePk) !== "upcoming";
            return (
              <EdgeCard
                key={c.id}
                c={enrichedC}
                gradeResult={gradeCandidate(c)}
                isLogged={eIsLogged}
                isGameDone={eIsGameDone}
                onAddPick={() => {
                  if (!currentUser || eIsGameDone || eIsLogged) return;
                  const bl = enrichedC.bookLine;
                  openAddPickSheet({
                    playerId: ePlayerId,
                    playerName: c.playerName ?? c.name ?? c.gameLabel ?? "",
                    gameLabel: c.gameLabel ?? "",
                    market: eMarket,
                    side: (c.lean ?? "over").toLowerCase(),
                    bookLine: bl != null && Number.isFinite(Number(bl)) ? Number(bl) : null,
                    source: "predict",
                  });
                }}
              />
            );
          };

          return (
            <div style={{ padding: "12px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>⚡ PREDICT</span>
                    {predictSettled.graded > 0 && (
                      <span style={{ fontSize: 8, fontWeight: 800, color: "#22c55e", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                        {predictSettled.hits}/{predictSettled.graded} hit
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>Edge plays — model probability exceeds book implied · sorted by edge</div>
                </div>
              </div>

              {aiBoardLoading && (
                <div style={{ textAlign: "center", padding: 48, color: "#6b7280", fontSize: 11 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⚡</div>
                  Loading edge plays…
                </div>
              )}

              {!aiBoardLoading && aiBoardData === null && (
                <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>
                  Loading edge plays…
                </div>
              )}

              {!aiBoardLoading && Array.isArray(aiBoardData) && allEdgePlays.length === 0 && aiBoardEdgesMeta.fallback && (
                <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11, lineHeight: 1.5 }}>
                  Today&apos;s edge scores are being generated. Check back after 10 AM Hawaii time.
                </div>
              )}

              {!aiBoardLoading && Array.isArray(aiBoardData) && allEdgePlays.length === 0 && !aiBoardEdgesMeta.fallback && (
                <div style={{ textAlign: "center", padding: 40, color: "#6b7280", fontSize: 11 }}>
                  No strong edges right now. Plays need model probability ≥8pts above the book&apos;s implied probability.
                </div>
              )}

              {upcomingPlays.length > 0 && (
                <div style={{ marginBottom: lockedPlays.length > 0 ? 20 : 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 2px 8px" }}>
                    Upcoming · {upcomingPlays.length} play{upcomingPlays.length !== 1 ? "s" : ""}
                  </div>
                  {upcomingPlays.map((c) => renderEdgeCard(c))}
                </div>
              )}

              {lockedPlays.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 2px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "#a855f7" }}>⊘</span> Locked · in play / final
                  </div>
                  {lockedPlays.map((c) => {
                    const phase = getBoardGamePhase(c.gamePk);
                    return (
                      <div key={c.id} style={{ opacity: phase === "final" ? 0.85 : 1 }}>
                        {renderEdgeCard(c)}
                      </div>
                    );
                  })}
                </div>
              )}

              {calibrationBuckets.some(b => b.total > 0) && (
                <div style={{ marginTop: 28, borderTop: "1px solid #1f2437", paddingTop: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", fontFamily: "monospace", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
                    Model Calibration
                  </div>
                  {calibrationBuckets.map(b => {
                    if (b.total === 0) return null;
                    const expectedPct = Math.round(b.mid);
                    const actualPct   = b.actualRate != null ? Math.round(b.actualRate * 100) : null;
                    const diff        = actualPct != null ? actualPct - expectedPct : null;
                    const barColor    = diff == null ? "#4b5563"
                      : diff >= -5  ? "#22c55e"
                      : diff >= -15 ? "#fbbf24"
                      : "#ef4444";
                    return (
                      <div key={b.label} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", fontFamily: "monospace" }}>{b.label}</span>
                          <span style={{ fontSize: 10, fontFamily: "monospace", color: "#6b7280" }}>
                            {b.hits}/{b.total}
                            {actualPct != null && (
                              <span style={{ marginLeft: 6, color: barColor, fontWeight: 700 }}>{actualPct}%</span>
                            )}
                            <span style={{ marginLeft: 4, color: "#4b5563" }}>vs {expectedPct}% exp</span>
                          </span>
                        </div>
                        <div style={{ position: "relative", height: 6, background: "#1f2437", borderRadius: 3 }}>
                          {actualPct != null && (
                            <div style={{ width: `${Math.min(actualPct, 100)}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.3s" }} />
                          )}
                          <div style={{ position: "absolute", top: -2, left: `${Math.min(expectedPct, 100)}%`, width: 2, height: 10, background: "#4b5563", borderRadius: 1, transform: "translateX(-50%)" }} />
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 9, color: "#4b5563", marginTop: 10, fontFamily: "monospace" }}>
                    Based on {calibrationBuckets.reduce((sum, b) => sum + b.total, 0)} graded plays · today&apos;s locked snapshot
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {view === "picks" && !currentUser && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", marginBottom: 8 }}>
              Sign in to view your picks
            </div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Your pick log is saved to your account
            </div>
          </div>
        )}

        {view === "picks" && currentUser && (() => {
          const rawPicks = picksViewData?.picks ?? [];
          const isLegacyIncompletePick = (pick) => {
            const hasName = !!(pick?.playerName && String(pick.playerName).trim());
            const hasMarket = !!(pick?.market && String(pick.market).trim());
            const hasContext = !!(
              (pick?.gameLabel && String(pick.gameLabel).trim()) ||
              (pick?.side && String(pick.side).trim()) ||
              pick?.bookLine != null
            );
            return !(hasName && hasMarket && hasContext);
          };
          const hiddenLegacyCount = rawPicks.filter(isLegacyIncompletePick).length;
          const picks = picksShowLegacy ? rawPicks : rawPicks.filter((pick) => !isLegacyIncompletePick(pick));
          const stats = picks.reduce((acc, pick) => {
            if (pick.resultHit === true) {
              acc.wins += 1;
              if (pick.pnl != null) acc.totalPnl += Number(pick.pnl) || 0;
            } else if (pick.resultHit === false) {
              acc.losses += 1;
              if (pick.pnl != null) acc.totalPnl += Number(pick.pnl) || 0;
            } else {
              acc.pending += 1;
            }
            return acc;
          }, { wins: 0, losses: 0, pending: 0, totalPnl: 0 });
          const resolved = stats.wins + stats.losses;
          const displayStats = {
            wins: stats.wins,
            losses: stats.losses,
            pending: stats.pending,
            hitRate: resolved > 0 ? Math.round((stats.wins / resolved) * 1000) / 10 : null,
            totalPnl: picks.some((pick) => pick.pnl != null) ? stats.totalPnl : null,
          };
          const groups = picks.reduce((acc, pick) => {
            const key = pick.slateDate ? String(pick.slateDate).slice(0, 10) : "Unknown";
            if (!acc[key]) acc[key] = [];
            acc[key].push(pick);
            return acc;
          }, {});
          const orderedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
          const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });

          // A date is "fully resolved" when every pick has a definitive result
          const isDateFullyResolved = (dateKey) =>
            (groups[dateKey] ?? []).every(p =>
              p.resultHit !== null || p.gradeStatus === "ppd" || p.gradeStatus === "scratch" || p.gradeStatus === "push"
            );

          // Compute whether a date section is expanded:
          //   - Today → always open unless user manually closed it
          //   - Past date, fully resolved → auto-archive (closed) unless user manually opened it
          //   - Past date, has pending picks → open unless user manually closed it
          const isDateExpanded = (dateKey) => {
            if (expandedPickDates.has(dateKey)) return true;  // user force-opened
            if (collapsedPickDates.has(dateKey)) return false; // user force-closed
            if (dateKey === todayKey) return true;             // today always open
            if (isDateFullyResolved(dateKey)) return false;    // auto-archive resolved past dates
            return true;                                        // pending picks → open
          };

          const togglePickDate = (dateKey) => {
            const currentlyExpanded = isDateExpanded(dateKey);
            if (currentlyExpanded) {
              // Close it: add to collapsed, remove from expanded
              setCollapsedPickDates(prev => new Set([...prev, dateKey]));
              setExpandedPickDates(prev => { const n = new Set(prev); n.delete(dateKey); return n; });
            } else {
              // Open it: add to expanded, remove from collapsed
              setExpandedPickDates(prev => new Set([...prev, dateKey]));
              setCollapsedPickDates(prev => { const n = new Set(prev); n.delete(dateKey); return n; });
            }
          };

          // Summary stats for a date's picks (used in the collapsed bar)
          const dateSummary = (dateKey) => {
            const datePicks = groups[dateKey] ?? [];
            const wins = datePicks.filter(p => p.resultHit === true).length;
            const losses = datePicks.filter(p => p.resultHit === false).length;
            const resolved = wins + losses;
            const pending = datePicks.filter(p => p.resultHit === null && !p.gradeStatus).length;
            const pnl = datePicks.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
            const hasPnl = datePicks.some(p => p.pnl != null);
            return { wins, losses, resolved, pending, total: datePicks.length, pnl: hasPnl ? pnl : null };
          };
          const rangeOptions = [
            { days: 0, label: "ALL" },
            { days: 7, label: "7D" },
            { days: 30, label: "30D" },
          ];

          return (
            <div style={{ padding: "6px 0 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb", fontFamily: "monospace" }}>📋 PICKS</div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
                    Logged board and props plays for {currentUser.username ?? currentUser.email}
                  </div>
                  {!picksShowLegacy && hiddenLegacyCount > 0 && (
                    <div style={{ fontSize: 10, color: "#4b5563", marginTop: 4 }}>
                      {hiddenLegacyCount} incomplete legacy pick{hiddenLegacyCount !== 1 ? "s" : ""} hidden
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {hiddenLegacyCount > 0 && (
                    <button
                      onClick={() => setPicksShowLegacy((v) => !v)}
                      style={{
                        background: picksShowLegacy ? "rgba(245,158,11,0.15)" : "#161827",
                        border: `1px solid ${picksShowLegacy ? "#f59e0b" : "#1f2437"}`,
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: 10,
                        fontWeight: 800,
                        color: picksShowLegacy ? "#fbbf24" : "#9ca3af",
                        fontFamily: "monospace",
                        cursor: "pointer",
                      }}
                    >
                      {picksShowLegacy ? "Hide Legacy" : "Show Legacy"}
                    </button>
                  )}
                  {rangeOptions.map((opt) => (
                    <button
                      key={opt.days}
                      onClick={() => setPicksViewDays(opt.days)}
                      style={{
                        background: picksViewDays === opt.days ? "#3b82f6" : "#161827",
                        border: `1px solid ${picksViewDays === opt.days ? "#3b82f6" : "#1f2437"}`,
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: 10,
                        fontWeight: 800,
                        color: picksViewDays === opt.days ? "#fff" : "#9ca3af",
                        fontFamily: "monospace",
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
                <div style={{ background: "#121523", border: "1px solid #1f2437", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Record</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#f9fafb" }}>{displayStats.wins ?? 0}-{displayStats.losses ?? 0}</div>
                  {(displayStats.pending ?? 0) > 0 && (
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3 }}>{displayStats.pending} pending</div>
                  )}
                </div>
                <div style={{ background: "#121523", border: "1px solid #1f2437", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Hit Rate</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#f9fafb" }}>
                    {displayStats.hitRate != null ? `${displayStats.hitRate}%` : "—"}
                  </div>
                </div>
                <div style={{ background: "#121523", border: "1px solid #1f2437", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>P&L</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: displayStats.totalPnl == null ? "#f9fafb" : displayStats.totalPnl >= 0 ? "#22c55e" : "#ef4444" }}>
                    {displayStats.totalPnl == null ? "—" : `${displayStats.totalPnl > 0 ? "+" : ""}${displayStats.totalPnl.toFixed(2)}u`}
                  </div>
                </div>
              </div>

              {picksViewLoading && (
                <div style={{ textAlign: "center", padding: 44, color: "#6b7280", fontSize: 11 }}>
                  Loading picks…
                </div>
              )}

              {!picksViewLoading && picks.length === 0 && (
                <div style={{ textAlign: "center", padding: 52, color: "#6b7280", fontSize: 11, lineHeight: 1.6 }}>
                  No logged picks in this range yet.
                </div>
              )}

              {!picksViewLoading && orderedDates.map((dateKey) => {
                const expanded = isDateExpanded(dateKey);
                const summary  = dateSummary(dateKey);
                const isToday  = dateKey === todayKey;
                const hitColor = summary.wins > summary.losses ? "#22c55e" : summary.losses > summary.wins ? "#ef4444" : "#6b7280";
                const pnlColor = summary.pnl != null ? (summary.pnl >= 0 ? "#22c55e" : "#ef4444") : "#6b7280";

                return (
                <div key={dateKey} style={{ marginBottom: 14 }}>
                  {/* Date header — always visible, tappable to collapse/expand */}
                  <button
                    onClick={() => togglePickDate(dateKey)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "transparent", border: "none", cursor: "pointer",
                      padding: "4px 0 8px", gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: isToday ? "#f9fafb" : "#6b7280", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {isToday ? "Today" : dateKey}
                      </span>
                      {/* Summary chips — always shown in header */}
                      {summary.resolved > 0 && (
                        <span style={{ fontSize: 8, fontWeight: 800, color: hitColor, background: `${hitColor}18`, border: `1px solid ${hitColor}40`, borderRadius: 999, padding: "1px 6px", fontFamily: "monospace" }}>
                          {summary.wins}/{summary.resolved} hit
                        </span>
                      )}
                      {summary.pending > 0 && (
                        <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", background: "rgba(107,114,128,0.1)", border: "1px solid rgba(107,114,128,0.25)", borderRadius: 999, padding: "1px 6px", fontFamily: "monospace" }}>
                          {summary.pending} pending
                        </span>
                      )}
                      {summary.pnl != null && summary.resolved > 0 && (
                        <span style={{ fontSize: 8, fontWeight: 800, color: pnlColor, fontFamily: "monospace" }}>
                          {summary.pnl >= 0 ? "+" : ""}{summary.pnl.toFixed(2)}u
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: "#4b5563", lineHeight: 1 }}>{expanded ? "▲" : "▼"}</span>
                  </button>

                  {/* Pick cards — only rendered when expanded */}
                  {expanded && groups[dateKey].map((pick) => {
                    const marketColor = MARKET_COLORS[pick.market] ?? "#9ca3af";
                    const marketLabel = MARKET_LABELS[pick.market] ?? (pick.market ?? "—").toUpperCase();
                    const pickGradeStatus = pick.gradeStatus ?? null;
                    // Live-props fallback: if bookLine wasn't stored at log time, look it up now
                    const resolvedBookLine = (() => {
                      if (pick.bookLine != null) return pick.bookLine;
                      if (GAME_MARKETS_SET.has((pick.market ?? "").toLowerCase())) return null;
                      const apiMarket = AI_MARKET_TO_PROP[(pick.market ?? "").toLowerCase()];
                      if (!apiMarket || !liveSlate || !pick.gameLabel) return null;
                      const slateGame = liveSlate.find(g =>
                        `${g.away?.abbr ?? ""} @ ${g.home?.abbr ?? ""}` === pick.gameLabel
                      );
                      if (!slateGame) return null;
                      const props = livePlayerProps[String(slateGame.gamePk)]?.props ?? [];
                      const lastName = (pick.playerName ?? "").split(" ").pop().toLowerCase();
                      if (!lastName) return null;
                      const match = props.find(pr =>
                        pr.market === apiMarket &&
                        (pr.player ?? "").toLowerCase().includes(lastName)
                      );
                      if (!match) return null;
                      const allLines = Object.values(match.books ?? {}).map(b => b.line).filter(l => l != null);
                      return allLines.length ? Math.min(...allLines) : null;
                    })();
                    // Derive live game status for today's unresolved picks
                    const pickGameStatus = (() => {
                      if (pick.resultHit !== null && pick.resultHit !== undefined) return null;
                      if (pickGradeStatus) return null;
                      if (!liveSlate || !pick.gameLabel) return null;
                      const match = liveSlate.find(g =>
                        `${g.away?.abbr ?? ""} @ ${g.home?.abbr ?? ""}` === pick.gameLabel
                      );
                      if (!match) return null;
                      const s = match.status ?? "";
                      if (s === "In Progress" || s === "Warmup") return "LIVE";
                      if (s === "Final" || s === "Game Over") return "FINAL";
                      return null;
                    })();
                    const pickStatusBadge = (() => {
                      if (pick.resultHit === true) {
                        return { text: "HIT", color: "#22c55e" };
                      }
                      if (pick.resultHit === false) {
                        return { text: "MISS", color: "#ef4444" };
                      }
                      if (pickGradeStatus === "push") {
                        return { text: "PUSH", color: "#f59e0b" };
                      }
                      if (pickGradeStatus === "ppd") {
                        return { text: "PPD", color: "#f59e0b" };
                      }
                      if (pickGradeStatus === "scratch") {
                        return { text: "SCRATCH", color: "#6b7280" };
                      }
                      return null;
                    })();
                    const oddsText = pick.odds == null ? null : `${pick.odds > 0 ? "+" : ""}${pick.odds}`;
                    const unitsText = pick.units != null ? `${pick.units}u` : null;
                    const isGamePick = GAME_MARKETS_SET.has((pick.market ?? "").toLowerCase());
                    // For game picks: replace HOME/AWAY with actual team abbr
                    const displaySide = (() => {
                      const s = (pick.side ?? "").toUpperCase();
                      if ((s === "HOME" || s === "AWAY") && pick.gameLabel) {
                        const [awayAbbr = "", homeAbbr = ""] = pick.gameLabel.split(" @ ");
                        return s === "HOME" ? homeAbbr.trim() : awayAbbr.trim();
                      }
                      return pick.side;
                    })();
                    // For prop picks: lean+line shown in title row; game picks keep side+line in meta
                    const propLeanText = !isGamePick
                      ? `${(pick.side ?? "").toUpperCase()} ${resolvedBookLine != null ? resolvedBookLine : "—"}`
                      : null;
                    const metaParts = [
                      isGamePick ? [displaySide, pick.bookLine].filter(Boolean).join(" ") : null,
                      pick.gameLabel,
                      oddsText,
                      unitsText,
                    ].filter(Boolean);

                    return (
                      <div key={pick.id} style={{ background: "#121523", border: "1px solid #1f2437", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                              <span style={{ fontSize: 8, fontWeight: 800, color: marketColor, background: `${marketColor}18`, border: `1px solid ${marketColor}40`, borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.06em" }}>
                                {marketLabel}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 800, color: "#f9fafb" }}>{pick.playerName ?? "Unknown player"}</span>
                              {propLeanText && (
                                <span style={{ fontSize: 11, fontWeight: 800, color: (pick.side ?? "").toUpperCase() === "OVER" ? "#22c55e" : "#f87171", fontFamily: "monospace", letterSpacing: "0.04em" }}>
                                  {propLeanText}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.5 }}>
                              {metaParts.join(" · ") || "No pick details"}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                              {pickStatusBadge ? (
                                <span style={{ fontSize: 8, fontWeight: 800, color: pickStatusBadge.color, background: `${pickStatusBadge.color}18`, border: `1px solid ${pickStatusBadge.color}40`, borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.06em" }}>
                                  {pickStatusBadge.text}
                                </span>
                              ) : pickGameStatus ? (
                                <GameStatusBadge status={pickGameStatus} />
                              ) : (
                                <span style={{ fontSize: 8, fontWeight: 800, color: "#6b7280", background: "rgba(107,114,128,0.1)", border: "1px solid rgba(107,114,128,0.25)", borderRadius: 999, padding: "2px 7px", fontFamily: "monospace", letterSpacing: "0.06em" }}>
                                  PENDING
                                </span>
                              )}
                              {pick.actualStat != null && (
                                <span style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace" }}>
                                  {(() => {
                                    const m = (pick.market ?? "").toLowerCase();
                                    const v = pick.actualStat;
                                    if (m === "ml" || m === "f5ml")
                                      return v === 0 ? "tied" : `won by ${Math.abs(v)}`;
                                    if (m === "spread" || m === "f5spread")
                                      return v >= 0 ? `+${v} margin` : `${v} margin`;
                                    if (m === "total")
                                      return `${v} total runs`;
                                    if (m === "nrfi")
                                      return `${v} F1 run${v !== 1 ? "s" : ""}`;
                                    if (m === "hr")  return `${v} HR`;
                                    if (m === "hits") return `${v} hit${v !== 1 ? "s" : ""}`;
                                    if (m === "k")   return `${v} K`;
                                    if (m === "outs") return `${v} outs`;
                                    return `actual ${v}`;
                                  })()}
                                </span>
                              )}
                              {pick.pnl != null && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: pick.pnl >= 0 ? "#22c55e" : "#ef4444", fontFamily: "monospace" }}>
                                  {pick.pnl > 0 ? "+" : ""}{pick.pnl.toFixed(2)}u
                                </span>
                              )}
                            </div>
                          </div>
                          {pick.resultHit === null && pickGameStatus !== "LIVE" && (pickGradeStatus === "ppd" || pickGradeStatus === "scratch" || !pickGradeStatus) && (
                            <button
                              onClick={() => voidPick(pick.id)}
                              style={{
                                background: "transparent",
                                border: "1px solid rgba(239,68,68,0.28)",
                                borderRadius: 8,
                                padding: "7px 10px",
                                fontSize: 10,
                                fontWeight: 800,
                                color: "#ef4444",
                                fontFamily: "monospace",
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                            >
                              Void
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
              })}
            </div>
          );
        })()}

        {/* ── Settings view ─────────────────────────────────────────────────── */}
        {view === "settings" && (() => {
          const BOOKS = ["DK","FD","CZR","MGM","BOV"];

          const handleBookSelect = async (book) => {
            const next = book === preferredBook ? "DK" : book; // toggle off resets to DK default
            setPreferredBook(next);
            setPropsBookFilter(next);
            setPrefSaving(true);
            setPrefSaveMsg("");
            try {
              await apiMutate("/api/auth/preferences", "PUT", { preferredBook: next });
              setPrefSaveMsg("Saved");
            } catch {
              setPrefSaveMsg("Failed to save");
            }
            setPrefSaving(false);
            setTimeout(() => setPrefSaveMsg(""), 2000);
          };

          return (
            <div style={{ padding: "4px 0 16px" }}>
              {/* Back */}
              <button
                onClick={() => setView("slate")}
                style={{ background: "none", border: "none", color: "#6b7280", fontSize: 11, fontFamily: "monospace", cursor: "pointer", padding: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}
              >
                ← Back
              </button>

              {/* Account section */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#4b5563", letterSpacing: "0.08em", marginBottom: 10 }}>ACCOUNT</div>
                <div style={{ background: "#0f1020", border: "1px solid #1f2437", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(129,140,248,0.15)", border: "1px solid rgba(129,140,248,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>👤</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", fontFamily: "monospace" }}>{currentUser?.username}</div>
                    <div style={{ fontSize: 9, color: "#4b5563", marginTop: 2 }}>Logged in</div>
                  </div>
                </div>
              </div>

              {/* Preferred sportsbook */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#4b5563", letterSpacing: "0.08em", marginBottom: 6 }}>DEFAULT SPORTSBOOK</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>
                  Your selected book filters lines and picks app-wide. DraftKings is the default.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {BOOKS.map(bk => {
                    const isSelected = preferredBook === bk;
                    const isSharp    = ["DK","FD"].includes(bk);
                    return (
                      <button
                        key={bk}
                        onClick={() => handleBookSelect(bk)}
                        style={{
                          background: isSelected ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${isSelected ? "rgba(251,191,36,0.5)" : isSharp ? "rgba(129,140,248,0.25)" : "rgba(255,255,255,0.08)"}`,
                          borderRadius: 8,
                          padding: "8px 16px",
                          cursor: "pointer",
                          color: isSelected ? "#fbbf24" : isSharp ? "#818cf8" : "#9ca3af",
                          fontFamily: "monospace",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {isSelected ? `★ ${bk}` : bk}
                      </button>
                    );
                  })}
                </div>
                {(prefSaving || prefSaveMsg) && (
                  <div style={{ fontSize: 9, color: prefSaveMsg === "Saved" ? "#22c55e" : "#ef4444", marginTop: 8, fontFamily: "monospace" }}>
                    {prefSaving ? "Saving…" : prefSaveMsg}
                  </div>
                )}
                {preferredBook === "DK" && (
                  <div style={{ fontSize: 9, color: "#374151", marginTop: 8, fontFamily: "monospace" }}>Using app default · tap another book to switch</div>
                )}
              </div>

              {/* Sign out */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#4b5563", letterSpacing: "0.08em", marginBottom: 10 }}>SESSION</div>
                <button
                  onClick={() => { handleLogout(); }}
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "9px 20px", fontSize: 12, color: "#f87171", fontFamily: "monospace", cursor: "pointer", fontWeight: 600, letterSpacing: "0.06em" }}
                >
                  Sign Out
                </button>
              </div>
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
              onClick={() => setView(view === "settings" ? "slate" : "settings")}
              style={{ background: view === "settings" ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${view === "settings" ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius: 8, padding: "7px 12px", fontSize: 16, cursor: "pointer", minHeight: 36, lineHeight: 1, color: view === "settings" ? "#fbbf24" : "#6b7280" }}
              title="Settings"
            >⚙</button>
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
        const isGameType = type === "nrfi" || type === "total" || type === "spread" || type === "ml" || type === "f5ml" || type === "f5spread";
        const factors = generateWhyFactors(c, type);
        const whySummaryRequest = buildBoardSummaryRequest(c, type);
        const displayScore = isGameType
          ? (c.lean === "YRFI" || c.lean === "UNDER" || c.lean === "AWAY" ? 100 - c.score : c.score)
          : c.score;
        const sc = displayScore >= 70 ? "#22c55e" : displayScore >= 55 ? "#f59e0b" : displayScore >= 40 ? "#ef4444" : "#6b7280";
        const conf = Math.min(85, Math.round(50 + (Math.abs(c.score - 50)) * 35 / 30));
        // For game types, use the pre-computed lean; for prop types, derive from score
        const lean = isGameType ? c.lean : (c.score >= 55 ? "OVER" : "UNDER");
        const leanLabel = isGameType ? (c.leanLabel ?? c.lean) : lean;
        const positiveLegs = ["NRFI", "OVER", "HOME"];
        const leanColor = positiveLegs.includes(lean) ? "#22c55e" : "#ef4444";
        const typeLabel = type === "k" ? "⚡ K PROPS" : type === "outs" ? "📋 OUTS"
          : type === "hr" ? "⚾ HR" : type === "hits" ? "🎯 HITS"
          : type === "nrfi" ? "🎲 NRFI" : type === "total" ? "🎲 O/U TOTAL"
          : type === "spread" ? "🎲 RUN LINE" : type === "ml" ? "🎲 MONEYLINE"
          : type === "f5ml" ? "🎲 F5 MONEYLINE" : "🎲 F5 RUN LINE";
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
                  {isGameType ? (
                    <button
                      onClick={() => { setWhyModal(null); openGame(c.gamePk); }}
                      style={{ marginTop: 2, padding: 0, background: "none", border: "none", fontSize: 10, color: "#818cf8", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                    >
                      {c.stadium ?? c.gameLabel}
                    </button>
                  ) : (
                    <button
                      onClick={() => { setWhyModal(null); openGame(c.gamePk); }}
                      style={{ marginTop: 2, padding: 0, background: "none", border: "none", fontSize: 10, color: "#818cf8", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      {c.gameLabel}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: sc, fontFamily: "monospace", lineHeight: 1 }}>{displayScore}</div>
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
                <div style={{ display: "flex", alignItems: "flex-start", gap: 4, flex: 1, minWidth: 0 }}>
                  {(() => {
                    const whyUseSnapshot = !!(whyModal.c?._boardSummary ?? whyModal.c?.aiSummary) || boardSnapshotCoversToday();
                    const summaryText = resolveCardSummaryText(whyModal.c, whySummaryRequest, { allowPremium: !whyUseSnapshot });
                    const premiumLine = !whyUseSnapshot ? aiCardSummaries[`premium:${whySummaryRequest?.id}`] : null;
                    const isPremium = !!(premiumLine && summaryText === premiumLine);
                    if (!summaryText) return null;
                    return (
                      <>
                        {isPremium && (
                          <span style={{ fontSize: 8, color: "#a78bfa", fontFamily: "monospace", fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✦</span>
                        )}
                        <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", lineHeight: 1.4 }}>{summaryText}</span>
                      </>
                    );
                  })()}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <div style={{ background: `${leanColor}18`, border: `1px solid ${leanColor}55`, borderRadius: 8, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: leanColor }} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: leanColor, fontFamily: "monospace" }}>{leanLabel}</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 900, color: conf >= 65 ? "#22c55e" : "#fbbf24", fontFamily: "monospace" }}>{conf}%</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {addPickSheet && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.55)", display: "flex",
            alignItems: "center", justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setAddPickSheet(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 420,
              background: "#13141f", borderRadius: 16,
              padding: "20px 20px 24px", border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb" }}>Log Pick</span>
              <button onClick={() => setAddPickSheet(null)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", marginBottom: 2 }}>{addPickSheet.playerName}</div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>
                {addPickSheet.market?.toUpperCase()} · {addPickSheet.gameLabel}
                {addPickSheet.bookLine != null ? ` · Line ${addPickSheet.bookLine}` : ""}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Side</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["over", "under"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setAddPickSheet((prev) => ({ ...prev, side: s }))}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                      fontSize: 12, fontWeight: 700, cursor: "pointer",
                      textTransform: "uppercase",
                      background: addPickSheet.side === s ? "#3b82f6" : "rgba(255,255,255,0.06)",
                      color: addPickSheet.side === s ? "#fff" : "#9ca3af",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Odds <span style={{ color: "#374151" }}>(optional)</span></div>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="-125"
                  value={addPickOdds}
                  onChange={(e) => setAddPickOdds(e.target.value)}
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#f9fafb",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Units</div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="1"
                  value={addPickUnits}
                  onChange={(e) => setAddPickUnits(e.target.value)}
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#f9fafb",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <button
              onClick={submitAddPick}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
                background: "#3b82f6", color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: "pointer", letterSpacing: "0.02em",
              }}
            >
              Add Pick
            </button>
          </div>
        </div>
      )}

      {toastMsg && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: "rgba(30,31,48,0.96)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10, padding: "8px 18px", fontSize: 12, color: "#e5e7eb",
          zIndex: 9999, pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          {toastMsg}
        </div>
      )}

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
                  <Row color="#a78bfa" label="Purple  →  Chat & scout tools" sub="Used for Chat (when enabled) and scout-only views such as AI Board or Predict." />
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
                      ["Pitcher Card", "Season ERA, WHIP, K/9, BB/9, avg IP/K/PC/ER, and a sparkline of recent outings. Shows W-L record and how many of his last 5 starts were clean (0 ER). A red ⚠ IL badge next to the pitcher name means he has an active IL placement — verify before betting any K or Outs props. Use this for K props and Outs lines."],
                      ["Lineup Matchup Intel", "Counts how many RHB, LHB, and switch hitters are in the opposing lineup vs the pitcher's hand — higher same-hand count = pitcher edge. Shows the aggregate matchup score across all opposing batters and flags the top 3 danger hitters by score. Use this for deciding whether to lean Over or Under on team runs."],
                      ["Game Lean Card", "NRFI lean derived from both SPs' clean-start rate (0 ER starts / recent starts). Quick directional read for NRFI props."],
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
                      ["Bullpen Card", "Grade (A–C), fatigue level (FRESH / MODERATE / HIGH based on pitches thrown last 3 days), setup depth, and L/R balance. Expand the Relievers drawer to see each arm: ERA, WHIP, Last App, Pitches from last outing, K/9 (swing-and-miss rate — 10+ is elite), and BB/9 (walk rate — under 3 is sharp). High fatigue + thin depth = lean toward OVER on totals."],
                      ["Odds & Line Movement", "Multi-book table (DK / FD / CZR / MGM / BOV) showing moneyline, total, O/U odds, and runline for each book. Missing books omitted. Shows PRE-GAME LINES for in-progress and final games — The Odds API removes live game odds at first pitch, so the last-snapped pre-game lines are preserved and displayed. Line movement arrow on the slate card shows the direction the total shifted from its opening number. DK and FD are sharp books; CZR, MGM, and BOV are square books — a gap of 0.5+ between their lines is a meaningful edge signal (LINE INTELLIGENCE). Your preferred book's column is highlighted by default."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#38bdf8", fontFamily: "monospace", flexShrink: 0, minWidth: 60, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="🏆 Board View — HR / Hits / K / Outs / Games">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                    The <span style={{ color: "#fbbf24", fontWeight: 700 }}>Board</span> tab ranks players and games across the full day's slate by algorithmic score. Five tabs: batters (⚾ HR, 🎯 Hits), starting pitchers (⚡ K, 📋 Outs), and game-level markets (🎲 Games). <span style={{ color: "#fbbf24", fontWeight: 600 }}>Tap any card to see a full factor breakdown.</span>
                  </div>

                  {/* Board scoring tabs */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["⚾ HR tab", "Scores every batter in today's lineups for HR prop attractiveness. Key factors: SLG/power profile, season HR pace, park HR factor, wind direction, batting order spot, and platoon hand split. Coors Field, Great American Ball Park, and wind-out parks push scores up significantly. A score of 70+ means multiple factors are aligned — power hitter, friendly park, favorable order spot."],
                      ["🎯 Hits tab", "Scores batters for getting at least 1 hit. Key factors: season AVG, last-7 game form (recent hot/cold streaks carry heavy weight), park hit factor, batting order, and platoon split. Leadoff and 2-hole hitters score higher due to extra plate appearances. A score of 70+ usually means a hitter batting .280+ who's been hitting in 5 of his last 7 games in a hitter-friendly park."],
                      ["⚡ K Props tab", "Scores starting pitchers for strikeout over props. Key factors: K/9 rate (career strikeout ability), last-3-start average Ks (recent form), park K factor (some parks suppress contact), umpire zone tendencies (tight zone = more Ks), and WHIP (control — pitchers with low WHIP stay in games longer to rack up Ks). A score of 80+ means an elite strikeout pitcher in a favorable environment with an ump who rings people up."],
                      ["📋 Outs tab", "Scores starting pitchers for outs recorded (innings pitched) props. Key factors: average IP over recent starts (the biggest signal — deep starters score highest), WHIP and control (high walk rates drive up pitch counts and shorten outings), season ERA (struggling pitchers get pulled earlier), and park environment. A score of 80+ means a pitcher who consistently goes 6+ innings with strong control."],
                      ["🎲 Games tab", "Scores every game on four game-level markets using a separate algorithmic engine. Each market has a sub-tab (NRFI / O/U Total / Run Line / Moneyline). Sorted high-to-low by score: high scores lean the 'positive' side (NRFI / OVER / HOME), low scores lean the 'negative' side (YRFI / UNDER / AWAY). Tap any game card for a full factor breakdown in the Why? modal."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace", flexShrink: 0, minWidth: 70, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>

                  {/* Games sub-tab detail */}
                  <div style={{ background: "rgba(129,140,248,0.07)", border: "1px solid rgba(129,140,248,0.25)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#818cf8", fontFamily: "monospace" }}>🎲 Games Tab — Sub-tabs Explained</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        ["NRFI", "Scores each game for the No Run First Inning market. Factors: both SPs' ERA (high ERA = YRFI risk), park HR factor (Coors Field pushes YRFI), weather (cold + wind IN favor NRFI), umpire zone tendency, and historical 1st-inning scoring percentages from /api/nrfi data. Score 65+ = strong NRFI lean."],
                        ["O/U Total", "Scores each game for the runs total market. Factors: both SPs' ERA and WHIP (bad pitching = OVER), park HR factor, weather (wind OUT = OVER, cold/wind IN = UNDER), and the market total line for context. Score 65+ = strong OVER lean. Score 35− = strong UNDER lean."],
                        ["Run Line", "Scores which team covers the run line (±1.5). Factors: SP ERA differential (home vs away), WHIP differential, home field advantage baseline, and ML-implied probability vs model. Score 65+ = HOME covers. Score 35− = AWAY covers."],
                        ["Moneyline", "Scores which team wins outright. Factors: SP ERA matchup, SP command (WHIP), home field advantage, model vs market implied probability gap, and park factor. Score 65+ = HOME ML play. Score 35− = AWAY ML play."],
                      ].map(([label, desc]) => (
                        <div key={label} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <div style={{ background: "rgba(129,140,248,0.15)", border: "1px solid rgba(129,140,248,0.3)", borderRadius: 5, padding: "2px 7px", fontSize: 9, fontWeight: 700, color: "#818cf8", fontFamily: "monospace", flexShrink: 0, whiteSpace: "nowrap" }}>{label}</div>
                          <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: "#6b7280", lineHeight: 1.5, marginTop: 2 }}>
                      ⚠ Game board scores improve throughout the day as SP stats and live odds load. Best accuracy: 2–3 hours before first pitch when pitcher stats are confirmed and sportsbook lines are sharp.
                    </div>
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
                      ["Prop line", "Shows the DraftKings-posted over line and odds directly on the card when DK has the market available. A synthetic line (~X.X) is shown as a fallback when no sportsbook data has been posted yet, derived from the pitcher's recent stats. The DK book tag on the card confirms the line source."],
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

                  {/* Card summaries + live locking */}
                  <div style={{ background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.25)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", fontFamily: "monospace" }}>AI Card Summaries &amp; Live Game Locking</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        ["AI summary line", "Every card shows a one-line AI-written summary tuned to its score tier. Green cards (75+) get a confident edge statement. Yellow cards (55–74) get a balanced read — main edge plus the key headwind. Red cards (<55) get an honest risk assessment explaining what's working against the pick. Generated by Claude Haiku using the same signals that built the score."],
                        ["✦ Premium summary", "Cards with a board score of 75+ show a ✦ badge next to the summary. This indicates the summary was upgraded to GPT-4o — a sharper analyst-voice sentence citing at least two concrete numbers."],
                        ["Live game locking", "When a game moves from pre-game to In Progress, the Board locks that game's candidates in place. Locked cards stay visible even after the game starts — preventing the board from going blank mid-day. A 🔒 LIVE or ✓ FINAL indicator shows status. Only cards with real candidate data are locked; if lineups haven't posted yet when the game starts, the board waits and locks once lineup data arrives."],
                      ].map(([label, desc]) => (
                        <div key={label} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <div style={{ background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 5, padding: "2px 7px", fontSize: 9, fontWeight: 700, color: "#a78bfa", fontFamily: "monospace", flexShrink: 0, whiteSpace: "nowrap" }}>{label}</div>
                          <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Section>

                <Section title="📋 Props Tab — Sportsbook Lines &amp; Book Filter">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                    The <span style={{ color: "#38bdf8", fontWeight: 700 }}>Props</span> tab (inside a game) shows a multi-book line comparison grid for every player prop market — Strikeouts, Home Runs, Total Bases, and Hits. Each row shows the over line and juice at each available book side-by-side so you can quickly spot the best number before placing.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["Book filter chips", "A row of chips at the top of the Sportsbook Lines section lets you filter the grid to a single book: ALL · DK · FD · CZR · MGM · BOV. Your preferred book (set in Settings) is highlighted with a ★. Tap any chip to narrow the view; tap it again to return to ALL. LINE INTELLIGENCE still runs across all books regardless of which filter is active."],
                      ["DK tag", "A small blue DK label appears in the corner of game cards and Model Pick cards to indicate that the displayed line is sourced from DraftKings. This confirms the line is live market data, not a synthetic estimate."],
                      ["Best line highlight", "The book offering the lowest over line (most favorable for an over bet) is highlighted in the grid. When two books share the lowest line, the one with the better juice is preferred."],
                      ["Missing books", "If a book hasn't posted a line for that market yet, its column is omitted from the grid rather than shown as blank. As the day progresses and books add markets, the grid fills in automatically."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#38bdf8", fontFamily: "monospace", flexShrink: 0, minWidth: 70, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "rgba(56,189,248,0.07)", border: "1px solid rgba(56,189,248,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: "#7dd3fc", fontWeight: 700, marginBottom: 4 }}>💡 LINE INTELLIGENCE — Sharp vs Square Gap</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                      DK and FD are sharp books that attract professional bettors and move quickly. CZR, MGM, and BOV are square books that move slower. When DK/FD post a line of 6.5 Ks and CZR/MGM still show 7.0, the sharp side has already priced the pitcher lower — playing the 6.5 means you're playing with the smart money. An <span style={{ color: "#fbbf24", fontWeight: 700 }}>EDGE</span> badge appears automatically when this gap is ≥ 0.5.
                    </div>
                  </div>
                </Section>

                <Section title="🎯 Model Picks Tab">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                    The <span style={{ color: "#a78bfa", fontWeight: 700 }}>Model</span> tab is a dedicated view for the algorithmic pick engine — separate from the Board. It scores both starting pitchers for every game and surfaces the best prop setups in a tiered card layout.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["HIGH tier", "Score 65+. Multiple signals aligned: strong ERA, K/9, and umpire or park context all pointing the same way. These are the plays with the most independent confirmation."],
                      ["MEDIUM tier", "Score 56–64. Solid setup with one open question — umpire TBD, park is neutral, or recent form is mixed. Worth a look but do more homework."],
                      ["SPEC tier", "Score 50–55. Speculative. One or two factors are favorable but others are neutral or missing. Use as a watch list, not a primary pick."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#a78bfa", fontFamily: "monospace", flexShrink: 0, minWidth: 60, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "rgba(129,140,248,0.07)", border: "1px solid rgba(129,140,248,0.25)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#818cf8", fontFamily: "monospace" }}>LINES Section — Multi-Book Comparison</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                      Each Model Pick card shows a <span style={{ color: "#f9fafb" }}>LINES</span> grid when sportsbook data is available. It displays the over line and juice at each of the 5 books (DK, FD, CZR, MGM, BOV). The pick line shown on the card header is DraftKings' actual posted line — when DK has posted a number, that's the line the model is evaluating against. A synthetic line (~X.X) only appears when no book data is available yet. This enables <span style={{ color: "#fbbf24", fontWeight: 600 }}>LINE INTELLIGENCE</span> — if sharp books (DK/FD) have a lower line than square books (CZR/MGM/BOV) by 0.5 or more, it signals that the market is mispriced and the lower line is the smarter number to play. The best line and book are highlighted automatically.
                    </div>
                    <div style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 10, color: "#fde68a", fontWeight: 700, marginBottom: 3 }}>EDGE badge</div>
                      <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.5 }}>When the sharp-vs-square gap is ≥ 0.5, an amber EDGE badge appears on the card. This is a standalone edge signal — the books disagree on where the line should be, which typically means the sharper line has already moved. Playing the lower number = playing with the sharp side.</div>
                    </div>
                  </div>
                  <div style={{ background: "rgba(129,140,248,0.07)", border: "1px solid rgba(129,140,248,0.25)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#818cf8", fontFamily: "monospace", marginBottom: 6 }}>✦ CARD AGREES — Convergence Badge</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                      When the purple <span style={{ color: "#818cf8", fontWeight: 700 }}>✦ CARD AGREES</span> badge appears on a Model Pick card, it means the <strong style={{ color: "#f9fafb" }}>Daily Card</strong> (the AI-assisted analysis) independently selected the same pitcher for the same prop type. This is a convergence signal — the algorithmic model and the AI-assisted analysis reached the same conclusion through separate reasoning paths. Two independent systems agreeing is meaningfully stronger than either alone.
                    </div>
                  </div>
                </Section>

                <Section title="🤖 AI Board — AI-Scored Picks">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                    The <span style={{ color: "#34d399", fontWeight: 700 }}>AI Board</span> tab takes the same candidates from the Board and runs them through a second AI scoring layer — Claude Haiku + optional GPT-4o — to produce an independent ranked pick list across five markets: K props, Outs, Hits, HR, and F5 ML. AI scores are separate from the algorithmic board score and reflect a blend of the model score, simulation confidence, and stat quality.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["AI Score (0–100)", "The AI Board's primary ranking signal. Scored by Claude Haiku using the algorithmic score (35%), simulation confidence (35%), and stat quality (30%). 75+ = strong edge with multiple independent signals; 55–74 = solid lean; 40–54 = neutral; below 40 = weak setup. The board sorts by AI Score within each market tab."],
                      ["Market tabs", "Five filter tabs across the top: K · Outs · Hits · HR · F5 ML. Each shows only the candidates relevant to that market, ranked by AI Score. The All tab shows the combined list. Tap any tab to narrow your focus."],
                      ["AI reason line", "Every AI Board card shows a one-sentence AI-written reason below the player name, generated by Claude Haiku using market-specific logic: K = K rate + opposing lineup K% + umpire or park edge; Outs = avg IP + WHIP; Hits = batter form vs pitcher hand; HR = SLG/power pace + park or wind; F5 ML = SP ERA comparison + environment."],
                      ["✦ Premium summary", "Cards with AI Score 75+ show a ✦ badge. These summaries have been upgraded to GPT-4o — a sharper analyst-voice sentence citing at least two concrete numbers. All other tiers also get honest summaries: yellow cards balance the edge with the main headwind; red cards lead with what's working against the pick."],
                      ["Locked candidates", "When a game goes live (In Progress), the AI Board locks that game's candidates in place so the board doesn't go blank mid-day. Locked cards show a 🔒 LIVE indicator. Once the game ends, ✓ FINAL is shown. Locking only fires when real candidate data exists — if lineups hadn't posted yet when the game started, the board waits and locks once data arrives."],
                      ["Score ≥ 75 refresh", "After the initial AI scoring pass, any candidate that scores 75+ automatically triggers a premium GPT-4o summary call to upgrade its reason text. This happens in the background and the card updates in place when the premium text arrives — no reload needed."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#34d399", fontFamily: "monospace", flexShrink: 0, minWidth: 90, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: "#6ee7b7", fontWeight: 700, marginBottom: 4 }}>💡 How to use AI Board vs the Board</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.7 }}>
                      <span style={{ color: "#f9fafb" }}>Board = algorithmic signal.</span> The Board scores are built from weighted factors (K/9, WHIP, park, ump, etc.). Use it to find plays where the raw data lines up.<br />
                      <span style={{ color: "#f9fafb" }}>AI Board = independent AI judgment.</span> The AI layer re-ranks the same candidates using a different lens — model score + sim confidence + stat quality. When a candidate ranks high on both, that convergence is a stronger signal than either alone.<br />
                      <span style={{ color: "#f9fafb" }}>Use the Chat tab to go deeper.</span> Once the AI Board has scored candidates, the Chat feature has full visibility into those rankings — ask it to build a parlay, find the top K props, or explain a specific pick.
                    </div>
                  </div>
                </Section>

                <Section title="💬 Chat — AI Prop Assistant">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                    The <span style={{ color: "#60a5fa", fontWeight: 700 }}>Chat</span> tab is an AI assistant with full access to today's Chalk That data — board candidates, AI scores, pitcher stats, sportsbook lines, umpire tendencies, weather, park factors, lineup data, and injury reports. Ask it anything from a quick question to a full parlay build.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["Quick Chips", "Tap-to-send shortcut prompts at the top of the chat: 'Build me a 3-leg parlay', 'Best K props tonight', 'Best hits props tonight', 'Top plays across all markets', 'Any injury alerts?'. These are the most common research workflows — one tap sends the question with full board context already attached."],
                      ["Board-aware answers", "When the AI Board has scored candidates, Chat automatically includes the top 6 per market (sorted by AI Score) in every request. The assistant knows each player's name, team, game, AI Score, book line, and the AI reason — so answers like 'Best K props tonight' return specific picks with scores and lines, not generic advice."],
                      ["Parlay builder", "Ask 'Build me a 3-leg parlay' and the assistant selects legs from the ranked board candidates, strongly preferring legs from different games to avoid same-game correlation. It mixes markets when possible (e.g. K prop + hits prop from separate games), estimates combined implied probability, and flags any correlated legs explicitly."],
                      ["Market-specific picks", "Ask 'Best K props tonight', 'Best hits props', 'Best outs props', or 'Best HR props' and the assistant filters to that market and ranks the top 2–3 candidates, naming the line and the sharpest reason to back each."],
                      ["Web search", "For injury news, lineup changes, or anything time-sensitive, Chat automatically runs a web search (via Tavily) and cites recent results. Trigger words like 'injury', 'lineup change', 'latest news', or 'IL' activate this path."],
                      ["Confidence score", "Stat-based answers come with a confidence score (0–100) and label: HIGH (75+), MEDIUM (60–74), SPEC (50–59), LOW (<50). General conversational questions return without a confidence score."],
                      ["Daily limit", "Each user account has a daily message limit to keep costs manageable. The counter resets at midnight. Conceptual or non-stat questions don't use a different path — all Chat messages count toward the limit."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#60a5fa", fontFamily: "monospace", flexShrink: 0, minWidth: 90, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: "#93c5fd", fontWeight: 700, marginBottom: 4 }}>💡 Best prompts to try</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.7 }}>
                      <span style={{ color: "#fbbf24", fontWeight: 600 }}>"Build me a 3-leg parlay"</span> — gets a specific parlay from different games with implied probability and reasoning.<br />
                      <span style={{ color: "#fbbf24", fontWeight: 600 }}>"Act like a professional sports bettor — what are your top plays today?"</span> — board-aware overview across all markets.<br />
                      <span style={{ color: "#fbbf24", fontWeight: 600 }}>"Which outs props do you like tonight?"</span> — filters to outs market and ranks the top candidates.<br />
                      <span style={{ color: "#fbbf24", fontWeight: 600 }}>"Is [pitcher] a good K prop?"</span> — deep dive on a specific pitcher using season stats + board context.<br />
                      <span style={{ color: "#fbbf24", fontWeight: 600 }}>"Any injury news?"</span> — triggers live web search for the latest injury and lineup updates.
                    </div>
                  </div>
                </Section>

                <Section title="⚡ Predict Tab — Edge-Based Plays">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                    The <span style={{ color: "#fbbf24", fontWeight: 700 }}>Predict</span> tab surfaces plays where the Chalk That simulation model believes there is a meaningful pricing gap — the model's win probability is materially higher than what the sportsbook is implying. Only plays with a gap of 8 points or more are shown.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["SIM %", "The simulation model's estimated probability that this prop hits — e.g. 72% means the model thinks this outcome happens 72 times out of 100. Derived from the AI Board scoring pass using stat quality, matchup, and situational factors."],
                      ["BOOK %", "The sportsbook's implied probability, calculated from the posted odds. A line of −130 implies ~57% probability. This is what you're paying for — if SIM is higher, there's a potential edge."],
                      ["EDGE pts", "The raw gap: SIM% minus BOOK%. +12pts means the model is 12 percentage points more confident than the book. Only plays with +8pts or more make the board. Green = 15+ pts (strong edge), yellow = 8–14 pts (moderate edge)."],
                      ["Markets", "Predict covers all five AI Board markets: K props, Outs, Hits, HR, and F5 ML. Each card shows the market badge and the direction (OVER/UNDER or HOME/AWAY for F5 ML)."],
                      ["Upcoming / Locked", "Upcoming plays are for games that haven't started yet — these are actionable. Once a game goes live or final, plays move to the Locked section. Locked plays show their graded result (HIT ✓ or MISS ✗) once the game ends."],
                      ["HIT / MISS grading", "Results are graded automatically after each game finishes. HIT = the model's lean was correct vs the book line. MISS = it wasn't. The running record (e.g. '5/7 hit') shows in the header. This is how you track whether the edge is real over time."],
                      ["Model Calibration", "At the bottom of the page (once games have resolved), a calibration chart shows how well the SIM percentages are tracking actual outcomes — grouped into confidence bands (55–64%, 65–74%, 75–84%, 85%+). If the 75–84% band is hitting at 70%+, the model is well-calibrated at that confidence level."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace", flexShrink: 0, minWidth: 80, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: "#fde68a", fontWeight: 700, marginBottom: 4 }}>💡 Predict vs Board vs AI Board</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.7 }}>
                      <span style={{ color: "#f9fafb" }}>Board</span> — ranks every pitcher/batter by algorithmic signal strength. Doesn't need a sportsbook line to show a card.<br />
                      <span style={{ color: "#f9fafb" }}>AI Board</span> — re-ranks the same candidates using an AI scoring layer (Haiku + GPT-4o). Still signal-based, not line-dependent.<br />
                      <span style={{ color: "#f9fafb" }}>Predict</span> — only shows plays where the model's probability is at least 8pts above the book's implied probability. Requires a live sportsbook line. Fewer plays, but each one has a specific, quantified edge against the market.
                    </div>
                  </div>
                </Section>

                <Section title="📋 Picks Tab — Logging & Tracking Your Plays">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                    The <span style={{ color: "#3b82f6", fontWeight: 700 }}>Picks</span> tab is your personal betting log — track every play you act on, see live grading as games finish, and monitor your running record and P&amp;L over time.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["+ icon", "Every card on the Board, Games, Model, AI Board, and Predict tabs has a small + circle in the bottom-right corner. Tap it to log that play. The icon turns blue ✓ once it's in your log. Disabled (muted) once a game has started."],
                      ["Log Pick sheet", "After tapping +, a sheet opens with the player/game pre-filled. Choose OVER or UNDER, optionally enter your odds and units, then tap Add Pick. Odds are used to calculate P&L — if you skip them, flat units are used instead."],
                      ["PENDING → LIVE → HIT/MISS", "Pick cards update automatically as games progress. PENDING before the game, a pulsing LIVE badge once it starts, then HIT or MISS graded the moment the game goes final — no refresh needed."],
                      ["PPD", "If a game is postponed or cancelled, the pick is marked PPD. The Void button stays visible so you can remove it from your log manually."],
                      ["SCRATCH", "If your player (batter or pitcher) doesn't appear in the final boxscore — a late scratch or did not play — the pick is marked SCRATCH. Void button stays visible."],
                      ["PUSH", "Exact line hits (e.g. total is exactly 8.0 on an 8-run line) are marked PUSH and don't count toward wins or losses."],
                      ["VOID button", "Removes a pick from your log. Only available before a game starts, or for PPD/SCRATCH edge cases. Hidden once a game is live or graded."],
                      ["Record tile", "Shows your win-loss record across the selected date range (ALL / 7D / 30D)."],
                      ["Hit Rate tile", "Win percentage across resolved picks (excludes pending, push, PPD, scratch)."],
                      ["P&L tile", "Units profit/loss. When odds are logged: vig-adjusted (e.g. −110 win = +0.91u). When no odds: flat +1u per win, −units per loss. Negative is red, positive is green."],
                      ["Collapsible dates", "Picks are grouped by date. Today's section is always open. Past dates where every pick is graded automatically collapse to a summary line (e.g. Jun 5 · 3/5 hit · +1.2u). Tap any date header to expand or collapse it."],
                      ["Historical backfill", "If you had pending picks from previous days, the app automatically fetches the game results on your next session and grades them in the background. No manual action needed."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#3b82f6", fontFamily: "monospace", flexShrink: 0, minWidth: 70, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: "#93c5fd", fontWeight: 700, marginBottom: 4 }}>💡 Tips for getting the most out of Picks</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.7 }}>
                      <span style={{ color: "#f9fafb" }}>Log odds when you have them.</span> Even approximate odds (−110 is standard for most props) give you a more accurate P&amp;L than flat units.<br />
                      <span style={{ color: "#f9fafb" }}>Use the 7D or 30D filters</span> to track your recent performance vs all-time. Keeps the view clean during the season.<br />
                      <span style={{ color: "#f9fafb" }}>Collapsed date sections are still counted</span> in the RECORD, HIT RATE, and P&amp;L tiles — collapsing them doesn't exclude them from your stats.
                    </div>
                  </div>
                </Section>

                <Section title="⚙ Settings">
                  <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                    Access Settings by tapping the <span style={{ color: "#fbbf24", fontWeight: 700 }}>⚙</span> gear icon in the bottom footer bar. Settings are saved to your account server-side — they persist across devices and sessions.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      ["Preferred Sportsbook", "Sets which book's line and odds appear first throughout the app — on Model Pick LINES grids, Board prop lines, and any multi-book display. Options: DK (DraftKings), FD (FanDuel), CZR (Caesars), MGM (BetMGM), BOV (Bovada). DraftKings is the default. Tap a different book to switch, tap it again to reset back to DK."],
                      ["Sign Out", "Signs you out of your account and clears your session token. Your preferences are saved to your account and will be restored on next login."],
                    ].map(([label, desc]) => (
                      <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ background: "#1a1c2e", border: "1px solid #2d3148", borderRadius: 6, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#fbbf24", fontFamily: "monospace", flexShrink: 0, minWidth: 80, textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="🎯 Prop Types Explained">
                  <PropRow type="K" def="Pitcher strikeouts — Over/Under on how many batters the starter fans. High K/9 + green matchup scores = good over spot." />
                  <PropRow type="Outs" def="Pitcher outs recorded — Over/Under on how many outs the starter gets before leaving the game. 3 outs = 1 inning. A line of 17.5 means roughly 6 innings. Elite control (low WHIP + BB/9) and a weak lineup push this over." />
                  <PropRow type="Hits" def="Batter hits — typically Over 0.5 hits (get at least one hit) or Under 1.5. Red matchup score = good over spot." />
                  <PropRow type="TB" def="Total Bases — counts singles (1), doubles (2), triples (3), home runs (4). Over 1.5 TB is a popular line." />
                  <PropRow type="HR" def="Home Run — will this batter hit at least one HR? Looks at power metrics, park factor, and pitcher tendencies." />
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
