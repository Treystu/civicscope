/**
 * The one ZCTA county-index decoder, and the one sitemap-to-index comparison.
 *
 * Why this file exists (issue #78): the app, the gate and the tests must decode
 * `public/map/zcta-counties.json` the same way. The artefact is dictionary-packed
 * and delta-encoded, so a second decoder is not a style problem - two earlier
 * audits wrote hand-rolled decoders and each got the packing subtly wrong, which
 * would attribute ZIPs to the wrong counties while still looking like a working
 * lookup.
 *
 * The gate is plain `.mjs` and cannot import a TypeScript module, so the shared
 * implementation lives here and `src/core/zcta-county-index.ts` imports from it.
 * The gate imports the same functions. A change to the packing rules therefore
 * breaks in exactly one place.
 */

/**
 * Kept free of Node built-ins on purpose: `src/core/zcta-county-index.ts`
 * imports this module, so it is part of the browser bundle. The artefact is
 * read by the caller that has a filesystem - the gate reads it with its own
 * `readFileSync` and the app fetches it - so nothing here touches `node:fs`.
 */

/** Every ZCTA in the country. A short index is a bug in the artefact. */
export const EXPECTED_ZCTAS = 33791

/** 4 characters of county id plus 3 of land share. */
export const RECORD_WIDTH = 7

/**
 * Unpacks the artefact into records keyed by ZIP.
 *
 * Every failure here is a thrown error rather than a skipped row. A partly
 * decoded index would attribute ZIPs to the wrong counties while still looking
 * like a working lookup, and a county aggregate built on it would be wrong in a
 * way no reader could see.
 *
 * @param {object} packed
 * @returns {Map<string, {zip: string, countyGeoid: string, countyName: string, state: string, landSharePercent: number, whollyContained: boolean}>}
 */
export function unpackCountyIndex(packed) {
  if (packed.v !== 1) throw new Error(`zcta-counties.json version ${packed.v}; this reader expects 1`)
  if (!Array.isArray(packed.counties) || packed.counties.length === 0) {
    throw new Error('zcta-counties.json carries no county dictionary')
  }
  if (!Array.isArray(packed.zd) || typeof packed.rec !== 'string') {
    throw new Error('zcta-counties.json is missing its zip list or records')
  }
  if (packed.zd.length * RECORD_WIDTH !== packed.rec.length) {
    throw new Error(
      `zcta-counties.json has ${packed.zd.length} ZIPs but ${packed.rec.length} record characters; ` +
        `each record is ${RECORD_WIDTH} characters, so the file is inconsistent`,
    )
  }

  const counties = packed.counties.map(([geoid, name]) => {
    if (!/^\d{5}$/.test(String(geoid))) throw new Error(`county GEOID "${geoid}" is not five digits`)
    if (!String(name ?? '').trim()) throw new Error(`county ${geoid} has no published name`)
    return { geoid: String(geoid), name: String(name) }
  })

  const out = new Map()
  let previous = -1
  for (let i = 0; i < packed.zd.length; i++) {
    const delta = packed.zd[i]
    if (delta === undefined || !Number.isInteger(delta) || delta < 0 || delta > 9999) {
      throw new Error(`ZIP delta out of range at record ${i}: ${delta} (0..9999 expected)`)
    }
    const zipNumber = previous + delta + 1
    previous = zipNumber
    const zip = String(zipNumber).padStart(5, '0')
    if (!/^\d{5}$/.test(zip)) throw new Error(`decoded ZIP "${zip}" at record ${i} is not five digits`)

    const record = packed.rec.slice(i * RECORD_WIDTH, (i + 1) * RECORD_WIDTH)
    const countyId = Number(record.slice(0, 4))
    const share = Number(record.slice(4, 7))
    const county = counties[countyId]
    if (!county) throw new Error(`record ${i} (${zip}) points at county id ${countyId}, which the dictionary lacks`)
    if (!Number.isInteger(share) || share < 0 || share > 100) {
      throw new Error(`record ${i} (${zip}) carries land share ${share}, outside 0..100`)
    }
    const state = packed.states?.[county.geoid.slice(0, 2)]
    if (!state) {
      throw new Error(`county ${county.geoid} has state FIPS ${county.geoid.slice(0, 2)}, which the file does not map`)
    }

    out.set(zip, {
      zip,
      countyGeoid: county.geoid,
      countyName: county.name,
      state,
      landSharePercent: share,
      whollyContained: share === 100,
    })
  }

  // Asserted after decoding, so a malformed record names its own defect instead
  // of being masked by a count that is also wrong.
  if (out.size !== EXPECTED_ZCTAS) {
    throw new Error(
      `${out.size} ZIP codes in zcta-counties.json; the country has ` +
        `${EXPECTED_ZCTAS}, and a short index is a bug in the artefact`,
    )
  }
  return out
}

/** Every ZIP named by a `/z/{zip}/` URL in a sitemap, ignoring the static pages. */
export function sitemapZips(xml) {
  const out = new Set()
  for (const match of String(xml).matchAll(/<loc>[^<]*?\/z\/(\d{5})\/?<\/loc>/g)) out.add(match[1])
  return out
}

/**
 * The strict rule the gate's label always claimed: set equality, both directions.
 *
 * A count with headroom cannot establish set completeness - a sitemap missing
 * 3,790 ZIPs still holds 30,001 URLs, and used to pass the check labelled
 * "sitemap covers every ZIP code" (issue #78).
 */
export function compareSitemapToIndex(xml, index) {
  if (!(index instanceof Map)) throw new Error('compareSitemapToIndex needs the decoded index passed in')
  const served = sitemapZips(xml)
  const expected = new Set(index.keys())
  return {
    missing: [...expected].filter((z) => !served.has(z)).sort(),
    extra: [...served].filter((z) => !expected.has(z)).sort(),
  }
}
