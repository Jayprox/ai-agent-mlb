# Pitcher ERA on Slate Cards — iOS Q&A

## Q1: How does the web app get pitcher ERA for the Slate view?

It's a separate fetch — ERA is **not** in the slate-bundle. When `liveSlate`
loads, the web app fires a background `useEffect` that calls
`/api/players/{pitcherId}/stats?group=pitching` for every probable pitcher on
the slate (both home and away, one call per pitcher):

```js
// fires once per pitcher when liveSlate first populates
apiFetch(`/api/players/${pid}/stats?group=pitching`)
  .then(data => setLivePitcherStats(prev => ({ ...prev, [pid]: data })))
```

The response includes `{ era, whip, kPer9, bbPer9, wins, losses, ip, k, bb }`
— all season stats pulled from the MLB Stats API, cached server-side for 6
hours.

At render time the web app resolves ERA like this:

```js
const homeSPEra =
  parseFloat(livePitcherStats[c.homeSP?.id]?.era) ||
  parseFloat(c.homeSP?.era) ||
  null;
```

Live lookup first, fall back to whatever ERA might be on the slate game object
(usually null).

---

## Q2: Is ERA included in `/api/slate-bundle`?

No. Current slate-bundle response shape:

```js
{ schedule, oddsMap, nrfiMap, weatherMap, fetchedAt }
```

The `schedule` games include `probablePitchers.home/away` with
`{ id, name, hand, isIL }` only — no ERA, WHIP, or K/9.

---

## Q3: Recommended approach for mobile

Don't have mobile make N×2 individual `/api/players/{id}/stats` calls per game
— that's 20–30 requests on a 15-game slate. Instead, extend `slateBundle.js`
to batch-fetch pitcher stats server-side and include them in the bundle as a
`pitcherStatsMap`.

### Backend change — `backend/routes/slateBundle.js`

Add a `pitcherStatsMap` key to the bundle build:

```js
const pitcherStatsMap = {};
const pitcherFetches  = [];

for (const game of schedule) {
  for (const side of ["home", "away"]) {
    const pitcher = game.probablePitchers?.[side];
    if (!pitcher?.id) continue;

    const cacheKey = `pitcher-stats:${pitcher.id}`;
    const cached   = cache.get(cacheKey);
    if (cached) {
      pitcherStatsMap[pitcher.id] = cached;
    } else {
      pitcherFetches.push(
        fetchPitcherStats(pitcher.id)          // calls MLB Stats API
          .then(stats => {
            cache.set(cacheKey, stats, 6 * 60 * 60 * 1000); // 6 hr cache
            pitcherStatsMap[pitcher.id] = stats;
          })
          .catch(() => {})
      );
    }
  }
}

await Promise.allSettled(pitcherFetches);

// include in bundle
const bundle = {
  schedule,
  oddsMap,
  nrfiMap,
  weatherMap,
  pitcherStatsMap,   // ← new
  fetchedAt: new Date().toISOString(),
};
```

`fetchPitcherStats(id)` should call `/api/players/${id}/stats?group=pitching`
internally (or hit the MLB Stats API directly) and return the normalised shape
below.

### Stats shape per pitcher

```js
pitcherStatsMap: {
  "123456": { era: "3.12", whip: "1.08", k9: "9.4", avgIP: "5.2" },
  "789012": { era: "4.01", whip: "1.24", k9: "7.8", avgIP: "5.0" },
  // ...one entry per pitcherId found in probablePitchers across all games
}
```

### Mobile usage

```swift
// pseudocode — adjust to your SlateBundle model
let homeEra = bundle.pitcherStatsMap[game.probablePitchers.home.id]?.era ?? "—"
let awayEra = bundle.pitcherStatsMap[game.probablePitchers.away.id]?.era ?? "—"
```

---

## Caching note

The per-pitcher MLB Stats API calls use a **6-hour server-side cache**. In
steady state (after the first cold build of the day) the pitcher stats are
served from memory — adding `pitcherStatsMap` to the bundle costs essentially
zero extra latency. The slate-bundle itself caches for 5 minutes, so the
pitcher stat fetch overhead only applies during the first cold build after
midnight.
