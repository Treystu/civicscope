/**
 * Request pacing and quota management.
 *
 * Every data source here is a free public service, and the Census Bureau in
 * particular documents a 500-request-per-day ceiling per key. That budget is
 * shared by every visitor who happens to use the same key, so spending it
 * carelessly is not just rude, it is how a key gets throttled for everyone.
 *
 * Three mechanisms, deliberately conservative because the API publishes no
 * rate-limit headers to inform a client:
 *
 *   1. A concurrency cap, so 34 chunks never become 34 simultaneous requests.
 *      Concurrency, not total volume, is what provokes a 503 on a heavy
 *      800-row query.
 *   2. A minimum interval between requests, with jitter so many clients do not
 *      synchronise into a thundering herd.
 *   3. A daily request budget, counted per key, so exhaustion is reported
 *      before it is hit rather than after.
 *
 * Backoff is handled in `http.ts`; this file owns pacing and budget.
 */

// Champion Audit #71 shipped these: the challenger met its margin offline
// (21.0s vs 30.8s) and cleared the bounded live window on 2026-11-11 - 43 live
// requests at 250ms/3 had zero 503s and finished 36.5% faster (11.6s vs 18.3s).
const MIN_INTERVAL_MS = 250
const MAX_CONCURRENCY = 3
const DEFAULT_DAILY_BUDGET = 450

export interface RateLimitConfig {
  minIntervalMs: number
  maxConcurrency: number
  dailyBudget: number
}

let config: RateLimitConfig = {
  minIntervalMs: MIN_INTERVAL_MS,
  maxConcurrency: MAX_CONCURRENCY,
  dailyBudget: DEFAULT_DAILY_BUDGET,
}

export function configureRateLimit(next: Partial<RateLimitConfig>): void {
  config = { ...config, ...next }
}

export function getRateLimit(): RateLimitConfig {
  return { ...config }
}

// ---------------------------------------------------------------- budget

export interface BudgetState {
  /** Requests used in the current UTC day. */
  used: number
  /** UTC day stamp, e.g. "2026-09-29". */
  day: string
}

const BUDGET_KEY = 'civicscope.censusBudget.v1'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function readBudget(): BudgetState {
  try {
    const raw = localStorage.getItem(BUDGET_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as BudgetState
      if (parsed.day === today()) return { used: parsed.used ?? 0, day: parsed.day }
    }
  } catch {
    /* storage unavailable; fall through to a fresh budget */
  }
  return { used: 0, day: today() }
}

function writeBudget(state: BudgetState): void {
  try {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(state))
  } catch {
    /* in-memory accounting still works for this session */
  }
}

let budget = readBudget()

export function budgetState(): { used: number; limit: number; remaining: number; day: string } {
  if (budget.day !== today()) budget = { used: 0, day: today() }
  return {
    used: budget.used,
    limit: config.dailyBudget,
    remaining: Math.max(0, config.dailyBudget - budget.used),
    day: budget.day,
  }
}

export function recordRequest(): void {
  if (budget.day !== today()) budget = { used: 0, day: today() }
  budget.used += 1
  writeBudget(budget)
}

/**
 * Requests held back from the country-wide sweep so a deep dive always works.
 *
 * The sweep is 43 requests against an allowance of 450, so it cannot actually
 * exhaust a day. The risk runs the other way and is less obvious: a reader who
 * opens a ZIP code, then browses ten more, has spent enough that the *next*
 * sweep — which is what makes their search meaningful — starts being refused
 * and the screen sits half-built.
 *
 * This is the floor the sweep stops at. A drilldown is not subject to it,
 * because the thing someone asked for in the last moment should not be the
 * thing that fails.
 */
const DRILLDOWN_RESERVE = 120

/** True when the remaining budget has fallen to the drilldown reserve. */
export function sweepBudgetExhausted(): boolean {
  return Math.max(0, getRateLimit().dailyBudget - budget.used) <= DRILLDOWN_RESERVE
}

export function resetBudget(): void {
  budget = { used: 0, day: today() }
  writeBudget(budget)
}

export class QuotaExhaustedError extends Error {
  constructor(public readonly state: ReturnType<typeof budgetState>) {
    super(
      `Daily request budget reached (${state.used} of ${state.limit}). ` +
        'Figures already fetched remain available from the local cache; new areas will load after the budget resets.',
    )
    this.name = 'QuotaExhaustedError'
  }
}

// ------------------------------------------------------------- scheduling

let active = 0
let lastStartedAt = 0
const queue: (() => void)[] = []

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Jitter avoids synchronising many clients onto the same instant. */
function jitter(base: number): number {
  return base * (0.75 + Math.random() * 0.5)
}

function pump(): void {
  if (active >= config.maxConcurrency) return
  const next = queue.shift()
  if (!next) return
  // The slot is reserved here, before the queued waiter resumes, so two waiters
  // cannot both observe a free slot and start together.
  active += 1
  next()
}

/** Reserves a concurrency slot. The interval is applied at start, in paced(). */
async function acquire(): Promise<void> {
  if (budgetState().remaining <= 0) throw new QuotaExhaustedError(budgetState())

  if (active < config.maxConcurrency) {
    active += 1
    return
  }

  // The slot is reserved by pump(), so the waiter resumes holding it.
  await new Promise<void>((resolve) => {
    queue.push(resolve)
    pump()
  })
}

function release(): void {
  active = Math.max(0, active - 1)
  pump()
}

/**
 * Waits until this request may start, serialised so two slots freed at the same
 * instant cannot both conclude they may go now.
 *
 * The start instant is deliberately NOT recorded here. It is recorded in
 * `paced`, in the same synchronous block that invokes the request. Recording it
 * inside this chain wrote the value one microtask - or, on a starved runner, one
 * OS preemption - before the request actually began, so the interval was
 * measured from a moment the request never started at. Head 4c833d0, verify job
 * 62, failed `starts[i] - starts[i - 1]` being 0 against a 30ms interval on a
 * commit that only edited a markdown file, and pipeline #11's verify job #32
 * failed the same assertion: both are that hop being longer than the interval.
 *
 * The chain serialises the decision for the same reason it always did: two
 * slots free at the same instant would otherwise both conclude they may start.
 */
let spacingChain: Promise<void> = Promise.resolve()

function spaceOut(need: number): Promise<void> {
  const next = spacingChain.then(async () => {
    const wait = need - (Date.now() - lastStartedAt)
    if (wait > 0) await sleep(wait)
  })
  // A failed spacing step must not poison every later request.
  spacingChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

/**
 * Runs a request under the pacing rules: concurrency-capped, spaced, and
 * counted against the daily budget.
 */
export async function paced<T>(fn: () => Promise<T>): Promise<T> {
  await acquire()
  try {
    // One jittered interval per request, shared by the wait and the re-check, so
    // the two cannot disagree about how much space this request was owed.
    const need = jitter(config.minIntervalMs)
    await spaceOut(need)
    // Re-check against the clock as late as it can be checked. A timer that
    // resumes late (a starved runner, a GC pause) leaves the gap short at the
    // moment of the check, and sleeping the remainder is the only way to keep
    // the promise that two requests did not start together.
    for (;;) {
      const gap = Date.now() - lastStartedAt
      if (gap >= need) break
      await sleep(Math.min(need - gap, 50))
    }
    lastStartedAt = Date.now()
    recordRequest()
    return await fn()
  } finally {
    release()
  }
}

/** Test seam: clears in-flight state so tests do not leak across cases. */
export function _resetPacing(): void {
  active = 0
  lastStartedAt = 0
  queue.length = 0
  spacingChain = Promise.resolve()
  budget = { used: 0, day: today() }
}
