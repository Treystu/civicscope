/**
 * The placeless screen's cases, chosen for its rules.
 *
 * The refusals matter more than the answers: a screen that answers too much is the
 * one that can be talked into ranking places or characterising residents, so most
 * of these cases are about what it must not do.
 */
import { describe, expect, it } from 'vitest'

import { screenNationalQuestion, namedPlace } from './national-screen'

describe('answering a placeless question', () => {
  it('answers a rent-burden question with the burden figure, not rent itself', () => {
    const decision = screenNationalQuestion('what is the rent burden nationally')
    expect(decision.decision).toBe('answer_national')
    if (decision.decision !== 'answer_national') return
    expect(decision.figures.map((f) => f.key)).toEqual(['median_rent_burden_pct'])
    expect(decision.figures[0]!.why).toBeTruthy()
    expect(decision.note).toContain('median')
  })

  it('answers a rent question with the rent figure', () => {
    const decision = screenNationalQuestion('how much is rent')
    if (decision.decision !== 'answer_national') throw new Error('expected an answer')
    expect(decision.figures.map((f) => f.key)).toEqual(['median_gross_rent'])
  })

  it('prefers household size to a count of households for "average household"', () => {
    const decision = screenNationalQuestion('what is the average household')
    if (decision.decision !== 'answer_national') throw new Error('expected an answer')
    // And only that figure: the count of households is a different question.
    expect(decision.figures.map((f) => f.key)).toEqual(['average_household_size'])
  })

  it('carries every figure a question names, without duplicates', () => {
    const decision = screenNationalQuestion('how do rent burden and income compare')
    if (decision.decision !== 'answer_national') throw new Error('expected an answer')
    const keys = decision.figures.map((f) => f.key)
    expect(keys).toContain('median_rent_burden_pct')
    expect(keys).toContain('median_household_income')
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('matches the way people ask rather than the registry labels', () => {
    // The label is "Households with no internet access"; nobody asks that.
    const decision = screenNationalQuestion('how many people have no internet')
    if (decision.decision !== 'answer_national') throw new Error('expected an answer')
    // "how many people" is the generic population rule; the specific figure wins.
    expect(decision.figures.map((f) => f.key)).toEqual(['no_internet_access'])
  })

  it('is case- and spacing-insensitive', () => {
    const spaced = screenNationalQuestion('  Rent   BURDEN   nationally ')
    expect(spaced.decision).toBe('answer_national')
  })
})

describe('refusing to rank', () => {
  const asks = [
    'which state is best',
    'where is the safest place to live',
    'should i move to a cheap city',
    'rank cities by rent',
    'what are the top 10 areas for renters',
    'recommend a good place for a family',
  ]
  for (const question of asks) {
    it(`refuses: ${question}`, () => {
      const decision = screenNationalQuestion(question)
      expect(decision.decision).toBe('refuse')
      if (decision.decision !== 'refuse') return
      expect(decision.refusal).toBe('steering')
      expect(decision.reason).toContain('steering')
    })
  }
})

describe('refusing protected-class characterisation', () => {
  const asks = [
    'what is the racial makeup of this area',
    'which areas have the most immigrants',
    'where do people with disabilities live',
    'what religion is most common here',
  ]
  for (const question of asks) {
    it(`refuses: ${question}`, () => {
      const decision = screenNationalQuestion(question)
      expect(decision.decision).toBe('refuse')
      if (decision.decision !== 'refuse') return
      expect(decision.refusal).toBe('protected_class')
    })
  }
})

describe('refusing what the registry does not publish', () => {
  it('refuses an empty question rather than answering the first figure it finds', () => {
    const decision = screenNationalQuestion('   ')
    expect(decision.decision).toBe('refuse')
    if (decision.decision === 'refuse') expect(decision.refusal).toBe('not_in_registry')
  })

  it('refuses a question about something no figure covers', () => {
    const decision = screenNationalQuestion('how tall is the tallest building')
    expect(decision.decision).toBe('refuse')
    if (decision.decision === 'refuse') expect(decision.refusal).toBe('not_in_registry')
  })
})

describe('deferring when a place is named', () => {
  it('defers on a ZIP code', () => {
    const decision = screenNationalQuestion('what is the rent burden in 78701')
    expect(decision).toEqual({ decision: 'has_place', place: '78701' })
  })

  it('defers on a state name, matched as a word', () => {
    expect(namedPlace('how many renters are in Texas')).toBe('Texas')
    const decision = screenNationalQuestion('rent burden in Puerto Rico')
    expect(decision).toEqual({ decision: 'has_place', place: 'Puerto Rico' })
  })

  it('does not read a state name out of a longer word', () => {
    // "Indiana" inside nothing, but "Ohio" inside "Ohioans" must not count.
    expect(namedPlace('how many ohioans rent')).toBeNull()
  })

  it('does not guess a city from a preposition', () => {
    expect(namedPlace('how many renters are in Austin')).toBeNull()
  })
})
