# Lineup — batSide Already in Response

`batSide` is included in the current lineup response from the update
we shipped earlier today. No backend changes needed — this is a display
wire-up on the iOS side.

## Field location

```json
{
  "id": 123456,
  "name": "James Wood",
  "order": 1,
  "position": "DH",
  "batSide": "L",     ← already present
  "avg": ".258"
}
```

## Values

| Value | Meaning | Display suggestion |
|---|---|---|
| `"L"` | Left-handed batter | `L` badge or left-hand icon |
| `"R"` | Right-handed batter | `R` badge |
| `"S"` | Switch hitter | `S` badge |
| `null` | Unknown (very rare) | Omit or show `—` |

Suggest displaying it inline with position and avg:
```
DH  .258  L
```
or as a small badge next to the player name — consistent with how
the web app shows hand indicators on batter rows.
