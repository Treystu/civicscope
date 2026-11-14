/**
 * Voice logic cases. Most of them are about what must be refused: the module exists
 * so that consent is never assumed and a misheard fragment never becomes a search.
 */
import { describe, expect, it } from 'vitest'

import {
  assessTranscript,
  consentStep,
  mayListen,
  spokenNumber,
  spokenZip,
  type ConsentState,
} from './mic'

describe('consent', () => {
  it('starts idle and cannot listen', () => {
    expect(mayListen('idle')).toBe(false)
  })

  it('reaches granted only through an explicit allow', () => {
    expect(consentStep('idle', 'ask')).toEqual({ ok: true, state: 'requested' })
    expect(consentStep('requested', 'allow')).toEqual({ ok: true, state: 'granted' })
    expect(mayListen('granted')).toBe(true)
  })

  it('refuses to grant from idle, so no render can grant itself', () => {
    const result = consentStep('idle', 'allow')
    expect(result.ok).toBe(false)
    expect(result.state).toBe('idle')
    if (!result.ok) expect(result.reason).toContain('cannot allow')
  })

  it('keeps a denial until the reader resets it', () => {
    expect(consentStep('requested', 'decline')).toEqual({ ok: true, state: 'denied' })
    // A later ask does not re-prompt a reader who said no.
    expect(consentStep('denied', 'ask').ok).toBe(false)
    expect(consentStep('denied', 'reset')).toEqual({ ok: true, state: 'idle' })
  })

  it('cannot decline before being asked', () => {
    expect(consentStep('idle', 'decline').ok).toBe(false)
  })
})

describe('transcript assessment', () => {
  it('accepts a real question', () => {
    const verdict = assessTranscript('what is the rent burden')
    expect(verdict.usable).toBe(true)
    if (verdict.usable) expect(verdict.words).toBe(5)
  })

  it('refuses silence', () => {
    const verdict = assessTranscript('   ')
    expect(verdict.usable).toBe(false)
    if (!verdict.usable) expect(verdict.problem).toBe('empty')
  })

  it('refuses a single word as a misheard fragment', () => {
    const verdict = assessTranscript('rent')
    expect(verdict.usable).toBe(false)
    if (!verdict.usable) expect(verdict.problem).toBe('too_short')
  })

  it('refuses pure filler', () => {
    const verdict = assessTranscript('um uh okay so')
    expect(verdict.usable).toBe(false)
    if (!verdict.usable) expect(verdict.problem).toBe('filler_only')
  })

  it('refuses a paragraph read aloud', () => {
    const verdict = assessTranscript(new Array(80).fill('rent').join(' '))
    expect(verdict.usable).toBe(false)
    if (!verdict.usable) expect(verdict.problem).toBe('too_long')
  })

  it('strips punctuation and collapses spacing', () => {
    const verdict = assessTranscript('  What is   the rent burden? ')
    expect(verdict.usable).toBe(true)
    if (verdict.usable) expect(verdict.text).toBe('What is the rent burden?')
  })
})

describe('spoken numbers', () => {
  it('reads a number said as words', () => {
    expect(spokenNumber('one hundred twenty thousand')).toEqual({
      ok: true,
      value: 120_000,
      unit: null,
    })
  })

  it('carries a spoken unit', () => {
    expect(spokenNumber('forty percent')).toEqual({ ok: true, value: 40, unit: '%' })
  })

  it('reads digits said one at a time', () => {
    const result = spokenNumber('seven eight seven zero one')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe(78701)
  })

  it('refuses words that are not a number', () => {
    const result = spokenNumber('rent burden')
    expect(result.ok).toBe(false)
  })

  it('refuses a scale word with nothing before it', () => {
    expect(spokenNumber('thousand').ok).toBe(false)
  })
})

describe('spoken ZIP codes', () => {
  it('accepts five digits said as a number', () => {
    expect(spokenZip('78701')).toEqual({ ok: true, zip: '78701' })
  })

  it('accepts five digits said one at a time', () => {
    expect(spokenZip('seven eight seven oh one')).toEqual({ ok: true, zip: '78701' })
  })

  it('refuses four digits rather than padding them into a place', () => {
    const result = spokenZip('nine zero one')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.detail).toContain('3 digits')
  })

  it('refuses when no digits were spoken', () => {
    const result = spokenZip('rent burden in san juan')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.detail).toContain('no digits')
  })
})

describe('the states the module is allowed to be in', () => {
  it('has exactly the four consent states', () => {
    const states: ConsentState[] = ['idle', 'requested', 'granted', 'denied']
    expect(states.map((state) => mayListen(state))).toEqual([false, false, true, false])
  })
})
