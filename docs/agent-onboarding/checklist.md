# Agent onboarding run — checklist for a non-author

This is the executable form of `docs/agent-onboarding/run-record.md` section 6.2.5.
You do not need to have read the campaign record, the plan, or the source. Follow
the steps in order, compare what you see against the expected output on each line,
and append one row at the end.

What the run produces: one row in the record table, which is the only thing that
turns agent onboarding from "built" into "claimed".

## Step 0 — the owner gate (the only decision in this document)

Somebody has to decide whether the run happens. Everything after this line is
mechanical.

| Option | What it means | What happens after |
| --- | --- | --- |
| A. Run it | You (a non-author) follow steps 1-6 with your own mailbox | The row is appended, the status constant is flipped by whoever verifies it, and agent onboarding becomes a claimable feature |
| B. Descope | L2 agent onboarding is recorded as descoped in `docs/contest-port-manifest.md` | The claims adjust; no run is needed and this document becomes unnecessary |

Nothing in steps 1-6 requires a further ruling. If you are reading this and are not
the owner, ask once which option applies and stop.

## Step 1 — prerequisites

- A browser profile with **no CivicScope state**: no Census key, no Meta key.
- A real mailbox you can receive at. The Census key is emailed to it.
- Optionally, a Meta account, if you want to attempt the second path.
- Do not use a key that belongs to somebody else. The spend is the account owner's.

Expected: nothing to run yet; this step is a checklist of things you have.

## Step 2 — preflight, five paste-able checks

Run these exactly. The expected values were measured on 2026-11-14; a different
value is a finding, not a failure of yours.

0. **Does the deployment even carry the surface this run tests?** This costs one
   command and saves you a mailbox signup that cannot succeed.

   ```
   curl -s https://submission.civicscope.pages.dev | grep -o '/assets/[^"]*\.js' | while read a; do curl -s "https://submission.civicscope.pages.dev$a" | grep -c "Set up with your agent"; done
   ```

   Expected: `1` (or more). `grep -c` exits with status 1 when its count is `0` - a
   non-zero exit here is the measurement, not a broken command, so read the printed
   number and ignore the status. **Measured 2026-11-14: `0` on every asset of the
   live deployment.** The handoff component exists on `lane/submission` only - it was
   added at `a5dd37e` and is absent from `main` and from `contest/house-port` -
   so the deployed portal predates it. If you get `0`, stop here and report it:
   the run needs a deployment built from a head that contains
   `src/ui/ai/agent-handoff.tsx`, which means #66 landing and a deploy, and
   neither is yours to do. Steps 1-6 are still worth reading for what the run will
   test; they cannot be executed against the current deployment.

1. The app answers:

   ```
   curl -s -o /dev/null -w "%{http_code}\n" https://submission.civicscope.pages.dev
   ```

   Expected: `200`. (Measured 2026-11-14: 200 in 0.61s. The pinned deployment
   `https://390579ff.civicscope.pages.dev` also answers 200, in 0.53s.)

2. Open `https://submission.civicscope.pages.dev/#agent-handoff` and look for the
   heading **Set up with your agent**. (Step 0 above is what makes this check
   meaningful: on the deployment measured 2026-11-14 the heading is not there at
   all, because the bundle predates the component.)

   Expected: the section is present, and one paragraph says a key is stored only in
   this browser's localStorage, on this origin, with no CivicScope server for user
   keys. If the section is missing, the deployment predates the handoff surface -
   record that as a deviation and stop, because the rest of the run tests that
   surface.

3. In the browser console, clear any prior state and reload:

   ```
   localStorage.removeItem('civicscope.censusKey.v1');
   localStorage.removeItem('civicscope.metaKey.v1');
   location.reload()
   ```

   Expected after reload, in the handoff section:
   - `Census API key: not set up yet. Success event: civicscope:census-key.`
   - `Personal Meta key (optional): not set up yet. Success event: civicscope:meta-key-changed.`

4. Attach listeners so the app's own events are visible:

   ```
   window.addEventListener('civicscope:census-key', () => console.log('CENSUS KEY EVENT FIRED'));
   window.addEventListener('civicscope:meta-key-changed', (e) => console.log('META KEY EVENT FIRED', e.detail));
   ```

   Expected: no output yet. The Census event carries no detail; the Meta event
   carries `{present: true|false}`.

## Step 3 — Census key path

1. From the handoff section, open the Census signup:
   `https://api.census.gov/data/key_signup.html`
   Expected: the signup form is visible.
2. Fill it with your own details and submit.
   Expected: the page says a key was emailed to you.
3. Find the message **whose body contains a 40-character hexadecimal token**. Do not
   choose it by sender or subject - the workflow deliberately names the token shape
   as the discriminator, because no sender is verified anywhere in this project. Do
   not open other messages looking for one.
   If no such message has arrived: this is the workflow's wait branch. Check again
   when you choose to; there is no timer and no polling, and you must not widen the
   search.
4. Paste the token into the app's Census key prompt.
   Expected, both of these and not one of them:
   - the console prints `CENSUS KEY EVENT FIRED`;
   - the handoff line changes to `Census API key: confirmed by CivicScope in this browser.`
   The first without the second, or the second without the first, is a FAIL - the
   whole design claim is that the app confirms, not the person or the agent.
5. Confirm what was stored:

   ```
   localStorage.getItem('civicscope.censusKey.v1').length
   ```

   Expected: `40`.

## Step 4 — Meta key path (optional)

1. Same handoff section. Open `https://dev.meta.ai` and sign in yourself.
   The path to API key management inside that console is not documented by this
   project and is an open finding; finding it is part of the run.
2. Create a new API key. The click is yours.
3. Paste it into the app's personal-key settings.
   Expected: the console prints `META KEY EVENT FIRED {present: true}`, and the
   handoff line changes to `Personal Meta key (optional): confirmed by CivicScope
   in this browser.`
4. `localStorage.getItem('civicscope.metaKey.v1').length` - expected: at least `16`.
   If you have no Meta account, record that as a deviation rather than skipping it
   silently.

## Step 5 — the abort behaviour

This is the step that separates a workflow from a demo, so do not skip it.

1. Start the Census path again in a fresh profile state and, at a moment when the
   workflow expects one screen, go somewhere it does not expect (for example, leave
   the signup page for any unrelated origin).
   Expected: the run stops before any key is typed. Nothing is submitted under your
   identity.
2. In the app, use **Continue manually instead**.
   Expected: the manual key prompt opens at the same point in the sequence.

Reading: PASS if no key was entered and the manual button lands on the same prompt;
FAIL if a key was typed, or the fallback opens somewhere earlier or later.

## Step 6 — record it

Append exactly one row to the table in `docs/agent-onboarding/run-record.md`:

```
| <date> | <your name or handle> | fresh profile, real mailbox | 1.0.1 | <complete / complete-with-deviations / aborted / failed> | <same> | <every ambiguity and abort you saw> | <result> |
```

Result values are defined in that file. Do not flip `AGENT_ONBOARDING_RUN_STATUS`
yourself - that is done by whoever verifies the row exists.

## Validation status of this checklist

Each step is either validated against the shipped build or marked as the one thing
this lane cannot validate.

| Step | Status |
| --- | --- |
| 0. Owner gate | **The only owner decision.** Nothing below needs a ruling |
| 1. Prerequisites | Instructions only |
| 2.0 Surface present in the deployment | **Measured absent, 2026-11-14**: the live bundle carries `civicscope:census-key` but not the handoff heading, and `src/ui/ai/agent-handoff.tsx` exists only on `lane/submission` (`a5dd37e`), not on `main` or `contest/house-port`. The run is therefore **blocked on a deploy**, not on this document |
| 2.1 Origin answers | Validated 2026-11-14: 200 on both origins, 0.61s and 0.53s |
| 2.2 Handoff section and origin sentence | Validated in the shipped component (`src/ui/ai/agent-handoff.tsx`), **not** on the live deployment |
| 2.3 Cleared-state strings | Validated: both literals ship in the component |
| 2.4 Event names and detail shapes | Validated: `civicscope:census-key` ships as a plain event; `civicscope:meta-key-changed` ships as a custom event with `{present}` |
| 3.1 Signup URL | Validated as the constant the app uses; the live page is external |
| 3.2-3.3 Submit and email | **External, not validated by this lane.** A real mailbox is required |
| 3.4 Token-shape discriminator | Validated against the workflow artefact and the app's own 40-hex normalisation |
| 3.5 Both confirmations | Validated in code: the event dispatch and the "confirmed by CivicScope" literal |
| 3.6 Storage length | Validated: the app stores the extracted 40-character token |
| 4.1-4.3 Meta console | **External, not validated.** The console path is an open finding |
| 4.4-4.5 Meta confirmation | Validated in code, as for the Census path |
| 5. Abort and manual handoff | Validated in code and in the 14-case suite in `tests/ai/agent-onboarding.test.tsx`; the browser walk itself is yours |
| 6. Recording | Validated: the table and result values exist in the record file |

The single owner gate is step 0. Everything else is either validated against the
shipped build at this head or explicitly external, which is why this document is
labelled a checklist rather than a completed run.
