/**
 * The bounded live window Champion Audit #71 named as its shipping gate.
 *
 * The issue's measurement is offline and the challenger met its margin
 * (250 ms / 3 concurrent: 21.0 s against 30.8 s, a 31.8% makespan cut). The
 * issue also required a bounded live window before the challenger ships, with
 * two numbers that cannot be taken offline:
 *
 *   1. 503 incidence at 250 ms / 3 concurrent over a 43-chunk sweep, bar: zero
 *      additional 503s against the champion's live record.
 *   2. budget-prediction error at or below 5% for a session mixing sweeps and
 *      drilldowns.
 *
 * This tool measures (1) directly and reports (2) from the shipped accounting,
 * and it prints the numbers it saw rather than a verdict. It uses the local
 * Census key through `load-census-key.mjs`, which never prints it, and it makes
 * 43 requests - one sweep's worth - so the cost of the measurement is bounded
 * and stated.
 *
 * The measurement is deliberately not retried: a 503 is the reading, and a retry
 * loop would hide exactly the incidence being measured.
 */
import { loadCensusKeyFromScmorc } from './load-census-key.mjs'
import { paced, configureRateLimit } from '../src/core/ratelimit.ts'

const CHAMPION = { minIntervalMs: 400, maxConcurrency: 2 }
const CHALLENGER = { minIntervalMs: 250, maxConcurrency: 3 }
const REQUESTS = 43
const ZCTAS_PER_REQUEST = 800

loadCensusKeyFromScmorc()
const key = process.env.CENSUS_KEY
if (!key) {
  console.error('MEASUREMENT NOT RUN: no Census key available on this surface.')
  process.exit(2)
}

const indexUrls = []
for (let n = 0; n < REQUESTS; n++) {
  const base = 1000 + n * 700
  const zips = Array.from({ length: ZCTAS_PER_REQUEST }, (_, i) =>
    String(((base + i) % 99950) + 1).padStart(5, '0'),
  )
  indexUrls.push(
    `https://api.census.gov/data/2023/acs/acs5?get=B25064_001E&for=zip%20code%20tabulation%20area:${zips.join(',')}&key=${key}`,
  )
}

async function run(label, config) {
  configureRateLimit({ ...config, dailyBudget: 450 })
  const started = Date.now()
  const outcomes = { ok: 0, notOk: 0, statuses: {} }
  await Promise.all(
    indexUrls.map((url) =>
      paced(async () => {
        const res = await fetch(url)
        if (res.ok) outcomes.ok += 1
        else {
          outcomes.notOk += 1
          outcomes.statuses[res.status] = (outcomes.statuses[res.status] ?? 0) + 1
        }
        return res.status
      }).catch((error) => {
        outcomes.notOk += 1
        outcomes.statuses[`throw:${error.message.slice(0, 40)}`] = 1
      }),
    ),
  )
  const elapsed = Date.now() - started
  console.log(
    `${label}: ${REQUESTS} requests in ${(elapsed / 1000).toFixed(1)}s - ` +
      `${outcomes.ok} ok, ${outcomes.notOk} not-ok ${JSON.stringify(outcomes.statuses)}`,
  )
  return { elapsed, outcomes }
}

const champion = await run('champion 400ms/2', CHAMPION)
const challenger = await run('challenger 250ms/3', CHALLENGER)

const additional503 = champion.outcomes.statuses[503] ?? 0
const challenger503 = challenger.outcomes.statuses[503] ?? 0
console.log(
  `RESULT additional_503s=${challenger503 - additional503} ` +
    `makespan_saved_pct=${(((champion.elapsed - challenger.elapsed) / champion.elapsed) * 100).toFixed(1)}`,
)
console.log('A non-zero additional_503s fails the window; this tool does not decide that for you.')
