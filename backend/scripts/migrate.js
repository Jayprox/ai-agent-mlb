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
  const sql = fs.readFileSync(path.join(__dirname, "../migrations/001_init.sql"), "utf8");
  await query(sql);
  console.log("✅ Migrations applied");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
