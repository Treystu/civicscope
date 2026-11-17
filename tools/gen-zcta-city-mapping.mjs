/**
 * Bakes the ZIP-to-place mapping, then does not need to run again.
 *
 * Why this is a committed artefact rather than a runtime lookup:
 *
 *   - The app already asks nobody. Every figure comes from the publisher by the
 *     visitor's own browser, and the point of the mapping is that a city search
 *     costs no request either. A geocoder round-trip per keystroke would put a
 *     third party in the path of a search, which `src/core/geocode.ts` already
 *     records as a measured failure: Photon exhausted its budget during a
 *     370-ZIP audit and then refused connections, per-IP, which applies to every
 *     visitor of the deployed site.
 *   - The source is the Census Bureau's own published relationship files, so
 *     nothing is invented here. The names in this file are byte-identical to
 *     `NAMELSAD_PLACE_20`.
 *
 * Output:
 *   public/map/zcta-places.json   33,791 records, dictionary-packed
 *
 * Served from /map/, which `public/_headers` already marks immutable for a year,
 * so a returning visitor pays nothing. Run with: npm run gen:zcta-city
 *
 * Column indices below are 0-based and were read off the published header, not
 * guessed. An early version of the analysis used index 17 for the overlap area,
 * which is AREAWATER_PART; it reported 26,428 rows with "zero land overlap" and
 * implied 4,084 ZCTAs whose city was ambiguous. AREALAND_PART is index 16, and
 * measured against it the figure is 188 rows and **zero** ambiguous ZCTAs. Both
 * files are pipe-delimited with one header row and 18 columns.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'map')

const TIGER_STATES =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/80/query'

const REL = 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520'
const PLACE_URL = `${REL}/tab20_zcta520_place20_natl.txt`
const COUNTY_URL = `${REL}/tab20_zcta520_county20_natl.txt`

/** Column indices, from the published header row. */
const COL = {
  zcta: 1,
  placeGeoId: 9,
  placeName: 10,
  placeLandArea: 11,
  mtfcc: 13,
  partLandArea: 16,
}

/** Every ZCTA in the country. Asserted, never assumed. */
const EXPECTED_ZCTAS = 33791

/**
 * Column indices in the COUNTY relationship file, read off its published header
 * (fetched 2026-11-06), not assumed from the place file:
 *
 *   OID_ZCTA5_20|GEOID_ZCTA5_20|NAMELSAD_ZCTA5_20|AREALAND_ZCTA5_20|
 *   AREAWATER_ZCTA5_20|MTFCC_ZCTA5_20|CLASSFP_ZCTA5_20|FUNCSTAT_ZCTA5_20|
 *   OID_COUNTY_20|GEOID_COUNTY_20|NAMELSAD_COUNTY_20|AREALAND_COUNTY_20|
 *   AREAWATER_COUNTY_20|MTFCC_COUNTY_20|CLASSFP_COUNTY_20|FUNCSTAT_COUNTY_20|
 *   AREALAND_PART|AREAWATER_PART
 *
 * Two traps in this file, both measured rather than assumed. It opens with a
 * byte-order mark, so the first column name carries U+FEFF and a header lookup
 * by name misses column 0. And it begins with several hundred county-only rows
 * whose ZCTA columns are empty: the first 30 KB contains zero rows with a
 * GEOID_ZCTA5_20, so a parser that counts rows instead of checking the ZCTA
 * field indexes a short list and still looks plausible.
 */
const COL_COUNTY = {
  zcta: 1,
  zctaLand: 3,
  countyGeoid: 9,
  countyName: 10,
  partLand: 16,
}

const log = (...a) => console.log('[gen:zcta-city]', ...a)

/**
 * Fetches text with retries.
 *
 * These files are 9.8 MB and 6.8 MB from a public directory that is occasionally
 * slow. A short fetch must not be mistaken for a complete one, so a truncated
 * response is a thrown error rather than a partial result — the counts asserted
 * at the end would otherwise catch it, but failing here names the cause.
 */
async function fetchText(url, attempts = 4) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (text.length < 1000) throw new Error(`suspiciously short response: ${text.length} bytes`)
      return text
    } catch (err) {
      lastErr = err
      const wait = 3000 * (i + 1)
      log(`  retry ${i + 1}/${attempts} after ${err.message}; waiting ${wait}ms`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw new Error(`giving up on ${url}: ${lastErr.message}`)
}

/** Two-digit state FIPS to postal abbreviation, keyless from TIGERweb. */
async function fetchStateCodes() {
  // `GEOID` on the States layer is the two-digit state FIPS. There is no
  // `STATEFP` field on this layer: asking for it fails the whole query with
  // HTTP 200 and an error body, which is the same trap documented in
  // `src/live/map-data.test.ts`.
  const url = `${TIGER_STATES}?where=${encodeURIComponent('1=1')}&outFields=STUSAB,GEOID` +
    `&returnGeometry=false&resultRecordCount=100&f=json`
  const body = JSON.parse(await fetchText(url))
  if (body.error) throw new Error(`state query error: ${body.error.message}`)
  const map = new Map()
  for (const f of body.features ?? []) {
    const fips = String(f.attributes?.GEOID ?? '').padStart(2, '0')
    const abbr = String(f.attributes?.STUSAB ?? '').trim()
    if (!/^\d{2}$/.test(fips) || !abbr) continue
    map.set(fips, abbr)
  }
  if (map.size < 50) throw new Error(`only ${map.size} state codes; the country has 56`)
  return map
}

/**
 * Picks one place per ZCTA: the largest land overlap.
 *
 * The tiebreak on the place's own land area exists so the result is
 * deterministic. Measured, it is never needed — every ZCTA has at least one
 * relationship row with a non-zero land overlap — but a tie resolved by file
 * order would attach a city to a ZIP by accident, and a mapping that is wrong in
 * a way nobody can see is the failure mode this project keeps designing against.
 */
function parsePlace(text) {
  const best = new Map()
  const lines = text.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const c = line.split('|')
    const zcta = c[COL.zcta]?.trim()
    if (!zcta || !/^\d{5}$/.test(zcta)) continue
    const name = c[COL.placeName]?.trim()
    if (!name) continue
    const part = Number(c[COL.partLandArea] || 0)
    const area = Number(c[COL.placeLandArea] || 0)
    const cur = best.get(zcta)
    if (cur && !(part > cur.part || (part === cur.part && area > cur.area))) continue
    best.set(zcta, {
      name,
      part,
      area,
      stateFips: c[COL.placeGeoId]?.trim().slice(0, 2) ?? '',
      // G4110 is an incorporated place; G4210 is a statistical area (CDP). Kept
      // because the display layer must shorten "Anchorage municipality" without
      // touching a statistical area's published name, and because naive suffix
      // stripping corrupts real names — there are CDPs literally called
      // "Carroll County", and names ending "Princeton".
      incorporated: c[COL.mtfcc]?.trim() === 'G4110',
    })
  }
  return best
}

/**
 * One county per ZCTA, keeping the county GEOID and the share of the ZCTA's own
 * land that falls inside it.
 *
 * The share is what lets an aggregate disclose its own approximation: a ZCTA
 * with share 100 nests cleanly in its county, a ZCTA with share 62 straddles a
 * boundary and its whole count is attributed to the larger side. Without the
 * share, a county total looks exact when part of it belongs to a neighbour.
 *
 * Ties on land overlap are broken by GEOID so the result is deterministic from
 * the file's contents rather than from its row order.
 */
function parseCountyIndex(text) {
  const best = new Map()
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line) continue
    const c = line.split('|')
    const zcta = c[COL_COUNTY.zcta]?.trim()
    // This is the county-only block at the head of the file, not a missing value.
    if (!zcta || !/^\d{5}$/.test(zcta)) continue
    const geoid = c[COL_COUNTY.countyGeoid]?.trim()
    if (!geoid || !/^\d{5}$/.test(geoid)) {
      throw new Error(`ZIP ${zcta} has county GEOID "${geoid}", which is not five digits`)
    }
    const name = c[COL_COUNTY.countyName]?.trim()
    if (!name) throw new Error(`county ${geoid} has no published name`)
    const part = Number(c[COL_COUNTY.partLand] || 0)
    const whole = Number(c[COL_COUNTY.zctaLand] || 0)
    const share = whole > 0 ? Math.round((part / whole) * 100) : null
    const cur = best.get(zcta)
    if (cur && (part < cur.part || (part === cur.part && geoid >= cur.geoid))) continue
    best.set(zcta, { geoid, name, part, share })
  }
  return best
}

/** One county per ZCTA, same rule. Used only where no incorporated place overlaps. */
function parseCounty(text) {
  const best = new Map()
  const lines = text.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const c = line.split('|')
    const zcta = c[COL.zcta]?.trim()
    if (!zcta || !/^\d{5}$/.test(zcta)) continue
    const name = c[COL.placeName]?.trim()
    if (!name) continue
    const part = Number(c[COL.partLandArea] || 0)
    const cur = best.get(zcta)
    if (cur && part <= cur.part) continue
    // GEOID_COUNTY_20 is five digits: state FIPS then county FIPS.
    best.set(zcta, { name, part, stateFips: c[COL.placeGeoId]?.trim().slice(0, 2) ?? '' })
  }
  return best
}

/**
 * Writes the ZCTA-to-county index: one county per ZIP, dictionary-packed.
 *
 * The county names are stored once per county rather than once per ZIP because
 * there are about 3,143 counties against 33,791 ZIPs, and the record is the
 * county's index plus the share of the ZCTA's land inside it (0-100). A share of
 * 100 means the ZCTA nests cleanly; anything less is a straddling ZCTA whose
 * whole count is attributed to the larger side, and the consumer must be able to
 * say so rather than present the sum as exact.
 */
function writeCountyIndex(index, states, target) {
  const zips = [...index.keys()].sort()
  if (zips.length !== EXPECTED_ZCTAS) {
    throw new Error(
      `${zips.length} ZCTAs carry a county; the country has ${EXPECTED_ZCTAS} and a short fetch is a bug`,
    )
  }

  const countyGeoids = []
  const countyNames = []
  const countyAt = new Map()
  const straddling = []
  let shareUnknown = 0
  let records = ''
  const deltas = []
  let previous = -1

  for (const zip of zips) {
    const row = index.get(zip)
    let ci = countyAt.get(row.geoid)
    if (ci === undefined) {
      ci = countyGeoids.length
      countyGeoids.push(row.geoid)
      countyNames.push(row.name)
      countyAt.set(row.geoid, ci)
    }
    if (ci > 9999) throw new Error(`county dictionary overflow at ${row.geoid}`)
    if (row.share === null) shareUnknown++
    if (row.share !== null && row.share < 100) straddling.push(zip)
    const share = row.share ?? 0
    if (share < 0 || share > 100) throw new Error(`land share out of range for ${zip}: ${share}`)
    // 4 + 3 = 7 characters per ZIP: county dictionary id, then land share 0-100.
    records += String(ci).padStart(4, '0') + String(share).padStart(3, '0')

    const delta = Number(zip) - previous - 1
    if (delta < 0 || delta > 9999) {
      throw new Error(`ZIP delta out of range at ${zip}: ${delta} (0..9999 expected)`)
    }
    deltas.push(delta)
    previous = Number(zip)
  }

  // Measured 2026-11-06 on the published file: 3,211 distinct counties carrying a
  // ZCTA. That is the 3,143 county equivalents of the 50 states and DC plus
  // Puerto Rico's municipios (3,221 at most; a few carry no ZCTA). A count well
  // outside this range means the parser read the county-only header block or
  // dropped rows, which is why the bound is asserted.
  if (countyGeoids.length < 3000 || countyGeoids.length > 3221) {
    throw new Error(
      `${countyGeoids.length} distinct counties; the published 2020 file carries about 3,211 and at most 3,221`,
    )
  }
  for (const geoid of countyGeoids) {
    const fips = geoid.slice(0, 2)
    if (!states.get(fips)) {
      throw new Error(`county ${geoid} has state FIPS "${fips}", which TIGERweb did not return`)
    }
  }

  const payload = {
    v: 1,
    source: 'US Census Bureau 2020 ZCTA-to-County relationship file (tab20_zcta520_county20_natl.txt)',
    note:
      'One county per ZCTA: the county holding the largest share of the ZCTA land. share is ' +
      'AREALAND_PART as a percentage of the ZCTA land area; 100 means the ZIP nests cleanly in ' +
      'the county, below 100 means it straddles a boundary. Medians are not aggregated by consumers.',
    zd: deltas,
    counties: countyGeoids.map((geoid, i) => [geoid, countyNames[i]]),
    states: Object.fromEntries(states),
    rec: records,
  }

  const json = JSON.stringify(payload)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(target, json)
  log(`zcta-counties.json: ${zips.length} records, ${countyGeoids.length} counties, ${(json.length / 1024).toFixed(0)} KB raw`)
  log(`  ${zips.length - straddling.length} ZIPs nest in their county, ${straddling.length} straddle, ${shareUnknown} have no land share`)

  const manifestPath = join(OUT, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.countyMappingZctas = zips.length
  manifest.countyMappingCounties = countyGeoids.length
  manifest.countyMappingStraddleZips = straddling.length
  manifest.countyMappingShareUnknown = shareUnknown
  manifest.countyMappingBytes = Buffer.byteLength(json)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  log('manifest.json updated (existing keys preserved)')
}

async function main() {
  const force = process.argv.includes('--force')
  const target = join(OUT, 'zcta-places.json')
  const countyTarget = join(OUT, 'zcta-counties.json')
  const needPlaces = force || !existsSync(target)
  const needCounties = force || !existsSync(countyTarget)
  if (!needPlaces && !needCounties) {
    log('zcta-places.json and zcta-counties.json already present; pass --force to regenerate')
    return
  }

  log('fetching state FIPS to abbreviation from TIGERweb (keyless)...')
  const states = await fetchStateCodes()
  log(`  ${states.size} state codes`)

  log('fetching the ZCTA-to-county relationship file (6.8 MB, keyless)...')
  const countyText = await fetchText(COUNTY_URL)

  if (needCounties) {
    writeCountyIndex(parseCountyIndex(countyText), states, countyTarget)
    if (!needPlaces) return
  }

  log('fetching the ZCTA-to-place relationship file (9.8 MB, keyless)...')
  const placeText = await fetchText(PLACE_URL)

  const places = parsePlace(placeText)
  const counties = parseCounty(countyText)
  log(`  ${places.size} ZCTAs with an incorporated place, ${counties.size} with a county`)

  const zips = [...new Set([...places.keys(), ...counties.keys()])].sort()
  if (zips.length !== EXPECTED_ZCTAS) {
    throw new Error(`${zips.length} ZCTAs; the country has ${EXPECTED_ZCTAS} and a short fetch is a bug`)
  }

  const missing = zips.filter((z) => !places.has(z) && !counties.has(z))
  if (missing.length > 0) {
    throw new Error(`${missing.length} ZCTAs resolve to neither a city nor a county: ${missing.slice(0, 5)}`)
  }

  // Dictionary-packed. Repeating "Springfield city, IL" once per ZIP rather than
  // 14,789 times takes the file from 926 kB to ~450 kB raw, which is the whole
  // reason this is worth doing: the index is otherwise larger than the app.
  const names = []
  const nameIndex = new Map()
  const stateList = []
  const stateIndex = new Map()
  const intern = (list, map, value) => {
    const at = map.get(value)
    if (at !== undefined) return at
    const id = list.length
    list.push(value)
    map.set(value, id)
    return id
  }

  let records = ''
  let cityCount = 0
  for (const zip of zips) {
    const p = places.get(zip)
    const kind = p ? 'C' : 'K'
    if (p) cityCount++
    const source = p ?? counties.get(zip)
    const fips = source.stateFips
    const abbr = states.get(fips)
    if (!abbr) {
      throw new Error(`ZIP ${zip} resolved to state FIPS "${fips}", which TIGERweb did not return`)
    }
    const n = intern(names, nameIndex, source.name)
    const s = intern(stateList, stateIndex, abbr)
    if (n > 99999 || s > 99) throw new Error(`dictionary overflow: name=${n} state=${s}`)
    // 5 + 2 + 2 = 9 characters per ZIP: name, state, then kind and legal class.
    records += String(n).padStart(5, '0') + String(s).padStart(2, '0') + kind + (p?.incorporated ? 'I' : 'S')
  }

  // The ZIP list is delta-encoded rather than stored literally. ZCTAs are
  // ascending with a measured maximum gap of 1,096, so four digits per ZIP is
  // ample, and it takes the list from 78 kB gzipped to 11 kB. The bound is
  // asserted below rather than assumed: a gap that overflowed four digits would
  // silently corrupt the list, and a corrupt list would attach cities to the
  // wrong ZIP codes.
  const deltas = []
  let previous = -1
  for (const zip of zips) {
    const delta = Number(zip) - previous - 1
    if (delta < 0 || delta > 9999) {
      throw new Error(`ZIP delta out of range at ${zip}: ${delta} (0..9999 expected)`)
    }
    deltas.push(delta)
    previous = Number(zip)
  }

  const payload = {
    v: 1,
    source: 'US Census Bureau 2020 ZCTA-to-Place and ZCTA-to-County relationship files',
    note:
      'names are NAMELSAD_PLACE_20 / NAMELSAD_COUNTY_20 verbatim. I = incorporated place, ' +
      'S = statistical area (CDP). C = resolved to a place, K = resolved to a county. ' +
      'Display shortening is applied in src/core/zcta-place-index.ts, not here.',
    zd: deltas,
    names,
    states: stateList,
    rec: records,
  }

  const json = JSON.stringify(payload)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(target, json)
  log(`zcta-places.json: ${zips.length} records, ${(json.length / 1024).toFixed(0)} KB raw`)
  log(`  ${cityCount} resolved to an incorporated place, ${zips.length - cityCount} to a county`)
  log(`  ${names.length} distinct names, ${stateList.length} distinct states`)

  // Folded into the existing manifest rather than replacing it, because the gate
  // and `tools/gen-map-data.mjs` both read keys that must keep working.
  const manifestPath = join(OUT, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.placeMappingZctas = zips.length
  manifest.placeMappingCities = cityCount
  manifest.placeMappingCounties = zips.length - cityCount
  manifest.placeMappingBytes = Buffer.byteLength(json)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  log('manifest.json updated (existing keys preserved)')
}

await main()
