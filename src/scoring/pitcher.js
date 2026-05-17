/**
 * kBoardScore: 0–95 composite for K prop attractiveness.
 * Inputs: season pitcher stats obj, pitching gamelog, park factor, umpire obj, oppTeamStats
 */
export const kBoardScore = (pStats, gamelog, pf, umpire, oppTeamStats) => {
  if (!pStats) return null;
  let s = 40;
  const swStrPct = parseFloat(pStats.swStrPct ?? pStats.swStr) || null;
  if (swStrPct !== null) {
    s += swStrPct >= 16 ? 35 : swStrPct >= 14 ? 27 : swStrPct >= 12 ? 18
      : swStrPct >= 11 ? 10 : swStrPct >= 10 ? 4 : 0;
  } else {
    const k9 = parseFloat(pStats.kPer9 ?? pStats.k9) || 0;
    s += k9 >= 10 ? 27 : k9 >= 9 ? 20 : k9 >= 8 ? 12 : k9 >= 7 ? 6 : 0;
  }

  const chasePct = parseFloat(pStats.chasePct ?? pStats.oSwing) || null;
  if (chasePct !== null) {
    s += chasePct >= 36 ? 10 : chasePct >= 33 ? 6 : chasePct >= 31 ? 3
      : chasePct <= 26 ? -4 : chasePct <= 28 ? -2 : 0;
  }

  const recentStarts = gamelog?.games ?? [];
  const last3 = recentStarts.slice(0, 3);
  if (last3.length > 0) {
    const avgK = last3.reduce((acc, g) => acc + (g.k ?? 0), 0) / last3.length;
    s += avgK >= 7 ? 20 : avgK >= 6 ? 14 : avgK >= 5 ? 8 : avgK >= 4 ? 4 : 0;
  }

  s += (pf.k - 1.0) * 90;

  if (umpire?.rating === "pitcher") s += 15;
  else if (umpire?.rating === "neutral" || !umpire) s += 8;
  else s += 3;

  const whip = parseFloat(pStats.whip) || 0;
  if (whip > 0) s += whip <= 1.05 ? 8 : whip <= 1.20 ? 5 : whip <= 1.35 ? 2 : 0;

  const oppKPct = oppTeamStats?.kPct ?? null;
  if (oppKPct !== null) {
    s += oppKPct >= 24 ? 4 : oppKPct >= 21 ? 2 : oppKPct <= 17 ? -4 : oppKPct <= 19 ? -2 : 0;
  }

  const xwOBA = pStats?.pitcherStats?.xwOBAAllowed ?? null;
  if (xwOBA !== null) {
    s += xwOBA <= 0.270 ? 5 : xwOBA <= 0.290 ? 3 : xwOBA <= 0.310 ? 1
      : xwOBA >= 0.350 ? -4 : xwOBA >= 0.330 ? -2 : 0;
  }
  return Math.round(Math.max(10, Math.min(95, s)));
};

/**
 * outsBoardScore: 0–95 composite for Outs (innings pitched) prop attractiveness.
 */
export const outsBoardScore = (pStats, gamelog, pf) => {
  if (!pStats) return null;
  let s = 35;
  const whip = parseFloat(pStats.whip) || 0;
  const era = parseFloat(pStats.era) || 0;
  const avgIPStr = gamelog?.avgIP;
  if (avgIPStr && avgIPStr !== "—") {
    const [whole, frac = "0"] = String(avgIPStr).split(".");
    const outs = parseInt(whole) * 3 + parseInt(frac);
    const ip = outs / 3;
    s += ip >= 6.5 ? 35 : ip >= 6.0 ? 26 : ip >= 5.5 ? 17 : ip >= 5.0 ? 8 : 0;
  }
  if (whip > 0) s += whip <= 1.00 ? 28 : whip <= 1.10 ? 20 : whip <= 1.20 ? 12 : whip <= 1.35 ? 5 : 0;
  const seasonEra = era;
  const recentStarts = gamelog?.games ?? [];
  const last3 = recentStarts.slice(0, 3);
  if (last3.length >= 2 && seasonEra > 0) {
    const totalOuts = last3.reduce((acc, g) => {
      const [w, f = "0"] = String(g.ip ?? "0").split(".");
      return acc + parseInt(w) * 3 + parseInt(f);
    }, 0);
    const totalER = last3.reduce((acc, g) => acc + (g.er ?? 0), 0);
    const recentEra = totalOuts > 0 ? (totalER * 27) / totalOuts : seasonEra;
    s += recentEra < seasonEra - 0.5 ? 12 : recentEra < seasonEra ? 7 : recentEra < seasonEra + 1 ? 3 : 0;
  }
  const lastStart = recentStarts[0];
  if (lastStart?.pc != null && lastStart?.date) {
    const daysSince = Math.floor((Date.now() - new Date(lastStart.date).getTime()) / (24 * 60 * 60 * 1000));
    const pitchCount = parseInt(lastStart.pc, 10);
    if (Number.isFinite(daysSince) && Number.isFinite(pitchCount) && daysSince <= 4) {
      if (pitchCount >= 100) s -= 6;
      else if (pitchCount >= 85) s -= 3;
    }
  }
  const xwOBA = pStats?.pitcherStats?.xwOBAAllowed ?? null;
  if (xwOBA !== null) {
    if      (xwOBA <= 0.280) s += 4;
    else if (xwOBA >= 0.345) s -= 3;
  }
  s += (1.0 - pf.hit) * 50;
  return Math.round(Math.max(10, Math.min(95, s)));
};
