# Muse layer build story

Date: 2026-10-30, refreshed 2026-11-05. Written at `lane/submission`
`35d931a`; the F5a/F6 rows below were re-read at `917d3e46`, which is where the
sandbox integration landed those features. Issue: #63.
This is the canon build record for the contest layer: what was built, how it
was built, which decisions are actually in the shipped code, what the gate
caught, and which claims the evidence supports.

It is written after the work, from commits, test runs, issue comments and the
served deployment. Where a value was not measured, it says so rather than
filling the gap.

## What pre-existed, and what is contest work

The metric registry, the ACS plugin, the executor, the IndexedDB cache and the
rest of the browser data tool pre-date the contest. They are labelled as
pre-existing in [docs/contest-port-manifest.md](contest-port-manifest.md), and
`tests/contest-registry-pin.test.ts` pins the two key lists so registry drift
fails the suite instead of entering the submission as an unrecorded change.

The contest work is the House layer: Ask, Explain, the numeral-provenance
validator, the meter and proxy, the provider client, the harness and golden
corpus, the disclosure/privacy text, diagnostics, and the documentation. The
manifest maps each item to its port issue and merge commit.

## What was built in the window

| Component | Files | Evidence |
| --- | --- | --- |
| Intent schema and allowlists, derived from the ported registry | `src/core/ai/intent-schema.ts` | PR #45, merged `db2b191f`; `tests/ai/schema.test.ts` |
| Ask surface: chips, editor, clarification, execution | `src/ui/ai/*`, `src/ui/App.tsx` | PR #50, `aab2c87`; `tests/ai/ask-completion.test.tsx` |
| Explain runtime on comparison and figure surfaces | `src/ui/ai/ExplainAction.tsx`, `ExplainOnAsk.tsx`, `ViewFigure.tsx` | PR #52, `cb87560`; `tests/ai/explain-action.test.ts` |
| Validator and fair-housing intent gate | `src/core/ai/validator.ts` | PR #44, `f7329a6a`; `tests/ai/validator.test.ts` |
| Meter, proxy gate, closed error taxonomy | `src/core/ai/meter.ts`, `src/server/muse-proxy.ts` | PR #47, `097f1eff` |
| Live provider, proxy-first with BYO-direct fallback | `src/core/ai/meta-client.ts`, `src/core/ai/meta-key.ts` | `9efe458`; `tests/ai/meta-client.test.ts` |
| Pages Functions routes | `functions/api/muse/{intent,explain,transcribe,diagnostics}.ts` | `9efe458`, `cc0f3e3` |
| Golden corpus, harness, coverage report | `tests/ai/golden-corpus.json`, `src/core/ai/golden.ts`, `tests/ai/coverage-report.md` | PR #48, `27974649`; `6ae16ea` |
| F7 diagnostics export | `src/core/ai/diagnostics.ts`, `src/ui/ai/DiagnosticsPanel.tsx`, `functions/api/muse/diagnostics.ts` | `cc0f3e3`, `35d931a`; issue #62 |
| Voice cut record | `docs/s12-voice-cut.md` | `d4a7dc6`; issue #61 |
| Preview deployment | `docs/submission-path-deploy.md` | `08992cc`; deployment `390579ff` (later `1cb4c184`) |

The corpus is **91 intent cases**: 45 lookup phrasings, 39 mode cases (30
compare, 4 sweep_filter, 5 similarity), and 7 refusal-class forms. An earlier
record said 92; the generated coverage report and the recount agree on 91. The
correction is recorded on #60 and in `docs/muse-layer-eval.md`.

## How it was built, and the limit on the L3 claim

The plan's L3 layer is "Muse Code + agent lanes (documented development
story)". This repository does not contain evidence for the Muse Code half.

What the history actually shows: every commit is authored by `Treystu`, and the
contest commits carry `Generated with Codebuff` and
`Co-Authored-By: Codebuff <noreply@codebuff.com>`. A search of the log finds no
Muse Code trailer, session, or build artefact. The work was agent-built, but
the agent named in the only available record is **Codebuff**, not a Meta
coding agent.

Therefore this document does **not** support a "built with Muse Code" claim,
and the submission should not make one. The auditable L3 story is:

- a single lane branch with a standing draft PR, the lane protocol in
  `AGENTS.md`, commits pushed at every checkpoint;
- 36 merged pull requests detected in the project history (the port issues
  #33-#40 and the lane PRs), each with issue evidence;
- a completion gate that runs typecheck, tests, build, live contracts, the
  exported site and the browser/axe audit;
- the defects the gate and the reviews actually caught, listed below.

That is a real build story. It is not a Meta-tooling claim, and it should not be
written as one.

## D1-D8: what is in the code, and what is still owner-reserved

The plan lists eight decisions as Lucas's calls, with defaults. No separate
owner ruling on D1-D8 is recorded in this repository. The table therefore states
the shipped or observable state, not a ruling that does not exist.

| Decision | State in this build | Evidence |
| --- | --- | --- |
| D1 key architecture | Hybrid is implemented: proxy-first, visitor key as fallback. The proxy has the shared key; the browser has none. | `src/core/ai/meta-client.ts`; `tests/ai/meta-client.test.ts` asserts no Authorization header on the proxy path |
| D2 who pays after credits | BYO-after-credits is implemented in routing (`budget_exhausted` / `credits_exhausted` / `breaker_open` selects BYO). The BYO **settings surface is not mounted**, so a visitor cannot enter a key in this build. | `src/ui/ai/ByoSettings.tsx` exists and is tested; no import of it in `src/ui/App.tsx` |
| D3 agent onboarding as an official path | **Built at `917d3e46`; the independent run is not.** Workflow artefact, in-app handoff and run-record exist; the record's `## Independent run` section reads `PENDING — NO INDEPENDENT RUN HAS BEEN PERFORMED`, so the section 6.2.5 bar is undischarged and #59 stays open. | `docs/agent-onboarding/workflow.v1.json`; `src/ui/ai/agent-handoff.tsx`, mounted at `src/ui/App.tsx:541`; `docs/agent-onboarding/run-record.md`; `tests/ai/agent-onboarding.test.tsx` |
| D4 strict "describe, never recommend" | The strict line is in code: ranking, recommendation, steering and evaluative constructions are banned and withheld. | `src/core/ai/validator.ts` `BANNED_PATTERNS`; `tests/ai/validator.test.ts` |
| D5 what a query may reveal | Ask sends the typed question to the same-origin proxy, which forwards it to Meta; the app discloses this before the input. Explain sends the displayed figure set, not the question. The final privacy text is still DRAFT. | `RAW_TEXT_DISCLOSURE` in `AskPanel.tsx`; `src/server/muse-adapter.ts`; `docs/privacy-workbench.md` header |
| D6 briefing pack (F6) | **Built at `917d3e46`.** Generator re-verifies every SourceRef before a pack is shown, and the surface is mounted. | `src/core/ai/briefing.ts`, `src/ui/ai/BriefingView.tsx` (`App.tsx:708`), `functions/api/muse/briefing.ts`; `tests/ai/briefing.test.ts`, `briefing-route.test.ts`, `briefing-ui.test.tsx` (commit `7e297c8`, `c73ca2f`, `95d8241`) |
| D7 language scope | English only: the request type is `locale: 'en'`, and there is no translation layer. | `src/core/ai/provider.ts`; corpus is English |
| D8 naming | The product says "Ask CivicScope" and "Explain"; "Muse layer" is documentation and submission language, not in-product branding. | `src/ui/App.tsx`, `src/ui/ai/AskPanel.tsx`; no "Muse" in the served UI |

D1, D2, D4 and D7 are observable code choices. D3, D5, D6 and D8 remain
owner-facing in different degrees; this record does not convert any of them into
a ruling.

## What the gate actually caught

| Finding | What happened | Fix |
| --- | --- | --- |
| Diagnostics e2e failed the completion gate | The gate serves `dist` with `vite preview`, which has no Functions. The new e2e demanded a reporting server on a surface that was correctly reporting nothing. | `35d931a`: the test now accepts a reporting server with agreeing probes, or an unavailable server with nulls and named unknowns, and keeps every leak assertion before either branch. |
| Eval entry points exited 1 with no output on Windows | `spawnSync('npx.cmd')` returns `EINVAL` on Node 24. The underlying suites were green, so the wrapper made the record look worse than the code. | `6ae16ea`: invoke the repo's own vitest entry with the current Node. |
| Corpus count was recorded as 92 | The generated report said 91 all along; the prose and PR body said 92. | `6ae16ea`: corrected to 91, with the composition stated. |
| Privacy copy claims a Durable Object | The shipped meter is per-isolate memory; there is no Durable Object binding or class. The gate does not read privacy prose, so it did not catch this. | Recorded in [docs/privacy-verification-checklist.md](privacy-verification-checklist.md); owner decision, not resolved here. |
| BYO settings promised in copy but unreachable | `ByoOffer` says "add it in settings" when the shared allowance is exhausted, but `ByoSettings` is not mounted and no `onOpenSettings` is passed. | Recorded on #63; not silently fixed, because mounting it is a product/UI decision. |

The gate did catch a real integration defect on its own: at `cc0f3e3` the new
e2e was red on a host without Functions, and the red was correct about the
test's assumption, not about the product. That distinction is why the fix kept
the leak checks rather than weakening them.

## Claim ledger: real, measured, and cut

This is the list the submission text and demo script must obey.

| Claim | Status | Evidence or reason |
| --- | --- | --- |
| Ask and Explain are served from a real Cloudflare Pages deployment | **Real, preview only** | Preview `1cb4c184` from `35d931a`; `GET /` 200, assets 200, `/z/02139` 200; production still serves `main` and returns 405 on `/api/muse/intent`. |
| `/api/muse/*` routes exist and refuse honestly without a key | **Real** | `503 {"error":"provider_down","detail":"no shared key configured"}` with `cache-control: no-store`; foreign Origin 403. |
| The live provider completes a request successfully | **Proven on the preview portal** | 91 live cases completed through the portal proxy on 2026-11-03, which is the run recorded in [the eval record](muse-layer-eval.md). Before that, only a deliberately invalid key round trip had been measured: `401 bad_key` through both routes, matching Meta's own `401 invalid_api_key`. No valid key has ever been used from this repository. |
| Exact-intent score >=95% | **Measured, proxy preview** | 96.7% (88/91) on 2026-11-03, run from the union tree against `civicscope-muse-portal.pages.dev`; recorded in [the eval record](muse-layer-eval.md) and not re-run in this repository. The 91/91 figure is a replay, not a model score. |
| Safety score 100% | **Measured live, proxy preview** | 7/7 on the same 2026-11-03 run. The hermetic safety subset is also 7/7 non-runnable, which is a fixture result, not a model result. |
| Coverage 69/69 | **Real, hermetic** | Generated from the registry in `tests/ai/coverage-report.md`; denominator is the registry, not a hand list. |
| Diagnostics export works and cannot carry a key or prompt | **Real** | `cc0f3e3`, `35d931a`; 21 diagnostics tests, served-build e2e with sentinels, deployed route exercised on the preview. |
| Accessibility on the served preview | **Real, scoped** | `ask-shell` 3/3 and `a11y` 8/8 with 0 axe violations on the preview on 2026-10-30. This is the tested views, not a claim about every page. |
| Voice input | **Cut** | No capture UI; `Permissions-Policy: microphone=()`; `ask-shell` asserts 0 mic/transcribe buttons; [docs/s12-voice-cut.md](s12-voice-cut.md). |
| Agent onboarding (F5a) | **Built; independent run PENDING** | Artefact and handoff shipped at `917d3e46`; `run-record.md` says no independent run has been performed, so no completed-run claim may be made. #59 open. |
| Briefing pack (F6) | **Real, with a re-verification gate** | `briefing()` at `917d3e46` re-verifies every figure and refuses on an altered value, an altered margin of error, a source that no longer resolves, or a filled-in absence; `tests/ai/briefing.test.ts` covers each. |
| A visitor-supplied Meta key is usable | **Not in this build** | `ByoSettings` exists and is tested, but it is not mounted; `ByoOffer` has no settings action. |
| Per-client cap is active | **No such thing exists** | K3 (2026-11-13) settles the meter as accounting-only. The capability was removed rather than left unset (issue #83), because an unset cap still implied a mechanism the design does not have. The aggregate pool shutoff is 52.50 USD. |
| Privacy text is final | **No** | `docs/privacy-workbench.md` says WORKBENCH COPY - NOT FINAL; one line (Durable Object) is unsupported by the shipped meter. |
| The layer was built with Meta Muse Code | **No evidence** | Commit trailers name Codebuff; no Muse Code artefact exists. Do not claim it. |

## Reproduce

```bash
npm ci
npm run verify          # typecheck + 677 tests + production build (67 files, at 917d3e46 + this commit)
npm run test:ai         # hermetic replay: exactIntent=91/91 safety=7/7
npm run test:e2e        # built app; browser + axe
npm run gate            # deterministic completion gate
```

The live tier is deliberately excluded from `verify` and the gate:

```bash
MUSE_API_KEY=... npm run test:ai:live
MUSE_EVAL_PROXY_BASE=https://submission.civicscope.pages.dev npm run test:ai:live
```

Both print `surface=direct|proxy`. Neither surface has been run with a valid key
from this repository; the one measured run came from the union tree against its preview portal, and the documents name it as measured, not as NOT RUN.

## Evidence index

- [docs/muse-layer-eval.md](muse-layer-eval.md) - corpus, hermetic results, live tier status.
- [tests/ai/coverage-report.md](../tests/ai/coverage-report.md) - generated coverage.
- [docs/submission-path-deploy.md](submission-path-deploy.md) - served surface and production comparison.
- [docs/s12-voice-cut.md](s12-voice-cut.md) - the binary voice cut.
- [docs/privacy-verification-checklist.md](privacy-verification-checklist.md) - DRAFT privacy text against config.
- Issues #55, #56, #60, #61, #62, #63 and PR #66 - measurement comments and check-runs.
