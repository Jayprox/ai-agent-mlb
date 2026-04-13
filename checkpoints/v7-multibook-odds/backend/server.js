require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const cache   = require("./services/cache");

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
  console.log(`   /api/umpires/:pk     home plate umpire\n`);
});
