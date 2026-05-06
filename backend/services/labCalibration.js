const fs = require("fs/promises");
const path = require("path");
const { query, isConnected } = require("./db");

const DATA_DIR = path.join(__dirname, "..", "data");
const LOG_PATH = path.join(DATA_DIR, "lab-outcomes.json");

// ── JSON fallback helpers (unchanged from original) ───────────────────────────
async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readLogJson() {
  try {
    const raw = await fs.readFile(LOG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    console.warn(`labCalibration read failed: ${err.message}`);
    return [];
  }
}

async function writeLogJson(entries) {
  await ensureDataDir();
  const tmpPath = `${LOG_PATH}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(entries, null, 2));
  await fs.rename(tmpPath, LOG_PATH);
}

// ── DB helpers ────────────────────────────────────────────────────────────────
function rowToEntry(row) {
  return {
    id:          row.id,
    gamePk:      row.game_pk,
    date:        row.date,
    model:       row.model,
    leanSide:    row.lean_side,
    leanProb:    row.lean_prob != null ? Number(row.lean_prob) : null,
    leanEdge:    row.lean_edge != null ? Number(row.lean_edge) : null,
    hasEdge:     row.has_edge,
    subjectKey:  row.subject_key,
    bookLine:    row.book_line != null ? Number(row.book_line) : null,
    bookTotal:   row.book_total != null ? Number(row.book_total) : null,
    result:      row.result,
    resolvedAt:  row.resolved_at,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────
async function readLog() {
  if (isConnected()) {
    const r = await query(
      "SELECT * FROM lab_outcomes ORDER BY created_at ASC"
    );
    return (r?.rows ?? []).map(rowToEntry);
  }
  return readLogJson();
}

async function appendEntry(entry) {
  if (isConnected()) {
    await query(
      `INSERT INTO lab_outcomes
         (id, game_pk, date, model, lean_side, lean_prob, lean_edge,
          has_edge, subject_key, book_line, book_total, result, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO NOTHING`,
      [
        entry.id,
        entry.gamePk ?? null,
        entry.date ?? null,
        entry.model ?? null,
        entry.leanSide ?? null,
        entry.leanProb ?? null,
        entry.leanEdge ?? null,
        entry.hasEdge ?? false,
        entry.subjectKey ?? null,
        entry.bookLine ?? null,
        entry.bookTotal ?? null,
        entry.result ?? null,
        entry.resolvedAt ?? null,
      ]
    );
    return true;
  }
  // JSON fallback
  const entries = await readLogJson();
  if (entries.some(e => e.id === entry.id)) return false;
  entries.push(entry);
  await writeLogJson(entries);
  return true;
}

async function resolveEntry(id, result) {
  if (isConnected()) {
    await query(
      `UPDATE lab_outcomes SET result = $1, resolved_at = NOW() WHERE id = $2`,
      [result, id]
    );
    return true;
  }
  // JSON fallback
  const entries = await readLogJson();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return false;
  entries[idx] = { ...entries[idx], result, resolvedAt: new Date().toISOString() };
  await writeLogJson(entries);
  return true;
}

// writeLog: used internally — keep for compatibility but prefer targeted updates
async function writeLog(entries) {
  if (isConnected()) {
    // In DB mode, writeLog is a no-op — use appendEntry/resolveEntry instead
    return;
  }
  await writeLogJson(entries);
}

module.exports = { readLog, writeLog, appendEntry, resolveEntry, LOG_PATH };
