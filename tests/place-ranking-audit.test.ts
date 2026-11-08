/**
 * Champion Audit #74: place-suggestion ranking.
 *
 * The shipped mechanism is replayed exactly as-is over the real national place
 * index (`public/map/zcta-places.json`, decoded by the shipped decoder), against
 * the pre-stated acceptance in issue #74:
 *
 *   - exact-match recall@8 is 100% on the corpus;
 *   - zero bucket-order violations;
 *   - a CAP 32 or CAP 128 challenger ships only if it holds both.
 *
 * Nothing here changes the shipped cap. `SEARCH_BUCKET_CAP` is the champion's
 * constant and the variants are replayed through the same `rankPlaces` body, so
 * the comparison measures the cap rather than a second implementation.
 *
 * Ranks do not depend on the cap, so they are computed once per query and each
 * cap is then simulated over the same rank array. Doing it the obvious way -
 * re-scanning 30k places three times per query - measured 147s, which is a test
 * nobody runs.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  SEARCH_BUCKET_CAP,
  decodePlaces,
  rankPlaces,
  searchPlaces,
  type PlaceSuggestion,
} from '../src/core/zcta-place-index'

const { places } = decodePlaces(JSON.parse(readFileSync(join('public', 'map', 'zcta-places.json'), 'utf8')))

/** The rank a query assigns a place, derived independently of the ranking code. */
function rankOf(place: PlaceSuggestion, query: string): number {
  const name = place.displayName.toLowerCase()
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  if (name.split(' ').some((word) => word.startsWith(query))) return 2
  if (name.includes(query)) return 3
  return -1
}

/**
 * The corpus, in four classes, all derived from the real index.
 *
 * Sampling is by stride rather than randomly: a random corpus would move between
 * runs and the acceptance margin would never mean the same thing twice.
 */
function buildCorpus(all: PlaceSuggestion[]): { all: string[]; classes: Record<string, string[]> } {
  const exact: string[] = []
  const prefix: string[] = []
  const word: string[] = []
  const substring: string[] = []

  for (let i = 0; i < all.length; i += 47) {
    const name = all[i]!.displayName.toLowerCase()
    exact.push(name)
    if (name.length > 6) prefix.push(name.slice(0, 4))
    const words = name.split(' ')
    if (words.length > 1) {
      const last = words[words.length - 1]!
      if (last.length > 3) word.push(last.slice(0, 3))
    }
    if (name.length > 8) substring.push(name.slice(2, 7))
  }

  // Multi-state names are the case the mechanism exists for: "austin" must offer
  // more than one state's Austin rather than choosing between them.
  const byName = new Map<string, Set<string>>()
  for (const p of all) {
    const key = p.displayName.toLowerCase()
    const states = byName.get(key) ?? new Set<string>()
    states.add(p.state)
    byName.set(key, states)
  }
  const multiState = [...byName.entries()]
    .filter(([, states]) => states.size > 1)
    .slice(0, 60)
    .map(([name]) => name)

  const classes = {
    exact: [...new Set(exact)],
    prefix: [...new Set(prefix)],
    word: [...new Set(word)],
    substring: [...new Set(substring)],
    multiState,
  }
  return { all: [...new Set(Object.values(classes).flat())], classes }
}

/** Ranks for one query, in index order. Independent of any cap. */
function ranksFor(query: string): number[] {
  return places.map((p) => rankOf(p, query))
}

/**
 * The shipped selection rule, replayed over precomputed ranks for one cap.
 *
 * This mirrors `rankPlaces` exactly (fill each bucket up to the cap in index
 * order, and stop scanning once an exact or prefix bucket is full); the test
 * below asserts it agrees with the real function at the champion cap.
 */
function selectFromRanks(ranks: number[], cap: number, limit = 8): number[] {
  const buckets: number[][] = [[], [], [], []]
  for (let i = 0; i < ranks.length; i++) {
    const rank = ranks[i]!
    if (rank < 0) continue
    const bucket = buckets[rank]!
    if (bucket.length < cap) bucket.push(i)
    if (rank <= 1 && bucket.length >= cap) break
  }
  const out: number[] = []
  for (const bucket of buckets) {
    for (const i of bucket) {
      if (out.length >= limit) return out
      out.push(i)
    }
  }
  return out
}

function measure(cap: number, corpus: { all: string[]; classes: Record<string, string[]> }, ranks: Map<string, number[]>) {
  let exactSlots = 0
  let exactSlotsAvailable = 0
  let orderViolations = 0
  let emptyResults = 0
  let maxExactBucket = 0
  let maxPrefixBucket = 0
  let duplicateTruncations = 0
  let differing = 0
  const violationExamples: string[] = []

  for (const query of corpus.all) {
    const r = ranks.get(query)!
    const picked = selectFromRanks(r, cap)
    const pickedRanks = picked.map((i) => r[i]!)
    if (picked.length === 0) emptyResults++
    for (let i = 1; i < pickedRanks.length; i++) {
      if (pickedRanks[i]! < pickedRanks[i - 1]!) {
        orderViolations++
        if (violationExamples.length < 3) violationExamples.push(query + ': ' + pickedRanks.join(','))
        break
      }
    }

    const exactMatches = r.filter((x) => x === 0).length
    const prefixMatches = r.filter((x) => x === 1).length
    maxExactBucket = Math.max(maxExactBucket, exactMatches)
    maxPrefixBucket = Math.max(maxPrefixBucket, prefixMatches)

    const wanted = Math.min(8, exactMatches)
    const got = pickedRanks.filter((x) => x === 0).length
    exactSlotsAvailable += wanted
    exactSlots += Math.min(got, wanted)

    // A place excluded only because more than eight share its name is not a
    // ranking defect; counted separately so it cannot hide inside recall.
    if (exactMatches > 8 && got === 0) duplicateTruncations++

    const champion = selectFromRanks(r, SEARCH_BUCKET_CAP)
    if (champion.join(',') !== picked.join(',')) differing++
  }

  return {
    cap,
    queries: corpus.all.length,
    recall: exactSlotsAvailable === 0 ? 1 : exactSlots / exactSlotsAvailable,
    orderViolations,
    emptyResults,
    maxExactBucket,
    maxPrefixBucket,
    duplicateTruncations,
    differing,
    violationExamples,
  }
}

describe('Champion Audit #74: place ranking over the real index', () => {
  const corpus = buildCorpus(places)
  const ranks = new Map(corpus.all.map((q) => [q, ranksFor(q)]))
  const results = [32, SEARCH_BUCKET_CAP, 128].map((cap) => measure(cap, corpus, ranks))
  const champion = results.find((r) => r.cap === SEARCH_BUCKET_CAP)!

  it('prints the measurement the audit records', () => {
    console.log('place index: ' + places.length + ' distinct places, ' + corpus.all.length + ' corpus queries')
    for (const r of results) {
      console.log(
        `cap ${String(r.cap).padStart(3)}: recall@8 ${(r.recall * 100).toFixed(2)}%, ` +
          `order violations ${r.orderViolations}, empty ${r.emptyResults}, ` +
          `max exact bucket ${r.maxExactBucket}, max prefix bucket ${r.maxPrefixBucket}, ` +
          `duplicate-name truncations ${r.duplicateTruncations}, top8 differences vs champion ${r.differing}`,
      )
      for (const example of r.violationExamples) console.log(`   violation ${example}`)
    }
    expect(results.length).toBe(3)
  })

  it('the replay agrees with the shipped function at the champion cap', () => {
    // The simulator must not become a second implementation that scores well
    // while the shipped code differs.
    for (const query of corpus.all.slice(0, 120)) {
      const expected = rankPlaces(places, query, 8, SEARCH_BUCKET_CAP).map((p) => p.displayName + '|' + p.state)
      const got = selectFromRanks(ranks.get(query)!, SEARCH_BUCKET_CAP).map(
        (i) => places[i]!.displayName + '|' + places[i]!.state,
      )
      expect(got).toEqual(expected)
    }
  })

  it('champion holds exact-match recall@8 at 100%', () => {
    expect(champion.recall).toBe(1)
  })

  it('champion has zero bucket-order violations', () => {
    expect(champion.orderViolations).toBe(0)
  })

  it('champion never returns an empty result for a corpus query', () => {
    // A corpus query is built from a real place, so an empty list would mean the
    // mechanism failed to surface a place that exists.
    expect(champion.emptyResults).toBe(0)
  })

  it('challenger caps 32 and 128 hold recall and ordering', () => {
    const challengers = results.filter((r) => r.cap !== SEARCH_BUCKET_CAP)
    for (const r of challengers) {
      expect(r.recall).toBe(1)
      expect(r.orderViolations).toBe(0)
    }
  })

  it('searchPlaces is the champion path', () => {
    expect(searchPlaces(places, 'austin', 8)).toEqual(rankPlaces(places, 'austin', 8, SEARCH_BUCKET_CAP))
  })

  it('a shared name offers more than one state rather than choosing between them', () => {
    const out = searchPlaces(places, 'austin', 8)
    const states = new Set(out.filter((p) => rankOf(p, 'austin') === 0).map((p) => p.state))
    expect(states.size).toBeGreaterThan(1)
  })
})
