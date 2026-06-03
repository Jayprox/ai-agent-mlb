// Board compute layer — pure functions that transform live state into scored candidate arrays.

import {
  PARK_FACTORS,
  NEUTRAL_PARK,
  HOME_FIELD_ADV,
  DEFAULT_HOME_ADV,
  UMPIRE_STATS,
} from "../constants.js";
import {
  mlToImplied,
  normalizeScratchName,
  vigStrip,
  propEdgeData,
} from "../utils.js";
import { kBoardScore, outsBoardScore } from "../scoring/pitcher.js";
import { hrBoardScore, hitBoardScore } from "../scoring/batter.js";
import {
  simKConfidence,
  simOutsConfidence,
  simHRConfidence,
  simHitsConfidence,
  simF5MLConfidence,
} from "../scoring/sim.js";

export const computePitcherBoard = (type, liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal = {}) => {
  const candidates = [];
  (liveSlate ?? []).forEach(game => {
    [
      { p: game.probablePitchers?.home, facingTeam: game.away?.abbr, isHome: true  },
      { p: game.probablePitchers?.away, facingTeam: game.home?.abbr, isHome: false },
    ].forEach(({ p, facingTeam, isHome }) => {
      if (!p?.id) return;
      const pStats = livePitcherStats[p.id];
      const gamelog = liveGameLog[p.id];
      if (!pStats && !gamelog) return;
      const pf = PARK_FACTORS[game.home?.abbr] ?? NEUTRAL_PARK;
      const umpire = liveUmpires[game.gamePk];
      const arsenalStats = pitcherArsenal[p.id]?.pitcherStats ?? null;
      const merged = {
        ...(p ?? {}),
        ...(pStats ?? {}),
        ...(arsenalStats ? {
          swStrPct: arsenalStats.swStrPct ?? null,
          chasePct: arsenalStats.oSwingPct ?? null,
          fStrikePct: arsenalStats.fStrikePct ?? null,
        } : {}),
      };
      const oppTeamStats = liveTeamStats?.[facingTeam];
      const score = type === "k"
        ? kBoardScore(merged, gamelog, pf, umpire, oppTeamStats)
        : outsBoardScore(merged, gamelog, pf);
      if (score === null) return;

      const ppKey = String(game.gamePk);
      const props = Array.isArray(livePlayerProps[ppKey]?.props) ? livePlayerProps[ppKey].props : [];
      const lastName = (p.name ?? "").split(" ").pop().toLowerCase();
      const market = type === "k" ? "pitcher_strikeouts" : "pitcher_outs";
      const propLine = props.find(pr => pr.market === market && pr.player.toLowerCase().includes(lastName)) ?? null;

      const recentStarts = (gamelog?.games ?? []).slice(0, 3);
      const avgK3Raw = recentStarts.length > 0
        ? recentStarts.reduce((s, g) => s + (g.k ?? 0), 0) / recentStarts.length
        : null;
      const avgK3 = avgK3Raw !== null ? avgK3Raw.toFixed(1) : null;
      const signals = [];
      const oppKPct = oppTeamStats?.kPct ?? null;
      if (type === "k" && oppKPct !== null) {
        if (oppKPct >= 24) signals.push(`Opp K% ${oppKPct}% (high-K lineup)`);
        else if (oppKPct <= 17) signals.push(`Opp K% ${oppKPct}% (low-K lineup)`);
      }
      if (type === "outs") {
        const lastStart = recentStarts[0];
        const pitchCount = parseInt(lastStart?.pc, 10);
        const daysSince = lastStart?.date
          ? Math.floor((Date.now() - new Date(lastStart.date).getTime()) / (24 * 60 * 60 * 1000))
          : null;
        if (Number.isFinite(daysSince) && Number.isFinite(pitchCount) && daysSince <= 4 && pitchCount >= 85) {
          signals.push(`${pitchCount}p last start (${daysSince}d rest)`);
        }
      }

      const avgIPNum = (() => {
        const s = gamelog?.avgIP;
        if (!s || s === "—") return null;
        const [w, f = "0"] = String(s).split(".");
        return parseInt(w) + parseInt(f) / 3;
      })();
      const k9Num = parseFloat(merged.kPer9 ?? merged.k9) || 0;
      const suggestedLine = type === "k"
        ? (avgK3Raw !== null
            ? Math.max(0.5, Math.round(avgK3Raw) - 0.5)
            : (k9Num > 0 && avgIPNum ? Math.max(0.5, Math.round(k9Num * avgIPNum / 9) - 0.5) : null))
        : (avgIPNum !== null
            ? Math.max(0.5, Math.round(avgIPNum * 3) - 0.5)
            : null);

      candidates.push({
        id: p.id,
        name: p.name ?? "TBD",
        team: isHome ? (game.home?.abbr ?? "?") : (game.away?.abbr ?? "?"),
        hand: p.hand ?? "R",
        gamePk: game.gamePk,
        gameLabel: `${game.away?.abbr ?? "?"} @ ${game.home?.abbr ?? "?"}`,
        gameTime: game.gameTime ?? null,
        facingTeam: facingTeam ?? "?",
        parkFactor: pf.k,
        score,
        era: merged.era ?? "—",
        k9: merged.kPer9 ?? merged.k9 ?? "—",
        whip: merged.whip ?? "—",
        avgIP: gamelog?.avgIP ?? "—",
        avgK3,
        umpire: umpire?.name ?? null,
        umpireRating: umpire?.rating ?? null,
        propLine,
        suggestedLine,
        simConfidence: (() => {
          const line = propLine?.books?.DK?.line
            ?? propLine?.books?.FD?.line
            ?? propLine?.books?.CZR?.line
            ?? suggestedLine;
          const seed = `${type}:${p.id}:${game.gamePk}:${line}`;
          return type === "k"
            ? simKConfidence({ avgK3, k9: merged.kPer9 ?? merged.k9 ?? 0, avgIP: gamelog?.avgIP ?? "—", parkFactor: pf.k, umpireRating: umpire?.rating ?? null }, line, 500, seed)
            : simOutsConfidence({ avgIP: gamelog?.avgIP ?? "—" }, line, 500, seed);
        })(),
        signals,
        swStrPct: merged.swStrPct ?? null,
        chasePct: merged.chasePct ?? null,
      });
    });
  });
  return candidates.sort((a, b) => b.score - a.score).slice(0, 20);
};

export const computeBatterBoard = (type, liveSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits) => {
  const candidates = [];
  (liveSlate ?? []).forEach(game => {
    const lu = liveLineups[game.gamePk];
    if (!lu?.confirmed && lu?.source !== "roster") return;
    const pf = PARK_FACTORS[game.home?.abbr] ?? NEUTRAL_PARK;
    const wx = liveWeather[game.gamePk];
    const wxFav = !!(wx?.hrFavorable);
    const ppKey = String(game.gamePk);
    const ppEntry = livePlayerProps[ppKey];
    const props = Array.isArray(ppEntry?.props) ? ppEntry.props : [];

    ["away", "home"].forEach(side => {
      const facingPitcher = side === "away"
        ? game.pitcher
        : (game.awayPitcher ?? game.pitcher);
      const pitcherHand = facingPitcher?.hand ?? "R";
      const batters = lu[side] ?? [];
      const scratches = lu?.scratches?.[side] ?? [];
      const scratchedIds = new Set(scratches.map(s => String(s.id)));
      const scratchedNames = new Set(scratches.map(s => normalizeScratchName(s.name)));

      batters.forEach(b => {
        if (!b?.id) return;
        if (scratchedIds.has(String(b.id)) || scratchedNames.has(normalizeScratchName(b.name))) return;
        const hlog = liveHittingLog[b.id];
        const sdKey = `${b.id}:hitting`;
        const sd = liveStatSplits[sdKey];
        const facingPitcherEra = parseFloat(facingPitcher?.era) || null;

        const score = type === "hr"
          ? hrBoardScore(hlog, b.order, pitcherHand, pf, wxFav, sd, facingPitcherEra)
          : hitBoardScore(hlog, b.order, pitcherHand, pf, sd, facingPitcherEra);

        if (score === null) return;

        const market = type === "hr" ? "batter_home_runs" : "batter_hits";
        const lastName = b.name.split(" ").pop().toLowerCase();
        const propLine = props.find(p =>
          p.market === market && p.player.toLowerCase().includes(lastName)
        ) ?? null;

        candidates.push({
          id: b.id,
          name: b.name,
          hand: b.hand,
          order: b.order,
          team: side === "away" ? (game.away?.abbr ?? "?") : (game.home?.abbr ?? "?"),
          lineupState: lu.confirmed ? "confirmed" : "roster",
          gamePk: game.gamePk,
          gameLabel: `${game.away?.abbr ?? "?"} @ ${game.home?.abbr ?? "?"}`,
          gameTime: game.gameTime ?? null,
          pitcher: facingPitcher?.name ?? "—",
          pitcherHand,
          park: game.stadium ?? "—",
          parkFactor: type === "hr" ? pf.hr : pf.hit,
          windFav: wxFav,
          score,
          avg: hlog?.avg ?? "—",
          slg: hlog?.slg ?? "—",
          hr: hlog?.hr ?? 0,
          ops: hlog?.ops ?? "—",
          hitRate: hlog?.hitRate ?? [],
          propLine,
          simConfidence: (() => {
            const line = propLine?.books?.DK?.line
              ?? propLine?.books?.FD?.line
              ?? propLine?.books?.CZR?.line
              ?? (type === "hr" ? 0.5 : 1.5);
            const seed = `${type}:${b.id}:${game.gamePk}:${line}`;
            return type === "hr"
              ? simHRConfidence({ hr: hlog?.hr ?? 0, slg: hlog?.slg ?? "0", parkFactor: pf.hr, windFav: wxFav, matchup: { batterVsHand: sd ? (pitcherHand === "L" ? sd.vsL : sd.vsR) : null }, order: b.order }, line, 500, seed)
              : simHitsConfidence({ avg: hlog?.avg ?? "0", parkFactor: pf.hit, matchup: { batterVsHand: sd ? (pitcherHand === "L" ? sd.vsL : sd.vsR) : null }, order: b.order }, line, 500, seed);
          })(),
          matchup: {
            batterHand: b.hand ?? null,
            pitcherHand,
            batterVsHand: (() => {
              const split = pitcherHand === "L" ? sd?.vsL : sd?.vsR;
              if (!split) return null;
              return { avg: split.avg ?? null, ops: split.ops ?? null };
            })(),
            pitcherTopPitches: (facingPitcher?.arsenal ?? [])
              .filter(a => a.usage != null)
              .sort((a, b_) => (b_.usage ?? 0) - (a.usage ?? 0))
              .slice(0, 2)
              .map(a => ({ abbr: a.abbr, name: a.name ?? a.abbr, usage: a.usage })),
            batterVsPitches: (() => {
              const vp = b.vsPitches;
              if (!vp) return null;
              const top2Abbrs = (facingPitcher?.arsenal ?? [])
                .filter(a => a.usage != null)
                .sort((a, b_) => (b_.usage ?? 0) - (a.usage ?? 0))
                .slice(0, 2)
                .map(a => a.abbr);
              const result = {};
              top2Abbrs.forEach(abbr => {
                const entry = vp[abbr];
                if (entry != null) result[abbr] = typeof entry === "string" ? entry : (entry.avg ?? null);
              });
              return Object.keys(result).length ? result : null;
            })(),
          },
        });
      });
    });
  });

  const byGame = {};
  candidates.forEach(c => {
    if (!byGame[c.gamePk]) byGame[c.gamePk] = [];
    byGame[c.gamePk].push(c);
  });
  const capped = Object.values(byGame).flatMap(group =>
    group.sort((a, b) => b.score - a.score).slice(0, 5)
  );
  return capped.sort((a, b) => b.score - a.score);
};

export function buildAiBoardPayload(
  liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats,
  liveLineups, liveWeather, liveHittingLog, liveStatSplits,
  liveNrfiData, liveOddsMap, pitcherArsenal = {}
) {
  const kCandidates = computePitcherBoard("k", liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal).slice(0, 8);
  const outsCandidates = computePitcherBoard("outs", liveSlate, livePitcherStats, liveGameLog, liveUmpires, livePlayerProps, liveTeamStats, pitcherArsenal).slice(0, 8);
  const hrCandidates = computeBatterBoard("hr", liveSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits).slice(0, 8);
  const hitsCandidates = computeBatterBoard("hits", liveSlate, liveLineups, liveWeather, livePlayerProps, liveHittingLog, liveStatSplits).slice(0, 8);
  const f5mlCandidates = computeGameBoard(
    "f5ml", liveSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires
  ).slice(0, 5);

  const mapCandidate = (c, market) => {
    const bookLine = c.propLine?.books?.DK?.line ?? c.propLine?.books?.FD?.line ?? c.propLine?.books?.CZR?.line ?? c.suggestedLine ?? null;
    const lean = c.score >= 55 ? "OVER" : "UNDER";
    const { bookOdds, impliedProb } = propEdgeData(c.propLine ?? null, lean);
    const edge = (c.simConfidence != null && impliedProb != null)
      ? Math.round((c.simConfidence / 100 - impliedProb) * 100) / 100
      : null;
    let stats = {};
    if (market === "k") {
      stats = { k9: c.k9, avgK3: c.avgK3, era: c.era, whip: c.whip, umpireRating: c.umpireRating };
    } else if (market === "outs") {
      stats = { avgIP: c.avgIP, whip: c.whip, era: c.era };
    } else if (market === "hr") {
      stats = { slg: c.slg, hr: c.hr, ops: c.ops, parkFactor: c.parkFactor, windFav: c.windFav, order: c.order, platoonSLG: c.matchup?.batterVsHand?.slg ?? null };
    } else {
      stats = { avg: c.avg, ops: c.ops, parkFactor: c.parkFactor, order: c.order, l5: c.hitRate?.slice(0, 5).filter(Boolean).length ?? null, platoonAVG: c.matchup?.batterVsHand?.avg ?? null };
    }
    return {
      id: `${market}:${c.id}:${c.gamePk}`,
      entityId: c.id,
      market,
      playerName: c.name,
      team: c.team,
      gameLabel: c.gameLabel,
      gamePk: c.gamePk ?? null,
      gameTime: c.gameTime ?? null,
      score: c.score,
      simConfidence: c.simConfidence,
      bookLine,
      lean,
      bookOdds,
      impliedProb,
      edge,
      stats,
      _candidate: c,
    };
  };

  const mapGameCandidate = (g, market) => {
    const simConf = simF5MLConfidence(g.homeEra, g.awayEra, g.parkFactor, g.umpireRating, g.lean, 500, `f5ml:${g.gamePk}:${g.lean}`);

    const f5Key = `${g.away.name}|${g.home.name}`;
    const f5Odds = liveOddsMap?.[f5Key];
    const leanMl = g.lean === "HOME" ? (f5Odds?.homeML ?? null) : (f5Odds?.awayML ?? null);
    const oppMl = g.lean === "HOME" ? (f5Odds?.awayML ?? null) : (f5Odds?.homeML ?? null);
    const leanRaw = leanMl ? mlToImplied(leanMl) : null;
    const oppRaw = oppMl ? mlToImplied(oppMl) : null;
    const f5Implied = (leanRaw != null && oppRaw != null)
      ? vigStrip(leanRaw, oppRaw)
      : leanRaw;
    const f5Edge = (simConf != null && f5Implied != null)
      ? Math.round((simConf / 100 - f5Implied) * 100) / 100
      : null;

    return {
      id: `${market}:${g.gamePk}`,
      entityId: g.gamePk,
      market,
      playerName: null,
      name: g.gameLabel,
      team: null,
      gameLabel: g.gameLabel,
      gamePk: g.gamePk,
      gameTime: g.gameTime ?? null,
      score: g.score,
      simConfidence: simConf,
      bookLine: g.line ?? null,
      lean: g.lean,
      leanAbbr: g.leanAbbr,
      leanLabel: g.leanLabel,
      bookOdds: leanMl ? parseInt(leanMl, 10) : null,
      impliedProb: f5Implied,
      edge: f5Edge,
      stats: {
        homeSP: g.homeSP?.name ?? null,
        homeEra: g.homeEra ?? null,
        awaySP: g.awaySP?.name ?? null,
        umpire: g.factors?.find(f => f.label === "Umpire Tendency")?.value ?? null,
        topFactor: g.factors?.[0]?.detail ?? null,
      },
      factors: g.factors ?? [],
      _candidate: g,
    };
  };

  return [
    ...kCandidates.map((c) => mapCandidate(c, "k")),
    ...outsCandidates.map((c) => mapCandidate(c, "outs")),
    ...hrCandidates.map((c) => mapCandidate(c, "hr")),
    ...hitsCandidates.map((c) => mapCandidate(c, "hits")),
    ...f5mlCandidates.map((g) => mapGameCandidate(g, "f5ml")),
  ];
}

export const computeGameBoard = (type, activeSlate, liveNrfiData, liveWeather, liveOddsMap, livePitcherStats, liveUmpires, liveLineups = {}) => {
  const games = [];
  (activeSlate ?? []).forEach(game => {
    const homeSP = game.pitcher ?? null;
    const awaySP = game.awayPitcher ?? null;
    const hpStats = livePitcherStats[homeSP?.id] ?? {};
    const apStats = livePitcherStats[awaySP?.id] ?? {};
    const homeEra = parseFloat(hpStats.era ?? homeSP?.era) || null;
    const awayEra = parseFloat(apStats.era ?? awaySP?.era) || null;
    const homeWhip = parseFloat(hpStats.whip ?? homeSP?.whip) || null;
    const awayWhip = parseFloat(apStats.whip ?? awaySP?.whip) || null;
    const pf = PARK_FACTORS[game.home?.abbr] ?? NEUTRAL_PARK;
    const wx = game.weather ?? liveWeather[game.gamePk] ?? {};
    const umpire = liveUmpires[game.gamePk] ?? null;
    const apiNrfi = liveNrfiData[game.gamePk] ?? game.nrfi ?? null;
    const oddsKey = `${game.away?.name}|${game.home?.name}`;
    const odds = liveOddsMap[oddsKey] ?? game.odds ?? {};

    let score = 50;
    const factors = [];

    if (type === "nrfi") {
      if (homeEra !== null) {
        const d = homeEra < 2.5 ? 12 : homeEra < 3.5 ? 7 : homeEra < 4.5 ? 2 : homeEra > 5.5 ? -12 : -5;
        score += d;
        factors.push({ label: "Home SP ERA", pts: d, max: 12,
          value: `${homeEra.toFixed(2)} ERA — ${homeSP?.name ?? "Unknown"}`,
          detail: homeEra < 3.0 ? "Elite — shuts down 1st inning" : homeEra < 4.0 ? "Solid — keeps 1st clean" : homeEra > 5.0 ? "Vulnerable — risk of YRFI" : "Average" });
      }
      if (awayEra !== null) {
        const d = awayEra < 2.5 ? 12 : awayEra < 3.5 ? 7 : awayEra < 4.5 ? 2 : awayEra > 5.5 ? -12 : -5;
        score += d;
        factors.push({ label: "Away SP ERA", pts: d, max: 12,
          value: `${awayEra.toFixed(2)} ERA — ${awaySP?.name ?? "Unknown"}`,
          detail: awayEra < 3.0 ? "Elite — keeps 1st clean" : awayEra < 4.0 ? "Solid" : awayEra > 5.0 ? "Vulnerable early" : "Average" });
      }
      const pfPts = pf.hr >= 1.15 ? -10 : pf.hr >= 1.08 ? -5 : pf.hr <= 0.87 ? 8 : pf.hr <= 0.93 ? 4 : 0;
      score += pfPts;
      factors.push({ label: "Park Factor", pts: pfPts, max: 8,
        value: `${game.stadium ?? game.home?.abbr} — ${pf.label}`,
        detail: pf.hr >= 1.08 ? "Hitter-friendly — extra-base hits more likely in 1st" : pf.hr <= 0.93 ? "Pitcher-friendly — suppresses early scoring" : "Neutral park" });
      if (!wx.roof) {
        const temp = parseInt(wx.temp) || 72;
        let wxPts = 0;
        let wxDetail = "Moderate conditions";
        if (temp < 50) { wxPts += 8; wxDetail = `${temp}°F — cold air suppresses scoring`; }
        else if (temp < 60) { wxPts += 4; wxDetail = `${temp}°F — cooler conditions`; }
        if (wx.hrFavorable) { wxPts -= 8; wxDetail += " · HR-favorable wind"; }
        else if ((wx.wind ?? "").toLowerCase().includes("in")) { wxPts += 5; wxDetail += " · wind blowing IN"; }
        score += wxPts;
        factors.push({ label: "Weather", pts: wxPts, max: 8, value: wx.roof ? "Dome" : `${temp}°F${wx.wind ? `, ${wx.wind}` : ""}`, detail: wxDetail });
      } else {
        factors.push({ label: "Weather", pts: 2, max: 8, value: "Dome — controlled environment", detail: "No weather impact · slight NRFI lean" });
        score += 2;
      }
      if (umpire?.homePlate?.name || umpire?.name) {
        const umpName = umpire?.homePlate?.name ?? umpire?.name;
        const umpStats = UMPIRE_STATS[umpName];
        const umpRating = umpStats?.rating ?? "neutral";
        const umpPts = umpRating === "pitcher" ? 4 : umpRating === "hitter" ? -4 : 0;
        score += umpPts;
        factors.push({ label: "Umpire", pts: umpPts, max: 4,
          value: umpName, detail: umpRating === "pitcher" ? "Wide zone — suppresses walks, keeps scores low" : umpRating === "hitter" ? "Tight zone — more baserunners, YRFI risk" : "Average zone" });
      }
      if (apiNrfi?.awayFirst?.scoredPct || apiNrfi?.homeFirst?.scoredPct) {
        const awayPct = parseFloat(apiNrfi.awayFirst?.scoredPct) || 30;
        const homePct = parseFloat(apiNrfi.homeFirst?.scoredPct) || 30;
        const avgPct = (awayPct + homePct) / 2;
        const awayPts = awayPct < 20 ? 6 : awayPct < 26 ? 3 : awayPct < 32 ? 0 : awayPct < 40 ? -4 : -7;
        const homePts = homePct < 20 ? 6 : homePct < 26 ? 3 : homePct < 32 ? 0 : homePct < 40 ? -4 : -7;
        const histPts = awayPts + homePts;
        score += histPts;
        factors.push({ label: "1st Inning Scoring History", pts: histPts, max: 14,
          value: `${game.away.abbr} scores ${awayPct.toFixed(0)}% / ${game.home.abbr} scores ${homePct.toFixed(0)}% in 1st`,
          detail: avgPct < 24 ? "Both teams rarely score in 1st — strong NRFI lean"
            : avgPct > 38 ? "Both teams frequently score early — YRFI lean"
            : awayPct > 38 || homePct > 38 ? "One team scores often in 1st — YRFI risk"
            : "Average first-inning scoring rates" });
      }

      const lu = liveLineups[game.gamePk];
      if (lu && (lu.away?.length >= 3 || lu.home?.length >= 3)) {
        const top3Away = (lu.away ?? []).slice(0, 3);
        const top3Home = (lu.home ?? []).slice(0, 3);
        const awayObpVals = top3Away.map(b => parseFloat(b.obp) || 0).filter(v => v > 0);
        const homeObpVals = top3Home.map(b => parseFloat(b.obp) || 0).filter(v => v > 0);
        if (awayObpVals.length > 0 || homeObpVals.length > 0) {
          const allObp = [...awayObpVals, ...homeObpVals];
          const avgTopOBP = allObp.reduce((a, v) => a + v, 0) / allObp.length;
          const obpPts = avgTopOBP >= 0.390 ? -10 : avgTopOBP >= 0.360 ? -6 : avgTopOBP >= 0.345 ? -3
            : avgTopOBP <= 0.290 ? 6 : avgTopOBP <= 0.310 ? 3 : 0;
          score += obpPts;
          factors.push({ label: "Top-Order OBP", pts: obpPts, max: 10,
            value: `Avg top-3 OBP: .${Math.round(avgTopOBP * 1000)}`,
            detail: avgTopOBP >= 0.360 ? "High-OBP leadoff hitters — YRFI risk in 1st"
              : avgTopOBP <= 0.300 ? "Low-OBP top order — fewer 1st-inning threats"
              : "Average top-order on-base ability" });
        }
      }
      score = Math.round(Math.max(28, Math.min(82, score)));
      const lean = score >= 50 ? "NRFI" : "YRFI";
      games.push({ gamePk: game.gamePk, name: `${game.away.abbr} @ ${game.home.abbr}`,
        gameLabel: `${game.away.abbr} @ ${game.home.abbr}`, away: game.away, home: game.home,
        gameTime: game.gameTime ?? null,
        score, lean, leanAbbr: null, leanLabel: lean, line: null, odds,
        factors, homeSP, awaySP, weather: wx, nrfi: apiNrfi,
        stadium: game.stadium });
    } else if (type === "total") {
      const totalLine = parseFloat(odds.total) || null;
      if (awayEra !== null) {
        const d = awayEra > 5.0 ? 12 : awayEra > 4.5 ? 7 : awayEra > 4.0 ? 3 : awayEra < 2.5 ? -12 : awayEra < 3.5 ? -7 : awayEra < 4.0 ? -3 : 0;
        score += d;
        factors.push({ label: "Away SP ERA", pts: d, max: 12,
          value: `${awayEra.toFixed(2)} — ${awaySP?.name ?? "Unknown"}`,
          detail: awayEra > 5.0 ? "Shaky starter — runs likely" : awayEra < 3.0 ? "Ace — suppresses scoring" : "Average" });
      }
      if (homeEra !== null) {
        const d = homeEra > 5.0 ? 12 : homeEra > 4.5 ? 7 : homeEra > 4.0 ? 3 : homeEra < 2.5 ? -12 : homeEra < 3.5 ? -7 : homeEra < 4.0 ? -3 : 0;
        score += d;
        factors.push({ label: "Home SP ERA", pts: d, max: 12,
          value: `${homeEra.toFixed(2)} — ${homeSP?.name ?? "Unknown"}`,
          detail: homeEra > 5.0 ? "Shaky starter — runs likely" : homeEra < 3.0 ? "Ace — keeps the total low" : "Average" });
      }
      const avgWhip = (homeWhip !== null && awayWhip !== null) ? (homeWhip + awayWhip) / 2 : (homeWhip ?? awayWhip ?? null);
      if (avgWhip !== null) {
        const d = avgWhip > 1.45 ? 8 : avgWhip > 1.30 ? 4 : avgWhip < 1.00 ? -8 : avgWhip < 1.10 ? -4 : 0;
        score += d;
        factors.push({ label: "Combined WHIP", pts: d, max: 8,
          value: `Avg WHIP ${avgWhip.toFixed(2)}`,
          detail: avgWhip > 1.35 ? "High baserunners — pitchers laboring" : avgWhip < 1.05 ? "Elite command — both SPs limit traffic" : "Average" });
      }
      const pfPts = pf.hr >= 1.15 ? 10 : pf.hr >= 1.08 ? 5 : pf.hr <= 0.87 ? -10 : pf.hr <= 0.93 ? -5 : 0;
      score += pfPts;
      factors.push({ label: "Park Factor", pts: pfPts, max: 10,
        value: `${game.stadium ?? game.home.abbr} — ${pf.label}`,
        detail: pf.hr >= 1.08 ? "Hitter-friendly — inflates scoring" : pf.hr <= 0.93 ? "Pitcher-friendly — suppresses runs" : "Neutral" });
      if (!wx.roof) {
        const temp = parseInt(wx.temp) || 72;
        let wxPts = 0;
        let wxDetail = "";
        if (wx.hrFavorable) { wxPts += 10; wxDetail = "HR-favorable wind — extra-base hits boost total"; }
        else if ((wx.wind ?? "").toLowerCase().includes("in")) { wxPts -= 8; wxDetail = "Wind blowing IN — suppresses home runs"; }
        if (temp < 50) { wxPts -= 8; wxDetail += (wxDetail ? " · " : "") + `${temp}°F — cold air kills offense`; }
        else if (temp < 60) { wxPts -= 4; wxDetail += (wxDetail ? " · " : "") + `${temp}°F — cool conditions`; }
        if (!wxDetail) wxDetail = "No notable weather effect";
        score += wxPts;
        factors.push({ label: "Weather", pts: wxPts, max: 10,
          value: wx.roof ? "Dome" : `${temp}°F${wx.wind ? `, ${wx.wind}` : ""}`, detail: wxDetail });
      } else {
        factors.push({ label: "Weather", pts: 0, max: 10, value: "Dome", detail: "Controlled environment — no weather impact" });
      }
      if (totalLine) {
        const linePts = totalLine >= 10 ? 5 : totalLine >= 9 ? 2 : totalLine <= 7 ? -2 : 0;
        score += linePts;
        factors.push({ label: "Market Total", pts: linePts, max: 5,
          value: `O/U ${totalLine}`, detail: totalLine >= 9.5 ? "High total — market expects big scoring, slight over lean" : totalLine <= 7.5 ? "Low total — pitching dominance priced in" : "Average total line" });
      }
      const awayBp = game.bullpen?.away;
      const homeBp = game.bullpen?.home;
      if (awayBp?.grade || homeBp?.grade) {
        const gradeToEra = { "A": 2.8, "B+": 3.25, "B": 3.75, "B-": 4.25, "C+": 4.75, "C": 5.5 };
        const awayBpEra = gradeToEra[awayBp?.grade] ?? 4.25;
        const homeBpEra = gradeToEra[homeBp?.grade] ?? 4.25;
        const avgBpEra = (awayBpEra + homeBpEra) / 2;
        const bpPts = avgBpEra > 4.75 ? 8 : avgBpEra > 4.25 ? 4 : avgBpEra < 3.25 ? -8 : avgBpEra < 3.75 ? -4 : 0;
        const eitherHigh = awayBp?.fatigueLevel === "HIGH" || homeBp?.fatigueLevel === "HIGH";
        const bothLow = awayBp?.fatigueLevel === "LOW" && homeBp?.fatigueLevel === "LOW";
        const fatiguePts = eitherHigh ? 4 : bothLow ? -3 : 0;
        const totalBpPts = bpPts + fatiguePts;
        score += totalBpPts;
        const bpDetail = avgBpEra > 4.5
          ? `Weak bullpens (avg ~${avgBpEra.toFixed(1)} ERA) — late-inning scoring risk`
          : avgBpEra < 3.5
          ? `Strong bullpens (avg ~${avgBpEra.toFixed(1)} ERA) — hold leads late`
          : "Average bullpen strength";
        const fatigueNote = eitherHigh ? " · fatigue risk" : bothLow ? " · fresh arms" : "";
        factors.push({
          label: "Bullpen Quality",
          pts: totalBpPts,
          max: 8,
          value: `${awayBp?.grade ?? "?"} / ${homeBp?.grade ?? "?"} (Away / Home)${eitherHigh ? " — HIGH fatigue" : ""}`,
          detail: bpDetail + fatigueNote,
        });
      }
      score = Math.round(Math.max(30, Math.min(78, score)));
      const lean = score >= 50 ? "OVER" : "UNDER";
      games.push({ gamePk: game.gamePk, name: `${game.away.abbr} @ ${game.home.abbr}`,
        gameLabel: `${game.away.abbr} @ ${game.home.abbr}`, away: game.away, home: game.home,
        gameTime: game.gameTime ?? null,
        score, lean, leanAbbr: null, leanLabel: `${lean} ${totalLine ?? "?"}`, line: totalLine, odds,
        factors, homeSP, awaySP, weather: wx, stadium: game.stadium });
    } else if (type === "spread") {
      const awaySpread = odds.awaySpread ?? null;
      const homeSpread = odds.homeSpread ?? null;
      const homeFavored = !awaySpread || parseFloat(awaySpread) >= 0;
      let eraAdj = 0;
      if (homeEra !== null && awayEra !== null) {
        const diff = awayEra - homeEra;
        eraAdj = diff > 2.0 ? 15 : diff > 1.0 ? 10 : diff > 0.5 ? 5 : diff < -2.0 ? -15 : diff < -1.0 ? -10 : diff < -0.5 ? -5 : 0;
        score += eraAdj;
        factors.push({ label: "SP ERA Differential", pts: eraAdj, max: 15,
          value: `Home ${homeEra.toFixed(2)} vs Away ${awayEra.toFixed(2)} (Δ ${diff > 0 ? "+" : ""}${diff.toFixed(2)})`,
          detail: diff > 1.0 ? "Home SP has clear edge — stronger pitching" : diff < -1.0 ? "Away SP has the pitching edge" : "Comparable starting pitchers" });
      } else if (homeEra !== null || awayEra !== null) {
        const era = homeEra ?? awayEra;
        const side = homeEra !== null ? "Home" : "Away";
        const d = era < 3.5 ? 5 : era > 5.0 ? -5 : 0;
        score += (side === "Home" ? d : -d);
        factors.push({ label: `${side} SP ERA`, pts: (side === "Home" ? d : -d), max: 10,
          value: `${era.toFixed(2)} ERA`, detail: "Only one SP available" });
      }
      if (homeWhip !== null && awayWhip !== null) {
        const wDiff = awayWhip - homeWhip;
        const wPts = wDiff > 0.3 ? 6 : wDiff > 0.1 ? 3 : wDiff < -0.3 ? -6 : wDiff < -0.1 ? -3 : 0;
        score += wPts;
        factors.push({ label: "WHIP Differential", pts: wPts, max: 6,
          value: `Home ${homeWhip.toFixed(2)} vs Away ${awayWhip.toFixed(2)}`,
          detail: wDiff > 0.2 ? "Home pitcher has better command" : wDiff < -0.2 ? "Away pitcher is the more efficient one" : "Control is comparable" });
      }
      const [, hfSpreadPts] = HOME_FIELD_ADV[game.home?.abbr] ?? DEFAULT_HOME_ADV;
      score += hfSpreadPts;
      factors.push({ label: "Home Field", pts: hfSpreadPts, max: 5, value: game.home.abbr, detail: `${game.home.abbr} home advantage — covers run line at above-average rate` });
      const homeMl = odds.homeML ?? game.odds?.homeML;
      if (homeMl) {
        const impl = mlToImplied(homeMl);
        const impPts = impl > 0.65 ? -5 : impl > 0.58 ? -2 : impl < 0.42 ? 5 : impl < 0.48 ? 2 : 0;
        score += impPts;
        factors.push({ label: "Market Implied Prob", pts: impPts, max: 5,
          value: `Home ${(impl * 100).toFixed(0)}% (${homeMl})`,
          detail: impl > 0.62 ? "Heavy home favorite — -1.5 spread steep price" : impl < 0.45 ? "Home underdog — +1.5 at favorable price" : "Near even money" });
      }
      score = Math.round(Math.max(30, Math.min(78, score)));
      const lean = score >= 50 ? "HOME" : "AWAY";
      const spreadLine = score >= 50 ? homeSpread : awaySpread;
      games.push({ gamePk: game.gamePk, name: `${game.away.abbr} @ ${game.home.abbr}`,
        gameLabel: `${game.away.abbr} @ ${game.home.abbr}`, away: game.away, home: game.home,
        gameTime: game.gameTime ?? null,
        score, lean, leanAbbr: lean === "HOME" ? game.home.abbr : game.away.abbr, leanLabel: `${lean === "HOME" ? game.home.abbr : game.away.abbr} ${spreadLine ?? "?"}`, line: spreadLine, odds,
        factors, homeSP, awaySP, weather: wx, stadium: game.stadium });
    } else if (type === "ml") {
      const homeMl = odds.homeML ?? game.odds?.homeML ?? null;
      const awayMl = odds.awayML ?? game.odds?.awayML ?? null;
      const homeImpl = homeMl ? mlToImplied(homeMl) : 0.5;
      const awayImpl = awayMl ? mlToImplied(awayMl) : 0.5;
      if (homeEra !== null && awayEra !== null) {
        const diff = awayEra - homeEra;
        const d = diff > 2.0 ? 15 : diff > 1.0 ? 10 : diff > 0.5 ? 5 : diff < -2.0 ? -15 : diff < -1.0 ? -10 : diff < -0.5 ? -5 : 0;
        score += d;
        factors.push({ label: "SP ERA Matchup", pts: d, max: 15,
          value: `${game.home.abbr} SP ${homeEra.toFixed(2)} vs ${game.away.abbr} SP ${awayEra.toFixed(2)}`,
          detail: diff > 1.0 ? "Home pitcher has a clear ERA edge" : diff < -1.0 ? "Away pitcher is the clear favorite on paper" : "Even pitching matchup" });
      }
      if (homeWhip !== null && awayWhip !== null) {
        const wDiff = awayWhip - homeWhip;
        const wPts = wDiff > 0.25 ? 6 : wDiff > 0.1 ? 3 : wDiff < -0.25 ? -6 : wDiff < -0.1 ? -3 : 0;
        score += wPts;
        factors.push({ label: "SP Command (WHIP)", pts: wPts, max: 6,
          value: `${game.home.abbr} ${homeWhip.toFixed(2)} vs ${game.away.abbr} ${awayWhip.toFixed(2)}`,
          detail: wDiff > 0.15 ? "Home SP is the more efficient pitcher" : wDiff < -0.15 ? "Away SP has better command" : "Similar control" });
      }
      const [hfMlPts] = HOME_FIELD_ADV[game.home?.abbr] ?? DEFAULT_HOME_ADV;
      score += hfMlPts;
      factors.push({ label: "Home Field Advantage", pts: hfMlPts, max: 6, value: game.home.abbr, detail: `${game.home.abbr} park-adjusted home advantage` });
      if (homeMl && awayMl) {
        const modelHome = score / 100;
        const edge = modelHome - homeImpl;
        const edgePts = edge > 0.12 ? 8 : edge > 0.06 ? 4 : edge < -0.12 ? -8 : edge < -0.06 ? -4 : 0;
        score += edgePts;
        factors.push({ label: "Model vs Market Edge", pts: edgePts, max: 8,
          value: `Market: ${game.home.abbr} ${(homeImpl * 100).toFixed(0)}% / ${game.away.abbr} ${(awayImpl * 100).toFixed(0)}%`,
          detail: edgePts > 0 ? "Our model likes home more than the market does" : edgePts < 0 ? "Market already pricing in home advantage — limited value" : "Model and market aligned" });
      }
      const pfPts = pf.hr >= 1.12 ? 2 : pf.hr <= 0.90 ? -2 : 0;
      score += pfPts;
      factors.push({ label: "Park Factor", pts: pfPts, max: 2,
        value: pf.label, detail: pfPts > 0 ? "Hitter-friendly — home team benefits from long ball" : pfPts < 0 ? "Pitcher's park — advantage to the better SP" : "Neutral park" });
      score = Math.round(Math.max(30, Math.min(78, score)));
      const lean = score >= 50 ? "HOME" : "AWAY";
      const mlLine = score >= 50 ? (homeMl ?? "—") : (awayMl ?? "—");
      const mlLeanAbbr = lean === "HOME" ? game.home.abbr : game.away.abbr;
      games.push({ gamePk: game.gamePk, name: `${game.away.abbr} @ ${game.home.abbr}`,
        gameLabel: `${game.away.abbr} @ ${game.home.abbr}`, away: game.away, home: game.home,
        gameTime: game.gameTime ?? null,
        score, lean, leanAbbr: mlLeanAbbr, leanLabel: `${mlLeanAbbr} ML ${mlLine}`, line: mlLine, odds,
        factors, homeSP, awaySP, weather: wx, stadium: game.stadium });
    } else if (type === "f5ml") {
      const f5HomeML = odds.f5HomeML ?? null;
      const f5AwayML = odds.f5AwayML ?? null;
      const marketHomeML = f5HomeML ?? odds.homeML ?? game.odds?.homeML ?? null;
      const marketAwayML = f5AwayML ?? odds.awayML ?? game.odds?.awayML ?? null;
      const homeImpl = marketHomeML ? mlToImplied(marketHomeML) : 0.5;
      const awayImpl = marketAwayML ? mlToImplied(marketAwayML) : 0.5;

      if (homeEra !== null && awayEra !== null) {
        const diff = awayEra - homeEra;
        const d = diff > 2.0 ? 20 : diff > 1.0 ? 13 : diff > 0.5 ? 7 : diff < -2.0 ? -20 : diff < -1.0 ? -13 : diff < -0.5 ? -7 : 0;
        score += d;
        factors.push({ label: "SP ERA Matchup", pts: d, max: 20,
          value: `${game.home.abbr} SP ${homeEra.toFixed(2)} vs ${game.away.abbr} SP ${awayEra.toFixed(2)}`,
          detail: diff > 1.0 ? "Home pitcher has a clear F5 edge" : diff < -1.0 ? "Away pitcher is dominant through 5" : "Even F5 pitching matchup" });
      }

      if (homeWhip !== null && awayWhip !== null) {
        const wDiff = awayWhip - homeWhip;
        const wPts = wDiff > 0.25 ? 8 : wDiff > 0.1 ? 4 : wDiff < -0.25 ? -8 : wDiff < -0.1 ? -4 : 0;
        score += wPts;
        factors.push({ label: "SP Command (WHIP)", pts: wPts, max: 8,
          value: `${game.home.abbr} ${homeWhip.toFixed(2)} vs ${game.away.abbr} ${awayWhip.toFixed(2)}`,
          detail: wDiff > 0.15 ? "Home SP has better control through 5" : wDiff < -0.15 ? "Away SP commands the zone better" : "Similar command" });
      }

      if (umpire?.rating === "pitcher") {
        score += 5;
        factors.push({ label: "Umpire Tendency", pts: 5, max: 5, value: umpire.name ?? "HP Ump", detail: "Pitcher-friendly zone — suppresses F5 offense" });
      } else if (umpire?.rating === "hitter") {
        score -= 4;
        factors.push({ label: "Umpire Tendency", pts: -4, max: 5, value: umpire.name ?? "HP Ump", detail: "Hitter-friendly zone — opens up F5 scoring" });
      }

      const [,, hfF5MlPts] = HOME_FIELD_ADV[game.home?.abbr] ?? DEFAULT_HOME_ADV;
      score += hfF5MlPts;
      factors.push({ label: "Home Field", pts: hfF5MlPts, max: 3, value: game.home.abbr, detail: `${game.home.abbr} park-adjusted F5 home edge` });

      if (marketHomeML && marketAwayML) {
        const modelHome = score / 100;
        const edge = modelHome - homeImpl;
        const edgePts = edge > 0.12 ? 8 : edge > 0.06 ? 4 : edge < -0.12 ? -8 : edge < -0.06 ? -4 : 0;
        score += edgePts;
        factors.push({ label: "Model vs Market Edge", pts: edgePts, max: 8,
          value: `Market: ${game.home.abbr} ${(homeImpl * 100).toFixed(0)}% / ${game.away.abbr} ${(awayImpl * 100).toFixed(0)}%`,
          detail: edgePts > 0 ? "Model likes home more than F5 market" : edgePts < 0 ? "Market has home well-priced already" : "Model and market aligned" });
      }

      score = Math.round(Math.max(30, Math.min(78, score)));
      const lean = score >= 50 ? "HOME" : "AWAY";
      const leanAbbr = lean === "HOME" ? game.home.abbr : game.away.abbr;
      const mlLine = lean === "HOME" ? (f5HomeML ?? marketHomeML ?? "—") : (f5AwayML ?? marketAwayML ?? "—");
      games.push({ gamePk: game.gamePk, name: `${game.away.abbr} @ ${game.home.abbr}`,
        gameLabel: `${game.away.abbr} @ ${game.home.abbr}`, away: game.away, home: game.home,
        gameTime: game.gameTime ?? null,
        score, lean, leanAbbr, leanLabel: `${leanAbbr} F5 ML ${mlLine}`, line: mlLine, odds,
        factors, homeSP, awaySP, weather: wx, stadium: game.stadium,
        homeEra: homeEra ?? null,
        awayEra: awayEra ?? null,
        parkFactor: pf.hit ?? pf.hr ?? 1.0,
        umpireRating: umpire?.rating ?? null,
      });
    } else if (type === "f5spread") {
      const f5AwaySpread = odds.f5AwaySpread ?? null;
      const f5HomeSpread = odds.f5HomeSpread ?? null;
      const f5AwaySpreadOdds = odds.f5AwaySpreadOdds ?? null;
      const f5HomeSpreadOdds = odds.f5HomeSpreadOdds ?? null;
      const marketAwaySpread = f5AwaySpread ?? odds.awaySpread ?? game.odds?.awaySpread ?? null;
      const marketHomeSpread = f5HomeSpread ?? odds.homeSpread ?? game.odds?.homeSpread ?? null;
      const marketAwaySpreadOdds = f5AwaySpreadOdds ?? odds.awaySpreadOdds ?? game.odds?.awaySpreadOdds ?? null;
      const marketHomeSpreadOdds = f5HomeSpreadOdds ?? odds.homeSpreadOdds ?? game.odds?.homeSpreadOdds ?? null;

      if (homeEra !== null && awayEra !== null) {
        const diff = awayEra - homeEra;
        const d = diff > 2.0 ? 20 : diff > 1.0 ? 13 : diff > 0.5 ? 7 : diff < -2.0 ? -20 : diff < -1.0 ? -13 : diff < -0.5 ? -7 : 0;
        score += d;
        factors.push({ label: "SP ERA Matchup", pts: d, max: 20,
          value: `${game.home.abbr} SP ${homeEra.toFixed(2)} vs ${game.away.abbr} SP ${awayEra.toFixed(2)}`,
          detail: diff > 1.0 ? "Home starter projects well through 5" : diff < -1.0 ? "Away starter owns the F5 edge" : "Even F5 pitching matchup" });
      }

      if (homeWhip !== null && awayWhip !== null) {
        const wDiff = awayWhip - homeWhip;
        const wPts = wDiff > 0.25 ? 8 : wDiff > 0.1 ? 4 : wDiff < -0.25 ? -8 : wDiff < -0.1 ? -4 : 0;
        score += wPts;
        factors.push({ label: "SP Command (WHIP)", pts: wPts, max: 8,
          value: `${game.home.abbr} ${homeWhip.toFixed(2)} vs ${game.away.abbr} ${awayWhip.toFixed(2)}`,
          detail: wDiff > 0.15 ? "Home SP has better control through 5" : wDiff < -0.15 ? "Away SP commands the zone better" : "Similar command" });
      }

      if (umpire?.rating === "pitcher") {
        score += 5;
        factors.push({ label: "Umpire Tendency", pts: 5, max: 5, value: umpire.name ?? "HP Ump", detail: "Pitcher-friendly zone — helps F5 favorite cover" });
      } else if (umpire?.rating === "hitter") {
        score -= 4;
        factors.push({ label: "Umpire Tendency", pts: -4, max: 5, value: umpire.name ?? "HP Ump", detail: "Hitter-friendly zone — more early scoring variance" });
      }

      const [,, hfF5RlPts] = HOME_FIELD_ADV[game.home?.abbr] ?? DEFAULT_HOME_ADV;
      score += hfF5RlPts;
      factors.push({ label: "Home Field", pts: hfF5RlPts, max: 3, value: game.home.abbr, detail: `${game.home.abbr} park-adjusted F5 home edge` });

      if (marketHomeSpreadOdds && marketAwaySpreadOdds) {
        const homeImpl = mlToImplied(marketHomeSpreadOdds);
        const modelHome = score / 100;
        const edge = modelHome - homeImpl;
        const edgePts = edge > 0.12 ? 8 : edge > 0.06 ? 4 : edge < -0.12 ? -8 : edge < -0.06 ? -4 : 0;
        score += edgePts;
        factors.push({ label: "Model vs Market Edge", pts: edgePts, max: 8,
          value: `Market RL: ${game.home.abbr} ${marketHomeSpread ?? "—"} (${marketHomeSpreadOdds ?? "—"}) / ${game.away.abbr} ${marketAwaySpread ?? "—"} (${marketAwaySpreadOdds ?? "—"})`,
          detail: edgePts > 0 ? "Model likes home F5 run line more than market" : edgePts < 0 ? "Market already prices the home F5 edge" : "Model and market aligned" });
      }

      score = Math.round(Math.max(30, Math.min(78, score)));
      const lean = score >= 50 ? "HOME" : "AWAY";
      const leanAbbr = lean === "HOME" ? game.home.abbr : game.away.abbr;
      const spreadLine = lean === "HOME" ? (marketHomeSpread ?? "—") : (marketAwaySpread ?? "—");
      const spreadOdds = lean === "HOME" ? marketHomeSpreadOdds : marketAwaySpreadOdds;
      games.push({ gamePk: game.gamePk, name: `${game.away.abbr} @ ${game.home.abbr}`,
        gameLabel: `${game.away.abbr} @ ${game.home.abbr}`, away: game.away, home: game.home,
        gameTime: game.gameTime ?? null,
        score, lean, leanAbbr, leanLabel: `${leanAbbr} F5 RL ${spreadLine}${spreadOdds ? ` (${spreadOdds})` : ""}`, line: spreadLine, odds,
        factors, homeSP, awaySP, weather: wx, stadium: game.stadium });
    }
  });
  const gameDisplayScore = (g) =>
    g?.lean === "YRFI" || g?.lean === "UNDER" || g?.lean === "AWAY"
      ? 100 - (g.score ?? 0)
      : (g.score ?? 0);
  return games.sort((a, b) => gameDisplayScore(b) - gameDisplayScore(a));
};
