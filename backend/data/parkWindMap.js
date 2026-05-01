// Stadium CF orientation (degrees from home plate toward CF) + roof flag.
// Orientation values match the frontend STADIUMS object exactly.
// Used by computeWindBoost() to determine if wind favors HRs.

const PARK_WIND_MAP = {
  "Citizens Bank Park": { orientation: 60, roof: false }, // PHI
  "Dodger Stadium": { orientation: 25, roof: false }, // LAD
  "Globe Life Field": { orientation: 0, roof: true }, // TEX
  "American Family Field": { orientation: 5, roof: false }, // MIL
  "Oracle Park": { orientation: 55, roof: false }, // SF
  "Rogers Centre": { orientation: 10, roof: true }, // TOR
  "Yankee Stadium": { orientation: 30, roof: false }, // NYY
  "Fenway Park": { orientation: 90, roof: false }, // BOS
  "Wrigley Field": { orientation: 30, roof: false }, // CHC
  "Busch Stadium": { orientation: 10, roof: false }, // STL
  "T-Mobile Park": { orientation: 5, roof: false }, // SEA
  "Camden Yards": { orientation: 5, roof: false }, // BAL
  "Petco Park": { orientation: 35, roof: false }, // SD
  "Truist Park": { orientation: 20, roof: false }, // ATL
  "Great American Ball Park": { orientation: 10, roof: false }, // CIN
  "loanDepot park": { orientation: 5, roof: true }, // MIA
  "Minute Maid Park": { orientation: 30, roof: true }, // HOU
  "Tropicana Field": { orientation: 0, roof: true }, // TB
  "Chase Field": { orientation: 25, roof: true }, // ARI
  "Coors Field": { orientation: 20, roof: false }, // COL
  "PNC Park": { orientation: 35, roof: false }, // PIT
  "Target Field": { orientation: 5, roof: false }, // MIN
  "Kauffman Stadium": { orientation: 15, roof: false }, // KC
  "Progressive Field": { orientation: 5, roof: false }, // CLE
  "Comerica Park": { orientation: 5, roof: false }, // DET
  "Guaranteed Rate Field": { orientation: 5, roof: false }, // CHW
  "Angel Stadium": { orientation: 25, roof: false }, // LAA
  "Oakland Coliseum": { orientation: 10, roof: false }, // OAK
  "Sutter Health Park": { orientation: 15, roof: false }, // OAK (Sacramento)
  "Nationals Park": { orientation: 5, roof: false }, // WSH
  "Citi Field": { orientation: 5, roof: false }, // NYM
};

/**
 * Compute wind boost signal for HR props.
 *
 * Replicates frontend isHrFavorable() + windDescription() logic exactly.
 * windDeg: direction wind is coming FROM (Open-Meteo winddirection_10m, 0–359°)
 * windSpd: wind speed in mph
 * venueName: full venue name string (matches PARK_WIND_MAP keys)
 * temp: temperature in °F
 *
 * Returns:
 *   windBoost:   +1 (out, favorable) | -1 (in, suppressing) | 0 (neutral/calm/dome)
 *   windContext: human-readable string, e.g. "12 mph OUT to CF — favorable for HRs"
 */
function computeWindBoost(windDeg, windSpd, venueName, temp = 72) {
  const park = PARK_WIND_MAP[venueName];

  // Dome or unknown venue — wind irrelevant
  if (!park || park.roof) {
    return { windBoost: 0, windContext: "Dome — wind irrelevant" };
  }

  // Calm wind — no meaningful signal
  if (windSpd < 3) {
    return { windBoost: 0, windContext: `${Math.round(windSpd)} mph — Calm` };
  }

  const orientation = park.orientation;
  const blowingToDeg = ((windDeg + 180) + 360) % 360;
  const rel = ((blowingToDeg - orientation) + 360) % 360;

  // Direction label (matches frontend windDescription exactly)
  let dirLabel;
  if (rel >= 315 || rel < 45) dirLabel = "OUT to CF";
  else if (rel >= 45 && rel < 135) dirLabel = "OUT to RF";
  else if (rel >= 135 && rel < 225) dirLabel = "IN from CF";
  else dirLabel = "OUT to LF";

  const windOut = rel >= 315 || rel < 135; // any outward direction

  // Boost: must be blowing out + meaningful speed + not freezing
  if (windOut && windSpd >= 6 && temp >= 65) {
    return {
      windBoost: 1,
      windContext: `${Math.round(windSpd)} mph ${dirLabel} — favorable for HRs`,
    };
  }

  // Penalty: blowing in with meaningful speed
  if (!windOut && windSpd >= 8) {
    return {
      windBoost: -1,
      windContext: `${Math.round(windSpd)} mph ${dirLabel} — suppresses HRs`,
    };
  }

  // Neutral: blowing out but too slow/cold, or crosswind
  return {
    windBoost: 0,
    windContext: `${Math.round(windSpd)} mph ${dirLabel} — neutral`,
  };
}

module.exports = { PARK_WIND_MAP, computeWindBoost };
