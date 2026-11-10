import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCountyIndex, type PackedCountyIndex } from '../src/core/zcta-county-index'

/**
 * Issue #78: the gate's sitemap proof is `urls > 30000` under the label "sitemap covers
 * every ZIP code (33793 URLs)". A count with 10% headroom cannot establish set
 * completeness, and the label claims exactly that.
 *
 * These tests do two things the gate currently does not: compare the served sitemap to the
 * committed index as a set, and pin the difference in strictness with a negative case, so
 * the defect is demonstrated by a test rather than described in prose.
 *
 * The gate threshold is deliberately not asserted as correct here - that is an instrument
 * change and belongs to a decision, not to an audit pass. What is asserted is that the two
 * rules disagree on the same input, which is the defect.
 */

const ROOT = process.cwd()

const INDEX = JSON.parse(
  readFileSync(join(ROOT, 'public', 'map', 'zcta-counties.json'), 'utf8'),
) as PackedCountyIndex

/** Every ZIP named by a `/z/{zip}/` URL in a sitemap, ignoring the two static pages. */
function sitemapZips(xml: string): Set<string> {
  const out = new Set<string>()
  for (const match of xml.matchAll(/<loc>[^<]*?\/z\/(\d{5})\/?<\/loc>/g)) out.add(match[1])
  return out
}

/** The strict rule: set equality, both directions. */
function compare(zips: Iterable<string>, xml: string): { missing: string[]; extra: string[] } {
  const served = sitemapZips(xml)
  const expected = new Set(zips)
  return {
    missing: [...expected].filter((z) => !served.has(z)).sort(),
    extra: [...served].filter((z) => !expected.has(z)).sort(),
  }
}

/** A sitemap body in the generator's shape, so the negative case is the real format. */
function sitemapFor(zips: Iterable<string>): string {
  const urls = [...zips].map((z) => `  <url><loc>https://example.test/z/${z}/</loc></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
}

const builtSitemap = join(ROOT, 'dist', 'sitemap.xml')
const hasBuild = existsSync(builtSitemap)

describe('Sitemap completeness (issue #78)', () => {
  const zips = [...parseCountyIndex(INDEX).keys()]

  it('the committed index carries every ZIP the app claims to cover', () => {
    // The gate prints this same number beside "every ZIP code names the place it is in".
    // Pinned so a shrinking index is a failure here rather than a quietly smaller sitemap.
    expect(zips.length).toBe(33791)
    expect(new Set(zips).size).toBe(33791)
  })

  // A labelled skip, never a pass: the repository convention (see the #69 harness) is that an
  // absent artefact reports as skipped, so a build that silently stopped emitting a sitemap
  // cannot look like a passing check here.
  it.skipIf(!hasBuild)('compares the built sitemap to the index as a set', () => {
    const { missing, extra } = compare(zips, readFileSync(builtSitemap, 'utf8'))
    expect(missing.slice(0, 10)).toEqual([])
    expect(extra.slice(0, 10)).toEqual([])
  })

  it('the strict rule rejects a sitemap missing one ZIP, and the gate count accepts it', () => {
    // A full-length sitemap with its first ZIP dropped: 33,790 ZIPs plus the two static pages.
    const dropped = zips[0]
    const xml = sitemapFor(zips.slice(1))

    // Strict: the missing code is named.
    expect(compare(zips, xml).missing).toEqual([dropped])

    // The gate's actual rule, reproduced exactly as written at completion-gate.mjs:1057.
    const urlCount = (xml.match(/<url>/g) ?? []).length
    const gateRule = urlCount + 2 > 30000
    expect(gateRule).toBe(true)

    // Both statements are true of the same input: the rule the gate uses says "pass" for a
    // sitemap that is missing a ZIP code, while its label says "covers every ZIP code".
    expect(compare(zips, xml).missing.length).toBeGreaterThan(0)
  })
})
