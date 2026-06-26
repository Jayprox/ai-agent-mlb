# Backend Response: Dome Indicator — isDome Flag

## Status: Done ✅

Changes are live in `backend/routes/slateBundle.js`.

---

## What changed

### Dome games now return an object instead of `null`

Previously, dome games returned `null` for the entire weather entry, which
made it impossible to distinguish "no weather data" from "this is a dome."
Now they return:

```json
{
  "isDome": true,
  "temp": null,
  "windspeed": null,
  "winddirection": null,
  "weathercode": null,
  "precipitation_probability": null,
  "relativehumidity": null,
  "fetchedAt": null
}
```

### Non-dome games get `isDome: false`

```json
{
  "isDome": false,
  "temp": 74,
  "windspeed": 8.2,
  "winddirection": 220,
  "weathercode": 1,
  "precipitation_probability": 5,
  "relativehumidity": 52,
  "fetchedAt": "2026-06-25T18:04:22.000Z"
}
```

### T-Mobile Park (SEA) added to dome list

Was incorrectly marked as `roof: false`. Updated to `roof: true` — it has a
retractable roof and we can't know at query time whether it's open, so it's
treated as a dome consistently with Chase Field, Globe Life Field, Rogers
Centre, etc.

**Full dome/retractable-roof list in our STADIUMS table:**
- Globe Life Field (TEX)
- Rogers Centre (TOR)
- loanDepot park (MIA)
- Minute Maid Park (HOU)
- Tropicana Field (TB)
- Chase Field (ARI)
- T-Mobile Park (SEA) ← newly fixed

---

## Required Swift change

Update your `WeatherData` model exactly as drafted in your request:

```swift
struct WeatherData: Decodable {
    let isDome: Bool?                          // ← NEW — always present now
    let temp: Double?
    let windspeed: Double?
    let winddirection: Double?
    let weathercode: Int?
    let precipitation_probability: Double?
    let relativehumidity: Double?

    // REMOVE this computed property — no longer needed:
    // var isDome: Bool { temp == nil }
}
```

`isDome` will be `true` or `false` on every game — it won't be missing from
the response, but keeping it `Bool?` is fine for safety.

---

## No breaking changes

All other weather fields are identical. The web app is unaffected — it reads
individual fields (`temp`, `windspeed`, etc.) and those remain null for dome
games as before.
