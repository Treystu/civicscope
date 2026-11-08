# Champion Audit #76: minimum-n suppression

Filed against issue #76 in the Champion Audit program (#67). Offline, no
credential, no network.

**Decision: the champion cannot be closed as no-change, and the challenger named
in the issue cannot satisfy its own acceptance.** Both statements are measured
below, not argued. One safe defect in the scoping mechanism is fixed here; the
one substantive question the audit raises is a suppression-policy decision for
the owner.

---

## 1. Method

`tests/minimum-n-audit.test.ts` builds the borderline band the issue names -
values 1-50 - for every metric family that the rule can reach: 13 families, 650
cells. Cells are emitted through the shipped `executePlugins`, with each harness
plugin carrying the real plugin's `legal` block, so the measured threshold is the
shipped one (20), not a copy of it.

The label on each family - people-estimate or administrative fact - is decided
here, in-session, on the axis the issue itself proposes, and each label carries
its evidence in the table. The test tallies labelled cells; it does not decide
what a cell is.

Two error rates, as the acceptance defines them:

- **E1** people-estimate cells published below 20.
- **E2** administrative-fact cells withheld as if they were small samples.

## 2. The families

| Publisher | Keys | Unit | Label | Evidence |
|---|---|---|---|---|
| Census (ACS 5-year) | `population`, `households`, `renter_occupied`, `owner_occupied`, `vacant_units`, `no_internet_access`, `below_poverty_count`, `bachelors_count`, `commuting_workers` | count | people-estimate | the plugin's own notice: "ACS 5-year estimates carry a margin of error" |
| Census (ACS 5-year) | `median_age` | count | people-estimate | same, and the unit is a mis-tag (F1) |
| NCES EDGE | `teachers_total`, `enrolled_students` | count | administrative fact | the district reports its own staff and enrolment; no sample, no margin of error |
| NYC DOE via NCES | `students` | count | administrative fact | plugin note: "Reported enrolment." |
| EPA Smart Location | `epa_jobs_accessible_by_auto` | count | modeled estimate | and it is outside suppression entirely (F2) |
| NCES EDGE | `school_count` | institutions | administrative fact | already exempt by design |

## 3. Result

```
corpus: 650 cells, 13 families (10 estimate, 3 administrative), values 1-50
champion (uniform 20, unit regex): E1 0, E2 57
  E2 breakdown: teachers_total 19, enrolled_students 19, students 19
```

The champion's good property holds exactly: **E1 = 0**, no estimate escapes
below the floor. Its defect is also exact: **E2 = 57**, every value from 1 to 19
of three reported-fact families withheld under a rule justified by sampling
error.

**The named challenger is infeasible.** Per-category thresholds were searched
exhaustively over `{0, 10, 20, 30, 50}` for each of the four categories the
corpus uses - 625 assignments - and **none** satisfies both clauses. The reason
is structural, not numeric: `education` contains both `bachelors_count` (an ACS
estimate) and `teachers_total` / `enrolled_students` / `students` (reported
facts). Any threshold that withholds the estimate also withholds the facts; any
threshold that publishes the facts also publishes the estimate. Category is not
the axis that separates them. The issue names the axis itself: people-estimate
versus administrative fact.

A provenance-scoped challenger - threshold 20 for estimates, no withholding for
reported facts - measures **E1 0, E2 0** on the same corpus. It is not shipped
here, for two reasons stated plainly:

1. It needs a registry dimension (`MetricValue` has no provenance field), so it
   is a mechanism change, not a constant.
2. **It is a policy choice, not only a bug fix.** The UI explains suppression as
   "withheld to protect small-population privacy" - a *disclosure* justification
   - while the code comment justifies it by unreliability, which is a *sampling*
   justification. For a district of 12 students, disclosure control is a real
   argument that the audit has no basis to overrule. The owner has to say which
   motive governs reported facts; the measurement only shows that the two are
   currently conflated behind one rule.

So: no-change does not close #76, and the challenger in the issue cannot ship.
The item becomes an owner decision with a measured corpus and two named options.

## 4. Fixed here: the scope was a substring, not a decision

The gap hypothesis was that "any future unit string containing `count` inherits
suppression whether or not it counts people". Measured: the whole unit union is
8 values and the regex resolves to exactly `count`, so nothing misbehaves today.
The trap was real anyway - a unit named `account` or `discount` would have
inherited household suppression with no one deciding that.

The regex is now a declared set, `SUPPRESSED_UNITS`, typed over `MetricUnit`.
Behaviour-identical today; adding a unit is now an explicit edit. The test drives
all eight units through the shipped executor and asserts that `count` is the only
one withheld, so a new unit cannot slip in unnoticed.

## 5. Findings recorded, not fixed

- **F1 `median_age` carries `unit: 'count'`** but holds a number of years. No
  median age is below 20 in practice, so it is harmless today - which is exactly
  why it is worth recording: the unit is the only thing between a metric and
  suppression, and this one is wrong.
- **F2 the EPA count metric is outside suppression entirely.**
  `epaNwiContextPlugin` declares a `legal.notice` and no `suppressBelow`, so
  `epa_jobs_accessible_by_auto` is never withheld at any value. A plugin that
  forgets the threshold does not inherit a default; it opts out silently.
- **F3 `institutions` is exempt by a special case in the code comment**, with no
  type-level marker, so the next administrative unit must be remembered rather
  than declared. This is the same class of gap as the regex, one level up.

## 6. Verification

```
npx vitest run tests/minimum-n-audit.test.ts src/core/executor.test.ts   # 16 passed
npm run verify                                                           # counts in the digest
```

## 7. Next action

Owner decision on #76: (a) declare provenance in the registry and scope
suppression by it - zero E2, zero E1 on this corpus - or (b) keep the uniform
threshold and amend the acceptance to exempt only the units it has already
carved out, stating the disclosure rule explicitly. Everything else in this
audit is measured and can be checked by rerunning the test.
