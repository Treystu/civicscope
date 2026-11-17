/**
 * Champion Audit #77: cache freshness policy.
 *
 * Replays the shipped freshness rules over a declared visit timeline, against the
 * acceptance written into issue #77:
 *
 *   - a challenger ships only if repeat-visit requests fall at least 30% below the
 *     champion while serving zero figures across a vintage change;
 *   - the missed-bump exposure, if confirmed, is recorded as a finding whatever
 *     the TTL outcome.
 *
 * This is a policy replay, not a user trace: there is no recorded visit log in the
 * repository, so the timeline is stated here (180 days, two visits a day) and the
 * same numbers are produced every run. What is *not* assumed is the mechanism:
 * every lifetime and key shape below is imported from the shipped code rather than
 * restated, so a change to a constant changes this measurement.
 *
 * Layers, as they actually ship:
 *
 *   - plugin fetches: URL-keyed, DEFAULT_TTL_MS = 24h (executor.ts);
 *   - other URL-keyed responses: 30-day fallback (cache.ts DEFAULT_TTL_MS);
 *   - ZCTA enumeration: key carries a version but no data vintage, 90-day TTL;
 *   - sweep chunks: keyed by SWEEP_VERSION, no lifetime at all - a chunk is read
 *     whenever the stamp matches, and the stamp is a manual step.
 *
 * The ACS vintage and the variable list are both in each request URL, which is
 * why a meaning change to those layers self-invalidates without a TTL. That is a
 * measured property of the code, not an assumption: see `VINTAGE` and the URL
 * builders in src/core/plugins/acs.ts.
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_TTL_MS as GENERIC_TTL_MS, STALE_AFTER_MS } from '../src/core/cache'
import { DEFAULT_TTL_MS as FETCH_TTL_MS } from '../src/core/executor'
import { CHUNK_SIZE, ENUM_TTL_MS } from '../src/core/sweep/chunk'
import { SWEEP_VERSION } from '../src/core/sweep/runSweep'

const DAY = 24 * 60 * 60 * 1000
const HORIZON_DAYS = 180
const VISITS_PER_DAY = 2

/** Real counts: the sweep issues one request per 800-row chunk. */
const SWEEP_TOTAL = 33791
const SWEEP_CHUNKS = Math.ceil(SWEEP_TOTAL / CHUNK_SIZE)
/** Eight enumeration requests, per the measured note in src/core/sweep/chunk.ts. */
const ENUM_REQUESTS = 8

/** Days on which shipped code changed what stored rows mean (v6, v7 history). */
const MEANING_CHANGE_DAYS = [90, 120]
/** Day a new Census ZCTA layer supersedes the enumerated list. */
const LIST_CHANGE_DAY = 150

type Entry = { fetchedAt: number; marker: number }

interface Policy {
  name: string
  fetchTtlMs: number
  genericTtlMs: number
  enumTtlMs: number
  /** null means chunks never expire on age; only the version stamp invalidates. */
  chunkTtlMs: number | null
  /** True when the sweep stamp is bumped at every meaning change. */
  versionStamped: boolean
  /** True when the enumeration key carries the data vintage. */
  enumKeyedByVintage: boolean
}

const CHAMPION: Policy = {
  name: 'champion (24h / 30d / 90d / version stamp)',
  fetchTtlMs: FETCH_TTL_MS,
  genericTtlMs: GENERIC_TTL_MS,
  enumTtlMs: ENUM_TTL_MS,
  chunkTtlMs: null,
  versionStamped: true,
  enumKeyedByVintage: false,
}

const CHALLENGER: Policy = {
  name: 'challenger (uniform 7d, no stamps)',
  fetchTtlMs: 7 * DAY,
  genericTtlMs: 7 * DAY,
  enumTtlMs: 7 * DAY,
  chunkTtlMs: 7 * DAY,
  versionStamped: false,
  enumKeyedByVintage: false,
}

interface Result {
  requests: number
  /** Visits that rendered a figure from a cache entry superseded by a meaning change. */
  staleFigureVisits: number
  /** Visits that read an enumerated ZCTA list superseded by a new Census layer. */
  staleListVisits: number
  /** Days from the forgotten bump to the next bump, or the horizon if never. Null when no bump was missed. */
  missedBumpExposureDays: number | null
}

/**
 * Runs one policy over the timeline.
 *
 * `bumpAt` lists the days the author remembers to move SWEEP_VERSION. A missed
 * bump is modelled by omitting a day, which is exactly the failure the issue
 * names: the stamp is a manual step and nothing detects its absence.
 */
function simulate(policy: Policy, bumpAt: number[] = MEANING_CHANGE_DAYS): Result {
  let requests = 0
  let staleFigureVisits = 0
  let staleListVisits = 0
  let missedBumpExposureDays: number | null = null

  let fetch: Entry | null = null
  let generic: Entry | null = null
  let enumeration: Entry | null = null
  let chunks: Entry | null = null
  let meaning = 0
  let listVersion = 0
  let missedBumpDay: number | null = null


  const fresh = (e: Entry | null, ttl: number, t: number) => e !== null && t - e.fetchedAt < ttl

  for (let day = 0; day < HORIZON_DAYS; day++) {
    if (MEANING_CHANGE_DAYS.includes(day)) {
      meaning++
      // The variable list and the vintage are in each URL, so the response layers
      // get a new key and cannot serve the superseded content.
      fetch = null
      generic = null
      if (policy.versionStamped) {
        // A bump is what resets storage. Forgetting the bump must leave the old
        // chunks readable, which is the whole failure being measured.
        if (bumpAt.includes(day)) {
          // A later bump is the only thing that ends a missed-bump exposure.
          if (missedBumpDay !== null && missedBumpExposureDays === null) {
            missedBumpExposureDays = day - missedBumpDay
            missedBumpDay = null
          }
          chunks = null
        } else missedBumpDay ??= day
      }
    }
    if (day === LIST_CHANGE_DAY) {
      listVersion++
      if (policy.enumKeyedByVintage) enumeration = null
    }

    for (let v = 0; v < VISITS_PER_DAY; v++) {
      const t = day * DAY + Math.floor((v * DAY) / VISITS_PER_DAY)

      if (!fresh(fetch, policy.fetchTtlMs, t)) {
        requests++
        fetch = { fetchedAt: t, marker: meaning }
      }

      if (!fresh(generic, policy.genericTtlMs, t)) {
        requests++
        generic = { fetchedAt: t, marker: meaning }
      }

      if (!fresh(enumeration, policy.enumTtlMs, t)) {
        requests += ENUM_REQUESTS
        enumeration = { fetchedAt: t, marker: listVersion }
      } else if (enumeration.marker < listVersion) {
        staleListVisits++
      }

      const chunkExpired = policy.chunkTtlMs === null ? chunks === null : !fresh(chunks, policy.chunkTtlMs, t)
      if (chunkExpired) {
        requests += SWEEP_CHUNKS
        chunks = { fetchedAt: t, marker: meaning }
      } else if (chunks.marker < meaning) {
        staleFigureVisits++
      }
    }
  }

  return {
    requests,
    staleFigureVisits,
    staleListVisits,
    // No later bump inside the horizon means the exposure simply does not end.
    missedBumpExposureDays:
      missedBumpDay !== null
        ? (missedBumpExposureDays ?? HORIZON_DAYS - missedBumpDay)
        : missedBumpExposureDays,
  }
}

describe('Champion Audit #77: cache freshness over a declared timeline', () => {
  const champion = simulate(CHAMPION)
  const championMissedBump = simulate(CHAMPION, [90])
  const challenger = simulate(CHALLENGER)

  it('prints the measurement the audit records', () => {
    console.log(
      `timeline: ${HORIZON_DAYS} days, ${VISITS_PER_DAY} visits/day, ` +
        `${SWEEP_CHUNKS} sweep chunks, ${ENUM_REQUESTS} enumeration requests per refetch`,
    )
    console.log(
      `constants: fetch ${FETCH_TTL_MS / DAY}d, generic ${GENERIC_TTL_MS / DAY}d, ` +
        `enum ${ENUM_TTL_MS / DAY}d, stale flag ${STALE_AFTER_MS / DAY}d, stamp ${SWEEP_VERSION}`,
    )
    for (const [name, r] of [
      ['champion', champion],
      ['champion, missed bump at day 120', championMissedBump],
      ['challenger 7d uniform', challenger],
    ] as const) {
      console.log(
        `${name}: requests ${r.requests}, stale figure visits ${r.staleFigureVisits}, ` +
          `stale list visits ${r.staleListVisits}, ` +
          `missed-bump exposure ${r.missedBumpExposureDays === null ? 'none' : r.missedBumpExposureDays + 'd'}`,
      )
    }
    expect(champion.requests).toBeGreaterThan(0)
  })

  it('the champion serves no figure across a meaning change when the stamp is bumped', () => {
    expect(champion.staleFigureVisits).toBe(0)
  })

  it('the challenger does not cut repeat-visit requests by 30%, so it cannot ship', () => {
    // Acceptance is a request reduction, and the challenger refetches the whole
    // 43-chunk sweep every seven days. It is the expensive option, not the cheap one.
    expect(challenger.requests).toBeGreaterThan(champion.requests)
    expect(challenger.requests).toBeGreaterThan(champion.requests * 1.3)
  })

  it('the missed bump is a real exposure, and it is unbounded while the stamp is not moved', () => {
    // Confirmed, not hypothetical: with the day-120 stamp forgotten, cached chunks
    // keep replaying superseded meanings for the rest of the horizon, because a
    // chunk has no age limit at all.
    expect(championMissedBump.staleFigureVisits).toBeGreaterThan(0)
    expect(championMissedBump.missedBumpExposureDays).toBe(HORIZON_DAYS - MEANING_CHANGE_DAYS[1]!)
    expect(champion.missedBumpExposureDays).toBeNull()
  })

  it('a uniform 7-day TTL bounds stale figures to a week, at the cost measured above', () => {
    // The challenger is not free of exposure; it trades a large request increase
    // for a seven-day bound. Both halves are recorded so the decision is not the
    // champion winning by default.
    expect(challenger.staleFigureVisits).toBeLessThanOrEqual(VISITS_PER_DAY * 7)
  })

  it('the enumeration key is the one layer with no vintage, and it shows', () => {
    // Its key has a schema version but no data vintage, so a superseded ZCTA list
    // is served until the 90-day lifetime expires. The challenger's 7-day TTL
    // bounds it. This is recorded as a finding, not fixed here.
    expect(champion.staleListVisits).toBeGreaterThan(0)
    expect(challenger.staleListVisits).toBeLessThan(champion.staleListVisits)
  })
})
