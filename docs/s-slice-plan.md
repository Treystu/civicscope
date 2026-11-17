# S-slice plan: gate order for S4, S5 and S6

Date: 2026-11-11. Input: oversight's settlement on tracker #67, comment
`c.6784734241` (2026-11-10). This document is the enforceable ordering record for
the post-submission slices; `docs/hackathon-integration-plan.md` section 7 carries
the same gates beside the inventory, and this file is the one a slice brief must
cite before work starts.

## The order, and why it binds

Integration proceeds **inventory and plan first**, with an oversight conformance
read before any slice. No key migrates. Production stays untouched until slices
land on `main`. The three gates were previously recorded only in off-repo notes;
they are restated here so the path to complete is readable from the repository
alone, which is the whole reason this document exists.

| Gate | Question it settles | Effect |
| --- | --- | --- |
| **D1** | Key architecture: proxy, BYO-only, or hybrid | blocks S4 and S6 until ruled |
| **D5** | What a user's query may reveal to Meta, and whether aggregate operator counters stand | blocks S4 and S6 until ruled |
| **A4** | Whether durable-object metering is approved as a deployment-shape change | blocks S5 |

D1 and D5 are owner calls under the plan's own terms (`docs/full-muse-layer-plan.md`
section 9). A4 is the owner's approval of a deployment-shape change and is open in
that plan's section 5. **A slice is not started, scoped, sequenced, or partially
prepared until its gate is ruled.** Absence of a ruling is stated, never filled
with a lane guess.

## Slice acceptance, in observable terms

Each acceptance is a check someone other than the author can run, and each fails
if the work is absent. "Exists" means a path in the tree; "passes" means the named
suite at the head being reviewed.

### S4 - waits on D1 and D5

Contents: I7 plus the I10 modules it needs.

Acceptance, all required:

1. `src/core/ai/jev-loop.ts` and `src/core/ai/jev-judgments.ts` exist, and their
   suites pass with at least one negative case each (a judgment that must be
   refused, not merely one that must be accepted).
2. `src/server/jev-client.ts` and `functions/api/muse/jev.ts` exist, and the route
   refuses a foreign `Origin` with 403 in a test - the same property the other
   five routes pin in `tests/no-collection.test.ts`.
3. No storage binding is declared for the route, so the "counts only, no bodies"
   property survives the new surface.
4. `npm run verify` is green at the reviewed head, and the deterministic gate
   layer still reads its settled 101/101.

### S5 - waits on A4

Contents: I8.

Acceptance, all required:

1. `src/core/ai/meter-persistence.ts` and `functions/api/muse/meter-do.ts` exist,
   with a test that a cold start recovers totals written by a previous instance
   rather than resetting them.
2. The deployment-shape change A4 rules on is present and declared: a
   `wrangler.toml` or `wrangler.jsonc` naming the Durable Object binding, or a
   documented statement that the deployment provides it out of band.
3. `docs/privacy.md`'s metering paragraph is re-verified against the new
   persistence, because its current text says the counter is per isolate and that
   sentence becomes false the moment S5 lands.
4. `npm run verify` green at the reviewed head.

### S6 - waits on D1 and D5

Contents: I9 plus the remaining I10.

Acceptance, all required:

1. `src/core/ai/general.ts`, `src/core/ai/flexible.ts` and
   `src/core/ai/geography-gate.ts` exist, and the national placeless screen
   (`src/core/ai/national-screen.ts`, landed in S3) is **wired to a call site** -
   today it is a module nothing calls, and its own record says so.
2. A test exercises the placeless path end to end and asserts each of the three
   refusals the screen already implements (rank/recommend, protected-class
   characterisation, unpublished figure).
3. `npm run verify` green at the reviewed head.

## State, measured at `14bcac5`

Measured by file presence, not asserted:

| Slice | State | Files the inventory names, all absent |
| --- | --- | --- |
| S4 | **not started** | `src/core/ai/jev-loop.ts`, `src/core/ai/jev-judgments.ts`, `src/server/jev-client.ts`, `functions/api/muse/jev.ts` |
| S5 | **not started** | `src/core/ai/meter-persistence.ts`, `functions/api/muse/meter-do.ts` |
| S6 | **not started** | `src/core/ai/general.ts`, `src/core/ai/flexible.ts`, `src/core/ai/geography-gate.ts` |

S1, S2 and S3 are landed on this branch; S3's national placeless screen is a
module with no call site, which is why S6's acceptance names the wiring.

## What this document does not do

It does not start work, move a key, rule a gate, or touch production. It records
ordering so that a slice brief written before a ruling is recognisably
out of order, and so the reason is legible without asking anyone.

Gate record: Lucas Gate v2, planning track - PASS (single end-state, numbered
acceptance, no never-rule contradiction). Jev - the ordering was ruled by
oversight at `c.6784734241`; no lane reading is claimed for it.
