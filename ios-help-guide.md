# iOS Help & Guide Page

## Status: To Build

**Triggered by:** ? icon / "Help" button in the navigation bar or footer
**Presentation:** Full-screen modal (push or sheet), scrollable, sticky header with close button

The web app has a full-screen help overlay accessible from the top nav bar (⚾ icon).
It covers every tab and feature in the app. This doc is the complete content + structure guide so the iOS team can build an equivalent.

---

## Layout Pattern

```
┌──────────────────────────────────────────┐
│  ⚾ CHALK THAT GUIDE           [✕ CLOSE] │  ← sticky header
├──────────────────────────────────────────┤
│                                          │
│  ┌──────────────────────────────────┐    │
│  │ SECTION TITLE (header bar)       │    │
│  ├──────────────────────────────────┤    │
│  │ Content rows, callout boxes,     │    │
│  │ term–definition pairs            │    │
│  └──────────────────────────────────┘    │
│                                          │
│  (next section card)                     │
│  ...                                     │
└──────────────────────────────────────────┘
```

**Section card**: dark background (`#161827`), 1px border, rounded corners (10pt).
**Section header bar**: slightly lighter background (`#1a1c2e`), all-caps monospace label, small font (10pt).
**Term chips**: small rounded pill/chip with a per-section accent color, monospace font.
**Callout boxes**: colored tint background with matching border, for tips and key concepts.

---

## Section 1 — Reading the Slate Card

Explains every element on the game card shown in the Slate (home) view.

| Chip label | Description |
|---|---|
| Selected card | Active game is highlighted in green — tap any card to open. |
| O/U  7  • | The total runs line. Green dot = live odds loaded. Bet over or under. |
| ML  +126 / −148 | Moneyline — odds to win outright. Away team first. + = underdog, − = favorite. |
| O/U Odds  −110/−110 | Juice on the over/under. Uneven odds (e.g. −115/−105) = book shading one side, often where sharp money sits. |
| RL  +1.5(−168) / −1.5(+142) | Runline — always ±1.5 runs. Dog gets +1.5, favorite gives −1.5. Price is in parentheses. |
| NRFI badge | Model leans No Run First Inning at 62%+ confidence. Only shown on green-bordered cards. |
| Temperature / DOME badge | Live weather at game time. Cold suppresses offense. DOME = climate-controlled retractable roof. |
| ↑ OVER / ↓ UNDER badge | Line movement — total shifted from opening number. Sharp bettors often drive these. |
| FINAL score row | Completed games: final score, O/U result (green O / red U), ML winner, RL result, and NRFI/YRFI chip. |
| ● LIVE  3–1 ▼6 | In-progress: away–home runs, ▲/▼ for top/bottom of inning, current inning number. Updates every 60s. |
| ⚠ SP IL | A probable starting pitcher has an active IL placement in the last 14 days. Bullpen game risk — verify before betting K or Outs props. |

---

## Section 2 — Color Guide

**Green → Pitcher Edge (score < 35)**
The pitcher has the advantage. Good for K props and unders.

**Yellow → Neutral (score 35–54)**
No clear edge. Look for other factors before betting.

**Red → Batter Edge (score 55+)**
The batter has the advantage. Good for hit, TB, and HR props.

**Purple → Chat & scout tools**
Used for Chat and AI-driven views (AI Board, Predict tab).

**Quick rule:** Green favors the pitcher, red favors the batter. A red matchup score on a hitter = good spot for hits/TB prop. A green matchup score = good spot for K prop, Outs over, or under.

---

## Section 3 — How the Matchup Score Works

Each batter receives a **0–100 matchup score** based on how they historically perform against the pitcher's specific pitch types.

**Scoring weights:**
- AVG vs pitch type — 45% — How often they get a hit on that pitch
- Whiff rate — 35% — How often they swing and miss (lower = batter wins)
- Slugging vs pitch — 20% — Power when they make contact

**Pitcher Wins / Batter Wins boxes**
Below the overall score, the detail view shows which specific pitch types favor each side.
- "Pitcher Wins: CH · SL" — batter struggles against changeup and slider
- "Batter Wins: FF · SI" — batter handles fastball and sinker well
Even a neutral overall score has a story behind it — use these boxes to see why.

**Pitch scouting notes** (shown per pitch card):
- `"Elite contact vs FF"` — high AVG + low whiff on fastballs
- `"Chases in the dirt"` — high whiff rate on breaking balls below the zone
- `"Severe weakness — high K exposure"` — AVG under .180 or whiff over 40%
- `"Average results vs FS"` — nothing notable

**Handedness penalty**
Same-hand matchups (RHP vs RHB, LHP vs LHB) apply an 8% score reduction across all pitch components. Opposite-hand matchups get no penalty — historically easier for the batter.

**Confidence Meter**
Each prop card shows a 0–100% confidence meter. 70%+ is a strong signal worth acting on.

---

## Section 4 — Overview Tab

Three pre-game cards shown when you open a game:

| Card | What it shows |
|---|---|
| Pitcher Card | Season ERA, WHIP, K/9, BB/9, avg IP/K/PC/ER, sparkline of recent outings, W-L record, and clean-start count (0 ER starts in last 5). Red ⚠ IL badge if the starter has an active IL placement. Use for K props and Outs lines. |
| Lineup Matchup Intel | Counts RHB, LHB, and switch hitters vs the pitcher's hand. Aggregate matchup score across all opposing batters. Flags the top 3 danger hitters by score. Use to lean Over or Under on team runs. |
| Game Lean Card | NRFI lean derived from both SPs' clean-start rate (0 ER starts / recent starts). Quick directional read for NRFI props. |

---

## Section 5 — Intel Tab

Four pre-game context layers:

| Card | What it shows |
|---|---|
| Umpire Card | Home plate ump with SCORECARD LIVE badge when real UmpScorecards data is loaded. Four metrics: Accuracy (overall ball/strike %, avg ~92–93%), vs Exp (points above/below expected — positive is sharper), Consistency (zone reliability), and Favor/Gm (run impact per game). Fallback: historical K Rate / BB Rate estimates. Badge: ACCURATE (≥+0.5% vs expected), INCONSISTENT (≤−1.0%), or PITCHER/NEUTRAL UMP from static data. |
| NRFI / YRFI Card | First-inning scoring tendencies for both teams — scored % of games, avg 1st-inning runs, lean (NRFI or YRFI) with confidence %. NRFI badge on the slate card only shows at 62%+. |
| Bullpen Card | Grade (A–C), fatigue (FRESH / MODERATE / HIGH based on pitches thrown last 3 days), setup depth, L/R balance. Expand the Relievers drawer: ERA, WHIP, Last App, Pitches from last outing, K/9 (10+ = elite), BB/9 (under 3 = sharp). High fatigue + thin depth = lean OVER on totals. |
| Odds & Line Movement | Multi-book table (DK / FD / CZR / MGM / BOV) showing ML, total, O/U odds, and runline per book. Shows PRE-GAME LINES for live and final games (odds API removes live odds at first pitch — last-snapped lines are preserved). Line movement arrow = direction total shifted from opening. DK and FD are sharp books; CZR, MGM, BOV are square — a gap of 0.5+ is a meaningful edge signal (LINE INTELLIGENCE). Preferred book column highlighted. |

---

## Section 6 — Board View

The Board ranks players and games across the full day's slate by algorithmic score.

**Five tabs: HR · Hits · K · Outs · Games**

| Tab | What it scores |
|---|---|
| ⚾ HR | Every batter for HR prop attractiveness. Key factors: SLG/power profile, HR pace, park HR factor, wind direction, batting order, platoon hand. 70+ = multiple factors aligned. |
| 🎯 Hits | Batters for getting at least 1 hit. Key factors: season AVG, last-7 form (heavy weight), park hit factor, batting order, platoon split. Leadoff/2-hole hitters score higher (extra PAs). |
| ⚡ K Props | Starting pitchers for strikeout overs. Key factors: K/9 (career ability), last-3-start avg Ks, park K factor, umpire zone tendencies, WHIP (control). 80+ = elite K pitcher in a favorable environment. |
| 📋 Outs | Starting pitchers for outs recorded (innings pitched) props. Key factors: avg IP over recent starts (biggest signal), WHIP and control, season ERA, park. 80+ = pitcher consistently going 6+ innings with strong control. |
| 🎲 Games | Every game scored on four game-level markets: NRFI / O/U Total / Run Line / Moneyline. Sorted high-to-low: high scores lean the positive side (NRFI / OVER / HOME); low scores lean negative. |

**Games Tab — Sub-tabs:**

| Sub-tab | Scoring factors |
|---|---|
| NRFI | Both SPs' ERA, park HR factor, weather (cold + wind IN = NRFI), umpire zone, historical 1st-inning scoring. 65+ = strong NRFI lean. |
| O/U Total | Both SPs' ERA and WHIP, park HR factor, weather (wind OUT = OVER, cold/wind IN = UNDER), market total for context. 65+ = OVER lean, 35− = UNDER lean. |
| Run Line | SP ERA differential, WHIP differential, home field advantage, ML-implied vs model gap. 65+ = HOME covers. |
| Moneyline | SP ERA matchup, SP command, home field advantage, model vs market gap, park factor. 65+ = HOME ML play. |

⚠ Game board scores improve throughout the day. Best accuracy: 2–3 hours before first pitch.

**WHY? Modal — Factor Breakdown**
Tap any card to open a breakdown of exactly which factors drove the score:

| Element | Description |
|---|---|
| Score (top right) | 0–95 board score. Green = 70+, amber = 55–69, red = 40–54, gray < 40. |
| Factor rows | Each row = one scoring input (e.g. K/9, Park factor, Umpire). Bar fills green/amber/red by contribution. Shows +X / Y points contributed vs max possible. |
| OVER / UNDER lean | 55+ = OVER lean. Below 55 = UNDER lean. |
| Confidence % | 50–85% range. 50% = no edge, 85% = strongest plays. Not a win probability — reflects how many signals are aligned. |

**Board badges:**

| Badge | Tab | Meaning |
|---|---|---|
| ⚖ UMP+K | K Props | Ump historically favors pitchers — tight zone, elevated K rate. Strong K over tailwind. |
| ↑ WIND | HR | Wind blowing out to CF or RF — adds ~5–8% to HR rates. |
| L5 dots | HR, Hits | Last 5 games: green = hit game, dark = hitless. |
| L3 avg K | K Props | Average Ks over the pitcher's last 3 starts. Compare vs the sportsbook line. |
| Prop line | All | DK-posted over line and odds. Synthetic line (~X.X) = no book data yet. |

**💡 How to use the Board effectively:**
1. Start with score 70+. Below 70, you're often leaning on one or two factors.
2. Tap and read the factors — a 75 built on K/9 + umpire + WHIP is more reliable than a 75 built mostly on K/9 alone.
3. Cross-check with the Game tab (full pitcher card, lineup matchups, Intel).
4. Watch for TBD umpires. Ump is one of the highest-weight factors for K Props. Rescore mentally once posted (~3 hrs before first pitch).
5. Outs props need deep starters. If avg IP is below 5.0, shorter starters are risky for outs overs.

**AI Card Summaries & Live Game Locking:**

| Element | Description |
|---|---|
| AI summary line | One-line AI-written summary tuned to the score tier. Green (75+) = confident edge statement. Yellow (55–74) = balanced read. Red (<55) = honest risk assessment. Generated by Claude Haiku. |
| ✦ Premium summary | Cards with board score 75+ get a ✦ badge — summary upgraded to GPT-4o (sharper, cites at least two concrete numbers). |
| Live game locking | When a game goes In Progress, the board locks that game's candidates in place. Shows 🔒 LIVE. Once final, shows ✓ FINAL. Prevents the board from going blank mid-day. |

---

## Section 7 — Props Tab

Shows a multi-book line comparison grid for every player prop market (Strikeouts, HR, Total Bases, Hits) inside a specific game.

| Element | Description |
|---|---|
| Book filter chips | ALL · DK · FD · CZR · MGM · BOV. Preferred book highlighted with ★. Tap to filter; tap again to return to ALL. LINE INTELLIGENCE still runs across all books regardless of filter. |
| DK tag | Small blue DK label on cards = line sourced from DraftKings (live market data, not synthetic). |
| Best line highlight | Book offering the lowest over line is highlighted. When tied, the one with better juice is preferred. |
| Missing books | Books without a posted line are omitted (not shown as blank). Grid fills in as books add markets throughout the day. |

**LINE INTELLIGENCE — Sharp vs Square Gap**
DK and FD are sharp books (move quickly on pro action). CZR, MGM, BOV are square (slower to move). When DK/FD post 6.5 Ks and CZR/MGM show 7.0, sharp money has already priced the pitcher lower — playing 6.5 means playing with the smart money. An **EDGE** badge appears automatically when the gap is ≥ 0.5.

---

## Section 8 — Model Picks Tab

Dedicated view for the algorithmic pick engine. Scores both starting pitchers across every game and surfaces prop setups in tiered cards.

**Tiers:**

| Tier | Score range | Meaning |
|---|---|---|
| HIGH | 65+ | Multiple signals aligned. Strongest plays. |
| MEDIUM | 56–64 | Solid setup with one open question. Do more homework. |
| SPEC | 50–55 | One or two factors favorable. Use as a watch list, not primary pick. |

**LINES grid** — each card shows DK-posted line + juice and a multi-book comparison when available. Synthetic line (~X.X) shown if no book data yet.

**EDGE badge** — appears when the sharp-vs-square gap is ≥ 0.5. The books disagree on where the line should be; the sharper side has typically already moved.

**✦ CARD AGREES badge** — shown when the Daily Card (AI-assisted analysis) independently selected the same pitcher for the same prop type. Two independent systems agreeing is meaningfully stronger than either alone.

---

## Section 9 — AI Board

Same candidates as the Board, run through a second AI scoring layer (Claude Haiku + optional GPT-4o). Produces an independent ranked pick list across five markets: K · Outs · Hits · HR · F5 ML.

| Element | Description |
|---|---|
| AI Score (0–100) | Primary ranking signal. Scored using: algorithmic score (35%), simulation confidence (35%), stat quality (30%). 75+ = strong edge; 55–74 = solid lean; 40–54 = neutral; <40 = weak. |
| Market tabs | K · Outs · Hits · HR · F5 ML (+ All). Each tab shows only candidates for that market, ranked by AI Score. |
| AI reason line | One-sentence AI-written reason per card. K = K rate + opposing lineup K% + umpire or park edge. Outs = avg IP + WHIP. Hits = batter form vs pitcher hand. HR = SLG/power pace + park or wind. F5 ML = SP ERA comparison + environment. |
| ✦ Premium summary | AI Score 75+ = summary upgraded to GPT-4o. Yellow cards balance edge with headwind. Red cards lead with risk. |
| Locked candidates | Game goes In Progress → candidates lock in place (🔒 LIVE). Once final → ✓ FINAL. Prevents board from going blank. |
| Score ≥ 75 refresh | Any candidate scoring 75+ auto-triggers a GPT-4o summary in the background. Card updates in place — no reload needed. |

**💡 How to use AI Board vs the Board:**
- **Board** = algorithmic signal. Use to find plays where raw data lines up.
- **AI Board** = independent AI judgment. When a candidate ranks high on both, that convergence is stronger than either alone.
- **Use Chat** to go deeper — the AI Board rankings are included as context in every Chat request.

---

## Section 10 — Chat Tab

AI assistant with full access to today's Chalk That data — board candidates, AI scores, pitcher stats, sportsbook lines, umpire tendencies, weather, park factors, lineup data, and injury reports.

| Element | Description |
|---|---|
| Quick Chips | Tap-to-send shortcut prompts at the top: "Build me a 3-leg parlay", "Best K props tonight", "Best hits props tonight", "Top plays across all markets", "Any injury alerts?". |
| Board-aware answers | When the AI Board has scored candidates, Chat automatically includes the top 6 per market in every request. Answers return specific picks with AI scores, lines, and reasoning — not generic advice. |
| Parlay builder | "Build me a 3-leg parlay" → selects legs from ranked candidates, prefers legs from different games, mixes markets when possible, estimates combined implied probability, flags correlated legs. |
| Market-specific picks | "Best K props tonight" → filters to K market, ranks top 2–3 candidates with line and reason. Same pattern for hits, outs, HR. |
| Web search | Injury news, lineup changes, or anything time-sensitive triggers a live web search (Tavily). Trigger words: "injury", "lineup change", "latest news", "IL". |
| Confidence score | Stat-based answers include a confidence score + label: HIGH (75+), MEDIUM (60–74), SPEC (50–59), LOW (<50). |
| Daily limit | Each user has a daily message limit that resets at midnight. All Chat messages count toward the limit. |

**💡 Best prompts to try:**
- `"Build me a 3-leg parlay"` — specific parlay from different games with implied probability and reasoning
- `"Act like a professional sports bettor — what are your top plays today?"` — board-aware overview across all markets
- `"Which outs props do you like tonight?"` — filters to outs market, ranks top candidates
- `"Is [pitcher] a good K prop?"` — deep dive on a specific pitcher with board context
- `"Any injury news?"` — triggers live web search for latest injury and lineup updates

---

## Section 11 — Predict Tab

Surfaces plays where the simulation model's win probability is at least 8 percentage points above the sportsbook's implied probability. Only quantified edges against the market are shown.

| Element | Description |
|---|---|
| SIM % | The simulation model's estimated probability that this prop hits (e.g. 72% = model thinks it hits 72 out of 100). |
| BOOK % | Sportsbook's implied probability from posted odds. A −130 line implies ~57%. This is what you're paying for. |
| EDGE pts | Raw gap: SIM% minus BOOK%. +12pts = model is 12 points more confident than the book. Only plays with +8pts or more make the board. Green = 15+pts, yellow = 8–14pts. |
| Markets | K props, Outs, Hits, HR, and F5 ML. Each card shows the market badge and direction (OVER/UNDER or HOME/AWAY for F5 ML). |
| Upcoming / Locked | Upcoming = actionable games not yet started. Once a game goes live or final, plays move to Locked. Locked plays show graded result (HIT ✓ or MISS ✗) once the game ends. |
| HIT / MISS grading | Results graded automatically after each game. Running record shown in the header (e.g. "5/7 hit"). |
| Model Calibration | Chart at the bottom (once games resolve) showing how well SIM percentages track actual outcomes, grouped by confidence band (55–64%, 65–74%, 75–84%, 85%+). |

**Predict vs Board vs AI Board:**
- **Board** — ranks every pitcher/batter by algorithmic signal strength. No sportsbook line required.
- **AI Board** — re-ranks candidates using AI scoring. Still signal-based, not line-dependent.
- **Predict** — only shows plays where model probability is ≥ 8pts above book implied probability. Requires a live sportsbook line. Fewer plays, each with a quantified market edge.

---

## Section 12 — Picks Tab

Personal betting log. Track every play, see live grading as games finish, monitor running record and P&L.

| Element | Description |
|---|---|
| + icon | Every card on Board, Games, Model, AI Board, and Predict has a + circle in the bottom-right corner. Tap to log that play. Turns blue ✓ once logged. Disabled once the game has started. |
| Log Pick sheet | Opens with player/game pre-filled. Choose OVER or UNDER, optionally enter odds and units, tap Add Pick. Odds enable vig-adjusted P&L — skip them for flat unit tracking. |
| PENDING → LIVE → HIT/MISS | Cards update automatically. PENDING before the game, pulsing LIVE badge once it starts, then HIT or MISS graded at final — no refresh needed. |
| PPD | Game postponed or cancelled → pick marked PPD. Void button stays visible for manual removal. |
| SCRATCH | Player doesn't appear in boxscore (late scratch or DNP) → marked SCRATCH. Void button stays visible. |
| PUSH | Exact line hit (e.g. total is exactly 8.0 on an 8-run line) → marked PUSH. Doesn't count toward wins or losses. |
| VOID button | Removes a pick from your log. Only available before a game starts or for PPD/SCRATCH edge cases. Hidden once live or graded. |
| Record tile | Win-loss record across selected date range (ALL / 7D / 30D). |
| Hit Rate tile | Win percentage across resolved picks (excludes pending, push, PPD, scratch). |
| P&L tile | Units profit/loss. Odds logged: vig-adjusted (−110 win = +0.91u). No odds logged: flat +1u per win. Negative = red, positive = green. |
| Collapsible dates | Picks grouped by date. Today always open. Past dates where every pick is graded auto-collapse to summary line (e.g. "Jun 5 · 3/5 hit · +1.2u"). Tap date header to expand/collapse. |
| Historical backfill | Pending picks from previous days are auto-graded on next session open. No manual action needed. |

**💡 Picks tips:**
- Log odds when you have them. Even −110 gives more accurate P&L than flat units.
- Use 7D or 30D filters to track recent performance vs all-time.
- Collapsed date sections still count in RECORD, HIT RATE, and P&L tiles.

---

## Section 13 — Settings

Accessible from the ⚙ gear icon in the footer tab bar.

| Setting | Description |
|---|---|
| Preferred Sportsbook | Sets which book's line and odds appear first throughout the app — Model Pick LINES grids, Board prop lines, and any multi-book display. Options: DK · FD · CZR · MGM · BOV. DraftKings is the default. Tap a book to switch; tap it again to reset to DK. |
| Sign Out | Signs out and clears session token. Preferences are saved server-side and restored on next login. |

---

## Section 14 — Prop Types Explained

| Type | Description |
|---|---|
| K | Pitcher strikeouts — Over/Under on how many batters the starter fans. High K/9 + green matchup score = good over spot. |
| Outs | Pitcher outs recorded — Over/Under on how many outs the starter gets. 3 outs = 1 inning. A line of 17.5 ≈ 6 innings. Elite control (low WHIP + BB/9) and a weak lineup push this over. |
| Hits | Batter hits — typically Over 0.5 hits (get at least one hit) or Under 1.5. Red matchup score = good over spot. |
| TB | Total Bases — single (1), double (2), triple (3), home run (4). Over 1.5 TB is a popular line. |
| HR | Home Run — will this batter hit at least one HR? Looks at power metrics, park factor, and pitcher tendencies. |
| NRFI | No Run First Inning — neither team scores in the 1st inning. Good when both SPs have low first-inning scoring rates and low walk rates. |
| RBI | Runs Batted In — will this batter drive in at least one run? Looks at batting order position, runners on base tendencies, and extra-base hit rate. |

---

## Section 15 — Stat Glossary

| Term | Definition |
|---|---|
| ML | Moneyline — odds to win the game outright. +150 = bet $100 to win $150. −150 = bet $150 to win $100. Minus side is always the favorite. |
| RL | Runline — MLB's point spread, always ±1.5 runs. Favorite gives 1.5 (must win by 2+), underdog gets 1.5 (can lose by 1 and still cover). Price in parentheses is the juice. |
| O/U Odds | Juice (vig) on each side of the over/under total. Standard is −110/−110. Uneven odds (−115/−105) = lopsided action — often a sharp money signal. |
| Line Movement | Change in total or moneyline from its opening number. Sharp bettors move lines early; public bettors later. A line moving against public betting direction = "sharp move." |
| ERA | Earned Run Average — runs per 9 innings. Under 3.00 = elite, 3–4 = solid, 5+ = hittable. |
| WHIP | Walks + Hits per Inning Pitched. Under 1.10 = elite, 1.10–1.30 = average, 1.40+ = concerning. |
| K/9 | Strikeouts per 9 innings. 10+ = high strikeout pitcher. Great for K props. |
| BB/9 | Walks per 9 innings. Under 2.5 = very controlled. |
| AVG | Batting Average — hits divided by at-bats. .300+ = excellent, .250 = average, <.220 = struggling. |
| OPS | On-base Plus Slugging. .900+ = elite, .800 = solid, <.700 = below average. |
| SLG | Slugging Percentage — total bases per at-bat. .500+ = power hitter. |
| wOBA | Weighted On-Base Average — values each outcome by run worth. .340+ = above average. |
| IP | Innings Pitched. Avg IP of 6+ = pitcher usually works deep into games. |
| PC | Pitch Count — average pitches per start. High PC + deep IP = efficient pitcher. |
| K% | Strikeout rate. 28%+ is high for a pitcher; above 25% is concerning for a hitter facing this pitcher. |
| HR Factor | Park Factor for home runs. Over 1.0 = hitter-friendly (inflates HR), under 1.0 = pitcher-friendly. |
| Reliever K/9 | Strikeouts per 9 innings for a bullpen arm. 10+ = swing-and-miss threat. Under 7 = contact-heavy. |
| Reliever BB/9 | Walks per 9 innings for a bullpen arm. Under 3 = sharp control. 5+ = walk-prone, increases YRFI and totals risk. |
| Ump Accuracy | Overall ball/strike call accuracy from UmpScorecards. MLB avg ~92–93%. Shown when live scorecard data is loaded; falls back to K Rate/BB Rate estimates otherwise. |
| vs Expected | Accuracy percentage points above/below expected given pitch difficulty. Positive = sharper than expected. |
| Consistency | How consistently the ump applies the same zone throughout a game. High = reliable, low variance. |
| Favor/Gm | Average absolute run favor per game — how much the ump's calls are worth in cumulative run impact. Values >0.5 = meaningful shift in expected scoring. |
| ACCURATE / INCONSISTENT | Badge on Umpire card when real scorecard data is loaded. ACCURATE = ≥+0.5% vs expected. INCONSISTENT = ≤−1.0% vs expected. |
| PITCHER UMP / NEUTRAL UMP | Badge when real scorecard data isn't loaded. Based on historical K rate estimates. PITCHER UMP = wider zone, above-average K environment. |
| ⚠ IL | Injured List flag — shown next to a player when they have an active IL placement in the last 14 days. Data from MLB Stats API transactions feed, updated every 30 minutes. |

---

## Implementation Notes

**State**: The help page has no dynamic data — it is purely static content. No API calls needed.

**Entry point**: The web app triggers it from a ❓ or ⚾ icon in the top navigation bar. For iOS, a `?` icon in the navigation bar (`UIBarButtonItem`) is recommended. Could also live in a Settings sheet.

**Scroll**: The help page is long. Use a `ScrollView` with section cards stacked vertically. Consider a table of contents at the top with anchor links to each section (optional).

**Fonts**: Web uses monospace (system) for chips and section headers. Use `UIFont.monospacedSystemFont` for chip labels, standard system font for body copy.

**Colors (hex)**:
- Background: `#0b0c17`
- Card background: `#161827`
- Card header bar: `#1a1c2e`
- Border: `#1f2437`
- Chip border: `#2d3148`
- Body text: `#9ca3af`
- White text: `#f9fafb`
- Subtext: `#6b7280`
- Green: `#22c55e`
- Amber: `#fbbf24`
- Red: `#ef4444`
- Blue: `#38bdf8`
- Purple: `#a78bfa`
- Teal (AI Board): `#34d399`
- Chat blue: `#60a5fa`
- Picks blue: `#3b82f6`

**Section accent colors** (used for chip labels per section):
- Slate Card: `#22c55e` (green)
- Overview: `#a78bfa` (purple)
- Intel: `#38bdf8` (blue)
- Board: `#fbbf24` (amber)
- Props: `#38bdf8` (blue)
- Model Picks: `#a78bfa` (purple)
- AI Board: `#34d399` (teal)
- Chat: `#60a5fa` (light blue)
- Predict: `#fbbf24` (amber)
- Picks: `#3b82f6` (blue)
- Settings: `#fbbf24` (amber)
