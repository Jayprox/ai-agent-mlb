require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const cache   = require("./services/cache");
const picksRouter = require("./routes/picks");
const notesRouter = require("./routes/notes");
const digest = require("./routes/digest");
const injuriesRouter = require("./routes/injuries");

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
app.use("/api/splits",   require("./routes/splits"));   // Baseball Savant: batter vs pitch type
app.use("/api/bullpen",  require("./routes/bullpen"));  // MLB Stats: bullpen fatigue + reliever list
app.use("/api/picks",    picksRouter);                  // Local JSON-backed pick log
app.use("/api/notes",    notesRouter);                  // Local JSON-backed game notes
app.use("/api/digest",   digest);                       // Local JSON-backed 7-day pick digest
app.use("/api/injuries", injuriesRouter);               // MLB Stats: recent IL / DL placements

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

// ── 404 + error handlers ─────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n⚾  Prop Scout API  →  http://localhost:${PORT}`);
  console.log(`   /health              server status + cache`);
  console.log(`   /api/schedule        today's games + probable pitchers`);
  console.log(`   /api/lineups/:pk     confirmed batting order`);
  console.log(`   /api/players/:id/stats  season stats + splits`);
  console.log(`   /api/players/:id/gamelog recent pitching/hitting logs`);
  console.log(`   /api/umpires/:pk     home plate umpire`);
  console.log(`   /api/arsenal/:id     pitcher pitch mix (Baseball Savant)`);
  console.log(`   /api/splits/:id      batter splits vs pitch type (Baseball Savant)`);
  console.log(`   /api/bullpen/:id     bullpen fatigue + reliever list`);
  console.log(`   /api/picks           local pick log CRUD`);
  console.log(`   /api/notes/:gamePk   local game notes CRUD`);
  console.log(`   /api/digest          7-day pick digest summary`);
  console.log(`   /api/injuries        recent injured-list placements\n`);
});
