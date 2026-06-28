/**
 * Batter-vs-pitcher matchup scoring for GET /api/game/:gamePk/matchups
 *
 * Score (0–100) represents how favorable the matchup is for the BATTER.
 * 70–100 = favorable for batter, 50–69 = average, 0–49 = favorable for pitcher.
 *
 * Algorithm (per batter):
 *   1. Start with pitcher's OPS-against vs batter's hand (from pitcher-splits).
 *      Normalize: 0.400 OPS → score 0, 0.750 → score 50, 1.100+ → score 100.
 *   2. If career face-off data exists (≥5 AB this or previous season), blend:
 *      final = face_off_score × 0.6 + split_score × 0.4
 *   3. Recent-form adjustment: hotStreak → +8, coldStreak → −8.
 *   4. Clamp to [0, 100].
 *
 * Returns top `limit` matchups across both pitchers (home batters vs away
 * pitcher + away batters vs home pitcher), sorted by score descending.
 */

const mlb    = require("../services/mlbApi");
const cache  = require("../services/cache");
const { buildSchedulePayloadForJob } = require("./schedule");
const { fetchLineupsForGame }        = require("./lineups");
const { buildPitcherSplitsForJob }   = require("./pitcherSplits");

const SEASON        = new Date().getFullYear();
const MATCHUP_TTL   = 5  * 60 * 1000;  // 5 min — lineups can still change
const FACEOFF_TTL   = 24 * 60 * 60 * 1000; // 24h for career face-off stats

// ── Helpers ───────────────────────────────────────────────────────────────

// OPS → 0–100 batter-favorable score.
// Anchors: 0.400 OPS = score 0 (pitcher dominant), 0.750 = 50 (neutral), 1.100+ = 100.
function opsToScore(ops) {
  if (!ops || !isFinite(ops)) return 50;
  return Math.max(0, Math.min(100, Math.round((ops - 0.400) / 0.700 * 100)));
}

// Career stats for specific batter vs specific pitcher (MLB Stats API vsPlayer).
// Falls back to previous season if current season has < 3 AB.
async function fetchFaceOff(batterId, pitcherId) {
  const cacheKey = `faceoff:${batterId}:${pitcherId}:${SEASON}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const { data } = await mlb.get(`/people/${batterId}/stats`, {
      params: {
        stats:              "vsPlayer",
        opposingPlayerId:   pitcherId,
        group:              "hitting",
        season:             SEASON,
        gameType:           "R",
      },
    });

    const allBlocks = data.stats ?? [];
    let best = null;

    for (const block of allBlocks) {
      for (const split of block.splits ?? []) {
        const s = split.stat ?? {};
        const ab = parseInt(s.atBats, 10) || 0;
        if (ab >= 3 && (!best || ab > best.ab)) {
          best = {
            ab,
            hits:   parseInt(s.hits,       10) || 0,
            hr:     parseInt(s.homeRuns,    10) || 0,
            k:      parseInt(s.strikeOuts,  10) || 0,
            ops:    parseFloat(s.ops)  || null,
            avg:    s.avg ?? null,
          };
        }
      }
    }

    cache.set(cacheKey, best, FACEOFF_TTL);
    return best;
  } catch {
    cache.set(cacheKey, null, FACEOFF_TTL);
    return null;
  }
}

// Score a single batter-vs-pitcher matchup.
function scoreMatchup(batter, pitcher, pitcherSplits, faceOff) {
  // Step 1: pitcher's OPS-against vs batter's hand
  const hand = batter.hand === "L" ? "L" : "R";
  const pitcherSplit = hand === "L" ? pitcherSplits?.vsLeft : pitcherSplits?.vsRight;
  const splitOpsRaw = pitcherSplit?.ops && pitcherSplit.ops !== "—"
    ? parseFloat(pitcherSplit.ops)
    : null;
  let score = splitOpsRaw !== null && !isNaN(splitOpsRaw)
    ? opsToScore(splitOpsRaw)
    : 50; // fallback to neutral if no pitcher split

  // Step 2: blend in career face-off if sufficient sample
  if (faceOff?.ab >= 5 && faceOff.ops) {
    const faceOffScore = opsToScore(faceOff.ops);
    score = Math.round((faceOffScore * 0.6 + score * 0.4) * 10) / 10;
  }

  // Step 3: recent-form adjustment
  const rf = batter.recentForm;
  if (rf?.hotStreak) score = Math.min(100, score + 8);
  else if (rf?.coldStreak) score = Math.max(0,   score - 8);

  return Math.round(score * 10) / 10;
}

function computeTrend(score, recentForm) {
  if (recentForm?.hotStreak)  return "up";
  if (recentForm?.coldStreak) return "down";
  if (score >= 65) return "up";
  if (score <= 30) return "down";
  return "neutral";
}

function computeReason(batter, pitcher, score, faceOff, pitcherSplits) {
  const hand = batter.hand === "L" ? "L" : "R";
  const pitcherSplit = hand === "L" ? pitcherSplits?.vsLeft : pitcherSplits?.vsRight;

  // Face-off history is most specific
  if (faceOff?.ab >= 5 && faceOff.avg) {
    const lastName = pitcher.name.split(" ").pop();
    return `${faceOff.hits}-for-${faceOff.ab} career vs ${lastName} (${faceOff.avg} AVG)`;
  }

  // Pitcher split signal
  if (pitcherSplit?.ops && pitcherSplit.ops !== "—") {
    const handLabel = hand === "L" ? "LHH" : "RHH";
    const opsVal = parseFloat(pitcherSplit.ops);
    if (!isNaN(opsVal)) {
      if (opsVal > 0.820) return `Pitcher allows ${pitcherSplit.ops} OPS vs ${handLabel}`;
      if (opsVal < 0.620) return `Pitcher holds ${handLabel} to ${pitcherSplit.ops} OPS`;
    }
  }

  // Recent form
  if (batter.recentForm?.hotStreak) {
    return `${batter.recentForm.hrLast15} HR in last 15 games`;
  }

  return null;
}

// ── Core builder ──────────────────────────────────────────────────────────

async function buildMatchupsForGame(gamePk, { limit = 5 } = {}) {
  const slateDate = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  const cacheKey  = `matchups:${gamePk}:${slateDate}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 1. Game info (pitcher IDs + names)
  const schedule = await buildSchedulePayloadForJob(slateDate);
  const game = schedule.find(g => String(g.gamePk) === String(gamePk));
  if (!game) {
    const err = new Error(`Game not found: ${gamePk}`);
    err.status = 404;
    throw err;
  }

  const homePitcher = game.probablePitchers?.home ?? null;
  const awayPitcher = game.probablePitchers?.away ?? null;

  if (!homePitcher?.id && !awayPitcher?.id) {
    return { gamePk: Number(gamePk), matchups: [], note: "No probable pitchers posted" };
  }

  // 2. Lineups + pitcher splits in parallel
  const [lineups, homeSplits, awaySplits] = await Promise.all([
    fetchLineupsForGame(gamePk).catch(() => null),
    homePitcher?.id ? buildPitcherSplitsForJob(homePitcher.id).catch(() => null) : null,
    awayPitcher?.id ? buildPitcherSplitsForJob(awayPitcher.id).catch(() => null) : null,
  ]);

  // home batters face away pitcher; away batters face home pitcher
  const pairs = [
    ...(homePitcher?.id && (lineups?.away ?? []).length
      ? (lineups.away).map(b => ({ batter: b, pitcher: homePitcher, splits: homeSplits }))
      : []),
    ...(awayPitcher?.id && (lineups?.home ?? []).length
      ? (lineups.home).map(b => ({ batter: b, pitcher: awayPitcher, splits: awaySplits }))
      : []),
  ];

  if (!pairs.length) {
    return { gamePk: Number(gamePk), matchups: [], note: "Lineups not yet posted" };
  }

  // 3. Fetch face-off stats concurrently (max 4 at a time)
  const faceOffs = new Array(pairs.length).fill(null);
  let idx = 0;
  async function worker() {
    while (idx < pairs.length) {
      const i = idx++;
      const { batter, pitcher } = pairs[i];
      faceOffs[i] = await fetchFaceOff(batter.id, pitcher.id).catch(() => null);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, pairs.length) }, worker));

  // 4. Score + sort
  const matchups = pairs
    .map(({ batter, pitcher, splits }, i) => {
      const faceOff = faceOffs[i];
      const score   = scoreMatchup(batter, pitcher, splits, faceOff);
      return {
        batter:       { id: batter.id, name: batter.name, position: batter.pos ?? null },
        pitcher:      { id: pitcher.id, name: pitcher.name ?? pitcher.fullName ?? "TBD" },
        matchupScore: score,
        trend:        computeTrend(score, batter.recentForm),
        reason:       computeReason(batter, pitcher, score, faceOff, splits),
      };
    })
    .sort((a, b) => b.matchupScore - a.matchupScore)
    .slice(0, limit);

  const result = { gamePk: Number(gamePk), matchups };
  cache.set(cacheKey, result, MATCHUP_TTL);
  console.log(`  ✓ Matchups  gamePk=${gamePk}  computed=${pairs.length}  returned=${matchups.length}`);
  return result;
}

module.exports = { buildMatchupsForGame };
