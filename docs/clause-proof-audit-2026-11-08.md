# Clause-proof audit: every cited clause, measured deterministically

Filed as the tree-completeness item after the gate's own register pass
(`docs/gate-tree-completeness-2026-11-08.md`, sections 2 and 10). Offline in the
sense that matters: no credential was read, requested or used, and the
measurement reads the gate's report rather than the network.

**Status: measured, P4 not closed.** Clause 14 is now a machine finding instead
of a reading, and the two decisions that would close it remain the owner's
(`docs/gate-tree-completeness-2026-11-08.md` section 10.2). Nothing here changes a
clause text, weight, threshold or score.

---

## 1. What was missing

`tools/completion-gate.mjs` resolved all 14 scored clauses to the checks that were
supposed to have measured them, then published the result as **one** row: "every
stated requirement is backed by exactly one check that passed in this run". That
row is true and uninformative. It cannot show which clause rests on a proof that
does not measure it, which is why P4 - clause 14, "a completion gate passed on
evidence rather than assertion", credited to `unit + security tests` - was found by
reading rather than by running anything.

## 2. What was built

Two pieces, both scoring-neutral:

1. **The register leaves the gate.** The resolution the gate already computes is
   written into `gate-report.json` as `clauses` (each clause, each citation, the
   label it resolved to, and whether it passed) plus the list of pipeline `steps`.
   No check, label, threshold or weight is added, removed or altered; the
   deterministic count stays at 100 and the run still passes 100/100.
2. **`tools/clause-proof-audit.mjs` measures it.** It reads only that register, so
   it cannot drift from what the gate credited, and classifies each clause with a
   stated rule:

   - `unproven`: the citation resolved to no single passing check;
   - `label-opaque`: every cited check shares no subject word with the clause, so
     the proof names nothing the clause is about;
   - `subject-named`: at least one cited check names the clause's subject.

   Subject words are tokens of four characters or more, minus a short stopword
   list, with inflected forms matched on a six-character prefix - that widening is
   itself evidence-driven: the first run called the stewardship clause
   `label-opaque` because it says "disclosed" where its check says "discloses",
   which is the same measurement in different words.

   Determinism is enforced, not assumed: the output has no clock, path,
   environment value or unordered iteration, and `--check` measures the same
   report twice and fails unless the two encodings are byte-identical.

## 3. Result at head `08279a9`

Gate run keyless on that head: **100/100, GATE PASSED, exit 0** (`HOME` and
`USERPROFILE` pointed at an empty temp directory, so the gate's key discovery
finds nothing and no semantic layer runs).

```
clauses: 14 (unproven 0, label-opaque 3, subject-named 11), 28 citations over 27 distinct proofs
deterministic: two runs byte-identical (13370 bytes)
digest: 3731d5ee06636657801c14748b6c822cf53b2cd9a1317fd396357fb2acca9a2a
A5: pass 1, known-limitation 1, new-defect 0 (289 files scanned)
```

The counts reconcile by construction and the reconciliation is asserted: the
three clause classes partition the 14 clauses (0 + 3 + 11), the A5 buckets account
for the single claim plus its one declared limitation (1 + 1 + 0), and a pass with
zero files scanned is rejected as a contradiction.

### The three `label-opaque` clauses, classified

| Clause | Cited proof | Class | Why |
|---|---|---|---|
| 1. every element fully working, validated, real and verified | `typecheck + build`, `unit + security tests`, `live API contracts` | known limitation | the pipeline is what proves this clause; a build-and-test run is the right evidence for "everything works", so the class is accurate and not a defect |
| 12. a selected domain, live | `production serves a build` | known limitation, already tracked as P5 | the check fetches `SITE` (default `https://civicscope.pages.dev`), matches a hashed bundle and passes - it proves the site is live and serving a build, not that a domain was **selected**. A `*.pages.dev` origin satisfies it, so the clause is credited while the thing it asks for may be absent. Closing it needs the origin-identity decision (A3) |
| 14. a completion gate passed on evidence rather than assertion | `unit + security tests` | **P4, now machine-measured** | the suite running is not a gate passing; the gate's own fail-closed decision is unmeasured by its cited proof |

That is the whole point of the exercise: clause 14's problem was already known and
written down, and the instrument now produces it from the shipped register on any
head, without anyone reading the gate source. A future re-citation is checked by
rerunning one command instead of re-deriving the argument.

## 4. A5 scan, same head, same run

A5 (`docs/hackathon-integration-plan.md:110`) says no portal key reaches this
repository, verified by `tools/secret-scan.mjs` in the gate. The audit does not
re-run the scan - a second scan of the same tree would be a second measurement of
the same claim - it reads the row the gate published on the same head:

- **pass 1**: the working tree is clean of credential shapes, 289 files scanned;
- **known-limitation 1**: the scan reads the tree, not git history, so a key
  committed and later deleted is out of scope - a property of the method, counted
  once whether or not the scan passes;
- **new-defect 0**.

Reconciliation: 1 + 1 + 0 buckets for one claim, and the pass is only counted
because the scan reported a positive file count.

## 5. Owner-reserved, untouched

- **P4 (clause 14)**: still open. Closing it is either a re-citation or a new
  fail-closed check, and both move the scored register - an owner decision.
- **P5 (clause 12 origin identity)**: still open, blocked on A3.
- **#76 F1 (provenance versus uniform 20)** and **P4 clause 14** were not read,
  guessed, changed or closed by this pass. The `src/` tree is unchanged.

## 6. Verification

```
node --no-deprecation tools/completion-gate.mjs     # 100/100, GATE PASSED, keyless, exit 0
node tools/clause-proof-audit.mjs --check           # two runs byte-identical, digest 3731d5ee
npx vitest run tests/clause-proof-audit.test.ts     # 11 passed
npm run verify                                      # counts in the session digest
```

## 7. Next action

Owner decision on P4: re-cite clause 14 to a check that measures the gate's
fail-closed decision, or add that check and re-cite. Until then the honest reading
is unchanged and now machine-checkable: 11 of 14 clauses are proven by a check
that names their subject, 3 rest on pipeline steps, and one of those three is the
clause about whether the gate itself passed.
