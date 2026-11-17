#!/usr/bin/env node
/**
 * Champion Audit #73: frozen geocoding corpus and its recorded responses.
 *
 * Two commands, deliberately separate, because one of them touches the network and
 * the other must never need to.
 *
 *   node tools/geocode-audit.mjs --build
 *     Writes `tests/fixtures/geocode-corpus.json` from committed data only: the
 *     county index gives real ZIP codes with their states (including the
 *     territories), and the place index gives city names with the states they
 *     occur in. No network, fully deterministic, so the corpus can be reviewed
 *     as a diff and regenerated identically.
 *
 *   node tools/geocode-audit.mjs --record
 *     Fetches each corpus entry from the same endpoints the product uses and
 *     writes `tests/fixtures/geocode-responses.json`. Paced, resumable, and it
 *     stops itself on repeated refusal rather than hammering a public service.
 *
 * Why the pacing is not a formality: `src/core/geocode.ts` records that a
 * 370-ZIP audit against Photon exhausted its per-IP budget and the service then
 * refused connections. That failure is per address, so it is the maintainer's
 * machine that pays, and a flood here would make the corpus unrecordable for
 * everyone on this IP. The default is one request every 1.2 seconds with jitter
 * (about 40/minute, well under what broke it), the tool backs off hard on 429,
 * and it aborts after three consecutive refusals instead of retrying into a wall.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CORPUS = join(ROOT, 'tests', 'fixtures', 'geocode-corpus.json')
const RESPONSES = join(ROOT, 'tests', 'fixtures', 'geocode-responses.json')

const TIGER_ZCTA =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2/query'
const PHOTON = 'https://photon.komoot.io/api/'

/** The territory states the issue names, plus the two Pacific ones the app serves. */
const TERRITORIES = ['PR', 'VI', 'GU', 'AS', 'MP', 'HI', 'AK']

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

/** Unpacks the committed county index just far enough to get ZIP, state and county. */
function readCountyIndex() {
  const packed = JSON.parse(readFileSync(join(ROOT, 'public', 'map', 'zcta-counties.json'), 'utf8'))
  const zips = []
  // previous starts at -1, exactly as src/core/zcta-county-index.ts decodes it, so
  // the first ZIP is the first delta (00601, a Puerto Rico ZCTA). Starting at 0
  // shifts every code by one: the first draft of this tool did, and produced a
  // corpus of plausible ZIP codes that were each one greater than the real one.
  // A third of them then resolved to nothing at Census, which read like a service
  // coverage gap until the off-by-one was found.
  let previous = -1
  for (const delta of packed.zd) {
    previous = previous + delta + 1
    zips.push(String(previous).padStart(5, '0'))
  }
  const states = packed.states
  const perZip = new Map()
  for (let i = 0; i < zips.length; i += 1) {
    // Record layout, exactly as src/core/zcta-county-index.ts reads it: four
    // decimal characters of county id, three of land share. Decimal, not base 36 -
    // reading this wrong still produces plausible-looking counties, which is why
    // the widths are quoted from the parser rather than guessed.
    const raw = packed.rec.slice(i * 7, i * 7 + 7)
    const countyId = Number(raw.slice(0, 4))
    const share = Number(raw.slice(4, 7))
    const county = packed.counties[countyId]
    const fips = county?.[0] ?? ''
    perZip.set(zips[i], { state: states[fips.slice(0, 2)], countyName: county?.[1] ?? '', share })
  }
  return { zips, perZip }
}

/** City name to the states it occurs in, from the committed place index. */
function readPlaces() {
  const packed = JSON.parse(readFileSync(join(ROOT, 'public', 'map', 'zcta-places.json'), 'utf8'))
  const names = new Map()
  // Record layout from src/core/zcta-place-index.ts: five decimal characters of
  // name-dictionary index, two of state-dictionary index, then kind and
  // incorporated flags. The Census name carries its legal type (`Salem city`),
  // so the type token is trimmed here the same way the app shortens it. The ZIP
  // walk starts at -1 for the same off-by-one reason as the county index.
  const WIDTH = 9
  for (let i = 0; i < packed.zd.length; i += 1) {
    const record = packed.rec.slice(i * WIDTH, i * WIDTH + WIDTH)
    const name = packed.names[Number(record.slice(0, 5))]
    const state = packed.states[Number(record.slice(5, 7))]
    if (typeof name !== 'string' || typeof state !== 'string') continue
    const kind = record[7]
    if (kind !== 'C') continue // cities only: a county fallback is not a place name
    // `CDP` is stripped too: it is a Census statistical-area marker, the app never
    // displays it, and no reader types "Bethesda CDP". Leaving it in made the first
    // full measurement score five correct-only-if-you-asked-that-way queries as
    // misses, which would have blamed the gazetteer for the corpus's phrasing.
    const trimmed = name.replace(
      / (city \(balance\)|unified government \(balance\)|zona urbana|municipality|corporation|borough|comunidad|CDP|village|township|town|city)$/,
      '',
    )
    if (!trimmed || trimmed.length < 3 || trimmed.length > 24) continue
    if (/^\d/.test(trimmed)) continue
    const rec = names.get(trimmed) ?? { count: 0, states: new Set() }
    rec.count += 1
    rec.states.add(state)
    names.set(trimmed, rec)
  }
  return names
}

function build() {
  const { zips, perZip } = readCountyIndex()
  const entries = []
  const seen = new Set()
  const push = (entry) => {
    if (seen.has(entry.q)) return
    seen.add(entry.q)
    entries.push({ id: `${entry.kind}-${entry.q.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, ...entry })
  }

  // 1. Real ZIP codes, stratified across the country, with each territory state
  //    guaranteed a few entries so a regression on Guam cannot hide in a sample
  //    that happened to draw no Pacific ZIPs.
  const zipList = zips.filter((z) => perZip.get(z)?.state)
  const stride = Math.max(1, Math.floor(zipList.length / 200))
  for (let i = 0; i < zipList.length && entries.length < 200; i += stride) {
    const z = zipList[i]
    const rec = perZip.get(z)
    push({ q: z, kind: rec.state && TERRITORIES.includes(rec.state) ? 'zip-territory' : 'zip', expect: { zip: z, state: rec.state } })
  }
  for (const state of TERRITORIES) {
    let added = 0
    for (const z of zipList) {
      if (added >= 3) break
      if (perZip.get(z)?.state !== state) continue
      if (seen.has(z)) continue
      push({ q: z, kind: 'zip-territory', expect: { zip: z, state } })
      added += 1
    }
  }

  // 2. Five-digit strings that are not US ZIPs. The routing rule is a bare
  //    /^\d{5}$/ test, so these exercise the gap the issue names: a foreign
  //    postal code can never reach the gazetteer that knows it.
  //
  //    Every candidate is checked against the committed index first. The first
  //    draft of this list was written from memory and three of its ten entries -
  //    75008, 28013, 50667 - are real US ZCTAs, so the measurement would have
  //    asserted "reported as not-US" about places that are in the United States.
  //    A mislabelled entry fails the build now instead of surfacing as a defeat
  //    in an audit whose whole purpose is that claims are checked.
  const zipSet = new Set(zips)
  // Real non-US postal codes that happen to be five digits. Candidates are filtered
  // against the index rather than trusted, and the ones dropped are printed, so a
  // shrunk list is visible in the build log instead of quietly making the gap look
  // smaller than it is. A floor keeps the list from collapsing without anyone noticing.
  const foreignCandidates = ['75001', '10115', '10117', '20095', '80331', '00184', '20099', '28001', '10119', '50670', '75002', '80333']
  const foreign = foreignCandidates.filter((q) => !zipSet.has(q))
  const dropped = foreignCandidates.filter((q) => zipSet.has(q))
  if (dropped.length > 0) console.log(`  dropped as US ZCTAs: ${dropped.join(', ')}`)
  if (foreign.length < 6) throw new Error(`only ${foreign.length} foreign five-digit codes survived; add candidates`)
  for (const q of foreign) {
    push({ q, kind: 'foreign-five-digit', expect: { noUsPlace: true } })
  }

  // 3. City names and ambiguous names from the committed place index.
  const names = readPlaces()
  const unique = []
  const ambiguous = []
  for (const [name, rec] of names) {
    if (rec.states.size === 1) unique.push({ name, states: [...rec.states], count: rec.count })
    else if (rec.states.size >= 4) ambiguous.push({ name, states: [...rec.states], count: rec.count })
  }
  unique.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  ambiguous.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  for (const item of unique.slice(0, 240)) {
    push({ q: item.name, kind: 'city', expect: { name: item.name, states: item.states } })
  }
  for (const item of ambiguous.slice(0, 36)) {
    push({ q: item.name, kind: 'ambiguous', expect: { name: item.name } })
  }

  // 4. Territory place names, asked the way a reader would type them.
  const territoryTowns = [
    ['San Juan, PR', 'PR'],
    ['Ponce, PR', 'PR'],
    ['Mayaguez, PR', 'PR'],
    ['Charlotte Amalie, VI', 'VI'],
    ['Christiansted, VI', 'VI'],
    ['Hagatna, GU', 'GU'],
    ['Tamuning, GU', 'GU'],
    ['Pago Pago, AS', 'AS'],
    ['Saipan, MP', 'MP'],
    ['Honolulu, HI', 'HI'],
    ['Anchorage, AK', 'AK'],
    ['Juneau, AK', 'AK'],
  ]
  for (const [q, state] of territoryTowns) {
    push({ q, kind: 'territory', expect: { state } })
  }

  // Postal abbreviation to full name, straight from the committed state outlines.
  // The gazetteer answers with "Massachusetts", the index stores "MA", and a
  // scoring harness that compares those two strings directly reports every correct
  // answer as a miss - which is what the first run of this audit did (31% where the
  // truth was far higher). The mapping is data, not a hand-written table.
  const statesDoc = JSON.parse(readFileSync(join(ROOT, 'public', 'map', 'us-states.json'), 'utf8'))
  const stateNames = {}
  for (const f of statesDoc.features ?? []) {
    const abbr = f?.properties?.STUSAB
    const name = f?.properties?.BASENAME
    if (typeof abbr === 'string' && typeof name === 'string') stateNames[abbr] = name
  }

  const counts = entries.reduce((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {})
  const doc = {
    states: stateNames,
    v: 1,
    note:
      'Frozen corpus for Champion Audit #73. Generated by tools/geocode-audit.mjs --build from ' +
      'public/map/zcta-counties.json and public/map/zcta-places.json only. Do not hand-edit: a ' +
      'hand-edited corpus is a corpus nobody can regenerate, and every number measured from it ' +
      'becomes unreviewable.',
    counts,
    entries,
  }
  mkdirSync(dirname(CORPUS), { recursive: true })
  writeFileSync(CORPUS, `${JSON.stringify(doc, null, 1)}\n`)
  console.log(`corpus: ${entries.length} entries -> ${CORPUS}`)
  console.log(`  ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson(url, timeoutMs = 25000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'Accept-Language': 'en' } })
    if (!res.ok) return { status: res.status, body: null }
    return { status: res.status, body: await res.json() }
  } finally {
    clearTimeout(timer)
  }
}

/** Trims a response to the fields the shipped code reads, so the artefact stays reviewable. */
function reduce(kind, body) {
  if (kind === 'zip' || kind === 'zip-territory' || kind === 'foreign-five-digit') {
    const features = (body?.features ?? []).map((f) => ({
      attributes: {
        ZCTA5: f.attributes?.ZCTA5,
        NAME: f.attributes?.NAME,
        CENTLAT: f.attributes?.CENTLAT,
        CENTLON: f.attributes?.CENTLON,
      },
    }))
    return { features }
  }
  const features = (body?.features ?? []).map((f) => ({
    geometry: { coordinates: [f.geometry?.coordinates?.[0], f.geometry?.coordinates?.[1]] },
    properties: {
      name: f.properties?.name,
      county: f.properties?.county,
      state: f.properties?.state,
      countrycode: f.properties?.countrycode,
      osm_value: f.properties?.osm_value,
      postcode: f.properties?.postcode,
    },
  }))
  return { features }
}

async function record() {
  if (!existsSync(CORPUS)) {
    console.error('no corpus: run --build first')
    process.exit(2)
  }
  const corpus = JSON.parse(readFileSync(CORPUS, 'utf8'))
  const store = existsSync(RESPONSES) ? JSON.parse(readFileSync(RESPONSES, 'utf8')) : { v: 1, recorded: {} }
  // Prune recordings whose corpus entry no longer exists, so a rebuilt corpus does
  // not leave a store that looks complete while answering for codes nobody asked for.
  const live = new Set(corpus.entries.map((e) => e.id))
  for (const key of Object.keys(store.recorded)) if (!live.has(key)) delete store.recorded[key]
  const limit = Number(value('limit', '0')) || corpus.entries.length
  const baseDelay = Number(value('delay', '1200'))
  let done = 0
  let consecutiveRefusals = 0

  for (const entry of corpus.entries.slice(0, limit)) {
    if (store.recorded[entry.id]) continue
    const zipPath = /^\d{5}$/.test(entry.q)
    const where = encodeURIComponent(`ZCTA5='${entry.q}'`).replace(/'/g, '%27')
    const url = zipPath
      ? `${TIGER_ZCTA}?where=${where}&outFields=ZCTA5,NAME,CENTLAT,CENTLON&returnGeometry=false&f=json`
      : `${PHOTON}?q=${encodeURIComponent(entry.q)}&limit=8&lang=en`
    const res = await fetchJson(url)
    if (res.status === 429 || res.status === 403 || res.status === 503) {
      consecutiveRefusals += 1
      console.error(`refused ${res.status} on "${entry.q}" (${consecutiveRefusals} in a row)`)
      if (consecutiveRefusals >= 3) {
        writeFileSync(RESPONSES, `${JSON.stringify(store, null, 1)}\n`)
        console.error(`stopping: ${consecutiveRefusals} consecutive refusals. Recorded so far: ${Object.keys(store.recorded).length}`)
        process.exit(3)
      }
      await sleep(baseDelay * 20)
      continue
    }
    consecutiveRefusals = 0
    store.recorded[entry.id] = { q: entry.q, kind: entry.kind, status: res.status, body: res.body ? reduce(entry.kind, res.body) : null }
    done += 1
    if (done % 25 === 0) {
      writeFileSync(RESPONSES, `${JSON.stringify(store, null, 1)}\n`)
      console.log(`  ${done} recorded this run, ${Object.keys(store.recorded).length} total`)
    }
    // Jittered pacing. The service sees a slow, irregular client, not a sweep.
    await sleep(baseDelay + Math.floor(Math.random() * 400))
  }
  writeFileSync(RESPONSES, `${JSON.stringify(store, null, 1)}\n`)
  console.log(`recorded ${done} this run, ${Object.keys(store.recorded).length} in ${RESPONSES}`)
}

if (flag('build')) build()
else if (flag('record')) await record()
else {
  console.error('usage: --build | --record [--limit=N] [--delay=ms]')
  process.exit(2)
}
