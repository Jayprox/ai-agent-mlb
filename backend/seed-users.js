const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

const USERS = [
  { id: "user1", username: "jd", password: "changeme1" },
  { id: "user2", username: "friend1", password: "changeme2" },
  { id: "user3", username: "friend2", password: "changeme3" },
  { id: "user4", username: "friend3", password: "changeme4" },
  { id: "user5", username: "friend4", password: "changeme5" },
  { id: "user6", username: "friend5", password: "changeme6" },
  { id: "user7", username: "friend6", password: "changeme7" },
  { id: "user8", username: "friend7", password: "changeme8" },
  { id: "user9", username: "friend8", password: "changeme9" },
  { id: "user10", username: "friend9", password: "changeme10" },
];

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SALT_ROUNDS = 10;

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const hashedUsers = [];
  for (const user of USERS) {
    hashedUsers.push({
      id: user.id,
      username: user.username,
      passwordHash: await bcrypt.hash(user.password, SALT_ROUNDS),
    });
  }

  fs.writeFileSync(USERS_FILE, JSON.stringify(hashedUsers, null, 2));
  console.log(`✅ users.json written with ${hashedUsers.length} accounts`);
}

main().catch((err) => {
  console.error("Failed to seed users:", err);
  process.exit(1);
});
