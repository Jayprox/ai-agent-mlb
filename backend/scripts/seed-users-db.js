const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { query, isConnected } = require("../services/db");

async function seedUsers() {
  if (!isConnected()) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const usersFile = path.join(__dirname, "../data/users.json");
  const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));

  for (const u of users) {
    await query(
      `INSERT INTO users (id, username, password_hash, preferences)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET username = EXCLUDED.username,
             password_hash = EXCLUDED.password_hash,
             preferences = EXCLUDED.preferences`,
      [
        u.id,
        u.username,
        u.passwordHash,
        JSON.stringify(u.preferences ?? {}),
      ]
    );
    console.log(`  ✓ Seeded user: ${u.username}`);
  }

  console.log("✅ User seed complete");
  process.exit(0);
}

seedUsers().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
