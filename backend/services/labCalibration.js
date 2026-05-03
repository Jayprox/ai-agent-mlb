const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const LOG_PATH = path.join(DATA_DIR, "lab-outcomes.json");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readLog() {
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

async function writeLog(entries) {
  await ensureDataDir();
  const tmpPath = `${LOG_PATH}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(entries, null, 2));
  await fs.rename(tmpPath, LOG_PATH);
}

async function appendEntry(entry) {
  const entries = await readLog();
  if (entries.some(e => e.id === entry.id)) return false;
  entries.push(entry);
  await writeLog(entries);
  return true;
}

async function resolveEntry(id, result) {
  const entries = await readLog();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return false;
  entries[idx] = {
    ...entries[idx],
    result,
    resolvedAt: new Date().toISOString(),
  };
  await writeLog(entries);
  return true;
}

module.exports = {
  readLog,
  writeLog,
  appendEntry,
  resolveEntry,
  LOG_PATH,
};
