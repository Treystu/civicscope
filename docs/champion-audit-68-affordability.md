# Champion audit #68: affordability composite scoring

Date: 2026-11-10. Issue: #68. Champion Audit program: #67.
Head: `235fef5` on `lane/submission`. Offline only; no network, no credential.

## Method, and the one substitution it makes

`affordabilityIndex` is a pure function of up to four published figures, so it
can be measured without sampling anything. `tests/scoring-audit.test.ts` does
that by exhaustion over a deterministic grid: 13 points per component, spanning
50% beyond each declared bound on both sides, giving 28,561 rows (13^4). The
bounds, weights and rule text are read from `SCORE_RULES`, so the harness cannot
drift from the mechanism.

**The substitution, stated plainly.** The issue says "measurable offline on the
frozen national screen (33,791 rows)". This repository commits no frozen corpus
of national figures - `git grep` finds the four metric keys only in the test
corpus, which carries questions rather than ACS values. So the harness measures
the mechanism's **own declared input space**, not a national distribution. That
answers "how much of the space saturates" but not "how many real areas sit at a
clamp", and the second question is left unmeasured rather than estimated from a
distribution that would have had to be invented. The uniform grid also
over-represents the tails relative to real ACS data, which makes the stability
figures below conservative rather than flattering.

## Measurements

All figures are printed by the test. None is rounded in prose.

### Clamp saturation

Each rule clamps linearly, so every value at or beyond a bound scores exactly 0
or exactly 100. On the grid, all four components saturate on the same share:

| Component | Share of grid at exactly 0 or 100 |
| --- | --- |
| Median rent as share of income (15-45%) | 61.5% (8 of 13) |
| Median gross rent ($700-$3,200) | 61.5% |
| Median home value ($120,000-$900,000) | 61.5% |
| Median household income ($30,000-$140,000) | 61.5% |

The 8-of-13 figure is arithmetic, not a property of real data: 4 of 13 points per
axis sit at or beyond each hard end. It is worth recording that the first draft
of the harness asserted 5 of 13 and the run corrected it - the kind of error that
only a run finds.

### Weight sensitivity (+/-20% on one weight at a time)

| Perturbed weight | Share within +/-10 points | p95 shift |
| --- | --- | --- |
| Rent burden (0.4) | 100% | 4.02 |
| Gross rent (0.25) | 100% | 3.24 |
| Home value (0.2) | 100% | 2.71 |
| Household income (0.15) | 100% | 2.18 |

The composite is insensitive to a 20% single-weight perturbation. The asserted
weights are therefore not load-bearing for what a reader sees, which is the
useful finding: the weights can stay as they are without argument.

### Subset incomparability

Because weights are renormalized over whatever is present, a 2-of-4 composite and
a 4-of-4 composite print on the same 0-100 scale. Measured over all 28,561 rows,
taking the burden-plus-rent subset against the full four:

| Statistic | Value |
| --- | --- |
| Median absolute gap vs full composite | 11 points |
| p95 absolute gap | 29 points |
| Rows where the 2-of-4 score is 15+ points *higher* than the 4-of-4 score | 5,038 (17.6%) |

So an area missing two figures can outscore an area with all four by a wide
margin. The basis string discloses the subset in words
("Computed from 2 of 4 published components, reweighted..."), which is honest,
but the number beside it is still on the same scale. This is a real defect of
comparability, and it is recorded as F1 rather than fixed, because the fix is a
product decision: either surface a confidence marker on renormalized composites,
or refuse to display a composite below three components.

### Challengers

| Challenger | Within +/-10 | Saturation | Verdict |
| --- | --- | --- | --- |
| Equal weights (0.25 each) | 76.4% | unchanged (8/13) | Rejected: fails the 90% clause, and cannot move saturation, because weights never enter `normalize()` |
| Bounds widened 10% of span each side | 100% | 45.5% (6/13) | Qualifies **on the grid**; not shipped |

The equal-weight challenger fails the issue's margin on the measured number, not
by argument: 23.6% of the space moves more than 10 points.

The widened-bounds challenger is the one that can actually reduce saturation, and
it does - from 8/13 to 6/13 - while every grid point stays within 10 points of
champion. On the grid it meets both acceptance clauses. **It is nevertheless not
shipped**, and the reason is scope of measurement rather than merit: the
acceptance clause is stated over *areas*, this repository carries no frozen
national corpus, and presenting a uniform grid as the national screen is exactly
the substitution this project's own rule forbids. Shipping a bounds change on it
would move every displayed affordability score in the product on the strength of
a measurement that does not name the set it was taken over.

## Decision

**No change.** The champion (weights 0.4 / 0.25 / 0.2 / 0.15, bounds as declared,
`SCORE_VERSION 1.1.0`) is retained. Under the program's rule - "publishing the
measurement and keeping the champion is a complete, successful close" - this
closes the item.

**F1, recorded and open.** Subset renormalization puts renormalized composites on
the same scale as complete ones, with a median 11-point gap and 17.6% inversions.
The basis string is honest; the number is not comparable. A labelled confidence
marker or a minimum-component rule is a product decision, so it is not a drive-by
edit here.

**F2, recorded.** The clamp saturation is confirmed real: 61.5% of the declared
space per component lands on a hard end. It cannot be fixed by weights. The
qualifying lever is the bounds, and the measurement needed to ship it is a frozen
national corpus.

**What would close F2 to a ship decision:** commit a frozen national screen (the
43-chunk sweep output, values only, no keys), re-run this harness against it, and
re-check the 90% clause on areas. That is one file and one harness run, and it is
the next step rather than a re-investigation.

## Verification

`npx vitest run tests/scoring-audit.test.ts`: 5 cases pass. Every number in the
tables above is asserted in that file, so a later rule change cannot silently
make the composite less stable than this record claims.
