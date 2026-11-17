# Champion Audit #74: place-suggestion ranking

Filed against issue #74 in the Champion Audit program (#67). Evaluation-first and
offline: the shipped mechanism is replayed exactly as it ships over the real
national index, and a challenger ships only on the margin written into the issue
before the measurement was taken.

**Decision: no change.** The shipped cap is kept, and the corpus below is the
deliverable. This is the close the program calls complete, not a null result.

---

## 1. What is being decided

`searchPlaces(places, query, limit = 8)` (`src/core/zcta-place-index.ts`) buckets
matches into four fixed ranks - exact name, prefix, word-boundary, substring -
and caps each bucket. Inside a bucket the stable `decodePlaces` order is
preserved, and there is deliberately no size or population tiebreak: ordering
Austin, TX above Austin, AR would be the app ranking places.

The open question in #74 was whether the per-bucket cap of 64 is real headroom or
an asserted number, and whether CAP 32 or CAP 128 changes which eight places a
reader sees.

## 2. What was measured, and on what

- Index: `public/map/zcta-places.json`, decoded by the shipped `decodePlaces`.
  **24,154 distinct places** from 33,791 ZIP records.
- Corpus: **1,264 queries**, derived from the index by fixed stride (step 47) so
  the replay is identical every run. Four classes plus the multi-state case the
  mechanism exists for:
  - exact display names;
  - 4-character prefixes;
  - 3-character word-boundary fragments of multi-word names;
  - mid-word substrings;
  - up to 60 names that occur in more than one state.
- Metrics, per cap: exact-match recall@8 (slots filled by exact matches out of
  `min(8, exact matches that exist)`), bucket-order violations in the returned
  eight, empty results, largest exact and prefix bucket reached, duplicate-name
  truncations, and whether the top eight differs from the champion's.
- Ranks do not depend on the cap, so they are computed once per query and each
  cap is simulated over the same rank array. The simulator is checked against the
  shipped `rankPlaces` on 120 queries, so it cannot become a second
  implementation that scores well while the shipped code differs.

Run: `npx vitest run tests/place-ranking-audit.test.ts` (about 15s).

## 3. Result

| cap | recall@8 | order violations | empty | max exact bucket | max prefix bucket | top-8 differences vs champion |
|---|---|---|---|---|---|---|
| 32 | 100.00% | 0 | 0 | 22 | 252 | 0 |
| **64 (champion)** | **100.00%** | **0** | **0** | **22** | **252** | - |
| 128 | 100.00% | 0 | 0 | 22 | 252 | 0 |

The champion meets both acceptance conditions: exact-match recall@8 is 100% and
there are zero bucket-order violations. Neither challenger differs from the
champion on any of the 1,264 queries, so neither can ship on a margin it does
not have. No change.

## 4. What the numbers actually say, including the uncomfortable part

- The exact bucket never exceeds **22**, so CAP 32 is already enough for the
  rank that fills the top eight. That is why the challengers are identical: with
  at most 22 exact matches, the first eight slots are fully decided before any
  other bucket is consulted.
- The prefix bucket genuinely reaches **252**, so the cap *does* fire. The
  mechanism's early stop - `if (rank <= 1 && bucket.length >= cap) break` - ends
  the scan entirely once an exact or prefix bucket fills. Since the break can
  happen before a later exact match is reached, the guard is not free: it relies
  on exact matches being found before the prefix bucket fills.
- Measured over 1,264 queries, no such case occurred (recall 100%, zero
  differences across caps). That is a measurement of this corpus, not a proof
  that it cannot happen, and it is recorded rather than rounded up to "safe".
  The corpus is now the instrument for noticing if it ever does: the assertions
  pin recall at 100% and ordering at zero violations, so a future dataset that
  breaks either fails the suite.
- Duplicate-name truncations: 0. No corpus query had more than eight exact
  matches, so the "more than eight places share this name" case never arose. It
  stays a known, untested edge rather than a claimed behaviour.

## 5. What changed in the code, and what did not

Changed, behaviour-preserving: the bucket scan moved out of `searchPlaces` into
an exported `rankPlaces(places, query, limit, cap)`, with `searchPlaces` passing
the new `SEARCH_BUCKET_CAP` constant. This exists so the champion and its
variants replay through the same code - a re-implementation measures the
re-implementation. `searchPlaces(..., limit = 8)` behaves exactly as before, and a
test asserts the two are equal.

Not changed: the four ranks, the tie-break, the absence of a size tiebreak, the
cap value, the early-stop rule, and the returned shape.

## 6. Commands

```
npx vitest run tests/place-ranking-audit.test.ts          # 8 passed, 15s
node -e "const r=require('./public/map/zcta-places.json');console.log(r.zd.length)"   # 33791
```

## 7. Next action

Owner/oversight acceptance on #74. If accepted, the no-change close records this
measurement and the corpus as the deliverable; the issue stays open until that
acceptance, per the lane rule. The residual edge in section 4 (early stop before
a later exact match) is now guarded by the suite rather than by a comment.
