import { useEffect, useMemo, useRef, useState } from 'react'
import { useHousingQuery } from '../core/useHousingQuery'
import { ZOOM_LABELS, type ZoomLevel } from '../core/types'
import { FairHousingNotice } from './FairHousingNotice'
import { KeyPrompt } from './KeyPrompt'
import { Methodology } from './Methodology'
import { SweepTable } from './SweepTable'
import { Comparison } from './Comparison'
import { FundingSection } from './Funding'
import { StateFilter } from './StateFilter'

type View = 'explore' | 'methodology'

/**
 * Screening presets.
 *
 * A preset is a named, published filter configuration the user chooses. It
 * changes which criterion the country-wide screen sorts by; it never changes
 * the underlying data, and every figure remains visible. We do not rank places
 * or declare a best option — the user picks the criteria and the ordering.
 */
const PRESETS = [
  { id: 'renter', label: 'Renting', sort: 'median_rent_burden_pct' as const },
  { id: 'cheap', label: 'Cheapest rent', sort: 'median_gross_rent' as const },
  { id: 'income', label: 'Higher income', sort: 'median_household_income' as const },
  { id: 'scale', label: 'Most households', sort: 'households' as const },
]

const DEFAULT_PRESET = PRESETS[0]!

const num = new Intl.NumberFormat('en-US')

/** The ACS release the cached figures come from, so a cached number is never read as current. */
const VINTAGE_LABEL = '2023 5-year release'

export default function App() {
  const [view, setView] = useState<View>('explore')
  const [term, setTerm] = useState('')
  const [preset, setPreset] = useState<string>('budget')
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const [zoom, setZoom] = useState<ZoomLevel>(4)
  const [limit, setLimit] = useState(50)
  const statusRef = useRef<HTMLParagraphElement>(null)

  const q = useHousingQuery()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (term.trim()) void q.search(term.trim(), zoom)
  }

  // Announce async state to assistive technology. With a sweep of ~41,000 rows
  // the loading transition is substantial, and silence here would strand a
  // screen-reader user.
  useEffect(() => {
    const el = statusRef.current
    if (!el) return
    if (q.sweepStatus === 'loading') {
      const p = q.sweepProgress
      el.textContent = p
        ? `Loading ${p.scope}: ${p.done} of ${p.total} areas, ${num.format(p.rows)} ZIP codes so far.`
        : 'Loading housing data for ZIP codes.'
    } else if (q.sweepStatus === 'ready')
      el.textContent = `Loaded ${num.format(q.sweep.length)} ZIP codes${q.sweepScope.length ? '' : ' for the whole country'}.`
    else if (q.sweepStatus === 'needs-key') el.textContent = 'A free Census key is needed to load the data.'
    else if (q.sweepStatus === 'error') el.textContent = q.sweepError ?? 'Could not load the data.'
    else if (q.status === 'error') el.textContent = q.error ?? 'Something went wrong.'
  }, [
    q.sweepStatus,
    q.sweep.length,
    q.sweepError,
    q.sweepScope.length,
    q.sweepProgress?.done,
    q.sweepProgress?.total,
    q.sweepProgress?.rows,
    q.sweepProgress?.scope,
    q.status,
    q.error,
  ])


  // Affordability screen, derived from the sweep. This is the "check every ZIP
  // code for one aspect" capability: the whole country is already in memory, so
  // a filter is a local operation and costs nothing.
  const activePreset = PRESETS.find((p) => p.id === preset) ?? DEFAULT_PRESET

  const sweepRows = useMemo(() => {
    if (q.sweep.length === 0) return []
    const key = activePreset.sort
    const populated = q.sweep.filter((r) => r.metrics[key] !== null)
    return [...populated].sort((a, b) => (a.metrics[key] ?? 0) - (b.metrics[key] ?? 0))
  }, [q.sweep, activePreset.sort])

  const totalPopulated = useMemo(
    () => (q.sweep.length === 0 ? 0 : q.sweep.filter((r) => r.metrics[activePreset.sort] !== null).length),
    [q.sweep, activePreset.sort],
  )

  const matches = sweepRows.slice(0, limit)

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">CivicScope</h1>
            <p className="text-sm text-slate-600">
              Every ZIP code in the US, from federal data, in your browser.
            </p>
          </div>
          <nav aria-label="Primary">
            <ul className="flex gap-1 text-sm">
              {(
                [
                  ['explore', 'Explore'],
                  ['methodology', 'Methodology'],
                ] as const
              ).map(([id, label]) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setView(id)}
                    aria-current={view === id ? 'page' : undefined}
                    className={`rounded-md px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                      view === id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-7xl px-4 py-6">
        {view === 'methodology' ? (
          <Methodology />
        ) : (
          <>
            <section aria-labelledby="search-heading" className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 id="search-heading" className="text-sm font-semibold text-slate-900">
                Look up a specific ZIP code
              </h2>
              <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
                <label htmlFor="place" className="sr-only">
                  US ZIP code
                </label>
                <input
                  id="place"
                  type="text"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="e.g. 78701"
                  inputMode="numeric"
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                />
                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                >
                  Add to comparison
                </button>
              </form>

              <fieldset className="mt-4">
                <legend className="text-sm font-medium text-slate-800">How much detail to fetch</legend>
                <p className="mt-1 text-xs text-slate-600">
                  Deeper levels fetch more datasets for the areas you select. The country-wide screen is
                  already loaded either way.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {([2, 3, 4] as ZoomLevel[]).map((z) => (
                    <label
                      key={z}
                      className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${
                        zoom === z ? 'border-slate-700 bg-slate-100 text-slate-900' : 'border-slate-300 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="zoom"
                        value={z}
                        checked={zoom === z}
                        onChange={() => setZoom(z)}
                        className="sr-only"
                      />
                      {ZOOM_LABELS[z]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <p ref={statusRef} role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-slate-700" />

              {q.status === 'error' && (
                <p className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-900" role="alert">
                  {q.error}
                </p>
              )}
            </section>

            {q.sweepStatus === 'needs-key' && !showKeyPrompt && (
              <button
                type="button"
                onClick={() => setShowKeyPrompt(true)}
                className="mt-4 w-full rounded-lg border border-amber-300 bg-amber-50 p-4 text-left text-sm hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-900"
              >
                <span className="font-semibold text-amber-950">Load every ZIP code in the country — free.</span>
                <span className="mt-1 block text-amber-900">
                  The Census Bureau requires a free API key so they can track usage. It takes about a minute,
                  and your key is stored only in this browser. We never see it and keep no record of your
                  searches.
                </span>
              </button>
            )}

            {showKeyPrompt && (
              <div className="mt-4">
                <KeyPrompt onDismiss={() => setShowKeyPrompt(false)} />
              </div>
            )}

            {q.sweepStatus === 'needs-key' && !showKeyPrompt && (
              <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">What you can do without a key</h2>
                <p className="mt-1 text-sm text-slate-700">
                  Add a ZIP code above to see its detail. Geocoding, census-tract boundaries, school district
                  funding, and health measures all work without a key; the full country-wide screen needs one.
                </p>
                <FundingSection />
              </section>
            )}

            {q.sweepStatus === 'idle' && q.censusKeyPresent && (
              <div className="mt-4">
                <StateFilter
                  options={q.stateChoices}
                  selected={q.stateScope}
                  onToggle={q.toggleState}
                  onClear={() => q.setStateScope([])}
                  onApply={() => void q.applyScope(q.stateScope)}
                  totalChunks={q.totalChunks}
                  scopeChunks={q.scopeChunks}
                  busy={false}
                />
              </div>
            )}
            {q.sweepStatus === 'loading' && (
              <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4" role="status" aria-busy="true">
                <h2 className="text-sm font-semibold text-slate-900">
                  Loading {q.sweepProgress?.scope ?? 'housing data'}
                </h2>
                {q.sweepProgress ? (
                  <>
                    {/* aria-busy above tells assistive tech the region is
                        still updating; the bar is decorative, the text
                        carries the actual state. */}
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full bg-slate-900 transition-[width] duration-300"
                        style={{
                          width: `${q.sweepProgress.total ? Math.round((q.sweepProgress.done / q.sweepProgress.total) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-slate-700">
                      {q.sweepProgress.done} of {q.sweepProgress.total} areas ·{' '}
                      {num.format(q.sweepProgress.rows)} ZIP codes ready
                      {q.sweepProgress.failed > 0 && ` · ${q.sweepProgress.failed} failed`}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-700">Working out which areas to load…</p>
                )}
                <p className="mt-2 text-sm text-slate-700">
                  <strong>You do not have to wait.</strong> Look up a ZIP code above and you will get its full
                  figures immediately — that request is separate and takes a couple of seconds.
                </p>
              </section>
            )}

            {q.sweepStatus === 'error' && (
              <p className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-900" role="alert">
                The country-wide load failed: {q.sweepError}. Individual ZIP lookups still work.{' '}
                <button type="button" onClick={() => void q.loadSweep()} className="underline">
                  Try again
                </button>
              </p>
            )}

            {/* The screen appears as soon as the first chunk lands rather than
                after the last one. During a 43-chunk country-wide load this is
                the difference between a usable table after a second and a blank
                page for two minutes. */}
            {q.sweep.length > 0 && (
              <>
                <section aria-labelledby="screen-heading" className="mt-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id="screen-heading" className="text-lg font-semibold text-slate-900">
                      Screen every ZIP code
                    </h2>
                    <p className="text-xs text-slate-500">
                      {num.format(q.sweep.length)} areas loaded
                      {q.sweepFromCache ? ' from local cache' : ''} · {q.quota.used} request
                      {q.quota.used === 1 ? '' : 's'} from this browser
                    </p>
                  </div>

                  <fieldset className="mt-3">
                    <legend className="text-sm font-medium text-slate-800">Which aspect matters most?</legend>
                    <p className="mt-1 text-xs text-slate-600">
                      This selects the screening criterion. It never hides a figure and never changes the data.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {PRESETS.map((p) => (
                        <label
                          key={p.id}
                          className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${
                            preset === p.id
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="preset"
                            value={p.id}
                            checked={preset === p.id}
                            onChange={() => setPreset(p.id)}
                            className="sr-only"
                          />
                          <span className="font-medium">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <SweepTable
                    rows={sweepRows}
                    initialSort={activePreset.sort}
                    onAdd={(zcta) => {
                      const row = q.sweep.find((r) => r.zcta === zcta)
                      if (!row) return
                      void q.selectPlace({ name: row.name, zip: zcta }, zoom)
                    }}
                    selectedZctas={q.selectedZctas}
                    visibleCount={matches.length}
                    totalCount={totalPopulated}
                    onShowMore={() => setLimit((l) => l + 100)}
                  />
                </section>

                <Comparison drilldowns={q.drilldowns} onDeselect={q.deselect} />
              </>
            )}

            {q.sweep.length > 0 && (
              <>
                {/*
                  The figures are cached so a revisit is instant, which means a
                  number on screen may be days old. Saying so is the difference
                  between a cache that feels fast and one that misleads.
                */}
                {q.sweepFromCache && (
                  <p className="mt-2 text-xs text-slate-500">
                    Loaded from this browser&rsquo;s local cache. Figures come from the American Community
                    Survey {VINTAGE_LABEL} and update annually; use Refresh in the cache panel to re-fetch.
                  </p>
                )}
                {q.sweepError && (
                  <p className="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900" role="status">
                    {q.sweepError}
                  </p>
                )}
              </>
            )}

            {/* Detail for areas selected before a key was added. */}
            {q.selected.length > 0 && q.sweepStatus !== 'ready' && (
              <Comparison drilldowns={q.drilldowns} onDeselect={q.deselect} />
            )}

            {/*
              The Fair Housing notice is rendered unconditionally whenever
              neighbourhood data is on screen. It used to sit inside the
              "sweep loaded" branch, which meant it disappeared for exactly the
              visitors who had not yet added a Census key — the people least
              informed about how to read the figures. It is a legal disclosure,
              not a decoration, so its presence cannot depend on application
              state.
            */}
            {q.selected.length > 0 && <FundingSection />}

            {q.selected.length > 0 && (
              <div className="mt-8">
                <FairHousingNotice />
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-6 text-xs text-slate-600">
          <p>
            CivicScope is free, open, and carries no advertising. It does not sell, broker, or refer listings
            and does not accept payment for placement in any result.
          </p>
          <p className="mt-2">
            Data is fetched directly from its publishers by your browser. We operate no server that records
            your searches, and we hold no copy of the data.
          </p>
          <p className="mt-2">
            This product uses the Census Bureau Data API but is not endorsed or certified by the Census
            Bureau. Geocoding by OpenStreetMap contributors (ODbL).
          </p>
        </div>
      </footer>
    </div>
  )
}

