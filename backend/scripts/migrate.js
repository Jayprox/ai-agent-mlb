const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { query, isConnected } = require("../services/db");

async function migrate() {
  if (!isConnected()) {
    console.error("DATABASE_URL not set — cannot run migrations");
    process.exit(1);
  }
  const migrationsDir = path.join(__dirname, "../migrations");
  const files = ["001_init.sql", "002_picks_users_lab.sql"];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await query(sql);
    console.log(`  ✓ Applied ${file}`);
  }
  console.log("✅ All migrations applied");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
