// ─────────────────────────────────────────────────────────────────────────────
// Batter vs Pitcher pitch-arsenal matchup score
//
// Mirrors the frontend's calcMatchupScoreForPitchSet() in prop-scout-v7.jsx
// exactly so web app and iOS see the same number from the API.
//
// Inputs:
//   batterHand   – "L" | "R" | "S"
//   vsPitches    – map of pitch abbr → { avg, whiff, slg }  (from batter splits)
//   arsenal      – array of { abbr, pct }                   (from pitcher arsenal)
//   pitcherHand  – "L" | "R"
//
// Returns:
//   number 0–100  (one decimal place), or null if no overlap between
//   pitcher's arsenal and batter's split data.
// ─────────────────────────────────────────────────────────────────────────────

function computeMatchupScore(batterHand, vsPitches, arsenal, pitcherHand) {
  if (!Array.isArray(arsenal) || !arsenal.length) return null;

  // Same-hand matchup is slightly harder for the batter (pitcher advantage)
  const handPenalty = pitcherHand === batterHand ? 0.92 : 1.0;

  let weightedSum = 0;
  let totalWeight = 0;

  arsenal.forEach(({ abbr, pct }) => {
    const p = vsPitches?.[abbr];
    if (!p) return; // batter has no split data for this pitch type

    // Cap any single pitch at 40% so one dominant pitch doesn't overwhelm
    const capPct = Math.min(pct, 40);
    const weight = capPct / 100;

    // avg/whiff/slg come as strings (".257", "23%", ".412") from splits.js
    const avg   = parseFloat(p.avg)  || 0;
    const whiff = parseFloat(p.whiff) || 20; // parseFloat("23%") → 23
    const slg   = parseFloat(p.slg)  || avg * 1.6;

    // Normalise each dimension to 0–1
    const avgScore   = Math.max(0, Math.min(1, (avg   - 0.150) / 0.250));
    const whiffScore = Math.max(0, Math.min(1, 1 - (whiff / 50)));
    const slgScore   = Math.max(0, Math.min(1, (slg   - 0.200) / 0.500));

    const pitchScore = (avgScore * 0.45) + (whiffScore * 0.35) + (slgScore * 0.20);

    weightedSum += pitchScore * weight * handPenalty;
    totalWeight += weight;
  });

  if (totalWeight === 0) return null; // no pitch overlap — don't return a fake 50

  const normalized = (weightedSum / totalWeight) * 100;
  return Math.round(normalized * 10) / 10;
}

module.exports = { computeMatchupScore };
