# Champion audit #70: national sweep chunking

Date: 2026-11-10. Issue: #70. Program: #67.
Head: `3eeacf3` on `lane/submission`. Offline; no network, no credential.

## Method

Exact, not sampled. The partition input is the committed ZCTA index
(`public/map/zcta-places.json`, 33,791 codes, decoded with the shipped
`decodeZips`), and the request shape is the shipped `geographyClause`. The
harness is `tests/sweep-chunking-audit.test.ts`.

The URL model is calibrated against the four live measurements already recorded
in `src/core/sweep/chunk.ts` (2026-09-29), and the harness asserts the model
reproduces all four exactly. That is what makes the rest of the table a
measurement of the shipped request rather than an estimate of it:

| ZCTAs | Recorded URL chars | Model |
| --- | --- | --- |
| 800 | 6,542 | 6,542 |
| 900 | 7,342 | 7,342 |
| 950 | 7,742 | 7,742 |
| 1,000 | 8,142 | 8,142 |

Each ZIP costs 8 characters of URL, not 6, because `encodeURIComponent` expands
each separator comma to `%2C`. That detail is why the safe chunk size is a
character problem rather than a row-count problem.

## Champion, measured

| Measurement | Value |
| --- | --- |
| Chunks for the country at `CHUNK_SIZE = 800` | 43 |
| Largest geography clause | 6,434 chars |
| Largest resulting URL | 6,542 chars |
| Requests to cover the country | 43 |

The `MAX_GEOGRAPHY_CHARS = 7000` guard never trips on the normal path: the
largest chunk sits 566 characters under it. The guard corresponds to a URL of
about 7,108 characters, which is between the last measured success (7,342 at 900)
and the first measured failure (7,742 at 950), so the cap is the safe side of a
real measured boundary rather than a round number.

## Challenger, measured and rejected

The issue's challenger is to fill each request to the character budget
regardless of count.

| | Champion | Character-budget challenger |
| --- | --- | --- |
| Chunks | 43 | 39 |
| Largest chunk | 800 | 871 |
| Worst URL | 6,542 | 7,108 |
| Wall time | baseline | 9.3% better |

**Rejected.** The improvement is 9.3% against a pre-stated margin of 20%. It is
safe - 871 is under the 950 that was measured failing - but safety is not the
criterion; the margin is. A margin that is met by being ignored is not a margin.

## What this does not measure

Wall-clock time and API status codes. Both need a recorded replay corpus of live
chunk timings, which this repository does not carry; fabricating one to fill the
table is the substitution this project forbids. The request-count and URL-length
halves - the binding constraint the issue names - are measured exactly, so the
challenger's rejection does not depend on the missing half: it fails on request
count alone.

## Decision

**No change.** `CHUNK_SIZE = 800` and `MAX_GEOGRAPHY_CHARS = 7000` retained.
Sequential fetching retained, because the character-budget variant does not buy
the 20% the acceptance requires.
