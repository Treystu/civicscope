import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { executePlugins, PluginRegistry } from './executor'
import { acsHousingPlugin, fetchAreas, rowToMetrics, type AreaRow } from './plugins/acs'
import { cdcPlacesPlugin } from './plugins/keyless'
import { enrichWithTracts } from './plugins/geography'
import { ncesSchoolCorePlugin } from './plugins/schools'
import { STATE_SCHOOL_PLUGINS } from './plugins/ny-schools'
import { runSweep, type SweepProgress, type SweepScope } from './sweep/runSweep'
import { CHUNK_SIZE, groupByState, listAllZctas, type ZctasByPrefix } from './sweep/chunk'
import { describeScope, estimateChunks, stateOptions, toggleState, type StateOption } from './sweep/states'
import { formatPlace, geocode } from './geocode'
import { getCensusKey, CENSUS_KEY_EVENT } from './censusKey'
import { getQuota, onQuotaChange, type QuotaState } from './http'
import { scoreBoth, type Composite } from './scoring'
import type { MetricValue, QueryContext, ResolvedPlace, ZoomLevel } from './types'

export const registry = new PluginRegistry().registerAll([
  acsHousingPlugin,
  cdcPlacesPlugin,
  ncesSchoolCorePlugin,
  // Per-state plugins. Each covers one state's own assessment data; the list is
  // the extension point, so adding a state is a single registration.
  ...STATE_SCHOOL_PLUGINS,
])

export type SweepStatus = 'idle' | 'loading' | 'ready' | 'error' | 'needs-key'
export interface DrillState {
  zcta: string
  label: string
  metrics: MetricValue[]
  composites: Composite[]
  loading: boolean
  error?: string
  /** True when a school district was found, so the UI can disclose what is absent. */
  hasSchools?: boolean
}

export interface QueryState {
  status: 'idle' | 'searching' | 'error'
  error?: string
  /** Country-wide screen, filled in progressively as chunks land. */
  sweep: AreaRow[]
  sweepStatus: SweepStatus
  sweepError?: string
  /** Which two-digit state prefixes are in scope; empty means the whole country. */
  sweepScope: string[]
  sweepProgress?: SweepProgress
  /** True when at least one chunk was served from local cache. */
  sweepFromCache: boolean
  selected: ResolvedPlace[]
  drilldowns: Record<string, DrillState>
  censusKeyPresent: boolean
  quota: QuotaState
  zoom: ZoomLevel
}

const initial: QueryState = {
  status: 'idle',
  sweep: [],
  sweepStatus: 'idle',
  sweepScope: [],
  sweepFromCache: false,
  selected: [],
  drilldowns: {},
  censusKeyPresent: Boolean(getCensusKey()),
  quota: getQuota(),
  zoom: 2,
}

/**
 * Plugins run at each drilldown depth.
 *
 * The per-state school plugins are included at every depth rather than being
 * listed by hand, so a newly added state participates automatically instead of
 * needing a second edit here. Each one filters to its own state internally, so
 * running them for an area in another state simply yields nothing.
 */
const STATE_PLUGIN_IDS = STATE_SCHOOL_PLUGINS.map((p) => p.id)

const DRILL_PLUGINS: Record<ZoomLevel, string[]> = {
  0: [],
  1: [],
  2: [],
  3: ['cdc-places', ...STATE_PLUGIN_IDS],
  4: ['cdc-places', 'nces-school-core', ...STATE_PLUGIN_IDS],
}

export function useHousingQuery() {
  const [state, setState] = useState<QueryState>(initial)
  const sweepAbort = useRef<AbortController | null>(null)
  const drillAbort = useRef<Record<string, AbortController>>({})
  const runRef = useRef<((text: string, zoom: ZoomLevel) => Promise<void>) | null>(null)
  const lastSearch = useRef<{ text: string; zoom: ZoomLevel } | null>(null)
  const [, setQuotaTick] = useState(0)

  useEffect(() => onQuotaChange(() => setQuotaTick((t) => t + 1)), [])

  /**
   * Loads the country-wide screen in chunks.
   *
   * The previous implementation issued one wildcard request for every ZCTA,
   * which is roughly 34x the number of geographies the Census API accepts in a
   * single call. It failed or timed out. It is now chunked at the measured
   * ceiling of 1,000 ZCTAs per request, with each chunk cached independently,
   * so a dropped connection costs one chunk rather than the whole load.
   */
  const loadSweep = useCallback(async (scope: SweepScope = { states: [] }) => {
    if (!getCensusKey()) {
      setState((s) => ({ ...s, sweepStatus: 'needs-key', censusKeyPresent: false }))
      return
    }
    sweepAbort.current?.abort()
    const ctrl = new AbortController()
    sweepAbort.current = ctrl
    setState((s) => ({ ...s, sweepStatus: 'loading', censusKeyPresent: true, sweepError: undefined }))

    try {
      const { rows, manifest } = await runSweep({
        scope,
        signal: ctrl.signal,
        onRows: (partial, progress) => {
          if (ctrl.signal.aborted) return
          setState((s) => ({ ...s, sweep: partial, sweepProgress: progress }))
        },
        onProgress: (progress) => {
          if (ctrl.signal.aborted) return
          setState((s) => ({ ...s, sweepProgress: progress }))
        },
      })
      if (ctrl.signal.aborted) return
      const failed = manifest.chunks.filter((c) => c.status === 'failed').length
      setState((s) => ({
        ...s,
        sweepStatus: 'ready',
        sweep: rows,
        sweepScope: scope.states,
        sweepFromCache: manifest.fromCache === true,
        sweepError: failed
          ? `${failed} of ${manifest.chunks.length} areas could not be loaded. Everything shown is real; retry for the rest.`
          : undefined,
      }))
    } catch (err) {
      if (ctrl.signal.aborted) return
      setState((s) => ({
        ...s,
        sweepStatus: 'error',
        sweepError: err instanceof Error ? err.message : 'The country-wide screen could not be loaded',
      }))
    }
  }, [])

  /** Adds a place to the comparison set and fetches its detail. */
  const selectPlace = useCallback(
    async (place: ResolvedPlace, zoom: ZoomLevel = state.zoom) => {
      const zcta = place.zip
      if (!zcta) return

      setState((s) => ({
        ...s,
        selected: s.selected.some((p) => p.zip === zcta) ? s.selected : [...s.selected, place],
        drilldowns: {
          ...s.drilldowns,
          [zcta]: { zcta, label: formatPlace(place), metrics: [], composites: [], loading: true },
        },
      }))

      const key = getCensusKey()

      drillAbort.current[zcta]?.abort()
      const ctrl = new AbortController()
      drillAbort.current[zcta] = ctrl

      // A Census key is not required for every drilldown source. The NCES
      // district lookup, the CDC PLACES measures, and the per-state school
      // plugins are all keyless, so returning early when the key is absent
      // silently discarded all of them. The key is passed through as optional
      // and only the key-requiring plugins are skipped by the executor.
      const ctx: QueryContext = { geo: place, zoom, censusKey: key, signal: ctrl.signal }
      const signal = ctrl.signal

      // The NCES boundary lookup is a point query, so a selected ZIP needs
      // coordinates. The search box and the sweep table both supply an area
      // without them, so they are resolved here rather than in the UI.
      if (place.lat === undefined || place.lon === undefined) {
        try {
          const { places } = await geocode(zcta, signal)
          const hit = places.find((p) => p.zip === zcta) ?? places[0]
          if (hit) {
            place = { ...place, lat: hit.lat, lon: hit.lon, county: hit.county ?? place.county, state: hit.state ?? place.state }
            ctx.geo = place
          }
        } catch {
          // A ZIP with no resolvable point simply gets no school panel; the
          // rest of the drilldown is unaffected.
        }
      }
      if (signal.aborted) return

      try {
        await enrichWithTracts(ctx)
        if (signal.aborted) return

        const results = await executePlugins({
          registry,
          ids: DRILL_PLUGINS[zoom],
          ctx,
        })
        if (signal.aborted) return

        // ACS detail for the selected ZIP, plus whatever the drilldown plugins
        // produced. The sweep already has the headline figures, but fetching
        // the specific row keeps the drilldown self-contained and correct if
        // the sweep was loaded from a stale cache.
        const areaRows = key ? await fetchAreas([zcta], key, signal) : []
        if (signal.aborted) return
        const areaRow = areaRows.find((r) => r.zcta === zcta)

        const metrics = [...(areaRow ? rowToMetrics(areaRow) : []), ...results.flatMap((r) => r.metrics)]

        setState((s) => ({
          ...s,
          drilldowns: {
            ...s.drilldowns,
            [zcta]: {
              zcta,
              label: formatPlace(place),
              metrics,
              composites: scoreBoth(metrics),
              loading: false,
              hasSchools: results.some(
                (r) => (r.pluginId === 'nces-school-core' || r.pluginId === 'nysed-school-detail') && r.status === 'ok',
              ),
            },
          },
        }))
      } catch (err) {
        if (signal.aborted) return
        setState((s) => ({
          ...s,
          drilldowns: {
            ...s.drilldowns,
            [zcta]: {
              zcta,
              label: formatPlace(place),
              metrics: [],
              composites: [],
              loading: false,
              error: err instanceof Error ? err.message : 'Detail lookup failed',
            },
          },
        }))
      }
    },
    [state.zoom],
  )

  const deselect = useCallback((zcta: string) => {
    drillAbort.current[zcta]?.abort()
    delete drillAbort.current[zcta]
    setState((s) => {
      const drilldowns = { ...s.drilldowns }
      delete drilldowns[zcta]
      return { ...s, selected: s.selected.filter((p) => p.zip !== zcta), drilldowns }
    })
  }, [])

  /** Free-text place search, used to add an area to the comparison set. */
  const search = useCallback(
    async (text: string, zoom: ZoomLevel) => {
      lastSearch.current = { text, zoom }
      setState((s) => ({ ...s, status: 'searching', error: undefined, zoom }))

      const ctrl = new AbortController()
      try {
        const { places, notUsZip } = await geocode(text, ctrl.signal)
        if (notUsZip) {
          // The Census Bureau has a ZCTA record for every US ZIP code, so a
          // miss here means the code is not a US ZIP, and saying so is more
          // useful than a bare "not found".
          setState((s) => ({
            ...s,
            status: 'error',
            error: `"${text}" is not a US ZIP code. This tool covers United States data only — there are about 33,800 of them.`,
          }))
          return
        }
        if (places.length === 0) {
          setState((s) => ({
            ...s,
            status: 'error',
            error: `We could not find "${text}". Try a 5-digit US ZIP code.`,
          }))
          return
        }
        setState((s) => ({ ...s, status: 'idle' }))
        await selectPlace(places[0]!, zoom)
      } catch (err) {
        setState((s) => ({ ...s, status: 'error', error: err instanceof Error ? err.message : 'Lookup failed' }))
      }
    },
    [selectPlace],
  )

  // A newly saved key unlocks the sweep, which is the whole dataset.
  useEffect(() => {
    const onKeyChange = () => {
      setState((s) => ({ ...s, censusKeyPresent: Boolean(getCensusKey()) }))
      void loadSweep()
    }
    window.addEventListener(CENSUS_KEY_EVENT, onKeyChange)
    return () => window.removeEventListener(CENSUS_KEY_EVENT, onKeyChange)
  }, [loadSweep])

  useEffect(() => {
    if (getCensusKey()) void loadSweep()
  }, [loadSweep])

  useEffect(
    () => () => {
      sweepAbort.current?.abort()
      Object.values(drillAbort.current).forEach((a) => a.abort())
    },
    [],
  )

  useEffect(() => {
    runRef.current = search
  }, [search])

  /**
   * Enumerates the national ZCTA list once, keylessly, so the state picker can
   * show real counts before the user commits to a scope. Doing this on demand
   * rather than on load keeps the first paint instant.
   */
  const [stateList, setStateList] = useState<ZctasByPrefix[] | null>(null)
  const [stateScope, setStateScope] = useState<string[]>([])
  const stateAbort = useRef<AbortController | null>(null)

  const loadStateList = useCallback(async () => {
    if (stateList) return stateList
    stateAbort.current?.abort()
    const ctrl = new AbortController()
    stateAbort.current = ctrl
    try {
      const all = await listAllZctas(ctrl.signal)
      const groups = groupByState(all)
      setStateList(groups)
      return groups
    } catch {
      return null
    }
  }, [stateList])

  const applyScope = useCallback(
    async (states: string[]) => {
      setStateScope(states)
      await loadSweep({ states })
    },
    [loadSweep],
  )

  const stateChoices: StateOption[] = useMemo(() => (stateList ? stateOptions(stateList) : []), [stateList])
  const totalChunks = useMemo(
    () => estimateChunks(stateList?.reduce((n, g) => n + g.zctas.length, 0) ?? 33791, CHUNK_SIZE),
    [stateList],
  )
  const scopeChunks = useMemo(
    () =>
      estimateChunks(
        stateList
          ? stateList.filter((g) => stateScope.length === 0 || stateScope.includes(g.zip)).reduce((n, g) => n + g.zctas.length, 0)
          : 0,
        CHUNK_SIZE,
      ),
    [stateList, stateScope],
  )

  useEffect(
    () => () => {
      stateAbort.current?.abort()
    },
    [],
  )

  const selectedZctas = useMemo(() => state.selected.map((p) => p.zip).filter((z): z is string => Boolean(z)), [state.selected])

  return {
    ...state,
    selectedZctas,
    loadSweep,
    applyScope,
    loadStateList,
    stateChoices,
    stateScope,
    setStateScope,
    toggleState: (code: string) => setStateScope((cur) => toggleState(cur, code)),
    totalChunks,
    scopeChunks,
    scopeLabel: describeScope(stateScope),
    selectPlace,
    deselect,
    search,
    quota: getQuota(),
  }
}
