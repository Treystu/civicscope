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
| I3 | Result map | `src/core/map/result-geometry.ts` (335), `result-scale.ts`, `session-map.ts`, `gate-map.ts`, `src/core/map/result-geometry.test.ts`, `result-scale.test.ts`, `src/live/result-geometry.test.ts`, `src/e2e/result-map.e2e.ts` | **Landed in S2**: `src/core/map/result-geometry.ts` (11 cases) and `src/ui/ResultMap.tsx`, rendered in the map view for any selected place, with `src/e2e/result-map.e2e.ts` (4 cases) as the acceptance proof - outline drawn, marks placed and separated, reference state named in text, and a refused basemap reported as absent rather than drawn silently. Measured in a real browser: the PR outline fills the panel and two San Juan ZIP codes plot 10.4px apart. **Not an areal choropleth**: this repo's assets carry ZCTA centroids and state outlines, not ZCTA polygons, so the result layer is a graduated point map. Drawing ZCTA shapes would need a new asset and is not claimed | Port with the probe-corrected TIGERweb query the module's own header records; the e2e is the acceptance proof | S2, landed (point choropleth) |
| I4 | Deterministic arithmetic check | `src/core/ai/arithmetic-check.ts` (160) | **Landed in S3**: `src/core/ai/arithmetic-check.ts` (19 cases). Derived sums, differences, shares and percentage changes with the Census Bureau's published MOE rules - root sum of squares for a sum or difference, the subset rule for a share, the ratio rule for a change - and `checkStated`, which refuses a stated figure that disagrees with its derivation at the displayed precision. Two cases are refused rather than computed, and both are real rather than defensive: a share whose radicand goes negative (the subset rule's independence assumption has failed there, and the published guidance is not to use the formula) and a change from a zero base (every percentage is infinite). This is the module `validator.ts` presupposes: it may never compute a numeral from other figures, so a `derived:` figure must come from code. **Not wired to a call site yet** - the answer lanes that state a figure arrive with I7 in S4, and the record will not claim the capability is reachable until then | Written here rather than ported: the lineage module is not in this clone, so this is the contract `validator.ts` states, implemented and tested. No model, no network, so it runs when every provider is down | S3, I4 landed (not yet called) |
| I5 | National placeless screen | `src/core/ai/national-screen.ts` (432) | **Landed in S3**: `src/core/ai/national-screen.ts` (22 cases). Answers a question that names no place, defers it when one is named, and refuses three classes outright: a request to rank or recommend places (the steering question the Fair Housing notice exists to warn about), a protected-class characterisation (refused because the only answer is a proxy statement about residents), and anything the registry publishes no figure for. Figure selection is a phrase-to-key table ordered by specificity, and two collisions were found by the tests rather than by reading: "what is the rent burden" also matched the bare rent rule and returned two figures, and "average household" matched a count of households instead of the household size. Both are the same defect - a general phrase answering a specific question - so general rules now speak only when no specific rule has. Place detection accepts a five-digit ZIP or a state name from the one list this tree already trusts (exported from `sweep/chunk.ts` rather than copied, so the two cannot disagree), and deliberately does not guess a city from a preposition. **Not wired to a call site yet** - the lane that receives a placeless question is I9 in S6 | Written here rather than ported: the lineage module is not in this clone. Deterministic, so the golden corpus is untouched and the screen runs while every provider is down | S3, I5 landed (not yet called) |
| I6 | Voice input core | `src/core/ai/mic.ts` | **Landed in S3**: `src/core/ai/mic.ts` (21 cases) - consent transitions as a table (`idle`/`requested`/`granted`/`denied`, with `granted` reachable only through an explicit allow and a denial final until reset), transcript assessment (silence, one word, pure filler and a paragraph read aloud are each refused with their own reason), and spoken numbers and ZIP codes. A ZIP is accepted only as five digits, said as a number or one digit at a time; four digits are refused rather than zero-padded, because padding invents a place. **No microphone, no permission prompt, no CSP change, no provider call and no button**: `functions/api/muse/transcribe.ts` is inert on purpose pending the independent-run bar, and this module is the logic a future surface would call rather than that surface itself | Written here rather than ported: the lineage module is not in this clone. Pure logic only, which is what keeps it inside the planned-only constraint on the route | S3, I6 landed (logic only, no UI) |
| I7 | Jev grounding loop | `src/core/ai/jev-loop.ts` (237), `src/core/ai/jev-judgments.ts` (611), `src/server/jev-client.ts` (96), `functions/api/muse/jev.ts`, `verify.ts`, `plan.ts` | Absent: `validator` and `harness` exist, no iterative verify-and-patch loop | Transport behind a judge seam; optional provider; no key bundled | S4 |
| I8 | Meter persistence and Durable Object | `src/core/ai/meter-persistence.ts` (633), `functions/api/muse/meter-do.ts` (536), `wrangler.toml` METER binding | `src/core/ai/meter.ts` only — per-isolate, in memory | **Deployment-shape change**: needs the worker bundle (`tools/build-worker.mjs`, `tools/worker-entry.ts`) and a second script for the DO. The lineage's own `wrangler.toml` records that Pages refuses `migrations` and demands `script_name` | S5, gated on owner approval |
| I9 | General and flexible answer lanes | `functions/api/muse/general.ts`, `flexible.ts`, `src/core/ai/general.ts`, `flexible.ts`, `geography-gate.ts` (1075) | Absent | Largest port. Lands after I4 and I7 so the deterministic and grounding layers already exist underneath | S6 |
| I10 | Conversational plumbing | `bookends.ts`, `hourglass-packets.ts`, `decision-branches.ts`, `run-progress.ts`, `onboarding.ts`, `area-mention.ts`, `near-frame.ts`, `nearby.ts`, `explain-view.ts`, `intent-url.ts`, `usage.ts`, `census-key.ts` | Absent | Land each with the slice that first needs it, not as a block | with S4/S6 |
| I11 | Security middleware | `functions/_middleware.ts` | Superseded: this repo ships `public/_headers` | **Evaluated, not transferred.** Two mechanisms for one job; adopting both would let them disagree | none |
| I12 | Map-outline cure | commit `c3f4609`: `src/ui/map/ResultMap.tsx` (+115) and `tests/ai/result-map.test.tsx` (+107), subject "map outline cure: draw the referenced state's outline under the result choropleth" — parent `9403faa`, one commit, two files | **Landed in S2** as `buildResultMapFit` + `ResultMap.tsx`: the referenced state's outline is drawn under the result marks, sharing one projector with them so it cannot drift. Two defects were measured and fixed on the way: `albersUsa` answers null for Puerto Rico (so PR uses its own conic equal-area, the split `projection.ts` already makes), and the committed basemap winds PR so d3 read the polygon as the globe minus the island - 37.7 steradians against its real 0.0003 - which drew an 89,902-unit path in a 600-unit box. `fitExtent` inherited that too (scale 82.4, both San Juan ZIPs on one pixel), so the scale is now solved from the geometry's vertices and complement-wound rings are reversed before drawing. The lineage's own file was not available here, so this is written to the recorded intent rather than copied | Port with I3 in S2; source = owner-side sync from the portal lineage (the commit exists only there and in the oversight clone) | S2, landed |
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
  Gated on decisions D1 and D5; see section 7.
- **S5 — Durability (I8).** Blocked on the deployment-shape decision; see A4 and
  section 7.
- **S6 — Conversational lanes (I9, remaining I10).** Last because it depends on
  everything above. Gated on decisions D1 and D5; see section 7.

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
deliberately stated rather than implied. S2 (I3 + I12) is landed as a result map:
the reference state's outline, graduated result marks, a text path to every
figure, and four browser cases that drove the built app. It is a **point
choropleth, not an areal one** - this repo has ZCTA centroids, not ZCTA shapes -
and its marks carry only the drilldown metric each place has actually loaded. No
other slice is landed, and no capability here is asserted to work in this repo
beyond the rows named. The
counts above are file and line reads of the lineage at `9403faa` plus the single
`c3f4609` delta recorded as I12, and the "this repo today" column is a file-set
comparison at `da989b0`, not a behavioural review of each module. The gate's red
last measured before the instrument repair was semantic 62.8/100 against a
threshold of 99 (CircleCI pipeline 6); the repair commit scores the fourteen
clause verdicts instead of one holistic answer and is tracked on the PR.

## 7. Gate register - what each unstarted slice waits on (2026-11-11)

**The enforceable ordering document is [`docs/s-slice-plan.md`](s-slice-plan.md).**
It carries the same three gates and states each slice's acceptance in observable
terms, so a slice brief can cite a check rather than a conversation. This section
is the register beside the inventory; that file is the one a brief must cite.

Oversight's 2026-11-10 settlement (tracker #67, comment `c.6784734241`) is the
ordering record this section makes readable from the repo. Integration proceeds
inventory-and-plan first, with an oversight conformance read before any slice;
no key migrates; production stays untouched until slices land on `main`.

The three gates were previously recorded only in off-repo notes. They are:

| Gate | Question it settles | Effect |
| --- | --- | --- |
| **D1** | Key architecture: proxy, BYO-only, or hybrid | blocks S4 and S6 until ruled; the shipped code follows the plan default (hybrid) |
| **D5** | What a user's query may reveal to Meta, and whether aggregate operator counters stand | blocks S4 and S6 until ruled; the shipped disclosure appears before the input and the privacy text is still a draft |
| **A4** | Whether durable-object metering is approved as a deployment-shape change | blocks S5 |

D1 and D5 are owner calls by the plan's own terms (`docs/full-muse-layer-plan.md`
section 9), and no ruling is recorded in this repository. A4 is the owner's
approval of a deployment-shape change and is open in section 5. A slice is not
started, scoped or sequenced until its gate is settled; the gates above are the
reason S4-S6 wait, and the absence of a ruling is stated rather than filled with
a lane guess.

| Slice | Contents | State at `b3c8049` | Waits on |
| --- | --- | --- | --- |
| S1 | I1, I2 | landed (modules, tests, regenerated index) | none |
| S2 | I3, I12 | landed (result map, four browser cases) | none |
| S3 | I4, I5, I6 | landed as modules; no call site yet | none |
| S4 | I7 + the I10 modules it needs | **not started** | D1, D5 |
| S5 | I8 | **not started** | A4 |
| S6 | I9 + remaining I10 | **not started** | D1, D5 |

"Not started" is measured, not asserted. At `b3c8049` every file the inventory
names for S4, S5 and S6 is absent from the tree: `src/core/ai/jev-loop.ts`,
`src/core/ai/jev-judgments.ts`, `src/server/jev-client.ts`,
`functions/api/muse/jev.ts`, `src/core/ai/meter-persistence.ts`,
`functions/api/muse/meter-do.ts`, `src/core/ai/general.ts`,
`src/core/ai/flexible.ts`, `src/core/ai/geography-gate.ts` (file-presence read,
2026-11-11). There is also no `wrangler.toml` or `wrangler.jsonc` in the tree,
which is the deployment-shape surface A4 asks the owner to rule on.

Downstream, S7-S12 in `docs/full-muse-layer-plan.md` section 7 all sit behind
S4-S6, so this register gates the submission path as a whole and not only three
slices. It records ordering; it does not start work, move a key, or touch
production.
