import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MethodAiSection } from '../../src/ui/ai/MethodAiSection'
import { METRIC_KEYS } from '../../src/core/civicscope-registry'
import { DISCLOSURE_TEXT, VALIDATOR_FAILURES } from '../../src/core/ai/validator'
import { MUSE_SPARK_MODEL } from '../../src/core/ai/meta-client'
import { RAW_TEXT_DISCLOSURE } from '../../src/ui/ai/AskPanel'

/**
 * The methodology AI section is generated from the registry and the closed
 * validator union. These assertions pin that generation: the metric count must
 * be the registry's count, every failure class must be described, and the
 * shipped disclosure and model id must appear verbatim. A hand-written section
 * that drifts would fail here.
 */
describe('methodology AI section', () => {
  const html = renderToStaticMarkup(<MethodAiSection />)
  // React escapes apostrophes in static markup; compare the visible text.
  const text = html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')

  it('takes its metric count from the registry', () => {
    expect(html).toContain(`${METRIC_KEYS.length} figures`)
    expect(METRIC_KEYS.length).toBe(15)
  })

  it('describes every mode the intent schema accepts', () => {
    for (const label of [
      'look up one place',
      'compare places',
      'filter the national screen',
      'find ZIP codes similar to one you name',
    ]) {
      expect(html).toContain(label)
    }
  })

  it('describes every validator withhold class', () => {
    expect(VALIDATOR_FAILURES).toHaveLength(4)
    for (const label of [
      'fair-housing gate does not allow',
      'number that is not among the figures on screen',
      'more decimal places than the shown figure carries',
      'ranking, recommendation, steering, or evaluative phrase',
    ]) {
      expect(html).toContain(label)
    }
  })

  it('carries the shipped disclosure, model id, and raw-text limit', () => {
    expect(text).toContain(DISCLOSURE_TEXT)
    expect(text).toContain(MUSE_SPARK_MODEL)
    expect(text).toContain('leaves the browser as text')
    expect(RAW_TEXT_DISCLOSURE).toContain('cannot be answered from structured choices alone')
  })

  it('states the voice cut instead of implying the product listens', () => {
    expect(html).toContain('no microphone, recording, or transcription interface')
    expect(html.toLowerCase()).not.toContain('durable object')
  })

  it('makes no eval or score claim', () => {
    // The eval record lives in docs and the README, with the live tier marked
    // not run. This page must not turn an unmeasured bar into a percentage.
    expect(html).not.toContain('%')
    expect(html).not.toMatch(/\b95\b/)
  })

  it('is an addressable section with its own heading', () => {
    expect(html).toContain('id="ai-heading"')
    expect(html).toContain('AI search and Explain')
  })
})
