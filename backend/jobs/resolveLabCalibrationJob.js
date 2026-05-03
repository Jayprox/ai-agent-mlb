const axios = require("axios");
const { readLog, resolveEntry } = require("../services/labCalibration");

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

async function fetchBoxForCalibration(gamePk) {
  try {
    const [bsRes, lsRes] = await Promise.all([
      axios.get(`${MLB_BASE}/game/${gamePk}/boxscore`, { timeout: 10000 }),
      axios.get(`${MLB_BASE}/game/${gamePk}/linescore`, { timeout: 10000 }),
    ]);
    const bs = bsRes.data;
    const ls = lsRes.data;
    const inningsPlayed = (ls.innings ?? []).length;
    const isFinal = (inningsPlayed > 0 && !ls.currentInning)
      || ls.abstractGameState === "Final";
    if (!isFinal) return null;

    const innings = (ls.innings ?? []).map(i => ({
      away: i.away?.runs ?? 0,
      home: i.home?.runs ?? 0,
    }));
    const awayRuns = ls.teams?.away?.runs ?? 0;
    const homeRuns = ls.teams?.home?.runs ?? 0;

    const parsePitchers = (players) =>
      Object.values(players ?? {})
        .filter(p => p.stats?.pitching?.inningsPitched)
        .map(p => ({
          name: p.person?.fullName ?? "",
          k: p.stats.pitching.strikeOuts ?? 0,
        }));

    return {
      innings,
      awayRuns,
      homeRuns,
      pitching: {
        away: parsePitchers(bs.teams?.away?.players),
        home: parsePitchers(bs.teams?.home?.players),
      },
    };
  } catch (_) {
    return null;
  }
}

function gradeEntry(entry, box) {
  const { model, leanSide, subjectKey, bookLine, bookTotal, pitcherLastName } = entry;

  if (model === "f5ml") {
    const f5 = box.innings.slice(0, 5);
    const f5Away = f5.reduce((s, i) => s + i.away, 0);
    const f5Home = f5.reduce((s, i) => s + i.home, 0);
    if (f5Away === f5Home) return "PUSH";
    const leanWon = leanSide === "away" ? f5Away > f5Home : f5Home > f5Away;
    return leanWon ? "HIT" : "MISS";
  }

  if (model === "fullgame") {
    if (box.awayRuns === box.homeRuns) return "PUSH";
    const leanWon = leanSide === "away" ? box.awayRuns > box.homeRuns : box.homeRuns > box.awayRuns;
    return leanWon ? "HIT" : "MISS";
  }

  if (model === "kprop") {
    if (bookLine == null || !pitcherLastName || !subjectKey) return null;
    const pitcherSide = subjectKey;
    const lastName = pitcherLastName.toLowerCase();
    const pitcher = (box.pitching[pitcherSide] ?? [])
      .find(p => p.name.toLowerCase().includes(lastName));
    const actualKs = pitcher?.k ?? null;
    if (actualKs == null) return null;
    if (actualKs === bookLine) return "PUSH";
    return (leanSide === "OVER" ? actualKs > bookLine : actualKs < bookLine) ? "HIT" : "MISS";
  }

  if (model === "totals") {
    if (bookTotal == null) return null;
    const actualTotal = box.awayRuns + box.homeRuns;
    if (actualTotal === bookTotal) return "PUSH";
    return (leanSide === "OVER" ? actualTotal > bookTotal : actualTotal < bookTotal) ? "HIT" : "MISS";
  }

  return null;
}

async function resolveLabCalibration() {
  console.log("  → resolveLabCalibration: starting sweep");
  const entries = await readLog();
  const unresolved = entries.filter(e => e.result === null || e.result === undefined);

  if (!unresolved.length) {
    console.log("  ✓ resolveLabCalibration: nothing to resolve");
    return { resolved: 0, skipped: 0 };
  }

  const byGame = {};
  for (const entry of unresolved) {
    if (!byGame[entry.gamePk]) byGame[entry.gamePk] = [];
    byGame[entry.gamePk].push(entry);
  }

  let resolved = 0;
  let skipped = 0;

  for (const [gamePk, gameEntries] of Object.entries(byGame)) {
    const box = await fetchBoxForCalibration(gamePk);
    if (!box) {
      console.log(`  · resolveLabCalibration: gamePk ${gamePk} not final yet, skipping`);
      skipped += gameEntries.length;
      continue;
    }

    for (const entry of gameEntries) {
      const grade = gradeEntry(entry, box);
      if (grade == null) {
        console.log(`  · resolveLabCalibration: ${entry.id} — unable to grade (missing fields)`);
        skipped++;
        continue;
      }
      await resolveEntry(entry.id, grade);
      console.log(`  ✓ resolveLabCalibration: ${entry.id} → ${grade}`);
      resolved++;
    }
  }

  console.log(`  ✓ resolveLabCalibration: resolved=${resolved} skipped=${skipped}`);
  return { resolved, skipped };
}

module.exports = { resolveLabCalibration };
