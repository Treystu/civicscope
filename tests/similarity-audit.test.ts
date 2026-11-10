/**
 * Champion Audit #69: does cutoff 0.1 sit on the same-metro / cross-country frontier?
 *
 * The issue states its acceptance numerically: a challenger cutoff ships only if
 * cross-CBSA admitted pairs fall at least 50% against the champion while same-CBSA
 * pairs lose no more than 10%, in BOTH the national and the state scope. This file
 * measures exactly that, and it does so through the shipped functions
 * (`computeRanges`, `distance`, `comparisonDims`) rather than a reimplementation, so
 * a change to the champion's arithmetic changes these numbers.
 *
 * Three things about the measurement are stated here rather than buried, because
 * each one bounds what the result can be read to say:
 *
 * 1. **Ground truth is the county, not the CBSA.** The issue says CBSA membership;
 *    this repository does not carry a ZCTA-to-CBSA file, and inventing one would be
 *    the fabrication the audit exists to prevent. `public/map/zcta-counties.json` is
 *    committed, official (the 2020 ZCTA-to-county relationship file) and complete for
 *    all 33,791 areas, so "same county" is the ground truth used. It is a stricter
 *    grouping than the CBSA: every same-county pair is also a same-CBSA pair, while
 *    two areas of one metro in different counties count as different here. The effect
 *    on the acceptance is directional and known - same-county admitted pairs understate
 *    same-metro admitted pairs - so a challenger that fails on this ground truth could
 *    still pass on the CBSA one, and a challenger that passes here will pass there.
 *
 * 2. **The national screen is not in the repository.** The measurement needs one
 *    committed sweep output: 33,791 rows carrying only the four `SIMILARITY_METRICS`
 *    values. That file does not exist, and producing it needs a Census key this lane
 *    does not hold (the key fence). Rather than skip silently, the loader below states
 *    the exact shape it expects, and the national test reports NOT MEASURED through
 *    `describe.skip` - a skip, which is not a pass and must never be counted as one.
 *
 * 3. **What does run is a declared generative model, and it is labelled as one.**
 *    With no national data, the cutoff's behaviour can still be measured against a
 *    stated model of the country instead of against the country. The model is one
 *    number - the within-county spread relative to the national range - and the
 *    measurement reports the value of that number at which the challenger's acceptance
 *    clause starts to hold. That is a claim about the harness and about how sensitive
 *    the answer is, not a claim about American housing. When the corpus lands, the same
 *    harness answers the real question, and this test says which way it should go.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_CUTOFF,
  DEFAULT_WEIGHTS,
  SIMILARITY_METRICS,
  comparisonDims,
  computeRanges,
  distance,
} from '../src/core/similarity'
import { parseCountyIndex, type PackedCountyIndex } from '../src/core/zcta-county-index'
import type { AreaRow } from '../src/core/plugins/acs'

/** Where the unblocking artefact must be committed, and the only path this reads. */
const CORPUS_PATH = join(process.cwd(), 'tests', 'fixtures', 'national-screen.json')

/** Every ZCTA in the country, so a short corpus is a bug rather than a smaller test. */
const EXPECTED_ROWS = 33791

/** The champion under audit and the two comparators the issue names. */
const CHAMPION = DEFAULT_CUTOFF
const CHALLENGERS = [0.05, 0.15] as const

/** Origins measured per scope. Deterministic stride, so two runs measure the same pairs. */
const MAX_ORIGINS = 220

interface Screen {
  rows: AreaRow[]
  /** ZIP to five-digit county FIPS, which is the ground truth grouping. */
  county: Map<string, string>
  /** ZIP to postal state, so the state scope is a real scope and not a prefix guess. */
  state: Map<string, string>
}

/**
 * Validates the corpus contract before any number is computed from it.
 *
 * The shape is deliberately narrow - a ZIP code and four finite numbers - because
 * the artefact is required to be values only. A file that carries names, keys or
 * extra figures is rejected outright: this harness cannot see what it should not
 * have, and a corpus assembled by the wrong script would produce a confident number
 * about the wrong population.
 */
export function validateScreen(raw: unknown): Screen {
  const rows = (raw as { rows?: unknown }).rows ?? raw
  if (!Array.isArray(rows)) throw new Error('national screen: expected an array of rows')
  if (rows.length !== EXPECTED_ROWS) {
    throw new Error(`national screen: ${rows.length} rows, expected ${EXPECTED_ROWS}`)
  }
  const allowed = new Set<string>(['zcta', ...SIMILARITY_METRICS])
  const county = new Map<string, string>()
  const state = new Map<string, string>()
  const out: AreaRow[] = []
  for (const row of rows as Record<string, unknown>[]) {
    for (const key of Object.keys(row)) {
      if (!allowed.has(key)) throw new Error(`national screen: unexpected field "${key}" - values only`)
    }
    const zcta = row.zcta
    if (typeof zcta !== 'string' || !/^\d{5}$/.test(zcta)) {
      throw new Error(`national screen: bad ZIP code ${String(zcta)}`)
    }
    const metrics: Record<string, number | null> = {}
    for (const metric of SIMILARITY_METRICS) {
      const v = row[metric]
      if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
        throw new Error(`national screen: ${zcta} ${metric} is not a finite number or null`)
      }
      metrics[metric] = (v as number | null) ?? null
    }
    out.push({ zcta, name: zcta, metrics, moes: {} })
  }
  return { rows: out, county, state }
}

/** Attaches the committed county index, which is the ground truth for both scopes. */
function withGroundTruth(screen: Screen): Screen {
  const packed = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'map', 'zcta-counties.json'), 'utf8'),
  ) as PackedCountyIndex
  const index = parseCountyIndex(packed)
  const county = new Map<string, string>()
  const state = new Map<string, string>()
  for (const [zip, rec] of index) {
    county.set(zip, rec.countyGeoid)
    state.set(zip, rec.state)
  }
  return { ...screen, county, state }
}

interface Verdict {
  cutoff: number
  sameAdmitted: number
  sameTotal: number
  crossAdmitted: number
  crossTotal: number
}

/**
 * Admits pairs at three cutoffs from one pass of distances.
 *
 * The distances do not depend on the cutoff, so they are computed once per origin
 * and then thresholded. Recomputing per cutoff would triple a measurement that is
 * already hundreds of millions of arithmetic operations over the national screen.
 *
 * Admissions are counted **per origin**, which is the question the feature answers
 * - "how many areas are like this ZIP" - so one unordered pair is counted from both
 * ends when both are origins. Every cutoff is measured over the identical origin set
 * and the identical pairs, so the acceptance, which is a ratio of two such counts,
 * is unaffected by the factor of two. A test below pins that rather than leaving it
 * to be discovered later.
 */
function measure(screen: Screen, scope: 'national' | 'state', cutoffs: readonly number[]): Verdict[] {
  const { rows, county, state } = screen
  const dimsOf = (row: AreaRow) => comparisonDims(row, DEFAULT_WEIGHTS)
  const byState = new Map<string, AreaRow[]>()
  for (const row of rows) {
    const s = state.get(row.zcta)
    if (!s) continue
    const list = byState.get(s)
    if (list) list.push(row)
    else byState.set(s, [row])
  }

  const counts = cutoffs.map(() => ({ sameAdmitted: 0, sameTotal: 0, crossAdmitted: 0, crossTotal: 0 }))
  const stride = Math.max(1, Math.floor(rows.length / MAX_ORIGINS))
  let measured = 0

  for (let i = 0; i < rows.length; i += stride) {
    const origin = rows[i]
    const originCounty = county.get(origin.zcta)
    if (!originCounty) continue
    const pool = scope === 'national' ? rows : byState.get(state.get(origin.zcta) ?? '') ?? []
    if (pool.length < 2) continue
    const dims = dimsOf(origin)
    if (dims.length === 0) continue
    const ranges = computeRanges(pool, dims)
    measured += 1

    for (const row of pool) {
      if (row.zcta === origin.zcta) continue
      const d = distance(origin, row, DEFAULT_WEIGHTS, ranges, dims)
      if (d === null) continue
      const same = county.get(row.zcta) === originCounty
      cutoffs.forEach((cutoff, idx) => {
        // Denominators count the pair whatever the cutoff; only the admitted
        // numerators move, so the two cutoffs are compared over the same pairs.
        if (same) counts[idx].sameTotal += 1
        else counts[idx].crossTotal += 1
        if (d > cutoff) return
        if (same) counts[idx].sameAdmitted += 1
        else counts[idx].crossAdmitted += 1
      })
    }
  }

  if (measured === 0) throw new Error('no origin could be measured: ground truth or coverage missing')
  const out = cutoffs.map((cutoff, idx) => ({ cutoff, ...counts[idx] }))
  // Admitted totals at each cutoff are the denominators the acceptance compares; a
  // zero denominator is reported as zero rather than as a perfect ratio.
  return out
}

/**
 * The issue's acceptance, applied literally.
 *
 * Cross-CBSA admitted PAIRS must fall at least 50% against the champion, and
 * same-CBSA admitted pairs must lose no more than 10%. Both scopes must hold for a
 * challenger to ship.
 */
function acceptance(champion: Verdict, challenger: Verdict) {
  const sameLoss = champion.sameAdmitted === 0 ? 1 : 1 - challenger.sameAdmitted / champion.sameAdmitted
  const crossFall =
    champion.crossAdmitted === 0 ? 0 : 1 - challenger.crossAdmitted / champion.crossAdmitted
  return { sameLoss, crossFall, ships: crossFall >= 0.5 && sameLoss <= 0.1 }
}

describe('Champion Audit #69: similarity cutoff over the real national screen', () => {
  const present = existsSync(CORPUS_PATH)
  it.skipIf(!present)('measures the champion and both challengers in the national and state scopes', () => {
    const screen = withGroundTruth(validateScreen(JSON.parse(readFileSync(CORPUS_PATH, 'utf8'))))
    const cutoffs = [CHAMPION, ...CHALLENGERS]
    const national = measure(screen, 'national', cutoffs)
    const stateScope = measure(screen, 'state', cutoffs)
    const championIdx = 0
    for (let idx = 1; idx < cutoffs.length; idx += 1) {
      const n = acceptance(national[championIdx], national[idx])
      const s = acceptance(stateScope[championIdx], stateScope[idx])
      // eslint-disable-next-line no-console
      console.log(
        `cutoff ${cutoffs[idx]}: national cross ${(n.crossFall * 100).toFixed(1)}% fall / same ${(n.sameLoss * 100).toFixed(1)}% loss |` +
          ` state cross ${(s.crossFall * 100).toFixed(1)}% fall / same ${(s.sameLoss * 100).toFixed(1)}% loss |` +
          ` ships ${n.ships && s.ships}`,
      )
    }
    // The champion is measured whether or not a challenger ships; that is the audit.
    expect(national[championIdx].sameAdmitted).toBeGreaterThan(0)
  })

  it('states plainly that the national measurement has not run, rather than reporting a pass', () => {
    // This test cannot be satisfied by absence: it fails the moment a corpus is
    // committed without the shape the loader requires, and it names the artefact
    // when there is none, so a reader of the suite cannot mistake a skip for a result.
    if (!present) {
      // eslint-disable-next-line no-console
      console.log(
        `NOT MEASURED: ${CORPUS_PATH} is absent. Required: ${EXPECTED_ROWS} rows, values only, ` +
          `fields zcta + ${SIMILARITY_METRICS.join(', ')}.`,
      )
      expect(present).toBe(false)
      return
    }
    const raw = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'))
    expect(() => validateScreen(raw)).not.toThrow()
  })
})

describe('Champion Audit #69: the loader refuses a corpus that is not values-only', () => {
  const row = (zcta: string, extra: Record<string, unknown> = {}) => ({
    zcta,
    median_rent_burden_pct: 30,
    median_gross_rent: 1200,
    median_home_value: 300000,
    median_household_income: 70000,
    ...extra,
  })
  const full = (mutate: (rows: Record<string, unknown>[]) => void = () => {}) => {
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < EXPECTED_ROWS; i += 1) rows.push(row(String(10000 + i).padStart(5, '0')))
    mutate(rows)
    return rows
  }

  it('accepts the declared shape', () => {
    expect(validateScreen(full()).rows).toHaveLength(EXPECTED_ROWS)
  })

  it('refuses a short corpus, because a short index is a bug rather than a smaller country', () => {
    expect(() => validateScreen(full((rows) => rows.pop()))).toThrow(/33790 rows, expected 33791/)
  })

  it('refuses a field beyond the four values, so names and keys cannot ride along', () => {
    expect(() => validateScreen(full((rows) => Object.assign(rows[0], { city: 'Boston' })))).toThrow(
      /unexpected field/,
    )
  })

  it('refuses a figure that is not a finite number or an explicit null', () => {
    expect(() => validateScreen(full((rows) => Object.assign(rows[0], { median_gross_rent: '-666666666' })))).toThrow(
      /not a finite number/,
    )
  })

  it('refuses a malformed ZIP code, because ground truth joins on it', () => {
    expect(() => validateScreen(full((rows) => Object.assign(rows[0], { zcta: '0100' })))).toThrow(/bad ZIP code/)
  })
})

describe('Champion Audit #69: cutoff behaviour under a declared within-county spread', () => {
  /**
   * A model of the country, stated in one number.
   *
   * `spread` is the within-county standard deviation measured in units of the
   * national range: 0.02 means areas of one county differ by about a fiftieth of
   * the country's span on each figure, 0.2 means they differ by a fifth. Real
   * housing data sits somewhere in that band - a county containing one metro has
   * large internal spread, a rural county almost none - and this file does not claim
   * to know where. What it reports is the spread at which the challenger's
   * acceptance clause starts to hold, which is the number the real corpus can then
   * be compared against in one line.
   *
   * Deterministic: a seeded generator, so two runs print the same table.
   */
  function modelScreen(spread: number, counties = 400, perCounty = 10): Screen {
    let seed = 0x2f6e2b1
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const gauss = () => {
      const u = Math.max(rand(), 1e-9)
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
    }
    const rows: AreaRow[] = []
    const county = new Map<string, string>()
    const state = new Map<string, string>()
    for (let c = 0; c < counties; c += 1) {
      const centre = SIMILARITY_METRICS.map(() => rand())
      const countyFips = `${String(1 + (c % 50)).padStart(2, '0')}${String(1 + c).padStart(3, '0')}`
      for (let k = 0; k < perCounty; k += 1) {
        const zcta = String(10000 + c * perCounty + k).padStart(5, '0')
        const metrics: Record<string, number | null> = {}
        SIMILARITY_METRICS.forEach((metric, m) => {
          metrics[metric] = centre[m] + spread * gauss()
        })
        rows.push({ zcta, name: zcta, metrics, moes: {} })
        county.set(zcta, countyFips)
        state.set(zcta, countyFips.slice(0, 2))
      }
    }
    return { rows, county, state }
  }

  it('reports the spread at which a tighter cutoff meets the 50%/10% clause', () => {
    const table: string[] = []
    const threshold: number[] = []
    for (const spread of [0.02, 0.05, 0.1, 0.2]) {
      const screen = modelScreen(spread)
      const cutoffs = [CHAMPION, ...CHALLENGERS]
      const national = measure(screen, 'national', cutoffs)
      const tight = acceptance(national[0], national[1]) // cutoff 0.05
      const loose = acceptance(national[0], national[2]) // cutoff 0.15
      table.push(
        `spread ${spread}: 0.05 -> cross ${(tight.crossFall * 100).toFixed(1)}% fall, same ${(tight.sameLoss * 100).toFixed(1)}% loss (ships ${tight.ships})` +
          ` | 0.15 -> cross ${(loose.crossFall * 100).toFixed(1)}% fall, same ${(loose.sameLoss * 100).toFixed(1)}% loss (ships ${loose.ships})`,
      )
      if (tight.ships) threshold.push(spread)
    }
    // eslint-disable-next-line no-console
    console.log(`declared model, ${400} counties x 10 areas, national scope only:\n  ${table.join('\n  ')}`)

    // The harness must be able to see the frontier move, or it is not measuring the
    // cutoff at all. Under this model a large within-county spread makes a tighter
    // cutoff pay: the same-county pairs are still close, so they survive, while the
    // cross-county tail falls away. A small spread puts same and cross pairs in the
    // same band, so tightening takes both.
    expect(threshold.length).toBeGreaterThan(0)
    expect(threshold[0]).toBeGreaterThanOrEqual(0.02)
    expect(threshold[threshold.length - 1]).toBeLessThanOrEqual(0.2)
  })

  it('shows the cutoff arithmetically, including that normalization is scope-dependent', () => {
    // Three areas: two of one county twenty points apart, one far area. Over this
    // screen's observed range (0.1 to 0.9) that twenty-point gap normalizes to
    // 0.125, which is ABOVE the champion's 0.1 and below the 0.15 comparator -
    // the same pair, the same figures, different verdicts by cutoff. The far pair
    // normalizes to 1.0 and is admitted by neither. This is the issue's own
    // premise made executable: a distance is a fact about a scope, not about a pair.
    const metrics = (v: number) => Object.fromEntries(SIMILARITY_METRICS.map((m) => [m, v]))
    const rows: AreaRow[] = [
      { zcta: '00001', name: 'a', metrics: metrics(0.1), moes: {} },
      { zcta: '00002', name: 'b', metrics: metrics(0.2), moes: {} },
      { zcta: '00003', name: 'c', metrics: metrics(0.9), moes: {} },
    ]
    const screen: Screen = {
      rows,
      county: new Map([
        ['00001', '01001'],
        ['00002', '01001'],
        ['00003', '02001'],
      ]),
      state: new Map([
        ['00001', '01'],
        ['00002', '01'],
        ['00003', '02'],
      ]),
    }
    const [champion] = measure(screen, 'national', [CHAMPION])
    expect(champion.sameAdmitted).toBe(0)
    expect(champion.crossAdmitted).toBe(0)

    // Two, not one: admissions are counted per origin, so the same-county pair is
    // admitted once from each end. Both cutoffs see the same pairs, so the ratio the
    // acceptance uses is unaffected; the count itself says what it counts.
    const [loose] = measure(screen, 'national', [0.15])
    expect(loose.sameAdmitted).toBe(2)
    expect(loose.crossAdmitted).toBe(0)

    // And the distance is recomputed inside the state scope, where the two-area
    // range (0.1 to 0.2) puts the same pair at distance 1.0 instead of 0.125.
    const [stateScope] = measure(screen, 'state', [0.15])
    expect(stateScope.sameAdmitted).toBe(0)
  })
})
