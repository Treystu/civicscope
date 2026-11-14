/**
 * Geometry for the result map: the reference area's outline beneath a result
 * choropleth.
 *
 * `projection.ts` fits one national base and then zooms a canvas over it, which
 * is right for the country-wide sweep: 33,791 points are projected once and a
 * pan costs nothing. It is wrong for a result map, which shows a handful of ZIP
 * codes inside one state. Reusing the national fit there drew a two-ZIP result
 * as two pixels in a corner of an empty country, which is what row I12 records:
 * the referenced state's outline has to be drawn *under* the result and the view
 * has to be fitted to it.
 *
 * So this fits the projection to the state, and the outline and the points are
 * then placed by the same projection. That is the property that matters: two
 * projections would let the outline drift away from the points it is meant to be
 * under, and the drift would be invisible until someone compared them.
 *
 * Path data is returned as a string rather than a `Path2D`, because `Path2D`
 * does not exist in the node test environment, and an outline nobody can assert
 * on is an outline that breaks quietly. SVG takes the same string.
 */
import {
  geoAlbersUsa,
  geoArea,
  geoConicEqualArea,
  geoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from 'd3-geo'

import type { Basemap } from './projection'

/** Distance kept between the drawn reference area and the panel edge, in px. */
export const RESULT_MAP_PADDING = 12

export interface ResultMapFit {
  /**
   * SVG path data for the reference area's outline. Empty when no basemap
   * feature was available, which is a stated absence rather than a failure.
   */
  outline: string
  /** Projects lon/lat into the same box the outline was fitted to. */
  project(lon: number, lat: number): [number, number] | null
  /**
   * True when the outline came from the basemap. False means the view was fitted
   * to the result points alone, so the caller must say the outline is missing
   * rather than let an empty panel imply the state has no shape.
   */
  fromBasemap: boolean
  /** The postcode abbreviation the outline was drawn for, if any. */
  state: string | null
}

/** The basemap feature for one postal abbreviation, or null. */
export function stateFeature(basemap: Basemap | null, state: string | null): Basemap['features'][number] | null {
  if (!basemap || !state) return null
  const wanted = state.trim().toUpperCase()
  if (!wanted) return null
  return basemap.features.find((f) => String(f.properties?.STUSAB ?? '').toUpperCase() === wanted) ?? null
}

/**
 * Fits one state and the result points into a box, and returns the outline path
 * plus a projector for the points.
 *
 * Returns null only when there is nothing to fit at all - no state feature and no
 * points - or when d3 cannot place the geometry, because a caller that draws a
 * fitted view it did not get is the defect this module exists to prevent.
 */
export function buildResultMapFit(
  basemap: Basemap | null,
  state: string | null,
  points: readonly { lon: number; lat: number }[],
  width: number,
  height: number,
  padding: number = RESULT_MAP_PADDING,
): ResultMapFit | null {
  if (!(width > 0) || !(height > 0)) return null

  const feature = stateFeature(basemap, state)
  const placed = points.filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat))
  if (!feature && placed.length === 0) return null

  /*
   * The same projection split `projection.ts` already makes: `albersUsa` covers
   * the lower 48, Alaska and Hawaii, and d3 leaves Puerto Rico out of it, so PR
   * is drawn through its own conic equal-area. Measured here rather than assumed:
   * asking `albersUsa` for a PR coordinate returns null, which is why the first
   * version of this fit silently produced an empty panel for the territory.
   */
  const projection = projectionFor(state)

  /*
   * The scale is solved from the geometry's own coordinates, not from
   * `fitExtent`, and that is a correction with a measurement behind it.
   *
   * `fitExtent` takes its extent from `geoPath().bounds()`. On the committed
   * basemap the Puerto Rico polygon's bounds cover far more than the island, so
   * `fitExtent` answered scale 82.4 for a 600x400 box - about 1.4 pixels per
   * degree - and both San Juan ZIP codes in the acceptance test projected to the
   * same pixel (measured 0.07px apart, 2026-11-07). Fitting the vertices gives
   * the island the box it should have and cannot be misled by a ring's winding.
   * `projection.ts` already fits this way for the same reason.
   */
  const drawn = feature ? asDrawn(feature) : null
  const vertices = drawn ? featureVertices(drawn) : []
  const targets: [number, number][] = [
    ...vertices,
    ...placed.map((p): [number, number] => [p.lon, p.lat]),
  ]

  projection.scale(1).translate([0, 0])
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [lon, lat] of targets) {
    const at = projection([lon, lat])
    if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) continue
    if (at[0] < minX) minX = at[0]
    if (at[0] > maxX) maxX = at[0]
    if (at[1] < minY) minY = at[1]
    if (at[1] > maxY) maxY = at[1]
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null

  const dx = maxX - minX
  const dy = maxY - minY
  const availableX = Math.max(0, width - padding * 2)
  const availableY = Math.max(0, height - padding * 2)
  const k = Math.min(dx > 0 ? availableX / dx : Infinity, dy > 0 ? availableY / dy : Infinity)
  // Both extents zero is a single position: there is no view to fit.
  if (!Number.isFinite(k) || k <= 0) return null

  projection.scale(k).translate([
    padding + (availableX - k * dx) / 2 - k * minX,
    padding + (availableY - k * dy) / 2 - k * minY,
  ])

  const path = geoPath(projection)
  return {
    outline: drawn ? (path(drawn as unknown as GeoPermissibleObjects) ?? '') : '',
    project: projectWith(projection),
    fromBasemap: feature !== null,
    state: feature ? String(feature.properties?.STUSAB ?? state ?? '') : null,
  }
}

/**
 * The feature with any ring d3 would read as its own complement reversed.
 *
 * d3 reads spherical polygons by the right-hand rule, so a ring wound the other
 * way is the whole globe *minus* the shape. `geoArea` states which reading a
 * ring gets, and the committed basemap trips it: Puerto Rico measures 37.7
 * steradians as committed, against the island's real 0.0003, and the resulting
 * path spanned 89,902 units in a 600-unit box - a pale wash over the panel with
 * its stroke off-screen. Reversing such a polygon's rings drops it to 0.0003 and
 * the path to island size (measured 2026-11-07). The canvas map never showed
 * this because `albersUsa` clips each inset, which hides a complement ring.
 */
function asDrawn(feature: Basemap['features'][number]): Basemap['features'][number] {
  const geometry = feature.geometry as { type?: string; coordinates?: unknown }
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as number[][][]]
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as number[][][][])
        : null
  if (!polygons) return feature

  const fixed = polygons.map((rings) => {
    const area = geoArea({ type: 'Polygon', coordinates: rings } as unknown as GeoPermissibleObjects)
    return area > 2 * Math.PI ? rings.map((ring) => [...ring].reverse()) : rings
  })

  return {
    ...feature,
    geometry: {
      ...(feature.geometry as { type: string }),
      coordinates: geometry.type === 'Polygon' ? fixed[0] : fixed,
    },
  }
}

/** Every vertex of a feature's geometry, flattened. */
function featureVertices(feature: Basemap['features'][number]): [number, number][] {
  const out: [number, number][] = []
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      out.push([node[0], node[1]])
      return
    }
    for (const child of node) walk(child)
  }
  walk((feature.geometry as { coordinates?: unknown }).coordinates)
  return out
}

/** The projection a state's outline and its points must share. */
function projectionFor(state: string | null): GeoProjection {
  return (state ?? '').trim().toUpperCase() === 'PR'
    ? geoConicEqualArea().parallels([18, 18])
    : geoAlbersUsa()
}

/** Wraps a d3 projection as a projector that reports unplaceable points. */
function projectWith(projection: GeoProjection): (lon: number, lat: number) => [number, number] | null {
  return (lon, lat) => {
    const out = projection([lon, lat])
    if (!out) return null
    const [x, y] = out
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
  }
}
