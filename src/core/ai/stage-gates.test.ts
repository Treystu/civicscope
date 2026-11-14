import { describe, expect, it } from 'vitest'
import {
  JEV_MODEL,
  STAGE_GATE_STAGES,
  STAGE_GATE_THRESHOLD,
  STAGE_QUESTIONS,
  createLiveJudgeTransport,
  runStageGates,
  stageGateSummary,
  type JudgeRequest,
} from './stage-gates'

describe('stage gates without a judge', () => {
  it('reports unavailable for every stage rather than pass', async () => {
    const verdicts = await runStageGates({ state: 'anything', transport: null })
    expect(verdicts).toHaveLength(STAGE_GATE_STAGES.length)
    for (const v of verdicts) {
      expect(v.status).toBe('unavailable')
      expect(v.probability).toBeNull()
      expect(v.model).toBeNull()
    }
    const summary = stageGateSummary(verdicts)
    expect(summary.ran).toBe(false)
    expect(summary.stages).toEqual({
      intent: 'unavailable',
      evidence: 'unavailable',
      answer: 'unavailable',
    })
  })
})

describe('stage gates with a judge', () => {
  it('asks one call for all three stages under the shared model alias', async () => {
    let seen: JudgeRequest | null = null
    const verdicts = await runStageGates({
      state: 'a state',
      transport: async (req) => {
        seen = req
        return {
          model: 'jev-1.14.0',
          answers: {
            stage_intent: { noul: 0.93 },
            stage_evidence: { noul: 0.91 },
            stage_answer: { noul: 0.88 },
          },
        }
      },
    })
    expect(seen).not.toBeNull()
    expect(seen!.model).toBe(JEV_MODEL)
    expect(Object.keys(seen!.questions).sort()).toEqual([
      'stage_answer',
      'stage_evidence',
      'stage_intent',
    ])
    expect(verdicts.map((v) => v.status)).toEqual(['pass', 'pass', 'pass'])
    expect(verdicts[0]?.model).toBe('jev-1.14.0')
  })

  it('fails a stage below the threshold and passes one exactly on it', async () => {
    const verdicts = await runStageGates({
      state: 'a state',
      transport: async () => ({
        model: 'jev-1.14.0',
        answers: {
          stage_intent: { noul: STAGE_GATE_THRESHOLD },
          stage_evidence: { noul: STAGE_GATE_THRESHOLD - 0.01 },
          stage_answer: { noul: 0.99 },
        },
      }),
    })
    expect(verdicts[0]?.status).toBe('pass')
    expect(verdicts[1]?.status).toBe('fail')
    expect(verdicts[2]?.status).toBe('pass')
  })

  it('reports unavailable for a stage the judge did not answer', async () => {
    const verdicts = await runStageGates({
      state: 'a state',
      transport: async () => ({ model: 'jev-1.14.0', answers: { stage_intent: { noul: 0.9 } } }),
    })
    expect(verdicts[0]?.status).toBe('pass')
    expect(verdicts[1]?.status).toBe('unavailable')
    expect(verdicts[2]?.status).toBe('unavailable')
  })

  it('degrades to unavailable when the transport throws', async () => {
    const verdicts = await runStageGates({
      state: 'a state',
      transport: async () => {
        throw new Error('boom')
      },
    })
    for (const v of verdicts) {
      expect(v.status).toBe('unavailable')
      expect(v.detail).toContain('judge transport failed')
    }
  })

  it('keeps the summary to closed enums and a model id', async () => {
    const verdicts = await runStageGates({
      state: 'a state',
      transport: async () => ({
        model: 'jev-1.14.0',
        answers: { stage_intent: { noul: 0.9 }, stage_evidence: { noul: 0.2 } },
      }),
    })
    const summary = stageGateSummary(verdicts)
    expect(summary.ran).toBe(true)
    expect(summary.model).toBe('jev-1.14.0')
    expect(summary.stages).toEqual({
      intent: 'pass',
      evidence: 'fail',
      answer: 'unavailable',
    })
  })

  it('states every question as a closed true/false criterion', () => {
    for (const stage of STAGE_GATE_STAGES) {
      const q = STAGE_QUESTIONS[stage]
      expect(q.instructions.length).toBeGreaterThan(20)
      expect(q.criteria.true.length).toBeGreaterThan(10)
      expect(q.criteria.false.length).toBeGreaterThan(10)
    }
  })
})

describe('live transport', () => {
  it('refuses to run without a key rather than sending an empty one', async () => {
    const transport = createLiveJudgeTransport({ apiKey: '', fetchImpl: (async () => {
      throw new Error('should not be called')
    }) as unknown as typeof fetch })
    await expect(
      transport({ model: JEV_MODEL, state: 'x', questions: {} }),
    ).rejects.toThrow('no key configured')
  })

  it('sends the model alias and returns the provider model string', async () => {
    let body: unknown = null
    let auth = ''
    const transport = createLiveJudgeTransport({
      apiKey: 'test-only',
      fetchImpl: (async (_url: string, init: RequestInit) => {
        body = JSON.parse(String(init.body))
        auth = new Headers(init.headers).get('authorization') ?? ''
        return {
          ok: true,
          json: async () => ({ model: 'jev-1.14.0', answers: { stage_intent: { noul: 0.9 } } }),
        }
      }) as unknown as typeof fetch,
    })
    const res = await transport({ model: JEV_MODEL, state: 'x', questions: {} })
    expect(res.model).toBe('jev-1.14.0')
    expect((body as { model: string }).model).toBe(JEV_MODEL)
    expect(auth.startsWith('Bearer ')).toBe(true)
  })
})
