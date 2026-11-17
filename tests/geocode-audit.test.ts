/**
 * Champion Audit #73: geocoder routing, ordering, and precision@1 on a frozen corpus.
 *
 * The issue states its acceptance: a challenger ships only if corpus accuracy is at
 * least the champion's, precision@1 is at least 95%, and ZIP-path Photon calls stay
 * exactly 0. The champion is TIGERweb-first / Photon-fallback / postcode-features-first;
 * the comparator is the same routing with Photon's own order left alone.
 *
 * Two halves, and the difference between them is the point:
 *
 *  - **Offline, always run.** The routing rule, the country filter and the sort are
 *    measured against the shipped code with canned responses. These are real results
 *    today: they do not need the network, and they test exactly the two gaps the issue
 *    records (a five-digit string that is not a ZIP can never reach the gazetteer; a
 *    feature carrying no country code is admitted).
 *
 *  - **Frozen corpus, skipped when absent.** `geocode-audit.mjs --record` writes the
 *    responses; this half replays them through `geocode()` and scores precision@1 for
 *    both orders. With no recording it is `describe.skip`, which vitest reports as
 *    skipped - never as a pass, and never as a zero that looks like a measurement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { geocode, mapPhotonFeatures, type PhotonBody } from '../src/core/geocode'

const getJson = vi.fn()
vi.mock('../src/core/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/http')>()
  return { ...actual, getJson: (...args: unknown[]) => getJson(...args) }
})

const CORPUS = join(process.cwd(), 'tests', 'fixtures', 'geocode-corpus.json')
const RESPONSES = join(process.cwd(), 'tests', 'fixtures', 'geocode-responses.json')

const TIGER_ZCTA =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2/query'
const PHOTON = 'https://photon.komoot.io/api/'

/** The URLs the shipped code builds, reconstructed so a drift between the two is a failure. */
function zipUrl(q: string): string {
  const where = encodeURIComponent(`ZCTA5='${q}'`).replace(/'/g, '%27')
  return `${TIGER_ZCTA}?where=${where}&outFields=ZCTA5,NAME,CENTLAT,CENTLON&returnGeometry=false&f=json`
}
function photonUrl(q: string): string {
  return `${PHOTON}?q=${encodeURIComponent(q)}&limit=8&lang=en`
}

const photonFeature = (properties: Record<string, unknown>, lon = -71.1, lat = 42.4) => ({
  geometry: { coordinates: [lon, lat] as [number, number] },
  properties,
})

beforeEach(() => {
  getJson.mockReset()
})

describe('Champion Audit #73: the routing rule, measured against the shipped code', () => {
  it('never asks the gazetteer about a five-digit query', async () => {
    // The issue's gap, stated as a check: the routing rule is a bare /^\d{5}$/ test,
    // so a foreign postal code is sent to a US Census layer and can never reach the
    // gazetteer that knows what it is. Measured here as: zero Photon calls.
    getJson.mockImplementation(async (url: string) => {
      if (url.startsWith(PHOTON)) throw new Error(`Photon must not be called for a five-digit query: ${url}`)
      return { features: [] }
    })
    const outcome = await geocode('75008', new AbortController().signal)
    expect(outcome.notUsZip).toBe(true)
    expect(outcome.places).toEqual([])
    expect(getJson).toHaveBeenCalledTimes(1)
    expect(String(getJson.mock.calls[0]?.[0])).toContain('tigerweb.geo.census.gov')
  })

  it('admits a feature that carries no country code, and drops one that carries another', () => {
    // The second gap the issue records. `cc && cc !== 'us'` cannot reject a feature
    // with no cc at all, so an unnamed foreign feature is admitted unfiltered.
    const mapped = mapPhotonFeatures(
      {
        features: [
          photonFeature({ name: 'Lyon', countrycode: 'fr', osm_value: 'city' }),
          photonFeature({ name: 'Springfield', countrycode: 'us', osm_value: 'city' }),
          photonFeature({ name: 'NoCodeville', osm_value: 'city' }),
        ],
      } as PhotonBody,
      'Springfield',
    )
    expect(mapped.map((p) => p.name)).toEqual(['Springfield', 'NoCodeville'])
  })

  it('puts a postcode feature first where Photon put it last, so top-1 differs', async () => {
    // The ordering claim the issue says is asserted rather than measured. Here it is
    // measured: the same response, two orders, two different top-1 answers.
    const body: PhotonBody = {
      features: [
        photonFeature({ name: 'Springfield', state: 'Illinois', countrycode: 'us', osm_value: 'city' }),
        photonFeature({ name: 'Springfield', state: 'Missouri', countrycode: 'us', osm_value: 'city' }),
        photonFeature({ name: '01101', state: 'Massachusetts', countrycode: 'us', osm_value: 'postcode', postcode: '01101' }),
      ],
    }
    getJson.mockResolvedValue(body)

    const champion = await geocode('Springfield', new AbortController().signal)
    expect(champion.places[0]?.precise).toBe(true)
    expect(champion.places[0]?.zip).toBe('01101')

    // The comparator is the champion's own mapping, unsorted - not a copy of it.
    const comparator = mapPhotonFeatures(body, 'Springfield')
    expect(comparator[0]?.precise).toBe(false)

    // And the two differ on the metric the acceptance names.
    const precision = (top: { precise: boolean } | undefined) => (top?.precise ? 1 : 0)
    expect(precision(champion.places[0])).toBe(1)
    expect(precision(comparator[0])).toBe(0)
  })
})

const corpusPresent = existsSync(CORPUS)
const responsesPresent = existsSync(RESPONSES)

interface CorpusEntry {
  id: string
  q: string
  kind: 'zip' | 'zip-territory' | 'foreign-five-digit' | 'city' | 'ambiguous' | 'territory'
  expect: { zip?: string; state?: string; name?: string; states?: string[]; noUsPlace?: boolean }
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(city|town|village|borough|cdp|municipality|zona urbana|comunidad)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

describe('Champion Audit #73: precision@1 on the frozen corpus', () => {
  it.skipIf(!corpusPresent || !responsesPresent)('scores the champion and the unmodified-order comparator', async () => {
    const corpus = JSON.parse(readFileSync(CORPUS, 'utf8')) as {
      entries: CorpusEntry[]
      /** Postal abbreviation to full name, from the committed state outlines. */
      states: Record<string, string>
    }
    const fullState = (abbr: string) => (corpus.states[abbr] ?? abbr).toLowerCase()
    const store = JSON.parse(readFileSync(RESPONSES, 'utf8')) as {
      recorded: Record<string, { q: string; kind: string; status: number; body: unknown }>
    }

    // Replay the recorded bodies by the exact URL the shipped code will request. A
    // miss is a failure rather than a silent empty response: it means the harness's
    // idea of the URL has drifted from the code's, which would make every number here
    // a measurement of the harness.
    const byUrl = new Map<string, unknown>()
    const photonForZip: string[] = []
    for (const entry of corpus.entries) {
      const rec = store.recorded[entry.id]
      if (!rec || rec.status !== 200 || rec.body === null) continue
      const fiveDigit = /^\d{5}$/.test(entry.q)
      byUrl.set(fiveDigit ? zipUrl(entry.q) : photonUrl(entry.q), rec.body)
      if (fiveDigit) photonForZip.push(entry.q)
    }
    getJson.mockImplementation(async (url: string) => {
      if (!byUrl.has(url)) throw new Error(`no recorded response for ${url}`)
      return byUrl.get(url)
    })


    const signal = new AbortController().signal
    const scoreable: CorpusEntry[] = []
    const championHits: boolean[] = []
    const comparatorHits: boolean[] = []
    const ambiguousTops: string[] = []
    const zipPathPhotonCalls: string[] = []
    const foreignFalsePositives: string[] = []
    const perKind: Record<string, { hit: number; total: number }> = {}
    const misses: string[] = []

    for (const entry of corpus.entries) {
      if (!store.recorded[entry.id]) continue
      getJson.mockClear()
      const outcome = await geocode(entry.q, signal)
      for (const call of getJson.mock.calls) {
        const url = String(call[0])
        if (url.startsWith(PHOTON) && /^\d{5}$/.test(entry.q)) zipPathPhotonCalls.push(entry.q)
      }
      const top = outcome.places[0]
      const recorder = store.recorded[entry.id]

      // The comparator is the champion's mapping with Photon's order left alone. For
      // five-digit queries there is no gazetteer response and no ordering question.
      const comparatorTop = /^\d{5}$/.test(entry.q)
        ? top
        : mapPhotonFeatures(recorder?.body as PhotonBody, entry.q)[0]
      if (!/^\d{5}$/.test(entry.q)) {
        // The comparator must be the shipped mapping in Photon's order, not a second
        // implementation of it: the champion's own output has to equal that mapping
        // re-sorted, on every free-text query in the corpus.
        const shipped = mapPhotonFeatures(recorder?.body as PhotonBody, entry.q)
        const resorted = [...shipped].sort((a, b) => Number(b.precise) - Number(a.precise))
        expect(outcome.places).toEqual(resorted)
      }

      if (entry.kind === 'foreign-five-digit') {
        // Scored, not skipped. Each of these is a real non-US postal code, so a US
        // place is a wrong answer - and TIGERweb's current ZCTA layer answers for
        // several of them (10119 Berlin and 28001 Madrid resolve to places in New
        // York and North Carolina), which is the false-positive the issue predicts.
        // Counting it as a miss is the honest treatment; asserting that it never
        // happens would make the harness fail on the defect it exists to report.
        const refused = outcome.notUsZip === true && outcome.places.length === 0
        scoreable.push(entry)
        championHits.push(refused)
        comparatorHits.push(refused)
        if (!refused && top) foreignFalsePositives.push(`${entry.q} -> ${top.name}${top.zip ? ` (${top.zip})` : ''}`)
        continue
      }
      if (entry.kind === 'ambiguous') {
        ambiguousTops.push(`${entry.q} -> ${top ? `${top.name}${top.state ? `, ${top.state}` : ''}` : 'nothing'}`)
        continue
      }

      let hit = false
      let comparatorHit = false
      if (entry.kind === 'city') {
        // The gazetteer answers with a full state name; the corpus stores the postal
        // abbreviation. Both are compared through the committed mapping, because a
        // direct string comparison here silently scores every right answer as wrong.
        const want = normalize(entry.expect.name ?? entry.q)
        const wantedStates = (entry.expect.states ?? []).map(fullState)
        const stateOk = (p: { state?: string } | undefined) =>
          !p?.state || wantedStates.length === 0 || wantedStates.includes(p.state.toLowerCase())
        hit = !!top && normalize(top.name) === want && stateOk(top)
        comparatorHit = !!comparatorTop && normalize(comparatorTop.name) === want && stateOk(comparatorTop)
      } else if (entry.kind === 'territory') {
        const wanted = fullState(entry.expect.state ?? '')
        const stateOf = (p: { state?: string } | undefined) => (p?.state ?? '').toLowerCase()
        hit = !!top && stateOf(top) === wanted
        comparatorHit = !!comparatorTop && stateOf(comparatorTop) === wanted
      } else {
        hit = !!top && top.zip === (entry.expect.zip ?? entry.q)
        comparatorHit = hit
      }
      scoreable.push(entry)
      championHits.push(hit)
      comparatorHits.push(comparatorHit)
      perKind[entry.kind] ??= { hit: 0, total: 0 }
      perKind[entry.kind].total += 1
      if (hit) perKind[entry.kind].hit += 1
      else if (entry.kind === 'city' || entry.kind === 'territory') {
        // Named, not counted. A miss rate nobody can inspect is a number that explains
        // nothing; these are the queries whose top answer was not the expected place.
        misses.push(`${entry.q} -> ${top ? `${top.name}${top.state ? `, ${top.state}` : ''}` : 'nothing'}`)
      }
    }

    const rate = (hits: boolean[]) => (hits.length === 0 ? 0 : hits.filter(Boolean).length / hits.length)
    const champion = rate(championHits)
    const comparator = rate(comparatorHits)

    // The issue's acceptance, applied as written rather than as a wish: a challenger
    // qualifies only if it is at least as accurate as the champion, the champion
    // clears 95% precision@1, and ZIP-path Photon calls are exactly zero.
    const qualifies = comparator >= champion && champion >= 0.95 && zipPathPhotonCalls.length === 0
    // ...and qualification is a gate, not a mandate. The comparator here is the same
    // routing with the postcode-first re-sort removed, and on this corpus it produces
    // exactly the champion's answer - so replacing the champion with it would remove a
    // deliberate behaviour (a postcode is a better answer than a city centroid) in
    // exchange for no measured gain. A tie is not an improvement.
    const ships = qualifies && comparator > champion

    // eslint-disable-next-line no-console
    console.log(
      `corpus ${scoreable.length} scoreable of ${corpus.entries.length} recorded; ` +
        `champion precision@1 ${(champion * 100).toFixed(1)}%, comparator ${(comparator * 100).toFixed(1)}%; ` +
        `ZIP-path Photon calls ${zipPathPhotonCalls.length}; foreign false positives ` +
        `${foreignFalsePositives.length}; ambiguous (not scored) ${ambiguousTops.length}; ` +
        `qualifies ${qualifies}; ships ${ships}\n  by kind: ` +
        Object.entries(perKind)
          .map(([k, v]) => `${k} ${v.hit}/${v.total}`)
          .join(', ') +
        (foreignFalsePositives.length ? `\n  ${foreignFalsePositives.join('\n  ')}` : '') +
        (misses.length ? `\n  misses (first 12): ${misses.slice(0, 12).join(' | ')}` : ''),
    )

    // Structural clause: the routing rule really does keep five-digit queries away
    // from the gazetteer, whatever else the numbers say.
    expect(zipPathPhotonCalls).toEqual([])
    // The harness must actually have scored the corpus, not a handful of rows.
    expect(scoreable.length).toBeGreaterThanOrEqual(400)
    // And the measured decision is pinned: the champion clears the 95% bar - almost
    // entirely on the ZIP path - while the comparator only ties it, so nothing ships.
    // If a future change makes the comparator strictly better, this fails and the
    // audit is re-run rather than a stale no-change conclusion being quoted forward.
    expect(champion).toBeGreaterThanOrEqual(0.95)
    expect(ships).toBe(false)
  })

  it('states that the corpus measurement has not run rather than reporting a number', () => {
    if (corpusPresent && responsesPresent) {
      expect(corpusPresent && responsesPresent).toBe(true)
      return
    }
    // eslint-disable-next-line no-console
    console.log(
      'NOT MEASURED: run `node tools/geocode-audit.mjs --record`. The offline routing and ' +
        'ordering checks above are real results and do not depend on this.',
    )
    expect(responsesPresent).toBe(false)
  })
})
