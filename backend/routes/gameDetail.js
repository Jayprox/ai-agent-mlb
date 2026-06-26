const express = require("express");
const router = express.Router();

const { buildSchedulePayloadForJob } = require("./schedule");
const { fetchLineupsForGame } = require("./lineups");
const { fetchUmpiresForGame } = require("./umpires");
const { getNrfiForGame } = require("./nrfi");
const { fetchWeatherMap } = require("./slate");
const { buildGameBullpenForJob } = require("./bullpen");
const { fetchPlayerStatsPayload, fetchPlayerGamelogPayload } = require("./players");
const { buildArsenalPayloadForJob } = require("./arsenal");
const { fetchTeamStats } = require("./teamStats");

// ── Concurrency-limited allSettled ─────────────────────────────────────────
// Runs an array of thunks (() => Promise) with at most `limit` concurrent
// executions. Prevents bursting all 13 MLB API calls simultaneously on a
// cold game tap. Returns results in the same allSettled shape.
async function allSettledConcurrent(thunks, limit = 4) {
  const results = new Array(thunks.length);
  let idx = 0;

  async function worker() {
    while (idx < thunks.length) {
      const i = idx++;
      try {
        results[i] = { status: "fulfilled", value: await thunks[i]() };
      } catch (err) {
        results[i] = { status: "rejected", reason: err };
      }
    }
  }

  // Spin up `limit` workers that drain the queue together
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
  return results;
}

// ── In-flight deduplication ────────────────────────────────────────────────
// If two users tap the same game within milliseconds, the second request
// shares the first one's already-running promises rather than spawning a
// duplicate set of MLB API calls.
const inFlight = new Map(); // `${gamePk}:${date}` → Promise<detail>

async function buildGameDetail(gamePk, date) {
  const slateDate = date ?? new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  const key = `${gamePk}:${slateDate}`;

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const promise = _buildGameDetail(gamePk, slateDate).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function _buildGameDetail(gamePk, slateDate) {
  const schedule = await buildSchedulePayloadForJob(slateDate);
  const game = schedule.find((g) => String(g.gamePk) === String(gamePk));
  if (!game) {
    const error = new Error(`Game not found for gamePk=${gamePk}`);
    error.status = 404;
    throw error;
  }

  const homePitcherId = game.probablePitchers?.home?.id ?? null;
  const awayPitcherId = game.probablePitchers?.away?.id ?? null;
  const homeTeamId = game.home?.id ?? null;
  const awayTeamId = game.away?.id ?? null;

  // Priority order: lineup/umpire first (most critical for display), then
  // lower-priority data. The concurrency cap (4) ensures the first 4 thunks
  // start immediately; the rest queue behind them as slots free up.
  // NRFI and weather are typically already warm from the slate bundle, so
  // they resolve from cache instantly and free up slots quickly.
  const thunks = [
    () => fetchLineupsForGame(gamePk),
    () => fetchUmpiresForGame(gamePk),
    () => getNrfiForGame(gamePk),
    () => fetchWeatherMap([game]).then((map) => map[game.gamePk] ?? null),
    () => buildGameBullpenForJob(gamePk),
    () => (homePitcherId ? fetchPlayerStatsPayload(homePitcherId, "pitching") : Promise.resolve(null)),
    () => (homePitcherId ? fetchPlayerGamelogPayload(homePitcherId, "pitching") : Promise.resolve(null)),
    () => (homePitcherId ? buildArsenalPayloadForJob(homePitcherId) : Promise.resolve(null)),
    () => (awayPitcherId ? fetchPlayerStatsPayload(awayPitcherId, "pitching") : Promise.resolve(null)),
    () => (awayPitcherId ? fetchPlayerGamelogPayload(awayPitcherId, "pitching") : Promise.resolve(null)),
    () => (awayPitcherId ? buildArsenalPayloadForJob(awayPitcherId) : Promise.resolve(null)),
    () => (homeTeamId ? fetchTeamStats(homeTeamId) : Promise.resolve(null)),
    () => (awayTeamId ? fetchTeamStats(awayTeamId) : Promise.resolve(null)),
  ];

  const [
    lineupsResult,
    umpireResult,
    nrfiResult,
    weatherResult,
    bullpenResult,
    homeStatsResult,
    homeGamelogResult,
    homeArsenalResult,
    awayStatsResult,
    awayGamelogResult,
    awayArsenalResult,
    homeTeamStatsResult,
    awayTeamStatsResult,
  ] = await allSettledConcurrent(thunks, 4);

  const valueOrNull = (result) => (result.status === "fulfilled" ? result.value : null);

  return {
    gamePk: Number(gamePk),
    lineups: valueOrNull(lineupsResult),
    umpire: valueOrNull(umpireResult),
    nrfi: valueOrNull(nrfiResult),
    weather: valueOrNull(weatherResult),
    bullpen: valueOrNull(bullpenResult),
    homePitcher: homePitcherId ? {
      id: homePitcherId,
      stats: valueOrNull(homeStatsResult),
      gamelog: valueOrNull(homeGamelogResult),
      arsenal: valueOrNull(homeArsenalResult),
    } : null,
    awayPitcher: awayPitcherId ? {
      id: awayPitcherId,
      stats: valueOrNull(awayStatsResult),
      gamelog: valueOrNull(awayGamelogResult),
      arsenal: valueOrNull(awayArsenalResult),
    } : null,
    teamStats: {
      home: valueOrNull(homeTeamStatsResult),
      away: valueOrNull(awayTeamStatsResult),
    },
    fetchedAt: new Date().toISOString(),
  };
}

router.get("/:gamePk", async (req, res) => {
  try {
    const detail = await buildGameDetail(req.params.gamePk, req.query.date);
    return res.json(detail);
  } catch (err) {
    return res.status(err.status ?? 502).json({
      error: err.status === 404 ? "Game not found" : "game detail unavailable",
      detail: err.message,
    });
  }
});

module.exports = router;
module.exports.buildGameDetail = buildGameDetail;
