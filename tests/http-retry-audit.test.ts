/**
 * Champion Audit #72: HTTP retry and backoff.
 *
 * Champion is `fetchResilient(url, init, attempts = 4)` replayed exactly as it
 * ships. Challenger is the same function at 3 attempts, the comparator named in
 * issue #72. Both see the same fault script and the same jitter draws, so the
 * comparison measures the schedule rather than the dice.
 *
 * Everything here is offline: the faults are scripted, `fetch` is stubbed, and
 * the waits are recorded rather than slept. Nothing changes the shipped
 * mechanism; a challenger ships only on the pre-stated acceptance in #72, and
 * that decision is the owner's.
 */
import { describe, expect, it, vi } from 'vitest'
import { fetchResilient } from '../src/core/http'

type Fault = { status: number; headers?: Record<string, string> } | { drop: true }
type Class = 'transient' | 'ratelimit' | 'network' | 'client' | 'shape'
interface Scenario {
  id: string
  cls: Class
  script: Fault[]
}

const realSetTimeout = globalThis.setTimeout

/** Deterministic 32-bit PRNG. A random corpus would move between runs, and then
 * the acceptance margin would never mean the same thing twice. */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const HTML_ERROR_BODY = '<!doctype html><html><body>Request could not be processed</body></html>'

/**
 * One replay. `getJson` is emulated after the response resolves: it reads the
 * body as JSON, so a 200 carrying an HTML error page fails here even though the
 * retry layer accepted it. That is the failure class #72's hypothesis names.
 */
async function replay(
  scenario: Scenario,
  attempts: number,
): Promise<{ recovered: boolean; calls: number; sleeps: number[]; latency: number }> {
  const sleeps: number[] = []
  let calls = 0
  const random = vi.spyOn(Math, 'random').mockImplementation(seeded(hash(scenario.id)))
  vi.stubGlobal('setTimeout', ((fn: () => void, ms: number) => {
    sleeps.push(ms)
    return realSetTimeout(fn, 0)
  }) as unknown as typeof setTimeout)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const fault = scenario.script[Math.min(calls, scenario.script.length - 1)]!
      calls += 1
      if ('drop' in fault) throw new TypeError('fetch failed')
      const body = fault.status === 200 ? (scenario.cls === 'shape' ? HTML_ERROR_BODY : '{"ok":true}') : null
      return new Response(body, { status: fault.status, headers: fault.headers })
    }),
  )

  let recovered = false
  try {
    const res = await fetchResilient(`https://example.test/${scenario.id}`, {}, attempts)
    if (res.ok) {
      await res.json()
      recovered = true
    }
  } catch {
    recovered = false
  } finally {
    random.mockRestore()
    vi.unstubAllGlobals()
  }
  return { recovered, calls, sleeps, latency: sleeps.reduce((a, b) => a + b, 0) }
}

function buildCorpus(): Scenario[] {
  const out: Scenario[] = []
  const burst = (n: number, fault: Fault): Fault[] => [...Array<Fault>(n).fill(fault), { status: 200 }]

  // Transient upstream overload: every retryable 5xx status at bursts of 1-3.
  for (const status of [500, 502, 503, 504, 529]) {
    for (const n of [1, 2, 3]) {
      out.push({ id: `${status}-burst${n}`, cls: 'transient', script: burst(n, { status }) })
    }
  }

  // Rate limiting, with and without the header that overrides the schedule.
  for (const n of [1, 2, 3]) {
    out.push({ id: `429-burst${n}`, cls: 'ratelimit', script: burst(n, { status: 429 }) })
  }
  for (const n of [1, 3]) {
    out.push({
      id: `429-retryafter2-burst${n}`,
      cls: 'ratelimit',
      script: burst(n, { status: 429, headers: { 'retry-after': '2' } }),
    })
  }

  // Connection drops: no response at all, so the separate linear path runs.
  for (const n of [1, 2, 3]) {
    out.push({ id: `drop-burst${n}`, cls: 'network', script: burst(n, { drop: true }) })
  }

  // Refusals: retrying any of these repeats a mistake.
  for (const status of [400, 401, 403, 404, 422]) {
    out.push({ id: `${status}-refusal`, cls: 'client', script: [{ status }] })
  }

  // Census answers some errors as HTTP 200 with an HTML page.
  out.push({ id: 'html200-first', cls: 'shape', script: [{ status: 200 }, { status: 200 }] })
  out.push({ id: 'html200-always', cls: 'shape', script: [{ status: 200 }] })

  return out
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!
}

describe('Champion Audit #72: retry schedule over a fault corpus', () => {
  const corpus = buildCorpus()

  it('replays the corpus and prints the measurement the audit records', async () => {
    const schedules = [4, 3]
    const runs = new Map<number, Awaited<ReturnType<typeof replay>>[]>()
    for (const attempts of schedules) {
      const list = []
      for (const scenario of corpus) list.push(await replay(scenario, attempts))
      runs.set(attempts, list)
    }

    const champion = runs.get(4)!
    const challenger = runs.get(3)!
    const transientClasses: Class[] = ['transient', 'ratelimit', 'network']
    const transientIdx = corpus.map((s, i) => (transientClasses.includes(s.cls) ? i : -1)).filter((i) => i >= 0)

    const summarize = (list: typeof champion, allowed: number) => {
      const latencies = list.map((r) => r.latency)
      const transient = transientIdx.map((i) => list[i]!.recovered)
      const clientRetries = corpus.reduce(
        (sum, s, i) => (s.cls === 'client' ? sum + (list[i]!.calls - 1) : sum),
        0,
      )
      return {
        success: list.filter((r) => r.recovered).length / list.length,
        transientSuccess: transient.filter(Boolean).length / transient.length,
        clientRetries,
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        usedEveryAttempt: list.filter((r) => r.calls === allowed).length,
        failed: list.filter((r) => !r.recovered).length,
        maxSleep: Math.max(...list.flatMap((r) => r.sleeps), 0),
      }
    }

    const a = summarize(champion, 4)
    const b = summarize(challenger, 3)

    console.log(`scenarios: ${corpus.length} (transient ${transientIdx.length}, client ${corpus.filter((s) => s.cls === 'client').length}, shape ${corpus.filter((s) => s.cls === 'shape').length})`)
    for (const [label, s] of [
      ['champion 4 attempts', a],
      ['challenger 3 attempts', b],
    ] as const) {
      console.log(
        `${label}: success ${(s.success * 100).toFixed(1)}%, transient success ${(s.transientSuccess * 100).toFixed(1)}%, ` +
          `400-class retries ${s.clientRetries}, added latency p50 ${s.p50}ms p95 ${s.p95}ms, ` +
          `scenarios that used every allowed attempt ${s.usedEveryAttempt}, failed ${s.failed}, largest single wait ${s.maxSleep}ms`,
      )
    }
    for (const [i, scenario] of corpus.entries()) {
      const r = champion[i]!
      console.log(
        `  ${scenario.id.padEnd(22)} ${scenario.cls.padEnd(9)} recovered ${r.recovered ? 'yes' : 'no '} ` +
          `attempts ${r.calls} added ${r.latency}ms waits [${r.sleeps.join(', ')}]`,
      )
    }

    // The corpus is the deliverable when the champion keeps, so every number the
    // document quotes is asserted here rather than copied by hand.
    expect(corpus).toHaveLength(30)

    // Champion holds every transient fault the corpus injects, including three
    // consecutive failures: attempt four is exactly what saves it.
    expect(a.transientSuccess).toBe(1)
    expect(champion[corpus.findIndex((s) => s.id === '503-burst3')]!.calls).toBe(4)

    // A refusal is never retried, at either schedule.
    expect(a.clientRetries).toBe(0)
    expect(b.clientRetries).toBe(0)

    // Attempt four is load-bearing: eight scenarios are recovered only by it.
    expect(a.usedEveryAttempt).toBe(8)
    expect(b.failed - a.failed).toBe(8)

    // The challenger loses every burst of three, so it fails the acceptance
    // outright: the margin requires a gain of two points, and the challenger
    // loses far more than that. No-change is the measured outcome.
    expect(b.transientSuccess - a.transientSuccess).toBeLessThan(0.02)
    for (const [i, scenario] of corpus.entries()) {
      if (scenario.script.filter((f) => !('status' in f && f.status === 200)).length >= 3) {
        expect(challenger[i]!.recovered).toBe(false)
      }
    }

    // The 12,000 ms ceiling holds after jitter. It did not before this audit:
    // jitter was applied after clamping, so the 429 series waited 18,000 ms at
    // attempt three. That is finding F2 in docs/champion-audit-72-http-retry.md,
    // and the fix is `Math.min(ceiling, ...)` in `backoffMs`.
    expect(a.maxSleep).toBeLessThanOrEqual(12_000)
    expect(champion[corpus.findIndex((s) => s.id === '429-burst3')]!.sleeps.every((ms) => ms <= 12_000)).toBe(true)

    // A 200 carrying an error page is accepted by the retry layer and dies in the
    // caller, so the retryable-status set never sees this failure class.
    const shapeIdx = corpus.map((s, i) => (s.cls === 'shape' ? i : -1)).filter((i) => i >= 0)
    for (const i of shapeIdx) {
      expect(champion[i]!.recovered).toBe(false)
      expect(champion[i]!.calls).toBe(1)
    }
  })

  it('the backoff ceiling binds, and 30,000 ms is only reachable through Retry-After', async () => {
    // #72 records "ceilings 12,000 / 30,000 ms". Measured: at four attempts the
    // exponential series reaches 3,000 ms (5xx) and 12,000 ms (429) before jitter,
    // and the 12,000 ms clamp now applies after jitter too, so the worst computed
    // wait is 4,500 ms for a 5xx and 12,000 ms for a 429. The 30,000 ms figure is
    // the Retry-After cap, which lives in `fetchResilient` and is exercised at the
    // end of this test.
    const worst = vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    const waits: number[] = []
    vi.stubGlobal('setTimeout', ((fn: () => void, ms: number) => {
      waits.push(ms)
      return realSetTimeout(fn, 0)
    }) as unknown as typeof setTimeout)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 429, headers: { 'retry-after': '0' } })),
    )
    try {
      await fetchResilient('https://example.test/429-worst', {}, 4)
    } finally {
      worst.mockRestore()
      vi.unstubAllGlobals()
    }
    // 3,000 / 6,000 / 12,000 before jitter, multiplied by the worst-case 1.5 and
    // then clamped: the last term is 12,000, not 18,000.
    expect(waits).toEqual([4500, 9000, 12000])
    expect(Math.max(...waits)).toBeLessThanOrEqual(12_000)
  })

  it('Retry-After is capped at 30,000 ms, which is the only path that reaches it', async () => {
    const waits: number[] = []
    vi.stubGlobal('setTimeout', ((fn: () => void, ms: number) => {
      waits.push(ms)
      return realSetTimeout(fn, 0)
    }) as unknown as typeof setTimeout)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 429, headers: { 'retry-after': '120' } })),
    )
    try {
      await fetchResilient('https://example.test/429-retryafter-cap', {}, 2)
    } finally {
      vi.unstubAllGlobals()
    }
    // 120 s is honoured only as far as the documented cap.
    expect(waits).toEqual([30_000])
  })
})
