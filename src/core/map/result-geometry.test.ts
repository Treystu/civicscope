/**
 * Result-map geometry: the quoted range is the point of these cases.
 *
 * The defect this module answers was not a crash. It was a map that drew a
 * two-ZIP result at the national scale, where the result is two pixels and the
 * referenced state's outline is absent, so a reader concludes the search found
 * nothing. Every case below therefore asserts placement, not merely that a path
 * string came back.
 */

import { describe, expect, it } from 'vitest'

import { geoArea } from 'd3-geo'

import { buildResultMapFit, stateFeature, RESULT_MAP_PADDING } from './result-geometry'
import type { Basemap } from './projection'

/** Two small squares standing in for a state, so bounds are exact and checkable. */
function square(west: number, south: number, size: number, stusab: string): Basemap['features'][number] {
  return {
    type: 'Feature',
    properties: { STUSAB: stusab, BASENAME: stusab },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, south],
          [west + size, south],
          [west + size, south + size],
          [west, south + size],
          [west, south],
        ],
      ],
    },
  }
}

const basemap: Basemap = {
  type: 'FeatureCollection',
  features: [square(-109.05, 37, 7, 'CO'), square(-124.4, 32.5, 9, 'CA'), square(-67.3, 17.9, 1.6, 'PR')],
}

describe('result map: which outline', () => {
  it('finds the referenced state and nothing else', () => {
    expect(stateFeature(basemap, 'co')?.properties?.STUSAB).toBe('CO')
    expect(stateFeature(basemap, 'PR')?.properties?.STUSAB).toBe('PR')
  })

  it('answers null for an unknown code, an empty code and a missing basemap', () => {
    expect(stateFeature(basemap, 'ZZ')).toBeNull()
    expect(stateFeature(basemap, '')).toBeNull()
    expect(stateFeature(basemap, null)).toBeNull()
    expect(stateFeature(null, 'CO')).toBeNull()
  })
})

describe('result map: the fit', () => {
  it('draws the outline as path data that goes somewhere', () => {
    const fit = buildResultMapFit(basemap, 'CO', [], 400, 300)
    expect(fit).not.toBeNull()
    expect(fit!.fromBasemap).toBe(true)
    expect(fit!.state).toBe('CO')
    expect(fit!.outline.startsWith('M')).toBe(true)
    // A four-corner square that survives projection has more than a single move.
    expect(fit!.outline.length).toBeGreaterThan(20)
  })

  it('places a point inside the reference area inside the box', () => {
    const fit = buildResultMapFit(basemap, 'CO', [{ lon: -105.5, lat: 39.7 }], 400, 300)!
    const placed = fit.project(-105.5, 39.7)
    expect(placed).not.toBeNull()
    const [x, y] = placed!
    expect(x).toBeGreaterThanOrEqual(RESULT_MAP_PADDING)
    expect(x).toBeLessThanOrEqual(400 - RESULT_MAP_PADDING)
    expect(y).toBeGreaterThanOrEqual(RESULT_MAP_PADDING)
    expect(y).toBeLessThanOrEqual(300 - RESULT_MAP_PADDING)
  })

  it('puts two cities in one state far enough apart to be two marks', () => {
    /*
     * The measurement that names the original defect: at the national fit two
     * Colorado ZIP codes land on the same pixel, so a two-result search reads as
     * empty. Fitted to the state, Denver to Colorado Springs is about 49px in a
     * 600x400 box - two marks a reader can tell apart.
     *
     * Deliberately two cities rather than two neighbouring ZIPs: adjacent ZIPs
     * inside one city really do sit about 1px apart at state scale (measured),
     * and asserting tens of pixels for those would be asserting something false
     * about the data rather than something true about the projection.
     */
    const fit = buildResultMapFit(
      basemap,
      'CO',
      [
        { lon: -104.99, lat: 39.74 },
        { lon: -104.82, lat: 38.83 },
      ],
      600,
      400,
    )!
    const a = fit.project(-104.99, 39.74)!
    const b = fit.project(-104.82, 38.83)!
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(10)
    expect(a).not.toEqual(b)
  })

  it('is deterministic, so a re-render does not move the outline', () => {
    const one = buildResultMapFit(basemap, 'CA', [{ lon: -118.24, lat: 34.05 }], 500, 400)!
    const two = buildResultMapFit(basemap, 'CA', [{ lon: -118.24, lat: 34.05 }], 500, 400)!
    expect(two.outline).toBe(one.outline)
    expect(two.project(-118.24, 34.05)).toEqual(one.project(-118.24, 34.05))
  })

  it('draws Puerto Rico through the same projection as its points', () => {
    const fit = buildResultMapFit(basemap, 'PR', [{ lon: -66.1, lat: 18.47 }], 300, 200)!
    expect(fit.fromBasemap).toBe(true)
    expect(fit.project(-66.1, 18.47)).not.toBeNull()
  })
})

/**
 * Numbers in d3 path data are absolute screen coordinates, so a number far
 * outside the box is a shape drawn far outside the panel.
 */
function pathNumbers(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
}

describe('result map: a ring wound the wrong way', () => {
  it('keeps the real basemap outline inside the panel', async () => {
    /*
     * The case the browser found. Read from the committed asset rather than a
     * fixture, because the defect was in that file's winding rather than in the
     * code's reading of it - and a fixture cannot be made to reproduce it: a
     * deliberately reversed square measures 0.011 steradians either way, so d3
     * reads both of its windings as the small square. The real multipolygon is
     * the only honest fixture, so this asserts the defect is present in the file
     * and then that the fit survives it.
     */
    const { readFileSync } = await import('node:fs')
    const real = JSON.parse(readFileSync('public/map/us-states.json', 'utf8')) as Basemap
    const prFeature = real.features.find((f) => f.properties?.STUSAB === 'PR')!
    expect(geoArea(prFeature as never), 'the basemap no longer has the complement winding').toBeGreaterThan(
      2 * Math.PI,
    )

    const fit = buildResultMapFit(
      real,
      'PR',
      [
        { lon: -66.108, lat: 18.467 },
        { lon: -66.092, lat: 18.4233 },
      ],
      600,
      400,
    )!
    expect(fit.fromBasemap).toBe(true)
    for (const value of pathNumbers(fit.outline)) expect(Math.abs(value)).toBeLessThan(1200)

    const a = fit.project(-66.108, 18.467)!
    const b = fit.project(-66.092, 18.4233)!
    // Two San Juan ZIP codes, about five kilometres apart: they must not collapse.
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(5)
  })
})

describe('result map: stated absence rather than a silent empty panel', () => {
  it('fits the points alone and says the outline is missing', () => {
    const fit = buildResultMapFit(
      null,
      'CO',
      [
        { lon: -104.99, lat: 39.74 },
        { lon: -105.08, lat: 39.81 },
      ],
      400,
      300,
    )
    expect(fit).not.toBeNull()
    expect(fit!.fromBasemap).toBe(false)
    expect(fit!.outline).toBe('')
    expect(fit!.state).toBeNull()
  })

  it('returns null when there is nothing to fit', () => {
    expect(buildResultMapFit(null, 'CO', [], 400, 300)).toBeNull()
    expect(buildResultMapFit(basemap, 'CO', [], 0, 300)).toBeNull()
    // One point and no basemap has no extent to fit: d3 answers Infinity, and a
    // view at infinite scale is not a view. The caller states the absence.
    expect(buildResultMapFit(null, 'CO', [{ lon: -104.99, lat: 39.74 }], 400, 300)).toBeNull()
  })

  it('ignores points d3 cannot place instead of drawing them at the origin', () => {
    const fit = buildResultMapFit(basemap, 'CO', [{ lon: Number.NaN, lat: 39.7 }], 400, 300)!
    expect(fit.project(Number.NaN, 39.7)).toBeNull()
    // A point outside the composite (d3 answers null) is reported, not defaulted.
    expect(fit.project(10, 50)).toBeNull()
  })
})
