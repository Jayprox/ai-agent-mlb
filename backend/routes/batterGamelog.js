const mlb = require("../services/mlbApi");
const cache = require("../services/cache");

const SEASON = new Date().getFullYear();
const GAMELOG_TTL = 24 * 60 * 60 * 1000; // 24h
const TODAY = () => new Date().toISOString().slice(0, 10);

async function fetchBatterRecentForm(batterId) {
  if (!batterId) return null;

  const cacheKey = `gamelog-form:${batterId}:${TODAY()}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached; // null is a valid cached value

  try {
    console.log(`  → Batter Gamelog  batterId=${batterId}`);
    const { data } = await mlb.get(`/people/${batterId}/stats`, {
      params: { stats: "gameLog", group: "hitting", season: SEASON, limit: 15 },
    });

    const splits = data.stats?.[0]?.splits ?? [];
    if (!splits.length) {
      console.log(`  · No gamelog splits  batterId=${batterId}`);
      cache.set(cacheKey, null, GAMELOG_TTL);
      return null;
    }

    // Take up to the last 15 games (splits are newest-first from MLB API)
    const games = splits.slice(0, 15);

    // Aggregate totals
    let hrLast15 = 0;
    let abLast15 = 0;
    let hLast15 = 0;

    // Hot streak: 2+ HR in last 7 games
    let hrLast7 = 0;

    const recentGames = games.map((g, idx) => {
      const stat = g.stat ?? {};
      const hr = parseInt(stat.homeRuns, 10) || 0;
      const ab = parseInt(stat.atBats, 10) || 0;
      const h = parseInt(stat.hits, 10) || 0;

      hrLast15 += hr;
      abLast15 += ab;
      hLast15 += h;
      if (idx < 7) hrLast7 += hr;

      return {
        date: g.date ?? null,
        homeRuns: hr,
        hits: h,
        atBats: ab,
      };
    });

    // Derived signals
    const hotStreak = hrLast7 >= 2;
    const recentAvg = abLast15 > 0 ? hLast15 / abLast15 : 0;
    const coldStreak = hrLast15 === 0 && recentAvg < 0.200;

    // HRs per 15 AB (normalized rate — handles players with fewer ABs gracefully)
    const hrPer15AB = abLast15 > 0
      ? Math.round((hrLast15 / abLast15) * 15 * 100) / 100
      : null;

    const form = {
      last15Games: games.length,
      hrLast15,
      abLast15,
      hrPer15AB,
      hotStreak,
      coldStreak,
      recentGames,
    };

    console.log(`  ✓ Batter Gamelog  batterId=${batterId} hrLast15=${hrLast15} hot=${hotStreak} cold=${coldStreak}`);
    cache.set(cacheKey, form, GAMELOG_TTL);
    return form;
  } catch (err) {
    console.warn(`  ✗ Batter Gamelog fetch failed  batterId=${batterId}  ${err.message}`);
    cache.set(cacheKey, null, GAMELOG_TTL);
    return null;
  }
}

module.exports = { fetchBatterRecentForm };
