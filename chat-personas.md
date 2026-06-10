# Prop Scout iOS — Chat Personas

## Problem

The iOS Chat tab refuses to build parlays, responding with something like
"I only recommend single bets." The web app builds parlays correctly with
the same prompt.

**Root cause:** the iOS app is sending requests without a `persona` field,
so the backend defaults to `"pro"` — which has "Singles only. No parlays."
hardcoded into its system prompt.

---

## Two personas

The backend (`POST /api/advisor`) supports two personas controlled entirely
by the request body. The system prompt — and therefore the AI's behavior —
is completely different between them.

### `"pro"` (default when omitted)
- Singles only, no parlays
- Targets odds between -200 and +150
- Requires 3+ aligned signals before recommending
- Returns `type: "picks"` with 3–6 individual plays
- `parlay` field in response is always `null`

### `"lotto"`
- Actively builds 2–4 leg parlays
- Targets +200 or better odds
- Finds high-upside angles where a prop could exceed the line significantly
- Returns `type: "lotto"` with individual picks AND a `parlay` object
- Shows combined parlay odds and reasoning

---

## Request

Always send `persona` in the request body:

```json
{
  "messages": [
    { "role": "user", "content": "Build me a 3-leg parlay" }
  ],
  "persona": "lotto"
}
```

The backend selects the persona at:
```js
const persona = ["pro", "lotto"].includes(body.persona) ? body.persona : "pro";
```

Any value other than `"pro"` or `"lotto"` silently falls back to `"pro"`.

---

## Response shapes

### Pro response (`persona: "pro"`)
```json
{
  "type": "picks",
  "content": null,
  "picks": [
    {
      "player": "Gerrit Cole",
      "team": "NYY",
      "opponent": "BOS",
      "market": "pitcher_strikeouts",
      "marketLabel": "Pitcher Strikeouts",
      "line": 7.5,
      "lean": "OVER",
      "odds": "-130",
      "confidence": "HIGH",
      "reasoning": "Cole averages 8.3 K over his last 3 starts...",
      "signals": ["K/9 11.2", "L3 avg 8.3 K", "Ump +2.1 K/9"]
    }
  ],
  "parlay": null,
  "messagesUsedToday": 3,
  "maxMessagesPerDay": 20
}
```

### Lotto response (`persona: "lotto"`)
```json
{
  "type": "lotto",
  "content": null,
  "picks": [
    {
      "player": "Aaron Judge",
      "team": "NYY",
      "opponent": "BOS",
      "market": "batter_home_runs",
      "marketLabel": "Home Run",
      "line": 0.5,
      "lean": "OVER",
      "odds": "+380",
      "confidence": "SPEC",
      "reasoning": "Judge has a 16.2% barrel rate...",
      "signals": ["Barrel% 16.2%", "Wind out", "Park factor 118"]
    }
  ],
  "parlay": {
    "legs": ["Judge HR (+380)", "Cole OVER 8.5 K (-115)"],
    "combinedOdds": "+380",
    "reasoning": "Independent markets across two games — low correlation risk."
  },
  "messagesUsedToday": 4,
  "maxMessagesPerDay": 20
}
```

### Message response (research/follow-up, either persona)
```json
{
  "type": "message",
  "content": "Based on tonight's slate...",
  "picks": null,
  "parlay": null,
  "messagesUsedToday": 5,
  "maxMessagesPerDay": 20
}
```

---

## UI recommendations

### Persona selector
Add a segmented control or toggle at the top of the Chat tab:

```
[ Pro ]  [ Lotto ]
```

Store the selected persona in local state and pass it with every request.
Default to `"pro"`.

### Rendering picks
Both `"picks"` and `"lotto"` type responses return the same `picks` array
shape — render them the same way (player, market, line, lean, odds,
confidence badge, reasoning, signals chips).

### Rendering the parlay card
When `response.parlay != null` (lotto persona only), render a separate
parlay card below the individual picks:

- Title: "Suggested Parlay"
- Legs: bulleted list of `parlay.legs`
- Combined odds: `parlay.combinedOdds` (highlight in brand amber/green)
- Reasoning: `parlay.reasoning`

### Confidence badge colors
| Value | Color |
|-------|-------|
| `"HIGH"` | brandGreen |
| `"MEDIUM"` | brandAmber |
| `"SPEC"` | brandPurple |

---

## confidence values

| Value | Meaning |
|-------|---------|
| `"HIGH"` | 3+ aligned signals, strong conviction |
| `"MEDIUM"` | 2 signals, one question mark |
| `"SPEC"` | Interesting angle, limited or mixed data |

---

## Notes

- The persona only affects the system prompt — all other request/response
  fields, auth, daily limits, and error codes are identical between personas.
- The `parlay` field is always present in the response envelope but will be
  `null` for `"pro"` responses and for `"message"` type responses.
- See `chat-api.md` for full auth, daily limit, and error response details.
