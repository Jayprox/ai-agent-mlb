# AI Board edges: `bookLine` / `bookOdds` are always `null` — backend bug (fix incoming)

## TL;DR

This is **not** an iOS decoding issue and it's **not** that `_candidate.propLine`
is missing from the response shape. It's a backend bug: `dailyAiSnapshot.js`
overwrites the correctly-computed `bookLine`/`bookOdds` with `null` right
before saving the snapshot, for **every** edge on **every** market. Once we
fix it, iOS should read the **top-level** `bookLine` / `bookOdds` /
`impliedProb` fields on each edge (Option B) — don't build a model around
`_candidate.propLine`.

## What's actually happening

`/api/ai-board/edges` returns pre-computed rows from the `ai_board_edges`
table, written once or twice a day by `backend/jobs/dailyAiSnapshot.js`.

Earlier in that job, each candidate is built by `mapCandidate()` /
`mapGameCandidate()` (in `src/board/index.js`), which **correctly** computes
and sets top-level:

```js
{
  ...
  bookLine,      // e.g. 1.5
  bookOdds,      // e.g. -115
  impliedProb,   // e.g. 0.58
  edge,
  lean,
  _candidate: c, // the raw underlying candidate
}
```

But the *final* step in `dailyAiSnapshot.js` (lines ~283-289) re-maps every
candidate before saving, and accidentally clobbers those two fields:

```js
const edges = allCandidates.map(c => ({
  ...c,
  aiScore:  aiScores[c.id]?.aiScore  ?? ...,
  aiReason: aiScores[c.id]?.aiReason ?? null,
  bookLine: c.propLine?.books?.DK?.line ?? c.propLine?.books?.FD?.line ?? c.suggestedLine ?? null,
  bookOdds: c.propLine?.books?.DK?.overOdds ?? null,
}));
```

At this point `c` is already the *mapped* candidate — `c.propLine` and
`c.suggestedLine` don't exist on it (they're nested one level down, under
`c._candidate.propLine` / `c._candidate.suggestedLine`, and only for
player-prop markets — see below). So both expressions evaluate to `null`,
and overwrite the perfectly good `bookLine`/`bookOdds` that `...c` already
had from `mapCandidate`/`mapGameCandidate`.

**Net result: every saved edge has `bookLine: null` and `bookOdds: null`,**
regardless of market (k/outs/hr/hits/f5ml/nrfi/total/ml).

## Re: the `_candidate.propLine` question specifically

To directly answer "does the API populate `_candidate.propLine`":

- **Player-prop markets (k, outs, hr, hits):** `_candidate` is the raw board
  candidate, and `_candidate.propLine.books.{DK,FD,CZR,MGM}.{line, overOdds,
  underOdds}` **is** populated when the odds feed has a matching prop line
  for that player/market. So it's not missing here — it has real data.
- **Game markets (nrfi, total, ml, f5ml):** `_candidate` comes from a
  completely different code path (`computeGameBoard`) and has **no
  `propLine` field at all** — never has, by design. These use `_candidate.line`
  / `_candidate.odds` instead.

So `_candidate.propLine` is inconsistent across markets even when it's
"working" — it's not a reliable place for iOS to read odds from either way.

## The fix (backend, in progress)

Remove/fix the `bookLine`/`bookOdds` overrides in `dailyAiSnapshot.js`'s
final `edges` map — `...c` already carries the correct values computed by
`mapCandidate`/`mapGameCandidate`, so those two lines should just be deleted
(or at minimum guarded so they don't overwrite with `null` when the
candidate doesn't have a top-level `propLine`).

(Separately, the `total`/`nrfi`/`ml` game candidates aren't run through
`mapGameCandidate` at all before this step, so they're also missing `id`,
`market`, and `entityId` on the saved edge — that's a related but distinct
issue we'll need to fix in the same pass.)

## What iOS should do

Once the backend fix lands:

- Read **top-level** `edge.bookLine`, `edge.bookOdds`, `edge.impliedProb` —
  these will be populated for every market that has odds data available.
- Don't model around `_candidate.propLine` — it only exists for
  k/outs/hr/hits candidates and has a different shape than the top-level
  fields. Treat `_candidate` as debug/internal data, not part of the
  contract.
- `bookOdds`/`bookLine` can still legitimately be `null` if no matching
  book line was found for that player/market that day — that's expected and
  fine to hide the odds display in that case (same as the Predict tab does
  today: `c.bookOdds != null && <show odds>`).
