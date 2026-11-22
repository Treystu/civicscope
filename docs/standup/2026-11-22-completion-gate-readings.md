# Completion-gate readings at `main` `0b59f724`, 2026-11-22

Every reading in this file was produced in this workspace today against
`main` = `0b59f724a8830a05f385f9cd8c1789ac0a2417d9`. Where a clause could not be
measured, the file says so and gives the reason rather than a number.

`tools/completion-gate.mjs` was not edited, and the threshold was not touched. This is a
measurement pass, not the #79 instrument change: the retarget to the restated clause is
already filed on #79 (Option B, oversight ruling, 2026-11-21) and takes effect at the
next gate pass after the checkpoint is lifted.

Environment: node v26.13.1, npm 11.20.0, dependencies installed from `package-lock.json`
(`npm ci`, 185 packages), Playwright chromium 1243 downloaded, no `TYPESAFE_API_KEY`,
no root.

## 1. The instrument that exists at `main` is not the instrument #79 describes

This is the first and largest reading, and it reframes the rest.

| | `main` `0b59f724` | `lane/submission` `30a29317` |
| --- | --- | --- |
| `tools/completion-gate.mjs` | 1,249 lines, 70,418 bytes | 1,940 lines |
| Scoring formula | `0.4 * is_a_99/3 + 0.3 * requirements_met + 0.3 * overclaiming` (line 1197) | same formula |
| `requirements_met` | one holistic Jev question | arithmetic mean of a 14-clause table |
| `clause_7` as written | **does not exist** | line 1189: `req: 'no advertising, analytics, search logging, accounts or runtime backend'` |
| Sitemap proof | count rule only (`urls > 30000`) | set comparison both directions (`906ac8b`) |
| Threshold | 99 (line 44) | 99 |

Consequences, stated plainly:

- Clause_7 cannot be measured "at main" by main's instrument, because main's instrument
  has no clause table. The clause exists only on the lane, which is where the recorded
  band (0.45 to 0.61) comes from.
- The 101/101 deterministic count in the lane's records is the lane instrument's count.
  It is not this workspace's count and this file does not borrow it.
- A reading taken after a merge is a reading of a third instrument version, because the
  lane's gate (with `906ac8b`) differs from both. That is why the landing pack insists
  the merged head's reading be filed as its own row.

## 2. Clause_7 as written, measured against `main`'s tree for the record

The clause text: "no advertising, analytics, search logging, accounts or runtime
backend". Measured as five sub-properties against `main`:

| Sub-property | Reading at main | How |
| --- | --- | --- |
| No advertising | holds, as far as a tree can show | no advertising client in `package.json` dependencies |
| No analytics | holds | no analytics client in dependencies or source |
| No search logging | holds for the shipped proxy | no `console.*` in `functions/` or `src/server/` |
| No accounts | holds | no sign-in surface, no credential store |
| No runtime backend | **FALSE** | `git ls-files functions` returns `explain.ts`, `intent.ts`, `shared.ts`, `transcribe.ts`: four tracked Pages Functions, served by the asset deployment |

So the clause is unmet as written at main, on the fifth sub-property, exactly as #79's
20:39 UTC comment concluded for the lane. The lane carries five routes
(`briefing.ts`, `diagnostics.ts`, `explain.ts`, `intent.ts`, `transcribe.ts`, no
`shared.ts`); the merged tree carries those five. The property reading is therefore
unmet at main, unmet at the lane head, and unmet at the merged head. No evidence can
lift a clause that the architecture contradicts, which is the whole basis of the #79
Option B ruling.

This section measures a property. It is not a Jev reading and it does not substitute for
one.

## 3. Stage readings at main, today

| Stage, as the gate runs it | Reading | Evidence |
| --- | --- | --- |
| `npm run build` (tsc -b, vite build, gen-seo) | **PASS**, 10 s | `dist/index.html` written; `[seo] sitemap covers 33791 ZIP codes (33793 URLs total)` |
| `npx vitest run` (unit + security) | **PASS**, 55 files, 570 tests, 39 s | `.lane/unit-main.log` |
| `npx vitest run --config vitest.live.config.ts` (live API contracts) | **NOT COMPLETE in this workspace** | 7 of `src/live/api-contract.test.ts` passed in about 4 s (Photon geocoding, Census ZCTA, TIGERweb tract GEOID, Census no-key HTML error page, key validation x2, network-vs-rejection). The suite then stalls on the NY-schools live tests, each carrying a 300000 ms per-test timeout, because the host does not answer from this network. Isolated and named: `-t "yields nothing outside New York"` alone did not finish in 55 s (`timeout` exit 124). A stall is not a failure and is not filed as one. |
| `npx vitest run --config vitest.e2e.config.ts` (WCAG 2.2 AA, axe-core, real browser) | **NOT RUNNABLE in this workspace** | 8 of 10 suites fail at launch: `chrome-headless-shell: error while loading shared libraries: libnspr4.so`, `exitCode=127`. `npx playwright install-deps chromium` cannot install it: `sudo: The "no new privileges" flag is set`. This is a workspace limitation, not a product finding. |
| Jev semantic layer | **NOT RUN** | `TYPESAFE_API_KEY` is absent, so the gate prints `Jev review skipped: TYPESAFE_API_KEY not set. Deterministic layer ran alone.` No semantic reading is filed from here because none was produced. |

The live-contract stall is the reason a full gate run is slow in this environment: it is
a closed network path to two third-party hosts, bounded only by a five-minute per-test
timeout. It is worth recording that the suite's own timeouts are the reason CI can take
nine minutes on a docs-only head, which is why the lane's records quote job numbers and
durations together.

## 4. The gate run itself

A full `node --no-deprecation tools/completion-gate.mjs` run was started at 09:16 UTC
against main with `SKIP_E2E=1` (the workspace cannot launch a browser, so the alternative
was a stage that fails at launch, not a stage that measures). At 09:26 UTC, ten minutes
in, it was still inside the live-contract stage, with one TCP connection open and idle
to `165.224.128.225:443` and no output yet, because the gate prints its deterministic
total only after that stage returns.

This file therefore does not claim a deterministic total for main. What it does claim is
section 3, stage by stage, plus the reason the total is missing: a third-party host that
completes a TCP handshake and never answers, bounded per test only by the suite's own
300-second timeout. A stall is not a failing check, and inventing the total from the
four stages that did run would be exactly the kind of number this gate exists to
prevent.

The stage that did not run is worth naming precisely: `SKIP_E2E=1` skips the WCAG audit,
which in this workspace could only fail at browser launch. That is a documented,
instrument-supported skip, and it is why no accessibility reading appears anywhere in
this file.

Read with the staged readings, the honest statement about main's deterministic layer is:

- the two stages that are hermetic both pass, at the counts stated;
- the third stage cannot finish here, and the fourth cannot start here;
- no clause is claimed as measured that was not measured.

## 5. What the recorded semantic readings are, and whose they are

For the record, and not re-derived here, the lane instrument's semantic readings of
clause_7 stand as filed:

| Head set | `clause_7` | Overall | Deterministic |
| --- | --- | --- | --- |
| nine comparable runs, jobs 260-286 | 0.45 to 0.61 | 77.9 to 79.7 | 101/101 at all nine |

The tenth run in that table (job 272, 99/101) is excluded as not comparable, for a
browser fixture race that re-ran 101/101 on the identical tree. Those numbers belong to
`lane/submission`, not to main, and they are quoted here only to keep this file from
implying that main ever carried a clause_7 score.

## 6. What the #79 Option B retarget will change, and when

- It changes one line of clause text (`tools/completion-gate.mjs:1189`) and nothing
  else: the two proofs at line 1190 stay, the threshold stays 99, the formula stays.
- It takes effect from the next gate pass after the checkpoint lift, never
  retroactively. Every past red reading stands.
- Until that edit, any gate run anywhere carries the old clause and must be read as
  such. This file is one of those readings.

## 7. Clauses this pass could not measure, and why

| Clause area | Why it is not measured here |
| --- | --- |
| WCAG 2.2 AA (axe-core) | no browser runtime available in this workspace (missing system libraries, no root) |
| Live third-party contracts | two hosts do not answer from this network; the suite's own 300 s timeouts are the bound |
| Jev semantic layer, all 14 clauses | no `TYPESAFE_API_KEY` in this workspace, and no key is requested or invented |
| Deployed-bundle freshness | the gate's site fetch would report against `https://civicscope.pages.dev`; it is a deployed artifact reading, and this lane does not deploy. Not claimed. |

The absence of these readings is the finding. A green deterministic layer in a different
environment does not transfer to this one, and a number quoted without its head, its
instrument version and its environment is the thing this project's gate exists to stop.

## Sources

- `git rev-parse HEAD`, `wc -l tools/completion-gate.mjs`, `grep -n` for the threshold,
  the formula, the clause and the proof list, on both heads
- `npm run build`, `npx vitest run`, `npx vitest run --config vitest.live.config.ts`,
  `npx vitest run --config vitest.e2e.config.ts` in this workspace, 2026-11-22
- gate log: `.lane/gate-main-skipe2e.log` (workspace-local, not committed)
- `docs/clause-7-evidence-packet.md` and `docs/proof-closure.md` on `lane/submission`
  for the recorded band, quoted as records, not re-derived
