require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");
const cache   = require("./services/cache");
const authRouter = require("./routes/auth");
const picksRouter = require("./routes/picks");
const notesRouter = require("./routes/notes");
const digestRouter = require("./routes/digest");

// Required env vars: ODDS_API_KEY, JWT_SECRET
// Optional: DATABASE_URL (falls back to flat JSON)
const app  = express();
const PORT = process.env.PORT ?? 3001;

// ── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: "*" }));   // open for local dev; tighten for production
app.use(express.json());

// Simple request logger
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString().slice(11, 19)}  ${req.method} ${req.path}`);
  next();
});

// ── Routes ───────────────────────────────────────────────────
app.use("/api/schedule", require("./routes/schedule"));
app.use("/api/lineups",  require("./routes/lineups"));
app.use("/api/players",  require("./routes/players"));
app.use("/api/umpires",  require("./routes/umpires"));
app.use("/api/arsenal",  require("./routes/arsenal"));  // Baseball Savant: pitcher pitch mix
app.use("/api/splits",          require("./routes/splits"));        // Baseball Savant: batter vs pitch type
app.use("/api/pitcher-splits",  require("./routes/pitcherSplits")); // Baseball Savant: pitcher vs LHH/RHH
app.use("/api/nrfi",     require("./routes/nrfi"));     // MLB Stats: first-inning team scoring tendencies
app.use("/api/injuries",  require("./routes/injuries"));  // MLB Stats: recent IL placements (last 14 days)
app.use("/api/bullpen",   require("./routes/bullpen"));   // MLB Stats: bullpen fatigue + reliever usage
app.use("/api/linescore", require("./routes/linescore")); // MLB Stats: live score + inning for in-progress games
app.use("/api/boxscore",    require("./routes/boxscore"));    // MLB Stats: full game boxscore for live + final games
app.use("/api/stat-splits", require("./routes/statSplits")); // MLB Stats: home/away + vs L/R + day/night splits
app.use("/api/trends",   require("./routes/trends"));    // Anthropic: AI-generated bettor trend summary per game
app.use("/api/odds",         require("./routes/odds"));         // Odds API: h2h + totals + spreads for all MLB games (shared 20-min cache)
app.use("/api/props",        require("./routes/props"));        // Anthropic: AI-generated prop recommendations per game
app.use("/api/player-props", require("./routes/playerProps")); // Odds API: sportsbook player prop lines per game (shared 10-min cache)
app.use("/api/auth",      authRouter);
app.use("/api/picks",    picksRouter);
app.use("/api/notes",    notesRouter);
app.use("/api/digest",   digestRouter);

// Health check — also shows cache state
app.get("/health", (_req, res) => {
  res.json({
    ok:    true,
    ts:    new Date().toISOString(),
    cache: cache.stats(),
  });
});

// Clear cache manually (useful during dev)
app.delete("/api/cache", (_req, res) => {
  cache.clear();
  res.json({ ok: true, message: "Cache cleared" });
});

app.get("/api/admin/jobs/run", async (req, res) => {
  if (req.headers["x-admin-secret"] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { snapshotSlate, snapshotOdds } = require("./jobs/snapshotJobs");
  await snapshotSlate();
  await snapshotOdds();
  res.json({ ok: true, ran: ["snapshotSlate", "snapshotOdds"] });
});

// ── Static frontend (production only) ────────────────────────
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "..", "dist");
  app.use(express.static(distPath));
  // SPA fallback — serve index.html for all non-API routes
  app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

// ── 404 + error handlers ─────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────
if (process.env.NODE_ENV === "production" || process.env.ENABLE_JOBS === "true") {
  const { startScheduler } = require("./jobs/scheduler");
  startScheduler();
}

app.listen(PORT, () => {
  console.log(`\n⚾  Prop Scout API  →  http://localhost:${PORT}`);
  console.log(`   /health              server status + cache`);
  console.log(`   /api/schedule        today's games + probable pitchers`);
  console.log(`   /api/lineups/:pk     confirmed batting order`);
  console.log(`   /api/players/:id/stats  season stats + splits`);
  console.log(`   /api/umpires/:pk     home plate umpire`);
  console.log(`   /api/arsenal/:id     pitcher pitch mix (Baseball Savant)`);
  console.log(`   /api/splits/:id      batter splits vs pitch type (Baseball Savant)`);
  console.log(`   /api/nrfi/:gamePk    first-inning scoring tendencies`);
  console.log(`   /api/bullpen/:id     bullpen fatigue + reliever usage\n`);
  console.log(`   /api/auth/login     POST — login, returns JWT`);
  console.log(`   /api/auth/me        GET  — current user (protected)`);
  console.log(`   /api/picks          user-scoped pick log CRUD`);
  console.log(`   /api/notes/:gamePk  user-scoped game notes`);
  console.log(`   /api/digest         user-scoped 7-day pick digest\n`);
  console.log(`   /api/admin/jobs/run GET  — admin trigger for snapshot jobs\n`);
});
