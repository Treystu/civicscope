# Deploy-blocked prep packs: #31, #63, #59

Written 2026-11-22, revised 2026-11-24 with the #31 per-branch verdict table and the
privacy-checklist re-run. Prep only. No ref was deleted, nothing was deployed, no
submission act was performed, and no issue was commented on, closed or relabelled. Each
pack states what the act needs, what exists, and what is missing, so the act is one step
when the checkpoint lifts.

All "exists" claims below were checked against `lane/submission` at `30a29317` by
`git cat-file -e`, not read from the issue text.

---

## #31: eight archive refs, verified content, one deletion act

**What the act needs.** Eight remote ref deletions
(`git push origin --delete archive/20261021/branch/<name>`), because the refs are
destructive by nature: once deleted they are not recoverable from the remote.

**What exists.**

All eight refs are still on `origin`, at the tips the issue recorded:

    archive/20261021/branch/audit-everything                  34a0129e
    archive/20261021/branch/civicscope-complete-audit-20261019 748ce9ed
    archive/20261021/branch/complete-remaining                42499bce
    archive/20261021/branch/fix-text-and-prompt               5fad632a
    archive/20261021/branch/honest-labels                     0477fee1
    archive/20261021/branch/saved-ordering-fix                add112cb
    archive/20261021/branch/similarity-distance               6e5f502c
    archive/20261021/branch/similarity-search                 8bd45193

**A discrepancy the deletion act must resolve first.** Two readings of the same question
are on the record and they do not agree, so the pack carries both rather than the
convenient one.

- #31, 2026-11-07: `git cherry origin/main <ref>` for all eight refs returned zero
  commits not already in `main`, recorded as the stronger form of the check.
- #64, row 16, corrected 2026-11-17: patch-id against every commit reachable from
  `origin/main` says **four** of the thirteen unique commits have an equivalent and
  **nine** do not.

Measured again today, 2026-11-22, at `main` `0b59f724`, after fetching the eight refs:

| Ref | Commits not patch-equivalent to `main` | Unique commits |
| --- | --- | --- |
| audit-everything | 0 | 1 |
| civicscope-complete-audit-20261019 | 0 | 1 |
| complete-remaining | 2 | 2 |
| fix-text-and-prompt | 0 | 1 |
| honest-labels | 3 | 3 |
| saved-ordering-fix | 0 | 1 |
| similarity-distance | 2 | 2 |
| similarity-search | 2 | 2 |
| **Total** | **9** | **13** |

So the 2026-11-07 "zero" reading does not reproduce, and #64's row-16 correction is the
one that matches a rerun. The conclusion the deletion still rests on is the content
check recorded in row 16 (37 of 40 sampled added lines present verbatim in `main`, three
under variant wording), not either count. That is the distinction to keep: a patch that
is not byte-identical is not evidence of unlanded work when the merge that landed it was
a squash, but it is also not proof that the work is present.

**The per-branch verdict table (filed 2026-11-24, was missing item 2).** #31's own step 3
asks for all thirteen short SHAs plus the method, in one place, before any deletion.

Four columns are measured here, because no single one is the answer. Run at `main`
`0b59f724a8830a05f385f9cd8c1789ac0a2417d9` (the `main` ref is not materialised in the
cloud workspace; the commit is addressed by SHA):

1. **Unique** - `git rev-list <main>..<ref>`.
2. **Patch-distinct** - of those unique commits, the ones whose `git patch-id --stable`
does not occur among the patch ids of every non-merge commit in `git log -p <main>`.
3. **Content** - for every file changed on the ref side of the merge base
   (`git diff --name-only <main>...<ref>`), compare the ref tip's blob for that path with
   main's current blob and with every blob that path has ever had in main's history
   (`git rev-list <main> -- <path>`). "Current" means byte-identical to what main ships
   now; "landed earlier" means the exact blob is in main's history but a later commit
   edited the file; "never" means the branch's text is not in main at all.
4. **Added lines** - `git show --format= --unified=0 <commit>`, added lines of 20 or more
   non-space characters, counted present when the identical line occurs in main's version
   of the same path. This is the line-level check that catches a file whose shell landed
   but whose substance did not.

| Ref | Tip | Unique | Patch-distinct | Files | Byte-identical to main now | Landed earlier, edited since | Never in main |
| --- | --- | --- | --- | --- | --- | --- | --- |
| audit-everything | `34a0129e6` | 1 | 0 | 7 | 4 | 3 | 0 |
| civicscope-complete-audit-20261019 | `748ce9ed2` | 1 | 0 | 52 | 38 | 14 | 0 |
| complete-remaining | `42499bce7` | 2 | 2 | 12 | 1 | 11 | 0 |
| fix-text-and-prompt | `5fad632a2` | 1 | 0 | 14 | 6 | 8 | 0 |
| honest-labels | `0477fee1b` | 3 | 3 | 18 | 8 | 10 | 0 |
| saved-ordering-fix | `add112cba` | 1 | 0 | 2 | 2 | 0 | 0 |
| similarity-distance | `6e5f502c8` | 2 | 2 | 4 | 2 | 2 | 0 |
| similarity-search | `8bd451937` | 2 | 2 | 6 | 0 | 6 | 0 |
| **Total** | | **13** | **9** | **115** | **61** | **54** | **0** |

No file at any of the eight tips is absent from main's history. Every one of the 115
changed files either is main's current blob or was main's blob at an earlier commit, so
"the branch's content never landed" is false for all eight branches, including the two
whose every file has since been rewritten.

The thirteen commits, in ref order, with the line-level reading:

| Commit | Ref | Patch-id | Files at paths in main | Added lines present | Subject |
| --- | --- | --- | --- | --- | --- |
| `34a0129e619d` | audit-everything | equivalent to `070283f` (#27) | 7/7 | 247/251 | Audit every figure end to end |
| `748ce9ed2155` | complete-audit-20261019 | equivalent to `b0f3577` (#29) | 52/52 | 3051/3079 | Expand data coverage and verification |
| `42499bce7221` | complete-remaining | distinct | 1/1 | 7/7 | Skip the warm-cache contract without a Census key |
| `9d956bd175a0` | complete-remaining | distinct | 11/11 | 531/567 | Every figure documented from the registry |
| `5fad632a249b` | fix-text-and-prompt | equivalent to `ea7a11d` (#21) | 14/14 | 253/259 | Repair the mojibake I shipped |
| `0477fee1b2cc` | honest-labels | distinct | 2/2 | 15/15 | Scope the no-fabricated-dollars checks |
| `3a9f7e683e06` | honest-labels | distinct | 2/2 | 21/22 | Await both seeded transactions |
| `b851721d827e` | honest-labels | distinct | 16/16 | 226/238 | Four figures were not what their labels claimed |
| `add112cba711` | saved-ordering-fix | equivalent to `2f3e384` (#25) | 2/2 | 20/20 | Keep save order for same-millisecond saves |
| `6e5f502c8374` | similarity-distance | distinct | 1/1 | 10/10 | Teach the margin audit the two margin-only encodings |
| `2875dd7a278b` | similarity-distance | distinct | 3/3 | 192/196 | Similar-ZIP distance was broken twice |
| `8bd451937983` | similarity-search | distinct | 1/1 | 11/11 | Make the default test suite actually hermetic |
| `bd6e55f88def` | similarity-search | distinct | 5/5 | 284/398 | Similar-ZIP search: off by default, reader-weighted |

The four patch-equivalent commits are the four single-commit PRs that were squash-merged
(#27, #29, #21, #25): same patch, new commit, so the id matches and the message carries
the PR number. That is the mechanism #64 row 16 described, confirmed per commit rather
than inferred from a total.

The nine patch-distinct commits are not unlanded work. They were cherry-picked or
rebased into main, which changes the parent and therefore the patch id while leaving the
content identical. The content columns above are what settles it:

- `9d956bd`'s two ACS variables did land and were then *corrected*: main's `acs.ts` ships
  `noInternetAccess: 'B28002_013E'` and an explicit note that the earlier `B28002_003`
  figure was a much smaller category under a larger label, and it replaced
  `meanCommuteMinutes: 'B08303_001'` - a headcount under a minutes label - with the
  published count and a note that the publisher has no mean-commute figure at all.
- `bd6e55f`'s similarity search is in main in full: `src/core/similarity.ts` there
  exports the same nine symbols as the branch tip, and the panel is mounted from
  `App.tsx`. The file differs from the tip by 16 lines of doc wording plus swapping a
  local `formatFigure` helper for the House layer's `ExplainAction` wiring; the panel
  differs by 72 lines, the same later wiring. Both are supersession, not absence.
- `b851721`'s `MetricUnit` gains `'institutions'` and its gate regex are both in main's
`src/core/types.ts:50` and `tools/completion-gate.mjs`.
- The remaining "missing" lines are comments and planning prose: `docs/canon-work-mission.md`
status rows rewritten after the fact, and comment text on `src/core/plugins/schools.ts`
that main later replaced with a differently worded account of the same defect.

Line-level total across all thirteen commits: **4,868 of 5,073** added lines (96.0%) are
present verbatim in main, and every file they touch exists in main. The 205 absent lines
are the rewrites catalogued above; none of them is a symbol, export, route or test that
main lacks.

**The verdict this table supports.** All eight refs are safe to delete as far as content
is concerned: nothing on them is missing from main. What the table cannot decide is
whether the owner wants to keep the *record* - the commit messages and the branch
history - and that is the authorisation act, not a measurement.

**The count nit, for whatever closes the issue.** A patch-id mismatch is not evidence of
unlanded work: a rebase changes every patch id in the branch, and a squash changes the
commit but not the patch. A patch-id *match* is strong evidence of a duplicate. Neither
number decides deletion; the blob-in-history column does, because it asks whether main
has ever contained the byte-exact file.

**What is missing.**

1. The owner's authorisation for a destructive act on eight refs.
2. Nothing else. The table above is #31 step 3, the method is stated so it can be re-run
   while the refs still exist, and the squash-leftover nit is written out for the close.

**What this pack does not do.** It does not delete, and it does not decide that the nine
patch-distinct commits are safe to drop. That is exactly the judgement the owner act
makes.

---

## #63: the privacy text is verified; the signature and the deployment are not

**What the act needs.** Two things, and they are different sizes.

1. The owner signs `docs/privacy.md` as the final privacy text (a signature, no code).
2. The deployed-config half of `docs/privacy-verification-checklist.md` runs against a
   production deployment of the Muse layer. That half cannot be completed from a lane
   that never deploys.

**What exists, on `lane/submission` at `30a29317`.**

| Artefact | Path | State |
| --- | --- | --- |
| Final privacy text, candidate | `docs/privacy.md` | present, verified against shipped config, unsigned |
| Line-by-line checklist | `docs/privacy-verification-checklist.md` | present; 15 claim rows as recorded in #63, two of them recorded as FAIL or UNREACHABLE rather than smoothed |
| README Muse-layer section | `README.md` | present |
| Generated methodology AI section | `src/ui/ai/MethodAiSection.tsx`, mounted in `Methodology.tsx` | present, reads METRIC_KEYS, the mode union, the validator failure union, the disclosure constant and the model id |
| Build story | `docs/muse-layer-build-story.md` | present, D3/D6 rows corrected to the built state |
| Personal-key surface | `ByoSettings` mounted under the Ask panel | present (this closed the "UNREACHABLE" claim's cause) |

The seven mechanically falsifiable checklist rows were re-run against the tree on
2026-11-17 and all seven held: no tracked `wrangler.toml` or `wrangler.jsonc`, no
Durable Object, D1, R2 or KV use, no `console.*` in `functions/` or `src/server/`, the
cap constant `JUDGING_CAP_MICRO_USD = 52_500_000`, `meterPersistence: 'isolate'`, the
`civicscope.metaKey.v1` storage key, and a `connect-src` that includes `api.meta.ai`
with no `unsafe-*` in `script-src`.

Re-run against the lane head `30a29317ba329333bae9a7d45dd3c6ab9c60de52` on 2026-11-24,
read from the commit tree (`git ls-tree` / `git grep <rev>`) rather than a working
copy, and all seven hold:

| # | Row | Observed at `30a29317` | Status |
| --- | --- | --- | --- |
| 1 | No tracked Wrangler config | `git ls-tree -r` matches nothing for `wrangler.toml` / `wrangler.jsonc` | PASS |
| 2 | No Durable Object, D1, R2 or KV use | binding-type names searched over `functions/`, `src/server/`, `src/core/ai/`: no match | PASS |
| 3 | No request logging | `console.*` searched over `functions/`, `src/server/`: no match | PASS |
| 4 | Budget cap | `src/core/ai/meter.ts:131`: `export const JUDGING_CAP_MICRO_USD = 52_500_000`, applied at `:135` | PASS |
| 5 | Meter persistence | `functions/api/muse/diagnostics.ts:68`: `meterPersistence: 'isolate'` | PASS |
| 6 | Personal-key storage key | `src/core/ai/meta-key.ts:11`: `META_KEY_STORAGE_KEY = 'civicscope.metaKey.v1'` | PASS |
| 7 | CSP | `public/_headers`: `script-src 'self'` (no `unsafe-inline`, no `unsafe-eval`), `connect-src` ends with `https://api.meta.ai` among the ten origins. `'unsafe-inline'` appears only under `style-src` | PASS |

The two greps, verbatim, so the rows can be re-run as written:

    git grep -nE 'DurableObject|D1Database|R2Bucket|KVNamespace|durable_objects|d1_databases|kv_namespaces|r2_buckets' <rev> -- functions src/server src/core/ai
    git grep -nE 'console\.(log|error|warn|info|debug)' <rev> -- functions src/server

Row 7's one nuance: `style-src 'self' 'unsafe-inline'` is present and `script-src` is not
relaxed, which is what the text claims; a reading that greps the whole policy for
`unsafe-` would wrongly fail it.

The other eight checklist rows are not mechanical in this sense - they are claims about
behaviour, wording and the served deployment - and they keep the states recorded above.

**What is missing.**

1. The signature. Nothing in the tree can supply it.
2. A production deployment to verify the deployed config against. On `main` today the
   server routes are `explain.ts`, `intent.ts`, `shared.ts`, `transcribe.ts`; on the
   lane they are `briefing.ts`, `diagnostics.ts`, `explain.ts`, `intent.ts`,
   `transcribe.ts`. The checklist cannot honestly certify a config that is not deployed,
   and it cannot certify which inventory is deployed until one is.
3. The two recorded mismatches (claim 1, the meter's persistence; claim 8, the
   visitor-supplied key path) are product decisions that the text now describes
   honestly. If a deployment changes either, the checklist has to be re-read, not
   re-signed.

---

## #59: F5a is built; the human clean-account run is the whole remainder

**What the act needs.** One human, not the author, on a clean account and a clean
browser profile, completing setup for both keys, with the run recorded in
`docs/agent-onboarding/run-record.md`. Section 6.2.5's bar is that an independent run
is recorded; a workflow only its author has run is a demo, not a feature.

**What exists, on `lane/submission` at `30a29317`.**

| Artefact | Path | State |
| --- | --- | --- |
| Workflow graph, both keys | `docs/agent-onboarding/workflow.v1.json` | version 1.0.0; per-step checkpoints, named human-approval points, failure branches, abort policy (halt before any key entry, report presence only, hand off to the manual step) |
| In-app handoff | `src/ui/ai/agent-handoff.tsx`, mounted in `src/ui/App.tsx` | present; no key field and no "the agent says it worked" input; confirms only from `civicscope:census-key` and `civicscope:meta-key-changed` |
| Abort test | `tests/ai/agent-onboarding.test.tsx` | present, 14 cases, executed against the run interpreter |
| Non-author checklist | `docs/agent-onboarding/checklist.md` | present, written so a non-author can follow it |
| Agent cold-run record | `docs/agent-onboarding/run-record.md` | present; one row, 2026-10-31, implementation-level, 62 of 62 checks, dummy keys, no live accounts, explicitly "does NOT discharge section 6.2.5" |

**What is missing.**

1. The human run itself, and its row in `run-record.md`.
2. The status constant. `AGENT_ONBOARDING_RUN_STATUS` in
   `src/core/ai/agent-workflow.ts` still reads PENDING, and the run record names that
   as finding 8 rather than hiding it. Flipping it is correct only after a human run;
   flipping it before would be the exact overclaim the gate is meant to catch.
3. Any live third-party console step (creating a Meta key, signing up for Census) was
   not executed by the agent runner and cannot be, by the workflow's own abort policy.

**Sequencing note.** The workflow's manual fallback for the Meta key points at the
"Use your own Meta key instead" disclosure in the Ask panel, which exists on the lane.
A handoff screen tested against a build without that surface would pass a check and fail
a user, so the human run should be made against the merged head, not against a
lane-local preview.

---

## Cross-cutting: none of the three acts needs a deploy to be prepared

#31 needs an authorisation, #63 needs a signature plus a deployment, #59 needs a person
and a browser. All three packs are complete as preparation; each is one named act away
from done. Nothing here was executed.
