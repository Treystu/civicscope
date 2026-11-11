import { describe, expect, it } from 'vitest'
import { getRateLimit } from '../src/core/ratelimit'
import { CHUNK_SIZE, planChunks } from '../src/core/sweep/chunk'

/**
 * Champion audit #71: request pacing and daily budget allocation.
 *
 * A discrete-event replay of the shipped scheduler's semantics, not a copy of
 * its arithmetic: `paced()` spaces request *starts* by at least the minimum
 * interval (with jitter) and never holds more than `maxConcurrency` in flight.
 * Given a fixed per-request latency, the makespan of a 43-chunk sweep follows
 * from those two rules alone.
 *
 * The latency input (1,400 ms for an 800-row chunk) is the figure recorded in
 * docs/jev-roadmap.md from the live measurement, not a value chosen to make the
 * simulation come out a particular way. It is the only external input.
 *
 * What this cannot measure is 503 incidence: that needs a live window against
 * the real API, and it is exactly the half of the acceptance the issue defers
 * to a live A/B. It is reported as not measured.
 */

const REQUESTS = planChunks(Array.from({ length: 33791 }, (_, i) => String(i).padStart(5, '0')), CHUNK_SIZE).length
const CHUNK_LATENCY_MS = 1400

/** Makespan of N requests under a spacing rule and a concurrency cap. */
function makespan(n: number, minIntervalMs: number, maxConcurrency: number, latencyMs: number, jitterFactor = 1): number {
  const slotFree = new Array<number>(maxConcurrency).fill(0)
  let lastStart = -Infinity
  for (let i = 0; i < n; i++) {
    let slot = 0
    for (let s = 1; s < maxConcurrency; s++) if (slotFree[s]! < slotFree[slot]!) slot = s
    const spaced = i === 0 ? 0 : lastStart + minIntervalMs * jitterFactor
    const start = Math.max(slotFree[slot]!, spaced)
    slotFree[slot] = start + latencyMs
    lastStart = start
  }
  return Math.max(...slotFree)
}

describe('champion audit #71: pacing and budget', () => {
  it('replays the shipped constants', () => {
    const cfg = getRateLimit()
    expect(cfg.minIntervalMs).toBe(250)
    expect(cfg.maxConcurrency).toBe(3)
    expect(cfg.dailyBudget).toBe(450)
    expect(REQUESTS).toBe(43)
  })

  it('measures the champion makespan and the 250ms/3 challenger', () => {
    const champion = makespan(REQUESTS, 400, 2, CHUNK_LATENCY_MS)
    const challenger = makespan(REQUESTS, 250, 3, CHUNK_LATENCY_MS)

    // Concurrency, not spacing, binds the champion: 2 slots at 1.4s each is a
    // start every 700ms, slower than the 400ms spacing rule.
    expect(champion).toBe(30_800)
    expect(challenger).toBe(21_000)

    const improvement = (champion - challenger) / champion
    expect(improvement).toBeCloseTo(0.318, 3)
    // The acceptance margin is >=25%. It is met on the simulation, which is why
    // this item cannot be closed as no-change: the issue requires a bounded live
    // window next, and that window needs the Census key.
    expect(improvement).toBeGreaterThan(0.25)
  })

  it('bounds the number under the scheduler\u2019s own jitter', () => {
    // Jitter multiplies the interval by 0.75-1.25. It cannot make the champion
    // faster than its concurrency bound, so the conclusion is not a jitter artefact.
    const fast = makespan(REQUESTS, 400, 2, CHUNK_LATENCY_MS, 0.75)
    const slow = makespan(REQUESTS, 400, 2, CHUNK_LATENCY_MS, 1.25)
    expect(fast).toBe(30_800)
    expect(slow).toBe(30_800)
  })

  it('shows the drilldown reserve is inert for a first sweep', () => {
    // The issue hypothesises the 120-request reserve may strand budget. For a
    // sweep of 43 against a 450 budget it cannot bind at all: the reserve is only
    // reached once 330 requests have been spent.
    const budget = 450
    const reserve = 120
    expect(budget - REQUESTS).toBeGreaterThan(reserve)
    expect(budget - reserve).toBe(330)
    // The reserve only binds once 330 requests are already spent, so the exposure
    // the issue describes is real but requires heavy drilldown use first: a reader
    // who spends 330 on drilldowns cannot start a sweep at all. And the reserve is
    // larger than one sweep needs, which is the stranding the issue hypothesises:
    // 120 held back against a sweep that costs 43.
    expect(reserve).toBeGreaterThan(REQUESTS)
    expect(reserve - REQUESTS).toBe(77)
    expect(budget - reserve).toBe(330)
  })
})
