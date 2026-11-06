/**
 * Which county a ZIP code is in, from a committed Census artefact.
 *
 * This is the county counterpart of `zcta-place-index.ts`, and it exists for the
 * same measured reason: a country-wide table has 33,791 rows, so resolving a
 * county per row at runtime would be 33,791 requests rather than none. The
 * mapping is baked by `tools/gen-zcta-city-mapping.mjs` from the Census Bureau's
 * own 2020 ZCTA-to-County relationship file and served from `/map/`, which
 * `public/_headers` marks immutable for a year.
 *
 * Two things this index deliberately carries that a plain ZIP-to-county lookup
 * would not:
 *
 *   1. The county GEOID, so a row can be traced to the publisher's own county
 *      table instead of stopping at a display name.
 *   2. The share of the ZCTA's land area that falls inside that county. ZCTAs do
 *      not nest inside counties: 9,790 of 33,791 straddle a boundary. Without
 *      the share, a county total built from whole-ZIP attribution looks exact
 *      when part of it belongs to a neighbour, which is the kind of silent
 *      wrongness this project's honesty floor exists to block. See
 *      `county-aggregate.ts`, which refuses to hide it.
 *
 * The artefact is dictionary-packed: each record is a 4-digit county dictionary
 * id and a 3-digit land share, and the ZIP list is delta-encoded. Measured, the
 * unpacked alternative is roughly three times the bytes for the same data.
 */

/** Served from `/map/`, which is cached immutably for a year. */
export const ZCTA_COUNTIES_URL = '/map/zcta-counties.json'

/**
 * Every ZCTA in the country. A short index is a bug in the artefact, not a
 * smaller dataset, so it is asserted rather than accepted.
 */
export const EXPECTED_COUNTY_INDEX_ZCTAS = 33791

/** 4 characters of county id plus 3 of land share. */
export const RECORD_WIDTH = 7

/** A ZIP code resolved to the county holding most of its land. */
export interface CountyIndexRecord {
  zip: string
  /** Five-digit county FIPS: two state digits then three county digits. */
  countyGeoid: string
  /** `NAMELSAD_COUNTY_20` verbatim, e.g. `Los Angeles County`. */
  countyName: string
  /** Postal abbreviation, e.g. `CA`. */
  state: string
  /**
   * `AREALAND_PART` as a percentage of the ZCTA's own land area, rounded.
   * 100 means the ZCTA nests cleanly in this county; below 100 means it
   * straddles a boundary and the remainder lies in a neighbouring county.
   */
  landSharePercent: number
  /** True only at a share of 100. */
  whollyContained: boolean
}

/** The committed artefact's shape, as written by the generator. */
export interface PackedCountyIndex {
  v: number
  source: string
  note?: string
  /** Delta-encoded, ascending ZCTA list: each value is `zip - previous - 1`. */
  zd: number[]
  /** County dictionary, indexed by the id stored in each record. */
  counties: [string, string][]
  /** State FIPS to postal abbreviation, so no per-record state field is needed. */
  states: Record<string, string>
  /** Fixed-width records, one per ZIP, in `zd` order. */
  rec: string
}

/**
 * Unpacks the artefact into records keyed by ZIP.
 *
 * Every failure here is a thrown error rather than a skipped row. A partly
 * decoded index would attribute ZIPs to the wrong counties while still looking
 * like a working lookup, and a county aggregate built on it would be wrong in a
 * way no reader could see.
 */
export function parseCountyIndex(packed: PackedCountyIndex): Map<string, CountyIndexRecord> {
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

  const out = new Map<string, CountyIndexRecord>()
  let previous = -1
  for (let i = 0; i < packed.zd.length; i++) {
    const delta = packed.zd[i]
    if (!Number.isInteger(delta) || delta < 0 || delta > 9999) {
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
  if (out.size !== EXPECTED_COUNTY_INDEX_ZCTAS) {
    throw new Error(
      `${out.size} ZIP codes in zcta-counties.json; the country has ` +
        `${EXPECTED_COUNTY_INDEX_ZCTAS}, and a short index is a bug in the artefact`,
    )
  }
  return out
}

/** The county for one ZIP, or undefined when the ZIP is not in the index. */
export function countyForZip(
  index: Map<string, CountyIndexRecord>,
  zip: string,
): CountyIndexRecord | undefined {
  return index.get(zip.trim())
}

/**
 * Fetches and unpacks the committed artefact.
 *
 * Not called on the data path: the drilldown already has the ZIP it needs and
 * the aggregate is computed in memory. This is for callers that genuinely need
 * the whole country.
 */
export async function loadCountyIndex(
  url: string = ZCTA_COUNTIES_URL,
  signal?: AbortSignal,
): Promise<Map<string, CountyIndexRecord>> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`zcta-counties.json: HTTP ${res.status} from ${url}`)
  return parseCountyIndex((await res.json()) as PackedCountyIndex)
}
