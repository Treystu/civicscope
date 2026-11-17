/**
 * The result map: the referenced state's outline drawn under the result marks.
 *
 * Row I12 of the integration plan is this layer. Before it, a drilldown drew its
 * ZIP codes on the country-wide map, where a two-result search is two pixels and
 * the state containing them is not named at all, so the panel read as a failed
 * search. The outline under the marks answers the question the reader actually
 * asks of a result map - "where is this?" - and `result-geometry.ts` fits both to
 * one projection so the outline cannot drift away from the marks it explains.
 *
 * SVG rather than the canvas `MapView` uses, for one reason: the outline arrives
 * as path data and path data is what an SVG `<path>` takes. A canvas would
 * re-parse the same string into a `Path2D` and lose the ability to assert on it
 * without a browser.
 *
 * Accessibility shape, matching the house rule that no surface may be the only
 * way to reach a figure: the drawing is one labelled image, and every mark is
 * also a list item carrying the place, the metric and its value or its stated
 * absence. A screen reader never has to interpret the picture.
 */
import { useEffect, useId, useMemo, useState } from 'react'

import { loadMapAssets, type Basemap } from '../core/map/projection'
import type { ZctaPoint } from '../core/map/centroids'
import { buildResultMapFit, type ResultMapFit } from '../core/map/result-geometry'
import {
  binFor,
  buildBins,
  formatValue,
  MAP_METRICS,
  NO_DATA_COLOR,
  NO_DATA_LABEL,
  RAMP,
  type MapMetricKey,
} from '../core/map/scale'
import { countyForZip, loadCountyIndex, type CountyIndexRecord } from '../core/zcta-county-index'
import type { MetricValue } from '../core/types'

/** The drawing box the fit is computed for; the SVG scales it to the panel. */
const BOX_WIDTH = 600
const BOX_HEIGHT = 400
const MARK_RADIUS = 7

export interface ResultMapPlace {
  zip: string
  name: string
}

export interface ResultMapProps {
  /** The places the current search selected, in the order they were chosen. */
  places: readonly ResultMapPlace[]
  /** Drilldown metrics by ZIP, so a mark can carry the figure a reader came for. */
  metricsByZip: Readonly<Record<string, readonly MetricValue[]>>
  metric?: MapMetricKey
}

interface Loaded {
  basemap: Basemap | null
  centroids: Map<string, ZctaPoint>
  counties: Map<string, CountyIndexRecord>
}

export function ResultMap({ places, metricsByZip, metric = 'median_rent_burden_pct' }: ResultMapProps) {
  const headingId = useId()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const active = MAP_METRICS.find((m) => m.key === metric) ?? MAP_METRICS[0]!

  useEffect(() => {
    let live = true
    const ctrl = new AbortController()
    void (async () => {
      try {
        const [{ centroids, basemap }, counties] = await Promise.all([
          loadMapAssets(ctrl.signal),
          loadCountyIndex(),
        ])
        if (!live) return
        setLoaded({
          basemap,
          centroids: new Map(centroids.map((point) => [point.zcta, point])),
          counties,
        })
      } catch (err) {
        if (!live) return
        setLoadError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      live = false
      ctrl.abort()
    }
  }, [])

  /*
   * One reference area, or none.
   *
   * Results can legitimately span states - a search near a border returns ZIPs
   * from both sides - and drawing one state's outline under marks from another
   * would place those marks outside the shape that is supposed to contain them.
   * So a cross-border result draws no outline and says why, instead of picking
   * the first state and implying the rest are in it.
   */
  const states = useMemo(() => {
    if (!loaded) return [] as string[]
    const found = new Set<string>()
    for (const place of places) {
      const state = countyForZip(loaded.counties, place.zip)?.state
      if (state) found.add(state)
    }
    return [...found].sort()
  }, [loaded, places])

  const marks = useMemo(() => {
    return places.map((place) => {
      const point = loaded?.centroids.get(place.zip)
      const values = metricsByZip[place.zip] ?? []
      const value = values.find((entry) => entry.key === metric)?.value ?? null
      return { ...place, lon: point?.lon ?? null, lat: point?.lat ?? null, value }
    })
  }, [places, loaded, metricsByZip, metric])

  const fit: ResultMapFit | null = useMemo(() => {
    if (!loaded) return null
    const placed = marks
      .filter((m): m is typeof m & { lon: number; lat: number } => m.lon !== null && m.lat !== null)
      .map((m) => ({ lon: m.lon, lat: m.lat }))
    return buildResultMapFit(
      loaded.basemap,
      states.length === 1 ? states[0]! : null,
      placed,
      BOX_WIDTH,
      BOX_HEIGHT,
    )
  }, [loaded, marks, states])

  const bins = useMemo(
    () => buildBins(marks.map((m) => m.value).filter((v): v is number => v !== null), RAMP),
    [marks],
  )

  const reference = states.length === 1 ? states[0]! : null

  return (
    <figure className="mt-6 panel panel-padded" data-result-map data-outline={fit?.fromBasemap ? 'drawn' : 'missing'}>
      <figcaption>
        <h2 id={headingId} className="text-sm font-semibold text-slate-900">
          Where these results are
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          {reference
            ? `Plotted inside ${reference}, the state the selected ZIP codes are mostly in. `
            : states.length > 1
              ? `These results span ${states.join(', ')}; no single state outline is drawn. `
              : 'The state for these results is not known yet. '}
          {active.label}
          {active.unit ? `, ${active.unit}` : ''}.
        </p>
      </figcaption>

      {loadError ? (
        <p className="mt-3 text-sm text-slate-700" role="status">
          The map could not be drawn ({loadError}). The figures below are unaffected.
        </p>
      ) : !loaded ? (
        <p className="mt-3 text-sm text-slate-600" role="status">
          Loading the state outline and ZIP positions.
        </p>
      ) : !fit ? (
        <p className="mt-3 text-sm text-slate-700" role="status">
          No selected ZIP has a position to draw yet, so nothing is plotted.
        </p>
      ) : (
        <>
          {!fit.fromBasemap && (
            <p className="mt-3 text-xs text-slate-600" role="status">
              The state outline is unavailable from this browser&rsquo;s basemap load; only the plotted
              positions are shown.
            </p>
          )}
          <svg
            viewBox={`0 0 ${BOX_WIDTH} ${BOX_HEIGHT}`}
            className="mt-3 w-full"
            role="img"
            aria-labelledby={headingId}
            data-result-map-svg
          >
            {fit.outline && (
              <path
                d={fit.outline}
                fill="#f1f5f9"
                stroke="#475569"
                strokeWidth={1.5}
                strokeLinejoin="round"
                data-result-map-outline
              />
            )}
            {marks.map((mark) => {
              if (mark.lon === null || mark.lat === null) return null
              const point = fit.project(mark.lon, mark.lat)
              if (!point) return null
              const bin = binFor(bins, mark.value)
              return (
                <circle
                  key={mark.zip}
                  cx={point[0]}
                  cy={point[1]}
                  r={MARK_RADIUS}
                  fill={bin?.color ?? NO_DATA_COLOR}
                  stroke="#0f172a"
                  strokeWidth={1.5}
                  data-result-map-mark={mark.zip}
                />
              )
            })}
          </svg>
        </>
      )}

      <ul className="mt-3 space-y-1 text-sm text-slate-800">
        {marks.map((mark) => (
          <li key={mark.zip}>
            <span className="font-medium">{mark.name}</span>{' '}
            <span className="text-slate-600">({mark.zip})</span>{' '}
            {mark.value === null ? (
              <span className="text-slate-600">{NO_DATA_LABEL} for {active.label.toLowerCase()}</span>
            ) : (
              <span>
                {formatValue(mark.value, active.unit)} {active.label.toLowerCase()}
              </span>
            )}
            {mark.lon === null && <span className="text-slate-600"> — position unavailable, not plotted</span>}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-slate-600">
        The drawing repeats the list above; every figure here is also in the screening table, which
        remains the accessible path to the data.
      </p>
    </figure>
  )
}
