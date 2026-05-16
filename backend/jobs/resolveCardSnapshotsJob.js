const axios = require("axios");
const { query, isConnected } = require("../services/db");

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

function parseIpToOuts(ip) {
  if (!ip) return 0;
  const [inn, thirds] = String(ip).split(".").map(Number);
  return (inn || 0) * 3 + (thirds || 0);
}

function normalizeName(s) {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchBoxForGrading(gamePk) {
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

    const parseBatters = (players) => Object.values(players ?? {})
      .filter((p) => p.stats?.batting)
      .map((p) => {
        const s = p.stats.batting;
        return { id: p.person?.id, name: p.person?.fullName ?? "", h: s.hits ?? 0, hr: s.homeRuns ?? 0, rbi: s.rbi ?? 0, ab: s.atBats ?? 0, tb: s.totalBases ?? undefined };
      })
      .filter((b) => b.ab > 0 || b.h > 0);

    const parsePitchers = (players) => Object.values(players ?? {})
      .filter((p) => p.stats?.pitching?.inningsPitched)
      .map((p) => {
        const s = p.stats.pitching;
        return { name: p.person?.fullName ?? "", k: s.strikeOuts ?? 0, ip: s.inningsPitched ?? "0.0" };
      });

    return {
      isFinal: true,
      linescore: {
        innings: (ls.innings ?? []).map((i) => ({ away: i.away?.runs ?? 0, home: i.home?.runs ?? 0 })),
        away: { runs: ls.teams?.away?.runs ?? 0 },
        home: { runs: ls.teams?.home?.runs ?? 0 },
      },
      batting: {
        away: parseBatters(bs.teams?.away?.players),
        home: parseBatters(bs.teams?.home?.players),
      },
      pitching: {
        away: parsePitchers(bs.teams?.away?.players),
        home: parsePitchers(bs.teams?.home?.players),
      },
    };
  } catch (_) { return null; }
}

function findPitcher(box, nameRaw) {
  const all = [...(box.pitching?.away ?? []), ...(box.pitching?.home ?? [])];
  const normalized = normalizeName(nameRaw);
  const lastName = normalized.split(" ").pop();
  return (
    all.find((p) => normalizeName(p.name) === normalized) ??
    all.find((p) => normalizeName(p.name).includes(normalized)) ??
    all.find((p) => normalizeName(p.name).includes(lastName)) ??
    null
  );
}

function findBatter(box, nameRaw) {
  const all = [...(box.batting?.away ?? []), ...(box.batting?.home ?? [])];
  const normalized = normalizeName(nameRaw);
  const lastName = normalized.split(" ").pop();
  return (
    all.find((p) => normalizeName(p.name) === normalized) ??
    all.find((p) => normalizeName(p.name).includes(normalized)) ??
    all.find((p) => normalizeName(p.name).includes(lastName)) ??
    null
  );
}

function resolveCard(row, box) {
  const { market, lean, book_line: bookLine, card_data: cardData } = row;
  if (bookLine == null) return null;

  const leanNorm = String(lean ?? "").toLowerCase();
  const isOver = leanNorm === "over";
  const isUnder = leanNorm === "under";
  if (!isOver && !isUnder) return null;

  const name = cardData?.name ?? "";

  if (market === "k" || market === "outs") {
    const pitcher = findPitcher(box, name);
    if (!pitcher) return null;

    const lineNum = Number(bookLine);
    if (market === "k") {
      const actual = pitcher.k;
      const hit = isOver ? actual > lineNum : actual < lineNum;
      return { resultHit: hit, actualStat: actual };
    }
    const actual = parseIpToOuts(pitcher.ip);
    const hit = isOver ? actual > lineNum : actual < lineNum;
    return { resultHit: hit, actualStat: actual };
  }

  if (market === "hits" || market === "hr") {
    const batter = findBatter(box, name);
    if (!batter) return null;

    const lineNum = Number(bookLine);
    if (market === "hits") {
      const actual = batter.h;
      const hit = isOver ? actual > lineNum : actual < lineNum;
      return { resultHit: hit, actualStat: actual };
    }
    const actual = batter.hr;
    let hit;
    if (lineNum <= 0.5) {
      hit = actual >= 1;
    } else {
      hit = isOver ? actual > lineNum : actual < lineNum;
    }
    return { resultHit: hit, actualStat: actual };
  }

  return null;
}

async function resolveCardSnapshots(date) {
  if (!date) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    date = yesterday.toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  }

  if (!isConnected()) {
    console.log(`  · resolveCardSnapshots: db unavailable, skipping ${date}`);
    return { date, resolved: 0, skipped: 0 };
  }

  let rows;
  try {
    rows = await query(
      `SELECT id, game_pk, market, lean, score_tier, book_line, card_data
       FROM board_card_snapshots
       WHERE slate_date = $1 AND resolved_at IS NULL`,
      [date]
    );
  } catch (err) {
    console.warn(`  ⚠ resolveCardSnapshots query failed: ${err.message}`);
    return { date, resolved: 0, skipped: 0 };
  }

  if (!rows?.rows?.length) {
    console.log(`  · resolveCardSnapshots: nothing to resolve for ${date}`);
    return { date, resolved: 0, skipped: 0 };
  }

  const byGame = {};
  for (const row of rows.rows) {
    const key = String(row.game_pk);
    if (!byGame[key]) byGame[key] = [];
    byGame[key].push(row);
  }

  let resolved = 0;
  let skipped = 0;

  for (const [gamePkStr, gameRows] of Object.entries(byGame)) {
    let box;
    try {
      box = await fetchBoxForGrading(gamePkStr);
    } catch (err) {
      console.warn(`  ⚠ resolveCardSnapshots boxscore failed ${gamePkStr}: ${err.message}`);
      skipped += gameRows.length;
      continue;
    }
    if (!box) {
      skipped += gameRows.length;
      continue;
    }

    for (const row of gameRows) {
      const outcome = resolveCard(row, box);
      if (!outcome) {
        skipped++;
        continue;
      }

      try {
        const ur = await query(
          `UPDATE board_card_snapshots
           SET result_hit = $1, actual_stat = $2, resolved_at = NOW()
           WHERE id = $3`,
          [outcome.resultHit, outcome.actualStat, row.id]
        );
        if (ur && ur.rowCount > 0) resolved++;
        else skipped++;
      } catch (err) {
        console.warn(`  ⚠ resolveCardSnapshots update failed: ${err.message}`);
        skipped++;
      }
    }
  }

  console.log(`  ✓ resolveCardSnapshots: date=${date} resolved=${resolved} skipped=${skipped}`);
  return { date, resolved, skipped };
}

module.exports = { resolveCardSnapshots };
