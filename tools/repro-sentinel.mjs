/** Reproduces the reported sentinel rows on the deployed site. */
import { chromium } from 'playwright'

const b = await chromium.launch()
const c = await b.newContext()
const p = await c.newPage()

await p.goto('https://civicscope.pages.dev', { waitUntil: 'domcontentloaded' })
await p.evaluate((k) => localStorage.setItem('civicscope.censusKey.v1', k), process.env.CENSUS_KEY)
await p.reload({ waitUntil: 'domcontentloaded' })

const deadline = Date.now() + 180000
while (Date.now() < deadline) {
  if ((await p.locator('table tbody tr').count()) > 30) break
  await p.waitForTimeout(3000)
}

const r = await p.evaluate(() => {
  const text = document.body.innerText
  const rows = [...document.querySelectorAll('table tbody tr')].slice(0, 40).map((tr) =>
    [...tr.querySelectorAll('th, td')].map((t) => t.textContent.trim()).join(' | '),
  )
  return {
    sentinelPct: /-666,?666,?666\s*%/.test(text),
    sentinelMoney: /\$-666,?666,?666/.test(text),
    count: (text.match(/-666,?666,?666/g) ?? []).length,
    sample: rows.filter((x) => /666,?666,?666/.test(x)).slice(0, 5),
  }
})

console.log('sentinel percent present :', r.sentinelPct)
console.log('sentinel money present  :', r.sentinelMoney)
console.log('occurrences on page     :', r.count)
if (r.sample.length) {
  console.log('\nrows containing one:')
  for (const s of r.sample) console.log('  ', s.slice(0, 110))
}
await b.close()
