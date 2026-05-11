# CODEX TASK 109 — Localize All Game Times to User's Browser Timezone

## Problem

Game times are displayed in 3 places using hardcoded ET or raw backend strings instead of the user's local timezone. A user in Hawaii sees "3:07 PM ET" — meaningless to them. `formatLocalTime(isoStr)` already exists at line ~326 and correctly converts any ISO datetime to the browser's local timezone (e.g. "10:07 AM PT", "7:07 AM HST"). It just isn't applied consistently.

**File:** `prop-scout-v7.jsx` only. No backend changes.

---

## 3 fixes — exact search strings provided

### Fix 1 — Board game card subtitle

Search for:
```js
<div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{game.time} · {game.stadium}</div>
```

Replace `{game.time}` with `{formatLocalTime(game.gameTime) ?? game.time}`:
```js
<div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{formatLocalTime(game.gameTime) ?? game.time} · {game.stadium}</div>
```

### Fix 2 — K/Outs board card game time

Search for:
```js
<div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{game.time}</div>
```

Replace with:
```js
<div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{formatLocalTime(game.gameTime) ?? game.time}</div>
```

### Fix 3 — AI Board group header (hardcoded ET)

Search for:
```js
{new Date(group.gameTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET
```

Replace with:
```js
{formatLocalTime(group.gameTime)}
```

The `formatLocalTime` output already includes the timezone abbreviation via `timeZoneName: "short"` — so drop the ` ET` suffix entirely.

---

## What does NOT change

- `formatLocalTime` itself — already correct, no changes needed
- The park factors data (which has `tz: "America/New_York"` fields) — those are coordinate/timezone metadata, not display strings, leave them alone
- Backend time fields — `gameTime` (ISO) and `time` (ET string) both stay as-is
- The `Generated ...` timestamp on the Daily Card (line ~5786) — that shows when the AI card was generated, not a game time; leave it as-is

---

## Validation checklist

1. `npm run build` passes
2. Board HR/Hits game card subtitles show local time with timezone abbreviation (e.g. "10:07 AM PT")
3. K/Outs board cards show local time
4. AI Board group headers show local time — no " ET" suffix
5. No hardcoded `timeZone: "America/New_York"` remains in any rendered game time display (park factors data is fine to keep)

## After completing

Reply "Task 109 complete" with a brief summary of what was changed.
