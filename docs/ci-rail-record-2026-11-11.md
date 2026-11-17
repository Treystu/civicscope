# The rail, read at head `e5d4a6c`: three named jobs, and one settled failure

Earlier handoffs on this lane said "no CircleCI token on this surface, so no fresh
named check-run was read". That was true of authenticated calls and false as a
conclusion: the rail is readable unauthenticated for this project, and the reading was
one HTTP request away the whole time. This note corrects the record and states what the
rail actually returned at the head that PR #66 carries.

## How it was read

- Workflow and job list: `GET https://circleci.com/api/v2/workflow/<workflow-id>/job`
  (no token; public project).
- Per-job detail and step status: `GET https://circleci.com/api/v1.1/project/github/Treystu/civicscope/<job-number>`
  (no token).
- The failed step's console: the `output_url` on the failed action in that same v1.1
  payload (a presigned link; no token).

The CircleCI jobs are the rail per `PROMPT.md`; the GitHub Actions mirror is a billing
lock and carries no verdict.

## What the rail returned at `e5d4a6c`

Workflow `f729e581`, pipeline 63, three jobs:

| Job | Number | Status | Window |
| --- | --- | --- | --- |
| `verify` | 189 | success | 10:30:24 - 10:31:23 |
| `live-contracts` | 187 | success | 10:30:39 - 10:31:54 |
| `completion-gate` | 188 | **failed** | 10:29:33 - 10:38:11 |

The `completion-gate` console, in full where it matters:

```
[1/4] typecheck + build ...                         PASS
[2/4] unit + security tests ...                     PASS
[3/4] live API contracts ...                        PASS
[4/4] WCAG 2.2 AA audit (axe-core, real browser) ... PASS

Deterministic  101/101
Jev: jev-1.14.0 - 9639 in / 134 out
Jev semantic review  score 78.9/100  (threshold 99)
  requirements_met (scored) = 0.902 (14/14 clauses)
  clause_7 noul=0.58, clause_11 noul=0.80
Overall: 78.9/100
GATE FAILED
  semantic score 78.9 against the 99 threshold
```

Every deterministic check passes. The only failing criterion is the semantic one, and
the lowest scored clause is again `clause_7`, whose text is frozen and reserved to the
instrument's owner. This is the settled state of the project, now measured on the keyed
CI channel at the exact head rather than inferred from a local run.

## Three readings of the same instrument, at three heads

| Head | Channel | Deterministic | Semantic |
| --- | --- | --- | --- |
| `df2dca6` | local, keyed | 101/101 | 79 |
| `bc039b9` | local, keyed | 101/101 | 78.7 |
| `e5d4a6c` | **CircleCI job 188** | **101/101** | **78.9** |

Three runs, spread of 0.3 points, same deterministic result. The variance is the
instrument's noise floor and not progress in either direction; the note in
`docs/gate-run-2026-11-11.md` says the same thing from the local side.

## What this changes

- The lane's rail claim is now a named check at an exact head: job 189, job 187 and job
  188 on `e5d4a6c`, with the failing job's own console quoted.
- The merge question has a precise shape. `verify` and `live-contracts` are green at the
  head; `completion-gate` fails on exactly one criterion, and that criterion is the
  clause text the owner froze. Nothing the lane can change turns that job green without
  rewording product text for a score, which `PROMPT.md` forbids.
- It does not change the merge authorisation. `PROMPT.md` makes merging the lane's job
  "once proof is filed and gates pass"; proof is now filed, and the gate does not pass.
  The remaining step is the owner's decision about the frozen clause, named once on #79.
