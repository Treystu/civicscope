# Lane state, 2026-11-22: verification and prep lane

Status record in the LANE PROTOCOL shape (AGENTS.md, section "LANE PROTOCOL", item 4),
so this lane resumes from GitHub alone.

Branch: `freebuff/efba53c4941d50ab6d8f229e`. Base read at: `main`
`0b59f724a8830a05f385f9cd8c1789ac0a2417d9`.

## DONE

- `1b5068d` files the four acts as documents under `docs/standup/`:
  - `2026-11-22-census.md`: six open issues (31, 59, 63, 64, 67, 79) and two open PRs
    (66, 32), re-derived twice (rendered pages, then the REST API once its rate limit
    reset), with heads, bases, divergence, size and mergeable state.
  - `2026-11-22-completion-gate-readings.md`: the instrument identity at main versus the
    lane, clause_7 as written measured against main's tree (unmet, fifth sub-property),
    and every stage reading obtained here: build PASS, unit tests PASS, live contracts
    stalled on a named host, WCAG stage not runnable, semantic layer not run.
  - `2026-11-22-pr66-landing-pack.md`: divergence, the #78 and #80 cure commits and their
    content, nine ordered landing steps with the exact head each needs, and the
    precondition table with current state.
  - `2026-11-22-deploy-blocked-prep.md`: prep packs for #31, #63, #59.
- `f0692f6` records why the gate's deterministic total is missing at main (a stalled
  third-party connection, not an unrun check).
- Merge test of `30a29317` onto `0b59f724`: clean, exit 0, no conflicting paths, 180
  files, README and `.circleci/config.yml` both preserved. Nothing committed or pushed
  by that test; the detachment worktree was removed.
- Patch-id recount of the eight `archive/20261021/*` refs at main: 9 of 13 unique
  commits have no equivalent, which matches #64's corrected row 16 and does not
  reproduce #31's 2026-11-07 "zero" reading.
- 2026-11-24, `docs/standup/2026-11-22-deploy-blocked-prep.md` revised with the two
  things that pack was missing:
  - The #31 per-branch verdict table: all thirteen commits with both counts (13 unique,
    9 patch-distinct), tip content per file (115 files: 61 byte-identical to main now,
    54 present earlier in main's history, 0 never present), and a line-level sample
    (4,868 of 5,073 added lines present, 96.0%). Verdict: nothing on the eight refs is
    missing from main; the deletion is an authorisation act, not a content question.
  - The seven mechanical privacy-checklist rows re-run against lane head `30a29317`
    from the commit tree; all seven hold, with the `style-src 'unsafe-inline'` nuance
    recorded so a whole-policy grep does not wrongly fail row 7.
- Method scripts for the table live in the untracked `.lane/` workspace
  (`verdict.mjs`, `branch-content.mjs`, `superseded.mjs`); the doc states the method in
  prose so it can be re-run without them.
- 2026-11-24, second correction to the same pack: the `bd6e55f` similarity bullet claimed
  "the same nine symbols". Read from the trees, `src/core/similarity.ts` exports **13**
  symbols at main `0b59f724` and at `2875dd7`, and **10** at `bd6e55f` - whose ten are all
  in main's thirteen (main's extra three, `MetricRange`/`computeRanges`/`comparisonDims`,
  came in with `f91e529`, #28). The "16-line file diff" belongs to `2875dd7`; against
  `bd6e55f` the file differs by 170 lines and `src/ui/SimilarityPanel.tsx` by 93. Bullet
  rewritten with the per-rev readings and the wrong figures named as corrected.

## WIP

Nothing in flight. The gate run started for this lane was stopped after the live stage
stalled; its log is workspace-local (`.lane/`) and is deliberately not committed.

## NEXT

1. Read the CircleCI rail on the merged head once the checkpoint lifts (steps 4 and 5 of
   the landing pack).
2. Apply the clause_7 restatement at `tools/completion-gate.mjs:1189` under #79 Option B,
   then re-measure. Both wait for the lift; neither is done here.
3. Owner acts: #63 signature, #59 human run, #64 Explain split, #31 ref deletion (its
   step 3 table is now filed; only the authorisation is outstanding).

### Highest-value unstarted follow-ups (listed, not started)

1. **Bound the live-contract stage so the gate can report a total.** The deterministic
   layer's total is the one reading main has never produced here, and it is missing
   because one third-party host stalls a test for its full 300 s bound. Shorter bound or
   an env flag around the live host calls, then one run. Highest value: every #79 number
   quoted downstream depends on it.
2. **Write the #59 non-author run protocol.** The artefact and in-app handoff exist; what
   does not is the script a clean-account human executes plus the capture template for
   `docs/agent-onboarding/run-record.md`. The owner act cannot start without it.
3. **Turn #63's deployed-config half into a command sequence.** Four checks need a serving
   build; each is one `curl -I` or one header read. Writing them now makes the post-lift
   verification mechanical instead of remembered.
4. **Measure the #64 Explain claimed-vs-stretch split.** The owner-reserved decision is a
   split of claims; a table of claimed versus stretch with file and line turns it into a
   yes/no instead of a review.
5. **File #67's program state.** The champion-audit tracker has no state document beyond
   one census row; its component items (#71-#77) and their cure commits are all
   identifiable from the lane history.
6. **A CI job spec for the WCAG stage.** The stage cannot run in this workspace (no
   `libnspr4`, no root); a job definition that runs where a browser exists is the only
   way this lane ever gets that reading.

## BLOCKERS

| Blocker | Affects | State |
| --- | --- | --- |
| Owner checkpoint | every merge, deploy, instrument edit | HELD |
| `TYPESAFE_API_KEY` absent | any semantic gate reading anywhere in this workspace | absent, and no key is requested |
| No browser runtime (missing `libnspr4`, no root) | the WCAG 2.2 AA stage | not installable here |
| Idle third-party host (NY-schools live test) | the live-contract stage | stalls to the suite's own 300 s timeout |

## DIRECTIVES

No new comment from the owner or oversight was found after `2026-11-22T06:33:45Z`, the
timestamp of the #79 retarget entry. The open issue set is unchanged at six, and the open
PR set unchanged at two. The standing hold is the only directive in force.

## What this lane did not do

No merge, no deploy, no push to or modification of PR #66 or PR #32, no submission act,
no issue comment or close, no edit to `tools/completion-gate.mjs` or the threshold, no
deletion of any archive ref, and no new branch or worktree beyond the removed merge-check
detachment.
