# Gate instrument: what it reported, and what it now measures

Date: 2026-11-10. Session record for the burn-down pass on `lane/submission`.
Head at the time: `1358f07` before the repair, `55ae974` with it.

This is a record of a measured defect and its repair, not a re-scoring. The
threshold (99), the weights (0.4 / 0.3 / 0.3), the fourteen clause texts and
their citations, and which runs pass are all unchanged.

---

## 1. The defect

The gate's final decision was two expressions at the end of
`tools/completion-gate.mjs`:

```js
const overall =
  jev === null ? (detOk ? 100 : 0)
  : detOk && jev.score >= THRESHOLD ? jev.score
  : Math.min(jev.score ?? 0, 98.9)
const passed = detOk && (jev === null || jev.score >= THRESHOLD)
```

Neither could be measured, because both live at the bottom of a 1,800-line
script whose only entry point runs the whole suite. Driving them with synthetic
inputs is enough to show they had gone wrong in both directions:

| deterministic | semantic | reported | verdict | was anything measured for that number |
| --- | --- | --- | --- | --- |
| all pass | skipped (keyless) | `100/100` | PASSED | no. 100 is the maximum possible score, printed for a run in which the 99-threshold criterion never ran |
| one fails | score 99.6 | `98.9` | FAILED | yes, 99.6. The report substituted a fabricated number for it |
| all pass | error | `0` | FAILED | no. 0 was invented for a layer that produced no score |

The first row is the one that mattered in practice. **Every CI run of the gate is
keyless** - the CI job carries no `TYPESAFE_API_KEY` - so every green
`completion-gate` check on this repository carried a 100/100 claim for a criterion
it never measured, and the lane's own digests quoted that number back.

## 2. The repair

`tools/gate-score.mjs` holds the decision as a pure function, and the gate calls
it. It reports the measured score, or `null`:

- semantic layer skipped: `overall: null`, `semantic: 'skipped'`, console prints
  `semantic criterion (99): NOT MEASURED` and
  `GATE PASSED (deterministic layer only: the 99-threshold semantic criterion was not measured)`;
- semantic layer failed, or returned no finite score: `overall: null`,
  `semantic: 'error'`, run fails;
- semantic layer measured: `overall` is the score itself, never a substitute.

Fail-closed on the degenerate cases, because a run that measured nothing
reporting a pass is the same defect elsewhere: an empty result set fails
(`0 === 0` used to satisfy the old comparison), and only a strict boolean `ok`
counts as a passed check.

Pass semantics are deliberately unchanged. A deterministic-only run still passes
on its deterministic evidence, because that is this repository's standing CI
arrangement. What changed is the claim attached to the pass, not the pass.

## 3. The proofs, run not asserted

1. **A real failing run.** `GATE_SITE=http://127.0.0.1:1 SKIP_E2E=1 node
   --no-deprecation tools/completion-gate.mjs` -> exit 1, `GATE FAILED`,
   `88/91 deterministic checks passed`, `Overall: 62.1/100` (the measured score),
   with the failing checks named: `production reachability check`, and the two
   citation checks that cannot resolve when a cited proof did not run.
2. **Ten unit tests** in `tests/gate-score.test.ts`: failing set with a high
   score reads as failing with the measured number; unmeasured is `null`, not
   100; error is `null`, not 0; empty set fails; the 99 boundary is exact (98.9
   fails, 99 passes).
3. **A gate self-check** that drives the decision with synthetic failing,
   unmeasured and errored sets on every run:
   `PASS the gate's own decision reads a failing result set as failing, an
   unmeasured criterion as unmeasured, and the 99 boundary exactly`.
   The deterministic count moved 100 -> 101 for it; no existing check was
   removed, renamed or weakened.
4. **The keyless honesty proof.** Full run with `HOME`/`USERPROFILE` pointed at an
   empty directory (so `readJevKey()` finds no off-repo file), at `55ae974`:
   `Deterministic 101/101`, then `Overall: not measured  (semantic criterion (99):
   NOT MEASURED)` and `GATE PASSED (deterministic layer only: ...)`. The same head
   keyless printed `Overall: 100/100` and a bare `GATE PASSED` before the repair.

## 4. What this does not settle

**P4 (clause 14) stays open.** The clause is "a completion gate passed on
evidence rather than assertion", cited to `unit + security tests`, which measures
the suite running rather than whether a failing run reads as failing. The
self-check in section 3.3 is precisely the measurement that clause lacks, and
re-citing the clause to it is a **scored-register move** - the owner's decision,
not a drive-by edit in a repair pass. It is now one citation away instead of one
investigation away.

**The CI red is not the semantic layer.** The CI `completion-gate` job has no
`TYPESAFE_API_KEY`, so its failure cannot come from the semantic layer. The
standing environmental suspect is the live-contract step recorded on PR #66
(`src/live/api-contract.test.ts:76` - passes locally, has failed on the runner).
Named as a suspect, not converted into a pass.

**The off-repo key path remains.** `readJevKey()` still reads
`~/.config/harness/jev.env`, so a local run on a machine that has that file is
keyed while a CI run is not - the same head scores differently by machine. This
pass used the documented mitigation (an empty `HOME`) rather than changing the
resolution order; that change is a separate decision.
