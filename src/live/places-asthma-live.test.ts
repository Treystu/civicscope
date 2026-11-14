/**
 * Live contract for the CDC PLACES asthma columns.
 *
 * The hermetic suite pins how the plugin reads `casthma_crudeprev` and derives
 * `casthma_crude95ci`. This one asks the publisher whether those columns are
 * still there, because a hermetic test cannot tell a working binding from a
 * column that was renamed upstream. One tract, one row, no credential.
 */
import { describe, expect, it } from 'vitest'

const TRACT = '01001020100'
const URL =
  `https://data.cdc.gov/resource/yjkw-uj5s.json` +
  `?$select=${encodeURIComponent('stateabbr,tractfips,totalpopulation,casthma_crudeprev,casthma_crude95ci')}` +
  `&$where=${encodeURIComponent(`tractfips='${TRACT}'`)}`

describe('live: CDC PLACES tract release carries the asthma measure', () => {
  it('returns the prevalence and its 95% interval for a real tract', async () => {
    const res = await fetch(URL)
    expect(res.ok).toBe(true)
    const rows = (await res.json()) as Record<string, unknown>[]
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)

    const row = rows[0] as Record<string, unknown>
    expect(row).toHaveProperty('casthma_crudeprev')
    expect(row).toHaveProperty('casthma_crude95ci')
    expect(row.tractfips).toBe(TRACT)

    // The prevalence is a percentage; the interval is CDC's "(lo, hi)" string.
    expect(Number(row.casthma_crudeprev)).toBeGreaterThan(0)
    expect(String(row.casthma_crude95ci)).toMatch(/\(?\s*[\d.]+\s*,\s*[\d.]+\s*\)?/)
  }, 120000)
})
