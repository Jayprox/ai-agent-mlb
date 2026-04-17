const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

const USERS = [
  { id: "user1",  username: "fastballzoro",   password: "password123" },
  { id: "user2",  username: "sliderpikachu",  password: "password456" },
  { id: "user3",  username: "cleanupgojo",    password: "password789" },
  { id: "user4",  username: "closertanjiro",  password: "password234" },
  { id: "user5",  username: "leadoffluffy",   password: "password345" },
  { id: "user6",  username: "fastballsanji",  password: "password987" },
  { id: "user7",  username: "cleanupgengar",  password: "password321" },
  { id: "user8",  username: "slidernobara",   password: "password432" },
  { id: "user9",  username: "closernezuko",   password: "password765" },
  { id: "user10", username: "leadoffkaiba",   password: "password098" },
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
