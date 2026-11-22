# Deploy-blocked prep packs: #31, #63, #59

Written 2026-11-22. Prep only. No ref was deleted, nothing was deployed, no submission
act was performed, and no issue was commented on, closed or relabelled. Each pack states
what the act needs, what exists, and what is missing, so the act is one step when the
checkpoint lifts.

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

**What is missing.**

1. The owner's authorisation for a destructive act on eight refs.
2. A per-branch verdict table posted before any deletion, with all thirteen short SHAs
   and the method, so a reviewer can re-check it while the refs still exist. This is
   #31's own step 3 and it has not been satisfied in one table yet: the counts live in
   two different issues.
3. The nit that a squash-merge leftover cannot be distinguished from real work by count
   alone, stated in whatever closes the issue.

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
