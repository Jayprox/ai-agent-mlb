const fs = require("fs");
const path = require("path");
const axios = require("axios");

const PICKS_FILE = path.join(__dirname, "..", "data", "picks.json");
const MLB_BASE = "https://statsapi.mlb.com/api/v1";

function readPicks() {
  try {
    const raw = fs.readFileSync(PICKS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.picks) ? parsed.picks : [];
  } catch (_) { return []; }
}

function writePicks(picks) {
  const current = (() => {
    try { return JSON.parse(fs.readFileSync(PICKS_FILE, "utf8")); } catch (_) { return { picks: [] }; }
  })();
  fs.writeFileSync(PICKS_FILE, JSON.stringify({ ...current, picks }, null, 2));
}

function parseIpToOuts(ip) {
  if (!ip) return 0;
  const [inn, thirds] = String(ip).split(".").map(Number);
  return (inn || 0) * 3 + (thirds || 0);
}

function normalizeName(s) {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Ported from prop-scout-v7.jsx computeGrade — keep in sync
function computeGrade(pick, box) {
  if (!box?.isFinal) return null;
  const label = (pick.label ?? "").toUpperCase();
  const lean = (pick.lean ?? "").toUpperCase();
  const innings = box.linescore?.innings ?? [];
  const awayRuns = box.linescore?.away?.runs ?? 0;
  const homeRuns = box.linescore?.home?.runs ?? 0;
  const totalRuns = awayRuns + homeRuns;
  const allBatters = [...(box.batting?.away ?? []), ...(box.batting?.home ?? [])];

  const findBatter = () => {
    const storedId = pick.playerId != null ? String(pick.playerId) : null;
    if (storedId) {
      const byId = allBatters.find((b) => String(b.id) === storedId);
      if (byId) return byId;
    }
    const storedName = normalizeName(pick.playerName);
    if (storedName) {
      const byName = allBatters.find((b) =>
        normalizeName(b.name).includes(storedName) ||
        storedName.includes(normalizeName(b.name).split(" ").pop())
      );
      if (byName) return byName;
    }
    const labelName = normalizeName(label
      .replace(/\bTOTAL BASES\b.*$/, "")
      .replace(/\bHITS\b.*$/, "")
      .replace(/\bRBI\b.*$/, "")
      .replace(/\bHR\b.*$/, "")
      .trim());
    const lastName = labelName.split(" ")[0];
    return allBatters.find((b) => normalizeName(b.name).includes(lastName)) ?? null;
  };
  const findPitcher = () => {
    const allPitchers = [...(box.pitching?.away ?? []), ...(box.pitching?.home ?? [])];
    const storedName = normalizeName(pick.pitcherName);
    if (storedName) {
      const byStored = allPitchers.find((p) => {
        const pname = normalizeName(p.name);
        const plast = pname.split(" ").pop();
        return pname.includes(storedName) || storedName.includes(plast);
      });
      if (byStored) return byStored;
    }

    const labelName = normalizeName(label
      .replace(/\bSTRIKEOUTS?\b.*$/, "")
      .replace(/\bK'S\b.*$/, "")
      .replace(/\bK O\/U\b.*$/, "")
      .replace(/\bOUTS\b.*$/, "")
      .trim());
    if (labelName) {
      const byLabel = allPitchers.find((p) => {
        const pname = normalizeName(p.name);
        const plast = pname.split(" ").pop();
        return pname.includes(labelName) || labelName.includes(pname) || labelName.includes(plast);
      });
      if (byLabel) return byLabel;
    }

    return null;
  };

  if (label.startsWith("NRFI")) {
    const first = innings[0];
    return first ? (((first.away ?? 0) + (first.home ?? 0)) > 0 ? "miss" : "hit") : null;
  }
  if (label.startsWith("YRFI")) {
    const first = innings[0];
    return first ? (((first.away ?? 0) + (first.home ?? 0)) > 0 ? "hit" : "miss") : null;
  }
  if (label.includes("GAME TOTAL") || (label.includes("TOTAL") && (label.includes("OVER") || label.includes("UNDER") || label.includes("O/U")))) {
    const m = label.match(/(\d+\.?\d*)/);
    if (!m) return null;
    const line = parseFloat(m[1]);
    if (lean === "OVER") return totalRuns > line ? "hit" : "miss";
    if (lean === "UNDER") return totalRuns < line ? "hit" : "miss";
    return null;
  }
  if (label.includes("RUN LINE") || label.includes("RL -") || label.includes("RL +")) {
    const margin = awayRuns - homeRuns;
    if (label.includes("AWAY")) return lean === "OVER" ? (margin >= 2 ? "hit" : "miss") : (margin < 2 ? "hit" : "miss");
    if (label.includes("HOME")) return lean === "OVER" ? (homeRuns - awayRuns >= 2 ? "hit" : "miss") : (homeRuns - awayRuns < 2 ? "hit" : "miss");
    return null;
  }
  if (label.includes("MONEYLINE") || /\bML\b/.test(label)) {
    if (lean === "HOME") return homeRuns > awayRuns ? "hit" : "miss";
    if (lean === "AWAY") return awayRuns > homeRuns ? "hit" : "miss";
    return null;
  }
  if (label.includes("K'S") || label.includes("STRIKEOUT") || (label.includes(" K ") && (label.includes("O/U") || label.includes("OVER") || label.includes("UNDER")))) {
    const m = label.match(/(\d+\.?\d*)/);
    if (!m) return null;
    const line = parseFloat(m[1]);
    const pitcher = findPitcher();
    if (!pitcher) return null;
    if (lean === "OVER") return (pitcher.k ?? 0) > line ? "hit" : "miss";
    if (lean === "UNDER") return (pitcher.k ?? 0) < line ? "hit" : "miss";
    return null;
  }
  if (label.includes("OUTS") && (label.includes("O/U") || label.includes("OVER") || label.includes("UNDER"))) {
    const m = label.match(/(\d+\.?\d*)/);
    if (!m) return null;
    const line = parseFloat(m[1]);
    const pitcher = findPitcher();
    if (!pitcher) return null;
    const outs = parseIpToOuts(pitcher.ip);
    if (lean === "OVER") return outs > line ? "hit" : "miss";
    if (lean === "UNDER") return outs < line ? "hit" : "miss";
    return null;
  }
  if (pick.propType === "Hits" || (label.includes("HITS") && (label.includes("O/U") || label.includes("OVER") || label.includes("UNDER")))) {
    const m = label.match(/(\d+\.?\d*)/);
    if (!m) return null;
    const batter = findBatter();
    if (!batter) return null;
    if (lean === "OVER") return (batter.h ?? 0) > parseFloat(m[1]) ? "hit" : "miss";
    if (lean === "UNDER") return (batter.h ?? 0) < parseFloat(m[1]) ? "hit" : "miss";
    return null;
  }
  if (pick.propType === "TB" || label.includes("TOTAL BASES") || (/\bTB\b/.test(label) && (label.includes("O/U") || label.includes("OVER") || label.includes("UNDER")))) {
    const m = label.match(/(\d+\.?\d*)/);
    if (!m) return null;
    const batter = findBatter();
    if (!batter || batter.tb === undefined) return null;
    if (lean === "OVER") return (batter.tb ?? 0) > parseFloat(m[1]) ? "hit" : "miss";
    if (lean === "UNDER") return (batter.tb ?? 0) < parseFloat(m[1]) ? "hit" : "miss";
    return null;
  }
  if (pick.propType === "HR" || label.includes(" HR ")) {
    const m = label.match(/(\d+\.?\d*)/);
    if (!m) return null;
    const batter = findBatter();
    if (!batter) return null;
    if (lean === "OVER" || lean === "YES") return (batter.hr ?? 0) > parseFloat(m[1]) ? "hit" : "miss";
    if (lean === "UNDER" || lean === "NO") return (batter.hr ?? 0) < parseFloat(m[1]) ? "hit" : "miss";
    return null;
  }
  if (pick.propType === "RBI" || label.includes("RBI")) {
    const m = label.match(/(\d+\.?\d*)/);
    if (!m) return null;
    const batter = findBatter();
    if (!batter) return null;
    if (lean === "OVER") return (batter.rbi ?? 0) > parseFloat(m[1]) ? "hit" : "miss";
    if (lean === "UNDER") return (batter.rbi ?? 0) < parseFloat(m[1]) ? "hit" : "miss";
    return null;
  }
  return null;
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
    const isFinal = inningsPlayed > 0 && !ls.currentInning;
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

async function gradePendingPicks() {
  const picks = readPicks();
  const pending = picks.filter((p) => p.result === null || p.result === undefined);
  if (!pending.length) {
    console.log("  · Grade job: no pending picks");
    return { graded: 0, total: 0 };
  }

  const byGame = {};
  pending.forEach((p) => {
    const key = String(p.gamePk);
    if (!byGame[key]) byGame[key] = [];
    byGame[key].push(p);
  });

  let gradedCount = 0;
  const updates = {};

  await Promise.all(
    Object.entries(byGame).map(async ([gamePkStr, gamePicks]) => {
      const box = await fetchBoxForGrading(gamePkStr);
      if (!box) return;
      gamePicks.forEach((pick) => {
        const grade = computeGrade(pick, box);
        if (grade !== null) { updates[pick.id] = grade; gradedCount++; }
      });
    })
  );

  if (gradedCount > 0) {
    const updated = picks.map((p) => (updates[p.id] !== undefined ? { ...p, result: updates[p.id] } : p));
    writePicks(updated);
    console.log(`  ✓ Grade job: settled ${gradedCount} pick(s)`);
  }

  return { graded: gradedCount, total: pending.length };
}

module.exports = { gradePendingPicks };
