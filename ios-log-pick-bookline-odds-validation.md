# iOS "Log Pick" button disabled without Book Line / Odds — not required by API

## TL;DR

The Log Pick sheet currently disables the **LOG PICK** button unless either
**Book Line** or **Odds** is filled in. The backend (`POST /api/picks`) does
**not** require either of these — please relax this client-side validation so
picks can be logged with both fields empty.

## What the backend actually requires

`backend/routes/picks.js`:

```js
router.post("/", async (req, res) => {
  const {
    playerId, playerName, gameLabel, market, side,
    bookLine, odds, units, slateDate, source,
  } = req.body ?? {};

  if (!playerId || !market || !side || !slateDate) {
    return res.status(400).json({ error: "playerId, market, side, slateDate required" });
  }
  ...
```

Only `playerId`, `market`, `side`, and `slateDate` are required.
`bookLine` and `odds` are both optional and stored as `null` if omitted:

```js
bookLine ?? null,
odds ?? null,
```

## How the web handles this

The web's submit handler (`submitAddPick` in `prop-scout-v7.jsx`) only
validates `odds`/`bookLine` *if the user typed something* — empty fields are
sent through as `null` with no blocking validation:

```js
const oddsVal = addPickOdds.trim() !== "" ? parseInt(addPickOdds.trim(), 10) : null;
...
if (oddsVal !== null && !Number.isFinite(oddsVal)) {
  showToast("Invalid odds — use e.g. -125 or +110");
  return;
}
```

This is common for game-level markets (NRFI/Total/Spread/ML) where no line
was available at compute time — the web logs these all the time with
`bookLine: null`.

## What we need from iOS

Update the Log Pick sheet's button-enabled logic so **LOG PICK** is enabled
once `playerId` (or gamePk for game markets), `market`, `side`, and
`slateDate` are present — regardless of whether Book Line / Odds are filled.
Both can remain optional, free-entry fields; just don't gate the submit
button on them.

## Side note (separate, lower-priority): market casing for game markets

While testing an NRFI log from the Games board, the Market picker showed
"NRFI" (uppercase). If that literal uppercase string is what gets sent in
`market`, it could cause a mismatch later — `board_card_snapshots` (used for
auto-grading) stores lowercase market keys (`"nrfi"`, `"total"`, `"spread"`,
`"ml"`, etc.), and the grading join does an exact-string match
(`bcs.market = p.market`). If `market` is sent as `"NRFI"` instead of
`"nrfi"`, the pick will log fine but likely never auto-grade. Worth a quick
check on what string is actually being submitted for `market` — if it's
already lowercase under the hood and "NRFI" is just display text, no change
needed.

`side` (e.g. `"YRFI"`/`"NRFI"`) is fine as-is — the backend doesn't validate
`side` against an enum, it's stored as free text, and the web sends the same
uppercase strings (`c.lean`).
