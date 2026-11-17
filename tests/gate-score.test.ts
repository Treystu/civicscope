import { describe, expect, it } from 'vitest'
import { DEFAULT_THRESHOLD, decideGate } from '../tools/gate-score.mjs'

/*
 * These pin the two reporting defects found in the gate on 2026-11-10, so the
 * instrument cannot silently go back to a number nobody measured:
 *
 *   - a keyless run reported 100/100 and "GATE PASSED" for a criterion it never
 *     measured (100 is the maximum score; every CI run is keyless);
 *   - a failing deterministic layer reported 98.9 instead of the score it had
 *     measured, and a semantic *error* reported 0.
 *
 * The threshold and which runs pass are deliberately unchanged. What is asserted
 * here is only that the reported number is one the run actually measured.
 */

const ok = (label: string) => ({ ok: true, label })
const bad = (label: string) => ({ ok: false, label })

describe('gate decision: what a failing run reports', () => {
  it('reads a failing deterministic layer as failing even when the semantic score is high', () => {
    const d = decideGate({ deterministic: [ok('a'), bad('b')], jev: { score: 99.6 } })
    expect(d.deterministicOk).toBe(false)
    expect(d.passed).toBe(false)
    expect(d.verdict).toBe('FAILED')
    // The measured score, not the 98.9 the old expression substituted.
    expect(d.overall).toBe(99.6)
    expect(d.reason).toContain('1/2 deterministic checks passed')
  })

  it('passes when every check passes and the score meets the threshold', () => {
    const d = decideGate({ deterministic: [ok('a'), ok('b')], jev: { score: 99.6 } })
    expect(d.passed).toBe(true)
    expect(d.overall).toBe(99.6)
  })

  it('counts only a strict boolean pass, so a falsy detail is not a pass', () => {
    const d = decideGate({ deterministic: [ok('a'), { label: 'b', ok: undefined }] as never, jev: null })
    expect(d.deterministicOk).toBe(false)
    expect(d.checksPassed).toBe(1)
  })

  it('refuses to pass a run that measured no checks at all', () => {
    const d = decideGate({ deterministic: [], jev: { score: 100 } })
    expect(d.deterministicOk).toBe(false)
    expect(d.passed).toBe(false)
  })
})

describe('gate decision: an unmeasured criterion is never reported as a score', () => {
  it('reports a keyless run as skipped with no overall score', () => {
    const d = decideGate({ deterministic: [ok('a')], jev: null })
    expect(d.semantic).toBe('skipped')
    expect(d.overall).toBeNull()
    expect(d.thresholdMet).toBeNull()
    // The pass semantics of a deterministic-only run are unchanged.
    expect(d.passed).toBe(true)
    expect(d.reason).toContain('not measured')
  })

  it('reports a semantic error as unmeasured rather than as 0', () => {
    const d = decideGate({ deterministic: [ok('a')], jev: { error: 'HTTP 503' } })
    expect(d.semantic).toBe('error')
    expect(d.overall).toBeNull()
    expect(d.passed).toBe(false)
    expect(d.reason).toContain('HTTP 503')
  })

  it('treats a present-but-unscored result as unmeasured, not as a zero', () => {
    const d = decideGate({ deterministic: [ok('a')], jev: {} })
    expect(d.semantic).toBe('error')
    expect(d.overall).toBeNull()
    expect(d.passed).toBe(false)
  })

  it('rejects a non-finite score instead of averaging it in', () => {
    const d = decideGate({ deterministic: [ok('a')], jev: { score: Number.NaN } })
    expect(d.overall).toBeNull()
    expect(d.passed).toBe(false)
  })
})

describe('gate decision: the 99 threshold is unchanged', () => {
  it('defaults to 99 and applies it exactly', () => {
    expect(DEFAULT_THRESHOLD).toBe(99)
    expect(decideGate({ deterministic: [ok('a')], jev: { score: 98.9 } }).passed).toBe(false)
    expect(decideGate({ deterministic: [ok('a')], jev: { score: 99 } }).passed).toBe(true)
  })

  it('does not let a passing deterministic layer carry a failing score', () => {
    const d = decideGate({ deterministic: [ok('a')], jev: { score: 79.1 } })
    expect(d.passed).toBe(false)
    expect(d.overall).toBe(79.1)
    expect(d.thresholdMet).toBe(false)
  })
})
