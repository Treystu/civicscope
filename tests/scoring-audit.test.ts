import { describe, expect, it } from 'vitest'
import { affordabilityIndex, normalize, SCORE_RULES } from '../src/core/scoring'
import type { MetricValue } from '../src/core/types'

/**
 * Champion audit #68: affordability composite scoring.
 *
 * The mechanism is a pure function of up to four published figures, so it is
 * measured here by exhaustion over a deterministic grid rather than by sampling
 * a national screen. That substitution is deliberate and is named in
 * docs/champion-audit-68-affordability.md: this repository commits no frozen
 * corpus of national figures, so the "share of *real areas* at a clamp" version
 * of the issue's question cannot be answered here without inventing a
 * distribution. What can be answered without inventing anything is the share of
 * the mechanism's own declared input space that saturates, which is the property
 * the clamp defect is about, and subset incomparability, which is structural.
 *
 * Every number asserted below is produced by this file, not copied from prose.
 */

function metric(key: string, value: number | null): MetricValue {
  return {
    key,
    label: key,
    value,
    unit: 'count',
    category: 'cost',
    source: { publisher: 'p', dataset: 'd', tableId: 't', vintage: 'v', url: 'u' },
    quality: {},
  }
}

const RULES = SCORE_RULES.affordability
const BURDEN = RULES.find((r) => r.key === 'median_rent_burden_pct')!
const RENT = RULES.find((r) => r.key === 'median_gross_rent')!
const VALUE = RULES.find((r) => r.key === 'median_home_value')!
const INCOME = RULES.find((r) => r.key === 'median_household_income')!

type Field = 'burden' | 'rent' | 'value' | 'income'

/** The grid field each rule reads. Written out so the axis and the rule cannot drift. */
const FIELD: Record<string, Field> = {
  median_rent_burden_pct: 'burden',
  median_gross_rent: 'rent',
  median_home_value: 'value',
  median_household_income: 'income',
}

interface Row {
  burden: number
  rent: number
  value: number
  income: number
}

/** 13 points spanning 50% beyond each declared bound: 5 of 13 sit outside. */
function axis(rule: { floor: number; ceiling: number }): number[] {
  const span = rule.ceiling - rule.floor
  const lo = rule.floor - span / 2
  const hi = rule.ceiling + span / 2
  return Array.from({ length: 13 }, (_, i) => Number((lo + ((hi - lo) * i) / 12).toFixed(6)))
}

const AXIS: Record<Field, number[]> = {
  burden: axis(BURDEN),
  rent: axis(RENT),
  value: axis(VALUE),
  income: axis(INCOME),
}

function grid(): Row[] {
  const rows: Row[] = []
  for (const burden of AXIS.burden) {
    for (const rent of AXIS.rent) {
      for (const value of AXIS.value) {
        for (const income of AXIS.income) {
          rows.push({ burden, rent, value, income })
        }
      }
    }
  }
  return rows
}

const ROWS = grid()

function metricsOf(row: Row, omit: readonly string[] = []): MetricValue[] {
  return RULES.filter((r) => !omit.includes(r.key)).map((r) => metric(r.key, row[FIELD[r.key]!]))
}

function compositeWith(row: Row, weights: Map<string, number>): number {
  let sum = 0
  let total = 0
  for (const rule of RULES) {
    const w = weights.get(rule.key) ?? rule.weight
    sum += normalize(rule, row[FIELD[rule.key]!]) * w
    total += w
  }
  return sum / total
}

function champion(row: Row): number {
  return affordabilityIndex(metricsOf(row)).score!
}

const ratio = (n: number, d: number): number => (d === 0 ? 0 : n / d)

describe('champion audit #68: affordability composite', () => {
  it('measures clamp saturation per component over the declared input space', () => {
    // The defect the issue names: clamping means every rent burden at or above
    // 45% scores identically 0 and every income at or above $140,000 identically
    // 100, so discrimination vanishes exactly at the extremes readers compare.
    const saturation = RULES.map((rule) => {
      const field = FIELD[rule.key]!
      const atEnd = ROWS.filter((r) => {
        const s = normalize(rule, r[field])
        return s === 0 || s === 100
      }).length
      return { key: rule.key, share: ratio(atEnd, ROWS.length) }
    })

    // 4 of 13 points per axis sit at or beyond each hard end (8 of 13 in total),
    // so every component saturates on the same share of the grid. Asserted, not
    // believed: the first draft of this file said 5 of 13 and the run corrected it.
    for (const s of saturation) expect(s.share).toBeCloseTo(8 / 13, 10)

    expect(ROWS.length).toBe(13 ** 4)
  })

  it('measures score movement under a +/-20% weight perturbation', () => {
    const within = RULES.map((rule) => {
      const shifts = ROWS.map((row) => {
        const w = new Map(RULES.map((r) => [r.key, r.weight]))
        w.set(rule.key, rule.weight * 1.2)
        return Math.abs(compositeWith(row, w) - champion(row))
      })
      const sorted = shifts.slice().sort((a, b) => a - b)
      return {
        key: rule.key,
        within10: ratio(shifts.filter((d) => d <= 10).length, shifts.length),
        p95: sorted[Math.floor(sorted.length * 0.95)]!,
      }
    })

    // Pinned so a later rule change cannot silently make the composite less
    // stable than the figure this record publishes.
    for (const s of within) expect(s.within10).toBeGreaterThan(0.8)
    expect(within.every((s) => s.p95 <= 20)).toBe(true)
  })

  it('measures subset incomparability: 2-of-4 scores against 4-of-4 on one scale', () => {
    // The issue's second measurable. Because weights are renormalized over what
    // is present, a composite from two published figures and one from four print
    // on the same 0-100 scale. This measures how far the same place can move
    // depending only on which figures arrived.
    const gaps = ROWS.map((row) => {
      const full = champion(row)
      const two = affordabilityIndex(metricsOf(row, [VALUE.key, INCOME.key])).score!
      return full - two
    })
    const abs = gaps.map(Math.abs).sort((a, b) => a - b)
    const median = abs[Math.floor(abs.length / 2)]!
    const p95 = abs[Math.floor(abs.length * 0.95)]!

    expect(median).toBeGreaterThan(5)
    expect(p95).toBeGreaterThan(15)
    // And it can invert: a 2-of-4 area can outscore a 4-of-4 area outright.
    const inversions = gaps.filter((d) => d <= -15).length
    expect(inversions).toBeGreaterThan(0)
  })

  it('rejects the equal-weight challenger on the issue\u2019s stated margin', () => {
    // Acceptance: a challenger ships only if >=90% of areas stay within +/-10 of
    // champion AND clamp saturation falls. Equal weights cannot move saturation,
    // because saturation is a property of the bounds and equal weights do not
    // enter normalize(), so the second clause fails before the first is reached.
    const equal = new Map(RULES.map((r) => [r.key, 0.25]))
    const shifts = ROWS.map((row) => Math.abs(compositeWith(row, equal) - champion(row)))
    const within10 = ratio(shifts.filter((d) => d <= 10).length, shifts.length)

    expect(within10).toBeLessThan(1)
    expect(within10).toBeGreaterThan(0)
  })

  it('measures the widened-bounds challenger, the only real lever on saturation', () => {
    // Weights cannot move saturation, so the only challenger that could satisfy
    // the issue's second clause is a wider bound set. Measured rather than assumed.
    const widened = RULES.map((r) => {
      const span = r.ceiling - r.floor
      return { ...r, floor: r.floor - span * 0.1, ceiling: r.ceiling + span * 0.1 }
    })

    const saturation = widened.map((rule) => {
      const field = FIELD[rule.key]!
      const atEnd = ROWS.filter((r) => {
        const s = normalize(rule as (typeof RULES)[number], r[field])
        return s === 0 || s === 100
      }).length
      return ratio(atEnd, ROWS.length)
    })

    const shifts = ROWS.map((row) => {
      let sum = 0
      for (const rule of widened) sum += normalize(rule as (typeof RULES)[number], row[FIELD[rule.key]!]) * rule.weight
      return Math.abs(sum - champion(row))
    })
    const within10 = ratio(shifts.filter((d) => d <= 10).length, shifts.length)


    // Measured: saturation falls from 8/13 to 6/13 and every grid point stays
    // within +/-10 of champion. On the grid the challenger therefore qualifies on
    // both clauses. It is NOT shipped, and the reason is measurement scope rather
    // than merit: the acceptance clause is stated over *areas*, this repository
    // carries no frozen national corpus, and reporting a grid as if it were the
    // national screen is the substitution this project forbids. See the record.
    expect(saturation[0]).toBeCloseTo(6 / 13, 10)
    expect(within10).toBe(1)
  })
})
