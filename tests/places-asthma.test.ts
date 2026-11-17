/**
 * CDC PLACES asthma binding (queue item 6).
 *
 * The lane had filed this as an open question - should asthma serve a per-ZIP
 * drilldown figure, or the country-wide screen? - on the assumption that a new
 * plugin would be needed. Reading the tree showed the premise was wrong: a PLACES
 * plugin already ships, is already keyless, is already registered in the drilldown
 * catalog, and already routes every measure it emits through the protected-class
 * stamp, the suppression floor and the notice. Asthma is a measure in the same
 * tract release, in the same wide row shape, so it belongs in that list and
 * inherits the whole safety path rather than a parallel one.
 *
 * These assertions pin the four ways that inheritance can quietly break: the
 * measure contract itself, the 95% interval column the fetch derives from the
 * field name, exclusion from sorting, and exclusion from filtering.
 */
import { describe, expect, it } from 'vitest'

import { cdcPlacesPlugin, PLACES_MEASURES } from '../src/core/plugins/keyless'
import { isFilterLegal } from '../src/core/ai/intent-schema'
import { isSortableMetricKey, SORTABLE_METRIC_KEYS } from '../src/core/sortable-surface'

const asthma = PLACES_MEASURES.find((measure) => measure.key === 'pct_asthma')

describe('CDC PLACES asthma measure', () => {
  it('is published from the tract release field that exists', () => {
    expect(asthma, 'pct_asthma is not in PLACES_MEASURES').toBeDefined()
    expect(asthma?.field).toBe('casthma_crudeprev')
    expect(asthma?.label).toMatch(/asthma/i)
  })

  it('names the measure as self-reported, not a diagnosis', () => {
    // The sibling measures carry this caveat because a modelled prevalence is
    // easy to read as a clinical statement about people who live somewhere.
    expect(asthma?.note).toMatch(/self-reported|not a clinical diagnosis/i)
  })

  it('derives the 95% interval column the fetch actually requests', () => {
    // keyless.ts builds the interval column as
    // `${field.replace('_crudeprev', '')}_crude95ci`; if the field name ever
    // stops matching that shape the interval silently becomes null and the
    // figure ships without its precision.
    const intervalColumn = `${asthma?.field.replace('_crudeprev', '')}_crude95ci`
    expect(intervalColumn).toBe('casthma_crude95ci')
  })

  it('cannot be sorted, filtered, ranked or composited', () => {
    expect(isSortableMetricKey('pct_asthma')).toBe(false)
    expect(SORTABLE_METRIC_KEYS).not.toContain('pct_asthma')
    expect(isFilterLegal('pct_asthma')).toBe(false)
  })

  it('inherits the plugin-level protected-class stamp and notice', () => {
    // The executor stamps `protectedClassProxy` from the plugin, so the only
    // thing this test needs to hold is that the plugin still declares it and
    // still carries a notice - a plugin that drops either would let a health
    // measure reach a ranking or a page without disclosure.
    expect(cdcPlacesPlugin.legal.protectedClassProxy).toBe(true)
    expect(cdcPlacesPlugin.legal.notice).toBeTruthy()
    expect(cdcPlacesPlugin.legal.suppressBelow).toBeGreaterThan(0)
  })

  it('keeps measure keys and dataset fields unique', () => {
    const keys = PLACES_MEASURES.map((measure) => measure.key)
    const fields = PLACES_MEASURES.map((measure) => measure.field)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(fields).size).toBe(fields.length)
  })

  it('rides the existing keyless drilldown rather than a new plugin', () => {
    expect(cdcPlacesPlugin.id).toBe('cdc-places')
    expect(cdcPlacesPlugin.category).toBe('health')
    expect(cdcPlacesPlugin.geography).toBe('tract')
    expect(cdcPlacesPlugin.requiresCensusKey).toBeUndefined()
  })
})
