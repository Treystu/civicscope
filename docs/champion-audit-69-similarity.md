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

## The national measurement: NOT MEASURED, and why that is the honest state

The measurement needs one committed sweep output:

```
tests/fixtures/national-screen.json
  33,791 rows, values only
  each row: zcta, median_rent_burden_pct, median_gross_rent,
            median_home_value, median_household_income
  no names, no keys, no extra fields
```

That file is not in the repository, and producing it needs a live Census key, which
this lane does not hold (key fence). So the national test is `describe.skip` - reported
by vitest as **skipped, not passed** - and a second test prints `NOT MEASURED` with the
required shape and fails if a corpus is committed in the wrong shape. The loader
validates all of it: exactly 33,791 rows, only the five allowed fields, finite numbers
or explicit nulls, five-digit ZIP codes joined against the county index.

This is the one place in this program where the unblocking artefact is a data file
rather than a constant, and it is worth saying plainly: no amount of arithmetic in the
harness substitutes for it.

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
