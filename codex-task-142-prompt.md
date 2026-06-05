# CODEX TASK 142 — Replace Long-Press with Tap Icon for Add Pick

## Goal

Remove the long-press gesture from `BatterBoardCard` and `PitcherBoardCard` and
replace it with a small tappable `+` / `✓` icon in the top-right corner of each
card. Also remove all long-press wiring in `prop-scout-v7.jsx`.

---

## Behaviour spec

### Icon states

| Condition | Icon | Color |
|-----------|------|-------|
| Not logged, game is upcoming or live | `+` | `#6b7280` (gray), brightens to `#f9fafb` on hover |
| Not logged, game is FINAL | `+` | `#374151` (muted gray), `cursor: not-allowed`, not clickable |
| Logged (regardless of game state) | `✓` | `#3b82f6` (blue), not clickable |

"Game is FINAL" means `boardGameStatus === "FINAL"`.

### Tap behaviour

- Tapping the `+` icon calls `onAddPick()` (new prop — replaces `onLongPress`).
- The tap must **not** bubble to the card's `onClick` (use `e.stopPropagation()`).
- When disabled (FINAL or already logged), the button renders but does nothing on
  click and shows `cursor: not-allowed` (logged) or `cursor: default` (FINAL).

### Icon appearance

```
position: absolute
top: 6px
right: 8px
width: 18px
height: 18px
border-radius: 50%
font-size: 12px
font-weight: 800
display: flex, align-items: center, justify-content: center
border: 1px solid (match icon color with ~0.4 opacity)
background: transparent
cursor: pointer (active) | not-allowed (logged) | default (FINAL)
```

Active `+` button background on hover: `rgba(249,250,251,0.08)`.

---

## Files to change

### 1. `src/components/BatterBoardCard.jsx`

**Props change:**
- Remove `onLongPress` prop
- Add `onAddPick` prop

**Remove:**
- `import { ..., useLongPress } from "../utils.js";` — remove `useLongPress` from import
- `const longPressHandlers = useLongPress(onLongPress ?? (() => {}));`
- `{...longPressHandlers}` spread on `<Card>`

**Replace the `isLogged` block** (currently renders `✓ logged` text) with the
new icon button:

```jsx
{/* Add pick / logged icon — top-right corner */}
<button
  onClick={(e) => {
    e.stopPropagation();
    if (!isLogged && boardGameStatus !== "FINAL") onAddPick?.();
  }}
  style={{
    position: "absolute", top: 6, right: 8,
    width: 18, height: 18, borderRadius: "50%",
    fontSize: 12, fontWeight: 800,
    display: "flex", alignItems: "center", justifyContent: "center",
    border: isLogged
      ? "1px solid rgba(59,130,246,0.4)"
      : boardGameStatus === "FINAL"
        ? "1px solid rgba(55,65,81,0.4)"
        : "1px solid rgba(107,114,128,0.4)",
    background: "transparent",
    color: isLogged ? "#3b82f6" : boardGameStatus === "FINAL" ? "#374151" : "#6b7280",
    cursor: isLogged ? "not-allowed" : boardGameStatus === "FINAL" ? "default" : "pointer",
  }}
  title={isLogged ? "Already logged" : boardGameStatus === "FINAL" ? "Game over" : "Log pick"}
>
  {isLogged ? "✓" : "+"}
</button>
```

---

### 2. `src/components/PitcherBoardCard.jsx`

Same changes as `BatterBoardCard.jsx` above — identical pattern, identical icon
block. The only difference is this card has `pitcherMetrics` instead of `evEdge`
but the icon block is in the same position.

**Remove:**
- `useLongPress` from import
- `const longPressHandlers = ...`
- `{...longPressHandlers}` on `<Card>`
- Existing `isLogged` text block

**Add** the same icon button as above.

---

### 3. `prop-scout-v7.jsx`

**In `renderBoardCandidateCard`** (around line 9986):

Find the `handleLongPress` function and rename/repurpose it to `handleAddPick`.
No logic change needed — it already calls `openAddPickSheet(...)`.

```js
// BEFORE
const handleLongPress = () => { ... openAddPickSheet(...) };
// AFTER
const handleAddPick = () => { ... openAddPickSheet(...) };
```

Then update both card render calls:

```jsx
// PitcherBoardCard — change:
onLongPress={handleLongPress}
// to:
onAddPick={handleAddPick}

// BatterBoardCard — change:
onLongPress={handleLongPress}
// to:
onAddPick={handleAddPick}
```

There is a second `BatterBoardCard` render around line 9255 (the AI Board section).
Search for ALL occurrences of `onLongPress={handleLongPress}` and replace with
`onAddPick={handleAddPick}`. There should be exactly 2 batter and 1 pitcher call
site in this function.

---

## What NOT to change

- Do not modify the `openAddPickSheet` function or anything in the confirm sheet.
- Do not modify `useLongPress` in `src/utils.js` — leave it in place (other code
  may use it in future).
- Do not change the `isLogged` guard logic in `openAddPickSheet` (historical date
  check stays).
- Do not touch backend files.

---

## Verification

After the change:
1. Board cards each show a small circular icon in the top-right corner.
2. Tapping `+` on an upcoming/live game opens the confirm sheet.
3. Tapping anywhere else on the card still opens the Why modal (card click).
4. Cards for FINAL games show a muted `+` that does nothing when clicked.
5. Already-logged cards show a blue `✓` that does nothing when clicked.
6. No console errors about `onLongPress` being an unrecognised prop.
