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
 *
 * The decoder itself lives in `tools/zcta-index.mjs` and is imported here rather
 * than reimplemented. The completion gate is plain `.mjs` and cannot import this
 * module, so one shared implementation is the only way the app, the gate and the
 * tests can decode the same bytes the same way - two hand-rolled decoders in this
 * repository each got the packing wrong (issue #78).
 */

import {
  RECORD_WIDTH,
  EXPECTED_ZCTAS,
  unpackCountyIndex,
  type CountyIndexRecord,
  type PackedCountyIndex,
} from '../../tools/zcta-index.mjs'

export { RECORD_WIDTH, type CountyIndexRecord, type PackedCountyIndex }

/** Served from `/map/`, which is cached immutably for a year. */
export const ZCTA_COUNTIES_URL = '/map/zcta-counties.json'

/**
 * Every ZCTA in the country. A short index is a bug in the artefact, not a
 * smaller dataset, so it is asserted rather than accepted.
 */
export const EXPECTED_COUNTY_INDEX_ZCTAS = EXPECTED_ZCTAS

/** Unpacks the artefact into records keyed by ZIP, through the shared decoder. */
export function parseCountyIndex(packed: PackedCountyIndex): Map<string, CountyIndexRecord> {
  return unpackCountyIndex(packed)
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
