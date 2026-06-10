/**
 * Shared live-data gathering + board-market computation.
 * Used by:
 *   - backend/jobs/dailyAiSnapshot.js
 *   - backend/routes/boardDailySnapshot.js
 */

const axios = require("axios");
const cache = require("./cache");
const { getNrfiForGame } = require("../routes/nrfi");
const { getOddsMap } = require("../routes/odds");

const BASE_URL = () => `http://localhost:${process.env.PORT ?? 3001}`;

async function internalGet(path) {
  try {
    const res = await axios.get(`${BASE_URL()}${path}`, { timeout: 12000 });
    return res.data;
  } catch {
    return null;
  }
}

async function internalPost(path, body) {
  try {
    const res = await axios.post(`${BASE_URL()}${path}`, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 20000,
    });
    return res.data;
  } catch {
    return null;
  }
}

const WEATHER_TTL_MS = 60 * 60 * 1000;
const STADIUMS_GEO = {
  "Citizens Bank Park":        { lat: 39.9061,  lon: -75.1665,  tz: "America/New_York",   roof: false },
  "Dodger Stadium":            { lat: 34.0739,  lon: -118.2400, tz: "America/Los_Angeles", roof: false },
  "Globe Life Field":          { lat: 32.7473,  lon: -97.0832,  tz: "America/Chicago",     roof: true  },
  "American Family Field":     { lat: 43.0280,  lon: -87.9712,  tz: "America/Chicago",     roof: false },
  "Oracle Park":               { lat: 37.7786,  lon: -122.3893, tz: "America/Los_Angeles", roof: false },
  "Rogers Centre":             { lat: 43.6414,  lon: -79.3894,  tz: "America/Toronto",     roof: true  },
  "Yankee Stadium":            { lat: 40.8296,  lon: -73.9262,  tz: "America/New_York",    roof: false },
  "Fenway Park":               { lat: 42.3467,  lon: -71.0972,  tz: "America/New_York",    roof: false },
  "Wrigley Field":             { lat: 41.9484,  lon: -87.6553,  tz: "America/Chicago",     roof: false },
  "Busch Stadium":             { lat: 38.6226,  lon: -90.1928,  tz: "America/Chicago",     roof: false },
  "T-Mobile Park":             { lat: 47.5914,  lon: -122.3325, tz: "America/Los_Angeles", roof: false },
  "Camden Yards":              { lat: 39.2838,  lon: -76.6218,  tz: "America/New_York",    roof: false },
  "Petco Park":                { lat: 32.7076,  lon: -117.1570, tz: "America/Los_Angeles", roof: false },
  "Truist Park":               { lat: 33.8907,  lon: -84.4677,  tz: "America/New_York",    roof: false },
  "Great American Ball Park":  { lat: 39.0979,  lon: -84.5082,  tz: "America/New_York",    roof: false },
  "loanDepot park":            { lat: 25.7781,  lon: -80.2197,  tz: "America/New_York",    roof: true  },
  "Minute Maid Park":          { lat: 29.7572,  lon: -95.3555,  tz: "America/Chicago",     roof: true  },
  "Tropicana Field":           { lat: 27.7683,  lon: -82.6534,  tz: "America/New_York",    roof: true  },
  "Chase Field":               { lat: 33.4453,  lon: -112.0667, tz: "America/Phoenix",     roof: true  },
  "Coors Field":               { lat: 39.7559,  lon: -104.9942, tz: "America/Denver",      roof: false },
  "PNC Park":                  { lat: 40.4469,  lon: -80.0057,  tz: "America/New_York",    roof: false },
  "Target Field":              { lat: 44.9817,  lon: -93.2778,  tz: "America/Chicago",     roof: false },
  "Kauffman Stadium":          { lat: 39.0517,  lon: -94.4803,  tz: "America/Chicago",     roof: false },
  "Progressive Field":         { lat: 41.4962,  lon: -81.6852,  tz: "America/New_York",    roof: false },
  "Comerica Park":             { lat: 42.3390,  lon: -83.0485,  tz: "America/New_York",    roof: false },
  "Guaranteed Rate Field":     { lat: 41.8299,  lon: -87.6338,  tz: "America/Chicago",     roof: false },
  "Angel Stadium":             { lat: 33.8003,  lon: -117.8827, tz: "America/Los_Angeles", roof: false },
  "Nationals Park":            { lat: 38.8730,  lon: -77.0074,  tz: "America/New_York",    roof: false },
  "Citi Field":                { lat: 40.7571,  lon: -73.8458,  tz: "America/New_York",    roof: false },
};

const WMO_CODES = {
  0: "Clear", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Overcast",
  45: "Foggy", 48: "Icy Fog", 51: "Light Drizzle", 53: "Drizzle",
  55: "Heavy Drizzle", 61: "Light Rain", 63: "Rain", 65: "Heavy Rain",
  71: "Light Snow", 73: "Snow", 75: "Heavy Snow", 80: "Rain Showers",
  81: "Rain Showers", 82: "Violent Rain", 95: "Thunderstorm", 99: "Thunderstorm",
};

function stadiumHour(gameTimeIso, tz) {
  try {
    return parseInt(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz })
        .format(new Date(gameTimeIso)), 10
    );
  } catch {
    return 19;
  }
}

function isHrFavorable(direction, speed, orientation) {
  if (speed < 8) return false;
  const relative = ((direction - (orientation ?? 180)) + 360) % 360;
  return relative >= 225 && relative <= 315;
}

async function buildWeatherMap(schedule) {
  const weatherMap = {};
  const fetches = [];
  for (const game of schedule) {
    const sd = STADIUMS_GEO[game.stadium];
    if (!sd) continue;
    if (sd.roof) {
      weatherMap[game.gamePk] = { condition: "Dome", hrFavorable: false, roof: true };
      continue;
    }
    const cacheKey = `weather:${game.stadium}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      weatherMap[game.gamePk] = {
        ...cached,
        condition: WMO_CODES[cached.weathercode] ?? "Unknown",
        hrFavorable: isHrFavorable(cached.winddirection, cached.windspeed, sd.orientation ?? 180),
      };
      continue;
    }
    const hour = game.gameTime ? stadiumHour(game.gameTime, sd.tz) : 19;
    const url = [
      "https://api.open-meteo.com/v1/forecast",
      `?latitude=${sd.lat}&longitude=${sd.lon}`,
      "&hourly=temperature_2m,windspeed_10m,winddirection_10m,weathercode,precipitation_probability,relativehumidity_2m",
      "&wind_speed_unit=mph&temperature_unit=fahrenheit",
      `&timezone=${encodeURIComponent(sd.tz)}&forecast_days=1`,
    ].join("");
    fetches.push(
      axios.get(url, { timeout: 8000 }).then(({ data }) => {
        const h = data.hourly;
        const idx = h.time.findIndex((t) => new Date(t).getHours() === hour);
        const i = idx >= 0 ? idx : Math.min(hour, h.time.length - 1);
        const raw = {
          temp: Math.round(h.temperature_2m[i]),
          windspeed: h.windspeed_10m[i],
          winddirection: h.winddirection_10m[i],
          weathercode: h.weathercode[i],
          precipitation_probability: h.precipitation_probability[i],
          relativehumidity: h.relativehumidity_2m[i],
        };
        cache.set(cacheKey, raw, WEATHER_TTL_MS);
        weatherMap[game.gamePk] = {
          ...raw,
          condition: WMO_CODES[raw.weathercode] ?? "Unknown",
          hrFavorable: isHrFavorable(raw.winddirection, raw.windspeed, sd.orientation ?? 180),
        };
      }).catch(() => {})
    );
  }
  await Promise.allSettled(fetches);
  return weatherMap;
}

async function gatherLiveBoardData(activeSlate) {
  const [oddsMap, ...nrfiArr] = await Promise.all([
    getOddsMap().catch(() => null),
    ...activeSlate.map((g) => getNrfiForGame(g.gamePk).catch(() => null)),
  ]);
  const liveNrfiData = Object.fromEntries(activeSlate.map((g, i) => [g.gamePk, nrfiArr[i]]));
  const liveWeather = await buildWeatherMap(activeSlate).catch(() => ({}));

  const liveLineups = {};
  const liveUmpires = {};
  const livePlayerProps = {};
  await Promise.allSettled(activeSlate.map(async (game) => {
    const [lineups, umpires, props] = await Promise.all([
      internalGet(`/api/lineups/${game.gamePk}`),
      internalGet(`/api/umpires/${game.gamePk}`),
      internalGet(`/api/player-props/${game.gamePk}`),
    ]);
    if (lineups) liveLineups[game.gamePk] = lineups;
    if (umpires) liveUmpires[game.gamePk] = umpires;
    if (props) livePlayerProps[String(game.gamePk)] = props;
  }));

  const liveTeamStats = {};
  const seenTeams = new Set();
  await Promise.allSettled(activeSlate.flatMap((game) =>
    [{ id: game.home?.id, abbr: game.home?.abbr }, { id: game.away?.id, abbr: game.away?.abbr }]
      .filter((t) => t.id && t.abbr && !seenTeams.has(t.abbr))
      .map(async (t) => {
        seenTeams.add(t.abbr);
        const data = await internalGet(`/api/team-stats/${t.id}`);
        if (data?.kPct != null) liveTeamStats[t.abbr] = data;
      })
  ));

  const livePitcherStats = {};
  const liveGameLog = {};
  const pitcherArsenal = {};
  const liveStatSplits = {};

  const pitcherIds = [...new Set(
    activeSlate.flatMap((g) => [g.probablePitchers?.home?.id, g.probablePitchers?.away?.id])
      .filter(Boolean)
  )];

  await Promise.allSettled(pitcherIds.map(async (pid) => {
    const [stats, gamelog, arsenal, splits] = await Promise.all([
      internalGet(`/api/players/${pid}/stats?group=pitching`),
      internalGet(`/api/players/${pid}/gamelog?group=pitching`),
      internalGet(`/api/arsenal/${pid}`),
      internalGet(`/api/stat-splits/${pid}?group=pitching`),
    ]);
    if (stats) livePitcherStats[pid] = stats;
    if (gamelog) liveGameLog[pid] = gamelog;
    if (arsenal?.pitcherStats) pitcherArsenal[pid] = { pitcherStats: arsenal.pitcherStats };
    if (splits) liveStatSplits[`${pid}:pitching`] = splits;
  }));

  const liveHittingLog = {};
  const batterIds = [...new Set(
    Object.values(liveLineups)
      .flatMap((lu) => [...(lu.home ?? []), ...(lu.away ?? [])])
      .slice(0, 120)
      .map((b) => b?.id)
      .filter(Boolean)
  )];

  if (batterIds.length) {
    const batchData = await internalPost("/api/players/gamelogs/batch", {
      playerIds: batterIds,
      group: "hitting",
    });
    if (batchData && typeof batchData === "object") {
      Object.assign(liveHittingLog, batchData);
    }

    const topBatterIds = batterIds.slice(0, 60);
    await Promise.allSettled(topBatterIds.map(async (bid) => {
      const splits = await internalGet(`/api/stat-splits/${bid}?group=hitting`);
      if (splits) liveStatSplits[`${bid}:hitting`] = splits;
    }));
  }

  return {
    oddsMap,
    liveNrfiData,
    liveWeather,
    liveLineups,
    liveUmpires,
    livePlayerProps,
    liveTeamStats,
    livePitcherStats,
    liveGameLog,
    pitcherArsenal,
    liveStatSplits,
    liveHittingLog,
  };
}

async function computeMarketCandidates(market, activeSlate, liveData) {
  const board = await import("../../src/board/index.js");
  const { computePitcherBoard, computeBatterBoard, computeGameBoard } = board;

  const {
    oddsMap,
    liveNrfiData,
    liveWeather,
    liveLineups,
    liveUmpires,
    livePlayerProps,
    liveTeamStats,
    livePitcherStats,
    liveGameLog,
    pitcherArsenal,
    liveStatSplits,
    liveHittingLog,
  } = liveData;

  switch (market) {
    case "k":
      return computePitcherBoard("k", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);
    case "outs":
      return computePitcherBoard("outs", activeSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal);
    case "hits":
      return computeBatterBoard("hits", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits);
    case "hr":
      return computeBatterBoard("hr", activeSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits);
    case "nrfi":
    case "total":
    case "spread":
    case "ml":
    case "f5ml":
    case "f5spread":
      return computeGameBoard(market, activeSlate, liveNrfiData, liveWeather, oddsMap ?? {}, livePitcherStats, liveUmpires, liveLineups);
    default:
      return [];
  }
}

module.exports = {
  internalGet,
  internalPost,
  buildWeatherMap,
  gatherLiveBoardData,
  computeMarketCandidates,
};
