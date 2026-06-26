# iPad Adaptive Layout — Prompt for iOS Team

## Context

The Slate tab already has a working master-detail split view on iPad (game list on
the left, game detail on the right). We want every other tab to use the same
adaptive logic — matching the web app's behavior where layout changes based on
available width.

---

## How the web app does it

```js
const [windowWidth, setWindowWidth] = useState(window.innerWidth);
const isNarrowPhone = windowWidth <= 430;   // compact: phone-style stack
// windowWidth > 640 → wider layouts: 2-column grids, side-by-side sections
// maxWidth: 960, margin: "0 auto" → content never stretches beyond 960pt, stays centered
```

Everything in the web app is driven by that one `windowWidth` value — grids go
from 1 to 2 columns, flex rows vs columns, font size adjustments, padding, etc.

---

## What we want in React Native

Mirror this with `useWindowDimensions()`:

```js
import { useWindowDimensions } from 'react-native';
const { width } = useWindowDimensions();
const isNarrowPhone = width <= 430;   // iPhone, Slide Over
const isWide = width >= 768;          // iPad full-screen and most Split View sizes
```

---

## Apply per tab — using Slate as the reference implementation

- **Board / AI Board** — already a list-based tab. On `isWide`: left pane (~360pt)
  = the scored card list; right pane = expanded card detail (the stats breakdown
  that currently requires a tap + scroll). On `isNarrow`: current stacked behavior,
  no change.

- **Picks** — on `isWide`: left pane = pick list; right pane = expanded pick detail
  / performance summary. On `isNarrow`: current stacked behavior.

- **Chat** — on `isWide`: left pane (~360pt) = suggestion chips, daily limit badge,
  Pro/Lotto toggle; right pane = conversation thread, message width capped at ~700pt.
  On `isNarrow`: current stacked behavior.

- **All other tabs** — apply `maxWidth: 960` centering within the full screen width
  so content doesn't stretch to fill 1200pt on a large iPad.

---

## Key instruction

**Slate is the template.** Whatever state management pattern (selectedItem → show
detail pane) and the `isWide` branch the Slate tab uses — copy that exact structure
for each of the tabs above. Don't reinvent it; just parameterize it.

---

## Test matrix

| Device | Expected size class |
|---|---|
| iPhone SE | Compact — phone layout |
| iPhone 15 Pro | Compact — phone layout |
| iPad full-screen | Regular — split view |
| iPad 50/50 Split View | May be compact — phone layout |
| iPad Slide Over | Compact — phone layout |
