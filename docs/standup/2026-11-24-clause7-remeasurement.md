# clause_7 restated: the first measurement, 2026-11-24

The ruling on `#79` (`2026-11-22T06:33:45Z`) restated clause_7 and made it effective
"from the next gate pass", with the threshold unchanged at 99. The entry of
`2026-11-23T08:01:53Z` struck the blanket checkpoint, which was the condition the earlier
entry put on the instrument edit. This is that edit, measured.

## What was measured, exactly

- Head: PR #66 head `30a29317`, with `docs/standup/clause-7-restatement.patch` applied
  locally (+6/-1 to `tools/completion-gate.mjs`). Nothing was committed or pushed.
- Dependencies: `npm ci` from that tree's own lockfile, node v26.13.1, after a clean
  install.
- Command: `SKIP_E2E=1 GATE_EXPECT_DEPLOYED=0 npm run gate` (network checks enabled).
- Runtime: 1 m 42 s. `gate-report.json` is a generated, git-ignored artefact.

Clause_7's entry in that report, under the restated text:

```
req: no advertising, analytics, search logging or accounts anywhere; the housing data
     layer is serverless; the AI proxy is stateless and stores nothing - counts only,
     no bodies, no query text, no IP addresses, no keys
  proof: city search contacts no external origin            -> passed, one label
  proof: CSP connect-src allowlist is deployed              -> passed, one label
```

## The reading

    99/100 deterministic checks passed
    28 cited proof pairs, 27 passed
    sole unproven clause: WCAG 2.2 AA with zero violations -> WCAG 2.2 AA audit (0 labels)
    semantic layer: skipped, TYPESAFE_API_KEY not set
    decision: threshold 99, checks 100, checksPassed 99, semantic "skipped",
              score null, thresholdMet null, verdict FAILED
    overall: not measured

The one deterministic failure is the WCAG clause, and it fails because the audit did not
run - the label has no hits at all, not a failing hit. That stage needs a real browser;
this workspace has none (`chrome-headless-shell` cannot load `libnspr4`, and the package
cannot be installed without root). No other clause is unproven, and clause_7 itself is
proven on both of its existing proofs.

## Why this is attributable to the restatement and nothing else

Two controls, same head, same dependencies:

| run | instrument | environment | deterministic | failures |
| --- | --- | --- | --- | --- |
| A | patched | `SKIP_NETWORK=1 SKIP_E2E=1` | 89/91 | requirement citations; citation-matcher self-test |
| B | unpatched | `SKIP_NETWORK=1 SKIP_E2E=1` | 89/91 | identical, line for line |
| C | patched | `SKIP_E2E=1`, network on | 99/100 | requirement citations (WCAG only) |

B is the control for the patch: with the same environment it produces the identical
failure set, so the restatement changes no deterministic outcome. A is explained by its
own environment rather than the instrument - the two failures it shows are the deploy and
sitemap checks not running, and the self-test that plants `production serves a build` as a
specimen. That self-test passes in run C, when the label exists, which is the direct
evidence that A's failures are stage-skip artefacts and not a matcher defect.

## What this reading is not

- It is not a 99 score. The semantic layer needs `TYPESAFE_API_KEY`, which is absent, so
  the threshold was not measured and the report says so in its own words: `not measured`.
- It is not retroactive, per the ruling's condition. Every past red reading stands:
  78.2 on 2026-11-10, the 77.9-79.7 band, 60.2 on `c4c9c781`, 41.2 on main's job 205.
- It is not a landed change. The patch is filed, verified to apply and to parse, and
  unlanded. `30a29317` still carries the old clause text; `main` and this lane branch do
  not carry a clause table at all.
- It does not close `#79`. That issue stays open until a re-measurement under the
  restated clause is on the record with the semantic layer measured, which needs the key.
- The live-contract stage was not bounded for this run; the gate's own step ran and
  passed. The 300 s stall this lane recorded earlier belongs to the standalone
  `vitest.live.config.ts` suite, not to this gate pass.

## The next act on this item

Obtain `TYPESAFE_API_KEY` (owner-held; this lane does not request it in the clear and does
not write it anywhere), then run the same command on a landed `30a29317`-descended head
with the patch committed, read the semantic score against the 99 threshold, and put both
numbers on `#79`. Until then the deterministic half is measured and filed here.
