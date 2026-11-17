# Champion Audit #72: HTTP retry and backoff

Filed against issue #72 in the Champion Audit program (#67). Offline, no
credential, no network.

**Decision: no change to the schedule.** The champion is `fetchResilient(url,
init, attempts = 4)`; the challenger is the same function at three attempts.
The challenger fails the acceptance margin outright.

**One genuine defect was found and fixed** (F2 below), and one failure class is
recorded as an open design question rather than changed (F1).

---

## 1. Method

`tests/http-retry-audit.test.ts` replays a 30-scenario fault corpus through the
shipped function: every retryable status (429, 500, 502, 503, 504, 529) at burst
lengths 1-3, 429 with and without `Retry-After`, connection drops with no
response, five refusal statuses (400, 401, 403, 404, 422), and a 200 carrying an
HTML error page (the Census failure class #72 names).

- `fetch` is stubbed from a script; waits are recorded rather than slept.
- `Math.random` is seeded per scenario from its id, so the jitter draws are the
  same every run. A random corpus would move between runs and the margin would
  never mean the same thing twice.
- The replay emulates the caller: a resolved response is read as JSON, so a 200
  carrying HTML fails at the caller even though the retry layer accepted it.

## 2. Result

| | Champion (4 attempts) | Challenger (3 attempts) |
|---|---|---|
| scenarios recovered | 76.7% | 50.0% |
| transient classes recovered | **100.0%** | 65.2% |
| 400-class retries | 0 | 0 |
| added latency p50 | 1,923 ms | 1,923 ms |
| added latency p95 | 8,075 ms | 6,171 ms |
| recovered only on the last attempt | 8 | 0 |

Acceptance requires the challenger to raise transient-fault success by at least
two points with p95 latency within +10% and zero retries on 400-class responses.
The challenger **loses 34.8 points** of transient success: every three-fault
burst that the fourth attempt rescues is lost, while it is no better on latency
because a burst of one or two costs the same either way.

**No-change**, and the corpus is the deliverable. Attempt four is not decoration:
eight of the 30 scenarios recover only there.

## 3. F2, fixed in this pass: the ceiling was not a ceiling

`backoffMs` computed `min(ceiling, base * 2^(attempt-1))` and then multiplied by
a jitter in [0.5, 1.5). Jitter applied **after** the clamp can exceed the clamp,
so the 429 series (3,000 / 6,000 / 12,000 before jitter) produced waits up to
**18,000 ms** despite a documented 12,000 ms ceiling. Measured on this corpus, the
worst single wait was 15,424 ms pre-fix.

The fix is one expression: jitter first, then clamp. The measured worst 429 wait
is now **12,000 ms**, and the range is unchanged wherever it sits below the
ceiling. Nothing about which responses are retried, or how many attempts are
made, changed; only waits that would have breached the ceiling are shortened.
The test asserts the clamp in both directions: the shipped corpus shows no wait
above 12,000 ms, and a worst-case jitter draw yields exactly `[4500, 9000, 12000]`.

The 30,000 ms figure in the notes is the `Retry-After` cap, not a backoff term.
Measured and asserted: `Retry-After: 120` waits exactly 30,000 ms. At four
attempts no computed backoff can reach it - the 5xx series tops out at 3,000 ms
before jitter (4,500 ms after).

## 4. F1, recorded and left open: the retryable set never sees the Census HTML page

The hypothesis in #72 was that the retryable set may be firing on the wrong
failure class. Measured: a 200 carrying an HTML error page is accepted by the
retry layer, dies in the shape validator, and is retried **zero** times - one
call, no wait.

That is correct for its usual cause: the code comment records that Census answers
a missing or invalid key with an HTML page, and retrying a bad key would spend
quota to repeat a mistake.

It is not obviously correct for the transient case. #57 recorded 13 live-contract
tests failing on upstream HTML bodies in one CI attempt and passing on the rerun of
the identical head - an HTML page that cleared by itself. Under the current design
that failure is permanent: the chunk is skipped and the visit gets a partial
sweep with no retry.

**Not fixed here**, deliberately. Retrying every HTML page would spend the quota
on permanent key errors, and distinguishing "invalid key" from "upstream busy"
needs a classification this audit has not measured. It is the owner's call
whether the shape validator should classify the error page and hand a transient
one back to the retry layer.

## 5. Verification

```
npx vitest run tests/http-retry-audit.test.ts src/core/http.test.ts   # 5 passed
npm run verify                                                        # counts in the PR digest
```

## 6. Next action

Owner/oversight acceptance on #72. If accepted, the no-change close records this
measurement and the corpus; F2 is already fixed and demonstrated, and F1 stays
open as the one design question the measurement raised.
