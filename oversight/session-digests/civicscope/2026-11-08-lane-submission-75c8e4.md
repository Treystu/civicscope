# CivicScope session digest

- schema: civicscope-session-digest/v1
- session_id: lane-submission-75c8e4
- date: 2026-11-08
- lane: lane/submission
- base: contest/house-port
- pr: 66
- pr_state: open draft
- agent: Freebuff/Buffy
- window_start_utc: 2026-11-08T09:03:00Z
- window_end_utc: 2026-11-08T09:46:00Z
- head_start: 547f82006ad0c8f1f4d6c63d36ce46b9d68e5a46
- head_end: 959f042d32f81bccd4d984273d1307dfff7f202a
- pushed: true
- pr32_state: HOLD, untouched
- deployed: false
- owner_reserved_actions_taken: none. #76 F1 (provenance vs uniform 20) and P4 clause 14 were left exactly as found.
- credentials: none read, requested, created or copied by this pass. The exact-head gate ran keyless with HOME and USERPROFILE pointed at an empty temp directory, so its key discovery found nothing and no keyed layer ran.
- sensitive_data: none; this file contains no keys, tokens, URLs with credentials, or user data

## Verification

- item: Champion Audit #75 - map hex aggregation and colour binning under partial load, champion versus the former >=50% coverage gate
- method: real screen replayed through shipped code - 33,791 ZCTA centroids from public/map/zcta-centroids.bin projected by createView at 1200x700 scale 1, 33,771 on screen in 1,722 hexagons at hexRadius(1)=9; arrival order taken from planChunks (lexicographic sort, CHUNK_SIZE 800); champion is the shipped hexbin + buildBins + binFor, comparator is the old coverage gate on the same bins
- cd_criterion_1_bins_from_shipped_code: met - every on-screen ZIP lands in exactly one shipped bin, asserted; screen and bin counts printed
- band_churn_50_to_100: smooth field 358/478 (74.9%), independent field 184/478 (38.5%)
- final_coverage: champion 99.0%, comparator 98.3%, ratio 0.992
- churn_reduction_vs_30_percent_margin: 0.8% (smooth), 0.5% (independent) - margin not met on either field
- verdict: NO CHANGE; comparator does not ship; nothing in src/ changed
- hypothesis_result_partly_confirmed: arrival order is geographic - at 50% load only 30.3% of bins exist and mean longitude is -80.3 against -91.0 complete
- hypothesis_result_refuted: bin medians are stable - with the final breaks held still, band churn falls to 0.0% (smooth) and 0.2% (independent)
- new_finding: buildBins re-derives its quantile breaks at every stage, so the 74.9% / 38.5% band churn is legend instability, not aggregation instability; a colour means a different figure mid-sweep
- new_finding_disposition: recorded in docs/champion-audit-75-map-binning.md as a candidate item (legend stability under load) for the owner; not shipped and no issue created unasked
- stated_limits: synthetic value fields (no ACS values exist in the repo), 15% missing ZIPs, one viewport and one radius so zoom is not replayed; the verdict is a champion-versus-comparator comparison on the same field and both fields agree within 0.3 points
- focused_test: npx vitest run tests/map-binning-audit.test.ts - 5 passed
- verify: npm run verify - 79 files / 806 tests passed, exit 0 (status captured directly, not through a pipeline)
- emoji_scan: 0 findings, 239 files
- mojibake_scan: 0 findings, 282 files
- secret_scan: 0 findings, 286 files
- gate_head_measured: 959f042d32f81bccd4d984273d1307dfff7f202a
- gate_deterministic_at_959f042: 100/100
- gate_state_at_959f042: PASSED, keyless
- gate_register_at_959f042: operator-authored; independent_channel_ran=false; tree_complete=unrun - carried as a limitation, not a completeness claim
- ci_check_runs: not claimed. The account billing lock still refuses to start jobs, so no CI evidence exists for any head.
- commands: npx vitest run tests/map-binning-audit.test.ts; npm run verify; node tools/emoji-scan.mjs .; node tools/mojibake-scan.mjs .; node tools/secret-scan.mjs .; HOME=<empty> USERPROFILE=<empty> node --no-deprecation tools/completion-gate.mjs

## Status

- done: #75 measured and closed as no-change at 959f042 - real-screen replay through shipped code, both acceptance clauses measured on two pre-stated value fields, the comparator's own margin missed by two orders of magnitude, and the hypothesis corrected in public: the instability is the colour scale re-deriving, not the medians moving
- wip: none; tree clean, nothing unpushed
- next: #74 or #77 are already measured and await owner acceptance; the next unmeasured Champion Audit item is the highest-numbered open one on tracker #67. Candidate new item from this pass: legend stability under load (buildBins re-deriving breaks per stage, 74.9% band churn against 0.0% value churn)
- blockers: no CI under the billing lock; #76 F1, #72 F1, P4 and the legend question are owner decisions
- directives: steering read at turn start (newest oversight 07:52Z plus my own digests); no directive named a different item, so #75 stood. PR #32 HOLD unchanged.
- owner_actions_outstanding: #75 close (no-change is written and pushed, the close itself is yours); legend-stability decision if you want it as an item; #76 decision; #72 F1; P4; #74 and #77 acceptance; clause-13 ownership evidence; S4/A3; CENSUS_KEY; merge, deploy and portal submission

## Gate receipts

- GATE: local pass (decision-signal) - state #75's target and measurable done criterion before measuring - plan line posted on #75, checks 1-5 clean
- GATE: local pass (decision-signal) - report the comparator's miss as measured numbers and leave the suggested new item to the owner - churn reduction 0.8%/0.5% reported, no mechanism changed, checks 1-5 clean
