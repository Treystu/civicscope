import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CHUNK_SIZE,
  MAX_GEOGRAPHY_CHARS,
  geographyClause,
  planChunks,
} from '../src/core/sweep/chunk'
import { decodeZips, EXPECTED_PLACE_COUNT } from '../src/core/zcta-place-index'

/**
 * Champion audit #70: national sweep chunking.
 *
 * Offline and exact. The partition input is the committed ZCTA index
 * (`public/map/zcta-places.json`), which carries all 33,791 codes, and the URL
 * shape is the shipped `geographyClause`. Nothing is sampled or simulated: the
 * chunk counts, geography lengths and request counts below are the real ones for
 * the real country.
 *
 * What is NOT measured here is wall-clock time and the API's status codes. Those
 * need a recorded replay corpus of live chunk timings, which this repository
 * does not carry, so the timing half of the issue's acceptance is reported as
 * not measured rather than estimated. The URL-length half is the binding
 * constraint the issue is actually about, and it is measured exactly.
 */

function loadZips(): string[] {
  const payload = JSON.parse(readFileSync('public/map/zcta-places.json', 'utf8')) as { zd: number[] }
  return decodeZips(payload.zd)
}

const ZIPS = loadZips()

/**
 * The full request URL the shipped code builds, from the same pieces:
 * `get=NAME,<vars>` + `&` + geography clause + `&key=<key>`.
 *
 * Calibrated against the four measurements recorded in `chunk.ts` (2026-09-29):
 * 800 -> 6,542 chars, 900 -> 7,342, 950 -> 7,742, 1,000 -> 8,142. The test below
 * asserts this reproduces all four exactly, so the model is the shipped shape and
 * not an approximation of it.
 */
const GEOGRAPHY_PREFIX_CHARS = encodeURIComponent('zip code tabulation area:').length + 'for='.length
const URL_OVERHEAD_CHARS = 108 // `get=NAME,<20 variables>` plus `&key=<a 40-char key>`

function urlCharsFor(n: number, zips: readonly string[] = ZIPS.slice(0, n)): number {
  const geography = geographyClause(zips).length
  return geography + URL_OVERHEAD_CHARS
}

describe('champion audit #70: national sweep chunking', () => {
  it('reads the real national partition', () => {
    expect(ZIPS.length).toBe(EXPECTED_PLACE_COUNT)
    expect(new Set(ZIPS).size).toBe(ZIPS.length)
  })

  it('reproduces every recorded live URL measurement exactly', () => {
    // The four points in chunk.ts's header came from bisecting the live API on
    // 2026-09-29. If this model reproduces them, it is the shipped URL shape.
    expect(urlCharsFor(800)).toBe(6542)
    expect(urlCharsFor(900)).toBe(7342)
    expect(urlCharsFor(950)).toBe(7742)
    expect(urlCharsFor(1000)).toBe(8142)
    // 8 characters per ZIP because encodeURIComponent turns each separator comma
    // into %2C; the first ZIP is 5 characters, the prefix 37 including `for=`.
    expect(geographyClause(ZIPS.slice(0, 800)).length).toBe(GEOGRAPHY_PREFIX_CHARS + 8 * 799 + 5)
  })

  it('measures the champion as shipped: 43 chunks, none near either guard', () => {
    const chunks = planChunks(ZIPS, CHUNK_SIZE)
    expect(chunks.length).toBe(43)
    expect(chunks.every((c) => c.length <= CHUNK_SIZE)).toBe(true)

    const lengths = chunks.map((c) => geographyClause(c).length)
    const max = Math.max(...lengths)
    // The champion never trips MAX_GEOGRAPHY_CHARS, so the guard is a backstop
    // rather than something the normal path relies on.
    expect(max).toBeLessThan(MAX_GEOGRAPHY_CHARS)

    // Every chunk of 800 costs 6,434 chars of geography, which is a 7,108-char
    // URL. That sits between the last measured success (7,342 at 900) and the
    // first measured failure (7,742 at 950): the cap is the safe side of a real
    // boundary rather than a round number.
    expect(max).toBe(6434)
    expect(max + URL_OVERHEAD_CHARS).toBeLessThan(7342)
  })

  it('rejects the character-budget challenger on its stated margin', () => {
    // The issue's challenger: fill each request to the character budget
    // regardless of count. Measured, not argued.
    const budget = MAX_GEOGRAPHY_CHARS
    const chunks: string[][] = []
    let current: string[] = []
    for (const zip of [...ZIPS].sort()) {
      const candidate = [...current, zip]
      if (geographyClause(candidate).length > budget && current.length > 0) {
        chunks.push(current)
        current = [zip]
      } else {
        current = candidate
      }
    }
    if (current.length > 0) chunks.push(current)

    const sizes = chunks.map((c) => c.length)
    const perChunk = Math.max(...sizes)
    expect(perChunk).toBeGreaterThan(CHUNK_SIZE)
    expect(perChunk).toBeLessThan(950) // stays under the first measured rejection

    // The improvement in requests is 43 -> 39, which is 9.3%: below the 20%
    // margin the issue pre-states, so the challenger does not ship however safe
    // it is. This is the whole reason the margin is numeric.
    const champion = planChunks(ZIPS, CHUNK_SIZE).length
    expect(chunks.length).toBe(39)
    const improvement = (champion - chunks.length) / champion
    expect(improvement).toBeCloseTo(0.093, 3)
    expect(improvement).toBeLessThan(0.2)
  })
})
