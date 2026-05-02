const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const mlb = require("../services/mlbApi");
const requireAuth = require("../middleware/auth");
const { query, isConnected } = require("../services/db");

const router = express.Router();

const ADVISOR_ALLOWLIST = (process.env.AI_PICKS_ALLOWLIST ?? "leadoffkaiba")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const DAILY_LIMIT = 20;
const usageMap = {};
const SEASON = new Date().getFullYear();

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

function todayHonolulu() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}
function getUsage(userId) {
  const key = `${userId}:${todayHonolulu()}`;
  return usageMap[key] ?? 0;
}
function incrementUsage(userId) {
  const key = `${userId}:${todayHonolulu()}`;
  usageMap[key] = (usageMap[key] ?? 0) + 1;
  return usageMap[key];
}

function requireAdvisorAccess(req, res, next) {
  const identities = [req.user?.email, req.user?.username]
    .filter(Boolean).map(s => String(s).trim().toLowerCase());
  if (!identities.some(id => ADVISOR_ALLOWLIST.includes(id)))
    return res.status(403).json({ error: "Access restricted" });
  return next();
}
router.use(requireAuth, (req, _res, next) => {
  req.user = { id: req.userId ?? null, username: req.username ?? null, email: req.email ?? null };
  next();
}, requireAdvisorAccess);

function normalizeName(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseIpToOuts(ip) {
  if (!ip) return 0;
  const [whole, frac = "0"] = String(ip).split(".");
  return (parseInt(whole, 10) || 0) * 3 + (parseInt(frac, 10) || 0);
}

function parseIpToFloat(ip) {
  return parseIpToOuts(ip) / 3;
}

function signedOdds(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n > 0 ? `+${n}` : String(n);
}

async function fetchPitcherDetail(pitcherId) {
  const [seasonRes, logsRes] = await Promise.all([
    mlb.get(`/people/${pitcherId}?hydrate=stats(group=[pitching],type=[season],season=${SEASON})`),
    mlb.get(`/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=${SEASON}&limit=3`),
  ]);

  const stat = seasonRes.data?.people?.[0]?.stats?.[0]?.splits?.[0]?.stat ?? {};
  const logs = (logsRes.data?.stats?.[0]?.splits ?? []).slice(0, 3);

  const ip = parseIpToFloat(stat.inningsPitched ?? 0);
  const so = Number(stat.strikeOuts ?? 0);
  const bb = Number(stat.baseOnBalls ?? 0);
  const starts = Number(stat.gamesStarted ?? stat.gamesPitched ?? 0);
  const k9 = ip > 0 ? (so / ip) * 9 : 0;
  const bb9 = ip > 0 ? (bb / ip) * 9 : 0;
  const avgIP = starts > 0 ? ip / starts : 0;

  const logCount = logs.length || 1;
  const l3K = logs.reduce((sum, game) => sum + Number(game.stat?.strikeOuts ?? 0), 0) / logCount;
  const l3IP = logs.reduce((sum, game) => sum + parseIpToFloat(game.stat?.inningsPitched ?? 0), 0) / logCount;
  const l3ER = logs.reduce((sum, game) => sum + Number(game.stat?.earnedRuns ?? 0), 0) / logCount;

  return {
    era: Number.parseFloat(stat.era ?? 0) || 0,
    whip: Number.parseFloat(stat.whip ?? 0) || 0,
    k9,
    bb9,
    avgIP,
    l3K,
    l3IP,
    l3ER,
  };
}

function getPropsForPitcher(propsPayload, pitcherName) {
  const props = Array.isArray(propsPayload?.props) ? propsPayload.props : [];
  const last = normalizeName(pitcherName).split(" ").pop();
  const kProp = props.find((prop) => prop.market === "pitcher_strikeouts" && normalizeName(prop.player ?? "").includes(last));
  const outsProp = props.find((prop) => prop.market === "pitcher_outs" && normalizeName(prop.player ?? "").includes(last));
  return {
    kLine: kProp?.books?.DK?.line ?? kProp?.line ?? null,
    kOdds: kProp?.books?.DK?.overOdds ?? kProp?.overOdds ?? null,
    outsLine: outsProp?.books?.DK?.line ?? outsProp?.line ?? null,
    outsOdds: outsProp?.books?.DK?.overOdds ?? outsProp?.overOdds ?? null,
  };
}

function getGameOdds(rawOdds, awayName) {
  const bookmakers = rawOdds?.bookmakers ?? [];
  const dk = bookmakers.find((book) => book.key === "draftkings") ?? bookmakers[0] ?? null;
  if (!dk) return {};

  const h2h = dk.markets?.find((m) => m.key === "h2h");
  const total = dk.markets?.find((m) => m.key === "totals");
  const spreads = dk.markets?.find((m) => m.key === "spreads");

  const awayMl = h2h?.outcomes?.find((o) => o.name === awayName);
  const homeMl = h2h?.outcomes?.find((o) => o.name !== awayName);
  const over = total?.outcomes?.find((o) => o.name === "Over");
  const under = total?.outcomes?.find((o) => o.name === "Under");
  const awaySpread = spreads?.outcomes?.find((o) => o.name === awayName);

  return {
    awayML: signedOdds(awayMl?.price),
    homeML: signedOdds(homeMl?.price),
    total: over?.point ?? null,
    overOdds: signedOdds(over?.price),
    underOdds: signedOdds(under?.price),
    awaySpread: awaySpread?.point ?? null,
    awaySpreadOdds: signedOdds(awaySpread?.price),
  };
}

async function tavilySearch(query) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return "";
  try {
    const response = await axios.post("https://api.tavily.com/search", {
      api_key: apiKey,
      query,
      max_results: 2,
      search_depth: "basic",
      include_answer: true,
    }, { timeout: 8000 });
    return (response.data.results ?? [])
      .map((result) => `[${result.title}]: ${(result.content ?? "").slice(0, 400)}`)
      .join("\n\n");
  } catch {
    return "";
  }
}

async function buildAdvisorContext(date) {
  let games = [];
  let injuries = [];
  if (isConnected()) {
    const [schedRow, injRow] = await Promise.all([
      query("SELECT games FROM schedule_snapshots WHERE slate_date = $1", [date]),
      query("SELECT injuries FROM injury_snapshots WHERE snapshot_date = $1", [date]),
    ]);
    games = schedRow?.rows?.[0]?.games ?? [];
    injuries = injRow?.rows?.[0]?.injuries?.injuries ?? injRow?.rows?.[0]?.injuries ?? [];
  }

  if (!games.length) {
    try {
      const { data } = await mlb.get("/schedule", {
        params: { sportId: 1, date, hydrate: "probablePitcher,team,venue" },
      });
      const raw = data?.dates?.[0]?.games ?? [];
      games = raw.map((g) => ({
        gamePk: g.gamePk,
        gameTime: g.gameDate,
        time: new Date(g.gameDate).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        }) + " ET",
        stadium: g.venue?.name ?? "",
        status: g.status?.detailedState ?? "",
        away: { id: g.teams.away.team.id, name: g.teams.away.team.name, abbr: g.teams.away.team.abbreviation },
        home: { id: g.teams.home.team.id, name: g.teams.home.team.name, abbr: g.teams.home.team.abbreviation },
        probablePitchers: {
          away: g.teams.away.probablePitcher ? { id: g.teams.away.probablePitcher.id, name: g.teams.away.probablePitcher.fullName } : null,
          home: g.teams.home.probablePitcher ? { id: g.teams.home.probablePitcher.id, name: g.teams.home.probablePitcher.fullName } : null,
        },
      }));
    } catch (e) {
      console.warn("  ⚠ advisor: MLB schedule fallback failed:", e.message);
    }
  }

  const gamePks = games.map(g => Number(g.gamePk)).filter(Boolean);
  const [propsRows, oddsRows, umpRows] = await Promise.all([
    isConnected() ? query("SELECT game_pk, props FROM player_props_snapshots WHERE snapshot_date = $1", [date]) : null,
    isConnected() ? query("SELECT game_key, odds FROM odds_snapshots WHERE slate_date = $1", [date]) : null,
    isConnected() && gamePks.length ? query("SELECT game_pk, data FROM umpire_snapshots WHERE game_pk = ANY($1)", [gamePks]) : null,
  ]);

  const propsByGamePk = new Map((propsRows?.rows ?? []).map(r => [Number(r.game_pk), r.props ?? []]));
  const oddsByGameKey = new Map((oddsRows?.rows ?? []).map(r => [r.game_key, r.odds]));
  const umpByGamePk = new Map((umpRows?.rows ?? []).map(r => [Number(r.game_pk), r.data]));

  const pitcherIds = [...new Set(
    games.flatMap(g => [g.probablePitchers?.away?.id, g.probablePitchers?.home?.id]).filter(Boolean)
  )];
  const pitcherDetailMap = new Map();
  await Promise.all(pitcherIds.map(async id => {
    try { pitcherDetailMap.set(id, await fetchPitcherDetail(id)); }
    catch {}
  }));

  const fmt = (v, suf = "") => v == null ? "n/a" : `${v}${suf}`;

  const gameBlocks = games.map(g => {
    const awayP = g.probablePitchers?.away;
    const homeP = g.probablePitchers?.home;
    const awayD = awayP?.id ? pitcherDetailMap.get(awayP.id) : null;
    const homeD = homeP?.id ? pitcherDetailMap.get(homeP.id) : null;
    const odds = getGameOdds(oddsByGameKey.get(`${g.away?.name}|${g.home?.name}`), g.away?.name);
    const ump = umpByGamePk.get(Number(g.gamePk))?.homePlate;
    const props = propsByGamePk.get(Number(g.gamePk)) ?? [];

    const awayLines = getPropsForPitcher({ props }, awayP?.name ?? "");
    const homeLines = getPropsForPitcher({ props }, homeP?.name ?? "");
    const hrProps = props.filter(p => p.market === "batter_home_runs").slice(0, 3)
      .map(p => `${p.player} HR ${p.books?.DK?.overOdds ?? p.overOdds ?? "—"}`).join(", ");

    return [
      `GAME: ${g.away?.abbr} @ ${g.home?.abbr} ${g.time ?? ""}`,
      `  ML ${odds.awayML ?? "—"}/${odds.homeML ?? "—"} | Total ${odds.total ?? "—"} (O ${odds.overOdds ?? "—"} / U ${odds.underOdds ?? "—"}) | RL ${odds.awaySpread ?? "—"}(${odds.awaySpreadOdds ?? "—"})`,
      `  Ump: ${ump?.name ?? "TBD"} | K/9 delta: ${ump?.stats?.k_rate_delta ?? ump?.stats?.kRateDelta ?? "n/a"}`,
      awayP ? `  AWAY SP: ${awayP.name} — ERA ${fmt(awayD?.era?.toFixed(2))} | K/9 ${fmt(awayD?.k9?.toFixed(1))} | WHIP ${fmt(awayD?.whip?.toFixed(2))} | L3 avg K ${fmt(awayD?.l3K?.toFixed(1))} | K line: ${awayLines.kLine ?? "—"} (${awayLines.kOdds ?? "—"})` : "  AWAY SP: TBD",
      homeP ? `  HOME SP: ${homeP.name} — ERA ${fmt(homeD?.era?.toFixed(2))} | K/9 ${fmt(homeD?.k9?.toFixed(1))} | WHIP ${fmt(homeD?.whip?.toFixed(2))} | L3 avg K ${fmt(homeD?.l3K?.toFixed(1))} | K line: ${homeLines.kLine ?? "—"} (${homeLines.kOdds ?? "—"})` : "  HOME SP: TBD",
      hrProps ? `  HR props: ${hrProps}` : null,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const injuriesText = (injuries ?? []).slice(0, 8)
    .map(i => `${i.playerName} (${i.team}) — ${i.status}`).join(", ");

  return `TODAY'S SLATE (${date}):\n\n${gameBlocks}\n\nRECENT IL: ${injuriesText || "None reported"}`;
}

const PRO_SYSTEM_PROMPT = `You are The Pro — a sharp, disciplined MLB prop analyst who makes a living betting. You have access to today's full slate: pitcher stats, K/9, WHIP, last 3 starts, prop lines, ML/total odds, umpire K/9 delta, and HR odds.

Your rules:
- Singles only. No parlays.
- Only recommend props where at least 3 independent signals align.
- Target odds between -200 and +150 — real value, not chalk.
- Aim for 60%+ hit rate. Pass rather than force a marginal play.
- Cite every stat. Be direct. No hedging unless data is genuinely mixed.
- If nothing stands out today, say so.

When asked for picks, return type "picks" with 3–6 plays.
When answering research/follow-up questions, return type "message".

Return valid JSON only:
{
  "type": "picks",
  "picks": [{
    "player": "Gerrit Cole",
    "team": "NYY",
    "opponent": "BOS",
    "market": "pitcher_strikeouts",
    "marketLabel": "Pitcher Strikeouts",
    "line": 7.5,
    "lean": "OVER",
    "odds": "-130",
    "confidence": "HIGH",
    "reasoning": "2-4 sentence explanation citing specific numbers",
    "signals": ["K/9 11.2", "L3 avg 8.3 K", "Ump +2.1 K/9"]
  }]
}
OR
{ "type": "message", "content": "Your response here" }

confidence values: "HIGH" (strong, 3+ aligned signals), "MEDIUM" (2 signals, one question mark), "SPEC" (interesting angle, limited data).`;

const LOTTO_SYSTEM_PROMPT = `You are The Lotto Guy — a high-risk, high-reward MLB prop hunter. You have access to today's full slate: pitcher stats, prop lines, ML/total odds, umpire K/9 delta, and HR odds.

Your rules:
- Target props at +200 or better when possible. +150 minimum.
- Love 2–4 leg parlays that combine independent upside plays.
- Find situations where data suggests a prop could exceed the line significantly — e.g., K 9+ when line is 5.5 and SwStr% is elite.
- Explain the data angle clearly. Be enthusiastic but disciplined — every leg needs a reason.
- Always suggest a parlay combining your best legs. Show the math.

When asked for picks, return type "lotto" with 3–5 individual high-upside picks AND a parlay.
When answering research/follow-up questions, return type "message".

Return valid JSON only:
{
  "type": "lotto",
  "picks": [{
    "player": "Aaron Judge",
    "team": "NYY",
    "opponent": "BOS",
    "market": "batter_home_runs",
    "marketLabel": "Home Run",
    "line": 0.5,
    "lean": "OVER",
    "odds": "+380",
    "confidence": "SPEC",
    "reasoning": "2-4 sentence explanation of the high-upside angle",
    "signals": ["Barrel% 16.2%", "Wind out", "Park factor 118"]
  }],
  "parlay": {
    "legs": ["Judge HR (+380)", "Cole OVER 8.5 K (-115)"],
    "combinedOdds": "+380",
    "reasoning": "1-2 sentences on why these plays combine well"
  }
}
OR
{ "type": "message", "content": "Your response here" }`;

router.post("/", async (req, res) => {
  const body = req.body ?? {};
  const persona = ["pro", "lotto"].includes(body.persona) ? body.persona : "pro";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastMsg = messages.filter(m => m.role === "user").pop()?.content ?? "";
  if (!lastMsg) return res.status(400).json({ error: "message required" });

  const userId = req.user?.id ?? req.user?.username ?? "unknown";
  if (getUsage(userId) >= DAILY_LIMIT)
    return res.status(429).json({ error: "Daily limit reached", messagesUsedToday: DAILY_LIMIT, maxMessagesPerDay: DAILY_LIMIT });

  const date = todayHonolulu();
  let slateContext = "";
  try {
    slateContext = await buildAdvisorContext(date);
  } catch (err) {
    console.warn("  ⚠ advisor: context build failed:", err.message);
  }

  const systemPrompt = persona === "lotto" ? LOTTO_SYSTEM_PROMPT : PRO_SYSTEM_PROMPT;

  try {
    const completion = await getClient().chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `${systemPrompt}\n\nDATA CONTEXT:\n${slateContext}` },
        ...messages.slice(-8),
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 1200,
    });
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? "{}");
    const used = incrementUsage(userId);
    return res.json({
      type: parsed.type ?? "message",
      content: parsed.content ?? null,
      picks: parsed.picks ?? null,
      parlay: parsed.parlay ?? null,
      messagesUsedToday: used,
      maxMessagesPerDay: DAILY_LIMIT,
    });
  } catch (err) {
    console.error(`  ✗ advisor failed: ${err.message}`);
    return res.status(502).json({ error: "Advisor unavailable", detail: err.message });
  }
});

module.exports = router;
