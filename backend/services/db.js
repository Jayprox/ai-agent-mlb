const { Pool } = require("pg");

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
  pool.on("error", (err) => console.error("DB pool error:", err.message));
  console.log("  ✓ PostgreSQL connected");
} else {
  console.warn("  ⚠ DATABASE_URL not set — DB layer disabled, using in-memory cache only");
}

async function query(sql, params = []) {
  if (!pool) return null;
  const result = await pool.query(sql, params);
  return result;
}

module.exports = { query, isConnected: () => !!pool };
