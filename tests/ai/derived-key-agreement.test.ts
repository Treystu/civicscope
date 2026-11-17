/**
 * The derived-figure key the validator accepts must be the key a derivation
 * actually emits, and it must keep the unit its name declares.
 *
 * This is the tenant-compare divergence, reproduced and then pinned. Two things
 * were true at once before this file existed:
 *
 * 1. `intent-schema.ts` accepted exactly one derived key, `derived:renter_pct`,
 *    and nothing in the tree produced a derivation with that name - callers pass
 *    their own, and the arithmetic suite passes `renter_share`.
 * 2. Renaming the accepted key to the callers' convention is not a fix either.
 *    `validator.ts` decides whether a figure can source a percent claim by reading
 *    `pct|percent` out of the key, so `derived:renter_share` stops being a percent
 *    source and a sentence like "the renter share is 42 percent" fails to validate.
 *    The first attempt at this fix did exactly that and the rail caught it in two
 *    validator cases.
 *
 * So the canonical name keeps its unit, lives next to the arithmetic that
 * produces it, and is read by the validator's allowlist. These assertions pin all
 * three properties at once, which is the only form that would have caught either
 * half of the split on its own.
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

  it('the canonical name declares its unit, so a percent claim can cite it', () => {
    // The unit is in the name on purpose: validator.ts's isPercentKey reads
    // pct|percent from the key to decide whether a figure may source a percent.
    expect(RENTER_SHARE_KEY).toMatch(/pct|percent/i)
    const share = deriveShare(RENTER_SHARE_NAME, RENTERS, HOUSEHOLDS)
    expect(share.value).toBeCloseTo(40, 5)
  })

  it('refuses a share-named variant, because it would lose the unit', () => {
    expect(isKnownFigureKey('derived:renter_share')).toBe(false)
  })

  it('keeps the closed set closed rather than accepting any derived name', () => {
    expect(isKnownFigureKey('derived:anything')).toBe(false)
    expect(isKnownFigureKey('derived:')).toBe(false)
    expect(isKnownFigureKey('renter_pct')).toBe(false)
  })
})
