/**
 * The ZIP-to-county index, pinned.
 *
 * Two kinds of test, kept apart on purpose.
 *
 * The synthetic cases carry the exact numbers, because a packed record is
 * positional: record *k* describes the k-th ZIP, so one record too few attaches
 * every county after the gap to the wrong ZIP code and still renders plausibly.
 * Those fixtures are generated rather than hand-written, so growing the country
 * does not break them.
 *
 * The committed-artefact cases assert invariants only, never a frozen mapping.
 * The artefact is live data from the 2020 relationship file; pinning
 * "90210 is Los Angeles County" would turn a Census reissue into a failing test
 * rather than a reviewed change, which is exactly the fixture rot the
 * first-time-right protocol names.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  EXPECTED_COUNTY_INDEX_ZCTAS,
  RECORD_WIDTH,
  countyForZip,
  parseCountyIndex,
  type PackedCountyIndex,
} from './zcta-county-index'

const PAYLOAD = join(__dirname, '..', '..', 'public', 'map', 'zcta-counties.json')

/** A synthetic country: `count` consecutive ZIPs from 00501, cycling counties. */
function synthetic(count = EXPECTED_COUNTY_INDEX_ZCTAS): PackedCountyIndex {
  const counties: [string, string][] = [
    ['06037', 'Los Angeles County'],
    ['36061', 'New York County'],
    ['48201', 'Harris County'],
  ]
  const shares = [100, 62, 88]
  const zd: number[] = []
  let previous = -1
  let rec = ''
  for (let i = 0; i < count; i++) {
    const zip = 501 + i
    zd.push(zip - previous - 1)
    previous = zip
    const c = i % counties.length
    rec += String(c).padStart(4, '0') + String(shares[c]).padStart(3, '0')
  }
  return {
    v: 1,
    source: 'synthetic',
    zd,
    counties,
    states: { '06': 'CA', '36': 'NY', '48': 'TX' },
    rec,
  }
}

describe('county index decoding', () => {
  it('rebuilds every ZIP in order and attaches the county and land share', () => {
    const index = parseCountyIndex(synthetic())
    expect(index.size).toBe(EXPECTED_COUNTY_INDEX_ZCTAS)
    expect([...index.keys()].slice(0, 5)).toEqual(['00501', '00502', '00503', '00504', '00505'])

    const first = index.get('00501')!
    expect(first.countyGeoid).toBe('06037')
    expect(first.countyName).toBe('Los Angeles County')
    expect(first.state).toBe('CA')
    expect(first.landSharePercent).toBe(100)
    expect(first.whollyContained).toBe(true)

    const second = index.get('00502')!
    expect(second.countyGeoid).toBe('36061')
    expect(second.state).toBe('NY')
    expect(second.landSharePercent).toBe(62)
    expect(second.whollyContained).toBe(false)
  })

  it('looks a ZIP up without knowing its position', () => {
    const index = parseCountyIndex(synthetic())
    // The fixture cycles three counties, so the third ZIP is the third county.
    expect(countyForZip(index, '00503')?.countyName).toBe('Harris County')
    expect(countyForZip(index, '99999')).toBeUndefined()
  })

  it('rejects a version it does not understand', () => {
    expect(() => parseCountyIndex({ ...synthetic(), v: 2 })).toThrow(/expects 1/)
  })

  it('rejects a record block whose length disagrees with the ZIP count', () => {
    const packed = synthetic()
    expect(() => parseCountyIndex({ ...packed, rec: packed.rec.slice(0, -1) })).toThrow(
      /records is inconsistent|record characters/,
    )
  })

  it('rejects a short index rather than serving a partial country', () => {
    expect(() => parseCountyIndex(synthetic(EXPECTED_COUNTY_INDEX_ZCTAS - 1))).toThrow(
      /short index is a bug/,
    )
  })

  it('rejects a record pointing outside the county dictionary', () => {
    const packed = synthetic()
    packed.rec = '0009000' + packed.rec.slice(RECORD_WIDTH)
    expect(() => parseCountyIndex(packed)).toThrow(/which the dictionary lacks/)
  })

  it('rejects a county GEOID that is not five digits', () => {
    const packed = synthetic()
    packed.counties = [['0603', 'Broken County'] as [string, string], ...packed.counties.slice(1)]
    expect(() => parseCountyIndex(packed)).toThrow(/not five digits/)
  })

  it('rejects a land share outside 0..100', () => {
    const packed = synthetic()
    packed.rec = '0000101' + packed.rec.slice(RECORD_WIDTH)
    expect(() => parseCountyIndex(packed)).toThrow(/outside 0\.\.100/)
  })

  it('rejects a ZIP delta outside the four-digit field', () => {
    const packed = synthetic()
    packed.zd[1] = 10000
    expect(() => parseCountyIndex(packed)).toThrow(/delta out of range/)
  })
})

describe('the committed county artefact', () => {
  const raw = JSON.parse(readFileSync(PAYLOAD, 'utf8')) as PackedCountyIndex

  it('covers the whole country and every entry is internally consistent', () => {
    const index = parseCountyIndex(raw)
    expect(index.size).toBe(EXPECTED_COUNTY_INDEX_ZCTAS)

    for (const record of index.values()) {
      expect(record.zip).toMatch(/^\d{5}$/)
      expect(record.countyGeoid).toMatch(/^\d{5}$/)
      expect(record.countyName.trim().length).toBeGreaterThan(0)
      expect(record.landSharePercent).toBeGreaterThanOrEqual(0)
      expect(record.landSharePercent).toBeLessThanOrEqual(100)
      expect(record.whollyContained).toBe(record.landSharePercent === 100)
      // The state must be the one implied by the county's own FIPS, not a
      // separate field that could disagree with it.
      expect(record.state).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('keeps the ZIP list strictly ascending, so no ZIP is served twice', () => {
    const zips = [...parseCountyIndex(raw).keys()]
    for (let i = 1; i < zips.length; i++) {
      expect(Number(zips[i])).toBeGreaterThan(Number(zips[i - 1]))
    }
  })

  it('carries the county count the 2020 file implies, not a truncated dictionary', () => {
    // 3,143 county equivalents in the 50 states and DC, plus Puerto Rico's 78
    // municipios: 3,221 at most, and a file that lost a chunk would fall well
    // below 3,000.
    expect(raw.counties.length).toBeGreaterThanOrEqual(3000)
    expect(raw.counties.length).toBeLessThanOrEqual(3221)
    const geoids = new Set(raw.counties.map(([geoid]) => geoid))
    expect(geoids.size).toBe(raw.counties.length)
  })
})
