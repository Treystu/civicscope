# Proof closure — what the frozen instrument records, reconciled

Written 2026-11-14 at `lane/submission` head `06a1f41`. Purpose: state exactly what the
frozen instrument has measured on the unified build, which of the burndown's items are
closed by that measurement, and which one is not and why. This file claims nothing the
rail did not print.

Frozen means frozen: `tools/completion-gate.mjs` carries exactly one threshold,
`THRESHOLD = Number(process.env.GATE_THRESHOLD ?? 99)`, unedited by this lane, and no
commit in this session touches the instrument or the threshold. Nothing here rewords
the evidence record toward 99.

## The deterministic layer: 101 of 101, green at every comparable head

| Head | Gate job | Deterministic |
| --- | --- | --- |
| `5b57d08` | 192 | 101/101 |
| `75f1573` | 260 | 101/101 |
| `b02d103` | 264 | 101/101 |
| `875dabb` | 266 | 101/101 |
| `310f05f` | 270 | 101/101 |
| `f527040` | 275 | 101/101 |
| `f3707e5` | 278 | 101/101 |
| `06a1f41` | 282 | 101/101 |

One run in the window read 99/101 - `7a64481`, job 272 - and it is recorded here rather
than omitted: the WCAG audit's `url-state` fixture read a comparison card between the
ZIP painting and the city label painting. The identical tree re-run (`f527040`, job 275)
read 101/101, which is what proves it was a race rather than a product defect. Both
fixtures with that shape now await the label; the assertion is unchanged, so a card that
never names its city still fails. The armed-merge condition for #66 rests on this count,
so the count is only worth what the fixtures are worth - which is why a flaky green was
treated as a defect in the layer.

The three jobs behind every reading above ran from the CI config on `main` (`cb930c7`,
`.circleci/config.yml`, 4,608 bytes): `verify`, `live-contracts`, `completion-gate`.

## The semantic layer: not met, and not closable by work

`requirements_met` is the mean of fourteen clause verdicts; `clause_7` is the clause
whose requirement is false of the shipped system (`/api/muse/*` is a runtime backend,
deliberately, so the provider key never reaches the browser). Across the eight
comparable runs above, `clause_7` read 0.45 to 0.61 and the overall number 77.9 to 79.7,
against a frozen threshold of 99.

Two consequences, both already in `docs/clause-7-evidence-packet.md`:

- no amount of evidence makes a false universal true, so option A of #79 leaves the gate
  red by construction;
- no editing of the dossier reliably moves the number, because a documentation-only push
  moved it from 79.7 to 77.9 and `clause_7` from 0.61 to 0.45.

## Item reconciliation

| # | Item | Disposition | Evidence |
| --- | --- | --- | --- |
| 1 | CI config on `main` | **CLOSED** | `cb930c7`; every job cited here ran from it |
| 2 | #66 into `contest/house-port` | **OPEN** — armed condition unmet | semantic criterion never above 79.8 against 99; PR open on its base, never retargeted |
| 3 | house-port into `main`, data layer untouched | **CLOSED** | `main` `0b59f72`; data-layer diff against `contest/house-port` empty |
| 4 | flexible completion + live Jev stage gates | **CLOSED** | `flexible.test.ts` 17, `stage-gates.test.ts` 9 in `verify`; live `jev-stage-gates.test.ts` reports `model=jev-1.14.0` with three stage verdicts |
| 5 | honest meter (FU1) | **CLOSED** | zero `perClientCap` in `meter.ts`; five counters plus pool shutoff; #83 closed |
| 6 | PLACES asthma + tenant-compare | **CLOSED** (lane) / **DECISION-READY** (country-wide, ruling 7) | `pct_asthma` in the shipping plugin with drilldown and notice; `RENTER_SHARE_KEY` shared by derivation and validator with a 4-case agreement test |
| 7 | privacy text #63 + S12 checklist #64 | **DECISION-READY** — wording sign-off | 15 claims verified against code, one of them corrected this session for overstating its mechanism; readiness rows re-read, row 16 corrected |
| 8 | clause_7 packet #79 | **DECISION-READY** — filed once | `docs/clause-7-evidence-packet.md`: clause text, both bands, nine keyed runs, the ceiling argument, A or B |
| 9 | onboarding run #59 | **DECISION-READY** — blocked on a deploy | workflow v1.0.1, record, checklist whose every code claim was re-verified; the live deployment does not carry the surface, and the checklist measures that first |
| 10 | tracker #67 upkeep; #31 archival | **CLOSED** (upkeep) / **DECISION-READY** (delete-or-keep) | #67 corrected in-thread; #31 carries the content check |
| 11 | proof closure | **DECISION-READY** — blocked on #79 | this file |

## So what is closed, and what is closed *if*

Proof closure is not a thing the lane can finish alone. The instrument's deterministic
layer - the part that cannot be argued with - passes in full and has done so at every
comparable head. The semantic layer names one unsatisfiable clause, and the fix for that
is either a covenant the owner keeps (A) or an instrument edit the owner authorises (B).

**Under A:** #79 closes as "covenant retained", #66 merges only if the owner also amends
the armed-merge condition to exclude the semantic criterion, and proof closure closes as
"green on everything measurable; the semantic criterion is permanently red by choice".
That is a coherent end state and it is the owner's to choose.

**Under B:** the lane restates the clause, runs the gate at the new head, and reports
whatever it measures - a pass is possible, not assumed.

Either way the lane's own work is done: there is no remaining item that can be moved
without one of those words.
