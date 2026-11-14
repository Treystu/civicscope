# clause_7 evidence packet — for the owner's ruling on #79

Written 2026-11-14 against `lane/submission` head `5b57d08`. This packet does not
change the instrument, the threshold, or any product text. It exists so the owner
can rule once, on evidence, between the two options #79 already names.

## The measurement this packet explains

CircleCI job 192, head `5b57d08`, workflow `4f880dc5`:

```
Jev semantic review  score 78.1/100  (threshold 99)
  requirements_met: noul=0.35
  overclaiming: noul=0.57
  is_a_99: score=2.55/3 conf=0.56
  requirements_met (scored) = 0.899 (14/14 clauses)
  clause_7: noul=0.55      <- the lowest clause
  clause_11: noul=0.81
Overall: 78.1/100
GATE FAILED
```

Every deterministic check in that console passes. The failure is the semantic
criterion alone, and `clause_7` is its largest single contributor below 0.9.

### The packet's reading has been refreshed, and the argument does not move with it

Re-measured at `75f1573`, completion-gate job 260, workflow `e7e9dd9f`:

```
Deterministic  101/101
  requirements_met (scored) = 0.896 (14/14 clauses)
  clause_7: noul=0.53
Overall: 79.6/100  (semantic criterion (99): NOT MET)
GATE FAILED
```

Across the heads this lane has produced, `clause_7` has read 0.51, 0.52, 0.53, 0.55
and 0.56, and the overall semantic number has read **77.9 to 79.8** - treat any single
reading as the middle of a band about 1.9 points wide, not as a fixed score. The latest
reading at the time of writing is 79.7 (job 266, `875dabb`). The `5b57d08` block is kept
because it is the reading the analysis was written against.

**The variance is the finding, not noise to average away.** Between `75f1573` and
`b02d103` the only change was documentation - the checklist preflight and this packet's
own refresh - and the semantic number moved 79.6 to 77.9 while the deterministic layer
stayed 101/101 and `requirements_met` stayed 0.896. Nothing in the product changed, and
no clause's evidence changed. That is a judge re-reading a dossier, and it puts roughly
a 1.7-point band on any single reading, which is more than the gap between most of the
options anyone might propose.

It also means the number cannot be managed by editing text: pushing it toward 99 would
require a dossier rewrite whose effect the judge has just shown it can undo on an
unrelated push. The clause text is the stable thing to rule on; the score is not.

## The frozen clause text

`tools/completion-gate.mjs:1189`:

```
req: 'no advertising, analytics, search logging, accounts or runtime backend',
proofs: ['city search contacts no external origin', 'CSP connect-src allowlist is deployed'],
```

Five sub-properties in one sentence, two deterministic proofs attached to all five.

## Sub-property evidence, read from the tree

| Sub-property | State | Evidence |
| --- | --- | --- |
| No advertising | true | `package.json` dependencies are `d3-geo`, `react`, `react-dom` and nothing else; no ad SDK, no ad origin in CSP |
| No analytics | true | no analytics dependency and no analytics call site; `public/_headers` sets `script-src 'self'` with no `unsafe-inline` and no `unsafe-eval`, and `connect-src` enumerates every destination |
| No search logging | true | `src/core/ai/meter.ts` keeps totals only (requests, tokens, spend-in-micro-USD, error classes); `docs/privacy.md` "Tracking and logging" states the same and is pinned by `tests/ai/privacy.test.ts` |
| No accounts | true | no auth dependency, no login route, no session store; the only client identifier is an opaque in-memory id the browser generates, named in `docs/privacy.md` |
| No runtime backend | **false as written, true as scoped** | `functions/api/muse/{intent,explain,briefing,transcribe,diagnostics}.ts` are a runtime backend. They are not on the housing data path: every figure comes from the visitor's own Census requests |

## What actually makes the clause score 0.55

Not a missing artefact. The `deliverable_summary` in the instrument already discloses
the proxy in the plainest terms available (`tools/completion-gate.mjs:1518-1528`):

> the housing data path has no runtime backend, no database, no accounts and no search
> logging. [...] The one server-side surface is a set of same-origin proxy routes under
> `/api/muse` [...] they store no request or response bodies (counts only), and their
> meter lives in one isolate rather than durably.

So the record is scoped ("the housing data path") and honest about the exception. The
**requirement** is not scoped: "no ... runtime backend", full stop. A judge scoring the
requirement as written sees a shipped runtime backend and scores the clause down. The
gap is between the clause's universal and the product's actual, disclosed shape.

That distinction decides the ruling. Option 1 in #79 ("the record carries deterministic
evidence for clause_7") is available for four of the five sub-properties and is partly
done already: `city search contacts no external origin` and `CSP connect-src allowlist is
deployed` are the two proofs attached, and both pass. But no deterministic proof can make
a false universal true. `/api/muse/*` exists, deliberately, because the provider key must
not reach the browser. Option 1 alone cannot lift the clause; at best it demonstrates the
four sub-properties the clause already scores above 0.9 on.

Option 2 restates the clause to what is measurable and true. The identity statement
the lane proposes for the ruling, in the form the unification brief asks for (data
layer serverless; the AI proxy stateless, storing nothing):

```
no advertising, analytics, search logging or accounts anywhere; the housing data
layer is serverless; the AI proxy is stateless and stores nothing - counts only,
no bodies, no query text, no IP addresses, no keys
```

That is a statement of identity rather than of feature absence, and each part of it
is already the shipped behaviour: no storage binding exists (`docs/privacy-verification-checklist.md`
"Storage bindings: None declared"), the proxy keeps no bodies (`functions/api/muse/shared.ts`),
and the meter's totals are per-isolate integers (`src/core/ai/meter.ts`).

## Why the lane stopped here

- The instrument and the 99 threshold are frozen by covenant. Editing `REQUIREMENTS` is
  an instrument edit.
- Rewording `deliverable_summary` until the judge scores higher would raise the number
  without making any claim more true. That is the measurement theatre this program exists
  to prevent, and it is the one thing #79 explicitly rules out.
- Both paths in #79 are owner decisions. The lane's job was to make the choice decidable
  on evidence, which is this file.

## Secondary observation, for the same ruling

`clause_14` ("a completion gate passed on evidence rather than assertion") reads 0.96 in
a run where the gate fails. The clause is generous about a gate that has not passed. It
is not part of this packet's ask, but if the record is being made honest rather than
persuasive, that is the second place to look.

## What would close #79

1. Owner rules option 1 (record-side): the lane adds deterministic checks for the absence
   of advertising, analytics and accounts, and the clause stays as written and stays red
   because `/api/muse/*` exists. Documented as red, permanently.

2. Owner rules option 2 (instrument-side): the clause is restated as above, the two
   existing proofs carry it, and the gate's score is re-measured on the rail. That is an
   instrument edit and the owner's alone.

No third option is proposed. The lane will not reword the summary toward 99.
