# Privacy text verification checklist

Date of this pass: 2026-11-07, re-read 2026-11-11 against the route set and the
meter as they ship, re-read 2026-11-14 after the FU1 meter cure (#83). Issue: #63.

The 2026-11-14 re-read changed only the meter rows and rows 5 and 14: the
per-client cap was removed rather than left unset, so the text no longer
describes a cap and this checklist no longer cites one. Every other row stands
as measured on 2026-11-11. Plan criterion: 6.2.1, "shipped
privacy text verified line-by-line against the shipped proxy deployment config as
a gate checklist item".

The 2026-11-11 re-read found one omission in the text and two missing rows here:
the text named `/api/muse/intent` and `/api/muse/explain` while a third live
route, `/api/muse/briefing`, is reached by the browser through
`src/core/ai/meta-client.ts`. Both are now recorded.

**Text under check:** [docs/privacy.md](privacy.md). The earlier pass checked
[docs/privacy-workbench.md](privacy-workbench.md), which is the superseded
workbench draft and says so in its own header; two rows of that pass - the
Durable Object claim and the unreachable personal-key path - are closed below
rather than carried forward.

**Status: verified against this tree's code and configuration. Owner sign-off
outstanding.** The text is owner-reserved, and the criterion also asks for the
check to run against the deployed configuration; production does not serve the
layer yet, so the deployed half of the check cannot be completed here. What is
recorded is the evidence a sign-off would need.

## Configuration inspected

| Item | Observed | How |
| --- | --- | --- |
| Server-side routes | `functions/api/muse/{intent,explain,briefing,transcribe,diagnostics}.ts` | repository |
| Storage bindings | None declared. No `wrangler.toml` / `wrangler.jsonc`; Pages Functions are built from `functions/` | repository |
| Durable Object / D1 / R2 / KV use | None in `functions/`, `src/server/`, or `src/core/ai/` | `grep` over those trees |
| Meter implementation | `Meter` class with per-instance Maps for totals, error counts, reservations. No per-client map exists (removed under K3, issue #83) | `src/core/ai/meter.ts` |
| Meter persistence | Per isolate. The diagnostics route reports `meterPersistence: "isolate"`; totals reset on a cold start | `functions/api/muse/diagnostics.ts` |
| Meter cap | `JUDGING_CAP_MICRO_USD = 52_500_000`; no per-client cap exists and the diagnostics payload carries no cap field | `src/core/ai/meter.ts`, diagnostics route |
| Personal-key path | Storage in `localStorage` under `civicscope.metaKey.v1`; provider reads it lazily; direct calls go to `https://api.meta.ai` | `src/core/ai/meta-key.ts`, `src/core/ai/meta-client.ts` |
| Personal-key surface | Mounted on the Ask view as a "Use your own Meta key instead" disclosure, with a probe that spends one small direct intent call to check the key before it is stored | `src/ui/App.tsx`, `src/ui/ai/ByoSettings.tsx` |
| Voice | Route shell exists and is inert: no caller, no provider call, no microphone UI, `microphone=()` in the permissions policy | `functions/api/muse/transcribe.ts`, `public/_headers` |
| CSP / permissions | `connect-src` includes `https://api.meta.ai`; `microphone=()` | `public/_headers` |
| Logging | No `console.*` calls in `functions/` or `src/server/` | `grep` |
| Secrets in Pages | Zero in production and preview, measured 2026-10-30 | `wrangler pages secret list`, recorded on #55/#56 |

## Line-by-line check of docs/privacy.md

| # | Claim | Observed | Status |
| --- | --- | --- | --- |
| 1 | "Metering uses one aggregate counter" | One in-process `Meter`; no Durable Object is claimed in this text, and none exists. Earlier draft said "one Durable Object" - corrected in this text | PASS |
| 2 | "It counts only requests, tokens, spend, and error classes, in total" | `MeterSnapshot` holds `requests`, `tokensIn`, `tokensOut`, `spentMicroUsd`, `budgetExhausted`, `errors`. No content fields | PASS |
| 3 | "never stores searches, keys, query text, IP addresses, or content. No per-search or per-person record" | The meter stores no content; the proxy does not log bodies; no storage binding exists. Per-client spend is keyed by an opaque client id, not a person | PASS |
| 4 | "A hard budget shutoff is kept" | `reserve()` returns null when committed spend plus outstanding reservations would exceed the cap; the route answers 429 `budget_exhausted` | PASS |
| 5 | "There is no per-client cap, and this text states no cap value because no such setting exists" | `MeterConfig` has no per-client field; no per-client map remains; the diagnostics payload carries no cap field; the retired env var is ignored | PASS |
| 6 | "Ask, Explain and the figure-set briefing reach the model through this site's own endpoints (intent, explain, briefing)" | All three routes exist and are the shipped path - `briefing` is called from `src/core/ai/meta-client.ts` and sends the displayed figure set, not question text. The transcribe route is not listed, because it ships inert | PASS |
| 7 | "Wherever the feature allows, the browser sends structured slots ... Where a feature cannot work from slots alone, raw query text is sent, and that limit is shown" | Explain sends the displayed figure set only; Ask sends `queryText` and renders `RAW_TEXT_DISCLOSURE` above the input | PASS |
| 8 | "A standing disclosure accompanies model wording" | `DISCLOSURE_TEXT` renders in `AskPanel` and `ExplainBox` | PASS |
| 9 | "Filter keys are limited to an allowlist in code ... wording that does not pass is withheld rather than shown" | Sortable/filter allowlist plus the validator that withholds non-conforming prose | PASS |
| 10 | "If a visitor chooses to supply a key, it is stored only in that visitor's browser storage. It is sent only to api.meta.ai ... never sent to or stored by CivicScope's servers. Clearing browser storage removes it" | True, and the path is now reachable: the Ask view mounts the personal-key disclosure with a labelled password field, a live status region, and a Clear control. The key is used only by direct calls from that browser | PASS (was PARTIAL / UNREACHABLE in the earlier pass) |
| 11 | "The diagnostics panel keeps counters ... stored in the visitor's browser only. Its export ... structurally unable to carry a query or a key" | `DiagnosticsPanel` is mounted on the Methodology view; counters are local; the export is rebuilt from validated counters | PASS |
| 12 | "There is no tracking, no analytics, and no search logging" | No analytics dependency or script; no request-body logging; diagnostics counts are local and exported only by the visitor | PASS |
| 13 | "Voice input is not part of this build" | Inert route, no UI, microphone permission policy closed | PASS |
| 14 | "No per-client total is kept either: the counter is accounting-only and divides nothing by visitor, by address or by browser" | The meter keeps no per-client map and no client id is passed to `reserve` or `settle`; `meterPersistence: "isolate"` still reports that totals reset on a cold start | PASS |
| 15 | "The briefing sends the figure set already on screen, re-checked against its sources before the call, never the question text" | `handleBriefing` accepts `figureSetId` and a `values[]` allowlisted to `key`/`value`/`marginOfError` (any extra field in a value item fails the shape check), and calls the provider with `{ figureSetId, values }` built field by field - so a top-level `queryText` is **never forwarded** rather than actively rejected. The guarantee is non-forwarding, which is the property the text claims; the earlier wording here said "rejected", which overstated the mechanism | PASS |

## What remains before this text is final

1. **Owner sign-off.** The text is owner-reserved; nothing in this pass can
   substitute for that approval.
2. **The deployed half of the criterion.** Re-run this checklist against the
   production deployment once the layer is on production - the inspected
   deployment today is a preview, and production serves `main` without the layer.
3. **Nothing else outstanding in the text.** Both defects the earlier pass
   raised - the Durable Object claim and the unreachable personal-key path - are
   closed: the first was corrected in the text, the second was fixed in the
   build.

## What this checklist does not prove

- It does not verify a signed-off text, because sign-off is the owner's.
- It does not verify production, which does not serve the layer yet.
- It does not prove the absence of all logging in platform telemetry. It checks
  this repository's code and configuration; platform-level retention is outside
  what the repo can assert.
- It does not prove the personal-key probe's verdict mapping against the real
  Meta API, which needs a key; the mapping is the shipped provider's own closed
  error taxonomy, exercised hermetically.
