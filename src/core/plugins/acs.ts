/**
 * ACS 5-year housing data, with two access shapes.
 *
 * Every table ID below was verified against the live Census variables API, and
 * two of the original ones were wrong in ways that would have produced
 * confidently incorrect numbers:
 *
 *   - `B25002_001E` is "Total OCCUPIED HOUSING UNITS", not households. It was
 *     labelled and displayed as a household count. Correct table is `B25001`.
 *   - `B25035_001E` is "Median YEAR STRUCTURE BUILT", not median home value.
 *     Correct table is `B25077`.
 *
 * Rent burden was originally interpolated from the `B25070` distribution
 * because the burden median was assumed not to exist. It does exist:
 * `B25071_001E` is a published median, which replaces our own arithmetic with
 * the Census Bureau's figure and removes a whole class of dispute.
 *
 * Access shapes:
 *   - `sweepNational` — every ZCTA in one request, for screening and filtering
 *   - `fetchArea`    — one or more specific ZCTAs, for drilldown
 *
 * The 5-year sample is used over the 1-year deliberately: it exists for every
 * geography including tracts, and its wider margins of error are surfaced to
 * the user rather than hidden.
 */

import { fetchCached } from '../executor'
import type { MetricValue, PluginRequest, QueryContext, SourceRef } from '../types'

const DATASET = 'acs/acs5'
const VINTAGE = '2023'

/** ACS variable identifiers, each verified against the live variables API. */
export const VARS = {
  /** Median gross rent, in dollars. */
  medianGrossRent: 'B25064_001E',
  medianGrossRentMoe: 'B25064_001M',
  /** Median value of owner-occupied units, in dollars. B25077, not B25035. */
  medianHomeValue: 'B25077_001E',
  medianHomeValueMoe: 'B25077_001M',
  /** Median household income, inflation-adjusted to the survey year. */
  medianHouseholdIncome: 'B19013_001E',
  medianHouseholdIncomeMoe: 'B19013_001M',
  /** Median gross rent as a share of household income. B25071, published. */
  medianRentBurden: 'B25071_001E',
  medianRentBurdenMoe: 'B25071_001M',
  /** Total households. B25001, not B25002. */
  households: 'B25001_001E',
  /** Renter-occupied units. */
  renterOccupied: 'B25003_003E',
  ownerOccupied: 'B25003_002E',
  /** Total population. */
  population: 'B01003_001E',
} as const

const TABLE_OF: Record<string, string> = {
  medianGrossRent: 'B25064',
  medianHomeValue: 'B25077',
  medianHouseholdIncome: 'B19013',
  medianRentBurden: 'B25071',
  households: 'B25001',
  renterOccupied: 'B25003',
  ownerOccupied: 'B25003',
  population: 'B01003',
}

function source(tableId: string, url: string): SourceRef {
  return {
    publisher: 'U.S. Census Bureau',
    dataset: 'American Community Survey 5-Year Estimates',
    tableId,
    vintage: VINTAGE,
    url,
    citation: `ACS 5-year ${VINTAGE}, table ${tableId}`,
  }
}

/**
 * ACS missing-value sentinels.
 *
 * The Census Bureau does not return null or blank for an absent estimate. It
 * returns a large negative number, documented as:
 *
 *   -666666666  N/A — the estimate is not applicable. Verified live: ZCTA 00786
 *                has no renter households, so median rent burden is N/A and the
 *                API returns -666666666 for it.
 *   -999999999  missing
 *   -888888888  not comparable (disjunct)
 *
 * Ratio tables such as B25071 return the same value with a decimal part, so the
 * comparison is made numerically rather than by string.
 *
 * These must never reach the screen. Displayed as a number, -666666666 renders
 * as "$-666,666,666/mo" and "-666666666%", which is not a placeholder but a
 * confidently wrong figure — the exact failure this project exists to prevent.
 */
const ACS_SENTINELS = new Set([-666666666, -999999999, -888888888])

/**
 * True when a raw ACS value is one of the missing-value sentinels.
 *
 * Tolerant of surrounding whitespace and trailing separators, because these
 * values arrive as strings from a comma-delimited payload and a stray character
 * is the difference between a null and a confidently wrong number.
 */
export function isAcsSentinel(v: unknown): boolean {
  if (typeof v === 'number') return ACS_SENTINELS.has(v)
  if (typeof v !== 'string') return false
  const n = Number(v.trim().replace(/[,;]$/, ''))
  return Number.isFinite(n) && ACS_SENTINELS.has(n)
}

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '-') return null
  if (typeof v === 'string') {
    const t = v.trim().replace(/[,;]$/, '')
    if (t === '') return null
    const n = Number(t)
    if (!Number.isFinite(n)) return null
    // A sentinel is an absent estimate, not a number.
    return ACS_SENTINELS.has(n) ? null : n
  }
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return ACS_SENTINELS.has(n) ? null : n
}

/** One row per geography, keyed by metric, for the screening table. */
export interface AreaRow {
  zcta: string
  name: string
  metrics: Record<string, number | null>
  moes: Record<string, number | null>
}

const METRIC_DEFS: {
  key: string
  label: string
  unit: MetricValue['unit']
  category: MetricValue['category']
  betterWhen: 'higher' | 'lower'
  note: string
}[] = [
  {
    key: 'median_gross_rent',
    label: 'Median gross rent',
    unit: 'usd_monthly',
    category: 'cost',
    betterWhen: 'lower',
    note: 'Gross rent includes utilities, so it runs above the advertised rent a listing would show.',
  },
  {
    key: 'median_rent_burden_pct',
    label: 'Median rent as share of income',
    unit: 'percent',
    category: 'cost',
    betterWhen: 'lower',
    note: 'Published by the Census Bureau, not calculated here. Above 30% is conventionally a housing cost burden.',
  },
  {
    key: 'median_home_value',
    label: 'Median home value',
    unit: 'usd',
    category: 'cost',
    betterWhen: 'lower',
    note: 'Value of owner-occupied units only, so areas with few owners may have no figure.',
  },
  {
    key: 'median_household_income',
    label: 'Median household income',
    unit: 'usd',
    category: 'cost',
    betterWhen: 'higher',
    note: 'Household income for the most recent 12 months, adjusted for inflation.',
  },
  {
    key: 'households',
    label: 'Households',
    unit: 'count',
    category: 'demographics',
    betterWhen: 'lower',
    note: 'All occupied housing units, owner and renter alike.',
  },
  {
    key: 'population',
    label: 'Population',
    unit: 'count',
    category: 'demographics',
    betterWhen: 'lower',
    note: 'Resident population.',
  },
  {
    key: 'renter_occupied',
    label: 'Renter-occupied units',
    unit: 'count',
    category: 'demographics',
    betterWhen: 'lower',
    note: 'Units occupied by renters.',
  },
]

export const METRIC_DEFS_BY_KEY = new Map(METRIC_DEFS.map((d) => [d.key, d]))

/**
 * Variables requested for the country-wide screen.
 *
 * Measured against the live API, because the obvious implementation is
 * unusably slow. A single wildcard query covering all 33,791 ZCTAs costs:
 *
 *   1 variable    ~20s
 *   4 variables   ~21s
 *  14 variables   ~65s   ← what this originally requested
 *
 * Fetch and parse are not the problem: parsing 3.9MB takes 24ms and mapping
 * 33k rows takes 10ms. The time is server-side in the Census API, and it grows
 * with the variable count.
 *
 * So the screen loads in two stages. The first request carries only the four
 * figures the screening table actually displays, which is roughly a third of
 * the latency, and it is enough to make the country sortable. Margins of error
 * and the remaining columns arrive in a second request afterwards, for the
 * areas the user actually drills into.
 */
export const SCREEN_VARS = [
  VARS.medianGrossRent,
  VARS.medianRentBurden,
  VARS.medianHouseholdIncome,
  VARS.households,
]

/** Everything else, fetched only for a selected area. */
const DETAIL_VARS = [
  VARS.medianGrossRent,
  VARS.medianGrossRentMoe,
  VARS.medianHomeValue,
  VARS.medianHomeValueMoe,
  VARS.medianHouseholdIncome,
  VARS.medianHouseholdIncomeMoe,
  VARS.medianRentBurden,
  VARS.medianRentBurdenMoe,
  VARS.households,
  VARS.population,
  VARS.renterOccupied,
  VARS.ownerOccupied,
]

/** Maps an ACS variable to the metric key the UI uses. */
const METRIC_FOR_VAR: Record<string, string> = {
  [VARS.medianGrossRent]: 'median_gross_rent',
  [VARS.medianHomeValue]: 'median_home_value',
  [VARS.medianHouseholdIncome]: 'median_household_income',
  [VARS.medianRentBurden]: 'median_rent_burden_pct',
  [VARS.households]: 'households',
  [VARS.population]: 'population',
  [VARS.renterOccupied]: 'renter_occupied',
  [VARS.ownerOccupied]: 'owner_occupied',
}

/**
 * Rejects any value that is not a plausible measurement, regardless of where
 * it came from.
 *
 * This exists because a cache hit bypasses the parser entirely. Rows cached
 * before the sentinel fix was shipped still hold -666666666 as a real number
 * under the same version stamp, so they were replayed straight into the table
 * and rendered as -666666666% and -$666,666,666. Version stamping alone did not
 * clear them, because the stamp was not changed when the parser changed.
 *
 * So every value that came out of storage is passed through this before use. A
 * negative number is never a valid figure from any of these tables, and a rate
 * above 100 percent is not either, so anything failing those is treated as
 * absent. This makes the guarantee independent of cache contents and of which
 * build wrote them.
 */
export function sanitiseMetricValue(value: unknown, unit?: string): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  if (isAcsSentinel(n)) return null
  // No ACS estimate in this set is negative. A negative value can only be a
  // missing-value encoding that slipped through, so it is treated as absent
  // rather than displayed.
  if (n < 0) return null
  if (unit === 'percent' && n > 100) return null
  return n
}

/** Applies sanitisation to a whole cached row. */
export function sanitiseAreaRow(row: AreaRow): AreaRow {
  const metrics: AreaRow['metrics'] = {}
  for (const [key, value] of Object.entries(row.metrics ?? {})) {
    const unit = key === 'median_rent_burden_pct' ? 'percent' : undefined
    const clean = sanitiseMetricValue(value, unit)
    if (clean !== null) metrics[key] = clean
  }
  const moes: AreaRow['moes'] = {}
  for (const [key, value] of Object.entries(row.moes ?? {})) {
    const clean = sanitiseMetricValue(value)
    if (clean !== null) moes[key] = clean
  }
  return { ...row, metrics, moes }
}

/**
 * Parses a raw ACS response into rows.
 *
 * The geography column position is derived from the returned header rather than
 * assumed, because the sweep and the detail query request different variable
 * sets and the trailing geography column lands in a different position.
 */
export function areaRowFromRaw(header: readonly string[], rows: readonly (readonly (string | number)[])[]): AreaRow[] {
  const col = (name: string): number => header.indexOf(name)
  const nameCol = col('NAME')

  const out: AreaRow[] = []
  for (const row of rows) {
    const label = String(row[nameCol] ?? '')
    const zcta = (label.match(/(\d{5})/) ?? [])[1]
    if (!zcta) continue

    const metrics: AreaRow['metrics'] = {}
    const moes: AreaRow['moes'] = {}
    for (const [varName, key] of Object.entries(METRIC_FOR_VAR)) {
      const i = col(varName)
      if (i >= 0) metrics[key] = toNum(row[i])
      const m = col(varName.replace(/_001E$/, '_001M'))
      if (m >= 0) {
        const v = toNum(row[m])
        if (v !== null) moes[key] = v
      }
    }
    out.push({ zcta, name: label.trim() || `ZCTA5 ${zcta}`, metrics, moes })
  }
  return out
}

/** One or more specific ZCTAs, for drilldown on a chosen area. */
export async function fetchAreas(
  zctas: readonly string[],
  censusKey: string,
  signal: AbortSignal,
): Promise<AreaRow[]> {
  if (zctas.length === 0) return []

  // Same limit as the sweep: the Census API rejects an over-long geography
  // string with a 400, and the limit is on URL length rather than row count.
  if (zctas.length > 800) {
    throw new Error(`a drilldown may not request more than 800 ZIP codes at once (got ${zctas.length})`)
  }

  // Unquoted, comma-separated. Quoting returns HTTP 400 from the Census API.
  const url =
    `https://api.census.gov/data/${VINTAGE}/${DATASET}` +
    `?get=NAME,${DETAIL_VARS.join(',')}` +
    `&for=${encodeURIComponent(`zip code tabulation area:${zctas.join(',')}`)}` +
    `&key=${encodeURIComponent(censusKey)}`

  const { body } = await fetchCached<unknown[]>(url, signal, 30 * 24 * 60 * 60 * 1000)

  // Shape validation, not status: the API answers HTTP 200 with an HTML error
  // page for a missing or invalid key.
  if (!Array.isArray(body) || !Array.isArray(body[0])) return []
  const header = (body[0] as unknown[]).map(String)
  const rows: (string | number)[][] = []
  for (let i = 1; i < body.length; i++) {
    const r = body[i]
    if (Array.isArray(r)) rows.push(r.map((c) => (c === null ? '' : String(c))))
  }
  return areaRowFromRaw(header, rows)
}

/** Converts a swept row into the standard metric shape for display. */
export function rowToMetrics(row: AreaRow): MetricValue[] {
  const out: MetricValue[] = []
  for (const def of METRIC_DEFS) {
    const value = row.metrics[def.key] ?? null
    const moe = row.moes[def.key] ?? undefined
    out.push({
      key: def.key,
      label: def.label,
      value,
      unit: def.unit,
      category: def.category,
      source: source(TABLE_OF[def.key] ?? 'ACS', `https://api.census.gov/data/${VINTAGE}/${DATASET}`),
      quality: { marginOfError: moe ?? undefined },
      betterWhen: def.betterWhen,
      note: def.note,
    })
  }
  return out
}

export const acsHousingPlugin: PluginRequest = {
  id: 'acs-housing',
  title: 'Housing cost and demographics (ACS)',
  category: 'cost',
  geography: 'zip',
  minZoom: 2,
  requiresCensusKey: true,
  legal: {
    suppressBelow: 20,
    notice:
      'ACS 5-year estimates carry a margin of error, shown beside every figure. Small areas are less reliable than large ones.',
  },

  async fetch(ctx: QueryContext): Promise<MetricValue[]> {
    const zip = ctx.geo?.zip
    if (!zip) return []
    const rows = await fetchAreas([zip], ctx.censusKey!, ctx.signal)
    const row = rows.find((r) => r.zcta === zip)
    return row ? rowToMetrics(row) : []
  },
}
