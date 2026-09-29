import { useMemo, useState } from 'react'
import type { AreaRow } from '../core/plugins/acs'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('en-US')

/**
 * Columns available in the country-wide screen.
 *
 * The screen query carries only these four figures, because the Census API's
 * latency for a 33,791-row wildcard query scales with the variable count
 * (1 var ~20s, 4 vars ~21s, 14 vars ~65s). Home value, population and tenure
 * are real and are shown in full once an area is selected, via the detail
 * query. The screen never shows a column it has no data for, because an empty
 * column reads as "no such housing here" rather than "not loaded yet".
 */
const COLUMNS = [
  { key: 'zcta', label: 'ZIP', sort: null },
  { key: 'median_rent_burden_pct', label: 'Rent burden', sort: 'median_rent_burden_pct' as const },
  { key: 'median_gross_rent', label: 'Median rent', sort: 'median_gross_rent' as const },
  { key: 'median_household_income', label: 'Median income', sort: 'median_household_income' as const },
  { key: 'households', label: 'Households', sort: 'households' as const },
] as const

function fmt(value: number | null, unit: string): string {
  if (value === null) return '—'
  if (unit === 'percent') return `${value}%`
  if (unit === 'usd_monthly') return `${usd.format(value)}/mo`
  if (unit === 'usd') return usd.format(value)
  return num.format(value)
}

const UNIT_OF: Record<string, string> = {
  median_rent_burden_pct: 'percent',
  median_gross_rent: 'usd_monthly',
  median_home_value: 'usd',
  median_household_income: 'usd',
  households: 'count',
  population: 'count',
}

/**
 * The country-wide screening table.
 *
 * This is the surface that makes a single request worth it: the entire country
 * is already in memory, so sorting and filtering are local operations with no
 * further requests and no quota cost. The user chooses what to sort by and can
 * put any number of areas into the comparison set.
 *
 * Every column is sortable but nothing is pre-sorted into a "best" list, and no
 * cell recommends a place. The ordering is always something the user picked.
 */
export function SweepTable({
  rows,
  onAdd,
  selectedZctas,
  initialSort,
  visibleCount,
  totalCount,
  onShowMore,
}: {
  rows: AreaRow[]
  onAdd: (zcta: string) => void
  selectedZctas: string[]
  initialSort: (typeof COLUMNS)[number]['sort']
  visibleCount: number
  totalCount: number
  onShowMore: () => void
}) {
  const [sortKey, setSortKey] = useState<(typeof COLUMNS)[number]['sort']>(initialSort)
  const [asc, setAsc] = useState(true)
  const [filter, setFilter] = useState('')

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const arr = [...rows]
    arr.sort((a, b) => {
      const av = a.metrics[sortKey] ?? null
      const bv = b.metrics[sortKey] ?? null
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      return asc ? av - bv : bv - av
    })
    return arr
  }, [rows, sortKey, asc])

  const visible = useMemo(() => {
    const f = filter.trim()
    if (!f) return sorted
    return sorted.filter((r) => r.zcta.startsWith(f) || r.name.toLowerCase().includes(f.toLowerCase()))
  }, [sorted, filter])

  function header(col: (typeof COLUMNS)[number]) {
    if (!col.sort) {
      return <th scope="col" className="px-2 py-2 text-left font-semibold text-slate-700">{col.label}</th>
    }
    const active = sortKey === col.sort
    return (
      <th scope="col" className="px-2 py-2 text-left font-semibold text-slate-700" aria-sort={active ? (asc ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          onClick={() => {
            if (active) setAsc((v) => !v)
            else {
              setSortKey(col.sort)
              setAsc(true)
            }
          }}
          className="inline-flex items-center gap-1 rounded hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700"
        >
          {col.label}
          <span aria-hidden="true" className="text-xs">
            {active ? (asc ? '▲' : '▼') : '↕'}
          </span>
        </button>
      </th>
    )
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="zip-filter" className="block text-xs font-medium text-slate-700">
            Filter ZIP codes
          </label>
          <input
            id="zip-filter"
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value.replace(/\D/g, '').slice(0, 5))}
            inputMode="numeric"
            placeholder="787"
            className="mt-1 w-28 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          />
        </div>
        <p className="text-xs text-slate-600">
          {num.format(visible.length)} shown. Select areas to compare them side by side.
        </p>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="px-3 py-2 text-left text-xs text-slate-600">
            US ZIP code tabulation areas, American Community Survey 5-year estimates. Every column is
            sortable; no ordering is recommended.
          </caption>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>{COLUMNS.map((c) => header(c))}<th scope="col" className="px-2 py-2"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {visible.slice(0, 200).map((r) => {
              const isSelected = selectedZctas.includes(r.zcta)
              return (
                <tr key={r.zcta} className="border-b border-slate-100 hover:bg-slate-50">
                  <th scope="row" className="px-2 py-1.5 font-mono font-normal text-slate-900">
                    {r.zcta}
                  </th>
                  {COLUMNS.filter((c) => c.sort).map((c) => (
                    <td key={c.key} className="px-2 py-1.5 tabular-nums text-slate-700">
                      {fmt(r.metrics[c.sort!] ?? null, UNIT_OF[c.sort!] ?? 'count')}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => onAdd(r.zcta)}
                      disabled={isSelected}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700"
                    >
                      {isSelected ? 'Added' : 'Compare'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {visibleCount > 200 && (
        <div className="mt-3 flex items-center gap-3">
          <p className="text-xs text-slate-600">
            Showing {num.format(Math.min(200, visible.length))} of {num.format(totalCount)}.
          </p>
          <button
            type="button"
            onClick={onShowMore}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-700"
          >
            Show more
          </button>
        </div>
      )}
    </div>
  )
}
