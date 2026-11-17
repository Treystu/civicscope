/**
 * Live Jev stage gates.
 *
 * K2 (2026-11-13) settles that the judge runs live as stage gates rather than
 * as one end-of-run verdict. The stages are the seams the run already has:
 * intent, evidence and answer. This module owns the questions, the closed
 * verdict enums, and the judge seam.
 *
 * Honesty rules, all structural:
 *   - `unavailable` is a first-class outcome and is never rendered as `pass`.
 *     No key, no answer and a transport error all produce `unavailable`, so an
 *     unconfigured judge degrades honestly instead of looking green.
 *   - The transport takes the key as an argument. It has no default, no
 *     fallback, and never logs the key or a provider body.
 *   - One call carries all three questions: a run spends one judge call.
 *   - `stageGateSummary` carries closed enums and a model id only, so it can
 *     sit beside the diagnostics payload without widening what that surface
 *     can carry.
 */
export const STAGE_GATE_STAGES = ['intent', 'evidence', 'answer'] as const

export type StageGateStage = (typeof STAGE_GATE_STAGES)[number]

export const STAGE_GATE_STATUSES = ['pass', 'fail', 'unavailable'] as const

export type StageGateStatus = (typeof STAGE_GATE_STATUSES)[number]

/** The model alias the gate and this seam share. Resolved to jev-1.14.0. */
export const JEV_MODEL = 'jev-latest'

/** A stage passes at or above this probability. Indeterminate fails closed. */
export const STAGE_GATE_THRESHOLD = 0.5

export interface StageQuestion {
  /**
   * The provider's question kind. Measured 2026-11-14: omitting it makes the
   * request 400 in milliseconds, so every stage question carries it and the
   * seam's type makes it impossible to forget.
   */
  type: 'noul'
  instructions: string
  criteria: { true: string; false: string }
}

export const STAGE_QUESTIONS: Readonly<Record<StageGateStage, StageQuestion>> = {
  intent: {
    type: 'noul',
    instructions:
      'Does the parsed intent express the question the reader actually asked, including its geography and its measure?',
    criteria: {
      true: 'The parsed intent expresses the question asked.',
      false: 'The parsed intent drops or changes the measure, the geography, or the mode.',
    },
  },
  evidence: {
    type: 'noul',
    instructions:
      'Does every claim in the draft follow from the evidence class claimed for it: census_measured backed by a screened row, research_named named by the research, model_knowledge labelled as the model own?',
    criteria: {
      true: 'Every claim is supported at the class it claims.',
      false: 'At least one claim is presented at a stronger class than its evidence supports.',
    },
  },
  answer: {
    type: 'noul',
    instructions:
      'Is the assembled answer complete against the question asked, with every gap stated rather than silently dropped?',
    criteria: {
      true: 'The answer addresses the question and states its gaps.',
      false: 'Part of the question is unanswered without being named as a gap.',
    },
  },
}

export interface JudgeResponse {
  model?: string
  answers?: Record<string, { noul?: number } | undefined>
}

export interface JudgeRequest {
  model: string
  state: string
  questions: Record<string, StageQuestion>
}

/** The seam. Any judge implementation goes behind this; none is named here. */
export type JudgeTransport = (request: JudgeRequest) => Promise<JudgeResponse>

export interface StageGateVerdict {
  stage: StageGateStage
  status: StageGateStatus
  probability: number | null
  model: string | null
  detail: string
}

function verdictFor(
  stage: StageGateStage,
  response: JudgeResponse | null,
  detail: string,
): StageGateVerdict {
  const model = response?.model ?? null
  const raw = response?.answers?.[`stage_${stage}`]?.noul
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { stage, status: 'unavailable', probability: null, model, detail }
  }
  return {
    stage,
    status: raw >= STAGE_GATE_THRESHOLD ? 'pass' : 'fail',
    probability: raw,
    model,
    detail,
  }
}

/**
 * Runs the three stage gates. A missing transport is `unavailable` for every
 * stage rather than an exception: a run without a judge is a run whose stage
 * verdicts were not obtained, which is exactly what it reports.
 */
export async function runStageGates(input: {
  state: string
  transport: JudgeTransport | null
}): Promise<StageGateVerdict[]> {
  if (!input.transport) {
    return STAGE_GATE_STAGES.map((stage) => ({
      stage,
      status: 'unavailable',
      probability: null,
      model: null,
      detail: 'no judge transport configured',
    }))
  }

  const questions: Record<string, StageQuestion> = {}
  for (const stage of STAGE_GATE_STAGES) questions[`stage_${stage}`] = STAGE_QUESTIONS[stage]

  let response: JudgeResponse | null = null
  let failure = ''
  try {
    response = await input.transport({ model: JEV_MODEL, state: input.state, questions })
  } catch (err) {
    failure = `judge transport failed: ${String((err as Error).message ?? err).slice(0, 200)}`
  }

  return STAGE_GATE_STAGES.map((stage) =>
    verdictFor(stage, response, failure || 'no answer for this stage'),
  )
}

export interface StageGateSummary {
  ran: boolean
  model: string | null
  stages: Record<StageGateStage, StageGateStatus>
}

/**
 * Diagnostics-shaped summary: closed enums and a model id only. No question
 * text, no provider body, no key, nothing per-visitor.
 */
export function stageGateSummary(verdicts: readonly StageGateVerdict[]): StageGateSummary {
  const stages = {} as Record<StageGateStage, StageGateStatus>
  for (const stage of STAGE_GATE_STAGES) stages[stage] = 'unavailable'
  let model: string | null = null
  let ran = false
  for (const v of verdicts) {
    stages[v.stage] = v.status
    if (v.status !== 'unavailable') ran = true
    if (v.model) model = v.model
  }
  return { ran, model, stages }
}

/**
 * The live implementation. The key is passed in by the caller and is never
 * defaulted, logged or stored; the provider's own model string is returned so
 * a run can record which model actually answered.
 */
export function createLiveJudgeTransport(options: {
  apiKey: string
  endpoint?: string
  fetchImpl?: typeof fetch
}): JudgeTransport {
  const endpoint = options.endpoint ?? 'https://api.typesafe.ai/v1/systemone'
  const doFetch = options.fetchImpl ?? fetch
  return async (request) => {
    if (!options.apiKey) throw new Error('no key configured for the judge transport')
    const res = await doFetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as JudgeResponse
    return { model: body.model, answers: body.answers }
  }
}
