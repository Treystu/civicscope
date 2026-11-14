import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

let browser: Browser
let page: Page
const requests: string[] = []

beforeAll(async () => {
  browser = await chromium.launch()
  page = await browser.newPage()
  page.on('request', (request) => requests.push(request.url()))
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
})

afterAll(async () => {
  await browser?.close()
})

it('mounts the text-only Ask surface and keeps the stub path offline', async () => {
  expect(await page.getByRole('heading', { name: 'Ask CivicScope' }).count()).toBe(1)
  expect(await page.getByRole('textbox', { name: 'Ask in plain language' }).count()).toBe(1)
  expect(await page.getByRole('button', { name: /mic|transcribe|record/i }).count()).toBe(0)

  await page.getByLabel('Ask in plain language').fill('Compare rent in two ZIP codes')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await page.getByText(
    'More detail is needed before anything runs. Check the understood request below.',
    { exact: true },
  ).waitFor()

  expect(await page.getByRole('button', { name: 'Run this request' }).count()).toBe(0)
  expect(requests.some((url) => url.includes('/api/muse/'))).toBe(false)
})
