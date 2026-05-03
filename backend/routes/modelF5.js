const express = require("express");
const axios = require("axios");
const cache = require("../services/cache");
const requireAuth = require("../middleware/auth");

const router = express.Router();

const BASE_URL = process.env.BACKEND_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3001}`;
const CACHE_TTL = 10 * 60 * 1000;
const LAB_ALLOWLIST = (process.env.AI_PICKS_ALLOWLIST ?? "leadoffkaiba")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const COEFF = {
  INTERCEPT: -0.08,
  ERA_DIFF: 0.18,
  WHIP_DIFF: 0.22,
  HOME_FIELD: 0.12,
  UMP_K_TENDENCY: 0.06,
  FORM_DIFF: 0.10,
};

const todayHonolulu = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clip = (n, min, max) => Math.max(min, Math.min(max, n));

const predictHomeProb = (features) => {
  const z = COEFF.INTERCEPT
    + COEFF.ERA_DIFF * features.eraDiff
    + COEFF.WHIP_DIFF * features.whipDiff
    + COEFF.HOME_FIELD * features.homeField
    + COEFF.UMP_K_TENDENCY * features.umpKTendency
    + COEFF.FORM_DIFF * features.formDiff;
  return sigmoid(z);
};

const mlToImplied = (ml) => {
  if (!ml || ml === "N/A") return null;
  const n = parseInt(String(ml).replace("+", ""), 10);
  if (Number.isNaN(n)) return null;
  return n < 0 ? (-n) / (-n + 100) : 100 / (n + 100);
};

function requireLabAccess(req, res, next) {
  const identities = [req.user?.email, req.user?.username, req.email, req.username]
    .filter(Boolean)
    .map(s => String(s).trim().toLowerCase());
  if (!identities.some(id => LAB_ALLOWLIST.includes(id))) {
    return res.status(403).json({ error: "Access restricted" });
  }
  return next();
}

router.use(requireAuth, (req, _res, next) => {
  req.user = { email: req.email ?? null, username: req.username ?? null, userId: req.userId ?? null };
  next();
}, requireLabAccess);

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 12000,
});

function averageLastThreeEra(gamelog) {
  const games = Array.isArray(gamelog?.games) ? gamelog.games.slice(0, 3) : [];
  const eraVals = games
    .map(g => parseFloat(g?.era))
    .filter(v => Number.isFinite(v));
  if (!eraVals.length) return null;
  return eraVals.reduce((sum, v) => sum + v, 0) / eraVals.length;
}

function buildNeutralTeam(side, team) {
  return {
    id: side?.id ?? null,
    name: side?.name ?? team?.name ?? "Unknown",
    fullName: side?.name ?? team?.name ?? "Unknown",
    abbr: side?.abbr ?? team?.abbr ?? "?",
  };
}

router.get("/f5", async (_req, res) => {
  const cacheKey = "model:f5";
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const date = todayHonolulu();
    const [scheduleRes, oddsRes] = await Promise.all([
      api.get("/api/schedule", { params: { date } }),
      api.get("/api/odds"),
    ]);
    const slate = Array.isArray(scheduleRes.data) ? scheduleRes.data : [];
    const oddsMap = oddsRes.data?.map ?? {};

    const perGame = await Promise.allSettled(
      slate
        .filter(g => g?.probablePitchers?.away?.id && g?.probablePitchers?.home?.id)
        .map(async (game) => {
          const awayPitcher = game.probablePitchers.away;
          const homePitcher = game.probablePitchers.home;
          const oddsKey = `${game.away?.name}|${game.home?.name}`;
          const odds = oddsMap[oddsKey] ?? {};

          const [
            awayStatsRes,
            awayGamelogRes,
            homeStatsRes,
            homeGamelogRes,
            umpireRes,
          ] = await Promise.allSettled([
            api.get(`/api/players/${awayPitcher.id}/stats`, { params: { group: "pitching" } }),
            api.get(`/api/players/${awayPitcher.id}/gamelog`, { params: { group: "pitching" } }),
            api.get(`/api/players/${homePitcher.id}/stats`, { params: { group: "pitching" } }),
            api.get(`/api/players/${homePitcher.id}/gamelog`, { params: { group: "pitching" } }),
            api.get(`/api/umpires/${game.gamePk}`),
          ]);

          const awayStats = awayStatsRes.status === "fulfilled" ? awayStatsRes.value.data : null;
          const awayGamelog = awayGamelogRes.status === "fulfilled" ? awayGamelogRes.value.data : null;
          const homeStats = homeStatsRes.status === "fulfilled" ? homeStatsRes.value.data : null;
          const homeGamelog = homeGamelogRes.status === "fulfilled" ? homeGamelogRes.value.data : null;
          const umpire = umpireRes.status === "fulfilled" ? umpireRes.value.data?.homePlate ?? null : null;

          const awayEra = Number.parseFloat(awayStats?.era);
          const homeEra = Number.parseFloat(homeStats?.era);
          const awayWhip = Number.parseFloat(awayStats?.whip);
          const homeWhip = Number.parseFloat(homeStats?.whip);
          const awayLastThreeEra = averageLastThreeEra(awayGamelog);
          const homeLastThreeEra = averageLastThreeEra(homeGamelog);
          const awaySeasonEra = Number.isFinite(awayEra) ? awayEra : null;
          const homeSeasonEra = Number.isFinite(homeEra) ? homeEra : null;
          const umpireRawDelta = umpire?.stats?.k_rate_delta ?? umpire?.stats?.kRateDelta ?? umpire?.stats?.kFavor ?? 0;
          const umpKTendency = clip(Number.parseFloat(umpireRawDelta) || 0, -0.5, 0.5);

          const features = {
            eraDiff: (Number.isFinite(awayEra) ? awayEra : 0) - (Number.isFinite(homeEra) ? homeEra : 0),
            whipDiff: (Number.isFinite(awayWhip) ? awayWhip : 0) - (Number.isFinite(homeWhip) ? homeWhip : 0),
            homeField: 1.0,
            umpKTendency,
            formDiff: (
              (awayLastThreeEra != null && awaySeasonEra != null ? awayLastThreeEra - awaySeasonEra : 0)
              - (homeLastThreeEra != null && homeSeasonEra != null ? homeLastThreeEra - homeSeasonEra : 0)
            ),
          };

          const homeProb = predictHomeProb(features);
          const awayProb = 1 - homeProb;
          const awayImplied = mlToImplied(odds.f5AwayML);
          const homeImplied = mlToImplied(odds.f5HomeML);
          const awayEdge = awayImplied == null ? null : awayProb - awayImplied;
          const homeEdge = homeImplied == null ? null : homeProb - homeImplied;
          const leanSide = Math.abs(awayEdge ?? 0) >= Math.abs(homeEdge ?? 0) ? "away" : "home";
          const leanEdge = leanSide === "away" ? awayEdge : homeEdge;
          const hasEdge = leanEdge != null && Math.abs(leanEdge) >= 0.04;

          const dataWarning = !Number.isFinite(awayEra) || !Number.isFinite(homeEra)
            || !Number.isFinite(awayWhip) || !Number.isFinite(homeWhip)
            || awayLastThreeEra == null || homeLastThreeEra == null
            || (!odds.f5AwayML && !odds.f5HomeML);

          return {
            gamePk: game.gamePk,
            gameTime: game.gameTime,
            away: buildNeutralTeam(game.away, game.away),
            home: buildNeutralTeam(game.home, game.home),
            awayPitcher: {
              id: awayPitcher.id,
              name: awayPitcher.name,
              era: Number.isFinite(awayEra) ? awayEra : null,
              whip: Number.isFinite(awayWhip) ? awayWhip : null,
              lastThreeEra: awayLastThreeEra,
            },
            homePitcher: {
              id: homePitcher.id,
              name: homePitcher.name,
              era: Number.isFinite(homeEra) ? homeEra : null,
              whip: Number.isFinite(homeWhip) ? homeWhip : null,
              lastThreeEra: homeLastThreeEra,
            },
            umpire: umpire ? {
              name: umpire.name,
              kTendency: umpKTendency,
            } : null,
            odds: {
              f5AwayML: odds.f5AwayML ?? null,
              f5HomeML: odds.f5HomeML ?? null,
            },
            model: {
              awayProb,
              homeProb,
              awayImplied,
              homeImplied,
              awayEdge,
              homeEdge,
              leanSide,
              leanEdge,
              hasEdge,
              features,
            },
            dataWarning,
          };
        })
    );

    const games = perGame
      .filter(r => r.status === "fulfilled")
      .map(r => r.value)
      .sort((a, b) => Math.abs(b.model?.leanEdge ?? 0) - Math.abs(a.model?.leanEdge ?? 0));

    const result = { date, games };
    cache.set(cacheKey, result, CACHE_TTL);
    res.setHeader("X-Cache", "MISS");
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: "F5 model unavailable", detail: err.message });
  }
});

module.exports = router;
