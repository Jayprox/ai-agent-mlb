export const mlToImplied = (ml) => {
  const n = parseInt(ml);
  if (isNaN(n)) return 0.5;
  return n < 0 ? Math.abs(n) / (Math.abs(n) + 100) : 100 / (n + 100);
};

export const formatLocalTime = (isoStr) => {
  if (!isoStr) return null;
  try {
    return new Date(isoStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return null;
  }
};

export const resultBorderStyle = (color) =>
  color ? { borderLeft: `3px solid ${color}`, paddingLeft: 10 } : {};

export const summarizeOutcomes = (items, outcomeFn) => {
  if (!items.length) return null;
  const resolved = items.map(outcomeFn).filter(v => v !== null);
  if (!resolved.length) return null;
  return { hits: resolved.filter(Boolean).length, total: items.length };
};

export const normalizeScratchName = (name) =>
  String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const vigStrip = (leanRaw, oppRaw) => {
  const total = leanRaw + oppRaw;
  return total > 0 ? leanRaw / total : leanRaw;
};

export function propEdgeData(propLine, lean) {
  const BOOK_PREF = ["DK", "FD", "CZR", "MGM"];
  for (const bk of BOOK_PREF) {
    const entry = propLine?.books?.[bk];
    if (!entry) continue;
    const leanOddsStr = lean === "OVER" ? entry.overOdds : entry.underOdds;
    if (!leanOddsStr) continue;
    const leanRaw = mlToImplied(leanOddsStr);
    const oppOddsStr = lean === "OVER" ? entry.underOdds : entry.overOdds;
    const impliedProb = oppOddsStr
      ? vigStrip(leanRaw, mlToImplied(oppOddsStr))
      : leanRaw;
    return { bookOdds: parseInt(leanOddsStr, 10), impliedProb };
  }
  return { bookOdds: null, impliedProb: null };
}

export function kellyFraction(modelProb, americanOdds) {
  const n = parseInt(americanOdds, 10);
  if (isNaN(n) || modelProb <= 0) return 0;
  const b = n > 0 ? n / 100 : 100 / Math.abs(n);
  const q = 1 - modelProb;
  const f = (modelProb * b - q) / b;
  return Math.min(0.30, Math.max(0, f));
}
