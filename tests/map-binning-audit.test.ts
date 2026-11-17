/**
 * Champion Audit #75: does the coverage reversal make the map lie while it loads?
 *
 * The issue's own objective is representational stability: how much a bin's value
 * and colour move as loading goes from half to complete. This answers it by
 * replaying the sweep's real arrival order against the real 33,791 ZIP centroids,
 * through the shipped `hexbin`, `buildBins` and `binFor`. Nothing here
 * reimplements the champion; if the champion changes, these numbers change.
 *
 * Arrival order is not a guess. `planChunks` sorts the ZCTA list and slices it in
 * 800s, so a live sweep delivers ZIP codes in lexicographic order - early chunks
 * are a contiguous prefix of the ZIP range, which is geography, not a sample.
 *
 * LIMIT, stated because it decides how far these numbers travel: there are no ACS
 * values in the repository, so the value field is synthetic. Two fields are
 * measured, bracketing the plausible range - one smooth across neighbouring ZIPs
 * (a hexagon holds a neighbourhood, and neighbours resemble each other) and one
 * independent per ZIP. A band can only change when values inside a bin differ, so
 * churn is a property of the field's within-bin spread. The verdict is therefore
 * read from the comparison between mechanisms on the same field, never from an
 * absolute percentage.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeCentroids, type ZctaPoint } from '../src/core/map/centroids'
import { hexRadius, hexbin, type HexBin } from '../src/core/map/binning'
import { buildBins, binFor, NO_DATA_COLOR } from '../src/core/map/scale'
import { createView, fitBase, type Viewport } from '../src/core/map/projection'
import { CHUNK_SIZE, planChunks } from '../src/core/sweep/chunk'

const VIEWPORT: Viewport = { width: 1200, height: 700, scale: 1, offsetX: 0, offsetY: 0 }

/** Deterministic 0..1 from a string, with no PRNG state, so any stage is reproducible alone. */
function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

/**
 * The share of ZIP codes with no figure at all.
 *
 * Real ACS pulls are incomplete - some ZCTAs carry no estimate for a metric - and
 * that incompleteness is what the old coverage gate reacted to. A corpus where
 * every ZIP always has a value could not measure the gate's cost at all.
 */
const MISSING_SHARE = 0.15

type Field = 'smooth' | 'independent'

function valueFor(p: ZctaPoint, field: Field): number | null {
  // Missingness is deterministic and field-independent, so both fields withhold
  // exactly the same ZIP codes and the comparison is like for like.
  if (hash01(`${p.zcta}:missing`) < MISSING_SHARE) return null
  if (field === 'independent') return 30000 + 40000 * hash01(p.zcta)
  // Smooth: a large-scale gradient plus a small local wobble, the shape a real
  // income surface has at the scale of one hexagon.
  const gradient = 0.5 + 0.5 * Math.sin(p.lon / 4)
  const wobble = 0.25 * Math.sin(p.lat / 1.5)
  return 30000 + 50000 * Math.min(1, Math.max(0, gradient + wobble))
}

interface Screen {
  points: ZctaPoint[]
  xs: number[]
  ys: number[]
}

/** The default national view, built exactly as `MapView` builds it. */
function frozenScreen(): Screen {
  const raw = readFileSync(join(__dirname, '..', 'public', 'map', 'zcta-centroids.bin'))
  const points = decodeCentroids(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
  )
  const view = createView(fitBase(points), VIEWPORT, null)
  const pad = hexRadius(VIEWPORT.scale) * 2
  const kept: ZctaPoint[] = []
  const xs: number[] = []
  const ys: number[] = []
  for (const p of points) {
    const at = view.project(p.lon, p.lat)
    if (!at) continue
    const [x, y] = at
    if (x < -pad || x > VIEWPORT.width + pad || y < -pad || y > VIEWPORT.height + pad) continue
    kept.push(p)
    xs.push(x)
    ys.push(y)
  }
  return { points: kept, xs, ys }
}

interface Stage {
  loaded: number
  bins: HexBin[]
  colors: (string | null)[]
}

/** One load stage: the shipped binning over whatever has arrived so far. */
function stageAt(
  screen: Screen,
  values: (number | null)[],
  loaded: number,
  radius: number,
): Stage {
  const inputs = []
  for (let i = 0; i < loaded; i++) {
    const v = values[i]
    inputs.push({
      x: screen.xs[i]!,
      y: screen.ys[i]!,
      value: v === null ? Number.NaN : v,
      zctas: [screen.points[i]!.zcta],
    })
  }
  const bins = hexbin(inputs, radius)
  const bands = buildBins(bins.map((b) => b.value).filter((v): v is number => v !== null))
  const colors = bins.map(
    (b) => binFor(bands, b.value)?.color ?? (b.value === null ? NO_DATA_COLOR : null),
  )
  return { loaded, bins, colors }
}

/**
 * The comparator the issue names: the former >=50% coverage gate, replayed.
 *
 * A bin is coloured only when at least half of its ZIP codes carry a figure, and
 * grey otherwise, recomputed at every stage exactly as the map used to.
 */
function gatedColors(stage: Stage): string[] {
  return stage.bins.map((b, i) =>
    b.count > 0 && b.withValue / b.count >= 0.5 ? stage.colors[i]! : NO_DATA_COLOR,
  )
}

const BIN_KEY = (b: HexBin) => `${Math.round(b.cx)}:${Math.round(b.cy)}`

function churn(early: Map<string, string>, final: Map<string, string>): number {
  let changed = 0
  let compared = 0
  for (const [key, color] of early) {
    const later = final.get(key)
    if (later === undefined) continue
    compared++
    if (later !== color) changed++
  }
  return compared === 0 ? 0 : changed
}

function coverage(colors: readonly (string | null)[]): number {
  if (colors.length === 0) return 0
  return colors.filter((c) => c !== null && c !== NO_DATA_COLOR).length / colors.length
}

interface Measurement {
  field: Field
  zipCount: number
  binCount: number
  half: { champion: number; comparator: number }
  churnCount: { champion: number; comparator: number }
  churnPct: { champion: number; comparator: number }
  finalCoverage: { champion: number; comparator: number }
  coverageRatio: number
  churnReduction: number
  /** Bins that exist at half load, as a share of the bins that exist at all. */
  halfBinShare: number
  /** Mean longitude of the bins present at half load, against the final set. */
  halfMeanLon: number
  finalMeanLon: number
  /**
   * Churn with the legend held still: each bin's half-load median graded against
   * the final breaks. Isolates movement of the VALUE from movement of the BANDS.
   */
  valueChurnCount: number
  valueChurnPct: number
}

function measure(screen: Screen, field: Field): Measurement {
  const radius = hexRadius(VIEWPORT.scale)
  const values = screen.points.map((p) => valueFor(p, field))
  // Real arrival order: planChunks sorts lexicographically, then slices in 800s.
  const chunks = planChunks(screen.points.map((p) => p.zcta), CHUNK_SIZE)
  const arrivals: number[] = []
  let loaded = 0
  for (const chunk of chunks) {
    loaded += chunk.length
    arrivals.push(loaded)
  }

  const full = stageAt(screen, values, screen.points.length, radius)
  const halfIndex = arrivals.findIndex((n) => n >= screen.points.length / 2)
  const half = stageAt(screen, values, arrivals[halfIndex]!, radius)

  const colorMap = (stage: Stage, colors: string[]) =>
    new Map(stage.bins.map((b, i) => [BIN_KEY(b), colors[i]!] as const))

  const championHalf = half.colors.filter((c): c is string => c !== null)
  const halfColored = new Map<string, string>()
  half.bins.forEach((b, i) => {
    const c = half.colors[i]
    if (c !== null) halfColored.set(BIN_KEY(b), c)
  })
  const finalColored = new Map<string, string>()
  full.bins.forEach((b, i) => {
    const c = full.colors[i]
    if (c !== null) finalColored.set(BIN_KEY(b), c)
  })
  void championHalf

  const championChurn = churn(halfColored, finalColored)
  const championCompared = [...halfColored.keys()].filter((k) => finalColored.has(k)).length

  /*
   * Decomposition. `buildBins` re-derives its quantile breaks from the values
   * loaded at that moment, so a band can change because the bin's median moved
   * or merely because the legend moved under a median that did not. Those are
   * different defects for the reader and only the second is invisible in a
   * "band changed" count, so they are graded separately here: the same half-load
   * medians against the final breaks isolates the value.
   */
  const finalBands = buildBins(
    full.bins.map((b) => b.value).filter((v): v is number => v !== null),
  )
  let valueChurn = 0
  let valueCompared = 0
  for (const b of half.bins) {
    if (b.value === null) continue
    const finalColor = finalColored.get(BIN_KEY(b))
    if (finalColor === undefined) continue
    valueCompared++
    if ((binFor(finalBands, b.value)?.color ?? null) !== finalColor) valueChurn++
  }

  const comparatorEarly = colorMap(half, gatedColors(half))
  const comparatorFinal = colorMap(full, gatedColors(full))
  const comparatorChurn = churn(comparatorEarly, comparatorFinal)
  const comparatorCompared = [...comparatorEarly.keys()].filter((k) => comparatorFinal.has(k)).length

  const championCoverage = coverage(full.colors)
  const comparatorCoverage = coverage(gatedColors(full))

  // Geographic position of what has arrived, not of the bins: the point of the
  // hypothesis is that a ZIP-ordered sweep arrives region by region.
  const lonByZcta = new Map(screen.points.map((p, i) => [p.zcta, p.lon] as const))
  const meanLonOf = (bins: readonly HexBin[]) => {
    const lons = bins.flatMap((b) => b.zctas.map((z) => lonByZcta.get(z) ?? 0))
    return lons.length === 0 ? 0 : lons.reduce((n, lon) => n + lon, 0) / lons.length
  }

  return {
    field,
    zipCount: screen.points.length,
    binCount: full.bins.length,
    halfBinShare: full.bins.length === 0 ? 0 : half.bins.length / full.bins.length,
    halfMeanLon: meanLonOf(half.bins),
    finalMeanLon: meanLonOf(full.bins),
    valueChurnCount: valueChurn,
    valueChurnPct: valueCompared === 0 ? 0 : (100 * valueChurn) / valueCompared,
    half: { champion: championCompared, comparator: comparatorCompared },
    churnCount: { champion: championChurn, comparator: comparatorChurn },
    churnPct: {
      champion: championCompared === 0 ? 0 : (100 * championChurn) / championCompared,
      comparator: comparatorCompared === 0 ? 0 : (100 * comparatorChurn) / comparatorCompared,
    },
    finalCoverage: { champion: championCoverage, comparator: comparatorCoverage },
    coverageRatio: championCoverage === 0 ? 0 : comparatorCoverage / championCoverage,
    churnReduction: championChurn === 0 ? 0 : 1 - comparatorChurn / championChurn,
  }
}

const report = (m: Measurement) =>
  `${m.field}: ${m.zipCount} ZIPs, ${m.binCount} bins | at 50% load ${(100 * m.halfBinShare).toFixed(1)}% of bins exist, ` +
  `mean lon ${m.halfMeanLon.toFixed(1)} vs ${m.finalMeanLon.toFixed(1)} complete | ` +
  `band churn 50%->100% champion ${m.churnCount.champion}/${m.half.champion} (${m.churnPct.champion.toFixed(1)}%), ` +
  `comparator ${m.churnCount.comparator}/${m.half.comparator} (${m.churnPct.comparator.toFixed(1)}%) | ` +
  `value-only churn with the legend held still ${m.valueChurnCount} (${m.valueChurnPct.toFixed(1)}%) | ` +
  `final coverage champion ${(100 * m.finalCoverage.champion).toFixed(1)}%, ` +
  `comparator ${(100 * m.finalCoverage.comparator).toFixed(1)}% ` +
  `(ratio ${m.coverageRatio.toFixed(3)}) | churn reduction ${(100 * m.churnReduction).toFixed(1)}%`

describe('Champion Audit #75: hex aggregation and colour binning under partial load', () => {
  const screen = frozenScreen()
  const results = { smooth: measure(screen, 'smooth'), independent: measure(screen, 'independent') }

  it('replays the real screen: every on-screen ZIP lands in exactly one shipped bin', () => {
    const radius = hexRadius(VIEWPORT.scale)
    const values = screen.points.map((p) => valueFor(p, 'smooth'))
    const full = stageAt(screen, values, screen.points.length, radius)
    const total = full.bins.reduce((n, b) => n + b.count, 0)
    console.log(
      `frozen screen: ${screen.points.length} on-screen ZIPs, ${full.bins.length} bins at radius ${radius}`,
    )
    expect(screen.points.length).toBeGreaterThan(20000)
    expect(total).toBe(screen.points.length)
  })

  it('measures and prints the champion against the coverage-gate comparator', () => {
    console.log(report(results.smooth))
    console.log(report(results.independent))
    for (const m of [results.smooth, results.independent]) {
      expect(m.binCount).toBeGreaterThan(100)
      expect(m.half.champion).toBeGreaterThan(0)
      expect(m.churnPct.champion).toBeGreaterThanOrEqual(0)
    }
  })

  it('states whether the comparator meets the issue margin: churn down 30%, coverage >= 99%', () => {
    for (const m of [results.smooth, results.independent]) {
      const qualifies = m.churnReduction >= 0.3 && m.coverageRatio >= 0.99
      console.log(
        `${m.field}: churn reduction ${(100 * m.churnReduction).toFixed(1)}% ` +
          `(needs 30%), coverage ratio ${m.coverageRatio.toFixed(3)} (needs 0.99) -> ` +
          (qualifies ? 'COMPARATOR SHIPS' : 'NO CHANGE'),
      )
      // The gate is a labelling change, not a stability fix: it withholds colour
      // from the same bins the champion colours, and it cannot move churn by the
      // margin on either field. Recorded as an assertion so a later change to the
      // champion that would flip this verdict breaks this file on purpose.
      expect(m.churnReduction, `${m.field}: the gate moved churn by more than the margin`).toBeLessThan(0.3)
    }
  })

  it('arrival order is geographic: at half load the screen is a third full and biased east', () => {
    for (const m of [results.smooth, results.independent]) {
      // Not a rounding detail: it is the issue's own hypothesis, and it is worse
      // than "partial". A ZIP-ordered sweep has drawn about a third of the screen
      // and the mean longitude sits roughly ten degrees east of the finished map.
      expect(m.halfBinShare).toBeGreaterThan(0.2)
      expect(m.halfBinShare).toBeLessThan(0.45)
      expect(m.halfMeanLon).toBeGreaterThan(m.finalMeanLon + 5)
    }
  })

  it('the instability is the legend, not the median: values barely move', () => {
    for (const m of [results.smooth, results.independent]) {
      // The band churn above is three quarters of the coloured bins, but with the
      // final breaks held still the same medians change band almost never. So the
      // harm the issue hypothesised - sparse non-random subsets dragging a bin's
      // median - is not what happens here; re-deriving the quantile breaks at
      // every stage is.
      expect(m.valueChurnPct, `${m.field}: medians moved enough to explain band churn`).toBeLessThan(2)
      expect(m.churnPct.champion).toBeGreaterThan(m.valueChurnPct * 2)
    }
  })
})
