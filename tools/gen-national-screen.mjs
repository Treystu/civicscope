/**
 * Builds the national screen corpus the #69 measurement needs.
 *
 * The artefact is deliberately values-only - a ZIP code and the four
 * `SIMILARITY_METRICS` figures - because the harness rejects anything else:
 * a corpus assembled by the wrong script would produce a confident number about
 * the wrong population.
 *
 * Where the numbers come from: the Census Bureau's own ACS 5-year estimates,
 * through the same variables `src/core/plugins/acs.ts` ships, requested per
 * state so each request stays inside the API's geography ceiling. Nothing is
 * computed, imputed or filled in: a missing-value sentinel becomes `null`, and
 * the complete-case rule in the harness then excludes that area from a
 * comparison rather than inventing a figure for it.
 *
 * The build fails closed. If the assembled ZIP set is not exactly the committed
 * index's set - same codes, no duplicates, nothing missing - it refuses to write
 * the file. A row count is not a ZIP set: one duplicated and one missing area
 * keep the count at 33,791 while moving every distance measured against the
 * missing area, which is the same count-instead-of-set defect as #78.
 *
 * The key is read through `load-census-key.mjs`, which never prints it. When no
 * key is available this tool exits non-zero and writes nothing; it does not
 * synthesise a corpus.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadCensusKeyFromScmorc } from './load-census-key.mjs'
import { unpackCountyIndex } from './zcta-index.mjs'

const ROOT = process.cwd()
const INDEX_PATH = join(ROOT, 'public', 'map', 'zcta-counties.json')
const OUT_PATH = join(ROOT, 'tests', 'fixtures', 'national-screen.json')

/** The survey year the shipped sweep names (`SWEEP_VERSION`), not an arbitrary one. */
const YEAR = 2023

/** Publisher variable ids, matching `VARS` in `src/core/plugins/acs.ts`. */
const FIELDS = [
  ['median_rent_burden_pct', 'B25071_001E'],
  ['median_gross_rent', 'B25064_001E'],
  ['median_home_value', 'B25077_001E'],
  ['median_household_income', 'B19013_001E'],
]

const PACE_MS = 350

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const index = unpackCountyIndex(JSON.parse(readFileSync(INDEX_PATH, 'utf8')))

/**
 * ZCTAs are a national geography: the API rejects `for=zip code tabulation area:*
 * &in=state:XX` with HTTP 400, so the corpus is requested as explicit ZIP lists.
 * 800 per request is the shipped ceiling from `sweep/chunk.ts`, measured against
 * the live API - it is URL length, not row count, that the service rejects.
 */
const CHUNK_SIZE = 800

/**
 * A sentinel is an absent estimate, not a number. All four figures are
 * non-negative in reality, so any negative value is a census missing-value
 * encoding and becomes null rather than reaching a distance.
 */
const asValue = (raw) => {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

async function fetchChunk(zips) {
  const key = process.env.CENSUS_KEY
  if (!key) throw new Error('no Census key available; nothing was fetched')
  const vars = FIELDS.map(([, id]) => id).join(',')
  // ZCTA values must NOT be quoted: `'78701'` returns HTTP 400, the unquoted
  // form returns rows (`sweep/chunk.ts` records the bisection).
  const url =
    `https://api.census.gov/data/${YEAR}/acs/acs5?get=${vars}` +
    `&for=zip%20code%20tabulation%20area:${zips.join(',')}&key=${key}`

  let lastError
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url)
      // The API answers HTTP 200 with an HTML page when a key or variable is
      // wrong, so the body is validated by shape rather than by status.
      const text = await res.text()
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error(
          `chunk ${zips[0]}..${zips[zips.length - 1]}: response was not JSON (HTTP ${res.status}): ` +
            text.slice(0, 160),
        )
      }
      if (!Array.isArray(parsed) || parsed.length < 2) {
        throw new Error(`chunk ${zips[0]}..: response carried no rows (HTTP ${res.status})`)
      }
      return parsed
    } catch (error) {
      lastError = error
      await sleep(1200 * attempt)
    }
  }
  throw new Error(`chunk ${zips[0]}.. failed after 4 attempts: ${lastError?.message}`)
}

loadCensusKeyFromScmorc()
if (!process.env.CENSUS_KEY) {
  console.error(
    'No Census key available (CENSUS_KEY unset and .scmorc unreadable). ' +
      'The national screen cannot be built without one, and this tool will not fabricate it.',
  )
  process.exit(2)
}

const rows = []
const seen = new Set()

const allZips = [...index.keys()].sort()

for (let start = 0; start < allZips.length; start += CHUNK_SIZE) {
  const chunk = allZips.slice(start, start + CHUNK_SIZE)
  const table = await fetchChunk(chunk)
  const header = table[0]
  const zipCol = header.findIndex((h) => /zip code tabulation area/i.test(h))
  if (zipCol < 0) throw new Error(`chunk ${chunk[0]}: response has no ZCTA column`)
  const cols = FIELDS.map(([, id]) => {
    const at = header.indexOf(id)
    if (at < 0) throw new Error(`chunk ${chunk[0]}: response is missing ${id}`)
    return at
  })

  for (const record of table.slice(1)) {
    const zcta = record[zipCol]
    // Only committed-index ZCTAs are part of the population under measurement;
    // the index itself is complete for the country, so dropping an unknown code
    // here is not a shortcut, it is the population definition.
    if (typeof zcta !== 'string' || !index.has(zcta)) continue
    if (seen.has(zcta)) throw new Error(`duplicate ZIP code ${zcta} across state responses`)
    seen.add(zcta)
    const row = { zcta }
    FIELDS.forEach(([metric], i) => {
      row[metric] = asValue(record[cols[i]])
    })
    rows.push(row)
  }
  console.log(`[screen] chunk ${start / CHUNK_SIZE + 1}: ${rows.length} rows so far`)
  await sleep(PACE_MS)
}

const expected = new Set(index.keys())
const missing = [...expected].filter((z) => !seen.has(z)).sort()
const extra = [...seen].filter((z) => !expected.has(z))
if (extra.length) {
  console.error(`[screen] refusing to write: ${extra.length} ZIPs outside the committed index`)
  process.exit(1)
}

/**
 * Every index ZIP gets a row, and an area the publisher carries no estimate for
 * gets explicit nulls rather than being dropped. The ACS 5-year tables do not
 * cover every TIGER ZCTA - the Virgin Islands codes 008xx are the measured
 * example - and a silently shorter file would move every distance measured
 * against the missing areas. Null is the label for "not published" and the
 * harness's complete-case rule is what excludes it.
 */
if (missing.length) {
  console.log(`[screen] ${missing.length} ZCTAs have no published ACS estimate; writing explicit nulls`)
  console.log(`[screen] unpublished: ${missing.join(', ')}`)
  for (const zcta of missing) {
    const row = { zcta }
    for (const [metric] of FIELDS) row[metric] = null
    rows.push(row)
  }
}

if (rows.length !== expected.size) {
  console.error(`[screen] refusing to write: ${rows.length} rows for ${expected.size} ZIPs`)
  process.exit(1)
}

rows.sort((a, b) => a.zcta.localeCompare(b.zcta))
mkdirSync(join(ROOT, 'tests', 'fixtures'), { recursive: true })
writeFileSync(OUT_PATH, JSON.stringify({ rows }))
console.log(`[screen] wrote ${rows.length} values-only rows to ${OUT_PATH}`)
