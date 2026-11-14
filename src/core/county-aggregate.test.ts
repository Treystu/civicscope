/**
 * County aggregation, pinned on synthetic records.
 *
 * Every case here is a way the aggregate could look right and be wrong: a null
 * treated as zero, a ZIP silently dropped, a straddling ZCTA presented as an
 * exact county total, or a median quietly averaged. The fixtures are synthetic
 * because these are arithmetic rules, not facts about any particular county.
 */
import { describe, expect, it } from 'vitest'

import { COUNTY_MEDIANS, aggregateByCounty, type ZipEvidence } from './county-aggregate'
import type { CountyIndexRecord } from './zcta-county-index'

const county = (geoid: string, name: string, state: string): CountyIndexRecord => ({
  zip: '',
  countyGeoid: geoid,
  countyName: name,
  state,
  landSharePercent: 100,
  whollyContained: true,
})

function index(pairs: [string, CountyIndexRecord, number?][]): Map<string, CountyIndexRecord> {
  const map = new Map<string, CountyIndexRecord>()
  for (const [zip, record, share] of pairs) {
    map.set(zip, {
      ...record,
      zip,
      landSharePercent: share ?? record.landSharePercent,
      whollyContained: (share ?? record.landSharePercent) === 100,
    })
  }
  return map
}

const LA = county('06037', 'Los Angeles County', 'CA')
const NY = county('36061', 'New York County', 'NY')

describe('county aggregation', () => {
  it('adds counts across the ZIPs of one county', () => {
    const rows = aggregateByCounty(
      [
        { zip: '90001', population: 100, households: 40, occupiedUnits: 45, renterUnits: 20 },
        { zip: '90002', population: 250, households: 90, occupiedUnits: 95, renterUnits: 60 },
      ],
      index([
        ['90001', LA],
        ['90002', LA],
      ]),
    )

    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row!.population).toBe(350)
    expect(row!.households).toBe(130)
    expect(row!.renterUnits).toBe(80)
    expect(row!.zips).toEqual(['90001', '90002'])
    expect(row!.incompleteMetrics).toEqual([])
  })

  it('reports a county count as unknown when a contributing ZIP has no value', () => {
    const rows = aggregateByCounty(
      [
        { zip: '90001', population: 100, households: 40 },
        { zip: '90002', population: null, households: 90 },
      ],
      index([
        ['90001', LA],
        ['90002', LA],
      ]),
    )

    // Not 100: a partial total presented as a total is the failure this forbids.
    const [row] = rows
    expect(row!.population).toBeNull()
    expect(row!.incompleteMetrics).toContain('population')
    expect(row!.households).toBe(130)
  })

  it('treats an absent field the same as an explicit null', () => {
    const rows = aggregateByCounty(
      [{ zip: '90001', population: 100 }, { zip: '90002' }],
      index([
        ['90001', LA],
        ['90002', LA],
      ]),
    )
    const [row] = rows
    expect(row!.population).toBeNull()
    expect(row!.incompleteMetrics).toContain('population')
  })

  it('refuses to aggregate a ZIP the index cannot place', () => {
    const evidence: ZipEvidence[] = [{ zip: '90001', population: 100 }, { zip: '00000', population: 1 }]
    expect(() => aggregateByCounty(evidence, index([['90001', LA]]))).toThrow(/00000/)
  })

  it('separates counties and names which ZIPs straddle a boundary', () => {
    const rows = aggregateByCounty(
      [
        { zip: '90001', population: 100 },
        { zip: '10001', population: 200 },
        { zip: '10002', population: 300 },
      ],
      index([
        ['90001', LA],
        ['10001', NY, 62],
        ['10002', NY, 100],
      ]),
    )

    expect(rows.map((r) => r.countyGeoid)).toEqual(['06037', '36061'])
    const nyRow = rows.find((r) => r.countyGeoid === '36061')!
    expect(nyRow.population).toBe(500)
    expect(nyRow.straddlingZips).toBe(1)
    expect(nyRow.whollyContainedZips).toBe(1)
    expect(nyRow.attribution).toBe('dominant-county')
    expect(nyRow.note).toMatch(/1 of those ZIP\(s\) cross a county boundary/)
  })

  it('orders rows by county GEOID so the output is stable', () => {
    const rows = aggregateByCounty(
      [
        { zip: '10001', population: 1 },
        { zip: '90001', population: 2 },
      ],
      index([
        ['10001', NY],
        ['90001', LA],
      ]),
    )
    expect(rows.map((r) => r.countyGeoid)).toEqual(['06037', '36061'])
  })

  it('returns nothing for no evidence rather than inventing a row', () => {
    expect(aggregateByCounty([], index([]))).toEqual([])
  })

  it('carries the median refusal as data, naming the publisher table', () => {
    const keys = COUNTY_MEDIANS.map((m) => m.metric).sort()
    expect(keys).toEqual(['medianGrossRent', 'medianHomeValue', 'medianHouseholdIncome'])
    for (const metric of COUNTY_MEDIANS) {
      expect(metric.reason).toBe('not-comparable')
      expect(metric.countyTable).toMatch(/^B\d{5}$/)
      expect(metric.note).toMatch(/not summable/)
    }
  })
})
