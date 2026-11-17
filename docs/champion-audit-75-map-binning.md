# Champion Audit #75: hex aggregation and colour binning under partial load

Filed against issue #75 in the Champion Audit program (#67). Offline, no
credential, no network.

**Decision: no change.** The comparator the issue names - the former `>=50%`
coverage gate - does not meet the pre-stated margin on either field used here,
and the audit turns up something the hypothesis did not predict: the instability
is in the legend, not in the medians.

---

## 1. Method

`tests/map-binning-audit.test.ts` replays a sweep against the real screen:

- **Screen:** the 33,791 real ZCTA centroids in `public/map/zcta-centroids.bin`,
  projected by the shipped `createView` at the default national viewport
  (1200x700, scale 1). 33,771 of them fall on screen; they land in **1,722**
  shipped hexagons at the shipped radius, `hexRadius(1) = 9`. Every on-screen ZIP
  lands in exactly one bin - asserted, so a binner change breaks this file.
- **Arrival order:** the real one. `planChunks` sorts the ZCTA list and slices it
  in `CHUNK_SIZE = 800`, so a live sweep delivers ZIP codes lexicographically.
  Each bucket of 800 is one arrival stage.
- **Champion:** the shipped `hexbin` (median of whatever has loaded) plus the
  shipped `buildBins` (10 quantile bands **re-derived from the values currently
  loaded**) and `binFor`. Nothing is reimplemented.
- **Comparator:** the same bins, with the old rule applied - colour only when at
  least half of a bin's ZIP codes carry a figure, grey otherwise, at every stage.

**Limits, stated because they decide how far the numbers travel.** There are no
ACS values in the repository, so the value field is synthetic, and a band can only
change when values inside a bin differ. Two fields bracket the range: one smooth
across neighbouring ZIPs (a hexagon holds a neighbourhood, so neighbours
resemble each other) and one independent per ZIP. 15% of ZIPs carry no figure at
all, because real ACS pulls are incomplete and a corpus where nothing is ever
missing could not measure the coverage gate's cost. One viewport and one radius
are measured; zoom is not replayed here.

## 2. Result

| | smooth field | independent field |
|---|---|---|
| bins on screen | 1,722 | 1,722 |
| bins existing at 50% load | 30.3% | 30.3% |
| mean longitude at 50% load vs complete | -80.3 vs -91.0 | -80.3 vs -91.0 |
| **band churn, champion** | **358/478 (74.9%)** | **184/478 (38.5%)** |
| band churn, comparator | 355/478 (74.3%) | 183/478 (38.3%) |
| churn reduction vs margin (30%) | 0.8% | 0.5% |
| final coverage, champion | 99.0% | 99.0% |
| final coverage, comparator | 98.3% | 98.3% |
| coverage ratio (needs >= 0.99) | 0.992 | 0.992 |
| value-only churn, legend held still | **0 (0.0%)** | **1 (0.2%)** |

The comparator clears the coverage clause but misses the churn clause by a wide
margin - 0.8% and 0.5% against the required 30% - on both fields, so **no
change**. The reason is mechanical: the gate does not touch the aggregation or
the colour scale, it only withholds colour from bins the champion already
coloured. It cannot reduce band churn, only remove bins from the comparison.

## 3. What the hypothesis got right

The issue's premise holds: **arrival order is geography.** At half the sweep,
only 30.3% of the screen's bins exist at all, and the drawn ZIP codes sit at a
mean longitude of -80.3 against -91.0 for the complete map - roughly ten degrees
east. Early chunks are the eastern ZIP prefixes, not a random sample. That part
of the hypothesis is confirmed and is now an assertion in the test.

## 4. What the hypothesis got wrong, and it matters more

The hypothesis was that early bins "show medians over sparse, non-random subsets
..., so the early map is systematically geographic-biased while looking complete".

Measured:

1. **It does not look complete.** A bin that does not exist yet is not drawn, so
   the west is visibly blank, not falsely coloured. The map is a third drawn, not
   a third wrong. That is a milder failure than the one hypothesised, and the
   shipped partial-coverage marker already discloses what exists.
2. **The median is not what moves.** With the final breaks held still, the same
   half-load medians change band **0 times** on the smooth field and **once** on
   the independent field - 0.0% and 0.2%, against band churn of 74.9% and 38.5%.
   A hexagon holds about twenty ZIPs; adding more of a neighbourhood barely
   moves its median. The aggregation is stable.

So the real defect is somewhere else, and the numbers name it: **`buildBins`
re-derives its quantile breaks from whatever is loaded at that moment.** Three
quarters of the coloured bins therefore change colour between half and full load
while their value stays put - the same colour means a different figure at
different moments of the sweep. A reader watching the map fill sees it re-shade
under them, and the legend's printed boundaries silently move with it.

This is a different mechanism from the one in the issue, it is measurable, and it
is not covered by any margin written so far. Changing it - freeze the breaks
once the loaded population is representative, or until the sweep settles - is a
new decision about how a live map should behave, so it is recorded here as a
candidate item rather than shipped inside a no-change audit.

## 5. Verification

```
npx vitest run tests/map-binning-audit.test.ts     # 5 passed
npm run verify                                     # counts in the digest
```

## 6. Next action

Close #75 as **no change**, with the coverage-gate comparator measured below its
own margin on both fields. File the legend-instability finding (section 4) as its
own item: `buildBins` re-deriving breaks per stage, 74.9% / 38.5% band churn
against 0.0% / 0.2% value churn. Owner decides whether the legend should freeze.
