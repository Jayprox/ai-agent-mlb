# CODEX TASK 139 — Picks Add Flow: Long-press + Confirm Sheet

## Goal

Add long-press support to Board cards and Props tab player rows so users can log
a position pick without leaving their current view. A confirm sheet slides up,
pre-fills the side and line from the card, lets the user optionally enter odds
and units, then saves via `POST /api/picks`. A visual indicator marks already-logged
cards. Duplicate attempts show a toast instead of opening the sheet.

---

## Background: What Already Exists

### Backend (Task 138 — complete)

- `POST /api/picks` — saves a pick, returns `{ ok: true, id }` or `{ error: "already_logged", id }` (HTTP 409)
- `GET /api/picks` — returns `{ picks: [...] }` for the current user
- `GET /api/picks/stats` — returns `{ wins, losses, pending, hitRate, totalPnl }`
- All routes behind `requireAuth`; frontend sends `Authorization: Bearer <token>`

### Board cards (`prop-scout-v7.jsx`)

Board cards are rendered via `renderBoardCandidateCard(c, i)` (line ~9756), which calls:
- `<PitcherBoardCard>` for `boardTab === "k"` or `boardTab === "outs"`
- `<BatterBoardCard>` for `boardTab === "hr"` or `boardTab === "hits"`

Both components receive the card object `c` with these relevant fields:
```js
c.id          // playerId — string, e.g. "592450"
c.name        // player display name
c.team        // team abbreviation
c.gamePk      // game ID
c.gameLabel   // e.g. "NYY @ BOS"
c.lean        // "over" | "under" | null
c.score       // 0–100 model score
// line fields (use first non-null):
c.propLine?.books?.DK?.line ?? c.propLine?.line ?? c.suggestedLine
```

Both components already accept `onCardClick` prop. They need an additional
`onLongPress` prop.

`boardTab` state is available in `prop-scout-v7.jsx` — maps directly to the
`market` field: `"k"`, `"outs"`, `"hr"`, `"hits"`.

### Props tab player rows (`prop-scout-v7.jsx`, line ~8542)

Each player row `p` has:
```js
p.player      // player display name (string)
p.playerId    // numeric player ID (may be present — check; if absent use p.player as fallback key)
p.books       // { DK: { line, overOdds, underOdds }, FD: {...}, ... }
```

`mKey` is the market string for that section (e.g. `"pitcher_strikeouts"`, `"batter_home_runs"`).

Map `mKey` to board market:
```js
const PROP_MARKET_MAP = {
  pitcher_strikeouts: "k",
  pitcher_outs:       "outs",
  batter_hits:        "hits",
  batter_home_runs:   "hr",
  batter_total_bases: "hits", // closest equivalent
};
```

The game context is in `selectedGame` (or `activeSlate.find(g => g.gamePk === selectedId)`).
Game label: `${selectedGame.away.abbr ?? selectedGame.away.name} @ ${selectedGame.home.abbr ?? selectedGame.home.name}`

### Auth

`currentUser` state holds `{ token, username, ... }`. Use `currentUser?.token` in
the `Authorization` header for all picks API calls.

### Today's date

```js
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
```

---

## What To Build

### 1. Long-press hook — `useLongPress`

Add a small hook near the top of `prop-scout-v7.jsx` (or as a named function, not
a separate file):

```js
function useLongPress(callback, ms = 500) {
  const timerRef = React.useRef(null);

  const start = React.useCallback((e) => {
    // prevent text selection on long-press
    e.preventDefault();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      callback();
    }, ms);
  }, [callback, ms]);

  const cancel = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onMouseDown:  start,
    onMouseUp:    cancel,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd:   cancel,
    onTouchCancel: cancel,
  };
}
```

---

### 2. State additions in `prop-scout-v7.jsx`

Add these three state variables near the other modal/sheet state:

```js
// Picks add-flow state
const [addPickSheet, setAddPickSheet]     = useState(null);
// null = closed; { playerId, playerName, gameLabel, market, side, bookLine, slateDate, source } = open

const [addPickOdds,  setAddPickOdds]      = useState("");   // string input, e.g. "-125"
const [addPickUnits, setAddPickUnits]     = useState("1");  // string input

const [loggedPickIds, setLoggedPickIds]   = useState(new Set());
// Set of pick IDs in format `${userId}:${playerId}:${market}:${slateDate}`
// Populated on mount and after each successful add
```

---

### 3. Load logged picks on mount

Add a `useEffect` that fires when `currentUser` is set. Populates `loggedPickIds`
so cards can show the logged indicator without an extra round-trip per card:

```js
useEffect(() => {
  if (!currentUser?.token) return;
  apiFetch("/api/picks", { headers: { Authorization: `Bearer ${currentUser.token}` } })
    .then(data => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
      const todayIds = new Set(
        (data?.picks ?? [])
          .filter(p => p.slateDate === today)
          .map(p => p.id)
      );
      setLoggedPickIds(todayIds);
    })
    .catch(() => {});
}, [currentUser]);
```

---

### 4. `openAddPickSheet` helper

```js
const openAddPickSheet = React.useCallback((payload) => {
  // payload: { playerId, playerName, gameLabel, market, side, bookLine, source }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
  const pickId = `${currentUser?.userId ?? currentUser?.username}:${payload.playerId}:${payload.market}:${today}`;

  if (loggedPickIds.has(pickId)) {
    showToast("Already in your log");
    return;
  }

  setAddPickOdds("");
  setAddPickUnits("1");
  setAddPickSheet({ ...payload, slateDate: today });
}, [currentUser, loggedPickIds]);
```

`showToast` is whatever toast/notification mechanism the app already uses. If none
exists, add a simple one:

```js
const [toastMsg, setToastMsg] = useState(null);
function showToast(msg) {
  setToastMsg(msg);
  setTimeout(() => setToastMsg(null), 2500);
}
```

Render the toast near the bottom of the app JSX:
```jsx
{toastMsg && (
  <div style={{
    position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
    background: "rgba(30,31,48,0.96)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10, padding: "8px 18px", fontSize: 12, color: "#e5e7eb",
    zIndex: 9999, pointerEvents: "none", whiteSpace: "nowrap",
  }}>
    {toastMsg}
  </div>
)}
```

---

### 5. `submitAddPick` handler

```js
const submitAddPick = React.useCallback(async () => {
  if (!addPickSheet || !currentUser?.token) return;

  const oddsVal  = addPickOdds.trim() !== "" ? parseInt(addPickOdds.trim(), 10) : null;
  const unitsVal = addPickUnits.trim() !== "" ? parseFloat(addPickUnits.trim()) : 1.0;

  if (oddsVal !== null && !Number.isFinite(oddsVal)) {
    showToast("Invalid odds — use e.g. -125 or +110");
    return;
  }

  try {
    const res = await apiFetch("/api/picks", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${currentUser.token}`,
      },
      body: JSON.stringify({
        playerId:   addPickSheet.playerId,
        playerName: addPickSheet.playerName,
        gameLabel:  addPickSheet.gameLabel,
        market:     addPickSheet.market,
        side:       addPickSheet.side,
        bookLine:   addPickSheet.bookLine,
        odds:       oddsVal,
        units:      unitsVal,
        slateDate:  addPickSheet.slateDate,
        source:     addPickSheet.source ?? "board",
      }),
    });

    if (res?.error === "already_logged") {
      showToast("Already in your log");
    } else if (res?.ok) {
      setLoggedPickIds(prev => new Set([...prev, res.id]));
      showToast("Pick logged ✓");
    }
  } catch (_err) {
    showToast("Could not save pick — try again");
  } finally {
    setAddPickSheet(null);
  }
}, [addPickSheet, addPickOdds, addPickUnits, currentUser]);
```

---

### 6. Confirm sheet modal

Render this near the bottom of the main JSX (same level as other modals):

```jsx
{addPickSheet && (
  <div
    style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.55)", display: "flex",
      alignItems: "flex-end", justifyContent: "center",
    }}
    onClick={() => setAddPickSheet(null)}
  >
    <div
      onClick={e => e.stopPropagation()}
      style={{
        width: "100%", maxWidth: 480,
        background: "#13141f", borderRadius: "16px 16px 0 0",
        padding: "20px 20px 32px", border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb" }}>Log Pick</span>
        <button onClick={() => setAddPickSheet(null)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
      </div>

      {/* Card summary */}
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", marginBottom: 2 }}>{addPickSheet.playerName}</div>
        <div style={{ fontSize: 10, color: "#9ca3af" }}>
          {addPickSheet.market?.toUpperCase()} · {addPickSheet.gameLabel}
          {addPickSheet.bookLine != null ? ` · Line ${addPickSheet.bookLine}` : ""}
        </div>
      </div>

      {/* Side selector */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Side</div>
        <div style={{ display: "flex", gap: 8 }}>
          {["over", "under"].map(s => (
            <button
              key={s}
              onClick={() => setAddPickSheet(prev => ({ ...prev, side: s }))}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                textTransform: "uppercase",
                background: addPickSheet.side === s ? "#3b82f6" : "rgba(255,255,255,0.06)",
                color: addPickSheet.side === s ? "#fff" : "#9ca3af",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Odds + Units row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Odds <span style={{ color: "#374151" }}>(optional)</span></div>
          <input
            type="text"
            inputMode="numeric"
            placeholder="-125"
            value={addPickOdds}
            onChange={e => setAddPickOdds(e.target.value)}
            style={{
              width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#f9fafb",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Units</div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="1"
            value={addPickUnits}
            onChange={e => setAddPickUnits(e.target.value)}
            style={{
              width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#f9fafb",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={submitAddPick}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
          background: "#3b82f6", color: "#fff", fontSize: 14, fontWeight: 700,
          cursor: "pointer", letterSpacing: "0.02em",
        }}
      >
        Add Pick
      </button>
    </div>
  </div>
)}
```

---

### 7. Wire long-press into Board cards

#### In `PitcherBoardCard.jsx`

Add `onLongPress` to the component's prop list alongside `onCardClick`.

Wrap the outer `<Card>` with long-press handlers:

```jsx
// In PitcherBoardCard.jsx — add onLongPress to props
export default function PitcherBoardCard({
  c, rank, boardTab, sc,
  boardGameStatus, todayResult, pitcherMetrics,
  summaryText, isPremium, preferredBook,
  onCardClick, onLongPress, isLogged,   // ← add these two
}) {
  const longPressHandlers = useLongPress(onLongPress ?? (() => {}));
  // ...
  return (
    <Card
      style={{ marginBottom: 8, cursor: "pointer", padding: "10px 12px", ...resultCardStyle }}
      onClick={onCardClick}
      {...longPressHandlers}
    >
      {/* existing content */}
      {/* Logged indicator — small bookmark in top-right */}
      {isLogged && (
        <div style={{
          position: "absolute", top: 6, right: 8,
          fontSize: 9, color: "#3b82f6", fontWeight: 700,
        }}>
          ✓ logged
        </div>
      )}
    </Card>
  );
}
```

Add `position: "relative"` to the outer `<Card>` style so the absolute indicator positions correctly.

`useLongPress` should be imported/available — either copy the hook definition into a shared location or duplicate it into each component file. Since all components are in `src/components/`, the cleanest approach is to export `useLongPress` from `src/utils.js` and import it in each card component.

#### In `BatterBoardCard.jsx`

Same pattern: add `onLongPress`, `isLogged` props, spread `longPressHandlers` onto the outer `<Card>`, add the "✓ logged" indicator.

---

### 8. Pass `onLongPress` from `prop-scout-v7.jsx` to Board cards

In `renderBoardCandidateCard(c, i)` (line ~9756):

```js
const pickId = `${currentUser?.userId ?? currentUser?.username}:${c.id}:${boardTab}:${today}`;
const isLogged = loggedPickIds.has(pickId);

const handleLongPress = () => {
  const rawLine = c.propLine?.books?.DK?.line ?? c.propLine?.line ?? c.suggestedLine;
  const bookLine = rawLine != null && Number.isFinite(Number(rawLine)) ? Number(rawLine) : null;
  openAddPickSheet({
    playerId:   String(c.id),
    playerName: c.name,
    gameLabel:  c.gameLabel ?? "",
    market:     boardTab,
    side:       c.lean ?? (c.score >= 55 ? "over" : "under"),
    bookLine,
    source:     "board",
  });
};
```

Pass to both `<PitcherBoardCard>` and `<BatterBoardCard>`:
```jsx
onLongPress={handleLongPress}
isLogged={isLogged}
```

Also wire the same pattern for the second board render location (line ~9035, the
"upcoming" section that renders `<PitcherBoardCard>` / `<BatterBoardCard>` outside
the locked group).

---

### 9. Wire long-press into Props tab rows

In the player row div (line ~8591, the `onClick` row inside `{rows.map((p, i) => {`):

```js
// Market mapping
const PROP_MARKET_MAP = {
  pitcher_strikeouts: "k",
  pitcher_outs:       "outs",
  batter_hits:        "hits",
  batter_home_runs:   "hr",
  batter_total_bases: "hits",
};

const propMarket = PROP_MARKET_MAP[mKey] ?? null;
const propPlayerId = p.playerId ? String(p.playerId) : p.player; // fallback to name if no ID
const propBookLine = p.books?.DK?.line ?? p.books?.FD?.line ?? null;
const propBestOdds = allActiveBooks
  .map(bk => p.books?.[bk]?.overOdds)
  .filter(Boolean)
  .sort((a, b) => parseInt(b) - parseInt(a))[0] ?? null;

const propPickId = `${currentUser?.userId ?? currentUser?.username}:${propPlayerId}:${propMarket}:${today}`;
const isPropLogged = propMarket ? loggedPickIds.has(propPickId) : false;

const selectedGame = activeSlate?.find(g => (g.gamePk ?? g.id) === selectedId);
const propGameLabel = selectedGame
  ? `${selectedGame.away?.abbr ?? selectedGame.away?.name ?? "?"} @ ${selectedGame.home?.abbr ?? selectedGame.home?.name ?? "?"}`
  : "";

const propLongPressHandlers = useLongPress(() => {
  if (!propMarket || !currentUser) return;
  openAddPickSheet({
    playerId:   propPlayerId,
    playerName: p.player,
    gameLabel:  propGameLabel,
    market:     propMarket,
    side:       "over",  // Props tab is always an over context
    bookLine:   propBookLine,
    source:     "props",
  });
});
```

Add `{...propLongPressHandlers}` to the row `<div>` alongside its existing `onClick`.

When `isPropLogged` is true, add a small "✓" indicator next to the player name in the row.

---

## What NOT to Change

- `backend/routes/picks.js` — untouched (Task 138 complete)
- Historical board view (`slateDate !== null`) — do NOT wire long-press on historical cards; picks are for today's slate only. Add a guard: `if (!currentUser || (slateDate && slateDate < today)) return;` before calling `openAddPickSheet`.
- `src/components/GameBoardCard.jsx`, `EdgeCard.jsx` — untouched (game-level cards, not player props)
- Existing `onClick` behavior on all cards — untouched; long-press is additive

---

## Checklist

- [ ] `useLongPress(callback, ms)` hook defined and exported from `src/utils.js`
- [ ] `addPickSheet`, `addPickOdds`, `addPickUnits`, `loggedPickIds` state added
- [ ] `loggedPickIds` populated on mount when `currentUser` is set
- [ ] `openAddPickSheet` checks `loggedPickIds` and shows toast on duplicate
- [ ] `submitAddPick` calls `POST /api/picks` with correct payload and auth header
- [ ] `submitAddPick` handles 409 `already_logged` gracefully with toast
- [ ] `submitAddPick` updates `loggedPickIds` on success
- [ ] Toast mechanism present and rendering
- [ ] Confirm sheet renders with player name, market, side selector, odds + units inputs
- [ ] Side is pre-selected from card's `lean` field (Board) or "over" (Props)
- [ ] "Add Pick" button calls `submitAddPick`
- [ ] Clicking backdrop dismisses sheet
- [ ] `PitcherBoardCard` accepts and uses `onLongPress` + `isLogged` props
- [ ] `BatterBoardCard` accepts and uses `onLongPress` + `isLogged` props
- [ ] "✓ logged" indicator visible on already-logged Board cards
- [ ] Long-press wired in `renderBoardCandidateCard` for both pitcher and batter cards
- [ ] Long-press wired in Props tab player rows
- [ ] `isPropLogged` indicator visible in Props tab rows
- [ ] Historical board guard: no long-press when `slateDate < today`
- [ ] Existing `onClick` behavior unchanged on all cards

---

## After Completing

Reply "Task 139 complete" and confirm:
1. Where `useLongPress` lives (utils.js or inline)
2. How the logged indicator looks on Board cards vs Props rows
3. Whether any edge cases were found with `p.playerId` availability in the Props tab data
