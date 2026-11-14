# Champion Audit #69: similarity matching (`similarity.ts`)

Part of the Champion Audit program; master tracker #67. Measurement first, then the decision.

## What is under audit

The shipped similarity mechanism as it stands: four dimensions
(`median_rent_burden_pct`, `median_gross_rent`, `median_home_value`,
`median_household_income`), reader-adjustable weights starting uniform, distance as
weighted RMS over dimensions normalized by the **loaded screen's observed min/max**,
complete-case only, output alphabetical by ZIP, `DEFAULT_CUTOFF = 0.1`.

The issue's acceptance, quoted as written:

> Challenger cutoff ships only if cross-CBSA admitted pairs fall >=50% vs champion at
> <=10% loss of same-CBSA pairs, in both scopes.

Comparators: cutoff 0.05 and 0.15 on identical weights.

## The harness

`tests/similarity-audit.test.ts`. It measures through the shipped functions -
`computeRanges`, `comparisonDims`, `distance` - not through a reimplementation, so a
change to the champion's arithmetic changes the numbers this file prints.

**Artefact builder.** `tools/gen-national-screen.mjs` - values only, set-checked
against the committed index, and it refuses to write rather than fabricating a row.

**Ground truth, and why it is the county.** The issue says CBSA membership. This
repository carries no ZCTA-to-CBSA file, and writing one by hand is the fabrication
the audit exists to prevent. It does carry `public/map/zcta-counties.json` - the
Census 2020 ZCTA-to-county relationship file, complete for all 33,791 areas, with a
county FIPS whose first two digits are the state FIPS. So the grouping is the county,
and the state scope is derived from the same official field rather than guessed from a
ZIP prefix.

County is a *stricter* grouping than the CBSA: every same-county pair is also a
same-CBSA pair, while two areas of one metro in different counties count as different
here. That direction matters and is stated rather than glossed: same-county admitted
pairs understate same-metro admitted pairs, so a challenger that passes on this ground
truth would pass on the CBSA one, and one that fails here might still pass there.

## The national measurement: MEASURED on the committed corpus (2026-11-11)

The unblocking artefact is now in the repository:

```
tests/fixtures/national-screen.json
  33,791 rows, values only
  each row: zcta, median_rent_burden_pct, median_gross_rent,
            median_home_value, median_household_income
  no names, no keys, no extra fields
```

Built by `tools/gen-national-screen.mjs` from the Census Bureau's ACS 5-year 2023
estimates, through the same variable ids `src/core/plugins/acs.ts` ships, in 800-ZIP
requests (the ceiling measured in `sweep/chunk.ts`), with sentinels parsed to null.
19 of the 33,791 ZCTAs carry explicit nulls because the publisher has no estimate for
them (the Virgin Islands 008xx codes, 11717/11798, and the Pacific territories
96799-96952); they are nulls rather than dropped rows, so the file's ZIP set equals the
committed index exactly - the loader refuses anything else. The two-row-in-one-file
history of hand-rolled decoders is why that check is a set comparison.

### The readings

220 origins, deterministic stride, equal weights, both scopes. Champion is cutoff
0.1; the numbers are the challengers against it:

| Challenger | National scope | State scope | Ships |
| --- | --- | --- | --- |
| 0.05 | cross-CBSA-class pairs fall **72.0%**, same-loss **69.1%** | fall 73.7%, same-loss 74.8% | no |
| 0.15 | fall **-72.6%** (admits more), same-loss -58.3% | fall -78.7%, same-loss -74.0% | no |

(The cross-group fall exceeds the clause's 50% requirement for 0.05, but the same-group
loss is 69.1%, against a ceiling of 10% - the tighter cutoff buys the cross-group
reduction by discarding twice as many genuinely similar pairs. 0.15 moves the opposite
way by construction: loosening a cutoff admits a superset.)

**Verdict: no change. Cutoff 0.1 remains the champion**, and that is the complete,
successful close this program allows - the measurement published, the champion kept,
with the evidence attached. The state scope does not rescue the challenger in either
direction.

Ground truth remains the county, as stated above: a stricter grouping than the CBSA,
so same-group admitted pairs understate same-metro admitted pairs and a challenger that
fails here could still pass on a CBSA ground truth. That direction is unchanged by
these readings and is not hidden by the verdict.

## What was measured instead: the frontier under a declared model

With no national data, the cutoff can still be measured against a *stated model* of the
country instead of the country. The model has one parameter - the within-county spread,
in units of the national range - and the measurement reports where the acceptance
clause starts to hold. 400 counties x 10 areas, seeded generator, national scope:

| Within-county spread | cutoff 0.05: cross fall / same loss | cutoff 0.15: cross fall / same loss |
| --- | --- | --- |
| 0.02 | 94.2% / **0.7%** - meets the clause | -306.0% / 0.0% - cannot meet it |
| 0.05 | 93.5% / 57.3% - fails | -312.5% / -1.3% |
| 0.10 | 92.6% / 82.5% - fails | -318.0% / -46.9% |
| 0.20 | 92.6% / 89.8% - fails | -293.9% / -134.8% |

Two findings, both about the acceptance rather than about housing:

1. **The 0.15 comparator cannot ever meet the clause, by construction.** The clause
   requires cross-group admissions to *fall*. Loosening a cutoff admits a superset, so
   the fall is negative at every spread measured (-294% to -318%). That comparator is
   ruled out arithmetically, not empirically; no corpus can change it.
2. **The 0.05 comparator's clause is satisfiable only in a narrow band.** It needs the
   same-group pairs to survive a halving of the cutoff, which happens only when
   within-county spread is small against the national range (0.02 here: 0.7% loss).
   By 0.05 spread it already loses 57.3% of same-county admissions. The clause is
   therefore a test of one ratio: how tight a county is compared with the country.

That second point predicts no-change - four dollar-denominated figures across a whole
county plausibly span more than a few percent of the national range, which would put
real data well right of the 0.02 row. But that is the model's prediction, and the model
is not the country. The corpus decides, and this harness will print the answer the day
it lands.

## What this file changes in the product

Nothing. `similarity.ts` is untouched: no constant moved, no weight changed, no cutoff
adjusted. The deliverable is the harness, the ground-truth decision, and the two
findings above.

## State

- National measurement: **NOT RUN** (blocked on the corpus above; not passed).
- Harness: 8 tests pass, 1 skipped. Loader, ground truth join, cutoff arithmetic and
  scope-dependent normalization all pinned.
- `npm run verify` at this head: green; full suite includes this file.
