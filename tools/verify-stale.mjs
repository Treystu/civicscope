/**
 * End-to-end proof: a poisoned cache from the pre-fix build must not render.
 *
 * Seeds a chunk exactly as the old build wrote it, under the old version stamp,
 * then loads the app and checks the whole page for a sentinel.
 */
import { chromium } from 'playwright'

const b = await chromium.launch()
const c = await b.newContext()
const p = await c.newPage()

await p.goto('https://civicscope.pages.dev', { waitUntil: 'domcontentloaded' })
await p.evaluate((k) => localStorage.setItem('civicscope.censusKey.v1', k), process.env.CENSUS_KEY)

// Seed poisoned chunks under BOTH the old and the current stamp.
const seeded = await p.evaluate(async () => {
  await new Promise((resolve) => {
    const r = indexedDB.deleteDatabase('civicscope-cache')
    r.onsuccess = r.onerror = r.onblocked = () => resolve()
  })
  return new Promise((resolve) => {
    const open = indexedDB.open('civicscope-cache', 2)
    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('sweep-chunks')) db.createObjectStore('sweep-chunks', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('sweep-manifest')) db.createObjectStore('sweep-manifest', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('responses')) db.createObjectStore('responses', { keyPath: 'url' })
    }
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('sweep-chunks', 'readwrite')
      const store = tx.objectStore('sweep-chunks')
      const poisoned = {
        zcta: '00601',
        name: 'ZCTA5 00601',
        metrics: {
          median_rent_burden_pct: -666666666,
          median_gross_rent: -666666666,
          median_household_income: -666666666,
          households: -666666666,
          population: -666666666,
          renter_occupied: -666666666,
        },
        moes: {},
      }
      // Several keys so whichever the planner derives is poisoned.
      for (let i = 0; i < 5; i++) {
        const first = String(10000 + i * 800).slice(0, 5)
        const last = String(10799 + i * 800).slice(0, 5)
        for (const version of ['acs5:2023:screen:v1', 'acs5:2023:screen:v2-sanitised']) {
          store.put({ key: `zcta:${first}-${last}:n800`, version, body: [poisoned], fetchedAt: Date.now() })
        }
      }
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    }
  })
})
console.log('poisoned chunks seeded (both old and new stamp):', seeded)

await p.reload({ waitUntil: 'domcontentloaded' })
const deadline = Date.now() + 180000
while (Date.now() < deadline) {
  if ((await p.locator('table tbody tr').count()) > 20) break
  await p.waitForTimeout(3000)
}

const r = await p.evaluate(() => {
  const text = document.body.innerText
  return {
    sentinel: /-666,?666,?666|-999,?999,?999|-888,?888,?888/.test(text),
    negMoney: /\$-[\d,]{6,}/.test(text),
    negPct: /-\d[\d,]{3,}\s*%/.test(text),
    notImported: (text.match(/not yet imported/g) ?? []).length,
    rows: document.querySelectorAll('table tbody tr').length,
  }
})

console.log('\n--- RESULT ---')
console.log('rows rendered            :', r.rows)
console.log('sentinel on page         :', r.sentinel)
console.log('negative money on page   :', r.negMoney)
console.log('negative percent on page :', r.negPct)
console.log('"not yet imported" cells :', r.notImported)
console.log(
  '\nVERDICT:',
  !r.sentinel && !r.negMoney && !r.negPct ? 'PASS — no placeholder reaches the user' : 'FAIL — a placeholder is still visible',
)
await b.close()
