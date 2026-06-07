const express = require("express");
const fs = require("fs");
const path = require("path");
const requireAuth = require("../middleware/auth");
const { query, isConnected } = require("../services/db");

const router = express.Router();

const DATA_DIR = path.join(__dirname, "..", "data");
const PICKS_FILE = path.join(DATA_DIR, "picks.json");
let _ensurePicksSchemaPromise = null;

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PICKS_FILE)) {
    fs.writeFileSync(PICKS_FILE, JSON.stringify({ picks: [] }, null, 2));
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(PICKS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.picks) ? parsed : { picks: [] };
  } catch (_err) {
    return { picks: [] };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(PICKS_FILE, JSON.stringify(store, null, 2));
}

function calcPnl(resultHit, odds, units) {
  if (resultHit === null || resultHit === undefined) return null;
  if (!resultHit) return -(units);
  if (!odds) return units; // no odds logged — flat +units per win
  const profit = odds > 0
    ? units * (odds / 100)
    : units * (100 / Math.abs(odds));
  return Math.round(profit * 100) / 100;
}

function normalizeResultOverride(result) {
  if (result == null) return null;
  const normalized = String(result).trim().toUpperCase();
  if (normalized === "HIT") return true;
  if (normalized === "MISS") return false;
  return null;
}

function dateWithinDays(slateDate, days) {
  if (!days) return true;
  if (!slateDate) return false;
  const target = Date.parse(`${slateDate}T00:00:00Z`);
  if (!Number.isFinite(target)) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const ageDays = Math.floor((todayUtc - target) / (24 * 60 * 60 * 1000));
  return ageDays <= days;
}

function normalizeLegacyPick(row) {
  const snapshot = row?.snapshot && typeof row.snapshot === "object" ? row.snapshot : {};
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  const payload = Object.keys(snapshot).length > 0 ? snapshot : data;
  const idParts = String(row?.id ?? "").split(":");
  const inferredCreatedDate = (() => {
    const source = row?.created_at ?? row?.createdAt ?? payload.timestamp ?? null;
    if (!source) return null;
    try {
      return new Date(source).toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
    } catch {
      return null;
    }
  })();
  const inferredSlateDate = row?.slate_date ?? row?.slateDate ?? payload.slateDate ?? inferredCreatedDate ?? (idParts.length >= 4 ? idParts[idParts.length - 1] : null);
  const inferredPlayerId = row?.player_id ?? row?.playerId ?? payload.playerId ?? payload.pitcherId ?? (idParts.length >= 4 ? idParts[idParts.length - 3] : null);
  const inferredMarket = row?.market ?? payload.market ?? row?.prop_type ?? row?.propType ?? payload.propType ?? (idParts.length >= 4 ? idParts[idParts.length - 2] : null);
  const inferredGameLabel = row?.game_label
    ?? row?.gameLabel
    ?? payload.gameLabel
    ?? payload.game
    ?? (payload.awayTeam && payload.homeTeam ? `${payload.awayTeam} @ ${payload.homeTeam}` : null);
  const inferredPlayerName = row?.player_name
    ?? row?.playerName
    ?? payload.playerName
    ?? payload.pitcherName
    ?? payload.name
    ?? payload.label
    ?? null;
  const inferredSide = row?.side
    ?? payload.side
    ?? (typeof payload.lean === "string" ? payload.lean : null);

  return {
    id: row?.id,
    playerId: inferredPlayerId != null ? String(inferredPlayerId) : null,
    playerName: inferredPlayerName,
    gameLabel: inferredGameLabel,
    market: inferredMarket ?? null,
    side: inferredSide,
    bookLine: row?.book_line != null
      ? Number(row.book_line)
      : row?.bookLine != null
      ? Number(row.bookLine)
      : payload.bookLine != null && Number.isFinite(Number(payload.bookLine))
      ? Number(payload.bookLine)
      : null,
    odds: row?.odds != null
      ? Number(row.odds)
      : payload.odds != null && Number.isFinite(Number(payload.odds))
      ? Number(payload.odds)
      : null,
    units: Number(row?.units ?? payload.units) || 1,
    slateDate: inferredSlateDate ?? null,
    source: row?.source ?? payload.source ?? null,
    addedAt: row?.created_at ?? row?.createdAt ?? payload.addedAt ?? payload.timestamp ?? null,
    result: row?.result ?? payload.result ?? null,
    snapshot: Object.keys(snapshot).length > 0 ? snapshot : data,
  };
}

async function ensurePicksSchema() {
  if (!isConnected()) return;
  if (_ensurePicksSchemaPromise) return _ensurePicksSchemaPromise;

  _ensurePicksSchemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS picks (
        id           TEXT         PRIMARY KEY,
        user_id      TEXT         NOT NULL,
        game_pk      TEXT,
        status       TEXT         NOT NULL DEFAULT 'pending',
        result       TEXT,
        prop_type    TEXT,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        snapshot     JSONB        NOT NULL DEFAULT '{}'
      )
    `);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS player_id TEXT`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS market TEXT`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS side TEXT`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS book_line NUMERIC`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS odds INTEGER`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS units NUMERIC NOT NULL DEFAULT 1.0`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS slate_date DATE`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS voided BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS source TEXT`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS game_label TEXT`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS player_name TEXT`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS snapshot JSONB NOT NULL DEFAULT '{}'`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS result_hit BOOLEAN`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS actual_stat NUMERIC`);
    await query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS grade_status TEXT`);

    await query(`
      CREATE TABLE IF NOT EXISTS board_card_snapshots (
        card_id      TEXT         NOT NULL,
        slate_date   DATE         NOT NULL,
        market       TEXT         NOT NULL,
        result_hit   BOOLEAN,
        actual_stat  NUMERIC,
        PRIMARY KEY (card_id, market, slate_date)
      )
    `);
  })().catch((err) => {
    _ensurePicksSchemaPromise = null;
    throw err;
  });

  return _ensurePicksSchemaPromise;
}

router.use(requireAuth);

router.get("/stats", async (req, res) => {
  const daysRaw = Number.parseInt(String(req.query.days ?? "0"), 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 0;

  if (isConnected()) {
    await ensurePicksSchema();
    const result = await query(
      `SELECT
          p.result,
          p.odds,
          p.units,
          COALESCE(p.result_hit, bcs.result_hit) AS result_hit,
          COALESCE(p.actual_stat, bcs.actual_stat) AS actual_stat,
          p.grade_status
       FROM picks p
       LEFT JOIN board_card_snapshots bcs
         ON bcs.card_id = p.player_id
        AND bcs.market = p.market
        AND bcs.slate_date = p.slate_date
       WHERE p.user_id = $1
         AND p.voided = FALSE
         AND ($2::int = 0 OR p.slate_date >= CURRENT_DATE - ($2::int || ' days')::interval)`,
      [req.userId, days]
    );

    let wins = 0;
    let losses = 0;
    let pending = 0;
    let totalPnl = 0;
    let pnlCount = 0;

    for (const row of result?.rows ?? []) {
      const hit = normalizeResultOverride(row.result) ?? row.result_hit;
      const pnl = calcPnl(hit, row.odds != null ? Number(row.odds) : null, Number(row.units) || 1);
      if (hit === true) {
        wins++;
        if (pnl !== null) {
          totalPnl += pnl;
          pnlCount++;
        }
      }
      if (hit === false) {
        losses++;
        if (pnl !== null) {
          totalPnl += pnl;
          pnlCount++;
        }
      }
      if (hit === null || hit === undefined) pending++;
    }

    const resolved = wins + losses;
    return res.json({
      wins,
      losses,
      pending,
      hitRate: resolved > 0 ? Math.round((wins / resolved) * 1000) / 10 : null,
      totalPnl: pnlCount > 0 ? Math.round(totalPnl * 100) / 100 : null,
    });
  }

  const store = readStore();
  const picks = store.picks.filter((p) =>
    p.userId === req.userId &&
    !p.voided &&
    dateWithinDays(p.slateDate, days)
  );

  let wins = 0;
  let losses = 0;
  let pending = 0;
  let totalPnl = 0;
  let pnlCount = 0;

  picks.forEach((pick) => {
    const hit = normalizeResultOverride(pick.result) ?? pick.resultHit ?? null;
    const pnl = calcPnl(hit, pick.odds != null ? Number(pick.odds) : null, Number(pick.units) || 1);
    if (hit === true) {
      wins++;
      if (pnl !== null) {
        totalPnl += pnl;
        pnlCount++;
      }
    } else if (hit === false) {
      losses++;
      if (pnl !== null) {
        totalPnl += pnl;
        pnlCount++;
      }
    } else {
      pending++;
    }
  });

  const resolved = wins + losses;
  return res.json({
    wins,
    losses,
    pending,
    hitRate: resolved > 0 ? Math.round((wins / resolved) * 1000) / 10 : null,
    totalPnl: pnlCount > 0 ? Math.round(totalPnl * 100) / 100 : null,
  });
});

router.get("/", async (req, res) => {
  const daysRaw = Number.parseInt(String(req.query.days ?? "0"), 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 0;

  if (isConnected()) {
    await ensurePicksSchema();
    const result = await query(
      `SELECT
          p.id, p.player_id, p.player_name, p.game_label, p.market, p.side,
          p.book_line, p.odds, p.units, p.slate_date, p.source,
          p.voided, p.voided_at, p.created_at, p.snapshot, p.data, p.result,
          COALESCE(p.result_hit, bcs.result_hit) AS result_hit,
          COALESCE(p.actual_stat, bcs.actual_stat) AS actual_stat,
          p.grade_status
       FROM picks p
       LEFT JOIN board_card_snapshots bcs
         ON bcs.card_id = p.player_id
        AND bcs.market = p.market
        AND bcs.slate_date = p.slate_date
       WHERE p.user_id = $1
         AND p.voided = FALSE
         AND ($2::int = 0 OR p.slate_date >= CURRENT_DATE - ($2::int || ' days')::interval)
       ORDER BY p.created_at DESC`,
      [req.userId, days]
    );

    const rows = (result?.rows ?? []).map((row) => {
      const normalized = normalizeLegacyPick(row);
      const resultHit = normalizeResultOverride(normalized.result) ?? row.result_hit;
      return {
        id: normalized.id,
        playerId: normalized.playerId,
        playerName: normalized.playerName,
        gameLabel: normalized.gameLabel,
        market: normalized.market,
        side: normalized.side,
        bookLine: normalized.bookLine,
        odds: normalized.odds,
        units: normalized.units,
        slateDate: normalized.slateDate,
        source: normalized.source,
        addedAt: normalized.addedAt,
        resultHit,
        actualStat: row.actual_stat != null ? Number(row.actual_stat) : null,
        gradeStatus: row.grade_status ?? null,
        pnl: calcPnl(resultHit, normalized.odds, normalized.units),
        snapshot: normalized.snapshot,
      };
    });

    return res.json({ picks: rows });
  }

  const store = readStore();
  return res.json({
    picks: store.picks
      .filter((p) =>
        p.userId === req.userId &&
        !p.voided &&
        dateWithinDays(p.slateDate, days)
      )
      .map((pick) => {
        const resultHit = normalizeResultOverride(pick.result) ?? pick.resultHit ?? null;
        return {
          id: pick.id,
          playerId: pick.playerId ?? null,
          playerName: pick.playerName ?? null,
          gameLabel: pick.gameLabel ?? null,
          market: pick.market ?? null,
          side: pick.side ?? null,
          bookLine: pick.bookLine != null ? Number(pick.bookLine) : null,
          odds: pick.odds != null ? Number(pick.odds) : null,
          units: Number(pick.units) || 1,
          slateDate: pick.slateDate ?? null,
          source: pick.source ?? null,
          addedAt: pick.addedAt ?? null,
          resultHit,
          actualStat: pick.actualStat != null ? Number(pick.actualStat) : null,
          gradeStatus: pick.gradeStatus ?? null,
          pnl: calcPnl(resultHit, pick.odds != null ? Number(pick.odds) : null, Number(pick.units) || 1),
          snapshot: pick.snapshot ?? null,
        };
      }),
  });
});

router.post("/", async (req, res) => {
  const {
    playerId, playerName, gameLabel, market, side,
    bookLine, odds, units, slateDate, source,
  } = req.body ?? {};

  if (!playerId || !market || !side || !slateDate) {
    return res.status(400).json({ error: "playerId, market, side, slateDate required" });
  }

  if (isConnected()) {
    await ensurePicksSchema();
    const dup = await query(
      `SELECT id FROM picks
       WHERE user_id = $1 AND player_id = $2 AND market = $3 AND slate_date = $4 AND voided = FALSE`,
      [req.userId, String(playerId), market, slateDate]
    );
    if (dup?.rows?.length > 0) {
      return res.status(409).json({ error: "already_logged", id: dup.rows[0].id });
    }

    const id = `${req.userId}:${playerId}:${market}:${slateDate}`;
    await query(
      `INSERT INTO picks
         (id, user_id, player_id, player_name, game_label, market, side,
          book_line, odds, units, slate_date, source, snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        req.userId,
        String(playerId),
        playerName ?? null,
        gameLabel ?? null,
        market,
        side,
        bookLine ?? null,
        odds ?? null,
        units != null ? Number(units) : 1.0,
        slateDate,
        source ?? "board",
        JSON.stringify(req.body),
      ]
    );

    return res.status(201).json({ ok: true, id });
  }

  const store = readStore();
  const id = `${req.userId}:${playerId}:${market}:${slateDate}`;
  const dup = store.picks.find(
    (p) => p.userId === req.userId &&
      p.playerId === String(playerId) &&
      p.market === market &&
      p.slateDate === slateDate &&
      !p.voided
  );
  if (dup) return res.status(409).json({ error: "already_logged", id: dup.id });

  const entry = {
    id,
    userId: req.userId,
    playerId: String(playerId),
    playerName,
    gameLabel,
    market,
    side,
    bookLine,
    odds,
    units: units != null ? Number(units) : 1.0,
    slateDate,
    source: source ?? "board",
    addedAt: new Date().toISOString(),
    resultHit: null,
    voided: false,
    snapshot: req.body ?? {},
  };
  store.picks.push(entry);
  writeStore(store);
  return res.status(201).json({ ok: true, id });
});

router.patch("/:id/grade", async (req, res) => {
  const { resultHit, actualStat, gradeStatus } = req.body ?? {};

  if (resultHit !== null && typeof resultHit !== "boolean") {
    return res.status(400).json({ error: "resultHit must be boolean or null" });
  }
  if (gradeStatus != null && !["ppd", "scratch", "push"].includes(gradeStatus)) {
    return res.status(400).json({ error: "gradeStatus must be null, ppd, scratch, or push" });
  }

  const nextActualStat = actualStat == null || actualStat === "" ? null : Number(actualStat);
  if (nextActualStat != null && !Number.isFinite(nextActualStat)) {
    return res.status(400).json({ error: "actualStat must be numeric or null" });
  }

  const nextResult = resultHit === true ? "hit" : resultHit === false ? "miss" : null;

  if (isConnected()) {
    await ensurePicksSchema();
    const updated = await query(
      `UPDATE picks
          SET result_hit = $1,
              actual_stat = $2,
              grade_status = $3,
              result = $4
        WHERE id = $5
          AND user_id = $6
          AND voided = FALSE
        RETURNING id`,
      [resultHit, nextActualStat, gradeStatus ?? null, nextResult, req.params.id, req.userId]
    );
    if (!updated?.rows?.length) return res.status(404).json({ error: "Pick not found" });

    return res.json({
      ok: true,
      resultHit,
      actualStat: nextActualStat,
      gradeStatus: gradeStatus ?? null,
      result: nextResult,
    });
  }

  const store = readStore();
  const index = store.picks.findIndex((pick) => (
    pick.id === req.params.id &&
    pick.userId === req.userId &&
    !pick.voided
  ));
  if (index === -1) return res.status(404).json({ error: "Pick not found" });

  store.picks[index] = {
    ...store.picks[index],
    resultHit,
    actualStat: nextActualStat,
    gradeStatus: gradeStatus ?? null,
    result: nextResult,
  };
  writeStore(store);

  return res.json({
    ok: true,
    resultHit,
    actualStat: nextActualStat,
    gradeStatus: gradeStatus ?? null,
    result: nextResult,
  });
});

router.patch("/:id/void", async (req, res) => {
  if (isConnected()) {
    await ensurePicksSchema();
    const existing = await query(
      "SELECT user_id FROM picks WHERE id = $1",
      [req.params.id]
    );
    const row = existing?.rows?.[0];
    if (!row) return res.status(404).json({ error: "Pick not found" });
    if (row.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

    await query(
      "UPDATE picks SET voided = TRUE, voided_at = NOW() WHERE id = $1",
      [req.params.id]
    );
    return res.json({ ok: true });
  }

  const store = readStore();
  const pick = store.picks.find((p) => p.id === req.params.id);
  if (!pick) return res.status(404).json({ error: "Pick not found" });
  if (pick.userId !== req.userId) return res.status(403).json({ error: "Forbidden" });
  pick.voided = true;
  pick.voidedAt = new Date().toISOString();
  writeStore(store);
  return res.json({ ok: true });
});

router.patch("/:id", async (req, res) => {
  const updates = {};
  if (req.body.result !== undefined) updates.result = req.body.result;

  if (isConnected()) {
    await ensurePicksSchema();
    const existing = await query("SELECT user_id FROM picks WHERE id = $1", [req.params.id]);
    const row = existing?.rows?.[0];
    if (!row) return res.status(404).json({ error: "Pick not found" });
    if (row.user_id !== req.userId) return res.status(403).json({ error: "Forbidden" });

    if (updates.result === undefined) return res.status(400).json({ error: "Nothing to update" });
    await query(`UPDATE picks SET result = $1 WHERE id = $2`, [updates.result, req.params.id]);

    return res.json({ ok: true, ...updates });
  }

  const store = readStore();
  const index = store.picks.findIndex((pick) => pick.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Pick not found" });
  if (store.picks[index].userId !== req.userId) return res.status(403).json({ error: "Forbidden" });

  store.picks[index] = {
    ...store.picks[index],
    ...updates,
  };
  writeStore(store);
  return res.json({ ok: true, ...updates });
});

router.delete("/:id", async (req, res) => {
  if (isConnected()) {
    await ensurePicksSchema();
    const existing = await query("SELECT user_id FROM picks WHERE id = $1", [req.params.id]);
    const row = existing?.rows?.[0];

    if (!row) {
      return res.status(404).json({ error: "Pick not found" });
    }
    if (row.user_id !== req.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await query("DELETE FROM picks WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  }

  const store = readStore();
  const index = store.picks.findIndex((pick) => pick.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Pick not found" });
  }
  if (store.picks[index].userId !== req.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  store.picks.splice(index, 1);
  writeStore(store);
  return res.json({ ok: true });
});

module.exports = router;
