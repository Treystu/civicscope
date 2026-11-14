/**
 * The arithmetic cases, chosen for the rules rather than for sample values.
 *
 * Every case here is a rule the module must obey - an MOE combination, an
 * inadmissible denominator, a statement that disagrees with its support - because
 * a test that only pins one sum's digits would pass while the rules drifted.
 */
import { describe, expect, it } from 'vitest'

import {
  checkStated,
  deriveDifference,
  derivePercentChange,
  deriveShare,
  deriveSum,
  isDerivedKey,
  toValidatorFigure,
  type ArithmeticInput,
} from './arithmetic-check'

const households: ArithmeticInput = { key: 'households', value: 1000, marginOfError: 30 }
const renters: ArithmeticInput = { key: 'renters', value: 400, marginOfError: 20 }
const owners: ArithmeticInput = { key: 'owners', value: 600, marginOfError: 25 }
const exact: ArithmeticInput = { key: 'count_exact', value: 4 }

describe('derived keys', () => {
  it('marks every computed figure with the prefix the validator looks for', () => {
    expect(deriveSum('households_total', [renters, owners]).key).toBe('derived:households_total')
    expect(isDerivedKey('derived:anything')).toBe(true)
    expect(isDerivedKey('median_rent')).toBe(false)
  })
})

describe('sums', () => {
  it('adds the parts and combines their margins by root sum of squares', () => {
    const sum = deriveSum('tenure_total', [renters, owners])
    expect(sum.value).toBe(1000)
    expect(sum.marginOfError).toBeCloseTo(Math.sqrt(20 ** 2 + 25 ** 2), 10)
    expect(sum.inputs).toEqual(['renters', 'owners'])
    expect(sum.reason).toBeUndefined()
  })

  it('reports the total but refuses a margin when a part has none', () => {
    const sum = deriveSum('tenure_total', [renters, exact])
    expect(sum.value).toBe(404)
    expect(sum.marginOfError).toBeUndefined()
    expect(sum.reason).toContain('margin of error unknown for count_exact')
  })

  it('refuses the total when a part has no published estimate', () => {
    const sum = deriveSum('tenure_total', [renters, { key: 'unknown', value: null }])
    expect(sum.value).toBeNull()
    expect(sum.reason).toContain('no estimate for unknown')
  })

  it('refuses an empty sum rather than reporting zero', () => {
    const sum = deriveSum('tenure_total', [])
    expect(sum.value).toBeNull()
    expect(sum.reason).toContain('at least one part')
  })
})

describe('differences', () => {
  it('subtracts in the stated order, so "how many more" cannot reverse', () => {
    const gap = deriveDifference('renter_gap', owners, renters)
    expect(gap.value).toBe(200)
    expect(deriveDifference('renter_gap', renters, owners).value).toBe(-200)
    expect(gap.marginOfError).toBeCloseTo(Math.sqrt(25 ** 2 + 20 ** 2), 10)
  })

  it('refuses when either side is unpublished', () => {
    expect(deriveDifference('gap', renters, { key: 'none', value: null }).value).toBeNull()
  })
})

describe('shares', () => {
  it('uses the subset rule for a part of its own whole', () => {
    const share = deriveShare('renter_share', renters, households)
    expect(share.value).toBe(40)
    // sqrt(MOE_part^2 - p^2 * MOE_whole^2) / whole, as a percentage.
    const expected = (Math.sqrt(20 ** 2 - 0.4 ** 2 * 30 ** 2) / 1000) * 100
    expect(share.marginOfError).toBeCloseTo(expected, 10)
  })

  it('treats an exact count denominator as no additional uncertainty', () => {
    const share = deriveShare('share_of_exact', renters, { key: 'exact_total', value: 800 })
    expect(share.value).toBe(50)
    expect(share.marginOfError).toBeCloseTo((20 / 800) * 100, 10)
    expect(share.reason).toBeUndefined()
  })

  it('refuses the interval when the subset rule does not apply', () => {
    // A small numerator inside a noisy denominator: share^2 * MOE_whole^2 exceeds
    // MOE_part^2, the radicand is negative, and the published rule says the formula
    // cannot be used there rather than to clamp it to zero.
    const share = deriveShare(
      'odd_share',
      { key: 'part', value: 10, marginOfError: 0.5 },
      { key: 'noisy_whole', value: 1000, marginOfError: 400 },
    )
    expect(share.value).toBeCloseTo(1, 10)
    expect(share.marginOfError).toBeUndefined()
    expect(share.reason).toContain('subset margin-of-error rule does not apply')
  })

  it('refuses a zero whole instead of reporting an infinite share', () => {
    const share = deriveShare('share', renters, { key: 'empty', value: 0, marginOfError: 1 })
    expect(share.value).toBeNull()
    expect(share.reason).toContain('zero')
  })
})

describe('percentage change', () => {
  it('uses the ratio rule for two independent estimates', () => {
    const change = derivePercentChange('rent_change', { key: 'a', value: 200, marginOfError: 10 }, {
      key: 'b',
      value: 250,
      marginOfError: 12,
    })
    expect(change.value).toBeCloseTo(25, 10)
    const ratio = 250 / 200
    const expected = (Math.sqrt(12 ** 2 + ratio ** 2 * 10 ** 2) / 200) * 100
    expect(change.marginOfError).toBeCloseTo(expected, 10)
  })

  it('refuses a change from zero, which has no percentage', () => {
    const change = derivePercentChange('change', { key: 'a', value: 0, marginOfError: 1 }, {
      key: 'b',
      value: 5,
      marginOfError: 1,
    })
    expect(change.value).toBeNull()
    expect(change.reason).toContain('zero')
  })
})

describe('checking a stated figure', () => {
  it('accepts a figure that agrees at the displayed precision', () => {
    const share = deriveShare('renter_share', renters, households)
    expect(checkStated(40, share)).toEqual({ pass: true })
    expect(checkStated(40.04, share)).toEqual({ pass: true })
  })

  it('refuses a figure that disagrees, and says what the figures give', () => {
    const share = deriveShare('renter_share', renters, households)
    const verdict = checkStated(41, share)
    expect(verdict.pass).toBe(false)
    if (!verdict.pass) {
      expect(verdict.failure).toBe('stated_mismatch')
      expect(verdict.detail).toContain('40')
    }
  })

  it('fails closed when there is no derivation to check against', () => {
    const share = deriveShare('share', renters, { key: 'empty', value: 0, marginOfError: 1 })
    const verdict = checkStated(0, share)
    expect(verdict.pass).toBe(false)
    if (!verdict.pass) expect(verdict.failure).toBe('derived_absent')
  })

  it('takes a caller-supplied tolerance for a coarser display', () => {
    const share = deriveShare('renter_share', renters, households)
    expect(checkStated(40.4, share).pass).toBe(false)
    expect(checkStated(40.4, share, 0.5).pass).toBe(true)
  })
})

describe('handing a derivation to the validator', () => {
  it('drops a derivation with no value rather than passing a null figure', () => {
    expect(toValidatorFigure(deriveSum('none', [{ key: 'x', value: null }]))).toBeNull()
  })

  it('carries the margin of error when there is one, and omits it when unknown', () => {
    const withMoe = toValidatorFigure(deriveSum('total', [renters, owners]))
    expect(withMoe).not.toBeNull()
    expect(withMoe!.marginOfError).toBeCloseTo(Math.sqrt(20 ** 2 + 25 ** 2), 10)

    const withoutMoe = toValidatorFigure(deriveSum('total', [renters, exact]))
    expect(withoutMoe).not.toBeNull()
    expect('marginOfError' in withoutMoe!).toBe(false)
  })
})
