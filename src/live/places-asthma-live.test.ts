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

/**
 * The publisher is a third party, so a tunnel that stalls for ten seconds is a
 * fact about the network, not about the columns this test exists to check. Job 284
 * failed here with `UND_ERR_CONNECT_TIMEOUT` after 10.7s on a head whose only
 * change was documentation, while the same endpoint answered in 521ms minutes
 * earlier.
 *
 * So the fetch gets a bounded retry and an explicit per-attempt timeout. This
 * does not soften the assertion: a renamed or removed column, a bad status or an
 * empty result still fails on the last attempt, and three consecutive connect
 * timeouts fail too - the test simply no longer reports a network blip as an
 * upstream schema change.
 */
async function fetchWithRetry(attempts = 3): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(URL, { signal: AbortSignal.timeout(25000) })
      if (res.ok || attempt === attempts) return res
      lastError = new Error(`HTTP ${res.status}`)
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

describe('live: CDC PLACES tract release carries the asthma measure', () => {
  it('returns the prevalence and its 95% interval for a real tract', async () => {
    const res = await fetchWithRetry()
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
