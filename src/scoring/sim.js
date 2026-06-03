// Monte Carlo simulation helpers for board confidence scoring.
// Seeded RNG keeps SIM % identical across browsers for the same player/line/market.

function hashSeed(str) {
  let h = 2166136261;
  const s = String(str ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

export function createSeededRng(seedKey) {
  let state = hashSeed(seedKey);
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSimContext(seedKey) {
  if (!seedKey) {
    return {
      random: () => Math.random(),
      sampleStdNormal() {
        const u1 = Math.random() || 1e-10;
        const u2 = Math.random() || 1e-10;
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      },
    };
  }
  const rng = createSeededRng(seedKey);
  return {
    random: () => rng(),
    sampleStdNormal() {
      const u1 = rng() || 1e-10;
      const u2 = rng() || 1e-10;
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}

function sampleNormal(ctx, mean, std) {
  return mean + ctx.sampleStdNormal() * std;
}

function sampleCorrelated(ctx, rho) {
  const z1 = ctx.sampleStdNormal();
  const z2 = ctx.sampleStdNormal();
  return [z1, rho * z1 + Math.sqrt(1 - rho * rho) * z2];
}

export function simKConfidence(candidate, line, n = 500, seedKey = null) {
  const ctx = makeSimContext(seedKey);
  if (line == null) return null;
  const mean = parseFloat(candidate.avgK3) || null;
  const k9 = parseFloat(candidate.k9) || 0;
  if (!mean && k9 === 0) return null;
  const std = 1.8;

  const avgIPStr = candidate.avgIP;
  const estimatedIP = (() => {
    if (!avgIPStr || avgIPStr === "—") return 5.5;
    const [w, f = "0"] = String(avgIPStr).split(".");
    return parseInt(w) + parseInt(f) / 3;
  })();
  const priorMu = k9 > 0 ? (k9 * estimatedIP / 9) : null;
  const recentMu = mean ?? (k9 * estimatedIP / 9);

  let posteriorMu;
  if (priorMu != null) {
    const priorVar = 3.0;
    const likeVar = std * std;
    const nObs = 3;
    const postVar = 1 / (1 / priorVar + nObs / likeVar);
    posteriorMu = postVar * (priorMu / priorVar + (nObs * recentMu) / likeVar);
  } else {
    posteriorMu = recentMu;
  }

  const parkAdjMean = ((candidate.parkFactor ?? 1.0) - 1.0) * 1.5;
  const umpAdjMean = candidate.umpireRating === "pitcher" ? 0.5
    : candidate.umpireRating === "batter" ? -0.5 : 0;
  const parkAdjStd = 0.4;
  const umpAdjStd = 0.35;
  const rho = 0.3;

  let hits = 0;
  for (let i = 0; i < n; i++) {
    const [zp, zu] = sampleCorrelated(ctx, rho);
    const parkSample = parkAdjMean + parkAdjStd * zp;
    const umpSample = umpAdjMean + umpAdjStd * zu;
    const iterMu = posteriorMu + parkSample + umpSample;
    const result = Math.max(0, sampleNormal(ctx, iterMu, std));
    if (result > line) hits++;
  }
  return Math.round((hits / n) * 100);
}

export function simOutsConfidence(candidate, line, n = 500, seedKey = null) {
  const ctx = makeSimContext(seedKey);
  if (line == null) return null;
  const avgIPStr = candidate.avgIP;
  if (!avgIPStr || avgIPStr === "—") return null;
  const [whole, frac = "0"] = String(avgIPStr).split(".");
  const avgIPNum = parseInt(whole) + parseInt(frac) / 3;
  const meanOuts = avgIPNum * 3;
  const std = 2.8;
  const priorMu = 16.5;
  const priorVar = 9.0;
  const likeVar = std * std;
  const nObs = 3;
  const postVar = 1 / (1 / priorVar + nObs / likeVar);
  const posteriorMu = postVar * (priorMu / priorVar + (nObs * meanOuts) / likeVar);
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const result = Math.max(0, sampleNormal(ctx, posteriorMu, std));
    if (result > line) hits++;
  }
  return Math.round((hits / n) * 100);
}

export function simHRConfidence(candidate, line, n = 500, seedKey = null) {
  const ctx = makeSimContext(seedKey);
  if (line == null) return null;
  const hr = parseInt(candidate.hr) || 0;
  const slg = parseFloat(candidate.slg) || 0;
  if (hr === 0 && slg < 0.35) return null;
  const rawBasePHR = hr > 0 ? Math.min(0.25, hr / 162) : Math.max(0.04, (slg - 0.35) * 0.12);
  const leagueAvgPHR = 0.035;
  const pseudoObs = 8;
  const shrinkage = hr / (hr + pseudoObs);
  const posteriorBasePHR = shrinkage * rawBasePHR + (1 - shrinkage) * leagueAvgPHR;
  const parkMultMean = candidate.parkFactor ?? 1.0;
  const windMean = candidate.windFav ? 1.12 : 1.0;
  const vsHandSLG = candidate.matchup?.batterVsHand?.slg != null
    ? parseFloat(candidate.matchup.batterVsHand.slg)
    : slg;
  const platoonMult = slg > 0 ? (vsHandSLG / slg) : 1.0;
  const parkStd = 0.08;
  const windStd = 0.06;
  const rho = 0.45;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const [zp, zw] = sampleCorrelated(ctx, rho);
    const parkSample = Math.max(0.7, parkMultMean + parkStd * zp);
    const windSample = Math.max(0.85, windMean + windStd * zw);
    const iterPHR = Math.min(0.40, posteriorBasePHR * parkSample * windSample * platoonMult);
    if (ctx.random() < iterPHR) hits++;
  }
  return Math.round((hits / n) * 100);
}

export function simHitsConfidence(candidate, line, n = 500, seedKey = null) {
  const ctx = makeSimContext(seedKey);
  if (line == null) return null;
  const avg = parseFloat(candidate.avg) || 0;
  if (avg === 0) return null;
  const rawVsHandAVG = candidate.matchup?.batterVsHand?.avg != null
    ? parseFloat(candidate.matchup.batterVsHand.avg)
    : avg;
  const vsHandAVG = 0.65 * rawVsHandAVG + 0.35 * avg;
  const parkMultMean = candidate.parkFactor ?? 1.0;
  const parkStd = 0.06;
  const pa = candidate.order != null && candidate.order <= 3 ? 4 : candidate.order >= 8 ? 3 : 4;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const parkSample = Math.max(0.8, parkMultMean + parkStd * ctx.sampleStdNormal());
    const adjAvg = Math.min(0.450, vsHandAVG * parkSample);
    let gameHits = 0;
    for (let j = 0; j < pa; j++) {
      if (ctx.random() < adjAvg) gameHits++;
    }
    if (gameHits >= line) hits++;
  }
  return Math.round((hits / n) * 100);
}

export function simF5MLConfidence(homeEra, awayEra, parkFactor, umpireRating, lean, n = 500, seedKey = null) {
  const ctx = makeSimContext(seedKey);
  if (!homeEra || !awayEra || !lean) return null;

  const homeMean = Math.max(0, awayEra * (5 / 9));
  const awayMean = Math.max(0, homeEra * (5 / 9));

  const parkAdj = ((parkFactor ?? 1.0) - 1.0) * 0.5;
  const umpAdj  = umpireRating === "pitcher" ? -0.12
                : umpireRating === "hitter"  ?  0.12 : 0;
  const std = 1.5;

  let leanWins = 0;
  let resolved = 0;

  for (let i = 0; i < n; i++) {
    const [zpH, zpA] = sampleCorrelated(ctx, 0.35);
    const homeRuns = Math.max(0, sampleNormal(ctx, homeMean + parkAdj + umpAdj, std) + 0.1 * zpH);
    const awayRuns = Math.max(0, sampleNormal(ctx, awayMean + parkAdj + umpAdj, std) + 0.1 * zpA);
    if (Math.abs(homeRuns - awayRuns) < 0.4) continue;
    resolved++;
    const homeWon = homeRuns > awayRuns;
    if ((lean === "HOME" && homeWon) || (lean === "AWAY" && !homeWon)) leanWins++;
  }

  return resolved > 0 ? Math.round((leanWins / resolved) * 100) : null;
}
