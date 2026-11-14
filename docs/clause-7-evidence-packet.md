# clause_7 — the decision packet (#79)

This is the artefact to decide from. It states the clause as written, the two bands
its scoring has produced and the heads behind them, what the frozen criterion reads
today, what would have to change for it to pass, and the one question being put to the
owner. It changes nothing itself: the instrument, the threshold and every product text
stay as they are until the owner answers.

Filed once, 2026-11-14, against `lane/submission` at `06a1f41`. No part of this file
assumes an answer.

## The question

> **clause_7 requires "no advertising, analytics, search logging, accounts or runtime
> backend". `/api/muse/*` is a deliberate runtime backend, disclosed in the gate's own
> evidence record. Do you rule A - keep the clause as written, accept that the gate
> cannot pass on this build, and record it as permanently red - or B - restate the
> clause to the identity that is true and measurable, after which the gate re-measures
> on the rail?**

One word is enough: **A** or **B**. Everything else below is why that is the choice.

## The clause, as written

`tools/completion-gate.mjs:1189`:

```
req: 'no advertising, analytics, search logging, accounts or runtime backend',
proofs: ['city search contacts no external origin', 'CSP connect-src allowlist is deployed'],
```

Five sub-properties in one sentence, with two deterministic proofs attached to all
five. Four are true of the shipped system and have been since it existed:

| Sub-property | State | Evidence |
| --- | --- | --- |
| No advertising | true | `package.json` dependencies are `d3-geo`, `react`, `react-dom`; no ad SDK, no ad origin in the CSP |
| No analytics | true | no analytics dependency or call site; `public/_headers` sets `script-src 'self'` with no `unsafe-inline` and no `unsafe-eval`, and `connect-src` enumerates every destination |
| No search logging | true | `src/core/ai/meter.ts` keeps totals only; `docs/privacy.md` says the same and is pinned by `tests/ai/privacy.test.ts` |
| No accounts | true | no auth dependency, no login route, no session store; the only client identifier is an opaque in-memory id |
| No runtime backend | **false as written** | `functions/api/muse/{intent,explain,briefing,transcribe,diagnostics}.ts` are a runtime backend. They are off the housing data path: every figure comes from the visitor's own Census requests |

The fifth is the whole question. The proxy exists because the provider key must not
reach the browser. It stores no bodies (counts only), and its meter is per-isolate
rather than durable - but it is, in the plain sense of the words, a runtime backend.

## What the frozen criterion reads

The score is unchanged and unmoved by anything in this packet:
`score = 100 * (0.4 * is_a_99/3 + 0.3 * requirements_met + 0.3 * overclaiming)`, passing
at 99, with `requirements_met` the arithmetic mean of the fourteen clause verdicts.

### clause_7 across the heads measured today

| Head | Gate job | Deterministic | `requirements_met` | `clause_7` | Overall |
| --- | --- | --- | --- | --- | --- |
| `75f1573` | 260 | 101/101 | 0.896 | 0.53 | 79.6 |
| `b02d103` | 264 | 101/101 | 0.896 | 0.52 | 77.9 |
| `875dabb` | 266 | 101/101 | 0.894 | 0.53 | 79.7 |
| `310f05f` | 270 | 101/101 | 0.908 | **0.61** | 79.5 |
| `f3707e5` | 278 | 101/101 | 0.885 | **0.45** | 78.0 |
| `06a1f41` | 282 | 101/101 | 0.896 | 0.53 | 78.6 |

Three further runs today, keyed the same way:

| Head | Gate job | Deterministic | `clause_7` | Overall | Note |
| --- | --- | --- | --- | --- | --- |
| `5b57d08` | 192 | 101/101 | 0.55 | 78.1 | the reading the analysis was written against |
| `7a64481` | 272 | **99/101** | 0.53 | 61.2 | **excluded**: a browser fixture read a card between two paints (see below), so the deterministic failure fed the semantic score and the run is not comparable |
| `f527040` | 275 | 101/101 | 0.54 | 78.8 | the same tree as 272, re-run to identify the flake |

**Nine gate runs today, every one keyed to its job number; eight of them at
deterministic 101/101 and comparable. Across those eight: `clause_7` 0.45 to 0.61,
overall 77.9 to 79.7.** An earlier head in the day read 79.8, which is inside the
same window; it is quoted without a job number because this packet only keys figures
it can point at.

The bands are the finding, not noise to average away. Between `310f05f` and `f3707e5`
`clause_7` fell from 0.61 to 0.45 - sixteen hundredths - while the clause text, the
evidence record's scope and `/api/muse/*` were byte-identical; only documentation
changed. So:

- no single reading of the semantic layer is a stable fact about this build, and
- the number cannot be managed upward by editing the dossier, because an unrelated
  push takes it back.

## What would have to change for the gate to pass

Option A changes nothing, and therefore changes nothing about the outcome: the
requirement as written is false of the shipped system, so no amount of evidence can
make it true, and `requirements_met` stays where a judge puts it. The gate stays red
by construction. That is a legitimate choice if the clause is meant as a covenant
rather than a measurement - but it must then be recorded as permanently red, not as
work outstanding.

Option B restates the clause to the identity that is true and checkable, in the form
the unification brief asks for:

```
no advertising, analytics, search logging or accounts anywhere; the housing data
layer is serverless; the AI proxy is stateless and stores nothing - counts only,
no bodies, no query text, no IP addresses, no keys
```

Each part of that is already the shipped behaviour, and each is checkable in the tree
rather than by a judge's reading: no storage binding exists
(`docs/privacy-verification-checklist.md`, "Storage bindings: None declared"), the
proxy keeps no bodies (`functions/api/muse/shared.ts`), and the meter's totals are
per-isolate integers (`src/core/ai/meter.ts`). Under B the two existing proofs carry
the restated clause, the gate is re-measured on the rail, and the outcome is whatever
that measurement says - not an assumed pass.

What the lane will not do under either option: reword `deliverable_summary` toward 99,
move the threshold, add a check that cannot fail, or claim a green gate it did not
measure. Editing the summary is measurement theatre, and the jitter above shows it
would not even work.

## Why this is filed once and not pushed further

Both options are owner decisions: A is a covenant the owner keeps, B is an instrument
edit the owner authorises. The lane's job was to make the choice decidable on
evidence, which is this file plus the ledger's per-head rail readings. There is no
third option proposed and none hidden.

## Sign-off

- [ ] **A** - keep the clause, record `clause_7` as permanently red, close #79 as
  "covenant retained, gate cannot pass on this build".
- [ ] **B** - restate the clause as above, then the lane makes the instrument edit, runs
  the gate at the new head, and reports the measured result.

Until one is checked, #66 stays open on `contest/house-port` and proof closure stays
open with it, because both name the same criterion.
