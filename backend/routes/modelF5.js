const express = require("express");
const axios = require("axios");
const cache = require("../services/cache");
const requireAuth = require("../middleware/auth");
const { readLog, appendEntry, resolveEntry } = require("../services/labCalibration");

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

const COEFF_FG = {
  INTERCEPT: -0.10,
  ERA_DIFF: 0.14,
  WHIP_DIFF: 0.17,
  HOME_FIELD: 0.16,
  UMP_K_TENDENCY: 0.04,
  FORM_DIFF: 0.07,
  BULLPEN_ERA_DIFF: 0.13,
};

const todayHonolulu = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clip = (n, min, max) => Math.max(min, Math.min(max, n));

const predictHomeProb = (features, coeff = COEFF) => {
  const z = coeff.INTERCEPT
    + coeff.ERA_DIFF * features.eraDiff
    + coeff.WHIP_DIFF * features.whipDiff
    + coeff.HOME_FIELD * features.homeField
    + coeff.UMP_K_TENDENCY * features.umpKTendency
    + coeff.FORM_DIFF * features.formDiff
    + (coeff.BULLPEN_ERA_DIFF ?? 0) * (features.bullpenEraDiff ?? 0);
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

async function fetchSlateAndOdds() {
  const date = todayHonolulu();
  const [scheduleRes, oddsRes] = await Promise.all([
    api.get("/api/schedule", { params: { date } }),
    api.get("/api/odds"),
  ]);
  return {
    date,
    slate: Array.isArray(scheduleRes.data) ? scheduleRes.data : [],
    oddsMap: oddsRes.data?.map ?? {},
  };
}

async function buildModelGames({ slate, oddsMap, oddsSelector, coeff, includeBullpen = false }) {
  const perGame = await Promise.allSettled(
    slate
      .filter(g => g?.probablePitchers?.away?.id && g?.probablePitchers?.home?.id)
      .map(async (game) => {
        const awayPitcher = game.probablePitchers.away;
        const homePitcher = game.probablePitchers.home;
        const oddsKey = `${game.away?.name}|${game.home?.name}`;
        const odds = oddsMap[oddsKey] ?? {};

        const requests = [
          api.get(`/api/players/${awayPitcher.id}/stats`, { params: { group: "pitching" } }),
          api.get(`/api/players/${awayPitcher.id}/gamelog`, { params: { group: "pitching" } }),
          api.get(`/api/players/${homePitcher.id}/stats`, { params: { group: "pitching" } }),
          api.get(`/api/players/${homePitcher.id}/gamelog`, { params: { group: "pitching" } }),
          api.get(`/api/umpires/${game.gamePk}`),
        ];
        if (includeBullpen) requests.push(api.get(`/api/bullpen/${game.gamePk}`));

        const settled = await Promise.allSettled(requests);
        const awayStats = settled[0].status === "fulfilled" ? settled[0].value.data : null;
        const awayGamelog = settled[1].status === "fulfilled" ? settled[1].value.data : null;
        const homeStats = settled[2].status === "fulfilled" ? settled[2].value.data : null;
        const homeGamelog = settled[3].status === "fulfilled" ? settled[3].value.data : null;
        const umpire = settled[4].status === "fulfilled" ? settled[4].value.data?.homePlate ?? null : null;
        const bullpen = includeBullpen && settled[5]?.status === "fulfilled" ? settled[5].value.data : null;

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
        const bullpenEraAway = Number.parseFloat(bullpen?.away?.era);
        const bullpenEraHome = Number.parseFloat(bullpen?.home?.era);

        const features = {
          eraDiff: (Number.isFinite(awayEra) ? awayEra : 0) - (Number.isFinite(homeEra) ? homeEra : 0),
          whipDiff: (Number.isFinite(awayWhip) ? awayWhip : 0) - (Number.isFinite(homeWhip) ? homeWhip : 0),
          homeField: 1.0,
          umpKTendency,
          formDiff: (
            (awayLastThreeEra != null && awaySeasonEra != null ? awayLastThreeEra - awaySeasonEra : 0)
            - (homeLastThreeEra != null && homeSeasonEra != null ? homeLastThreeEra - homeSeasonEra : 0)
          ),
          bullpenEraAway: Number.isFinite(bullpenEraAway) ? bullpenEraAway : null,
          bullpenEraHome: Number.isFinite(bullpenEraHome) ? bullpenEraHome : null,
          bullpenEraDiff: (Number.isFinite(bullpenEraAway) ? bullpenEraAway : 0) - (Number.isFinite(bullpenEraHome) ? bullpenEraHome : 0),
        };

        const homeProb = predictHomeProb(features, coeff);
        const awayProb = 1 - homeProb;
        const selectedOdds = oddsSelector(odds);
        const awayImplied = mlToImplied(selectedOdds.awayML);
        const homeImplied = mlToImplied(selectedOdds.homeML);
        const awayEdge = awayImplied == null ? null : awayProb - awayImplied;
        const homeEdge = homeImplied == null ? null : homeProb - homeImplied;
        const leanSide = Math.abs(awayEdge ?? 0) >= Math.abs(homeEdge ?? 0) ? "away" : "home";
        const leanEdge = leanSide === "away" ? awayEdge : homeEdge;
        const hasEdge = leanEdge != null && Math.abs(leanEdge) >= 0.04;

        const dataWarning = !Number.isFinite(awayEra) || !Number.isFinite(homeEra)
          || !Number.isFinite(awayWhip) || !Number.isFinite(homeWhip)
          || awayLastThreeEra == null || homeLastThreeEra == null
          || (includeBullpen && (!Number.isFinite(bullpenEraAway) || !Number.isFinite(bullpenEraHome)))
          || (!selectedOdds.awayML && !selectedOdds.homeML);

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
          odds: selectedOdds,
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

  return perGame
    .filter(r => r.status === "fulfilled")
    .map(r => r.value)
    .sort((a, b) => Math.abs(b.model?.leanEdge ?? 0) - Math.abs(a.model?.leanEdge ?? 0));
}

function buildCalibrationSummary(entries, model) {
  const filtered = model === "combined" ? entries : entries.filter(e => e.model === model);
  const settled = filtered.filter(e => e.result === "HIT" || e.result === "MISS");
  const pushes = filtered.filter(e => e.result === "PUSH").length;
  const hits = settled.filter(e => e.result === "HIT").length;
  const misses = settled.filter(e => e.result === "MISS").length;
  const accuracy = settled.length ? Math.round((hits / settled.length) * 100) : null;
  const brierScore = settled.length
    ? settled.reduce((sum, e) => {
        const outcome = e.result === "HIT" ? 1 : 0;
        return sum + ((e.leanProb ?? 0) - outcome) ** 2;
      }, 0) / settled.length
    : null;
  const edgeSettled = settled.filter(e => e.hasEdge === true);
  const edgeHits = edgeSettled.filter(e => e.result === "HIT").length;
  const edgeMisses = edgeSettled.filter(e => e.result === "MISS").length;
  const edgeTotal = edgeSettled.length;
  const edgeAccuracy = edgeTotal ? Math.round((edgeHits / edgeTotal) * 100) : null;

  return {
    total: settled.length,
    hits,
    misses,
    pushes,
    accuracy,
    brierScore,
    edgeHits,
    edgeTotal,
    edgeAccuracy,
    edgeMisses,
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
    const { date, slate, oddsMap } = await fetchSlateAndOdds();
    const games = await buildModelGames({
      slate,
      oddsMap,
      oddsSelector: (odds) => ({
        f5AwayML: odds.f5AwayML ?? null,
        f5HomeML: odds.f5HomeML ?? null,
        awayML: odds.f5AwayML ?? null,
        homeML: odds.f5HomeML ?? null,
      }),
      coeff: COEFF,
      includeBullpen: false,
    });
    const result = { date, games };
    cache.set(cacheKey, result, CACHE_TTL);
    res.setHeader("X-Cache", "MISS");
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: "F5 model unavailable", detail: err.message });
  }
});

router.get("/fullgame", async (_req, res) => {
  const cacheKey = "model:fullgame";
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const { date, slate, oddsMap } = await fetchSlateAndOdds();
    const games = await buildModelGames({
      slate,
      oddsMap,
      oddsSelector: (odds) => ({
        awayML: odds.awayML ?? null,
        homeML: odds.homeML ?? null,
      }),
      coeff: COEFF_FG,
      includeBullpen: true,
    });
    const result = { date, games };
    cache.set(cacheKey, result, CACHE_TTL);
    res.setHeader("X-Cache", "MISS");
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: "Full-game model unavailable", detail: err.message });
  }
});

router.post("/calibration/record", async (req, res) => {
  try {
    const body = req.body ?? {};
    const model = body.model === "fullgame" ? "fullgame" : "f5ml";
    const date = String(body.date ?? "").trim();
    const gamePk = Number(body.gamePk);
    const leanSide = body.leanSide === "home" ? "home" : body.leanSide === "away" ? "away" : null;
    if (!date || !Number.isFinite(gamePk) || !leanSide) {
      return res.status(400).json({ error: "gamePk, date, and leanSide required" });
    }
    await appendEntry({
      id: `${model}:${date}:${gamePk}`,
      gamePk,
      date,
      leanSide,
      leanProb: typeof body.leanProb === "number" ? body.leanProb : null,
      leanEdge: typeof body.leanEdge === "number" ? body.leanEdge : null,
      hasEdge: body.hasEdge === true,
      model,
      result: null,
      resolvedAt: null,
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Calibration record failed", detail: err.message });
  }
});

router.post("/calibration/resolve", async (req, res) => {
  try {
    const body = req.body ?? {};
    const model = body.model === "fullgame" ? "fullgame" : "f5ml";
    const gamePk = Number(body.gamePk);
    const result = ["HIT", "MISS", "PUSH"].includes(body.result) ? body.result : null;
    if (!Number.isFinite(gamePk) || !result) {
      return res.status(400).json({ error: "gamePk and valid result required" });
    }
    const entries = await readLog();
    const unresolved = entries
      .filter(e => e.model === model && Number(e.gamePk) === gamePk)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    if (!unresolved) return res.json({ ok: true, skipped: true });
    await resolveEntry(unresolved.id, result);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Calibration resolve failed", detail: err.message });
  }
});

router.get("/calibration", async (_req, res) => {
  try {
    const entries = await readLog();
    return res.json({
      entries,
      summary: {
        f5ml: buildCalibrationSummary(entries, "f5ml"),
        fullgame: buildCalibrationSummary(entries, "fullgame"),
        combined: buildCalibrationSummary(entries, "combined"),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Calibration fetch failed", detail: err.message });
  }
});

module.exports = router;
