# WNBA Prop Scout — Scoring Algorithm Design Brief

> **How to use this doc:** Paste this into the WNBA PS chat as a system/context prompt to align the scoring model design with the architecture decisions made on the MLB Prop Scout sister app.

---

## Background

This document outlines a scoring algorithm framework for a WNBA/NBA prop research app — the sister product to an existing MLB Prop Scout tool. The MLB app uses composite 0–95 confidence scores built from weighted signal stacks, one per prop market (K's, Outs, Hits, HR, NRFI, Game Total, etc.). The goal here is to port that same architecture to basketball props, adapting the signals to fit basketball analytics while preserving the design philosophy: **deterministic scoring, no AI in the confidence number, sportsbook lines displayed alongside but never feeding into the score.**

---

## Core Architecture (inherited from MLB)

- Each prop market has its own scoring function (e.g., `pointsScore`, `reboundsScore`, `threesMadeScore`)
- Each function starts at a baseline (40–50) and adds/subtracts weighted points based on signals
- Final score is clamped to 0–95 (recommend capping at 80 for basketball due to higher per-game variance)
- Sportsbook prop line is fetched separately and shown on the card as context — it does **not** feed into the confidence score
- A synthetic line is generated from recent stats as a fallback when no book has posted the market yet
- All scoring is synchronous and algorithmic; AI summarization is a separate optional layer on top

---

## Signal Translation: MLB → Basketball

| MLB Signal | Basketball Equivalent |
|---|---|
| K/9, AVG, SLG (rate stats) | PPG, RPG, APG, 3PM/game |
| Recent L3 starts | Recent L5/L10 game log |
| Park factor | **Pace factor** — high-pace games = more possessions = more counting stats |
| Umpire tendency | **Referee crew foul tendency** — some crews call significantly more fouls (publicly trackable) |
| Platoon split (vs L / vs R) | **Positional defensive rating** — how does this opponent rank defending at this player's position? |
| Weather (wind, cold) | **Back-to-back fatigue** — second night of B2B is the closest analog |
| Batting order (PA exposure) | **Minutes projection** — the single biggest volume lever; gate every prop on this first |

---

## Scoring Approach by Prop Type

### Points
**Baseline: 50**

| Signal | Weight |
|---|---|
| Season PPG vs position average | High — primary driver |
| Usage rate (% of possessions ending on this player) | High — no MLB equivalent, critical |
| L5 PPG recent form | Medium |
| Minutes projection | Gate — apply before all else; low minutes = score entire card down |
| Implied team total (Vegas) | Medium — team implied above league avg boosts all players |
| Pace factor (opponent pace vs league avg) | Medium |
| Opponent positional defense rank | Medium — matchup split equivalent |
| Back-to-back penalty (2nd night) | −3 to −8 depending on player age/usage |
| Referee crew foul tendency | Small bonus for high-FTA players on whistle-heavy crews |

---

### Assists
**Baseline: 45**

| Signal | Weight |
|---|---|
| Season APG | Primary |
| Ball-handler role (primary PG vs off-ball) | Binary gate — massive weight; off-ball scorers rarely crack assist lines |
| Team pace | Medium |
| Teammate shooting efficiency | Medium — assists require makes; bad shooting teams suppress assist totals |
| Opponent transition defense | Moderate — teams that limit transition suppress easy dimes |
| L5 APG form | Medium |
| Turnover rate of opposing defense | Small — sloppy teams generate more live-ball opportunities |

---

### Rebounds
**Baseline: 45**

| Signal | Weight |
|---|---|
| Season RPG (total, offensive, defensive split) | Primary |
| Rebounding rate (pace-adjusted, more meaningful than raw RPG) | High |
| Opponent's rebounding rank (boards surrendered) | Medium |
| Matchup size — small-ball lineup = rebounding opportunity | Medium |
| Minutes projection | Gate |
| Team rebounding style (crash vs push in transition) | Small |

---

### 3-Pointers Made
**Baseline: 40**

Most like the HR board — rate × volume × opportunity.

| Signal | Weight |
|---|---|
| Season 3PM/game | Primary |
| 3-point attempt rate (does the offense generate open 3s for this player?) | High |
| 3P% (season + L10) | Medium |
| Opponent 3P defense rank | Medium — elite closeout teams suppress made 3s significantly |
| Pace factor | Medium |
| Home/away split | Small — crowd noise has a measurable effect on shooting % |

---

### Steals
**Baseline: 35**

Low-frequency event — cap confidence at ~72 to reflect high variance.

| Signal | Weight |
|---|---|
| Season SPG + steal rate | Primary |
| Opponent ball-handling quality (turnover rate) | Medium — sloppy teams generate more steal opportunities |
| Defensive scheme (press/aggressive vs passive) | Medium |
| Foul trouble risk | Negative modifier — aggressive defenders who foul out suppress steal upside |
| Minutes projection | Gate |

---

### Blocks
**Baseline: 35**

Same structure as steals; cap at ~72.

| Signal | Weight |
|---|---|
| Season BPG + block rate | Primary |
| Opponent paint attack rate (drives, rim FGA%) | High — teams that attack the rim create more block opportunities |
| Opponent FGA distribution (rim vs mid-range vs 3) | Medium |
| Foul trouble risk | Negative modifier — same concern as steals |
| Minutes projection | Gate |

---

### Double Doubles
**Different model — threshold probability composite.**

Compute two independent sub-scores then combine:

```
P(pts ≥ 10) × P(reb ≥ 10) × 100 + momentum bonus
```

- Derive `P(pts ≥ 10)` and `P(reb ≥ 10)` from the player's per-game averages and variance (use L10 std dev as proxy)
- Apply matchup modifiers to each sub-score independently
- Add a momentum bonus if the player has recorded a DD in 3+ of last 5 games
- For guard DDs (pts + ast), substitute `P(ast ≥ 10)` for the rebounds component
- This is the most unique prop type in the set and benefits from its own dedicated card design

---

### First Basket
**Binary outcome model — closer to NRFI than a counting stat.**

Output is a **lean + implied probability**, not a linear 0–95 score.

| Signal | Weight |
|---|---|
| First possession tendency (scripted first plays for certain teams) | High |
| Early touch rate in L10 (who dominates first 2-min possessions) | High |
| Tip win probability (team expected to win tip) | Medium |
| Player type — early-offense creator vs spot-up shooter vs post player needing touches | Medium |
| Recent FBS history (some players consistently get early looks) | Medium |

Display as a ranked list with implied probabilities per player, not a confidence bar. Analogous to how NRFI lean is shown in the MLB app.

---

## Key Differences from MLB to Design Around

### 1. Minutes are the first gate — always
In baseball, every batter gets roughly equal PA exposure. In basketball, minutes are variable and news-driven. Build a **minutes projection layer** that runs before any other signal. If a player is questionable, on a minutes restriction, or on a B2B, apply a downward multiplier to the entire score before prop-specific signals run.

### 2. Implied team total is a direct input
Vegas sets an implied points total per team (game total split by spread). A team implied at 125 vs league avg 115 means more counting stats are available across that roster. Apply this as a multiplier early — it affects Points, Assists, Rebounds, and 3PM props all together.

### 3. Usage cascades on missing teammates
When a star sits out, their 25–30% usage redistributes to 2–3 other players. The algorithm should detect when a high-usage teammate is confirmed out and automatically boost the next-man-up's baseline before prop-specific signals run. The market is consistently slow to reprice this — it's a repeatable edge.

### 4. Blowout / game script risk
Heavy favorites (−12 or more) carry meaningful risk of starters being pulled in Q4. A player who averages 34 minutes may only play 26 in a blowout win. Apply a blowout risk modifier that trims confidence downward for the **favored team's players** when the spread is large. Underdog players on the losing side are less affected because they play through.

### 5. WNBA lines are less efficient than NBA
The WNBA props market is thinner, slower to reprice, and less covered by sharp money. A confidence score of 68 in WNBA carries more implied edge than the same 68 in NBA. Consider communicating this to users — the bar for action is effectively lower on the WNBA side of the app.

### 6. Individual defensive matchup data
Second Spectrum (Genius Sports) tracks who guards whom on every possession. Certain defenders neutralize specific scorers regardless of team-level defensive ratings. This is more precise than positional defensive rank — the real equivalent of the MLB platoon split. Sourcing this data (or proxying it through known defensive assignments) would meaningfully improve the matchup signal.

### 7. Correlated prop flagging
Unlike baseball, certain basketball props are naturally correlated. A primary ball-handler having a big points night almost always means a big assists night. Flag these correlations explicitly on the card rather than treating each prop as independent:
- **Points + Assists** (ball-handlers) — positively correlated
- **Points + Rebounds** (big men) — positively correlated  
- **Points + 3PM** (shooters) — positively correlated
- **Steals + Blocks** (defensive specialists) — moderately correlated

Surface "correlated opportunity" callouts when the algorithm likes multiple props for the same player on the same night.

### 8. Variance is higher per game
A .300 hitter's hit line is stable game to game. A 20 PPG scorer can go for 8 or 38. Cap maximum confidence at **80** (vs 95 for MLB) to reflect this inherent variance. The scoring engine can still produce 80+ internally but display-cap at 80 to avoid overclaiming certainty.

---

## Suggested Board Tab Structure

Mirroring the MLB app's Board view:

| Tab | Content |
|---|---|
| **Points** | Top batter candidates ranked by pointsScore |
| **Rebounds** | Top candidates ranked by reboundsScore |
| **Assists** | Top candidates ranked by assistsScore |
| **3PM** | Top candidates ranked by threesMadeScore |
| **K's (Steals+Blocks)** | Combined defensive props board |
| **Games** | Team-level totals, spread, first-basket leans |

---

## Data Sources to Target

- **NBA Stats API** — official, free, similar to MLB Stats API in structure
- **WNBA Stats API** — exists, less robust, but covers core box score and season stats
- **Basketball Reference / pbpstats.com** — pace-adjusted stats, lineup data
- **The Odds API** — covers WNBA props (same integration as MLB app)
- **Genius Sports / Second Spectrum** — individual defensive matchup data (licensed)
- **Referee crew assignments** — publicly posted night-of by NBA officials; scrape or use a community source like official-ref.com

---

*Prepared from MLB Prop Scout architecture sessions — for use as WNBA PS scoring design brief.*
