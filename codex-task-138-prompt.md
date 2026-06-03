# CODEX TASK 138 — Picks Backend: Migration + Route Upgrade

## Goal

Upgrade the existing `picks` table and `backend/routes/picks.js` to support the new
position-pick log. The existing route is already mounted at `/api/picks` in `server.js`
— no new files or mount points needed. This task is purely a migration + route rewrite.

---

## Background: What Already Exists

### `backend/routes/picks.js` (current state)

Already mounted at `/api/picks`, already uses `requireAuth` middleware (`req.userId`),
has `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`. Falls back to a flat JSON file
(`backend/data/picks.json`) when DB is unavailable.

### `picks` DB table (current schema)

```sql
picks (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  game_pk     INTEGER,
  result      TEXT,
  prop_type   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  snapshot    JSONB
)
```

The `snapshot` column holds whatever `req.body` was at insert time — unstructured.
The current duplicate check is `SELECT id FROM picks WHERE id = $1` (ID-based only).

### `board_card_snapshots` table (grading source)

```sql
board_card_snapshots (
  card_id      TEXT,
  market       TEXT,
  slate_date   DATE,
  result_hit   BOOLEAN,   -- NULL = unresolved, true = HIT, false = MISS
  actual_stat  NUMERIC,
  ...
)
```

This is the source of truth for HIT/MISS results. Picks inherit their result by
joining on `(player_id, market, slate_date)` — `card_id` is NOT reliable across
sources (Board vs Props cards differ).

---

## What To Build

### 1. Migrate the `picks` table — add new columns

Add these columns to `ensurePhaseOneTables()` in `backend/jobs/snapshotJobs.js`,
using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` so existing rows are preserved:

```sql
ALTER TABLE picks ADD COLUMN IF NOT EXISTS player_id    TEXT;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS market       TEXT;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS side         TEXT;        -- 'over' | 'under'
ALTER TABLE picks ADD COLUMN IF NOT EXISTS book_line    NUMERIC;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS odds         INTEGER;     -- American odds, e.g. -125, +110
ALTER TABLE picks ADD COLUMN IF NOT EXISTS units        NUMERIC NOT NULL DEFAULT 1.0;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS slate_date   DATE;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS voided       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS voided_at    TIMESTAMPTZ;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS source       TEXT;        -- 'board' | 'props'
ALTER TABLE picks ADD COLUMN IF NOT EXISTS game_label   TEXT;        -- e.g. "NYY @ BOS"
ALTER TABLE picks ADD COLUMN IF NOT EXISTS player_name  TEXT;
```

Add these 11 ALTER statements after the existing table definitions in
`ensurePhaseOneTables()`. Do NOT drop or recreate the table.

---

### 2. Rewrite `backend/routes/picks.js`

Replace the entire file with the implementation below. Keep the flat-file fallback
for the DB-unavailable path — update it to handle the new fields too.

#### `GET /api/picks`

Returns the authenticated user's picks, enriched with grading from
`board_card_snapshots`. Accepts optional query param `?days=N` (default 0 = all time).

```js
router.get("/", async (req, res) => {
  const daysRaw = Number.parseInt(String(req.query.days ?? "0"), 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 0;

  if (isConnected()) {
    const result = await query(
      `SELECT
          p.id, p.player_id, p.player_name, p.game_label, p.market, p.side,
          p.book_line, p.odds, p.units, p.slate_date, p.source,
          p.voided, p.voided_at, p.created_at, p.snapshot,
          bcs.result_hit, bcs.actual_stat
       FROM picks p
       LEFT JOIN board_card_snapshots bcs
         ON bcs.card_id = p.player_id
        AND bcs.market  = p.market
        AND bcs.slate_date = p.slate_date
       WHERE p.user_id = $1
         AND p.voided  = FALSE
         AND ($2::int = 0 OR p.slate_date >= CURRENT_DATE - ($2::int || ' days')::interval)
       ORDER BY p.created_at DESC`,
      [req.userId, days]
    );

    const rows = (result?.rows ?? []).map((row) => ({
      id:          row.id,
      playerId:    row.player_id,
      playerName:  row.player_name,
      gameLabel:   row.game_label,
      market:      row.market,
      side:        row.side,
      bookLine:    row.book_line != null ? Number(row.book_line) : null,
      odds:        row.odds != null ? Number(row.odds) : null,
      units:       Number(row.units) || 1,
      slateDate:   row.slate_date,
      source:      row.source,
      addedAt:     row.created_at,
      resultHit:   row.result_hit,      // null | true | false (from bcs JOIN)
      actualStat:  row.actual_stat != null ? Number(row.actual_stat) : null,
      pnl:         calcPnl(row.result_hit, row.odds, Number(row.units) || 1),
    }));

    return res.json({ picks: rows });
  }

  // flat-file fallback
  const store = readStore();
  return res.json({
    picks: store.picks.filter((p) => p.userId === req.userId && !p.voided),
  });
});
```

**P&L helper** — add near the top of the file:

```js
function calcPnl(resultHit, odds, units) {
  if (resultHit === null || resultHit === undefined) return null; // unresolved
  if (!resultHit) return -(units);                                // MISS = -units
  if (!odds) return null;                                         // HIT but no odds = no P&L
  // American odds to profit multiplier
  const profit = odds > 0
    ? units * (odds / 100)
    : units * (100 / Math.abs(odds));
  return Math.round(profit * 100) / 100;
}
```

---

#### `POST /api/picks`

Accepts the pick payload from the confirm sheet. Duplicate check is by
`(user_id, player_id, market, slate_date)` — NOT by `id`.

Expected request body:
```json
{
  "playerId":   "592450",
  "playerName": "Aaron Judge",
  "gameLabel":  "NYY @ BOS",
  "market":     "hr",
  "side":       "over",
  "bookLine":   0.5,
  "odds":       -125,
  "units":      1.0,
  "slateDate":  "2026-06-03",
  "source":     "board"
}
```

```js
router.post("/", async (req, res) => {
  const {
    playerId, playerName, gameLabel, market, side,
    bookLine, odds, units, slateDate, source,
  } = req.body ?? {};

  if (!playerId || !market || !side || !slateDate) {
    return res.status(400).json({ error: "playerId, market, side, slateDate required" });
  }

  if (isConnected()) {
    // Duplicate check
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
        id, req.userId, String(playerId), playerName ?? null, gameLabel ?? null,
        market, side, bookLine ?? null, odds ?? null,
        units != null ? Number(units) : 1.0,
        slateDate, source ?? "board",
        JSON.stringify(req.body),
      ]
    );

    return res.status(201).json({ ok: true, id });
  }

  // flat-file fallback
  const store = readStore();
  const id = `${req.userId}:${playerId}:${market}:${slateDate}`;
  const dup = store.picks.find(
    (p) => p.userId === req.userId && p.playerId === String(playerId)
       && p.market === market && p.slateDate === slateDate && !p.voided
  );
  if (dup) return res.status(409).json({ error: "already_logged", id: dup.id });

  const entry = {
    id, userId: req.userId, playerId: String(playerId), playerName,
    gameLabel, market, side, bookLine, odds,
    units: units != null ? Number(units) : 1.0,
    slateDate, source: source ?? "board", addedAt: new Date().toISOString(),
    resultHit: null, voided: false,
  };
  store.picks.push(entry);
  writeStore(store);
  return res.status(201).json({ ok: true, id });
});
```

---

#### `PATCH /api/picks/:id/void`

Sets `voided = true`. Ownership check required.

```js
router.patch("/:id/void", async (req, res) => {
  if (isConnected()) {
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
```

---

#### `DELETE /api/picks/:id`

Keep as-is (hard delete, ownership check). No changes needed.

---

#### `PATCH /api/picks/:id` (legacy result update)

Keep as-is for backward compat. Results come from the DB JOIN now but this
endpoint stays for manual overrides if needed.

---

### 3. Summary stats endpoint

Add `GET /api/picks/stats` **above** the `GET /` handler so it isn't swallowed
by the `/:id` pattern.

Returns the running W-L record, hit rate, and P&L for the authenticated user.
Accepts `?days=N` (default 0 = all time).

```js
router.get("/stats", async (req, res) => {
  const daysRaw = Number.parseInt(String(req.query.days ?? "0"), 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 0;

  if (!isConnected()) {
    return res.json({ wins: 0, losses: 0, pending: 0, hitRate: null, totalPnl: null });
  }

  const result = await query(
    `SELECT
        p.result_hit_override,
        p.odds,
        p.units,
        bcs.result_hit,
        bcs.actual_stat
     FROM picks p
     LEFT JOIN board_card_snapshots bcs
       ON bcs.card_id   = p.player_id
      AND bcs.market    = p.market
      AND bcs.slate_date = p.slate_date
     WHERE p.user_id = $1
       AND p.voided  = FALSE
       AND ($2::int = 0 OR p.slate_date >= CURRENT_DATE - ($2::int || ' days')::interval)`,
    [req.userId, days]
  );

  let wins = 0, losses = 0, pending = 0, totalPnl = 0, pnlCount = 0;

  for (const row of result?.rows ?? []) {
    const hit = row.result_hit;
    const pnl = calcPnl(hit, row.odds, Number(row.units) || 1);
    if (hit === true)  { wins++;   if (pnl !== null) { totalPnl += pnl; pnlCount++; } }
    if (hit === false) { losses++; if (pnl !== null) { totalPnl += pnl; pnlCount++; } }
    if (hit === null)  { pending++; }
  }

  const resolved = wins + losses;
  return res.json({
    wins,
    losses,
    pending,
    hitRate: resolved > 0 ? Math.round((wins / resolved) * 1000) / 10 : null,
    totalPnl: pnlCount > 0 ? Math.round(totalPnl * 100) / 100 : null,
  });
});
```

---

## Files to Modify

**`backend/jobs/snapshotJobs.js`**
- Add 11 `ALTER TABLE picks ADD COLUMN IF NOT EXISTS ...` statements inside
  `ensurePhaseOneTables()`, after the existing `picks` table block (search for
  `scout_picks_snapshots` — the new ALTERs go before it)

**`backend/routes/picks.js`**
- Full rewrite: keep `requireAuth`, flat-file fallback, `readStore`/`writeStore`
  helpers, and all existing route verbs
- Add `calcPnl` helper
- Add `GET /stats` route (must be before `GET /`)
- Rewrite `GET /` with LEFT JOIN
- Rewrite `POST /` with new column writes + duplicate check
- Add `PATCH /:id/void`
- Keep `PATCH /:id` and `DELETE /:id` unchanged

**`backend/server.js`** — no changes needed (route already mounted)

---

## What NOT to Change

- `backend/middleware/auth.js` — untouched
- `backend/services/db.js` — untouched
- `backend/jobs/scheduler.js` — untouched; grading is via JOIN, no new job
- `prop-scout-v7.jsx` — untouched (Tasks 139 and 140)
- `board_card_snapshots` table — untouched; picks JOIN into it read-only

---

## Checklist

- [ ] 11 ALTER TABLE statements added to `ensurePhaseOneTables()`, all using `ADD COLUMN IF NOT EXISTS`
- [ ] `calcPnl(resultHit, odds, units)` helper present and correct for both + and - American odds
- [ ] `GET /api/picks/stats` returns `{ wins, losses, pending, hitRate, totalPnl }`
- [ ] `GET /api/picks` LEFT JOINs `board_card_snapshots` on `(card_id = player_id, market, slate_date)`
- [ ] `GET /api/picks` returns `pnl` field (null when unresolved or odds absent)
- [ ] `POST /api/picks` duplicate check on `(user_id, player_id, market, slate_date, voided = FALSE)`
- [ ] `POST /api/picks` returns `{ ok: true, id }` on success, `{ error: "already_logged", id }` on duplicate (HTTP 409)
- [ ] `PATCH /api/picks/:id/void` sets `voided = TRUE, voided_at = NOW()`, ownership check passes
- [ ] Flat-file fallback updated to handle new fields in POST and PATCH/void
- [ ] Server starts without errors
- [ ] `GET /api/picks/stats` is declared before `GET /` to avoid Express route shadowing

---

## After Completing

Reply "Task 138 complete" and confirm:
1. Number of ALTER TABLE statements added
2. How the duplicate check key is constructed (exact fields)
3. P&L formula used for a -125 odds, 1u pick that hits
