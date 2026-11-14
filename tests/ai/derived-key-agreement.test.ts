/**
 * The derived-figure key the validator accepts must be the key the arithmetic
 * actually emits.
 *
 * This is the tenant-compare divergence, reproduced and then pinned. The
 * validator's closed set named `derived:renter_pct`, which nothing in the tree
 * produced; `deriveShare` names its output from the caller and the arithmetic
 * suite passes `renter_share`. So the two halves of one feature disagreed about
 * the name of the same figure, and a caller wiring them together would have been
 * refused as "unknown figure key" for a reason unrelated to the arithmetic.
 *
 * A test that only checks either side in isolation cannot see this. This one
 * derives a share with the same call the feature would use and then asks the
 * validator's own predicate about the result.
 */
import { describe, expect, it } from 'vitest'

import {
  deriveShare,
  RENTER_SHARE_KEY,
  RENTER_SHARE_NAME,
} from '../../src/core/ai/arithmetic-check'
import { isKnownFigureKey } from '../../src/core/ai/intent-schema'

const RENTERS = { key: 'renter_occupied', value: 400, marginOfError: 40 }
const HOUSEHOLDS = { key: 'households', value: 1000, marginOfError: 60 }

describe('derived figure keys agree with the derivation that produces them', () => {
  it('the tenant share the arithmetic emits is a key the validator knows', () => {
    const share = deriveShare(RENTER_SHARE_NAME, RENTERS, HOUSEHOLDS)
    expect(share.key).toBe(RENTER_SHARE_KEY)
    expect(Number.isFinite(share.value)).toBe(true)
    expect(isKnownFigureKey(share.key)).toBe(true)
  })

  it('is the key the rendered sentence can cite', () => {
    // The compare path shows a tenant share and then validates the prose that
    // names it; an accepted key with no producer, or a producer with no
    // accepted key, breaks that pair in whichever direction it is wired.
    const share = deriveShare(RENTER_SHARE_NAME, RENTERS, HOUSEHOLDS)
    expect(share.value).toBeCloseTo(40, 5)
    expect(isKnownFigureKey(share.key)).toBe(true)
  })

  it('no longer accepts a name nothing emits', () => {
    expect(isKnownFigureKey('derived:renter_pct')).toBe(false)
  })

  it('keeps the closed set closed rather than accepting any derived name', () => {
    expect(isKnownFigureKey('derived:anything')).toBe(false)
    expect(isKnownFigureKey('derived:')).toBe(false)
    expect(isKnownFigureKey('renter_share')).toBe(false)
  })
})
