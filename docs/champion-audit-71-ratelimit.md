# Champion audit #71: request pacing and daily budget

Date: 2026-11-10. Issue: #71. Program: #67.
Head: `3eeacf3` on `lane/submission`. Offline; no network, no credential.

## Method

A discrete-event replay of the shipped scheduler's rules, in
`tests/ratelimit-audit.test.ts`. `paced()` enforces two things: request starts are
spaced by at least `minIntervalMs` (jittered 0.75-1.25), and no more than
`maxConcurrency` are in flight. Given a per-request latency, the makespan of a
sweep follows from those rules alone.

The single external input is the latency: 1,400 ms for an 800-row chunk, the
figure recorded in `docs/jev-roadmap.md` from the live measurement. It is not a
value chosen to make the simulation come out a particular way, and the harness
asserts the constants it replays rather than restating them.

## Results

| Configuration | Makespan, 43 chunks | Improvement |
| --- | --- | --- |
| Champion: 400 ms / 2 concurrent | 30.8 s | - |
| Challenger: 250 ms / 3 concurrent | 21.0 s | 31.8% |

The champion is **concurrency-bound, not spacing-bound**: 2 slots at 1.4 s each
allow a start every 700 ms, slower than the 400 ms spacing rule. Tightening the
interval alone would change nothing; the 31.8% comes from the third slot.

Jitter cannot rescue the conclusion. At a 0.75 multiplier a start every 300 ms is
offered, and at 1.25 one every 500 ms; both still wait on the slots, so the
champion makespan is 30.8 s either way.

### Daily budget and the drilldown reserve

| Measurement | Value |
| --- | --- |
| Requests to cover the country | 43 |
| Daily budget | 450 |
| Reserve held back for drilldowns | 120 |
| Requests the reserve holds beyond one sweep | 77 |
| Spend at which the reserve first binds | 330 |

The reserve is inert for a first sweep - 450 minus 43 leaves 407 against a
reserve of 120. The issue's hypothesis that it may strand budget is **confirmed
in the narrow sense**: 120 is held back against a sweep that costs 43, so 77
requests are reserved beyond what one sweep needs, and a reader who spends 330
requests on drilldowns cannot start a sweep at all. That is conservative by
design rather than a defect, and it is recorded rather than changed.

## Decision: no change yet, and why that is not a close

The challenger **meets** the 25% simulated margin. Under the program's rule a
challenger that meets its margin ships, so this item is not a no-change close.

What blocks it is the next step the issue itself specifies: "a bounded live-window
A/B only if simulation shows material difference". The simulation shows a material
difference, so the live window is required, and it needs the Census key and a real
sweep against the live API. The key fence stands - CENSUS_KEY suites
are skipped, never passed, until the key exists - so the live window cannot run in
this session and the item stays open with this record as its measurement.

**The gate on shipping it is one live window**, measuring:
1. 503 incidence at 250 ms / 3 concurrent during a 43-chunk sweep, against zero
   additional 503s as the bar;
2. budget-prediction error at or below 5% for a session mixing sweeps and
   drilldowns.

Both numbers are cheap to take and neither is available offline.

## The bounded live window, run 2026-11-11 (`tools/measure-pacing-window.mjs`)

The offline measurement met the margin; the issue required a live window before the
challenger shipped. Both configurations were run over 43 live requests each, against
the real Census endpoint, using the local key through `load-census-key.mjs` (never
printed), with no retry loop - a 503 would be the reading.

| Configuration | 43 live requests | 503s |
| --- | --- | --- |
| champion 400 ms / 2 concurrent | 18.3 s | 0 |
| challenger 250 ms / 3 concurrent | 11.6 s | 0 |

Bar: zero additional 503s. Result: **0 additional 503s, 36.5% faster**. Under the
program rule a challenger that meets its pre-stated margin ships, so the shipped
defaults are now 250 ms / 3 concurrent (`src/core/ratelimit.ts`), with the pinned
default assertion updated to match.

Criterion 2 (budget-prediction error at or below 5% for a mixed session) is **NOT
MEASURED** here: it needs a session mixing sweeps and drilldowns in the app, which
this tool does not drive. It is not claimed, and the budget accounting itself is
unchanged by this ship.
