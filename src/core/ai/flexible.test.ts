import { describe, expect, it } from 'vitest'
import {
  EVIDENCE_CLASS_LABELS,
  FALL_THROUGH_REASONS,
  fallThroughReason,
  parseFlexibleDraft,
  verifyFlexibleAnswer,
  type FlexibleAnswer,
} from './flexible'

const answer = (over: Partial<FlexibleAnswer> = {}): FlexibleAnswer => ({
  criteria: ['cheap rent'],
  figures: [],
  places: [],
  prose: 'A place to compare.',
  gaps: [],
  ...over,
})

describe('fall-through is legal only on two reasons', () => {
  it('falls through on an empty parse', () => {
    expect(fallThroughReason({ intent: null, censusMatchCount: null })).toBe('empty_parse')
  })

  it('falls through when a screen matched nothing', () => {
    expect(fallThroughReason({ intent: { mode: 'lookup' }, censusMatchCount: 0 })).toBe(
      'no_census_match',
    )
  })

  it('does not fall through when a screen matched', () => {
    expect(fallThroughReason({ intent: { mode: 'lookup' }, censusMatchCount: 12 })).toBeNull()
  })

  it('does not fall through when no screen ran but an intent parsed', () => {
    expect(fallThroughReason({ intent: { mode: 'compare' }, censusMatchCount: null })).toBeNull()
  })

  it('exposes exactly the two reasons', () => {
    expect([...FALL_THROUGH_REASONS]).toEqual(['empty_parse', 'no_census_match'])
  })
})

describe('closed-schema parse', () => {
  it('rebuilds a valid draft', () => {
    const parsed = parseFlexibleDraft({
      criteria: ['cheap rent'],
      figures: [{ key: 'median_gross_rent', value: 1200, evidence: 'model_knowledge' }],
      places: [{ name: 'Northside', evidence: 'research_named' }],
      prose: 'Rent is lower to the north.',
      gaps: ['no census row'],
      ignored: 'dropped',
    })
    expect(parsed?.figures).toHaveLength(1)
    expect(parsed?.places[0]?.name).toBe('Northside')
    expect(parsed && 'ignored' in parsed).toBe(false)
  })

  it('refuses a draft with the wrong shape outright', () => {
    expect(parseFlexibleDraft({ criteria: 'not an array', prose: 'x', places: [], figures: [], gaps: [] })).toBeNull()
    expect(parseFlexibleDraft(null)).toBeNull()
  })
})

describe('verification fails closed', () => {
  it('refuses an empty answer', () => {
    const v = verifyFlexibleAnswer(answer({ prose: '  ' }), [])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.failure).toBe('empty_answer')
  })

  it('refuses a figure with no evidence class', () => {
    const draft = parseFlexibleDraft({
      criteria: [],
      figures: [{ key: 'median_gross_rent', value: 1200 }],
      places: [],
      prose: '',
      gaps: [],
    })!
    const v = verifyFlexibleAnswer(draft, [])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.failure).toBe('missing_evidence_class')
  })

  it('refuses a census_measured figure with no screened row', () => {
    const v = verifyFlexibleAnswer(
      answer({
        figures: [{ key: 'median_gross_rent', value: 1200, evidence: 'census_measured' }],
      }),
      [],
    )
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.failure).toBe('census_figure_not_screened')
  })

  it('refuses a census_measured figure that differs from its screened row at all', () => {
    const v = verifyFlexibleAnswer(
      answer({
        figures: [
          {
            key: 'median_gross_rent',
            value: 1200,
            evidence: 'census_measured',
            screenedRow: { key: 'median_gross_rent', value: 1210 },
          },
        ],
      }),
      [],
    )
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.failure).toBe('census_figure_not_equal')
  })

  it('accepts a census_measured figure equal to its screened row', () => {
    const v = verifyFlexibleAnswer(
      answer({
        figures: [
          {
            key: 'median_gross_rent',
            value: 1200,
            evidence: 'census_measured',
            screenedRow: { key: 'median_gross_rent', value: 1200 },
          },
        ],
      }),
      [],
    )
    expect(v.ok).toBe(true)
  })

  it('refuses a research_named place the research did not name', () => {
    const v = verifyFlexibleAnswer(
      answer({ places: [{ name: 'Northside', evidence: 'research_named' }] }),
      ['Southside'],
    )
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.failure).toBe('research_place_not_named')
  })

  it('accepts a research_named place the research named, ignoring case and spacing', () => {
    const v = verifyFlexibleAnswer(
      answer({ places: [{ name: '  Northside ', evidence: 'research_named' }] }),
      ['northside'],
    )
    expect(v.ok).toBe(true)
  })

  it('withholds prose that states a numeral no figure backs', () => {
    const v = verifyFlexibleAnswer(answer({ prose: 'Rent there is about 1850 dollars.' }), [])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.failure).toBe('validator_withheld')
  })

  it('withholds a proxy characterisation', () => {
    const v = verifyFlexibleAnswer(answer({ prose: 'This is mostly renters, a tenant area.' }), [])
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.failure).toBe('validator_withheld')
  })

  it('labels every class in plain words', () => {
    for (const label of Object.values(EVIDENCE_CLASS_LABELS)) {
      expect(label.length).toBeGreaterThan(10)
      expect(label).not.toMatch(/[|`*#]/)
    }
  })
})
