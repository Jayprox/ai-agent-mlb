// HR park factors by team abbreviation, with LHB/RHB splits.
// Source: multi-year FanGraphs handedness-split park factor data, 2024 baseline.
// hrLhb / hrRhb: HR factor for left-handed / right-handed batters
// hrNeutral: blended (matches frontend PARK_FACTORS hr field)
// All values: 1.00 = league average, >1.00 = hitter-friendly, <1.00 = pitcher-friendly

const PARK_HR_FACTORS = {
  COL: { hrLhb: 1.28, hrRhb: 1.42, hrNeutral: 1.35, label: "Hitter Haven" }, // Coors Field
  CIN: { hrLhb: 1.10, hrRhb: 1.20, hrNeutral: 1.15, label: "Hitter-Friendly" }, // Great American
  PHI: { hrLhb: 1.08, hrRhb: 1.12, hrNeutral: 1.10, label: "Hitter-Friendly" }, // Citizens Bank
  BOS: { hrLhb: 0.92, hrRhb: 1.24, hrNeutral: 1.08, label: "Hitter-Friendly" }, // Fenway — Green Monster kills LHB, short RF helps RHB
  TEX: { hrLhb: 1.07, hrRhb: 1.09, hrNeutral: 1.08, label: "Hitter-Friendly" }, // Globe Life Field
  BAL: { hrLhb: 1.05, hrRhb: 1.09, hrNeutral: 1.07, label: "Hitter-Friendly" }, // Camden Yards
  CHC: { hrLhb: 1.02, hrRhb: 1.06, hrNeutral: 1.04, label: "Wind-Variable" }, // Wrigley Field
  NYY: { hrLhb: 1.18, hrRhb: 0.98, hrNeutral: 1.05, label: "Slight Hitter" }, // Yankee Stadium — short RF porch = LHB heaven
  TOR: { hrLhb: 1.03, hrRhb: 1.03, hrNeutral: 1.03, label: "Slight Hitter" }, // Rogers Centre
  ARI: { hrLhb: 1.00, hrRhb: 1.04, hrNeutral: 1.02, label: "Slight Hitter" }, // Chase Field
  ATL: { hrLhb: 1.00, hrRhb: 1.04, hrNeutral: 1.02, label: "Neutral" }, // Truist Park
  DET: { hrLhb: 0.98, hrRhb: 1.04, hrNeutral: 1.01, label: "Neutral" }, // Comerica Park
  MIL: { hrLhb: 0.99, hrRhb: 1.01, hrNeutral: 1.00, label: "Neutral" }, // American Family Field
  CHW: { hrLhb: 0.98, hrRhb: 1.02, hrNeutral: 1.00, label: "Neutral" }, // Guaranteed Rate Field
  STL: { hrLhb: 0.96, hrRhb: 0.99, hrNeutral: 0.98, label: "Slight Pitcher" }, // Busch Stadium
  WSH: { hrLhb: 0.96, hrRhb: 1.00, hrNeutral: 0.98, label: "Slight Pitcher" }, // Nationals Park
  MIN: { hrLhb: 0.95, hrRhb: 0.99, hrNeutral: 0.97, label: "Slight Pitcher" }, // Target Field
  CLE: { hrLhb: 0.96, hrRhb: 0.98, hrNeutral: 0.97, label: "Slight Pitcher" }, // Progressive Field
  PIT: { hrLhb: 0.93, hrRhb: 0.99, hrNeutral: 0.96, label: "Pitcher-Friendly" }, // PNC Park
  NYM: { hrLhb: 0.97, hrRhb: 0.95, hrNeutral: 0.96, label: "Pitcher-Friendly" }, // Citi Field — deep RF hurts RHB
  LAA: { hrLhb: 0.94, hrRhb: 0.98, hrNeutral: 0.96, label: "Pitcher-Friendly" }, // Angel Stadium
  HOU: { hrLhb: 0.94, hrRhb: 0.96, hrNeutral: 0.95, label: "Pitcher-Friendly" }, // Minute Maid Park
  MIA: { hrLhb: 0.93, hrRhb: 0.95, hrNeutral: 0.94, label: "Pitcher-Friendly" }, // loanDepot park
  TB: { hrLhb: 0.93, hrRhb: 0.95, hrNeutral: 0.94, label: "Pitcher-Friendly" }, // Tropicana Field
  OAK: { hrLhb: 0.91, hrRhb: 0.95, hrNeutral: 0.93, label: "Pitcher-Friendly" }, // Sutter Health Park
  LAD: { hrLhb: 0.90, hrRhb: 0.95, hrNeutral: 0.93, label: "Pitcher-Friendly" }, // Dodger Stadium
  KC: { hrLhb: 0.89, hrRhb: 0.93, hrNeutral: 0.91, label: "Pitcher-Friendly" }, // Kauffman Stadium
  SEA: { hrLhb: 0.88, hrRhb: 0.92, hrNeutral: 0.90, label: "Pitcher-Friendly" }, // T-Mobile Park
  SD: { hrLhb: 0.85, hrRhb: 0.89, hrNeutral: 0.87, label: "Pitcher Haven" }, // Petco Park
  SF: { hrLhb: 0.83, hrRhb: 0.83, hrNeutral: 0.83, label: "Pitcher Haven" }, // Oracle Park
};

const NEUTRAL_HR = { hrLhb: 1.00, hrRhb: 1.00, hrNeutral: 1.00, label: "Neutral" };

/**
 * Look up HR park factor for a team and batter hand.
 * @param {string} teamAbbr  - home team abbreviation (e.g. "NYY")
 * @param {string} batterHand - "L", "R", or "S" (switch)
 * @returns {{ factor: number, hrLhb: number, hrRhb: number, hrNeutral: number, label: string }}
 */
function getParkHrFactor(teamAbbr, batterHand) {
  const park = PARK_HR_FACTORS[teamAbbr] ?? NEUTRAL_HR;
  const factor = batterHand === "L" ? park.hrLhb
    : batterHand === "R" ? park.hrRhb
      : park.hrNeutral; // switch hitters → use neutral
  return { factor, ...park };
}

module.exports = { PARK_HR_FACTORS, NEUTRAL_HR, getParkHrFactor };
