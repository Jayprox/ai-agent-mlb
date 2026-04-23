const cron = require("node-cron");
const { query, isConnected } = require("../services/db");
const {
  snapshotSlate, snapshotOdds, snapshotBullpen,
  snapshotLinescore, snapshotUmpires, todayHonolulu,
} = require("./snapshotJobs");
const { warmCache } = require("./warmCache");
const { regenerateDailyCard } = require("../routes/dailyCard");

let _pregameRan = { date: null };

async function getTodayGames() {
  if (!isConnected()) return [];
  const date = todayHonolulu();
  try {
    const result = await query("SELECT games FROM slate_snapshots WHERE slate_date = $1", [date]);
    return result?.rows?.[0]?.games ?? [];
  } catch (err) {
    console.warn(`Scheduler slate lookup skipped: ${err.message}`);
    return [];
  }
}

async function getTodayGamePks() {
  const games = await getTodayGames();
  return games.map((g) => g.gamePk).filter(Boolean);
}

async function getInProgressGamePks() {
  if (!isConnected()) return [];
  const date = todayHonolulu();
  try {
    const result = await query("SELECT games FROM slate_snapshots WHERE slate_date = $1", [date]);
    const games = result?.rows?.[0]?.games ?? [];
    return games.filter((g) => {
      const state = g.status?.detailedState ?? g.status;
      return state === "In Progress" || state === "Warmup";
    }).map((g) => g.gamePk);
  } catch (err) {
    console.warn(`Scheduler in-progress lookup skipped: ${err.message}`);
    return [];
  }
}

function startScheduler() {
  console.log("  ✓ Job scheduler started");

  cron.schedule("0 8 * * *", () => snapshotSlate(), { timezone: "Pacific/Honolulu" });
  cron.schedule("*/15 * * * *", () => snapshotOdds());
  cron.schedule("*/30 * * * *", async () => {
    const gamePks = await getTodayGamePks();
    for (const pk of gamePks) await snapshotBullpen(pk);
  });
  cron.schedule("* * * * *", async () => {
    const gamePks = await getInProgressGamePks();
    for (const pk of gamePks) await snapshotLinescore(pk);
  });
  cron.schedule("0 10 * * *", async () => {
    const gamePks = await getTodayGamePks();
    for (const pk of gamePks) await snapshotUmpires(pk);
  }, { timezone: "Pacific/Honolulu" });

  cron.schedule("0 9 * * *", async () => {
    try {
      await regenerateDailyCard();
    } catch (err) {
      console.warn(`Daily Card morning run failed: ${err.message}`);
    }
  }, { timezone: "Pacific/Honolulu" });

  cron.schedule("*/5 8-16 * * *", async () => {
    const today = todayHonolulu();
    if (_pregameRan.date === today) return;

    try {
      const games = await getTodayGames();
      const earliestMs = games
        .map((g) => Date.parse(g.gameTime))
        .filter((ts) => Number.isFinite(ts))
        .sort((a, b) => a - b)[0];

      if (!earliestMs) return;

      const triggerAt = earliestMs - (95 * 60 * 1000);
      if (Date.now() < triggerAt) return;

      await regenerateDailyCard();
      _pregameRan.date = today;
      console.log(`  ✓ Daily Card pregame run completed for ${today}`);
    } catch (err) {
      console.warn(`Daily Card pregame run failed: ${err.message}`);
    }
  }, { timezone: "Pacific/Honolulu" });

  // Pre-warm in-memory cache every 2 hours from 9 AM – 11 PM ET
  // Keeps data hot so the first user to open each game hits cache, not cold fetches
  cron.schedule("0 9,11,13,15,17,19,21,23 * * *", () => warmCache(), { timezone: "America/New_York" });
}

module.exports = { startScheduler };
