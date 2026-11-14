/**
 * Does the result map actually draw the reference area, and draw the marks in it?
 *
 * The unit cases in `core/map/result-geometry.test.ts` prove the fit arithmetic.
 * They cannot prove that a visitor sees anything: a component wired into a
 * branch that never renders, or an SVG path that arrives empty, passes every one
 * of them. This drives the built app and reads the drawing out of the DOM.
 *
 * Puerto Rico is the fixture because it is the hard case rather than the easy
 * one: d3's `albersUsa` does not cover the territory, so a build that forgot the
 * conic equal-area branch draws a correct-looking map of nothing. Its ZIP codes
 * are also dense enough that the two marks must separate on screen.
 *
 * No Census fixture is needed. The result map is geometry plus the app's own
 * basemap, centroids and county index, all served from the same origin, so this
 * suite is keyless by construction and never measures a figure - only placement.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

/** Two San Juan ZIP codes, both ZCTAs the centroid asset carries. */
const ZIPS = ['00901', '00920']

let browser: Browser
let page: Page
/**
 * Every context this suite opens, so none outlives it.
 *
 * The audit gate runs all of `src/e2e` in one serialised process, so a context
 * left open here is still running the app - a country-wide load on arrival,
 * a basemap, a county index - while the suites after this one measure timing on.
 * On a two-core CI runner that is what makes an unrelated suite's wait fail: the
 * first CI run of this file took `url-state.e2e.ts` down with it. Closing them in
 * `afterAll` keeps this suite's cost inside this suite.
 */
const contexts: BrowserContext[] = []

/**
 * Clears a first-run overlay so it cannot intercept the nav click.
 *
 * The guided tour and the "new here" notice both sit over the header on a first
 * visit, and Playwright waits for an element to be actionable rather than
 * clicking through: without this the click burns its whole timeout and the suite
 * fails for a reason that has nothing to do with the map. Found in CI, where
 * every run is a first visit and this laptop's browser had already dismissed
 * both.
 */
async function settleFirstRun(opened: Page): Promise<void> {
  for (const name of ['Skip', 'Dismiss', 'Not now']) {
    const button = opened.getByRole('button', { name, exact: true })
    if (await button.count()) {
      await button.first().click({ timeout: 2000 }).catch(() => undefined)
    }
  }
}

/**
 * Opens the map view for a set of ZIP codes, with bounded waits.
 *
 * The timeouts are deliberately small. The completion gate runs this suite with
 * a 15-minute no-output limit, and a suite that waits five minutes per case can
 * consume that budget on its own without printing anything - which is how the
 * gate timed out at head 904f89b. A slow failure here must be a failure, not a
 * silence.
 */
async function openMap(zips: readonly string[]): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  contexts.push(context)
  const target = new URL(BASE)
  target.searchParams.set('z', zips.join(','))
  const opened = await context.newPage()
  opened.setDefaultTimeout(15000)
  await opened.goto(target.toString(), { waitUntil: 'domcontentloaded' })
  await settleFirstRun(opened)
  await opened.getByRole('button', { name: 'Map', exact: true }).click()
  return opened
}

beforeAll(async () => {
  browser = await chromium.launch()
  page = await openMap(ZIPS)
}, 180000)

afterAll(async () => {
  for (const context of contexts) await context.close().catch(() => undefined)
  await browser?.close()
})

describe('e2e: result map', () => {
  it('draws the reference state outline under the marks', async () => {
    const figure = page.locator('[data-result-map]')
    await expect.poll(async () => figure.count(), { timeout: 30000 }).toBeGreaterThan(0)

    // data-outline says which of the two honest outcomes this is. A missing
    // basemap must not be silently reported as a drawn outline.
    await expect.poll(async () => figure.getAttribute('data-outline'), { timeout: 30000 }).toBe('drawn')

    const path = page.locator('[data-result-map-outline]')
    await expect.poll(async () => path.count(), { timeout: 30000 }).toBe(1)
    const d = await path.getAttribute('d')
    expect(d, 'the outline path carried no path data').toBeTruthy()
    expect(d!.length).toBeGreaterThan(20)
    // A drawn territory, not a degenerate move-only path.
    expect(d!.slice(1).match(/[MLC]/g)?.length ?? 0).toBeGreaterThan(2)

    /*
     * And drawn *in the panel*. This is the assertion that found the winding
     * defect: the path was 89,902 units wide in a 600-unit box, which renders as
     * a pale wash over the whole figure with its stroke somewhere off-screen -
     * a plausible-looking panel that tells a reader nothing. Length checks pass
     * on that path; only its bounds do not.
     */
    const box = await path.evaluate((node) => {
      const b = (node as SVGGraphicsElement).getBBox()
      return { x: b.x, y: b.y, width: b.width, height: b.height }
    })
    expect(box.width).toBeGreaterThan(50)
    expect(box.width).toBeLessThan(760)
    expect(box.height).toBeLessThan(560)
    expect(box.x).toBeGreaterThan(-80)
    expect(box.y).toBeGreaterThan(-80)
  }, 60000)

  it('places each selected ZIP inside the drawn area, at distinct positions', async () => {
    const marks = page.locator('[data-result-map-mark]')
    await expect.poll(async () => marks.count(), { timeout: 30000 }).toBe(ZIPS.length)

    const centres: { x: number; y: number }[] = []
    for (const zip of ZIPS) {
      const mark = page.locator(`[data-result-map-mark="${zip}"]`)
      const cx = Number(await mark.getAttribute('cx'))
      const cy = Number(await mark.getAttribute('cy'))
      expect(Number.isFinite(cx), `${zip} has no x position`).toBe(true)
      expect(Number.isFinite(cy), `${zip} has no y position`).toBe(true)
      // The fit keeps a 12px margin, so a placed mark cannot sit on the edge.
      expect(cx).toBeGreaterThan(0)
      expect(cy).toBeGreaterThan(0)
      centres.push({ x: cx, y: cy })
    }

    const [a, b] = centres as [{ x: number; y: number }, { x: number; y: number }]
    expect(Math.hypot(a.x - b.x, a.y - b.y), 'the two marks landed on one point').toBeGreaterThan(1)
  }, 60000)

  it('names the reference state in text, for a reader who cannot see the drawing', async () => {
    const caption = await page.locator('[data-result-map] figcaption').innerText()
    expect(caption).toMatch(/PR/)
    // Every mark is also a list item with its place, so the drawing is not the
    // only path to the answer.
    const items = page.locator('[data-result-map] ul li')
    expect(await items.count()).toBe(ZIPS.length)
  }, 60000)

  it('reports an absent basemap as absent rather than drawing nothing quietly', async () => {
    // Same page, basemap request refused: the points must still plot and the
    // figure must say the outline is missing.
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    try {
      await context.route('**/map/us-states.json', (route) => route.abort())
      const target = new URL(BASE)
      target.searchParams.set('z', ZIPS.join(','))
      const opened = await context.newPage()
      opened.setDefaultTimeout(15000)
      await opened.goto(target.toString(), { waitUntil: 'domcontentloaded' })
      await settleFirstRun(opened)
      await opened.getByRole('button', { name: 'Map', exact: true }).click()

      const figure = opened.locator('[data-result-map]')
      await expect.poll(async () => figure.getAttribute('data-outline'), { timeout: 30000 }).toBe('missing')
      expect(await opened.locator('[data-result-map-outline]').count()).toBe(0)
      /*
       * The absence is stated in words, not implied by an empty panel - and it is
       * waited for. The first version of this case read the figure's text while
       * the assets were still loading, so it compared against the loading line and
       * failed for a reason that had nothing to do with the behaviour asserted.
       */
      await expect
        .poll(async () => figure.innerText(), { timeout: 30000 })
        .toMatch(/outline is unavailable/i)
    } finally {
      await context.close()
    }
  }, 60000)
})
