const cron = require("node-cron");
const { query, isConnected } = require("../services/db");
const {
  snapshotSlate, snapshotOdds, snapshotBullpen,
  snapshotLinescore, snapshotUmpires, todayHonolulu,
} = require("./snapshotJobs");

async function getTodayGamePks() {
  if (!isConnected()) return [];
  const date = todayHonolulu();
  try {
    const result = await query("SELECT games FROM slate_snapshots WHERE slate_date = $1", [date]);
    const games = result?.rows?.[0]?.games ?? [];
    return games.map((g) => g.gamePk).filter(Boolean);
  } catch (err) {
    console.warn(`Scheduler slate lookup skipped: ${err.message}`);
    return [];
  }
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
}

module.exports = { startScheduler };
