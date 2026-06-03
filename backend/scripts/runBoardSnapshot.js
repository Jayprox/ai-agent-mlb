#!/usr/bin/env node
/**
 * One-shot: build today's shared board + AI edges (same as midnight Wave 1 AI step).
 * Usage (from repo root): npm run snapshot:today
 *
 * Requires backend/.env with DATABASE_URL and ANTHROPIC_API_KEY.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { bootstrapDatabaseEnv } = require("../lib/bootstrapEnv");
bootstrapDatabaseEnv();

function requireEnv(name, hint) {
  if (process.env[name]) return;
  console.error(`\n  ✗ ${name} is not set.`);
  if (hint) console.error(`    ${hint}\n`);
  process.exit(1);
}

if (process.env.DATABASE_URL?.includes("railway.internal") && !process.env.DATABASE_PUBLIC_URL) {
  console.error("\n  ✗ DATABASE_URL points at postgres.railway.internal — set DATABASE_PUBLIC_URL in backend/.env\n");
  process.exit(1);
}

requireEnv(
  "DATABASE_URL",
  "Copy backend/.env.example → backend/.env and set your Postgres URL (Railway, local, etc.)."
);
requireEnv(
  "ANTHROPIC_API_KEY",
  "Board snapshots and card summaries are written via Haiku during this job."
);

const db = require("../services/db");
if (!db.isConnected()) {
  console.error("\n  ✗ DATABASE_URL was set but PostgreSQL pool did not start.\n");
  process.exit(1);
}

const { runNewSlateDay } = require("../jobs/runNewSlateDay");

async function main() {
  try {
    await db.query("SELECT 1");
  } catch (err) {
    console.error("\n  ✗ Cannot reach PostgreSQL:", err.message);
    console.error("    If you use Railway from your Mac, DATABASE_URL must be the PUBLIC URL");
    console.error("    (DATABASE_PUBLIC_URL value), not postgres.railway.internal.\n");
    process.exit(1);
  }

  const result = await runNewSlateDay();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
