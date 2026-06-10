const db = require("./db");

const BOARD_MARKETS = ["k", "outs", "hits", "hr", "nrfi", "total", "spread", "ml", "f5ml", "f5spread"];

async function ensureBoardSnapshotsTable() {
  if (!db.isConnected()) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS board_daily_snapshots (
      slate_date   DATE         NOT NULL,
      market       TEXT         NOT NULL,
      candidates   JSONB        NOT NULL,
      generated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      PRIMARY KEY  (slate_date, market)
    )
  `);
}

async function saveBoardSnapshot(slateDate, market, candidates) {
  if (!db.isConnected()) return false;
  try {
    await ensureBoardSnapshotsTable();
    await db.query(
      `INSERT INTO board_daily_snapshots (slate_date, market, candidates, generated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (slate_date, market) DO UPDATE
         SET candidates = $3, generated_at = NOW()`,
      [slateDate, market, JSON.stringify(candidates ?? [])]
    );
    return true;
  } catch (err) {
    console.warn(`  ⚠ boardSnapshotDb: saveBoardSnapshot failed for ${market}: ${err.message}`);
    return false;
  }
}

async function getSnapshotMarkets(slateDate) {
  if (!db.isConnected()) return new Set();
  try {
    const result = await db.query(
      `SELECT market FROM board_daily_snapshots WHERE slate_date = $1`,
      [slateDate]
    );
    return new Set((result?.rows ?? []).map((row) => row.market));
  } catch (err) {
    console.warn(`  ⚠ boardSnapshotDb: getSnapshotMarkets failed: ${err.message}`);
    return new Set();
  }
}

module.exports = {
  BOARD_MARKETS,
  ensureBoardSnapshotsTable,
  saveBoardSnapshot,
  getSnapshotMarkets,
};
