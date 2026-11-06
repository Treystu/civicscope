# Hackathon integration plan

Status: **plan filed, awaiting oversight conformance read.** No slice has started.
Owner of the plan: lane/submission. Written 2026-11-05.

This is the inventory and sequencing order for bringing capabilities from the
submitted production lineage into this tool. It exists because the contest port
in `docs/contest-port-manifest.md` was a *cut*: it carried the housing core and
left the conversational, map, and durability layers behind. The gap is measured
below rather than described.

## 1. What was read, and how

| Claim | Read method | Timestamp |
| --- | --- | --- |
| Lineage tree contents | `git -C musehackathon ls-tree -r --name-only 9403faa`, both clones | 2026-11-05T12:37Z |
| This repo's tree | `git ls-files` at `da989b0` | 2026-11-05T12:37Z |
| The 236-file delta | `comm -13 <(tool files) <(lineage files)` | 2026-11-05T12:37Z |
| Module sizes quoted below | `git show 9403faa:<path> \| wc -l` | 2026-11-05T12:40Z |
| Data asset size | `git cat-file -s 9403faa:public/map/zcta-counties.json` = 339935 | 2026-11-05T12:44Z |
| Lineage deploy shape | `git show 9403faa:wrangler.toml`, `git show 9403faa:package.json` | 2026-11-05T12:44Z |

Reading the lineage was done **out of the git object store**, never from a
working tree, so nothing in `C:\Users\SCM\Documents\Entire` was modified,
checked out, or executed.

**Lineage identity: `c3f4609` does not exist.** `git cat-file -t c3f4609` fails
in both `musehackathon` and `musehackathon-submit`; `git log --all` across 374
commits has no such object; and both remotes' `main` reads `9403faa` (read:
`git for-each-ref` + `cat-file`, 2026-11-05T12:38Z). The inventory below is
therefore written against **`9403faa`**, the commit that both clones actually
serve as main. See assumption A1 — this is a blocker on the *identity* of the
lineage, not on the inventory, and oversight should confirm which commit was
meant.

## 2. Fence compliance

The lineage carries three things that must not enter this repo, and the plan
routes around each rather than porting and then removing:

- `src/core/config/shared-app-key.ts` — a shared Census application key.
  **Not transferable.** The tool keeps the bring-your-own-key model that the
  completion gate grades under "the free Census rate limit is respected".
- `src/core/ai/meta-key.ts` / `src/core/ai/meta-client.ts` are already present
  *here*, and are the current coupling this work has to reduce. Every AI row
  below lands behind `src/core/ai/provider.ts`, never against a named vendor.
- `TYPESAFE_API_KEY` (the lineage's Jev transport reads it in
  `src/server/jev-client.ts`). **The transport interface may land; no key, no
  default, no fallback key.** An unconfigured judge degrades honestly and the
  deterministic layers still run.

`.entire/`, `.agents/hooks.json`, `.codex/hooks.json`, `.opencode/plugins/` and
`packs/` are agent tooling, not product. They are listed as row X1 and are not
part of any slice unless the owner says otherwise.

## 3. Inventory

Proof evidence is the lineage's own proof surface quoted at the path given. It
is evidence that the capability exists and was exercised *there*; it is not
evidence that it works *here* until the slice's own run says so. Nothing in
this table was executed from the lineage in this session.

| ID | Capability | Lineage evidence | This repo today | Adaptation | Slice |
| --- | --- | --- | --- | --- | --- |
| I1 | ZIP to county index | `src/core/zcta-county-index.ts` (201 lines), `src/core/zcta-county-index.test.ts`, `public/map/zcta-counties.json` (339935 B, dictionary-packed) | **Landed in S1**: `src/core/zcta-county-index.ts`, `src/core/zcta-county-index.test.ts`, `public/map/zcta-counties.json` (384 KB, 33,791 records, 3,211 counties, regenerated here 2026-11-06) | Regenerated, not copied: `tools/gen-zcta-city-mapping.mjs` now emits the index from `tab20_zcta520_county20_natl.txt`, carrying the county GEOID and the ZCTA land share; 9,790 of 33,791 ZCTAs straddle a county boundary and the share is what lets the consumer disclose it | S1, landed |
| I2 | County aggregation | `src/core/county-aggregate.ts`, `src/core/county-aggregate.test.ts` | **Landed in S1**: `src/core/county-aggregate.ts`, `src/core/county-aggregate.test.ts` | Written here rather than ported (the lineage module is not in this clone): sums counts only, reports an unknown count as unknown rather than a partial sum, refuses to aggregate medians (the publisher's county table is the source for those), and labels dominant-county attribution with its straddle count | S1, landed |
| I3 | Result map | `src/core/map/result-geometry.ts` (335), `result-scale.ts`, `session-map.ts`, `gate-map.ts`, `src/core/map/result-geometry.test.ts`, `result-scale.test.ts`, `src/live/result-geometry.test.ts`, `src/e2e/result-map.e2e.ts` | Partial: `binning`, `centroids`, `projection`, `scale` only — no result map | Port with the probe-corrected TIGERweb query the module's own header records; the e2e is the acceptance proof | S2 |
| I4 | Deterministic arithmetic check | `src/core/ai/arithmetic-check.ts` (160) | Absent | Straight port. Needs no model and no network, so it runs even when every provider is down | S3 |
| I5 | National placeless screen | `src/core/ai/national-screen.ts` (432) | Absent | Port; the screen is deterministic, so the golden corpus is untouched | S3 |
| I6 | Voice input core | `src/core/ai/mic.ts` | Absent (the `transcribe` route is present without it) | Port the pure logic: consent state, transcript assessment, spoken-number validation | S3 |
| I7 | Jev grounding loop | `src/core/ai/jev-loop.ts` (237), `src/core/ai/jev-judgments.ts` (611), `src/server/jev-client.ts` (96), `functions/api/muse/jev.ts`, `verify.ts`, `plan.ts` | Absent: `validator` and `harness` exist, no iterative verify-and-patch loop | Transport behind a judge seam; optional provider; no key bundled | S4 |
| I8 | Meter persistence and Durable Object | `src/core/ai/meter-persistence.ts` (633), `functions/api/muse/meter-do.ts` (536), `wrangler.toml` METER binding | `src/core/ai/meter.ts` only — per-isolate, in memory | **Deployment-shape change**: needs the worker bundle (`tools/build-worker.mjs`, `tools/worker-entry.ts`) and a second script for the DO. The lineage's own `wrangler.toml` records that Pages refuses `migrations` and demands `script_name` | S5, gated on owner approval |
| I9 | General and flexible answer lanes | `functions/api/muse/general.ts`, `flexible.ts`, `src/core/ai/general.ts`, `flexible.ts`, `geography-gate.ts` (1075) | Absent | Largest port. Lands after I4 and I7 so the deterministic and grounding layers already exist underneath | S6 |
| I10 | Conversational plumbing | `bookends.ts`, `hourglass-packets.ts`, `decision-branches.ts`, `run-progress.ts`, `onboarding.ts`, `area-mention.ts`, `near-frame.ts`, `nearby.ts`, `explain-view.ts`, `intent-url.ts`, `usage.ts`, `census-key.ts` | Absent | Land each with the slice that first needs it, not as a block | with S4/S6 |
| I11 | Security middleware | `functions/_middleware.ts` | Superseded: this repo ships `public/_headers` | **Evaluated, not transferred.** Two mechanisms for one job; adopting both would let them disagree | none |
| I12 | Map-outline cure | commit `c3f4609`: `src/ui/map/ResultMap.tsx` (+115) and `tests/ai/result-map.test.tsx` (+107), subject "map outline cure: draw the referenced state's outline under the result choropleth" — parent `9403faa`, one commit, two files | Absent: the cure was the final portal-side commit and never flowed back, which is why this mirror and the GitHub copy top at `9403faa` | Port with I3 in S2; source = owner-side sync from the portal lineage (the commit exists only there and in the oversight clone) | S2 |
| X1 | Agent toolchain | `.entire/`, `.agents/`, `.codex/`, `.opencode/`, `packs/`, `skills-lock.json` | Absent | Out of product scope; owner decision, not lane work | none |
| X2 | Static assets | `public/og-image.png`, `public/favicon.svg`, `map-zoomed.png` | Not carried | Transfer only if a slice actually references them | none |

## 4. Slices, smallest first

Each slice lands on `lane/submission` through this PR's gates, and each is
verified against this tool's own surfaces — the ported test plus the e2e or live
suite that exercises it here. A slice that cannot pass all three gates stops and
files a steering request rather than widening.

- **S1 — ZIP to county (I1, I2).** Self-contained data join, no provider, no UI
  change beyond a county row. Smallest possible proof that the pipeline works:
  regenerate, test, gate.
- **S2 — Result map (I3).** Independent of the AI layer. Its e2e is the
  acceptance criterion.
- **S3 — Deterministic lanes (I4, I5, I6).** No model, no network. This is the
  slice most likely to raise the gate's semantic score honestly, because it adds
  capability the evidence record can point at.
- **S4 — Grounding (I7, with the I10 modules it needs).** Provider-optional.
- **S5 — Durability (I8).** Blocked on the deployment-shape decision; see A4.
- **S6 — Conversational lanes (I9, remaining I10).** Last because it depends on
  everything above.

## 5. Assumption register

Overdue rows are blockers. A row is closed only by the method named in it.

| # | Assumption | Owner | Verify by | Method | State |
| --- | --- | --- | --- | --- | --- |
| A1 | `c3f4609` is the final production commit | oversight | 2026-11-06 | `git cat-file -t` in both clones + remote `main` read | **CLOSED** 2026-11-06 on oversight's read: the object is real, parent `9403faa`, one commit touching two files; it is absent from this mirror because it never flowed back, so the measurement basis was short by exactly that cure. Its content is row I12. |
| A2 | The lineage's tests pass at `9403faa` | lane | per slice | Run the ported test in this repo, not there | OPEN |
| A3 | `civicscope.pages.dev` serves this tool repo, not the lineage | lane | 2026-11-06 | Primary read of the served bundle's contents | OPEN |
| A4 | Durable-object metering needs a deployment-shape change the owner has not approved | owner | before S5 | Re-read this project's Pages config, not the lineage's | OPEN |
| A5 | No key from the portal's environment reaches this repo | lane | every push | `tools/secret-scan.mjs` in the gate + review of every diff | standing |

## 6. What is not claimed

S1 (I1 + I2) is landed on `lane/submission` as core modules with their tests and a
regenerated artefact; no screen renders a county row from it yet, and that is
deliberately stated rather than implied. No other slice is landed, and no
capability here is asserted to work in this repo beyond the two rows above. The
counts above are file and line reads of the lineage at `9403faa` plus the single
`c3f4609` delta recorded as I12, and the "this repo today" column is a file-set
comparison at `da989b0`, not a behavioural review of each module. The gate's red
last measured before the instrument repair was semantic 62.8/100 against a
threshold of 99 (CircleCI pipeline 6); the repair commit scores the fourteen
clause verdicts instead of one holistic answer and is tracked on the PR.
