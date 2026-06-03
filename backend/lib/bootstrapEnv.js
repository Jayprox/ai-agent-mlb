/**
 * Local dev: Railway private DATABASE_URL (postgres.railway.internal) only works
 * inside Railway. Swap to DATABASE_PUBLIC_URL before any pg pool is created.
 */
function bootstrapDatabaseEnv() {
  const url = process.env.DATABASE_URL;
  if (!url?.includes("railway.internal")) return;
  if (process.env.DATABASE_PUBLIC_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
    if (!process.env._DB_PUBLIC_URL_BOOTSTRAP) {
      console.log("  · Local dev: using DATABASE_PUBLIC_URL (railway.internal is not reachable from your Mac)");
      process.env._DB_PUBLIC_URL_BOOTSTRAP = "1";
    }
  } else if (process.env.NODE_ENV !== "production") {
    console.warn(
      "  ⚠ DATABASE_URL uses postgres.railway.internal but DATABASE_PUBLIC_URL is not set.\n" +
      "    DB reads/writes from your Mac will fail. Copy DATABASE_PUBLIC_URL from Railway → Postgres → Variables."
    );
  }
}

function pgSslOption(connectionString) {
  if (process.env.PGSSL === "false") return false;
  if (process.env.NODE_ENV === "production") return { rejectUnauthorized: false };
  if (/railway\.app|rlwy\.net|neon\.tech|supabase\.co/i.test(connectionString || "")) {
    return { rejectUnauthorized: false };
  }
  return false;
}

module.exports = { bootstrapDatabaseEnv, pgSslOption };
