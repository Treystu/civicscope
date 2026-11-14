# Owner decisions — everything the lane cannot decide

Written 2026-11-14 against `lane/submission`. This file exists because six rulings
had been filed in six separate issue threads, and a decision that has to be
assembled from six threads is not a decision the owner can make in one pass. Each
row below states the question, the options, and what actually changes for each
option. Nothing here is a recommendation dressed as a fact; where the lane
recommends something, it says so and says why.

The lane cannot take any of these itself. Three of them are irreversible
(production deploy, archive deletion, hold lift), one is an edit to the frozen
instrument, and two are sign-offs on somebody else's work.

## The state these decisions sit on

The rail reading this sheet sits on is deliberately stated as a band, not a number:
`completion-gate` passes its deterministic layer 101/101 with all four stages at
every head the lane has produced, and fails only the frozen semantic criterion,
which has read between 78.1 and 79.8 across those heads and never once above 99.
Naming one head's figure here would make this line stale on the next push, so each
head's exact verdict lives in the ledger's STATUS under that SHA. The last stand-up
line (`verify` success, `live-contracts` success, deterministic 101/101) is the
shape every reading has had.

## 1. clause_7 wording — decides whether the gate can ever be green

Issue #79. Packet: `docs/clause-7-evidence-packet.md`.

The clause's requirement string is unqualified — "no advertising, analytics,
search logging, accounts or runtime backend" — while the product discloses, in the
same instrument, that one server-side surface exists: the `/api/muse` proxy, counts
only, isolate-local meter. A judge scoring the clause as written sees a shipped
runtime backend and scores it down. That is the 0.50-0.56 reading.

- **Option A, record-side.** Add deterministic checks for absence of advertising,
  analytics and accounts. The clause stays as written, so the gate stays red
  permanently, because `/api/muse/*` demonstrably exists. Honest, and permanently
  below threshold.
- **Option B, instrument-side.** Restate clause_7 to what is measurable: no
  advertising, analytics, search logging or accounts anywhere; no runtime backend
  on the housing data path, the only server-side surface being the disclosed
  `/api/muse` proxy that stores counts only. The two existing proofs then carry it
  and the score is re-measured on the rail.

The lane recommends B and has implemented neither: the instrument is frozen to
this lane. B is an instrument edit, which is the owner's alone. This ruling also
governs queue item 11 and PR #66's armed-merge condition.

## 2. Production deploy — decides whether half the checklist can be produced

Issue #56. Rows 10-13 of `docs/submission-readiness.md`.

The House layer is merged into `main` (`0b59f72`); production still serves without
it. The demo video and recorded fallback must be captured from the same production
commit, so neither can exist until a deploy happens - and this lane never deploys
production.

- **Option A, deploy.** Rows 10-13 become producible from one stated commit, and
  the deployed half of the privacy verification (#63) can be run against the live
  origin.
- **Option B, launch without them.** Those rows are marked not-applicable with
  your reason recorded, and the privacy checklist keeps its deployed half open and
  labelled as such.

## 3. Privacy sign-off — decides whether #63 can close

Issue #63. Text: `docs/privacy.md`. Verification: 15 claims in
`docs/privacy-verification-checklist.md`.

Every claim is verified against shipped config, including the 2026-11-14 FU1
correction (accounting-only meter, no per-client cap, pool shutoff and breaker
intact). What code cannot supply is a human saying "this is the final text", and
the deployed-config half depends on decision 2.

- **Option A, sign off.** #63 closes on the text, with the deployed half noted as
  waiting on decision 2.
- **Option B, request changes.** Say which line reads wrong; it is a text edit,
  not a code change.

## 4. Agent onboarding — decides whether #59 closes

Issue #59. Artefact: `docs/agent-onboarding/workflow.v1.json` v1.0.1. Record:
`docs/agent-onboarding/run-record.md`. Executable steps: `docs/agent-onboarding/checklist.md`
- written for a runner who has never read the campaign, with the measured expected
value on every line and step 0 labelled as this decision.

Everything an agent can do is done: versioned artefact with both key paths and
defined goto semantics, an in-app handoff that confirms setup only through the
app's own key events, 14 abort/handoff cases in the default suite, and a recorded
implementation-level non-author run whose six findings were amended. The one
remaining bar is a clean-account run by a human non-author, with a real mailbox
for the Census key.

- **Option A, a human runs it.** Follow seven documented steps, append one row to
  the record table. The lane flips the status constant only after that row exists.
  Agent onboarding then becomes a claimable feature.
- **Option B, descope L2.** The manifest records agent onboarding as descoped and
  submission claims adjust to match. Both are legitimate; only you can pick.

## 5. Archive refs — one word, and nothing depends on it

Issue #31. Eight refs under `archive/20261021/branch/*`.

Skimmed line by line: no ref holds content absent from `main`. `saved-ordering-fix`
adds nothing main lacks; the rest differ only in files deliberately rewritten in
`main`; the one ref where loss looked plausible turned out to be superseded
planning docs under newer dates and an e2e test that survives renamed.

- **Option A, delete all eight.** The archive goes; the history is already in
  `main`.
- **Option B, keep them.** They stay as inert history and #31 closes as a
  no-change close.

Deleting a remote ref is not something `git` undoes, which is why this waits for a
word rather than an inference.

## 6. PR #32 hold — nothing moves until you say so

PR #32 sits on owner HOLD at `d303e04`, last touched 2026-10-26. The lane has not
read it, reviewed it, or pushed to it. Lifting the hold is entirely yours; there is
no lane-side prep that would make it faster, and the lane has deliberately not
touched it to keep it reviewable as it stands.

## 7. Asthma on the country-wide screen — the only piece of item 6 still open

Item 6's lane half is closed: the asthma measure is bound in the shipping PLACES
plugin (drilldown, population-weighted, protected-class stamped, never sortable or
filterable) and the tenant-share key disagreement is cured. What remains is not a
defect but a design call.

Asthma today appears only in a ZIP's drilldown. Putting it on the country-wide
screening screen would mean:

- it becomes a visible column on the primary surface, where every other column is
a housing measure;
- the screen's request contract changes - the screen is pinned to 20 variables and
the chunk plan that follows from it, and a PLACES measure is a different source
with a different cadence (a 2023-vintage model, not the Census vintage beside it);
- a health prevalence sits next to rent and income as if it were comparable, which
is the shape of claim the fair-housing notice exists to prevent.

- **Option A, keep it in the drilldown.** Nothing changes; the figure remains
available on demand with its interval and its notice.
- **Option B, add it to the screen.** The lane implements it, measures the new
request contract, and states the vintage mismatch beside the column.

The lane does not recommend B, because the comparability risk is real and the
benefit is a column nobody has asked for. It also cannot take B unasked: it changes
the screen's contract, which is the one surface the gate's request-size check
guards.

## What does not need a decision

Items 1, 3, 4 and 5 of the queue are closed on the rail with their artefacts at
the head: the CI config is on `main` as a real CircleCI config, the house port is
merged with the data layer untouched, and the flexible-completion and honest-meter
work is landed and verified. Nothing in this sheet reopens them.
