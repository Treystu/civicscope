/**
 * County rows built from ZIP-level evidence, with the approximation stated.
 *
 * This is the I2 half of S1 and it consumes the index from
 * `zcta-county-index.ts`. It is deliberately narrow, because most ways to
 * "aggregate ZIPs into a county" produce a number the Census Bureau never
 * published, and this project does not present those.
 *
 * THREE RULES, EACH EARNED BY A MEASUREMENT:
 *
 *   1. Counts add; medians do not. Population, households, occupied units and
 *      renter-occupied units are counts, and a sum of counts is a count. Rent,
 *      home value and income are medians: adding them produces a number with no
 *      definition, and averaging them produces a mean of medians, which is not
 *      the median of the county. The publisher already publishes county
 *      medians directly (ACS B25064, B25077, B19013 at county level), so the
 *      correct county median is fetched, not computed. `COUNTY_MEDIANS` below
 *      carries that refusal as data so a caller cannot silently invent one.
 *
 *   2. Missing is not zero. If any contributing ZIP has no value for a count,
 *      the county count is unknown rather than the sum of the ZIPs that did
 *      answer: a partial total presented as a total is exactly the silent
 *      wrongness the honesty floor forbids. The row names the affected metrics.
 *
 *   3. Whole-ZIP attribution is an approximation and is labelled. Each ZCTA is
 *      attributed entirely to its dominant county because that is what the
 *      committed index records. Measured from the 2020 relationship file, 9,790
 *      of 33,791 ZCTAs straddle a county boundary, so a county total includes
 *      whole populations of ZIPs that partly belong next door. Splitting a count
 *      by land share would replace that error with a worse one (population is
 *      not spread evenly over area), so the count is attributed whole and the
 *      straddle count is reported beside it.
 */

import type { CountyIndexRecord } from './zcta-county-index'

/** The counts this module will add. Every one is a count of people or units. */
export type CountySumMetric = 'population' | 'households' | 'occupiedUnits' | 'renterUnits'

export const COUNTY_SUM_METRICS: readonly CountySumMetric[] = [
  'population',
  'households',
  'occupiedUnits',
  'renterUnits',
]

/** One ZIP's evidence. A missing or null value means the publisher had none. */
export interface ZipEvidence {
  zip: string
  population?: number | null
  households?: number | null
  occupiedUnits?: number | null
  renterUnits?: number | null
}

/** One county, aggregated from the ZIPs whose dominant county it is. */
export interface CountyRow {
  countyGeoid: string
  countyName: string
  state: string
  /** Contributing ZIPs, ascending. The row's provenance. */
  zips: string[]
  zipCount: number
  /** ZIPs whose whole land area sits in this county. */
  whollyContainedZips: number
  /** ZIPs attributed here that also extend into a neighbouring county. */
  straddlingZips: number
  population: number | null
  households: number | null
  occupiedUnits: number | null
  renterUnits: number | null
  /** Metrics that are null because at least one contributing ZIP had no value. */
  incompleteMetrics: CountySumMetric[]
  /** Named rather than implied, so a reader knows what the count means. */
  attribution: 'dominant-county'
  /** The disclosure a UI must show beside these figures. */
  note: string
}

/** A published figure that must not be recomputed from ZIP rows. */
export interface NonAggregatedMetric {
  metric: 'medianGrossRent' | 'medianHomeValue' | 'medianHouseholdIncome'
  /** ACS table at county level that answers this directly. */
  countyTable: string
  reason: 'not-comparable'
  note: string
}

/**
 * Medians are not aggregated, and the reason is a definition rather than a
 * limitation of this code. Exported as data so a caller has to name the refusal
 * in order to bypass it.
 */
export const COUNTY_MEDIANS: readonly NonAggregatedMetric[] = [
  {
    metric: 'medianGrossRent',
    countyTable: 'B25064',
    reason: 'not-comparable',
    note: 'A median is not summable and a mean of ZIP medians is not the county median. Fetch B25064 at county level.',
  },
  {
    metric: 'medianHomeValue',
    countyTable: 'B25077',
    reason: 'not-comparable',
    note: 'A median is not summable and a mean of ZIP medians is not the county median. Fetch B25077 at county level.',
  },
  {
    metric: 'medianHouseholdIncome',
    countyTable: 'B19013',
    reason: 'not-comparable',
    note: 'A median is not summable and a mean of ZIP medians is not the county median. Fetch B19013 at county level.',
  },
]

/**
 * Groups ZIP evidence by the county each ZIP's dominant share falls in.
 *
 * Throws on a ZIP the index cannot place. Dropping it would produce a lower
 * county total that still looked complete, and the whole point of carrying the
 * index is that the provenance chain resolves for every row.
 */
export function aggregateByCounty(
  evidence: readonly ZipEvidence[],
  index: Map<string, CountyIndexRecord>,
): CountyRow[] {
  const unresolved: string[] = []
  const groups = new Map<string, { county: CountyIndexRecord; rows: ZipEvidence[] }>()

  for (const row of evidence) {
    const county = index.get(row.zip.trim())
    if (!county) {
      unresolved.push(row.zip)
      continue
    }
    const key = county.countyGeoid
    const group = groups.get(key)
    if (group) group.rows.push(row)
    else groups.set(key, { county, rows: [row] })
  }

  if (unresolved.length > 0) {
    throw new Error(
      `${unresolved.length} ZIP code(s) have no county in the index: ${unresolved.slice(0, 8).join(', ')}` +
        `${unresolved.length > 8 ? ', ...' : ''}. A partial county aggregate would understate the total.`,
    )
  }

  const out: CountyRow[] = []
  for (const { county, rows } of groups.values()) {
    const zips = rows.map((r) => r.zip).sort()
    const straddlingZips = zips.filter((zip) => !index.get(zip)!.whollyContained).length
    const incompleteMetrics: CountySumMetric[] = []
    const totals: Record<CountySumMetric, number | null> = {
      population: 0,
      households: 0,
      occupiedUnits: 0,
      renterUnits: 0,
    }

    for (const metric of COUNTY_SUM_METRICS) {
      let total = 0
      let complete = true
      for (const row of rows) {
        const value = row[metric]
        if (value === null || value === undefined) {
          complete = false
          break
        }
        total += value
      }
      if (complete) totals[metric] = total
      else {
        totals[metric] = null
        incompleteMetrics.push(metric)
      }
    }

    out.push({
      countyGeoid: county.countyGeoid,
      countyName: county.countyName,
      state: county.state,
      zips,
      zipCount: zips.length,
      whollyContainedZips: zips.length - straddlingZips,
      straddlingZips,
      population: totals.population,
      households: totals.households,
      occupiedUnits: totals.occupiedUnits,
      renterUnits: totals.renterUnits,
      incompleteMetrics,
      attribution: 'dominant-county',
      note:
        `Sum of ${zips.length} ZIP code(s) attributed whole to ${county.countyName} by the share of ` +
        `each ZCTA's land area inside it. ${straddlingZips} of those ZIP(s) cross a county boundary, so ` +
        `this total is an approximation rather than a published county figure. Medians are not ` +
        `aggregated: the Census Bureau publishes county medians directly.`,
    })
  }

  return out.sort((a, b) => a.countyGeoid.localeCompare(b.countyGeoid))
}
