# Completion-gate tree completeness - 2026-11-08

Owner-ordered pass (coordinator comment 2026-11-07T22:32Z, applied here by the
2026-11-08T03:36Z dispatch). Scope: the completion-gate **instrument**, not the
product. The question is not "is every aspect of the register satisfied" but
"what does the register omit, and can a run of this gate say so".

Read this as the determination the discipline requires. It is written after the
hunt, not instead of it, and it separates what was measured from what was read.

**Register-independent channel: DID NOT RUN.** The semantic layer itself did run
on this head, because the gate found a stored key outside the repository; that is
not the same thing, and section 7 states both facts and how the key was reached.
Every claim below carries the limitation.

---

## 1. The instrument's tree, as it actually stands

Three operator-authored lists, one of which is scored:

| Register | Size | Enters the score | Source |
|---|---|---|---|
| `REQUIREMENTS` (`req` + `proofs`) | 14 clauses | yes, unweighted mean = `requirements_met` | `tools/completion-gate.mjs:1105-1166` |
| `JUDGE_ASPECTS` | 7 aspects | no, diagnostic | `tools/completion-gate.mjs:1178-1186` |
| `unmet_requirement` criteria | 8 choices | no, diagnostic | `tools/completion-gate.mjs:1455-1470` |

Plus 98 deterministic checks, whose labels are cited by the 14 clauses. The
citation mechanism is the joint the whole tree hangs on, so it is examined
first.

Measured on this head (2026-11-08, this machine): deterministic 96 of 98, with the
WCAG step failing on a browser navigation rather than an axe violation, and the
semantic layer reading 60.8. Detail in sections 2 and 7. The number is a reading
of this runner, not of the tree alone, which is T1.

---

## 2. Free-form tree-completeness hunt

The hunt is author-side: the aspects below were named in the author's own words
from the request and the user's seat, before re-reading the register. That is not
the same thing as a register-independent channel (section 7), and it is not
reported as one.

`tree_complete: unrun`. Per the discipline, an unrun reading is carried as a
limitation and never as a completeness claim.

### Omitted aspects

**T1. Whether the instrument's own verdict is reproducible.**
No aspect asserts that two runs on one tree agree. This is not hypothetical: on
2026-11-08 one live-contract test moved the semantic score 78.9 -> 62.4 between
two heads whose difference is one Markdown row
(`src/live/api-contract.test.ts:76`, keyless ACS premise). A register that cannot
say "the same tree scores the same" cannot support the 99 threshold on a single
reading. Omitted entirely.

**T2. Whether the audited origin is this repository.**
Clause 12 rests on the check labelled `production serves a build`. That check's
identification mechanism is an asset-reference regex plus four marker substrings
(`tools/completion-gate.mjs:972-977`); content-hash equality with the local build
runs only when `GATE_EXPECT_DEPLOYED=1`, which `.circleci/config.yml` sets only
for a push to `main`. The markers are strings any fork of this repository also
contains. Assumption A3 in `docs/hackathon-integration-plan.md:108` is **OPEN**
(2026-11-06) on exactly this question: whether `civicscope.pages.dev` serves this
tool repository or the lineage. No aspect in this instrument asks it.

**T3. Whether a cited proof measures the clause it is cited for.**
The matcher is substring containment of the cited proof string in a passing
check's label (`tools/completion-gate.mjs:1254`):
`!results.some((x) => x.ok && x.label.includes(c.proof))`. So a clause is
"backed" when some passing check's label contains the cited text. The register
cannot distinguish "a check named like this passed" from "this clause was
measured". Three clauses lean on that gap; the specimens in section 6 are the
measurement of it.

**T4. Whether the requirement list tracks the request.**
Nothing compares `docs/original-request.txt` to `REQUIREMENTS`. The coverage is
correct today (14 clauses over 13 enumerated requirements; the compound
coverage-plus-screening requirement is split into `clause_4` and `clause_5`), and
it is maintained by hand. A request edited without the register edited beside it
would leave the scored mean silent about the difference. Drift, not a current
defect.

**T5. What the user came to do, as distinct from what the request's sentences say.**
The register is organised by the request's phrasing. Section 3 is the first time
the user-seat jobs are written down; two of the thirteen have no register aspect
(vintage shown with the figure, and independent reproduction of the instrument's
own claims).

**T6. Whether a figure carries its vintage.**
The product does render it: `src/ui/MetricCard.tsx:94` prints
`metric.source.vintage`, and `src/ui/FairHousingNotice.tsx:93-96` prints
`{source}, {vintage} vintage`. No check in the gate asserts it, and no clause
cites it. Present in the product, absent from the register.

**T7. Whether the record's own verification methods exist.**
Assumption A5 in `docs/hackathon-integration-plan.md:113` is `standing`, and its
method is "`tools/secret-scan.mjs` in the gate + review of every diff". That file
does not exist in `tools/`, and nothing in `tools/`, `tests/`, `src/` or
`.circleci/` references it. The verify job is *named* "Typecheck, build, unit and
security tests", but naming is not a scan. So the standing claim that no key from
the portal environment reaches this repository has no measurement behind it, and
this lane's recurring "keyless, no credential read" statements are assertions
about a session, not a check. Omitted entirely.

**T9. Whether "keyless" is true of a run.**
The semantic layer's presence is decided by `readJevKey()`
(`tools/completion-gate.mjs:1063-1081`), which reads `TYPESAFE_API_KEY` from the
environment **or** from `~/.config/harness/jev.env`. An unset environment
variable therefore does not mean a keyless run: on this machine the environment
variable is unset and the stored file is present, and the semantic layer ran.
Every statement that a local run "exercises the deterministic layer only" is
conditional on a dotfile outside the repository, so it cannot be verified from
the repository. Same shape as A5 (T7): a credential-handling premise with no
check behind it.

**T10. Whether a failing check is failing for its own reason.**
The WCAG step builds a preview and drives it in a real browser, and its flow
waits for a data card. On this head it failed with a Playwright navigation error
at `waitForCard(page, '78701')` under `waitUntil: 'domcontentloaded'` - a wait
that did not resolve, not an axe violation (the gate clips the detail, so the
full error is not in `gate-report.json`). The citation check then correctly
refused to credit clause 2 to a check that did not pass, and the judge read
`clause_2` at 0.1 and `clause_14` at 0.41. So one browser timeout drives an
accessibility requirement to near-zero and the self-gate clause from 0.96 to
0.41. Same failure mode as the live-contract one, in a second step: an
environment fault reads as an unmet requirement.

### What the tree does right, so the hunt is not only a list of holes

- The three claim predicates are planted in both directions: the wording that
  ships must pass and the wording it replaced must fail
  (`tools/completion-gate.mjs:1288-1295`). This is the one place in the
  instrument that holds a negative specimen, and it is the model for section 6.
- The sentinel guard is checked against the deployed bundle rather than trusted
  from source (`:766-782`), because a rendered sentinel is the failure the whole
  guard exists to prevent.
- The clause aggregate fails closed rather than averaging the answered subset
  (`:1531-1551`), so a partial measurement cannot be reported as a number.
- Content-hash identity of the deployed bundle is enforced where it can be
  honestly enforced (`:990-1006`, main only), and the comment records the
  2026-10-07 incident that motivated it.

---

## 3. Purpose map, from the user's seat

Each job a person actually arrives with, mapped to a clause/check or to an
explicit absence. "Register" means a scored clause; "check" means a deterministic
check that measures it.

| # | Job (user's words) | Mapped to | State |
|---|---|---|---|
| J1 | "Can I live in this ZIP?" - a screening read | clause 5; screening-table check | covered |
| J2 | "Tell me more about this place" - drilldown | clause 5; drilldown catalog checks | covered |
| J3 | "Which of these three is better?" - comparison | clause 5; comparison-matrix check | covered |
| J4 | "Show me everywhere that meets this bar" - national sweep | clause 4, clause 11 | covered |
| J5 | "Where did this number come from, and how sure is it?" | clause 6 (margins); vintage in UI, no check | partial (T6) |
| J6 | "Is this steering me by race?" | clause 8; Fair Housing notices | covered |
| J7 | "Can I use it without sight, or without a mouse?" | clause 2; axe-core audit | covered |
| J8 | "Is it tracking me, and does it need an account or a server?" | clause 7 - 5 prohibitions, 2 checks | partial (T8) |
| J9 | "Who runs this, and does money change the answer?" | clause 13; disclosure checks + governance decision 2026-10-06 | partial (disclosure checked, ownership documented) |
| J10 | "Can I get my work back, and send it to someone?" | saved comparisons, URL codec, CSV export | covered |
| J11 | "Is this blank because it is zero, or because nobody published it?" | clause 3; absence-label + sentinel checks | covered |
| J12 | "Can I check all of this myself?" | cell-by-cell Census audit checks; this gate | partial (T1, T3) |
| J13 | "Is the thing being judged the thing that is deployed?" | clause 12, clause 14 | partial (T2) |

Out of scope for this pass, with cause: school data depth is supplementary (the
request asks for housing and neighbourhood data and does not mention schools);
mobile/touch layout is not a stated requirement (WCAG 2.2 AA is, and is
audited); a custom domain name was priced and dropped by decision 2026-10-06
(section 4, S4).

**T8** (from J8): clause 7 names five prohibitions - advertising, analytics,
search logging, accounts, runtime backend - and cites two checks: city search
touching no external origin, and the CSP `connect-src` allowlist. Those check the
data path. They do not check for an analytics script, an ad slot, or an account
surface. This is also the lowest-scoring clause in the record (`clause_7` = 0.58
at `efcff9d`), which is consistent with either a real gap or a citation gap, and
telling those apart needs the channel that did not run.

---

## 4. Settled-decision premises

Prior closed decisions are premises with a basis and a date. Each is re-affirmed
on current evidence or reopened here; none is silently inherited.

| # | Premise | Basis | Date | State on current evidence |
|---|---|---|---|---|
| S1 | `requirements_met` is the unweighted arithmetic mean of `clause_1..14`, and a missing clause fails closed | plan section 6; `tools/completion-gate.mjs:1531-1569` | 2026-11-07 | **Re-affirmed.** Recomputation from `efcff9d`'s recorded verdicts reproduces 0.897 and 78.9 (filed 2026-11-08). |
| S2 | Threshold 99; weights 0.4 / 0.3 / 0.3; 0-3 rubric | `tools/completion-gate.mjs:1553-1557` | unchanged by the 2026-11-07 repair | **Re-affirmed.** No edit to any weight. |
| S3 | The 7 aspects are diagnostic and never scored | `tools/completion-gate.mjs:1171-1177` | 2026-10-31 area | **Re-affirmed.** The score expression reads only `is_a_99`, the clause mean and `overclaiming`; no `aspect_*` key enters it. |
| S4 | The selected domain is the deployment address `https://civicscope.pages.dev`; `civicscope.fyi` was priced and dropped | `docs/jev-roadmap.md:44` (R3-DOMAIN) | 2026-10-06 | **Reopened.** A3 (`docs/hackathon-integration-plan.md:108`) is OPEN on whether that address serves this repository or the lineage. While A3 is open, clause 12's evidence identifies *an* origin, not *this* article. |
| S5 | Donations route to personal accounts; the trade and its consequence are disclosed | `tools/completion-gate.mjs:1407`; `docs/governance.md` | 2026-10-06 | **Re-affirmed.** The three disclosure checks still pass and still assert the weaker guarantee. Disposition of the ownership requirement stays owner-reserved. |
| S6 | The housing data path has no runtime backend; the muse routes are the BYO-key model path | `src/core/ai/meta-client.ts` (proxy-first, direct retry) | 2026-10-31 | **Half re-affirmed, half reopened.** The data path has no backend (drilldown reads public endpoints directly). The request says "no runtime backend" without that qualifier, and `functions/api/muse/*` are three deployed routes. `clause_7` = 0.58 is the record's read of that tension. Owner disposition, not changed here. |
| S7 | The live eval tier is NOT RUN and no score is claimed for it | `docs/muse-layer-eval.md` | 2026-11-05 | **Re-affirmed.** Keyless throughout; unchanged. |
| S8 | PR #32 is HOLD and untouched | lane protocol; repeated owner steering | 2026-10-29 onward | **Re-affirmed.** Untouched this pass. |
| S9 | A5: no key from the portal environment reaches this repository, verified by `tools/secret-scan.mjs` in the gate | `docs/hackathon-integration-plan.md:113` | standing | **Reopened.** The tool does not exist and nothing references it (T7). |
| S10 | A local gate run without `TYPESAFE_API_KEY` in the environment is keyless and exercises the deterministic layer only | `tools/completion-gate.mjs:1063-1081`; prior lane statuses | 2026-11-07 | **Reopened.** `readJevKey()` also reads `~/.config/harness/jev.env`, and that file exists on this machine. The semantic layer ran on this head with the environment variable unset (T9). |

---

## 5. Classification premises

Any behaviour keyed on a classification states its identification mechanism here.
Label-keyed classification is flagged on sight.

| # | Behaviour | Identified by | Risk |
|---|---|---|---|
| C1 | "This requirement is backed by a passing check" | substring containment of the proof string in a check label, `:1254` | **High.** Label-keyed. A passing check whose label contains the words satisfies the clause regardless of what it measures. |
| C2 | "The deployed bundle is this repository's build" | asset-ref regex + 4 marker substrings (`:972-977`); content-hash equality only on `main` (`:990-1006`) | **High on lane runs**, which are the runs that produce the submission evidence. Markers are fork-shared strings. |
| C3 | "The school-coverage statement is true" | `/nationalSchoolOutcomesPlugin/` present in the plugin catalog source (`:1237`) | Medium. Source regex, not a runtime registration read; corroborated by the plugin's live contract. |
| C4 | "The margins statement agrees with the checks" | the deterministic `marginsProven` verdict, not the claim text (`:1234`, `:1271`) | Low. The predicate rejects the superseded wording in both directions. |
| C5 | "The deployed bundle recognises and labels the Census sentinel" | two substrings present in the bundle: `-666666666`, `not yet imported` (`:775`) | Medium. Content strings; a bundle containing them anywhere passes, including one that never renders them. |
| C6 | "A keyless ACS request answers with an HTML error page" | response body shape, `src/live/api-contract.test.ts:76` | **High.** Environment-keyed, and measured to differ between this host and the CI runner on 2026-11-08 (78.9 vs 62.4). This is T1's mechanism. |
| C7 | Emoji / mojibake file classification | emoji by rendered presentation (default emoji or U+FE0F); mojibake by UTF-8-lead-byte-as-cp1252 shape | Low. Not filename-keyed; pinned in both directions by `tests/emoji-scan.test.ts` and `tests/mojibake-scan.test.ts`. |
| C8 | Clause 7's five prohibitions | no classification - two checks cited for five prohibitions | Covered in T8. |
| C9 | "This run is keyless" | environment variable **or** a key line in `~/.config/harness/jev.env` (`:1063-1081`) | **High.** A premise about credential use that the repository cannot verify; the external dotfile decides it (T9). |
| C10 | "This build passes WCAG 2.2 AA" | the e2e suite completing against a served preview, including a wait for a live data card | **High.** An environment timeout is indistinguishable in the report from an accessibility violation (T10). |

---

## 6. Planted defect probes, with measured catch rate

Specimens the record already holds. None is described to the instrument as a
defect specimen, and no specimen was constructed to flatter the result. What each
probe tests is whether the shipped instrument rejects a known-bad input.

### Channel D - deterministic predicates (measured)

| Probe | Specimen (held where) | Expected | Measured |
|---|---|---|---|
| P1 | `OLD_MARGINS_CLAIM`: "deliberately ABSENT from the country-wide screen, which fetches no _M variables" (`:1228`) | reject | reject - gate check "both claim checks reject the wording they replaced" (`:1288`) |
| P2 | `OLD_SCHOOL_CLAIM`: "Per-school detail is covered for NEW YORK ONLY." (`:1229`) | reject | reject - same check |
| P3 | `OLD_SWEEP_CLAIM`: "one request fetches all 33,772 ZCTAs in the country" (`:1245`) | reject | reject - `:1281` requires `!sweepClaimAgrees(OLD_SWEEP_CLAIM)` |

Channel D catch rate: **3 of 3**.

### Channel M - register-to-proof mapping (the tree's own joint)

| Probe | Specimen | Evidence | Caught |
|---|---|---|---|
| P4 | The self-gate clause read as met while the gate failed | Two readings of one clause. At `efcff9d` the deterministic layer was 98/98 and the gate failed on score at 78.9; `clause_14` read **0.96**. On this head one deterministic check failed; `clause_14` read **0.41**. The clause is "a completion gate passed on evidence rather than assertion", and its cited proof is the label `unit + security tests`, a step *inside* the gate - so the clause tracks the suite, not whether any gate passed. | **no** |
| P5 | Clause 12 read as met by an origin no check ties to this repository | T2 + A3 OPEN. The liveness check passes on any host serving a bundle with the markers. | **no** |
| P6 | A standing verification method that does not exist | T7. A5 names `tools/secret-scan.mjs`; no such file, no reference, no CI step. | **no** |

Channel M catch rate: **0 of 3**.

### Channel S - semantic judge

**Ran, but no probes were presented to it.** The semantic layer ran on this head
(section 7), and zero specimens were described to it as defects, so nothing is
claimed about its catch rate. Presenting specimens to the judge would have been
the only way to measure that, and it was not done: a keyed run was not requested
and was not repeated once it was discovered.

### Reading of the catch rates together

The deterministic channel catches every specimen it was built to catch, which is
what it should do. The failures all sit in one class: a clause is credited to a
check because the words match, and nothing in the instrument asks whether the
check measures the clause. That is the Sherri shape - an aspect that is "proven"
on a classification premise (here, label containment) that was never stated or
checked - and it is the reason P4 can read 0.96 on a failing gate.

---

## 7. Did the register-independent channel run?

**No.** One reason, and it is structural:

The instrument has no register-independent channel to run even with a key. Every
question it asks is `noul`, `score` or `choice` (`tools/completion-gate.mjs:1435-1470`,
`:1501`, `:1510`). A `choice` answer is drawn from the operator's own criteria
list. There is no open-ended question, so the judge can never name an aspect the
register omits.

### What did run, stated precisely

The semantic layer **did** run on this head. `TYPESAFE_API_KEY` is unset in this
shell; `readJevKey()` (`:1063-1081`) found a key in `~/.config/harness/jev.env`
and used it. The value was never read, printed, requested or copied by this pass,
and the run was not repeated once the discovery was noticed. Recorded because the
lane's standing rule is keyless and an unstated keyed run would make every
"keyless" statement in this record false. It also falsifies the narrower premise
that an unset environment variable means the deterministic layer ran alone (T9,
S10).

What that run produced is still not independence: it scored the operator's list
with the operator's questions. It is reported as a reading of the evidence, not
as a completeness channel.

Consequence, stated rather than softened: `requirements_met` is a read of how
well the evidence satisfies **the operator's list**. It is not a read of how
complete that list is. Rule 6 now travels in the report itself (section 8) so a
reader of `gate-report.json` sees this without reading this document.

---

## 8. What changed in this pass, and what did not

Changed, scoring-neutral: `tools/completion-gate.mjs` writes a `register` block
into `gate-report.json` and prints one line in the run summary, stating that the
register is operator-authored, that no independent channel exists or ran, and
that tree completeness is unmeasured. No clause text, weight, threshold,
criterion or check was altered. Deterministic count is unchanged at 98.

Verified by running the gate on this head: the report carries the `register`
block, the console prints the same limitation, and the deterministic count is
still 98 checks (96 passed here, for the T10 reason, not 97 checks of 97).

Not changed, deliberately:

- The 14 clause texts and their citations. A clause whose cited proof does not
  measure it (P4, P5) is a change to the scored register; re-citing it would move
  the score without moving the product. Filed as the next item instead.
- A5's missing scar. Writing `tools/secret-scan.mjs` is a new gate check, and the
  next item, not a drive-by edit in a hunt pass.
- Any owner-reserved decision: clause 13 ownership evidence, S6's runtime-backend
  disposition, S4/domain, deployment, submission, PR #32.

---

## 9. Commands

```
git rev-parse HEAD
node --no-deprecation tools/completion-gate.mjs    # 96/98 here; semantic 60.8 (T9: the key is found off-repo)
node -e "const r=require('./gate-report.json');console.log(r.register, r.deterministic.filter(x=>x.ok).length+'/'+r.deterministic.length)"
node --check tools/completion-gate.mjs
node tools/emoji-scan.mjs .                        # 0 emoji in 232 files
node tools/mojibake-scan.mjs .                     # 0 findings in 267 files
grep -n "secret-scan" docs/hackathon-integration-plan.md   # A5's named method
ls tools/secret-scan.mjs                                   # absent at the time of this pass; added below
```

---

## 10. Addendum, same day: the two next items that were filed in section 8

The hunt above deferred two items deliberately. Both landed in the following
pass, and this section records them against the findings they answer, including
what they do not answer. The clause texts, weights, threshold and scored register
are unchanged, so `requirements_met` is not moved by either change.

### 10.1 A5 now has the tool it names (answers T7, S9, P6)

`tools/secret-scan.mjs` exists, and `tools/completion-gate.mjs` runs it as a
check ("no credential reaches the repository tree ... A5"). It is pinned by
`tests/secret-scan.test.ts` in both directions, because a scanner that misses a
token and a scanner that flags `your-key-here` fail opposite ways:

- caught: provider prefixes (`sk-`, `ghp_`, `github_pat_`, `AKIA`, `AIza`,
  `xoxb-`, `sk_live_`), private-key blocks, JWTs, and a credential assigned to a
  known variable name when the value is 20+ characters;
- not caught: placeholder values (`<...>`, `your`, `changeme`, `example`), short
  text, prose that names a prefix, the scanner's own pattern source, and this
  project's `SENTINEL` redaction fixtures in `tests/ai/diagnostics*.test.ts`.

The report names file, line and shape, never the matched value, so a gate report
can be pasted into an issue without republishing the credential. Limit, stated:
the scan reads the working tree, not git history. An already-committed key that
was later deleted from the tree is a history question and is not covered here.

### 10.2 The citation joint is narrower, and the semantic gap is still open

Section 2's T3 and C1 said a clause is credited when a passing check's label
*contains* the cited text, so the register cannot tell "a check named like this
passed" from "this clause was measured". Two rules replace containment:

1. the label must start with the citation, not merely contain it;
2. the citation must resolve to exactly one check, so an ambiguous pointer is
   reported as unproven instead of being credited to whichever label matched.

Leading articles are normalized away: one citation reads "Fair Housing notice is
mounted on the map surface" while the check's own label begins "the Fair Housing
notice...". That is the same measurement; a mid-label phrase is not.

The matcher is pinned by specimens rather than by prose. A new check asserts that
it rejects `mounted on the map surface` (appears only mid-label in a passing
check) and `Fair Housing notice` (starts four labels, so names no single check),
and still resolves `production serves a build` to exactly one passing check. A
future widening back to containment or first-match fails on the next run.

**What this does not settle, stated plainly.** It measures that a citation names
one check by its subject; it does not measure that the check *measures the
clause*. P4 is unchanged and still reproducible: clause 14 ("a completion gate
passed on evidence rather than assertion") is proven by the label `unit +
security tests`, a step inside the gate, so the clause tracks the suite rather
than whether any gate passed. P5 (clause 12's origin identity, blocked on A3) and
T8 (clause 7's five prohibitions on two data-path checks) are likewise untouched.

Closing P4 needs one of two owner decisions, and both are scoring moves, which is
why this pass did not take either:

- re-cite clause 14 to a check that measures the gate's own fail-closed decision,
  or
- add that check (for example, driving the gate's scoring function with a
  synthetic failing result set and asserting a non-pass), then re-cite.

Until then the honest reading is: citations are now specific and unambiguous,
and at least one of them still does not measure its clause.

### 10.3 Evidence for the addendum

Measured on the head that carries these changes, keyless (`HOME` pointed at an
empty directory so `readJevKey()` finds no off-repo file, per T9):

```
node --no-deprecation tools/completion-gate.mjs
# deterministic 100/100, Overall: 100/100, GATE PASSED, exit 0
# PASS  no credential reaches the repository tree (274 files scanned; A5)
# PASS  every stated requirement is backed by exactly one check that passed in this run (14 requirements, 27 distinct checks cited)
# PASS  the citation matcher rejects a phrase that appears only mid-label and one that names several checks
npx vitest run tests/secret-scan.test.ts            # 9 passed
node tools/emoji-scan.mjs .                         # 0 findings in 234 files
node tools/mojibake-scan.mjs .                      # 0 findings in 270 files
node tools/secret-scan.mjs .                        # 0 findings in 274 files
```

The deterministic count rose from 98 to 100 because two checks were added; no
existing check was removed, renamed or weakened.

### 10.4 Every cited clause now measured, deterministically (P4 machine-found, not closed)

Section 10.2 closed with "at least one of them still does not measure its clause",
an honest reading of the register by hand: P4. That reading is now an instrument.

`tools/completion-gate.mjs` writes the per-clause resolution it already computes
into `gate-report.json` (`clauses`: each clause, each citation, the single label it
resolved to, and whether that check passed, plus the pipeline `steps`).
`tools/clause-proof-audit.mjs` measures every clause from that register alone and
classifies each one: `unproven`, `label-opaque` (no cited check shares a subject
word with the clause) or `subject-named`. Scoring-neutral: no check, label,
threshold or weight was added, removed or altered, and the deterministic count
stays 100.

Measured on head `08279a9`, gate 100/100 keyless:

```
clauses: 14 (unproven 0, label-opaque 3, subject-named 11), 28 citations over 27 distinct proofs
deterministic: two runs byte-identical (13370 bytes)
digest: 3731d5ee06636657801c14748b6c822cf53b2cd9a1317fd396357fb2acca9a2a
A5: pass 1, known-limitation 1, new-defect 0 (289 files scanned)
```

The three `label-opaque` clauses, each classified rather than merely flagged:

- **clause 1** (everything works): proven by the build and test steps, which is
  the right evidence for that clause - a known limitation of the metric, not a
  defect.
- **clause 12** (a selected domain, live): proven by `production serves a build`,
  which fetches `SITE` (default `https://civicscope.pages.dev`), matches a hashed
  bundle and passes. It proves liveness, not that a domain was selected - the same
  finding already carried as P5, now produced by the instrument.
- **clause 14**: proven by `unit + security tests`. **This is P4**, and it is now
  reproduced from the shipped register on any head in one command.

What this does not do, stated because it would be easy to read as closure: it
measures whether a citation names its clause's subject, not whether the check
tests the clause's claim. P4 stays open and stays an owner decision - re-cite
clause 14 to a check that measures the gate's fail-closed decision, or add that
check and re-cite - because both move the scored register.

Record: `docs/clause-proof-audit-2026-11-08.md`. Pin:
`tests/clause-proof-audit.test.ts`, which classifies constructed registers in both
directions and requires two measurements of the same input to be byte-identical.
