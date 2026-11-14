# Agent onboarding — run record (F5a)

This file is the record artefact for the agent-onboarding workflow
(`workflow.v1.json`, plan §6.2.5 / §6.5.4). The executable form of the run, written
for someone who has not read this file, is `docs/agent-onboarding/checklist.md`.
 A feature claim for agent
onboarding exists only when a completed independent run is recorded
here. Nothing in this file may be filled in by the workflow's author.

## Workflow under test

| Field | Value |
|---|---|
| Workflow artefact | `docs/agent-onboarding/workflow.v1.json` |
| Workflow version | 1.0.0 |
| In-app entry point | "Set up with your agent" (`src/ui/ai/agent-handoff.tsx`) |
| Paths covered | Census API key; personal Meta Model API key |
| Success proof | The app's own re-validation events only: `civicscope:census-key`, `civicscope:meta-key-changed` |
| Graph self-check | `tests/ai/agent-onboarding.test.tsx` (runs in `npm run verify`) |

## Independent run

## ONE INDEPENDENT AGENT COLD-RUN RECORDED (2026-10-31) — §6.2.5 CLEAN-ACCOUNT RUN STILL OUTSTANDING

An independent agent cold-run (non-author, implementation level,
dummy keys only) was performed on 2026-10-31 and is recorded below.
It verifies the workflow's executable semantics against the shipped
implementation. It is **not** the clean-account run §6.2.5 requires:
no fresh user, no real Census or Meta account, and no live key
delivery were involved. The §6.2.5 run has therefore still **not**
happened, agent onboarding remains **not done** under §6.2.5, and
the in-app handoff page continues to say exactly that (run status:
PENDING — the status constant was not flipped by this runner; see
finding 8 in the run detail).

### How the cold run is performed (instructions for the non-author runner)

1. Use a clean account and a clean browser profile: no Census key, no
   Meta key, nothing in localStorage for the CivicScope origin.
2. Open the app's "Set up with your agent" entry point and follow
   **only** `workflow.v1.json` — no source code, no asking the author.
3. Run the Census path end to end. Run the Meta path too if a Meta
   account is available; if it is not, record that as a deviation
   rather than skipping silently.
4. At each named human-approval point, stop and obtain the fresh
   user's explicit approval before continuing, as the workflow says.
5. Confirm success the way the workflow defines it: by the app's own
   re-validation event for each key, visible in the app — never by
   the key itself, which must not appear in this record, in chat, or
   in any log.
6. Note every place the artefact was ambiguous, wrong, or silent —
   including any unexpected screen and whether the abort handoff
   landed at the equivalent manual step. Deviations are findings,
   not failures of the runner.
7. Append one row to the record table and fill the result fields.

### Record table (append-only)

| Date | Runner (non-author) | Fresh user | Workflow version | Census path | Meta path | Deviations / abort observations | Result |
|---|---|---|---|---|---|---|---|
| 2026-10-31 | Independent agent cold-run (non-author) | None — dummy keys against the implementation; no fresh user | 1.0.0 | Completed at implementation level; live third-party steps not executed (see run detail) | Completed at implementation level; live console steps not executed (see run detail) | Findings 1–8 in the run detail below; abort path verified at census-place-key, census-open-signup, and meta-create-key, each handing off at the equivalent manual step | complete-with-deviations — does NOT discharge §6.2.5; a human clean-account run is still required |

Result values: `complete` (both attempted paths finished, success
confirmed by the app events), `complete-with-deviations` (finished,
with findings recorded), `aborted` (a halt occurred — record where
and whether the manual handoff matched the equivalent step), or
`failed` (setup could not be completed from the artefact alone —
record why; that is a defect in the artefact, and the workflow
version must be bumped when it is fixed).

### Run detail — 2026-10-31 independent agent cold-run

Runner: an independent agent (non-author), following only
`workflow.v1.json` for the workflow logic. Constraints: dummy keys
only, no live network calls, no real accounts. Method: the artefact
was read cold first; then every step was executed against the shipped
implementation — the run interpreter (`src/core/ai/agent-workflow.ts`)
was driven step by step (checkpoints, approval gates, app events,
failure branches, abort), the app's key modules
(`src/core/censusKey.ts`, `src/core/ai/meta-key.ts`) were exercised
with a dummy 40-hex Census token and a dummy Meta key under stubbed
browser globals, and the in-app handoff surface
(`src/ui/ai/agent-handoff.tsx`, mounted in `src/ui/App.tsx`) was
inspected against each open-handoff checkpoint.

Artefact under test: workflow version 1.0.0 at branch HEAD
`d0a6a41478bcd64e3d1e59462ec5383fb047ea90` (workflow.v1.json itself
last changed in `89b82bbd123aa4fc37aa31a84ef0861689078a8c`).

Evidence: 62 of 62 independent driver checks passed (graph
validation; both full path walks; approval gating; wait/resume;
rejection stop with verbatim text; validation-rejected aborts on
both paths; the abort test below; key-module storage, event, and
validation-verdict behaviour). Supporting evidence: the author's
graph self-check and onboarding tests pass under the repo's runner
(`tests/ai/agent-onboarding.test.tsx`, 14 of 14).

Per-step results:

| Step | How executed | Result |
|---|---|---|
| census-open-handoff | Interpreter + handoff surface inspection | Behaves as specified; see finding 6 (origin wording) |
| census-open-signup | Interpreter transition + approval gate; the live Census signup page was NOT opened (no network/accounts) | Transition and `before-form-submission` gate verified; live form fields unverified |
| census-submit-signup | Interpreter; rejection branch executed with sample text | Behaves as specified (stopped, verbatim text in the stop report); live confirmation page unverified |
| census-read-delivery-email | Wait branch + resume executed; no mailbox was opened | Wait/resume behave as specified; the delivery-email checkpoint itself could not be executed — see finding 1 |
| census-place-key | Dummy token driven through extraction, storage (`civicscope.censusKey.v1`), event dispatch, and event-gated completion | Behaves as specified at implementation level; the app's live Census validation request was not exercised (no network). Checkpoint-only and wrong-event completion were both refused, as specified |
| census-complete | Reached via the app event | Complete; key state presence-only throughout |
| meta-open-handoff | Interpreter + handoff surface inspection | Behaves as specified; see finding 6 |
| meta-open-console | Interpreter transition + approval gate; the live signed-in console was NOT opened | Gate verified; live console unverified |
| meta-create-key | Interpreter; abort at this step executed | Behaves as specified; the key-creation click itself is the user's and was not performed |
| meta-place-key | Dummy key driven through normalize/store/event and event-gated completion; `validateMetaKey` verdicts (valid / rejected / body-invalid / network / malformed) verified with hermetic fetchers | Behaves as specified at implementation level; live Meta probe not exercised |
| meta-complete | Reached via the app event | Complete |

Abort test (the §6.2.5 / issue #59 acceptance behaviour), executed
against the implementation, not just the document: a run driven to
`census-place-key` met a simulated unexpected screen and halted
**before** any key entry — `census-place-key` is not in the completed
steps, key presence was reported as `{censusPresent: false,
metaPresent: false}`, the serialized run state contains no 40-hex
token and no key-material field, and the handoff named the equivalent
manual step `manual:census-paste-key`. Aborts were also executed at
`census-open-signup` (from the awaiting-approval state; handoff
`manual:census-signup`) and at `meta-create-key` (handoff
`manual:meta-create-key`). In every case the manual handoff matched
the equivalent step.

Findings (places the artefact forced the runner to infer what it
does not state):

1. **The expected sender/subject pattern is never given.** The
   `census-read-delivery-email` checkpoint requires the message to
   match "the expected sender/subject pattern", and
   `abortPolicy.emailSearch` repeats the phrase, but no sender or
   subject appears anywhere in the artefact (plan §6.5.4 has the
   same gap). A non-author runner cannot perform this checkpoint
   from the artefact alone; the pattern must be guessed. This is
   the one checkpoint that is not executable as written, and the
   artefact should be amended (a version bump) to name the pattern.
2. **The goto targets are undefined.** `abort-to-manual`,
   `report-and-stop`, and `wait` are used by every failure branch
   but are defined nowhere in the artefact — no node states what
   each does. Their behaviour had to be inferred from
   `abortPolicy.unexpectedScreen` and the branch notes. The
   interpreter implements them consistently with that inference,
   but the artefact does not stand alone on this point.
3. **No handoff link.** Step 1 of each path says "Open the
   CivicScope agent-handoff link", but the artefact contains no URL
   or route. The entry point exists (the in-app "Set up with your
   agent" section) and is named in this record and the README, but
   a runner holding only `workflow.v1.json` must infer where it is.
4. **The wait state is unspecified.** The not-arrived branch gives
   no re-check interval, maximum wait, or escalation; "check again
   later" (the branch note) is the entire specification.
5. **Approval mechanics are unspecified.** Approval points are
   named, but the artefact does not state how the human's approval
   is obtained or recorded. Inferred: ask the user and wait for an
   explicit yes; the interpreter models this as a grant action.
6. **Origin wording.** Both open-handoff checkpoints expect the
   handoff page to state "the target origin". The shipped handoff
   section names both keys and both success events and says
   "confirmed by CivicScope in this browser", but states no origin.
   The artefact's own `keys` section does state "localStorage on
   the CivicScope origin only", so the information exists in the
   artefact — just not on the surface the checkpoint describes.
7. **Console navigation.** `meta-open-console` expects "API key
   management reachable" but gives no path inside dev.meta.ai; a
   cold runner must find key management unaided. (External surface;
   recorded for completeness.)
8. **Status constant not flipped.** `AGENT_ONBOARDING_RUN_STATUS`
   in `src/core/ai/agent-workflow.ts` still reads PENDING. This
   runner did not flip it: the run below does not discharge
   §6.2.5, and editing source was outside this runner's scope
   (this file only).

Verdicts:

- **Workflow execution (implementation level): PASS.** Every step,
  approval gate, failure branch, and the abort path behaved exactly
  as the artefact specifies, on the evidence above. Finding 1 is a
  defect in the artefact's text (an unperformable checkpoint), not
  in the implementation's behaviour.
- **§6.2.5 independent clean-account run: NOT discharged by this
  run.** The plan's bar is that "a non-author completes setup for
  a fresh user following only the artefact", with the run,
  version, and result recorded. This runner is a non-author and
  followed only the artefact for the workflow logic, but setup was
  completed against the implementation with dummy keys — not for a
  fresh user, not on clean real accounts, with no real key-delivery
  email and no live validation. An agent run could only meet the
  bar if it executed the workflow end to end in a real browser
  with fresh real accounts; this run did not, and does not claim
  to. **A human clean-account run is still required**, and agent
  onboarding remains not done under §6.2.5 until one is recorded
  here.

## Amendments — workflow v1.0.1 (2026-11-14)

The 2026-10-31 cold run's findings were about the artefact, not the
implementation, so the artefact was amended rather than the finding
waved away. Version 1.0.1 is the version a clean-account runner should
follow; 1.0.0 stays described above because that run was performed
against it.

| Finding | State in 1.0.1 |
|---|---|
| 1. The delivery-email sender/subject pattern is never given | **Closed by removing the unverifiable claim.** The checkpoint and `abortPolicy.emailSearch` now name the discriminator that is actually checkable: a message whose body carries a 40-character hexadecimal token. No sender or subject is asserted, because this repository records no verified one - asserting a plausible address would have been an invention, and the token shape is what the app itself requires. |
| 2. The goto targets are undefined | **Closed.** A `gotos` block states what `abort-to-manual`, `report-and-stop` and `wait` each do, matching the interpreter's behaviour. |
| 3. No handoff link | **Closed.** A `handoff` block names the entry point and its URL pattern, and the section now carries `id="agent-handoff"`, so the anchor the artefact names is real rather than described. |
| 4. The wait state is unspecified | **Closed by stating what is true, not by inventing a timer.** There is no timer and no polling: the agent re-checks when the user says to. Specifying an interval or a maximum wait would have described behaviour that does not exist. |
| 5. Approval mechanics are unspecified | **Closed.** `approvalMechanics` states that only an explicit yes at that step is an approval, and that silence or an earlier yes is not. |
| 6. Origin wording | **Closed on both sides.** The handoff surface now states that a key is stored only in this browser's localStorage on this origin with no CivicScope server for user keys, which is what the checkpoint expects to find. |
| 7. Console navigation | **Open, external.** The path inside dev.meta.ai is not something this repository can verify, so it stays a runner observation rather than a claim here. |

What the amendments do not change: the §6.2.5 run is still **outstanding**.
An independent clean-account run by a human non-author, with a real
mailbox for the Census key and a real Meta account if one is available,
following v1.0.1 alone, is the bar. Until its row is appended here and
`AGENT_ONBOARDING_RUN_STATUS` is flipped by whoever verifies it, the
in-app handoff continues to say PENDING.
