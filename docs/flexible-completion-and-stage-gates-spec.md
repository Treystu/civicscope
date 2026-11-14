# Flexible completion and live Jev stage gates: spec

Status: written spec-first, 2026-11-14, before the modules it describes were
written. Branch `lane/submission`. Governing decisions: K1, K2, K3 in
`dispatch/civicscope/PROMPT.md` (settled 2026-11-13).

This is **new code written to a recorded behaviour**, not a port of the
hackathon lineage's tree. The lineage (`musehackathon` at `9403faa`) is the
behavioural oracle: its `src/core/ai/flexible.ts` documents what the flexible
lane does and why, and its `jev-loop.ts` documents how a live judge is used mid
run. Nothing is copied from it, no file is transplanted, and no key or default
travels with the design.

## 1. Why a second lane exists

The strict lane is the default for every question the Census registry can
serve: parse the intent, screen, compose, validate in code, withhold on failure.
It has exactly one terminal it cannot answer — **research mismatch**: the
question parsed, the research named places for the reader's stated criteria, and
none of those names resolved to a Census place in the loaded data. The strict
answer there is an honest note and nothing more.

Flexible completion completes **that terminal and only that terminal**. Two
reasons are legal:

| Reason | Meaning |
| --- | --- |
| `empty_parse` | The parse produced no usable intent at all |
| `no_census_match` | An intent parsed, and the screened set contains zero places |

Everything else refuses to fall through: a provider failure keeps its own
failure note, a safety refusal stays a refusal, a Census screen that genuinely
found no matching place still says so, and a question the registry can serve
never reaches this lane. `fallThroughReason()` in
`src/core/ai/flexible.ts` is the single decision point, and it returns `null`
for every other shape.

## 2. Honesty is structural, not promissory

A flexible answer is a typed object, not prose with a disclaimer. Every figure
and every place carries an evidence class:

| Class | Label rendered beside it | Meaning |
| --- | --- | --- |
| `census_measured` | measured from the Census figures shown here | A screened row backs it, at exact equality |
| `research_named` | named by the cited research, not measured by Census | The cited research named it, and nothing else does |
| `model_knowledge` | the model's own knowledge, not verified against a source | The model's own knowledge, labelled as such |

`verifyFlexibleAnswer()` in `src/core/ai/flexible.ts` is the deterministic gate.
It refuses, in this order:

1. `empty_answer` — nothing to say.
2. `missing_evidence_class` / `unknown_evidence_class` — any figure or place
   without a class from the closed list.
3. `census_figure_not_screened` / `census_figure_not_equal` — a
   `census_measured` figure with no screened row, or one whose value differs
   from the screened row at any precision. The strict lane's exact-equality
   rule is unchanged.
4. `research_place_not_named` — a `research_named` place the research did not
   in fact name.
5. `validator_withheld` — the existing prose validator withholds the answer
   (invented numeral, precision claim wider than the MOE, banned construction).

A refusal does not render a trimmed answer. The strict lane's honest note stands
in its place, exactly as a withheld strict answer behaves. Fail-closed is the
whole point; a flexible lane that renders its best effort on a failed check
would be a worse product than the note it replaced.

## 3. Live Jev stage gates

K2 settles that Jev runs **live as stage gates**. The stages are the seams the
run already has:

| Stage | The question the judge is asked |
| --- | --- |
| `intent` | Does the parsed intent express the question the reader asked? |
| `evidence` | Does every claim in the draft follow from the evidence classes claimed for it? |
| `answer` | Is the assembled answer complete against the reader's question, with no gap silently dropped? |

`src/core/ai/stage-gates.ts` implements them against a **judge seam**, not
against a vendor:

- `JudgeTransport` is the seam. `createLiveJudgeTransport()` is the one live
  implementation: it posts to `https://api.typesafe.ai/v1/systemone` with
  `model: 'jev-latest'` and returns the provider's own `model` string and
  `answers`. The observed resolution is `jev-1.14.0`.
- The key is read from configuration by the caller and passed in. The transport
  never logs it, never stores it, and has no default or fallback value.
- Verdicts are per stage: `pass` (`noul >= 0.5`), `fail` (below), or
  `unavailable` (no transport, no answer, transport error). **`unavailable` is
  never rendered as `pass`.** An unconfigured judge degrades honestly, and the
  deterministic layers still run.
- One call carries all three questions, so a run spends one judge call, not
  three.
- `stageGateSummary()` returns closed enums and a model id only — no key, no
  question text, no provider body — so it can sit beside the diagnostics
  payload without widening what that surface can carry.

## 4. What is frozen

- The completion instrument (`tools/completion-gate.mjs`) and the 99 threshold
  are untouched. This spec adds no clause and edits no clause.
- Nothing here rewords product text to raise a score. The flexible lane's
  labels are chosen to be true of the behaviour, and the stage gates report
  what they measure.
- The `shared.ts` request shape (key server-side only; no bodies, queries, IPs
  or keys stored) is unchanged. The judge transport reads a key from the
  server's environment and sends no visitor content beyond what the stage
  question already contains.

## 5. How this is verified

Nothing is verified locally; the verdict is the CircleCI rail at the exact
head.

| Claim | Where its verdict comes from |
| --- | --- |
| Fall-through happens only on the two legal reasons | `src/core/ai/flexible.test.ts`, in `verify` |
| Evidence classes are structural and fail closed | same |
| Verdicts are honest when the judge is absent | `src/core/ai/stage-gates.test.ts`, in `verify` |
| The stage gates read a **live** judge and report its model | `src/live/jev-stage-gates.test.ts`, in `live-contracts`; it skips without a key and logs the model and verdicts it received |
| No deterministic regression | the completion gate's deterministic checks on the same run |

The live test is the evidence that the gates are live rather than fixture-fed:
its console line carries the model string the provider returned, which a
hardcoded value cannot produce.

## 6. What is not claimed

- **No screen calls either module yet.** The modules are the shared surface; the
  orchestration (draft, stage gates, render) belongs to the caller and is not
  part of this landing. The record says so rather than implying a visitor can
  reach a flexible answer today, exactly as S1 and S3 are recorded as landed
  modules with no call site.
- **No portal file was transplanted.** The lineage tree was read out of the git
  object store as a behavioural oracle only; nothing was copied, executed or
  checked out.
- **No key moved.** The live transport takes its key from the caller; the local
  probe reads the user-level configuration and prints only the model id.
