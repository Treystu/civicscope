/**
 * Proves the stale-cache path: a sweep cache written BEFORE the sentinel fix
 * replays poisoned rows verbatim, because cache hits skip the parser entirely.
 *
 * This simulates exactly what a returning visitor who loaded the site before the
 * fix has in their browser.
 */
import { chromium } from 'playwright'

const b = await chromium.launch()
const c = await b.newContext()
const p = await c.newPage()

await p.goto('https://civicscope.pages.dev', { waitUntil: 'domcontentloaded' })
await p.evaluate((k) => localStorage.setItem('civicscope.censusKey.v1', k), process.env.CENSUS_KEY)

// Write a poisoned chunk exactly as the pre-fix build would have: parsed rows
// whose metrics still hold the raw sentinel as a number.
const seeded = await p.evaluate(async () => {
  const DB = 'civicscope-cache'
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
  await new Promise((resolve) => {
    const open = indexedDB.open(DB, 2)
    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('sweep-chunks')) {
        db.createObjectStore('sweep-chunks', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('sweep-manifest')) {
        db.createObjectStore('sweep-manifest', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('responses')) db.createObjectStore('responses', { keyPath: 'url' })
    }
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('sweep-chunks', 'readwrite')
      // The chunk key the current code derives for the first 800 ZCTAs.
      const poisoned = [
        {
          zcta: '00601',
          name: 'ZCTA5 00601',
          metrics: {
            median_rent_burden_pct: -666666666,
            median_gross_rent: -666666666,
            median_household_income: -666666666,
            households: -666666666,
          },
          moes: {},
        },
      ]
      tx.objectStore('sweep-chunks').put({
        key: 'zcta:00001-00799:n800',
        version: 'acs5:2023:screen:v1',
        body: poisoned,
        fetchedAt: Date.now(),
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    }
  })
  return true
})
console.log('poisoned cache written:', seeded)

await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForTimeout(4000)

const r = await p.evaluate(() => {
  // The sweep enumerates ZCTAs, so the poisoned key will not match. Read the
  // store back to confirm what is actually persisted, which is the mechanism.
  return new Promise((resolve) => {
    const open = indexedDB.open('civicscope-cache', 2)
    open.onsuccess = () => {
      const tx = open.result.transaction('sweep-chunks', 'readonly')
      const all = tx.objectStore('sweep-chunks').getAll()
      all.onsuccess = () => {
        const poisoned = all.result.filter((r) =>
          JSON.stringify(r.body ?? {}).includes('-666666666'),
        )
        resolve({
          totalChunks: all.result.length,
          poisonedChunks: poisoned.length,
          version: poisoned[0]?.version,
          sample: poisoned[0]?.body?.[0],
        })
      }
    }
  })
})

console.log('chunks in cache          :', r.totalChunks)
console.log('chunks holding sentinels :', r.poisonedChunks)
console.log('their version stamp      :', r.version)
console.log('sample poisoned row      :', JSON.stringify(r.sample))
await b.close()
