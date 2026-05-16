const axios = require("axios");
const cache = require("../services/cache");

const SEASON = new Date().getFullYear();
const POWER_TTL = 24 * 60 * 60 * 1000; // 24h — season-level data, no intraday churn
const TODAY = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// Reuse the same headers arsenal.js uses — Savant requires a browser-like UA
const SAVANT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/csv,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://baseballsavant.mlb.com/",
  "X-Requested-With": "XMLHttpRequest",
};

// Identical CSV parser to arsenal.js — copy it verbatim
function parseCSV(text) {
  const cleaned = String(text || "").replace(/^\uFEFF/, "").trim();
  const lines = cleaned.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map(line => {
    const values = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { values.push(cur.trim()); cur = ""; } else cur += ch;
    }
    values.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

async function fetchBatterPowerProfile(batterId) {
  if (!batterId) return null;

  const cacheKey = `batter-power:${batterId}:${TODAY()}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached; // null is a valid cached value (batter has no data)

  const url = [
    `https://baseballsavant.mlb.com/statcast_search/csv`,
    `?hfGT=R%7C`,
    `&hfSea=${SEASON}%7C`,
    `&player_type=batter`,
    `&batters_lookup%5B%5D=${batterId}`,
    `&player_id=${batterId}`,
    `&min_pitches=0`,
    `&min_results=0`,
    `&min_pas=10`,
    `&type=details`,
    `&is_shift_aware=true`,
  ].join("");

  try {
    console.log(`  → Batter Power CSV  batterId=${batterId}`);
    const res = await axios.get(url, { headers: SAVANT_HEADERS, timeout: 15000 });
    const rows = parseCSV(String(res.data));

    if (!rows.length) {
      console.log(`  · No Savant rows  batterId=${batterId}`);
      cache.set(cacheKey, null, POWER_TTL);
      return null;
    }

    const sampleKeys = Object.keys(rows[0]);
    const hasLaunchSpeedAngle = sampleKeys.includes("launch_speed_angle");
    const hasLaunchSpeed = sampleKeys.includes("launch_speed");
    const hasLaunchAngle = sampleKeys.includes("launch_angle");
    const hasBbType = sampleKeys.includes("bb_type");
    const hasEvents = sampleKeys.includes("events");
    const hasPitchType = sampleKeys.includes("pitch_type");
    const hasGameDate = sampleKeys.includes("game_date");

    let battedBalls = 0;
    let barrels = 0;
    let hardHits = 0;
    let evSum = 0;   // exit velo sum (batted balls only)
    let laSum = 0;   // launch angle sum (batted balls only)
    let flyBalls = 0;
    let hrOnFlyBalls = 0;
    const pitchTypeAcc = {};

    rows.forEach(r => {
      if (!hasLaunchSpeedAngle) return;
      const lsa = parseInt(r.launch_speed_angle, 10);
      const ev = parseFloat(r.launch_speed);
      const la = parseFloat(r.launch_angle);

      // lsa 1–6 = any batted ball (Weak, Topped, Under, Flare/Burner, Solid Contact, Barrel)
      if (!isNaN(lsa) && lsa >= 1 && lsa <= 6) {
        battedBalls++;
        if (lsa === 6) barrels++;
        if (hasLaunchSpeed && !isNaN(ev)) {
          if (ev >= 95) hardHits++;
          evSum += ev;
        }
        if (hasPitchType) {
          const pt = (r.pitch_type || "").trim().toUpperCase();
          if (pt && pt !== "PO") {
            if (!pitchTypeAcc[pt]) pitchTypeAcc[pt] = { battedBalls: 0, barrels: 0, hardHits: 0, flyBalls: 0, hrCount: 0 };
            const s = pitchTypeAcc[pt];
            s.battedBalls++;
            if (lsa === 6) s.barrels++;
            if (hasLaunchSpeed && !isNaN(ev) && ev >= 95) s.hardHits++;
            if (hasBbType && r.bb_type === "fly_ball") s.flyBalls++;
            if (hasEvents && r.events === "home_run") s.hrCount++;
          }
        }
        if (hasLaunchAngle && !isNaN(la)) laSum += la;
      }

      // HR/FB rate: only count fly balls (bb_type) and HRs on fly balls
      if (hasBbType && r.bb_type === "fly_ball") {
        flyBalls++;
        if (hasEvents && r.events === "home_run") hrOnFlyBalls++;
      }
    });

    // Require at least 10 batted balls for meaningful percentages
    if (battedBalls < 10) {
      cache.set(cacheKey, null, POWER_TTL);
      return null;
    }

    const pitchTypeSplits = {};
    if (hasPitchType) {
      for (const [abbr, s] of Object.entries(pitchTypeAcc)) {
        if (s.battedBalls >= 15) {
          pitchTypeSplits[abbr] = {
            battedBalls: s.battedBalls,
            hrCount: s.hrCount,
            barrelPct: Math.round((s.barrels / s.battedBalls) * 1000) / 10,
            hardHitPct: Math.round((s.hardHits / s.battedBalls) * 1000) / 10,
            flyBallPct: hasBbType ? Math.round((s.flyBalls / s.battedBalls) * 1000) / 10 : null,
          };
        }
      }
    }

    // ── L7 Exit Velocity ─────────────────────────────────────────
    let recentEv = null;
    if (hasGameDate && hasLaunchSpeed && hasLaunchSpeedAngle) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      let l7BB = 0, l7EvSum = 0, l7HH = 0, l7Barrels = 0;

      rows.forEach(r => {
        if (!r.game_date || r.game_date < cutoffStr) return;
        const lsa = parseInt(r.launch_speed_angle, 10);
        const ev  = parseFloat(r.launch_speed);
        if (!isNaN(lsa) && lsa >= 1 && lsa <= 6) {
          l7BB++;
          if (!isNaN(ev)) {
            l7EvSum += ev;
            if (ev >= 95) l7HH++;
          }
          if (lsa === 6) l7Barrels++;
        }
      });

      if (l7BB >= 5) {
        const evL7 = Math.round((l7EvSum / l7BB) * 10) / 10;
        const seasonEv = hasLaunchSpeed && battedBalls > 0
          ? Math.round((evSum / battedBalls) * 10) / 10
          : null;
        recentEv = {
          evL7,
          bbL7: l7BB,
          hardHitPctL7: Math.round((l7HH     / l7BB) * 1000) / 10,
          barrelPctL7:  Math.round((l7Barrels / l7BB) * 1000) / 10,
          evDelta: seasonEv != null ? Math.round((evL7 - seasonEv) * 10) / 10 : null,
        };
      }
    }

    const profile = {
      barrelPct: Math.round((barrels / battedBalls) * 1000) / 10,
      hardHitPct: Math.round((hardHits / battedBalls) * 1000) / 10,
      avgExitVelo: hasLaunchSpeed ? Math.round((evSum / battedBalls) * 10) / 10 : null,
      avgLaunchAngle: hasLaunchAngle ? Math.round((laSum / battedBalls) * 10) / 10 : null,
      hrFbRate: flyBalls >= 5 ? Math.round((hrOnFlyBalls / flyBalls) * 1000) / 10 : null,
      pitchTypeSplits,
      recentEv,
    };

    console.log(`  ✓ Batter Power  batterId=${batterId} barrel=${profile.barrelPct}% EV=${profile.avgExitVelo} evL7=${profile.recentEv?.evL7 ?? "n/a"}`);
    cache.set(cacheKey, profile, POWER_TTL);
    return profile;
  } catch (err) {
    console.warn(`  ✗ Batter Power fetch failed  batterId=${batterId}  ${err.message}`);
    cache.set(cacheKey, null, POWER_TTL); // cache the failure so we don't hammer Savant on every lineup request
    return null;
  }
}

module.exports = { fetchBatterPowerProfile };
