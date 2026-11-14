/**
 * Deterministic arithmetic for the answer lane: derived figures, and the check
 * that a stated one matches what the figures actually support.
 *
 * Why this module has to exist before an answer can state a percentage:
 * `validator.ts` fails closed on any numeral it cannot find in the supplied
 * figures, and it deliberately never computes one - "No numeral is ever computed
 * here from other figures. A derived percentage is allowed only when code
 * computed it elsewhere and passed it in as a figure (conventionally key
 * `derived:<name>`)", in its own header. Before this file nothing in this repo
 * produced a `derived:` figure for an answer, so every share, change and total
 * was unstatementable rather than wrong. This is the computation that makes them
 * statementable, and it is the check that catches one stated wrongly.
 *
 * Nothing here reads the network or asks a model. That is the whole point of the
 * I4 lane: when every provider is down, arithmetic still runs, so an answer can
 * be refused for the right reason rather than for a missing key.
 *
 * The margin-of-error rules are the Census Bureau's published ones, because every
 * figure this app holds carries an MOE and a derived figure handed over without
 * one would claim more precision than its inputs:
 *
 * - a sum or a difference: root sum of squares of the input MOEs;
 * - a share (a subset over its whole): sqrt(MOE_part^2 - share^2 * MOE_whole^2) / whole;
 * - a ratio of two independent estimates: sqrt(MOE_a^2 + ratio^2 * MOE_b^2) / b.
 *
 * The share formula is not universally applicable: when the part and the whole
 * are positively correlated the radicand can be negative, and the published rule
 * is that the formula cannot be used there. This module reports that as an absent
 * margin of error with the reason attached rather than inventing a number, and a
 * derivation without an MOE is not offered to the validator at all, because the
 * provenance contract is "a figure with its precision or nothing".
 */

/** A figure as the answer lane holds it, before any arithmetic. */
export interface ArithmeticInput {
  key: string
  /** The estimate, or null when the publisher publishes none. */
  value: number | null
  /** Census margin of error at 90% confidence, when the publisher gives one. */
  marginOfError?: number
}

/** A figure computed from other figures, never from prose. */
export interface Derivation {
  /** Always `derived:`-prefixed, which is the key the validator expects. */
  key: string
  /** The computed value, or null when the arithmetic is not admissible. */
  value: number | null
  /** The Census MOE of the computed value, when it is derivable. */
  marginOfError?: number
  /** The input keys, in the order they entered the arithmetic. */
  inputs: string[]
  /** Why `value` (or its margin of error) is absent. Present only when it is. */
  reason?: string
}

/** The prefix that marks a figure as computed here rather than published. */
export const DERIVED_PREFIX = 'derived:'

export function isDerivedKey(key: string): boolean {
  return key.startsWith(DERIVED_PREFIX)
}

/**
 * The canonical name and key for the tenant share this module derives.
 *
 * Why this constant exists: `intent-schema.ts` keeps a closed set of derived
 * figure keys the validator will accept, and until 2026-11-14 that set named
 * `derived:renter_pct` while `deriveShare` named its output from whatever the
 * caller passed - the arithmetic suite passes `renter_share`. So the accepted
 * name was one no code emitted, and the name the arithmetic emits was one the
 * validator refused as unknown. A caller wiring the two together would have
 * produced a figure that failed validation for a reason with nothing to do with
 * the arithmetic. Both sides now read the name from here, and a test pins them
 * against each other.
 */
export const RENTER_SHARE_NAME = 'renter_share'

export const RENTER_SHARE_KEY = `${DERIVED_PREFIX}${RENTER_SHARE_NAME}`

function derivedKey(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('a derived figure needs a name')
  return `${DERIVED_PREFIX}${trimmed}`
}

function usable(input: ArithmeticInput): boolean {
  return input.value !== null && Number.isFinite(input.value)
}

function hasMoe(input: ArithmeticInput): boolean {
  return usable(input) && typeof input.marginOfError === 'number' && Number.isFinite(input.marginOfError)
}

/** The absence, stated once so every caller reports it the same way. */
function absent(key: string, inputs: string[], reason: string): Derivation {
  return { key, value: null, inputs, reason }
}

/**
 * The MOE of a sum or difference: the root sum of squares.
 *
 * Census publishes a single rule for both directions, because a sum and a
 * difference of estimates have the same variance under the independence
 * assumption they make. An input without an MOE makes the result's MOE unknown
 * rather than zero: unknown precision is not the same claim as no uncertainty.
 */
function moeOfLinear(inputs: readonly ArithmeticInput[]): { moe?: number; reason?: string } {
  const missing = inputs.filter((input) => !hasMoe(input))
  if (missing.length) {
    return {
      reason: `margin of error unknown for ${missing.map((input) => input.key).join(', ')}`,
    }
  }
  const variance = inputs.reduce((total, input) => total + (input.marginOfError as number) ** 2, 0)
  return { moe: Math.sqrt(variance) }
}

/** Adds parts. A part with no published estimate makes the total unknown. */
export function deriveSum(name: string, parts: readonly ArithmeticInput[]): Derivation {
  const key = derivedKey(name)
  const inputs = parts.map((part) => part.key)
  if (!parts.length) return absent(key, inputs, 'a sum needs at least one part')
  const missing = parts.filter((part) => !usable(part))
  if (missing.length) {
    return absent(key, inputs, `no estimate for ${missing.map((part) => part.key).join(', ')}`)
  }
  const value = parts.reduce((total, part) => total + (part.value as number), 0)
  const { moe, reason } = moeOfLinear(parts)
  return reason ? { key, value, inputs, reason } : { key, value, marginOfError: moe, inputs }
}

/** Subtracts `b` from `a`, which is what a "how many more than" statement means. */
export function deriveDifference(name: string, a: ArithmeticInput, b: ArithmeticInput): Derivation {
  const key = derivedKey(name)
  const inputs = [a.key, b.key]
  if (!usable(a) || !usable(b)) {
    const missing = [a, b].filter((input) => !usable(input)).map((input) => input.key)
    return absent(key, inputs, `no estimate for ${missing.join(', ')}`)
  }
  const value = (a.value as number) - (b.value as number)
  const { moe, reason } = moeOfLinear([a, b])
  return reason ? { key, value, inputs, reason } : { key, value, marginOfError: moe, inputs }
}

/**
 * A share of a whole, as a percentage: the part and its denominator.
 *
 * The MOE rule is the subset one, not the ratio one, because a share of a total
 * has its numerator inside its denominator and the two are not independent. That
 * assumption is also what makes the rule inapplicable when it produces a negative
 * radicand - there the correlation the rule assumes does not hold, and the honest
 * report is an absent MOE with the reason, not a fabricated interval.
 */
export function deriveShare(name: string, part: ArithmeticInput, whole: ArithmeticInput): Derivation {
  const key = derivedKey(name)
  const inputs = [part.key, whole.key]
  if (!usable(part) || !usable(whole)) {
    const missing = [part, whole].filter((input) => !usable(input)).map((input) => input.key)
    return absent(key, inputs, `no estimate for ${missing.join(', ')}`)
  }
  const denominator = whole.value as number
  if (denominator === 0) return absent(key, inputs, `cannot divide by ${whole.key}, which is zero`)
  const share = (part.value as number) / denominator
  const value = share * 100

  if (!hasMoe(part)) {
    return {
      key,
      value,
      inputs,
      reason: `margin of error unknown for ${part.key}`,
    }
  }
  if (!hasMoe(whole)) {
    // A count denominator with no MOE is exact by definition, so the part's MOE
    // is the only uncertainty in the share.
    return { key, value, marginOfError: ((part.marginOfError as number) / denominator) * 100, inputs }
  }
  const radicand =
    (part.marginOfError as number) ** 2 - share ** 2 * (whole.marginOfError as number) ** 2
  if (radicand < 0) {
    return {
      key,
      value,
      inputs,
      reason:
        'the subset margin-of-error rule does not apply to these two estimates, so the share has no derivable interval',
    }
  }
  return { key, value, marginOfError: (Math.sqrt(radicand) / denominator) * 100, inputs }
}

/**
 * A percentage change between two estimates of the same thing.
 *
 * This is a ratio of independent estimates, so the ratio MOE rule applies and not
 * the subset one. A zero starting point has no percentage change - every answer to
 * "how much more than nothing" is infinite - so it is absent, not 100%.
 */
export function derivePercentChange(
  name: string,
  before: ArithmeticInput,
  after: ArithmeticInput,
): Derivation {
  const key = derivedKey(name)
  const inputs = [before.key, after.key]
  if (!usable(before) || !usable(after)) {
    const missing = [before, after].filter((input) => !usable(input)).map((input) => input.key)
    return absent(key, inputs, `no estimate for ${missing.join(', ')}`)
  }
  const base = before.value as number
  if (base === 0) return absent(key, inputs, `cannot measure a change from ${before.key}, which is zero`)
  const ratio = (after.value as number) / base
  const value = (ratio - 1) * 100

  if (!hasMoe(before) && !hasMoe(after)) {
    return { key, value, inputs, reason: `margin of error unknown for ${before.key}, ${after.key}` }
  }
  if (!hasMoe(after)) {
    return { key, value, inputs, reason: `margin of error unknown for ${after.key}` }
  }
  if (!hasMoe(before)) {
    return { key, value, inputs, reason: `margin of error unknown for ${before.key}` }
  }
  const variance =
    (after.marginOfError as number) ** 2 + ratio ** 2 * (before.marginOfError as number) ** 2
  return { key, value, marginOfError: (Math.sqrt(variance) / Math.abs(base)) * 100, inputs }
}

/** What the check concluded about a stated figure. */
export type ArithmeticVerdict =
  | { pass: true }
  | { pass: false; failure: 'derived_absent' | 'stated_mismatch'; detail: string }

/**
 * The tolerance for a stated figure, in the figure's own unit.
 *
 * A tenth of a percentage point, because the app's displayed precision is one
 * decimal: anything larger would let a real disagreement hide behind rounding,
 * and anything smaller would refuse a statement that is correct at the precision
 * the reader can see.
 */
export const STATED_TOLERANCE = 0.05

/**
 * Checks a figure the answer states against the derivation that supports it.
 *
 * This is the deterministic half of the validator's job, kept separate from it:
 * the validator asks "is this numeral one we supplied", and this asks "is the
 * numeral the one the arithmetic gives". A derivation with no value fails closed,
 * so an answer cannot state a share the figures do not support and cannot state
 * one with the wrong precision silently.
 */
export function checkStated(
  stated: number,
  derivation: Derivation,
  tolerance: number = STATED_TOLERANCE,
): ArithmeticVerdict {
  if (derivation.value === null) {
    return {
      pass: false,
      failure: 'derived_absent',
      detail: `${derivation.key} has no value${derivation.reason ? `: ${derivation.reason}` : ''}`,
    }
  }
  if (!Number.isFinite(stated)) {
    return { pass: false, failure: 'stated_mismatch', detail: 'the stated figure is not finite' }
  }
  const difference = Math.abs(stated - derivation.value)
  if (difference > tolerance) {
    return {
      pass: false,
      failure: 'stated_mismatch',
      detail: `${stated} was stated but the figures give ${Math.round(derivation.value * 1000) / 1000}`,
    }
  }
  return { pass: true }
}

/**
 * The shape `validator.ts` accepts, for handing a derivation over as a figure.
 *
 * Returns null when the derivation has no value, because a figure with no
 * estimate is not a figure the validator may match prose against.
 */
export function toValidatorFigure(derivation: Derivation): {
  key: string
  value: number
  marginOfError?: number
} | null {
  if (derivation.value === null) return null
  return derivation.marginOfError === undefined
    ? { key: derivation.key, value: derivation.value }
    : { key: derivation.key, value: derivation.value, marginOfError: derivation.marginOfError }
}
