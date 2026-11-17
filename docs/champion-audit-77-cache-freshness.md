# Champion Audit #77: cache freshness policy

Filed against issue #77 in the Champion Audit program (#67). Evaluation first,
offline, no credential.

**Decision: no change to the mechanisms.** The shipped policy is kept and the
replay is the deliverable. Two exposures were confirmed on the way and are
recorded in section 5 as findings, which the issue required regardless of the
TTL outcome.

---

## 1. What is being decided

Four freshness rules govern four layers:

| Layer | Key | Lifetime | Source |
|---|---|---|---|
| plugin fetches | request URL | 24 h | `src/core/executor.ts` `DEFAULT_TTL_MS` |
| other URL-keyed responses | request URL | 30 d fallback | `src/core/cache.ts` `DEFAULT_TTL_MS` |
| ZCTA enumeration | `civicscope://zcta-enumeration/v1` | 90 d | `src/core/sweep/chunk.ts` `ENUM_TTL_MS` |
| sweep chunks | `chunk@SWEEP_VERSION` | none - stamp only | `src/core/sweep/runSweep.ts` |

`STALE_AFTER_MS` (7 d) does not expire anything; it flags a served chunk for
background refresh, so it is a display and reconciliation signal, not a policy.

## 2. Method

`tests/cache-freshness-audit.test.ts` replays the rules over a declared timeline:
180 days, two visits a day, 43 sweep chunks (`ceil(33791 / 800)`), eight
enumeration requests per refetch. Every lifetime and key shape is imported from
the shipped code, so editing a constant changes the measurement rather than
leaving a copy behind.

The timeline carries the recorded history: two meaning changes (the v6 variable
addition and the v7 "same key, different variable" change), and a new Census ZCTA
layer at day 150. Two champion runs are measured - one where the author bumps
`SWEEP_VERSION` at both changes, one where the day-120 bump is forgotten.

Stated limit: this is a policy replay, not a user trace. The repository holds no
visit log, so the visit rate is a declared parameter and every number below is
conditional on it. What is not assumed is the mechanism.

## 3. Result

| Policy | Requests | Stale figure visits | Stale list visits | Missed-bump exposure |
|---|---|---|---|---|
| Champion, stamps bumped | **331** | **0** | 60 | none |
| Champion, day-120 bump forgotten | 288 | **120** | 60 | **60 d (does not end in horizon)** |
| Challenger: uniform 7 d, no stamps | 1380 | 14 | 8 | none |

Acceptance requires the challenger to cut repeat-visit requests by at least 30%
while serving no figure across a vintage change. It does the opposite: **4.2x the
champion's requests** (1380 vs 331), because a seven-day TTL refetches the whole
43-chunk sweep once a week and the national enumeration every week. It does bound
stale figures to 14 visits, but it buys that bound with request volume the free
Census quota exists to avoid.

So: no change. The champion is the cheaper policy and, with the stamp bumped, the
only one measured at zero stale figures.

## 4. Why the champion's zero is real, and not luck

The zero is not the TTLs doing the work. Both response layers are keyed by the
request URL, and the ACS vintage (`VINTAGE = '2023'` in `src/core/plugins/acs.ts`)
and the variable list are both in that URL. A vintage change or a variable change
is therefore a new key and cannot serve superseded content - at any TTL.

That leaves the sweep chunks, which are *not* URL-keyed: their URL is built
per chunk and the cache key is `state-chunk@SWEEP_VERSION`. Their correctness
rests entirely on the manual stamp, which is what section 5 measures.

## 5. Confirmed findings (recorded, not fixed here)

**F1. A forgotten version bump has no bound.** With the day-120 bump missed, the
champion serves superseded rows for the remaining 60 days of the horizon - 120
stale visits - and nothing would stop it at day 180 either: a sweep chunk has no
age limit, so the exposure ends only when someone remembers to bump. The issue
called this a hypothesis; it is now a measurement. This is the failure class the
v6 and v7 bumps were both reactions to, and both were noticed by a human
comparing surfaces, not by the software.

**F2. The enumeration key has no data vintage.** `civicscope://zcta-enumeration/v1`
carries a schema version only. When Census publishes a new ZCTA layer (modelled at
day 150), the champion keeps serving the superseded list until the 90-day lifetime
expires: 60 stale visits in the horizon. The challenger bounds it to 8 visits at a
weekly eight-request refetch. The list changes at most annually and the code
comment says so, so this is a small, known cost - but it is a real one, and the
key is where it would be fixed if the owner wants it fixed.

Neither finding is a reason to adopt the challenger: F1 is orthogonal to TTLs
(any TTL only shortens the window), and F2's fix is a vintage in the enumeration
key, not a seven-day lifetime.

## 6. Code in this pass

Behaviour-preserving only, so that the replay measures shipped values:

- `src/core/cache.ts`: `DEFAULT_TTL_MS` exported;
- `src/core/executor.ts`: `DEFAULT_TTL_MS` exported;
- `src/core/sweep/chunk.ts`: `ENUM_TTL_MS` exported.

No lifetime, key, stamp or lookup rule changed. The stale flag, the >30,000-code
guard on the enumeration and the manifest version check are untouched.

## 7. Verification

```
npx vitest run tests/cache-freshness-audit.test.ts   # 6 passed
npm run verify                                       # counts recorded in the PR digest
```

## 8. Next action

Owner/oversight acceptance on #77. If accepted, the no-change close records this
measurement and the replay. F1 and F2 are the two follow-ups worth a decision:
a detector for a stale stamp, and a vintage in the enumeration key. Neither is
implemented here, because neither is what this issue's acceptance measured.
