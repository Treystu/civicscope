# PR #66 landing-readiness pack: the chain, its divergence, and the one-pass order

Written 2026-11-22 against `main` `0b59f724` and `lane/submission` `30a29317`.
Nothing here was executed. No merge, no retarget, no un-draft, no push to PR #66, no
push to PR #32, no deploy, no instrument edit. This is the pack that makes the chain
executable in one pass the moment the owner lifts the checkpoint.

## 1. The chain as it stands

| Element | Value | How it was measured |
| --- | --- | --- |
| `main` | `0b59f724a8830a05f385f9cd8c1789ac0a2417d9` | `git rev-parse HEAD`, `git ls-remote origin refs/heads/main` |
| PR #66 head (`lane/submission`) | `30a29317ba329333bae9a7d45dd3c6ab9c60de52` | `refs/pull/66/head`, GitHub API `pulls/66` |
| PR #66 base (`contest/house-port`) | `fc8addf6c8710180bdd1ac1f58861fa2d614e876` | `git ls-remote origin refs/heads/contest/house-port` |
| Merge base | `fc8addf6` | `git merge-base main lane/submission` |
| Divergence | lane is 127 ahead, 4 behind `main` | `git rev-list --count` both directions |
| PR #66 size | 181 files, +68169 / -299, 127 commits | GitHub API `pulls/66` |
| Draft | yes | GitHub API `pulls/66` `draft: true` |
| GitHub mergeable | `true`, `mergeStateStatus: unstable` | GitHub API `pulls/66` |
| Test merge into `main` `0b59f724` | clean, exit 0, no conflicting paths, 180 files staged | detached worktree merge, `git merge --no-commit --no-ff`, removed afterwards |
| PR #32 head | `d303e04aa9a890da2f5e5fa8392e014bdda9c2ee` (`docs/plan-rulings-20261025`) | `refs/pull/32/head` |
| PR #32 divergence | 1 ahead, 39 behind `main`; one file, +26 / -12 | `git rev-list --count`, `git diff --stat` |

The `unstable` merge state is not a conflict and not a product failure. It is the
GitHub Actions rail refusing to start: `verify`, `live-contracts` and `completion-gate`
for `30a29317` each report `completed / failure` after 2 to 3 seconds, which is a
runner that never started. The project's real rail is CircleCI, configured at
`cb930c7`, and its readings are in `docs/standup/2026-11-22-completion-gate-readings.md`.

### Divergence detail: what the 4 main-only commits change

| Commit | Subject | Paths |
| --- | --- | --- |
| `5c3fa82` | Add hackathon bridge section to README | `README.md` (+14) |
| `cb930c7` | CI: land the CircleCI rail on main (#81) | `.circleci/config.yml` (+121) |
| `7f0bc76`, `0b59f72` | the #82 merge of `contest/house-port` into `main` | House layer, docs, functions, package-lock |

Only two paths are touched on both sides since the merge base: `README.md` and
`.circleci/config.yml`. Both auto-merge:

- `README.md`: the merged tree keeps `main`'s hackathon title, the judged-build line,
  the Muse-layer paragraph, the solo-contributor line and the provenance paragraph, and
  adds the lane's Muse section below them. Read from the merge result, not inferred.
- `.circleci/config.yml`: byte-identical after the merge, 4,608 bytes on both sides.
  The CI rail is not at risk from this landing.

### The #78 and #80 cure commits: present on the lane, absent from main

| Commit | Cure | Content | In `main`? | In lane? |
| --- | --- | --- | --- | --- |
| `06900bb` | #78, test-side set comparison | `tests/sitemap-completeness.test.ts` (+88): every ZCTA in the committed index present as a `/z/{zip}/` URL, no URL outside it, plus a negative case where one dropped ZIP is caught by the set rule and missed by the count rule | no | yes |
| `906ac8b` | #78, instrument-side set comparison | `tools/completion-gate.mjs` (+44), new `tools/zcta-index.mjs` (+130) and `tools/zcta-index.d.mts` (+36), `src/core/zcta-county-index.ts` moved onto the shared decoder (-129/+?), test updated (+24/-) | no | yes |
| `c4497e5` | #80, register-independent diagnostic probe | `tools/register-probe.mjs` (+117), measurement-only, reports NOT CHECKED rather than a clean result when it cannot run | no | yes |

Consequence for a landing: the lane head carries a materially better sitemap proof than
`main` does. `main`'s gate still scores the sitemap with the old rule. Any post-merge
gate reading is taken with the improved rule, which is a different instrument version
than the ones in the recorded band. That is a fact to state beside the reading, not a
reason to prefer one head.

### One more divergence worth naming

`functions/api/muse/` differs in membership between the branches:

- `main`: `explain.ts`, `intent.ts`, `shared.ts`, `transcribe.ts` (4 files)
- lane: `briefing.ts`, `diagnostics.ts`, `explain.ts`, `intent.ts`, `transcribe.ts` (5 files, no `shared.ts`)
- merged tree: the lane's 5, which is what an auto-merge produces because the lane
  deletes `shared.ts`.

This matters to the clause_7 record in two ways. It is why the lane's citation audit
could find no `shared.ts` and still be correct, and it is why a merged head has five
server routes rather than four. A re-measurement under the restated clause must be read
against the merged inventory, not against either branch in isolation.

## 2. Ordered steps, with the exact head each one needs

Every step names its input head and its output state. The order is chosen so that no
step depends on a reading taken before it.

| # | Step | Input head | Output state | Precondition | Current state |
| --- | --- | --- | --- | --- | --- |
| 0 | Owner lifts the checkpoint | none | authority to act | owner act | HELD |
| 1 | Confirm the heads have not moved: `main` = `0b59f724`, `lane/submission` = `30a29317` | - | mapping confirmed | none | matches, read today |
| 2 | Decide the base: land into `main` (`0b59f724`) directly, or fast-forward `contest/house-port` to `main` first | `main` `0b59f724` | base chosen | owner/oversight choice | undecided; `main` is the recommended base because it is 4 ahead and the merge is clean there |
| 3 | Un-draft PR #66 | `30a29317` | PR ready for review | step 2 | draft: true |
| 4 | Merge PR #66 at `30a29317` (merge commit, matching the #82 style, or squash) | `30a29317` into base | merge commit on base | step 3, green rail on the merged head | clean merge measured today, no conflicts |
| 5 | Read the CircleCI rail on the merged head: `verify`, `live-contracts`, `completion-gate` | merged head | three conclusions | step 4 | the rail config is `cb930c7`, 4,608 bytes; last lane reading: verify success, live-contracts success, completion-gate red on the semantic criterion only |
| 6 | Apply the clause_7 restatement (Option B, #79) to `tools/completion-gate.mjs` line 1189, proofs unchanged, threshold unchanged | merged head | instrument edited | step 5 recorded, and the checkpoint lifted | NOT APPLIED; instrument frozen for this lane |
| 7 | Re-run the gate under the restated clause and record the reading on #79 | merged head + step 6 | #79 closable | step 6 | not run |
| 8 | Land PR #32 (`docs/full-muse-layer-plan.md`, +26 / -12) | `d303e04a` into `main` | docs sync | step 2 (independent of #66) | open, 39 behind, no path overlap with the lane |
| 9 | Disposition the four owner-reserved issues: #63 sign-off, #59 human run, #64 Explain split, #31 ref deletion | - | issues narrowed | step 4 | all four still open, unchanged since 2026-11-17 |

Step 8 can run before or after step 4; it touches one docs file the lane has not
modified, so it is order-independent. It is listed after the merge because the merge is
the one with a time-sensitive rail reading.

## 3. Preconditions, each with its state

| Precondition | Needed by | State today | Evidence |
| --- | --- | --- | --- |
| Owner checkpoint lifted | every step | NOT MET, held | mission terms of this lane |
| PR #66 textually mergeable into `main` | 4 | MET | merge test at `0b59f724`, exit 0, no unmerged paths |
| PR #66 not draft | 3, 4 | NOT MET (draft) | API `pulls/66` |
| Whole-commit history present on lane | 4 | MET | 127 commits reachable from `30a29317` |
| #78 cures present | 4 | MET on lane, NOT on main | `06900bb`, `906ac8b` are ancestors of `30a29317`, not of `0b59f724` |
| #80 probe present | 4 | MET on lane, NOT on main | `c4497e5` |
| CircleCI rail present on base | 5 | MET on `main` | `cb930c7`, 4,608 bytes |
| Gate deterministic layer green on the lane | 4 | MET as last read | 101/101 at the nine comparable heads, `docs/proof-closure.md` |
| Gate semantic layer at or above 99 | 4 | NOT MET and not closable as written | `clause_7` band 0.45-0.61, overall 77.9-79.7 |
| #79 Option B ruling recorded | 6, 7 | MET as a record, NOT as an edit | retarget entry on #79, 2026-11-22T06:33:45Z |
| Instrument edit applied | 7 | NOT APPLIED | `tools/completion-gate.mjs:1189` still reads the old clause |
| Trigger to merge is green CI | 4 | CONFLICT, stated not resolved | the armed-merge condition is an all-green head; the head cannot be green while the semantic layer scores the old clause. Steps 4-7 are ordered so the merge can either precede the instrument edit (and be judged on the deterministic layer plus the recorded red) or follow it (and be judged green). This sequencing is the owner's call and is not assumed here. |

The last row is the only real design question in the pack. Everything else is either
done or waiting on a named owner act.

## 4. What this pack refuses

- It does not land, rebase, retarget or un-draft anything.
- It does not edit the instrument or the threshold, and it does not re-measure clause_7
  as a way of tidying the record.
- It does not treat "clean merge" as "green head": the merge test says the branches are
  textually compatible, nothing more.
- It does not choose between merging before or after the instrument edit. That is the
  one decision that changes what the permanent gate record says about this chain.

## Sources

- `git merge-base`, `git rev-list --count`, `git rev-parse` against fetched
  `refs/remotes/pr/66`, `refs/remotes/pr/32`, `refs/heads/main`
- merge test: detached worktree at `0b59f724`, `git merge --no-commit --no-ff
  refs/remotes/pr/66`, `git diff --name-only --diff-filter=U` empty, `git merge --abort`
  implied by worktree removal. Nothing was committed or pushed.
- `git merge-tree --write-tree 0b59f724 refs/remotes/pr/66` for the merged README and
  `functions/` inventory
- GitHub API: `pulls/66`, `pulls/32`, `commits/30a29317/check-runs`
