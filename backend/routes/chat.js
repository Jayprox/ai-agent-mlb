const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const mlb = require("../services/mlbApi");
const requireAuth = require("../middleware/auth");
const { query, isConnected } = require("../services/db");

const router = express.Router();

const usageMap = {};
const DAILY_LIMIT = 30;
const SEASON = new Date().getFullYear();

const CHAT_ALLOWLIST = (process.env.AI_PICKS_ALLOWLIST ?? "leadoffkaiba")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

const TEAM_CITY = {
  ARI: ["ari", "arizona", "diamondbacks", "dbacks"],
  ATL: ["atl", "atlanta", "braves"],
  BAL: ["bal", "baltimore", "orioles"],
  BOS: ["bos", "boston", "red sox"],
  CHC: ["chc", "chicago cubs", "cubs"],
  CWS: ["cws", "chw", "white sox", "chicago white sox"],
  CIN: ["cin", "cincinnati", "reds"],
  CLE: ["cle", "cleveland", "guardians"],
  COL: ["col", "colorado", "rockies"],
  DET: ["det", "detroit", "tigers"],
  HOU: ["hou", "houston", "astros"],
  KC: ["kc", "kansas city", "royals"],
  LAA: ["laa", "angels", "los angeles angels"],
  LAD: ["lad", "dodgers", "los angeles dodgers"],
  MIA: ["mia", "miami", "marlins"],
  MIL: ["mil", "milwaukee", "brewers"],
  MIN: ["min", "minnesota", "twins"],
  NYM: ["nym", "mets", "new york mets"],
  NYY: ["nyy", "yankees", "new york yankees"],
  OAK: ["oak", "athletics", "as"],
  PHI: ["phi", "phillies", "philadelphia"],
  PIT: ["pit", "pirates", "pittsburgh"],
  SD: ["sd", "padres", "san diego"],
  SEA: ["sea", "seattle", "mariners"],
  SF: ["sf", "giants", "san francisco"],
  STL: ["stl", "cardinals", "st louis"],
  TB: ["tb", "tampa", "rays", "tampa bay"],
  TEX: ["tex", "texas", "rangers"],
  TOR: ["tor", "toronto", "blue jays", "jays"],
  WSH: ["wsh", "washington", "nationals", "nats"],
};

const WEB_KEYWORDS    = ["news", "injury", "il ", " il,", "hurt", "scratch", "lineup change", "trade", "recent", "latest", "update", "report"];
const SLATE_KEYWORDS  = ["best play", "best prop", "top pick", "today", "slate", "recommend", "suggest", "should i", "what do you like", "who do you like"];
const PARLAY_KEYWORDS = ["parlay", "parlay", "multi-leg", "3-leg", "2-leg", "3 leg", "2 leg", "multi leg", "combine", "combo", "build me", "put together"];
const BOARD_KEYWORDS  = ["board", "ai board", "k prop", "ks prop", "strikeout prop", "outs prop", "hits prop", "hit prop", "hr prop", "home run prop", "best k", "best hits", "best outs", "best hr", "pitcher prop", "batter prop", "top plays", "top picks", "best plays", "best picks"];
const K_KEYWORDS      = ["k prop", "strikeout", "pitcher k", "k tab", "ks tab", "best k", "k props"];
const HITS_KEYWORDS   = ["hits prop", "hit prop", "hits tab", "best hits", "batter hit"];
const OUTS_KEYWORDS   = ["outs prop", "outs tab", "best outs", "innings prop", "ip prop"];
const HR_KEYWORDS     = ["hr prop", "home run prop", "hr tab", "best hr", "homer prop"];

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

function todayGameBaseContext(date, games, injuries) {
  const slateText = games.map((g) =>
    `${g.away?.abbr} @ ${g.home?.abbr} ${g.time} — ${g.probablePitchers?.away?.name ?? "TBD"} vs ${g.probablePitchers?.home?.name ?? "TBD"}`
  ).join("\n");

  const injuriesText = (injuries ?? []).slice(0, 10).map((injury) =>
    `${injury.playerName} (${injury.team}) — ${injury.status} since ${injury.date}`
  ).join("\n");

  return `TODAY'S SLATE (${date}):\n${slateText || "No games found"}\n\nRECENT INJURIES/IL:\n${injuriesText || "None reported"}`;
}

function extractSearchQuery(message, matchedPitchers, matchedGames) {
  const firstPitcher = matchedPitchers[0]?.name;
  if (firstPitcher) return `${firstPitcher} injury update MLB ${SEASON}`;
  const firstGame = matchedGames[0];
  if (firstGame) return `${firstGame.away?.abbr} ${firstGame.home?.abbr} lineup news MLB ${SEASON}`;
  return `${message} MLB ${SEASON}`;
}

function buildPitcherIndex(games) {
  const entries = [];
  games.forEach((game) => {
    [
      { pitcher: game.probablePitchers?.away, team: game.away?.abbr, opp: game.home?.abbr, side: "away", game },
      { pitcher: game.probablePitchers?.home, team: game.home?.abbr, opp: game.away?.abbr, side: "home", game },
    ].forEach((entry) => {
      if (!entry.pitcher?.id || !entry.pitcher?.name) return;
      const full = normalizeName(entry.pitcher.name);
      const last = full.split(" ").pop();
      entries.push({ ...entry, full, last });
    });
  });
  return entries;
}

function findMentionedPitchers(message, pitcherIndex) {
  const msg = normalizeName(message);
  return pitcherIndex.filter((entry) => msg.includes(entry.last) || msg.includes(entry.full));
}

function findMentionedGames(message, games) {
  const msg = normalizeName(message);
  return games.filter((game) => {
    const aliases = [
      ...(TEAM_CITY[game.away?.abbr] ?? []),
      ...(TEAM_CITY[game.home?.abbr] ?? []),
      normalizeName(game.away?.name ?? ""),
      normalizeName(game.home?.name ?? ""),
    ];
    return aliases.some((alias) => alias && msg.includes(alias));
  });
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

function formatBoardContext(candidates, { parlayMode = false, marketFilter = null } = {}) {
  if (!candidates.length) return "";

  const filtered = marketFilter
    ? candidates.filter(c => c.market === marketFilter)
    : candidates;

  if (!filtered.length) return "";

  const MARKET_LABELS = { k: "K PROPS", outs: "OUTS PROPS", hits: "HITS PROPS", hr: "HR PROPS", f5ml: "F5 ML" };

  const byMarket = {};
  filtered.forEach(c => {
    if (!byMarket[c.market]) byMarket[c.market] = [];
    byMarket[c.market].push(c);
  });

  const sections = Object.entries(byMarket).map(([mkt, cards]) => {
    const label = MARKET_LABELS[mkt] ?? mkt.toUpperCase();
    const rows = cards.map((c, i) => {
      const lineStr = c.bookLine != null ? `O${c.bookLine}` : "no line posted";
      const reasonStr = c.aiReason ? ` — ${c.aiReason}` : "";
      return `  ${i + 1}. ${c.name ?? "TBD"} (${c.team ?? "?"}) | ${c.gameLabel ?? "?"} | AI Score ${c.aiScore ?? "?"} | Line: ${lineStr}${reasonStr}`;
    });
    return `${label}:\n${rows.join("\n")}`;
  });

  const header = parlayMode
    ? "PROP SCOUT AI BOARD — CANDIDATES FOR PARLAY CONSTRUCTION:"
    : "PROP SCOUT AI BOARD — TODAY'S RANKED CANDIDATES:";

  return `${header}\n\n${sections.join("\n\n")}`;
}

function requireChatAccess(req, res, next) {
  const identity = (req.user?.username ?? req.user?.email ?? "").toLowerCase();
  if (!CHAT_ALLOWLIST.includes(identity)) {
    return res.status(403).json({ error: "Access restricted" });
  }
  return next();
}

router.use(requireAuth, (req, _res, next) => {
  req.user = {
    id: req.userId ?? null,
    username: req.username ?? null,
    email: req.email ?? null,
  };
  next();
}, requireChatAccess);

router.post("/", async (req, res) => {
  const body = req.body ?? {};
  const message = String(body.message ?? "").trim();
  const history = Array.isArray(body.history) ? body.history : [];
  if (!message) return res.status(400).json({ error: "message required" });

  const boardCandidates = Array.isArray(body.boardCandidates) ? body.boardCandidates.slice(0, 40) : [];

  const userId = req.user?.id ?? req.user?.username ?? "unknown";
  if (getUsage(userId) >= DAILY_LIMIT) {
    return res.status(429).json({
      error: "Daily message limit reached",
      messagesUsedToday: DAILY_LIMIT,
      maxMessagesPerDay: DAILY_LIMIT,
    });
  }

  const lower = message.toLowerCase();
  const needsWebSearch  = WEB_KEYWORDS.some((kw) => lower.includes(kw));
  const isSlateQuestion = SLATE_KEYWORDS.some((kw) => lower.includes(kw));
  const isBoardQuestion = boardCandidates.length > 0 && BOARD_KEYWORDS.some((kw) => lower.includes(kw));
  const isParlayRequest = boardCandidates.length > 0 && PARLAY_KEYWORDS.some((kw) => lower.includes(kw));
  const wantsKOnly     = K_KEYWORDS.some((kw) => lower.includes(kw));
  const wantsHitsOnly  = HITS_KEYWORDS.some((kw) => lower.includes(kw));
  const wantsOutsOnly  = OUTS_KEYWORDS.some((kw) => lower.includes(kw));
  const wantsHROnly    = HR_KEYWORDS.some((kw) => lower.includes(kw));

  const today = todayHonolulu();
  let games = [];
  let injuries = [];

  if (isConnected()) {
    const [schedRow, injRow] = await Promise.all([
      query("SELECT games FROM schedule_snapshots WHERE slate_date = $1", [today]),
      query("SELECT injuries FROM injury_snapshots WHERE snapshot_date = $1", [today]),
    ]);
    games = schedRow?.rows?.[0]?.games ?? [];
    injuries = injRow?.rows?.[0]?.injuries?.injuries ?? injRow?.rows?.[0]?.injuries ?? [];
  }

  // MLB API fallback when DB unavailable (local dev) or snapshot not yet populated
  if (!games.length) {
    try {
      const { data } = await mlb.get("/schedule", {
        params: { sportId: 1, date: today, hydrate: "probablePitcher,team,venue" },
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
      console.warn("  ⚠ chat: MLB schedule fallback failed:", e.message);
    }
  }

  const baseContext = todayGameBaseContext(today, games, injuries);
  const contextParts = [baseContext];

  const pitcherIndex = buildPitcherIndex(games);
  const matchedPitchers = findMentionedPitchers(message, pitcherIndex);
  const matchedGames = findMentionedGames(message, games);

  const propsRows = isConnected()
    ? await query("SELECT game_pk, props, reason FROM player_props_snapshots WHERE snapshot_date = $1", [today])
    : null;
  const oddsRows = isConnected()
    ? await query("SELECT game_key, odds FROM odds_snapshots WHERE slate_date = $1", [today])
    : null;
  const umpRows = isConnected()
    ? await query("SELECT game_pk, data FROM umpire_snapshots WHERE game_pk = ANY($1)", [games.map((g) => Number(g.gamePk))])
    : null;

  const propsByGamePk = new Map((propsRows?.rows ?? []).map((row) => [Number(row.game_pk), { props: row.props ?? [], reason: row.reason ?? "ok" }]));
  const oddsByGameKey = new Map((oddsRows?.rows ?? []).map((row) => [row.game_key, row.odds]));
  const umpByGamePk = new Map((umpRows?.rows ?? []).map((row) => [Number(row.game_pk), row.data]));

  for (const entry of matchedPitchers.slice(0, 2)) {
    try {
      const detail = await fetchPitcherDetail(entry.pitcher.id);
      const propsPayload = propsByGamePk.get(Number(entry.game.gamePk));
      const lines = getPropsForPitcher(propsPayload, entry.pitcher.name);
      const ump = umpByGamePk.get(Number(entry.game.gamePk))?.homePlate;
      const odds = oddsByGameKey.get(`${entry.game.away?.name}|${entry.game.home?.name}`);
      const totalData = getGameOdds(odds, entry.game.away?.name);
      const weatherBits = totalData.total != null ? `Game total ${totalData.total}` : "No total posted";
      contextParts.push(
        `PITCHER DETAIL: ${entry.pitcher.name} (${entry.team}) vs ${entry.opp} tonight
Season: ERA ${detail.era.toFixed(2)} | K/9 ${detail.k9.toFixed(1)} | WHIP ${detail.whip.toFixed(2)} | BB/9 ${detail.bb9.toFixed(1)} | Avg IP ${detail.avgIP.toFixed(1)}
Last 3 starts: avg K ${detail.l3K.toFixed(1)} | avg IP ${detail.l3IP.toFixed(1)} | avg ER ${detail.l3ER.toFixed(1)}
DK K line: ${lines.kLine ?? "—"} (${lines.kOdds ?? "—"} over) | DK Outs line: ${lines.outsLine ?? "—"} (${lines.outsOdds ?? "—"} over)
Umpire: ${ump?.name ?? "TBD"} | K/9 delta: ${ump?.stats?.k_rate_delta ?? ump?.stats?.kRateDelta ?? ump?.stats?.weightedScore ?? "n/a"}
Weather/market: ${weatherBits}`
      );
    } catch (err) {
      console.warn(`Chat pitcher enrichment failed for ${entry.pitcher.name}: ${err.message}`);
    }
  }

  for (const game of matchedGames.slice(0, 2)) {
    try {
      const [awayDetail, homeDetail] = await Promise.all([
        game.probablePitchers?.away?.id ? fetchPitcherDetail(game.probablePitchers.away.id) : null,
        game.probablePitchers?.home?.id ? fetchPitcherDetail(game.probablePitchers.home.id) : null,
      ]);
      const odds = getGameOdds(oddsByGameKey.get(`${game.away?.name}|${game.home?.name}`), game.away?.name);
      contextParts.push(
        `GAME DETAIL: ${game.away?.abbr} @ ${game.home?.abbr} ${game.time}
Away SP: ${game.probablePitchers?.away?.name ?? "TBD"} — ERA ${awayDetail?.era?.toFixed(2) ?? "—"} | WHIP ${awayDetail?.whip?.toFixed(2) ?? "—"} | L3 avg ER ${awayDetail?.l3ER?.toFixed(1) ?? "—"}
Home SP: ${game.probablePitchers?.home?.name ?? "TBD"} — ERA ${homeDetail?.era?.toFixed(2) ?? "—"} | WHIP ${homeDetail?.whip?.toFixed(2) ?? "—"} | L3 avg ER ${homeDetail?.l3ER?.toFixed(1) ?? "—"}
DK: ML ${odds.awayML ?? "—"}/${odds.homeML ?? "—"} | Total ${odds.total ?? "—"} (${odds.overOdds ?? "—"}/${odds.underOdds ?? "—"}) | RL ${odds.awaySpread ?? "—"}(${odds.awaySpreadOdds ?? "—"})`
      );
    } catch (err) {
      console.warn(`Chat game enrichment failed for ${game.away?.abbr}@${game.home?.abbr}: ${err.message}`);
    }
  }

  if (isSlateQuestion) {
    const propPool = (propsRows?.rows ?? [])
      .filter((row) => row.reason === "ok")
      .flatMap((row) => (Array.isArray(row.props) ? row.props : []))
      .map((prop) => ({
        ...prop,
        bookCount: Object.keys(prop.books ?? {}).length,
      }))
      .sort((a, b) => b.bookCount - a.bookCount)
      .slice(0, 6)
      .map((prop) => `${prop.player} — ${prop.marketLabel} OVER ${prop.books?.DK?.line ?? prop.line} @ DK ${prop.books?.DK?.overOdds ?? prop.overOdds ?? "—"}`);

    if (propPool.length) {
      contextParts.push(`TOP PROP LINES AVAILABLE TODAY:\n${propPool.join("\n")}`);
    }
  }

  // Inject board candidates context when the question is board/parlay related
  if (boardCandidates.length > 0 && (isBoardQuestion || isParlayRequest || isSlateQuestion)) {
    const marketFilter = wantsKOnly ? "k" : wantsHitsOnly ? "hits" : wantsOutsOnly ? "outs" : wantsHROnly ? "hr" : null;
    const boardText = formatBoardContext(boardCandidates, { parlayMode: isParlayRequest, marketFilter });
    if (boardText) contextParts.push(boardText);
  }

  let webContext = "";
  if (needsWebSearch) {
    const queryText = extractSearchQuery(message, matchedPitchers, matchedGames);
    webContext = await tavilySearch(queryText);
    if (webContext) {
      contextParts.push(`WEB SEARCH — "${queryText}":\n${webContext}`);
    }
  }

  const systemPrompt = `You are a sharp MLB prop research analyst and professional sports bettor with access to today's Prop Scout data — pre-scored board candidates, pitcher stats, sportsbook lines, umpire tendencies, weather, park factors, lineup data, and injury reports.

When AI Board candidate data is provided (PROP SCOUT AI BOARD section):
- These are pre-ranked picks scored by the Prop Scout model — treat them as your primary source for specific recommendations
- Always reference players by name and cite their AI Score, line, and key reason
- For parlay requests: select 2–3 legs, strongly prefer legs from DIFFERENT games to avoid correlated outcomes, mix markets when possible (e.g. K prop + hits prop from separate games), calculate approximate combined implied probability (assume each leg near the line is ~52–55% to win unless AI Score is 75+ which is ~58–62%), flag any same-game legs as correlated risk
- Parlay format: list each leg clearly (Player — Market — Line — Why), then give the combined read and overall confidence
- For market-specific questions (best K props, best hits, etc.): rank the top 2–3 from that market, name the line, and give the sharpest reason to back it

When answering prop or game-specific questions:
- Cite specific numbers that support your analysis
- Return a confidence score (0–100) and explain the key signals driving it
- Be direct and actionable — don't hedge unless the data is genuinely mixed
- Keep responses focused and concise

When answering general, conceptual, or conversational questions:
- Answer directly without a confidence score

Confidence guide:
- 75+: Multiple independent signals aligned. Strong edge.
- 60–74: Solid setup with one open question.
- 50–59: Speculative. Some factors favorable but incomplete.
- Below 50: Mixed or insufficient data.

Always return valid JSON:
{
  "response": "Your full answer here",
  "confidence": 76,
  "confidenceLabel": "HIGH",
  "signals": ["K/9 11.2", "L3 avg K 8.3", "Ump +2.1"]
}

Set confidence and confidenceLabel to null, signals to [] when a confidence score is not applicable.
confidenceLabel: "HIGH" (75+), "MEDIUM" (60–74), "SPEC" (50–59), "LOW" (<50), null if N/A.`;

  const messages = [
    { role: "system", content: `${systemPrompt}\n\nDATA CONTEXT:\n${contextParts.join("\n\n")}` },
    ...history.slice(-10),
    { role: "user", content: message },
  ];

  try {
    const completion = await getClient().chat.completions.create({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 600,
    });
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? "{}");
    const used = incrementUsage(userId);
    return res.json({
      response: parsed.response ?? "",
      confidence: parsed.confidence ?? null,
      confidenceLabel: parsed.confidenceLabel ?? null,
      signals: parsed.signals ?? [],
      webSearched: needsWebSearch && !!webContext,
      messagesUsedToday: used,
      maxMessagesPerDay: DAILY_LIMIT,
    });
  } catch (err) {
    console.error(`  ✗ chat failed: ${err.message}`);
    return res.status(502).json({ error: "Chat unavailable", detail: err.message });
  }
});

module.exports = router;
