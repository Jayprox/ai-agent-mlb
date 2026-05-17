/**
 * hrBoardScore: 0–95 composite. Primary = SLG/HR pace.
 * Secondary = park, wind, order, platoon, opposing ERA.
 */
export const hrBoardScore = (hlog, order, pitcherHand, pf, wxFav, sd, facingPitcherEra = null) => {
  if (!hlog) return null;
  let s = 50;
  const slg = parseFloat(hlog.slg) || 0;
  const hr  = parseInt(hlog.hr) || 0;
  const ops = parseFloat(hlog.ops) || 0;
  if (slg > 0) s += (slg - 0.410) * 55;
  else s += (ops - 0.720) * 20;
  s += hr * 0.7;
  s += (pf.hr - 1.0) * 35;
  if (wxFav) s += 8;
  if      (order <= 3) s += 6;
  else if (order <= 5) s += 3;
  else if (order >= 8) s -= 4;
  if (sd && typeof sd === "object" && sd !== "loading") {
    const hand = pitcherHand === "L" ? sd.vsL : sd.vsR;
    if (hand?.slg) s += (parseFloat(hand.slg) - (slg || 0.410)) * 25;
  }
  if (facingPitcherEra !== null) {
    s += facingPitcherEra > 5.0 ? 9 : facingPitcherEra > 4.5 ? 5 : facingPitcherEra > 4.0 ? 2
      : facingPitcherEra < 2.5 ? -10 : facingPitcherEra < 3.0 ? -6 : facingPitcherEra < 3.5 ? -3 : 0;
  }
  return Math.round(Math.max(15, Math.min(95, s)));
};

/**
 * hitBoardScore: 0–95 composite. Primary = AVG + recent form.
 * Secondary = park, order, platoon, opposing ERA.
 */
export const hitBoardScore = (hlog, order, pitcherHand, pf, sd, facingPitcherEra = null) => {
  if (!hlog) return null;
  let s = 50;
  const avg = parseFloat(hlog.avg) || 0;
  const ops = parseFloat(hlog.ops) || 0;
  const hitRate = hlog.hitRate ?? [];
  const l5 = hitRate.slice(0, 5).reduce((a, v) => a + v, 0);
  if (avg > 0) s += (avg - 0.250) * 140;
  else s += (ops - 0.720) * 15;
  s += (l5 / 5 - 0.40) * 28;
  s += (pf.hit - 1.0) * 28;
  if      (order <= 3) s += 6;
  else if (order <= 5) s += 3;
  else if (order >= 8) s -= 4;
  if (sd && typeof sd === "object" && sd !== "loading") {
    const hand = pitcherHand === "L" ? sd.vsL : sd.vsR;
    if (hand?.avg) s += (parseFloat(hand.avg) - (avg || 0.250)) * 110;
  }
  if (facingPitcherEra !== null) {
    s += facingPitcherEra > 5.0 ? 8 : facingPitcherEra > 4.5 ? 4 : facingPitcherEra > 4.0 ? 2
      : facingPitcherEra < 2.5 ? -9 : facingPitcherEra < 3.0 ? -5 : facingPitcherEra < 3.5 ? -2 : 0;
  }
  return Math.round(Math.max(15, Math.min(95, s)));
};
