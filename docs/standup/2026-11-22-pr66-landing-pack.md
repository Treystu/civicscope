# PR #66 landing-readiness pack: current heads, the cures, and the one-pass order

Re-derived 2026-11-24 against the governing `#79` entry of `2026-11-23T08:01:53Z`
(checkpoint STRUCK; PR #32 and the #31 archive-ref deletion remain owner-held). It
supersedes the 2026-11-22 version of this file, which was written when `main` was
`0b59f724` and the blanket hold was in force.

Nothing here was executed: no merge, no un-draft, no retarget, no push to PR #66 or PR #32,
no deploy, no instrument edit on any shared head, no issue comment or close. Every SHA and
every check result below is drawn from a command run or an API payload read in this turn,
cited in the row.

## 1. Heads at this moment

| Element | SHA | Read from |
| --- | --- | --- |
| `main` | `573557f5cd7200da70bd472df9208e7282f40b71` | `git ls-remote origin refs/heads/main` |
| PR #66 head (`lane/submission`) | `30a29317ba329333bae9a7d45dd3c6ab9c60de52` | `ls-remote refs/heads/lane/submission`; API `pulls/66` `head.sha` |
| PR #66 base (`contest/house-port`) | `fc8addf6c8710180bdd1ac1f58861fa2d614e876` | `ls-remote refs/heads/contest/house-port`; API `pulls/66` `base.sha` |
| PR #32 head (`docs/plan-rulings-20261025`) | `d303e04aa9a890da2f5e5fa8392e014bdda9c2ee` | `ls-remote refs/heads/docs/plan-rulings-20261025`; API `pulls/32` |
| PR #32 base record | `main@3aa7e10dc59e764a8636aa273d4ff86714a3e782` | API `pulls/32` `base.sha` (the PR predates `cb930c7`) |
| Lane branch (`freebuff/efba53c4941d50ab6d8f229e`) | `7c3e401c88c1442be9d87a1e0cd7b3aaa9848351` before this pack; the pack commit moves it and its SHA is reported in the final message | `ls-remote refs/heads/freebuff/...`; local `git log -1` |
| Lane branch relative to `main` | 5 ahead, 0 behind | `git rev-list --left-right --count origin/main...origin/freebuff/...` |

Lane-only commits, newest first: `7c3e401`, `83b7138`, `632928b`, `a793bcb`, `e55dfe6` -
all `docs/standup/` filings from this lane.

PR #66 as the API reports it: `state=open`, `draft=true`, `mergeable=true`,
`merge_state=unstable`, 127 commits, 181 files, `+68169/-299`,
`updated_at=2026-11-23T08:01:55Z`, title "Lane: submission path (#55 live provider, #60 eval,
#57 diagnosis)". PR #32: `state=open`, `draft=false`, `mergeable=null` (not yet computed),
1 commit, 1 file, `+26/-12`, `updated_at=2026-10-26T03:56:44Z`.

The `unstable` merge state is the Actions rail never starting, not a conflict: at both
`0b59f72` and `573557f` all three Actions check runs sit `completed / failure` after one
to two seconds, while CircleCI reports `verify` and `live-contracts` success.

## 2. Divergence between PR #66's head and `main`

    git merge-base origin/main origin/lane/submission   -> fc8addf6c8710180bdd1ac1f58861fa2d614e876
    git rev-list --left-right --count origin/main...origin/lane/submission -> 9   127

Nine commits only on `main`, 127 only on the PR head. The merge base is the current
`contest/house-port` tip, so the PR is strictly ahead of its own base: `0` behind, `127`
ahead of `fc8addf6`.

### The nine `main`-only commits

| Commit | Subject | Paths changed |
| --- | --- | --- |
| `573557f` | Correct the similarity export count in the #31 verdict record | `docs/standup/` (2 files, +52/-6) |
| `b8f5c4a` | File the #31 per-branch verdict table and re-run the privacy rows | `docs/standup/` (2 files, +145/-11) |
| `756a9f2` | Name the live test that stalls the gate, and file the lane state record | `docs/standup/` (2 files, +66/-1) |
| `f0692f6` | Record why the gate total is missing at main, not just that it is | `docs/standup/` (1 file, +18/-5) |
| `1b5068d` | File the verification and prep lane: census, gate readings, landing pack, deploy prep | `docs/standup/` (4 files, +505) |
| `0b59f72` | Merge contest/house-port into main: the House layer (#82) | 75 files, +7696/-125 |
| `7f0bc76` | Merge contest/house-port into main: the House layer | 75 files, +7696/-125 |
| `cb930c7` | CI: land the CircleCI rail on main (#81) | `.circleci/config.yml` (+121) |
| `5c3fa82` | Add hackathon bridge section to README | `README.md` (+14) |

The first five are this lane's filings, which landed on `main` through an un-named platform
push and are the subject of the revert decision in step 2. The last four predate them.

`git diff --name-only origin/lane/submission...origin/main` returns exactly eight paths:
`.circleci/config.yml`, `README.md`, and the five `docs/standup/` files plus
`docs/standup/2026-11-22-lane-state.md`. The PR head touches **0** paths under
`docs/standup/`, which is why the revert decision cannot create a conflict.

### The 127 PR-only commits

Newest twelve: `30a2931`, `5196fa8`, `ecda296`, `2ca2680`, `4e5a956`, `66dc772`, `17be735`,
`06a1f41`, `f3707e5`, `f527040`, `7a64481`, `310f05f`. They are the submission chain: the
House decision lane, the clause_7 evidence packet and its citation corrections, the proof
audit, and the gate re-runs. The full list is `git log origin/main..origin/lane/submission`.

## 3. The #78 and #80 cure commits

All three were located by `git log --all --grep='#78' --grep='#80'`, then each was checked
with `git merge-base --is-ancestor` against both heads.

| Commit | Cure | Parent | Content | Reachable from `30a29317`? | On `main`? |
| --- | --- | --- | --- | --- | --- |
| `06900bb02f8fed471134309fd3383f21e719bc42` | #78, test-side set comparison | `0d1c043` | `tests/sitemap-completeness.test.ts` +88: every ZCTA in the committed index present as a `/z/{zip}/` URL, no URL outside it, with a negative case that one dropped ZIP breaks the set rule while the count rule misses it | yes (`is-ancestor` exit 0) | no (exit 1) |
| `906ac8bc3c6ef139be47b1324c486780e3755fde` | #78, instrument-side set comparison | `915fcf8` | 5 files, +244/-119: `tools/completion-gate.mjs` +44, new `tools/zcta-index.mjs` +130 and `tools/zcta-index.d.mts` +36, `src/core/zcta-county-index.ts` -129 net, test updated | yes | no |
| `c4497e5e6d373bf9947031f1c881db4a587f10dc` | #80, register-independent diagnostic probe | `5c0b072` | new `tools/register-probe.mjs`, +117; measurement-only, reports NOT CHECKED rather than a clean result when it cannot run | yes | no |

Issue state from the API: `#78` closed `2026-11-11T08:48:29Z` ("The gate's `sitemap covers
every ZIP code` check counts URLs (>30000), so a site updated..."), `#80` closed
`2026-11-11T09:04:49Z` ("Jev's semantic register is operator-authored and menu-bound...").

Consequence: both cures exist and are reachable from the PR head, and neither is on `main`.
A landing therefore changes the instrument version that any post-merge gate reading is taken
with - the sitemap clause is a set comparison after the merge and a count before it. That
belongs beside the reading, not inside it.

## 4. Does the clause_7 restatement apply to the PR head today?

Re-run this turn, not recalled:

    git show 7c3e401:docs/standup/clause-7-restatement.patch > /tmp/p7.patch
    git switch --detach origin/lane/submission      # HEAD = 30a29317ba329333bae9a7d45dd3c6ab9c60de52
    grep -c "no advertising, analytics, search logging, accounts or runtime backend" tools/completion-gate.mjs
        -> 1
    git apply --check /tmp/p7.patch
        -> exit 0

It also applies to the **merged** tree, which is the head the edit would actually run on:

    git merge-tree --write-tree origin/main origin/lane/submission -> 28002849ffd743f078ec27bdb75727470bfa605f, exit 0
    extract 28002849:tools/completion-gate.mjs, then git apply --check -p1 /tmp/p7.patch -> exit 0

And the restatement is not merely applicable, it has been measured at that head: with the
patch applied locally at `30a29317`, the gate returned **99/100 deterministic checks**, 28
cited proof pairs with 27 passed, clause_7 proven on both of its proofs, and the sole
unproven clause the WCAG audit that needs a browser this workspace lacks. The semantic layer
was skipped for want of `TYPESAFE_API_KEY`, so the 99 threshold itself is **not measured**.
Full record and controls: `docs/standup/2026-11-24-clause7-remeasurement.md`. The patch is
unlanded; `30a29317` still carries the old text, and `main` carries no clause table at all.

## 5. Merge cleanliness, both base options

    git merge-tree --write-tree origin/main origin/lane/submission
        -> tree 28002849ffd743f078ec27bdb75727470bfa605f, exit 0, no CONFLICT lines

    # base with the five lane filings reverted (synthetic dangling commit e70df8b
    # carrying tree 2a4eb9a, parent origin/main; no ref created)
    git merge-tree --write-tree e70df8b origin/lane/submission
        -> tree c27a617f3053521e93b96c00c6dcece133677b1e, exit 0, no CONFLICT lines

Both options in step 2 merge textually clean. Only two paths are touched on both sides
since the merge base - `README.md` and `.circleci/config.yml` - and both auto-merge; the
PR head touches nothing under `docs/standup/`, so deleting those files first cannot
conflict with it.

## 6. Ordered landing sequence

Each step names the head it operates on. "State" is what was observed today.

| # | Step | Head / ref | Precondition | Current state | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Re-confirm heads: `main`, `lane/submission`, `docs/plan-rulings-20261025` | all four refs | none | satisfied today; must be re-read at lift | section 1 |
| 2 | **Owner choice A: the base-revert decision** - revert the five lane filings on `main` (`git revert --no-commit 0b59f72..573557f`, producing tree `2a4eb9a`), or accept them where they stand | `main` `573557f` | owner decision | UNDECIDED, owner | rehearsal and blast radius in `docs/standup/2026-11-24-main-push-blast-radius.md` |
| 3 | **Owner choice B: merge order** - merge PR #66 before the instrument edit (the permanent record then shows a red gate whose reason is the old clause) or after it (the record shows a green-or-not gate under the restated clause, but the merged head must first be edited and re-measured) | `30a29317` into base | owner decision | UNDECIDED, owner | section 4; the threshold stays 99 either way |
| 4 | Un-draft PR #66 | PR #66 `30a29317` | steps 2 and 3 | NOT MET: `draft=true`; un-drafting modifies the PR, which this lane may not do | API `pulls/66` |
| 5 | Merge PR #66 at `30a29317` into the base chosen in step 2 (merge commit matching the #82 style, or squash) | `30a29317` into `main` (or the reverted `main`) | step 4; clean merge | MET textually: both base options exit 0 with no conflicts | section 5 |
| 6 | Read the rail on the merged head: `verify`, `live-contracts`, `completion-gate` | merged head | step 5 | NOT MET: no merged head exists yet; the config is `cb930c7` and the instrument on the merged head is the PR's, including the #78 set comparison | section 3, `docs/standup/2026-11-22-completion-gate-readings.md` |
| 7 | Apply `docs/standup/clause-7-restatement.patch` (+6/-1) to `tools/completion-gate.mjs` on the merged head, proofs unchanged, threshold unchanged | merged head | step 5 (so the target is the merged tree, not a branch) | MET as prepared: applies at `30a29317` and at merged tree `28002849`, both exit 0; unlanded by design | section 4 |
| 8 | Re-run the gate under the restated clause at the edited merged head and record both numbers | merged head + step 7 | `TYPESAFE_API_KEY` for the threshold reading | deterministic half measured at `30a29317` (99/100); semantic half NOT MEASURED, key absent | `2026-11-24-clause7-remeasurement.md` |
| 9 | Post the step-8 reading on `#79`, which stays open until it exists | `#79` | step 8 | NOT MET; posting is an issue write this lane has not been authorised to make as a decision | `#79` 2026-11-22 entry, last condition |
| 10 | Land PR #32 (`d303e04a`, `docs/full-muse-layer-plan.md`, +26/-12) | `d303e04a` into `main` | owner's HOLD on #32 must lift | HELD by the 2026-11-23 entry, which preserves it explicitly | API `pulls/32`; `#79` 11-23 |
| 11 | Owner-reserved acts: `#31` archive-ref deletion, `#63` privacy sign-off | refs under `archive/20261021/branch/*`; `#63` | owner decision | HELD: both preserved by the 11-23 entry | `#79` 11-23; `2026-11-22-deploy-blocked-prep.md` |

Step 10 is order-independent of steps 5-9: #32 touches one docs file the PR head has not
modified, and its mergeability is simply not computed yet.

### What choice A changes for the later steps

- **Revert first.** `main` returns to tree `2a4eb9a` (byte-identical to `0b59f724`), the
  merge in step 5 produces tree `c27a617f`, and the five filings survive only on this lane
  branch. Cost: the filings leave `main` and every later reading cites this branch.
- **Accept them.** The merge in step 5 produces tree `28002849`, and the filings are public
  on `main` ahead of the PR. Cost: the accidental push stays in the public history, and the
  revert would have to be a later, separate act.

Neither option changes step 7's applicability (patch checks exit 0 against both merged
trees) - that is the point of measuring both.

## 7. Preconditions, each with its observed state

| Precondition | Needed by | State | Evidence |
| --- | --- | --- | --- |
| Blanket checkpoint lifted | all | MET | `#79` `2026-11-23T08:01:53Z`: blanket checkpoint STRUCK |
| PR #66 textually mergeable into `main` | 5 | MET | merge-tree exit 0, both base options |
| PR #66 not a draft | 4, 5 | NOT MET (`draft=true`) | API `pulls/66` |
| 127-commit history present on the PR head | 5 | MET | `git rev-list --count origin/main..origin/lane/submission` = 127 |
| #78 cures on the PR head | 5, 6 | MET | `06900bb`, `906ac8b` ancestors of `30a29317` |
| #80 probe on the PR head | 5 | MET | `c4497e5` ancestor of `30a29317` |
| CircleCI rail on the base | 6 | MET | `.circleci/config.yml` at `cb930c7`, present on `main` |
| Deterministic gate layer at or above the bar under the restated clause | 6, 8 | MET as measured (99/100); the one miss is the browser-dependent WCAG audit | section 4 |
| Semantic layer measured at 99 | 6, 8 | NOT MET, and not closable here | `TYPESAFE_API_KEY` absent; the gate prints `not measured` |
| clause_7 restatement prepared and applicable | 7 | MET | `apply --check` exit 0 at `30a29317` and at merged tree `28002849` |
| clause_7 restatement landed | 8 | NOT MET by design | `30a29317` still carries the old clause (1 occurrence) |
| Base-revert decision | 5 | UNDECIDED, owner | step 2 |
| Merge-order decision | 5-9 | UNDECIDED, owner | step 3 |
| PR #32 HOLD lifted | 10 | NOT MET | preserved by `#79` 11-23 |
| `#31` ref deletion authorised | 11 | NOT MET | preserved by `#79` 11-23 |

## 8. What is not done, and what this lane cannot do

- No merge of #66 or #32, no un-draft, no retarget, no deploy. Every step above is a
  written instruction, not an act.
- The instrument edit is prepared and measured locally but not landed, and this lane does
  not edit `tools/completion-gate.mjs` on any shared head. The edit's local runs were in a
  detached checkout that was restored afterwards.
- The 99 threshold cannot be read without `TYPESAFE_API_KEY`. This lane does not hold it,
  does not request it in the clear, and will not write it into the tree. Until it exists,
  the strongest true statement about the gate is "99 of 100 deterministic checks, semantics
  not measured".
- The WCAG 2.2 AA clause cannot be proven here: the audit needs a real browser, and this
  workspace cannot load `chrome-headless-shell` (`libnspr4` missing, no root to install it).
- PR #32 stays on the owner's hold, and `#31`'s ref deletion and `#63`'s sign-off stay the
  owner's calls; nothing in this pack narrows or reinterprets those holds.
- The lane does not comment on, label, or close any issue. The `#79` reading in step 9 is
  drafted here as evidence; posting it is a separate authorised act.
- The base push that put five filings on `main` is still unrepaired, because reverting is
  choice A above and belongs to the owner.

## Sources, recap

- `git ls-remote origin` for every head; `git rev-parse`, `git merge-base`,
  `git rev-list --left-right --count`, `git log --grep`, `git merge-base --is-ancestor`,
  `git show --stat` for every divergence and cure claim.
- `git merge-tree --write-tree` for both base options; synthetic dangling commit
  `e70df8b` for the reverted-base variant (no ref created, nothing pushed).
- `git apply --check` against `30a29317` and against merged tree `28002849`.
- GitHub API: `pulls/66`, `pulls/32`, `issues/78`, `issues/80`, read this turn (the
  anonymous quota read 34 remaining before those four calls; the `#79` governing entry
  itself was read from the issue's public HTML payload after the earlier exhaustion).
