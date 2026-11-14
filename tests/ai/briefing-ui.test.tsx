import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  generateBriefingPack,
  type BriefingFigure,
  type FigureResolver,
} from '../../src/core/ai/briefing'
import { createStubProvider } from '../../src/core/ai/provider'
import type { SourceRef } from '../../src/core/types'
import { BriefingPackView, MethodologyQa, requestBriefingPack } from '../../src/ui/ai/BriefingView'

const ACS: SourceRef = {
  publisher: 'U.S. Census Bureau',
  dataset: 'ACS 5-year',
  tableId: 'B25064',
  vintage: '2023',
  url: 'https://api.census.gov/data/2023/acs/acs5',
}

const FIGURES: BriefingFigure[] = [
  { key: 'median_gross_rent', geography: '96778', value: 1250, marginOfError: 90, source: ACS },
]

const HONEST: FigureResolver = async (figure) => ({
  value: figure.value,
  marginOfError: figure.marginOfError,
})

const REQ = {
  figureSetId: 'briefing-view',
  title: 'Selected places',
  viewKind: 'drilldown selection',
  places: ['Pahoa, HI'],
  figures: FIGURES,
  generatedAt: new Date('2026-10-31T00:00:00Z'),
}

describe('requestBriefingPack', () => {
  it('returns the generated pack on the happy path', async () => {
    const outcome = await requestBriefingPack(createStubProvider(), REQ, HONEST)
    expect(outcome.pack?.verifiedCount).toBe(1)
    expect(outcome.verificationFailures).toBeUndefined()
  })

  it('surfaces re-verification failures as their own outcome, not an error message', async () => {
    const tampered: FigureResolver = async () => ({ value: 1, marginOfError: 90 })
    const outcome = await requestBriefingPack(createStubProvider(), REQ, tampered)
    expect(outcome.pack).toBeUndefined()
    expect(outcome.verificationFailures?.[0]?.reason).toBe('value_mismatch')
    expect(outcome.message).toBeUndefined()
  })

  it('maps a provider failure to the unavailable message with an error state', async () => {
    const provider = createStubProvider({
      async briefing() {
        throw Object.assign(new Error('provider_down'), { code: 'provider_down' })
      },
    })
    const outcome = await requestBriefingPack(provider, REQ, HONEST)
    expect(outcome.message).toContain('unavailable right now')
    expect(outcome.errorState).toBe('provider_down')
  })
})

describe('BriefingPackView', () => {
  it('renders cover, figures with provenance, appendix, and the pack note', async () => {
    const pack = await generateBriefingPack(REQ, {
      provider: createStubProvider(),
      resolveFigure: HONEST,
    })
    const html = renderToStaticMarkup(<BriefingPackView pack={pack} />)
    expect(html).toContain('Briefing pack — Selected places')
    expect(html).toContain('1,250 ± 90')
    expect(html).toContain('B25064')
    expect(html).toContain('Methodology and citations')
    expect(html).toContain('describe places, not people')
  })

  it('renders a withheld narrative without the refused wording', async () => {
    const provider = createStubProvider({
      async briefing() {
        return { prose: 'The median gross rent is 9,999.' }
      },
    })
    const pack = await generateBriefingPack(REQ, { provider, resolveFigure: HONEST })
    const html = renderToStaticMarkup(<BriefingPackView pack={pack} />)
    expect(html).toContain('Explanation withheld')
    expect(html).not.toContain('9,999')
  })
})

describe('MethodologyQa', () => {
  it('renders the Q&A entry with its scope stated', () => {
    const html = renderToStaticMarkup(<MethodologyQa />)
    expect(html).toContain('Ask about the data')
    expect(html).toContain('Methodology question')
    expect(html).toContain('Questions about the figures themselves belong to search')
  })
})
