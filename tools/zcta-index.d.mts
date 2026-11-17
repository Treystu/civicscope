/**
 * Types for `tools/zcta-index.mjs`.
 *
 * The decoder is plain ESM because the completion gate is plain `.mjs` and
 * cannot import TypeScript. The app imports the same module, so its shape is
 * declared once here rather than duplicated in `src/core/zcta-county-index.ts`.
 */

export declare const EXPECTED_ZCTAS: number
export declare const RECORD_WIDTH: number

export interface CountyIndexRecord {
  zip: string
  countyGeoid: string
  countyName: string
  state: string
  landSharePercent: number
  whollyContained: boolean
}

export interface PackedCountyIndex {
  v: number
  source: string
  note?: string
  zd: number[]
  counties: [string, string][]
  states: Record<string, string>
  rec: string
}

export declare function unpackCountyIndex(packed: PackedCountyIndex): Map<string, CountyIndexRecord>
export declare function sitemapZips(xml: string): Set<string>
export declare function compareSitemapToIndex(
  xml: string,
  index: Map<string, CountyIndexRecord>,
): { missing: string[]; extra: string[] }
