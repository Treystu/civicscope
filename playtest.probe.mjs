import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:8788'
const out = { base: BASE, steps: [], console: [], pageErrors: [], api: [] }

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()

page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') out.console.push(`${m.type()}: ${m.text().slice(0, 400)}`)
})
page.on('pageerror', (e) => out.pageErrors.push(String(e).slice(0, 400)))
page.on('response', async (r) => {
  const u = r.url()
  if (u.includes('/api/muse/') || r.status() >= 400) {
    out.api.push({ status: r.status(), method: r.request().method(), url: u.replace(BASE, '').slice(0, 120) })
  }
})

async function step(name, fn) {
  const started = Date.now()
  try {
    const value = await fn()
    out.steps.push({ name, ok: true, ms: Date.now() - started, value })
  } catch (e) {
    out.steps.push({ name, ok: false, ms: Date.now() - started, error: String(e.message ?? e).split('\n')[0].slice(0, 400) })
  }
}

const snap = async () => (await page.locator('body').ariaSnapshot()).slice(0, 30000)
const settle = async (ms = 1200) => page.waitForTimeout(ms)

await step('lookup', async () => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await settle(2500)
  const d = page.getByRole('button', { name: 'Dismiss', exact: true })
  if (await d.count()) await d.first().click({ timeout: 5000 })
  const box = page.getByRole('combobox', { name: 'US ZIP code, or city and state' })
  await box.fill('90210')
  await box.press('Enter')
  await settle(8000)
  return { url: page.url(), buttons: await page.getByRole('button').allInnerTexts(), snap: await snap() }
})

await step('explain-single-area', async () => {
  const explain = page.getByRole('button', { name: /Explain/i })
  const count = await explain.count()
  if (!count) return { count }
  await explain.first().click({ timeout: 8000 })
  await settle(8000)
  const region = page.getByRole('region').filter({ hasText: /Explanation|Explain/i }).first()
  return { count, text: (await region.innerText().catch(() => '')).slice(0, 1200), snap: await snap() }
})

await step('ask-unkeyed', async () => {
  const ask = page.getByRole('textbox', { name: 'Ask in plain language' })
  await ask.fill('median rent in Boise')
  await page.getByRole('button', { name: 'Ask', exact: true }).click({ timeout: 8000 })
  await settle(10000)
  const region = page.getByRole('region', { name: 'Ask CivicScope' })
  return { url: page.url(), text: (await region.innerText()).slice(0, 1600) }
})

await step('invalid-short', async () => {
  const box = page.getByRole('combobox', { name: 'US ZIP code, or city and state' })
  await box.fill('12')
  await box.press('Enter')
  await settle(2500)
  const region = page.getByRole('region', { name: 'Look up a ZIP code or a city' })
  return { text: (await region.innerText()).slice(0, 800), url: page.url() }
})

await step('invalid-letters', async () => {
  const box = page.getByRole('combobox', { name: 'US ZIP code, or city and state' })
  await box.fill('abc')
  await box.press('Enter')
  await settle(2500)
  const region = page.getByRole('region', { name: 'Look up a ZIP code or a city' })
  return { text: (await region.innerText()).slice(0, 800), url: page.url() }
})

await step('empty-zip', async () => {
  const box = page.getByRole('combobox', { name: 'US ZIP code, or city and state' })
  await box.fill('00000')
  await box.press('Enter')
  await settle(6000)
  const region = page.getByRole('region', { name: 'Look up a ZIP code or a city' })
  return { text: (await region.innerText()).slice(0, 900), url: page.url() }
})

await step('long-query', async () => {
  const box = page.getByRole('combobox', { name: 'US ZIP code, or city and state' })
  await box.fill('9'.repeat(600))
  const length = await box.inputValue().then((v) => v.length)
  await box.press('Enter')
  await settle(2000)
  return { length, url: page.url() }
})

await step('map-tab', async () => {
  await page.getByRole('button', { name: 'Map', exact: true }).click({ timeout: 8000 })
  await settle(6000)
  return { url: page.url(), snap: (await snap()).slice(0, 6000) }
})

await step('methodology', async () => {
  await page.getByRole('button', { name: 'Methodology', exact: true }).click({ timeout: 8000 })
  await settle(2500)
  return { url: page.url(), headings: await page.getByRole('heading').allInnerTexts() }
})

await step('reload-mid-ask', async () => {
  await page.getByRole('button', { name: 'Explore', exact: true }).click({ timeout: 8000 })
  await settle(1500)
  const ask = page.getByRole('textbox', { name: 'Ask in plain language' })
  await ask.fill('rent in Denver')
  await page.getByRole('button', { name: 'Ask', exact: true }).click({ timeout: 5000 })
  await page.waitForTimeout(120)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(5000)
  const region = page.getByRole('region', { name: 'Ask CivicScope' })
  return { text: (await region.innerText()).slice(0, 700) }
})

await browser.close()
writeFileSync('playtest-report-2.json', JSON.stringify(out, null, 2))
console.log(out.steps.map((s) => `${s.ok ? 'OK ' : 'FAIL'} ${s.name} ${s.ms}ms ${s.error ?? ''}`.trim()).join('\n'))
console.log('api:', JSON.stringify(out.api.slice(0, 20)))
console.log('pageerrors:', out.pageErrors.slice(0, 6))
console.log('console:', out.console.slice(0, 8))
