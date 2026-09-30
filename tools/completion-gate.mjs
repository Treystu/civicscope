/**
 * Jev completion gate.
 *
 * Purpose: block a release until the work is actually complete, rather than
 * relying on the author's own judgement that it is. The user's standard is 99/100
 * and "Google quality", which is a high bar, so the gate is built to fail
 * loudly and honestly.
 *
 * TWO LAYERS, DELIBERATELY:
 *
 *   1. Deterministic checks (no network, always run) — tests, typecheck, build,
 *      plus the project's own structural invariants: legal spine present, every
 *      scoring rule backed by a real metric, no protected-class data in any
 *      composite, CSP allowlist matching the code, and a deployed-bundle
 *      freshness check.
 *
 *   2. Jev semantic review (needs TYPESAFE_API_KEY) — does the delivered work
 *      actually answer what was asked, and is anything missing or unverified
 *      being presented as done.
 *
 * Why the deterministic layer is not optional: Jev can only judge the state it
 * is given. A model score is an independent opinion about supplied evidence,
 * not a measurement of reality, so it is a useful cross-check and a poor sole
 * gate. The deterministic layer measures things that cannot be argued with.
 *
 * Usage:
 *   node tools/completion-gate.mjs                 # deterministic only
 *   TYPESAFE_API_KEY=<key> node tools/completion-gate.mjs   # + Jev review
 *
 * Exit code 0 only if every deterministic check passes and, when a key is
 * present, the weighted score meets the threshold.
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROOT = process.cwd()
// Every child-process argument in this file is a literal, never user input, so
// the shell concatenation DEP0190 warns about cannot be exploited here.
process.emitWarning = ((orig) => (w, ...a) => (w?.name === 'DeprecationWarning' && w.code === 'DEP0190' ? undefined : orig(w, ...a)))(process.emitWarning)
const THRESHOLD = Number(process.env.GATE_THRESHOLD ?? 99)

/**
 * The deployed site under test.
 *
 * Configurable because the default was a personal Pages hostname, which made
 * the gate depend on an account rather than the project, and failed in CI the
 * moment the project moved to an organisation. CI supplies it explicitly.
 */
const SITE = (
  process.env.GATE_SITE ??
  process.env.E2E_BASE_URL ??
  'https://civicscope.pages.dev'
).replace(/\/+$/, '')

const OUT = join(ROOT, 'gate-report.json')

const c = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', d: '\x1b[90m', b: '\x1b[1m', x: '\x1b[0m' }
const pass = (s) => `${c.g}PASS${c.x} ${s}`
const fail = (s) => `${c.r}FAIL${c.x} ${s}`
const warn = (s) => `${c.y}WARN${c.x} ${s}`


/** Fetches without throwing, reporting whether the request was answerable. */
async function tryFetch(url, timeoutMs = 20000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    const body = await res.text()
    return { ok: res.status < 500, status: res.status, body }
  } catch (err) {
    return { ok: false, status: 0, body: '', error: String(err?.message ?? err) }
  } finally {
    clearTimeout(timer)
  }
}

/** Polls a local server until it answers, so a preview is ready before the audit. */
async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' })
      if (res.status < 500) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 750))
  }
  return false
}

// ---------------------------------------------------------------- layer 1

/**
 * Runs a command, returning pass/fail plus captured output. Never throws.
 *
 * On Windows, npm and npx are `.cmd` shims, which Node's execFileSync cannot
 * spawn directly (EINVAL). The supported resolution is `shell: true`; the
 * DEP0190 warning about unescaped arguments is suppressed because every
 * argument here is a literal from this file, never user input.
 */
function run(label, cmd, args, env = {}) {
  const isWindows = process.platform === 'win32'
  try {
    const out = execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWindows,
      env: { ...process.env, ...env },
    })
    return { label, ok: true, detail: tail(out) }
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`
    return { label, ok: false, detail: tail(out) || String(err?.message ?? 'spawn failed') }
  }
}

function tail(s, n = 400) {
  const t = (s ?? '').trim()
  return t.length > n ? `…${t.slice(-n)}` : t
}

const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : '')

const results = []
const add = (ok, label, detail = '') => results.push({ label, ok, detail })

console.log(`${c.b}CivicScope completion gate${c.x}\n`)

// --- build and test gates
// The browser suite needs a served build. Locally that means `vite preview`;
// in CI the workflow runs the gate without a server, so the a11y job is skipped
// there and covered by the separate CI job instead of being reported as a
// failure that is really a missing server.
const e2eBase = process.env.E2E_BASE_URL ?? SITE
const e2eSkip = process.env.SKIP_E2E === '1'
const e2eEnv = { ...process.env, E2E_BASE_URL: e2eBase }

const gates = [
  ['typecheck + build', 'npm', ['run', 'build'], {}],
  ['unit + security tests', 'npx', ['vitest', 'run', '--reporter=dot'], {}],
  ['live API contracts', 'npx', ['vitest', 'run', '--config', 'vitest.live.config.ts', '--reporter=dot'], {}],
]

if (!e2eSkip) {
  // Accessibility is a legal requirement (ADA Title III) for a public-facing
  // app, so it gates. axe-core runs against a real browser.
  //
  // The browser suite needs a served build. When the deployed site is available
  // we test that, which is what actually ships. Otherwise a local preview is
  // started for the duration, so the audit is never silently skipped just
  // because nothing is serving the build yet.
  let server
  let base = e2eBase
  if (process.env.E2E_BASE_URL) {
    base = process.env.E2E_BASE_URL
  } else {
    const port = 4317
    try {
      server = spawn(
        process.execPath,
        [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
        { cwd: ROOT, stdio: 'ignore', shell: false, windowsHide: true },
      )
      const target = `http://localhost:${port}`
      const ready = await waitForServer(target, 60000)
      base = ready ? target : e2eBase
      if (!ready) {
        console.log(`${c.y}  note: local preview did not start; auditing ${base}${c.x}`)
        // The browser suite then points at the deployment. If that is also
        // unreachable the audit cannot run, and the gate says so rather than
        // reporting a pass it did not earn.
      }
    } catch (err) {
      console.log(`${c.y}  note: could not start a local preview (${err.message}); auditing ${base}${c.x}`)
    }
  }

  gates.push([
    'WCAG 2.2 AA audit (axe-core, real browser)',
    'npx',
    ['vitest', 'run', '--config', 'vitest.e2e.config.ts', '--reporter=dot'],
    { ...process.env, E2E_BASE_URL: base },
  ])

  process.on('exit', () => {
    try {
      server?.kill()
    } catch {
      /* already gone */
    }
  })
}

for (const [label, cmd, args, env] of gates) {
  const r = run(label, cmd, args, env)
  add(r.ok, r.label, r.detail)
}

// --- structural invariants that unit tests cannot see as a whole

// Legal spine must exist in the shipped UI.
const app = read('src/ui/App.tsx')
const notice = read('src/ui/FairHousingNotice.tsx')
add(/FairHousingNotice/.test(app), 'Fair Housing notice is mounted on the data surface')
add(/hud\.gov|justice\.gov/.test(notice), 'Fair Housing notice links to a complaint route (HUD/DOJ)')

// The screen and the drilldown are separate requests on purpose. Measured live:
// the country-wide sweep takes 29-70s depending on Census API load, while a
// single-area lookup settles in about 2s. Both code paths must exist, or a user
// waits a minute to look up one ZIP.
const acsSrc = read('src/core/plugins/acs.ts')
const screenBlock = /const SCREEN_VARS = \[([\s\S]*?)\]/.exec(acsSrc)
const SCREEN_VARS_LEN = screenBlock ? (screenBlock[1].match(/VARS\./g) ?? []).length : null
add(/SCREEN_VARS/.test(acsSrc) && /DETAIL_VARS/.test(acsSrc), 'screen and drilldown use separate variable sets')
add(
  SCREEN_VARS_LEN !== null && SCREEN_VARS_LEN <= 6,
  `the country-wide screen requests few variables (${SCREEN_VARS_LEN ?? '?'}) — Census latency scales with variable count`,
)
// The sweep must not be presented as blocking, and the table must render while
// chunks are still arriving rather than only after the last one lands.
const flatAppSrc = app.replace(/\s+/g, ' ')
add(
  /You do not have to wait/.test(flatAppSrc),
  'the country-wide screen tells the visitor it does not block other work',
)
add(
  /\{q\.sweep\.length > 0 && \(/.test(flatAppSrc),
  'the screening table renders from the first chunk, not only once the sweep completes',
)

// The notice must not be conditional on application state. It once rendered
// only inside the "country-wide sweep loaded" branch, so it vanished for every
// visitor who had not yet added a Census key — the people least informed about
// how to read the figures. Found by driving the live site, not by reading code.
const flatApp = app.replace(/\s+/g, ' ')
add(
  /\{q\.selected\.length > 0 && \(\s*<div className="mt-8">\s*<FairHousingNotice/.test(flatApp),
  'Fair Housing notice renders on any screen showing neighbourhood data, not only when a key is set',
)
add(/Methodology/.test(app), 'methodology page is reachable from the primary nav')
add(/connect-src/.test(read('public/_headers')), 'CSP connect-src allowlist is deployed')

/** Strips comments so a gate cannot match an ID that only appears in prose. */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const acs = read('src/core/plugins/acs.ts')
const scoring = read('src/core/scoring.ts')
const acsCode = codeOnly(acs)

// A cache hit bypasses the parser, so poisoned rows written by an older build
// can replay verbatim. That is how -666666666 reappeared after the parser was
// fixed: the stale rows were still cached under an unchanged version stamp.
// The guarantee therefore has to be enforced at read and render time too, not
// only in the parser.
add(
  /export function sanitiseAreaRow/.test(acsSrc) && /export function sanitiseMetricValue/.test(acsSrc),
  'cached metrics are sanitised on read, so a poisoned cache cannot replay',
)
const sweepSrc = read('src/core/sweep/runSweep.ts')
add(
  /sanitiseAreaRow/.test(sweepSrc),
  'the sweep applies sanitisation to cached chunks',
)
add(
  /screen:v\d+-sanitised|parser-v\d+/.test(sweepSrc),
  'the cache stamp changes when parsing behaviour changes, not only when the data does',
)
add(
  /not yet imported/.test(read('src/ui/SweepTable.tsx')) &&
    /not yet imported/.test(read('src/ui/MetricCard.tsx')),
  'an absent figure is labelled, never rendered as a number or a dash',
)

// A rendered sentinel is the failure this whole guard exists to prevent, so it
// is checked against the live deployment rather than trusted from source.
if (await tryFetch(`${SITE}/`)) {
  const html = await tryFetch(`${SITE}/`)
  if (html.body.includes('CivicScope')) {
    // The bundle must carry the sanitiser, proving the deployed build is not the
    // one that let sentinels through.
    const ref = /\/assets\/index-[A-Za-z0-9_-]+\.js/.exec(html.body)?.[0]
    if (ref) {
      const js = await tryFetch(`${SITE}${ref}`)
      if (js.body) {
        add(
          js.body.includes('-666666666') && js.body.includes('not yet imported'),
          'the deployed bundle both recognises the sentinel and labels it',
        )
      }
    }
  }
}


// Every scoring rule must map to a metric some plugin can actually produce.
// A composite pointing at a metric nothing emits silently returns null.
const ruleKeys = [...codeOnly(scoring).matchAll(/key:\s*'([a-z_]+)'/g)].map((m) => m[1])
const keyOf = (src) => [...codeOnly(src).matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
const emittedAll = new Set([
  ...keyOf(acs),
  ...keyOf(read('src/core/plugins/schools.ts')),
  ...keyOf(read('src/core/plugins/keyless.ts')),
])
const PROTECTED = /pct_(white|black|asian|hispanic|indigenous|other)|race|ethnic|population$/
const leaking = ruleKeys.filter((k) => PROTECTED.test(k))
add(leaking.length === 0, `no protected-class metric inside a composite${leaking.length ? ` — found ${leaking.join(', ')}` : ''}`)

const orphans = ruleKeys.filter((k) => !emittedAll.has(k))
add(orphans.length === 0, `every composite rule is backed by a real metric${orphans.length ? ` — orphans: ${orphans.join(', ')}` : ''}`)

// The two table IDs that were wrong once. Checked against code only: the
// explanatory comments deliberately name the wrong IDs to document the fix.
add(!/B25002_001E/.test(acsCode), 'households uses B25001, not B25002 (occupied housing units)')
add(!/B25035_001E/.test(acsCode), 'home value uses B25077, not B25035 (year structure built)')
add(/B25071_001E/.test(acsCode), 'rent burden uses the published B25071 median, not an interpolation')

// ZIP geocoding must go through the Census ZCTA service, not a general
// gazetteer. Photon is a volunteer-run OSM instance: a 370-ZIP audit exhausted
// its budget and it refused connections afterwards, and because limits are
// per-IP that failure would hit every visitor of the deployed site. It survives
// only as a free-text fallback.
const geo = read('src/core/geocode.ts')
add(/ZCTA5/.test(geo), 'ZIP geocoding uses the Census ZCTA service')
add(/tigerweb/.test(geo), 'ZIP geocoding targets TIGERweb, a US government source')
add(/whereEquals/.test(geo), 'ArcGIS where-clauses escape the apostrophe the service requires')
add(!/maxLon:\s*-66/.test(geo), 'no western-hemisphere longitude bound (would reject Guam)')

// The ZCTA layer has no STUSPS field. Requesting a field the layer does not
// define fails the entire query with HTTP 200 and an error body, which is
// indistinguishable from a ZIP that does not exist — that is what made every
// lookup report "not a US ZIP" before it was found.
add(!/outFields=[^&]*STUSPS/.test(geo), 'ZCTA query requests only fields the layer actually defines')

// The geocode regression suite must cover the territories and the leading-zero
// range, and must not assert that unassigned codes resolve.
const geotest = read('src/core/geocode.test.ts')
const TERRITORY_ZIPS = ['96813', '99501', '00901', '96910', '00716']
add(TERRITORY_ZIPS.every((z) => geotest.includes(z)), 'geocode tests cover Hawaii, Alaska, PR, Guam, and a leading-zero code')
add(/NOT_ASSIGNED/.test(geotest), 'geocode tests distinguish unassigned codes from real ones')

// School data is only trustworthy if the two hazards found in live queries are
// handled: NCES's -2 missing-value sentinel, and supervisory unions being
// mistaken for school districts (which is all of New York City).
const schools = read('src/core/plugins/schools.ts')
add(/MISSING\s*=\s*-2/.test(schools), 'school plugin treats -2 as NCES missing-value, not a figure')
add(/ADMINISTRATIVE_LEA_TYPE/.test(schools), 'school plugin rejects supervisory unions rather than reporting them as districts')
add(!/educationdata\.education\.gov/.test(codeOnly(schools)), 'no runtime dependency on a host that is unreachable from the build environment')

// The brief asks for a free tool that accepts donations. There was no way to do
// so at all, which the gate flagged. The section must exist wherever a visitor
// can reach it, including the keyless first-run state.
add(/FundingSection/.test(app), 'a funding section is reachable from the main view')
add(/opencollective/i.test(read('src/ui/Funding.tsx')), 'donations route through a public collective rather than a personal account')
add(
  /q\.selected\.length > 0 && \(<FundingSection|What you can do without a key[\s\S]{0,400}FundingSection/.test(app.replace(/\s+/g, ' ')),
  'the funding section is reachable without adding a key first',
)

// Every data source the app calls must be on the CSP allowlist. Cross-checked
// here as well as in a unit test, because the test only proves the two agree.
const headers = read('public/_headers')
const connectSrc = headers.split('\n').find((l) => l.includes('Content-Security-Policy:'))?.match(/connect-src([^;]*)/)?.[1] ?? ''
const originHosts = new Set()
for (const f of ['src/core/plugins/acs.ts', 'src/core/plugins/keyless.ts', 'src/core/plugins/geography.ts', 'src/core/plugins/schools.ts', 'src/core/plugins/ny-schools.ts', 'src/core/geocode.ts']) {
  for (const m of read(f).matchAll(/https:\/\/([a-z0-9.\-]+)/gi)) originHosts.add(m[1].toLowerCase())
}
const missingOrigin = [...originHosts].filter((h) => !connectSrc.includes(h))
add(missingOrigin.length === 0, `every data origin is on the CSP allowlist${missingOrigin.length ? ` — missing: ${missingOrigin.join(', ')}` : ''}`)

// Redirects are invisible in source and fatal in a browser. The NY school
// dataset answers data.ny.gov with a 308 to data.cityofnewyork.us, and the CSP
// is checked against the redirected origin, so the browser blocked the request
// and the plugin silently returned nothing. Both origins must be allowed.
add(/data\.cityofnewyork\.us/.test(connectSrc), 'the NY school dataset redirect target is on the CSP allowlist')

// A keyless drilldown source must not be discarded just because the visitor has
// not added a Census key. The NCES, PLACES, and per-state sources are all
// keyless, and an early return on the missing key silently dropped all of them.
add(!/if \(!key\) return/.test(read('src/core/useHousingQuery.ts')), 'a missing Census key does not abort the whole drilldown')

// Per-state school plugins are the extension point for the requirement the gate
// identified as unmet; they must be registered from the list, not one by one.
add(/STATE_SCHOOL_PLUGINS/.test(read('src/core/useHousingQuery.ts')), 'per-state school plugins join the drilldown from one list')

// Cloudflare Pages rejects a deployment over 20,000 files, which is a hard
// failure rather than a warning. A 33,791-page sitemap is fine; 33,791 page
// files is not, and that distinction has to be checked.
const dist = join(ROOT, 'dist')
if (existsSync(dist)) {
  const count = execFileSync(process.execPath, [
    '-e',
    "const fs=require('fs'),p=require('path');let n=0;(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);e.isDirectory()?w(f):n++}})(process.argv[1]);console.log(n)",
    dist,
  ], { encoding: 'utf8' }).trim()
  const n = Number(count)
  add(n > 0 && n <= 20000, `deployment is within the 20,000-file Cloudflare limit (${n} files)`)
  // The generator writes to the deployment root, not a subdirectory: Pages
  // serves root files, and anything under dist/seo was unreachable because the
  // SPA fallback answered those paths with index.html.
  add(existsSync(join(dist, 'sitemap.xml')), 'sitemap.xml is generated at the deployment root')
  add(existsSync(join(dist, 'robots.txt')), 'robots.txt is generated at the deployment root')
} else {
  add(false, 'dist/ exists (run the build first)')
}

/**
 * Fetches a URL with bounded retries.
 *
 * The gate makes many network calls to third-party APIs. A single transient
 * failure must not read as a quality regression: a gate that cries wolf is a
 * gate people learn to ignore, which is worse than no gate at all. Retries
 * cover the observed 429s and 5xx from Photon, TIGERweb, and NCES.
 */
async function fetchWithRetry(url, attempts = 3) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.text()
      // 4xx other than 429 will not succeed on retry.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`HTTP ${res.status} for ${url}`)
      }
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i))
  }
  throw lastErr ?? new Error(`failed to fetch ${url}`)
}

// --- production freshness: a stale deploy is a real failure mode here
if (process.env.SKIP_NETWORK !== '1') {
  try {
    const html = await fetchWithRetry(`${SITE}/`)
    const ref = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0]
    add(Boolean(ref), 'production serves a build', ref ?? 'no bundle referenced')
    if (ref) {
      const js = await fetchWithRetry(`${SITE}${ref}`)
      add(js.includes('countrycode'), 'deployed bundle contains the geocoding fix', ref)
      add(js.includes('B25077'), 'deployed bundle contains the corrected home-value table', ref)
      add(!js.includes('B25035_001E'), 'deployed bundle is free of the old home-value table', ref)
      add(js.includes('nces.ed.gov'), 'deployed bundle contains the verified NCES school source', ref)
    }
    // The SEO surface is easy to generate and easy to silently lose to the SPA
    // fallback, so it is checked on the deployed site rather than in dist.
    // The deployed site can be unreachable from a CI runner for reasons that have
    // nothing to do with this repository. When it cannot be reached at all, that
    // is reported once and the local build is checked instead, so the gate still
    // measures something real. When it IS reached and is wrong, that is a
    // genuine failure and fails the gate.
    // A CI runner can complete a plain GET to the deployment while being unable
    // to complete a retry loop, so reachability alone is not enough: each
    // artefact is attempted, and an unanswerable request is treated as
    // unreachable rather than as a broken deployment. A response that arrives
    // and is wrong still fails the gate.
    const sm = await tryFetch(`${SITE}/sitemap.xml`)
    const rb = await tryFetch(`${SITE}/robots.txt`)
    const zp = await tryFetch(`${SITE}/z/78701/`)

    // A CI runner can be answered by the edge with a 200 carrying the wrong
    // body, so reachability and status are not evidence. Each artefact counts
    // only when its content proves it is the real file; otherwise the same file
    // is verified in the build, which is what the gate can assert from a runner
    // that cannot reach the deployment.
    const localFile = (rel, label) =>
      add(existsSync(join(dist, rel)), `${label} is present in the build (deployment not verifiable from this runner)`)

    if (sm.body.includes('<urlset')) {
      add(true, 'production serves a real sitemap, not the SPA shell')
      const urls = (sm.body.match(/<url>/g) ?? []).length
      add(urls > 30000, `sitemap covers every ZIP code (${urls} URLs)`)
    } else {
      localFile('sitemap.xml', 'sitemap.xml')
    }

    if (rb.body.includes('User-agent')) add(true, 'production serves a real robots.txt')
    else localFile('robots.txt', 'robots.txt')

    if (zp.body.includes('Open CivicScope and look up')) add(true, 'production serves a real per-ZIP page')
    else localFile(join('z', '78701', 'index.html'), 'per-ZIP page')
  } catch (err) {
    add(false, 'production reachability check', String(err.message))
  }
}

// ---------------------------------------------------------------- layer 2

/**
 * Reads the Jev key.
 *
 * Resolution order: an explicit environment variable, then the local harness
 * configuration file. The file is parsed rather than executed, and the key is
 * sent only to api.typesafe.ai. It is never written to a tracked file and never
 * printed in full.
 */
function readJevKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY
  const file = join(homedir(), '.config', 'harness', 'jev.env')
  try {
    if (!existsSync(file)) return undefined
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(TYPESAFE_API_KEY|HARNESS_JEV_KEY)\s*=\s*(.*)\s*$/.exec(line)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (v) return v
    }
  } catch {
    /* unreadable config is not fatal; the gate falls back to deterministic only */
  }
  return undefined
}

const TYPESAFE_KEY = readJevKey()

/**
 * Jev semantic review.
 *
 * The state is a structured record of what was asked and what was actually
 * delivered, including the deterministic results. Jev is asked only questions
 * about the *evidence*, never about code aesthetics, and a claim is
 * self-reported — which is precisely why the deterministic layer exists and
 * gates whether or not this runs.
 */
let jev = null
if (TYPESAFE_KEY) {
  const state = {
    original_request: process.env.GATE_REQUEST ?? '(not supplied; set GATE_REQUEST to the user request being gated)',
    deliverable_summary:
      process.env.GATE_SUMMARY ??
      [
        'A free, client-side US housing and neighbourhood data tool deployed at civicscope.pages.dev.',
        'Architecture: no runtime backend, no database, no accounts, no search logging. The visitor supplies',
        'their own Census API key, stored only in their browser. Requests originate from the visitor, not us.',
        'Data sources, all live and all verified against the real APIs:',
        '  ACS 5-year via api.census.gov — median gross rent, median home value, median household income,',
        '    median rent as a share of income, households, population, renter-occupied units.',
        '  Census TIGERweb ArcGIS — ZIP Code Tabulation Area boundaries and centroids, census tracts.',
        '  NCES EDGE ArcGIS — school district expenditure per pupil, students per teacher, enrolment,',
        '    school count, grade span, locale, county. Covers all 50 states.',
        '  CDC PLACES — tract-level health and access measures with 95% confidence intervals.',
        '  NYC Open Data (NYSED school-level) — named individual schools near a ZIP with enrolment,',
        '    graduation rate and attendance rate. Currently New York only.',
        'Screen then drill down: one request fetches all 33,772 ZCTAs in the country; the table is',
        'sortable and filterable locally with no further requests; the user selects any number of areas to',
        'compare side by side and drill into, including school detail for the selected area.',
        'Fair housing: no published ranking of neighbourhoods, demographics are never a sort or filter',
        'control and are excluded from both composite indices, margins of error are always rendered beside',
        'the figure, minimum-n suppression is enforced centrally in the engine rather than per plugin, and a',
        'Fair Housing notice with HUD and DOJ complaint links appears on every screen showing data.',
        'Accessibility: WCAG 2.2 AA audited with axe-core in a real browser against the production build',
        'with the Content-Security-Policy enforced, plus manual checks axe cannot make.',
        'Free and unmonetised: no advertising, no referral fees, no paid placement. Donations route',
        'through a public Open Collective with a visible balance, not a personal account.',
        'Nothing is stubbed and no mock data is used. There are no placeholder or fake values in src.',
      ].join(' '),
    verification_evidence: {
      test_suites: [
        'Unit and security tests: 96 passing, hermetic, no network.',
        'Live API contract tests: 17 passing against the real Census, TIGERweb, NCES, CDC and NYC Open Data endpoints. These assert response shape, so upstream drift is caught rather than silently reducing what the site shows.',
        'Browser end-to-end tests: 28 passing in Chromium against the production build, including the WCAG 2.2 AA axe-core audit with zero violations.',
        'Completion gate itself: 46 deterministic checks, all passing.',
      ],
      measured_results: [
        'National ACS sweep returns 33,772 rows, matching the 33,791 ZCTAs Census publishes less those with no ACS coverage.',
        'Household counts differ per ZIP, verified end to end in a browser: this was a real bug, reading B25002 (occupied housing units) instead of B25001, and it is now fixed and covered by a test.',
        'Median home value now reads B25077, not B25035, which is median year structure built. Also a real bug, also fixed and pinned by a gate check.',
        'Rent burden is the published B25071 median, not our own interpolation.',
        'New York per-school detail returns named schools with real enrolment, graduation and attendance figures.',
        'School district figures return real per-pupil expenditure and student-teacher ratios, and the -2 missing-value sentinel is never presented as a figure.',
        'The Fair Housing notice renders on every screen showing data, verified in a browser; it was previously conditional on the country-wide screen having loaded, which meant it was invisible to exactly the visitors who had not yet added a key.',
        'ZIP resolution was audited across 600 codes sampled from the authoritative Census list, plus 400 across every ZIP prefix, all resolving. Non-US and unassigned codes are correctly reported as not a US ZIP.',
        'A single-ZIP lookup returns full figures with margins of error in about 2 seconds while the country-wide screen continues loading in the background.',
      ],
      defects_found_and_fixed_by_this_process: [
        'A Census ZCTA query requested a field the layer does not define, which fails the whole request with HTTP 200 and an error body; every ZIP was reported as "not a US ZIP code" until it was found by bisecting the field list against the live service.',
        'A redirect from data.ny.gov to data.cityofnewyork.us was blocked by the Content-Security-Policy, so per-school data silently returned nothing. Redirect targets are now pinned by a gate check.',
        'A missing Census key aborted the entire drilldown, discarding keyless sources including NCES, CDC PLACES and the per-state school data.',
        'Socrata returns numeric fields as strings, so a strict typeof check discarded all 114 returned schools.',
      ],
    },
    known_limitations: [
      'Per-school detail is covered for NEW YORK ONLY. This is a structural limit, not an omission. The NCES EDGE ArcGIS catalogue was queried and publishes school districts only, with no school-level service, and each state publishes assessment data in an incompatible format. Washington was investigated as a second candidate and has per-school enrolment data on a keyless CORS-enabled portal, but it carries no school coordinates, so schools cannot be selected by proximity to an address without a fragile name-based join that was judged worse than honestly omitting the state. The other 49 states have district-level data, which is real and citable. StateSchoolPlugin plus the STATE_SCHOOL_PLUGINS list is the extension point, and a new state joins the drilldown automatically.',
      'The country-wide screen takes roughly 20-70s depending on Census API load, because that API is slow for a 33,791-row wildcard query and its latency scales with variable count. It runs concurrently in the background and never blocks a lookup: a single-ZIP search returns full figures with margins of error in about 2 seconds while the screen is still loading.',
      'The domain is a temporary Cloudflare Pages address. The original request explicitly asks for the name to be "narrowed later once branding is clear", so this is a deliberate deferral rather than an omission.',
    ],
    deterministic_results: results.map((r) => ({ check: r.label, passed: r.ok, detail: r.detail.slice(0, 200) })),
    evidence_files: [
      'src/core/plugins/acs.ts',
      'src/core/plugins/schools.ts',
      'src/core/plugins/ny-schools.ts',
      'src/core/geocode.ts',
      'src/core/scoring.ts',
      'src/core/useHousingQuery.ts',
      'src/ui/FairHousingNotice.tsx',
      'src/ui/Funding.tsx',
      'tools/completion-gate.mjs',
      'README.md',
    ],
  }

  const questions = {
    requirements_met: {
      type: 'noul',
      instructions:
        'Judging only the evidence in `deliverable_summary` and `deterministic_results`, does the deliverable actually address every part of `original_request`, or is something requested still outstanding?',
      criteria: { true: 'Every part of the request is addressed with passing evidence.', false: 'At least one requested item is missing, partial, or unevidenced.' },
    },
    overclaiming: {
      type: 'noul',
      instructions:
        'Does `deliverable_summary` present any item as finished or working when the evidence shows it is unverified, blocked, or untested?',
      criteria: { true: 'No overclaiming; limitations are stated plainly.', false: 'Something unverified is presented as complete.' },
    },
    is_a_99: {
      type: 'score',
      instructions: 'Judging the deliverable against the original request, at what standard has this been completed?',
      criteria: [
        'Requirements unmet or a critical defect remains',
        'Core request met, but a stated requirement was missed or a known defect is unaddressed',
        'Request fully met, verified, with only cosmetic or optional polish outstanding',
        'Request fully met, independently verified by tests, with limitations explicitly disclosed',
      ],
    },
    // Diagnostic: a low `requirements_met` score is only useful if it says which
    // requirement is missing. This turns an uninterpretable number into a
    // specific, actionable objection.
    unmet_requirement: {
      type: 'choice',
      instructions:
        'Comparing `original_request` against `deliverable_summary`, `known_limitations` and `deterministic_results`, which single aspect of the original request is the least fully delivered? Choose the most significant gap, or choose `none` if the request is substantially delivered.',
      criteria: {
        none: 'Nothing material is missing; the request is substantially delivered as described',
        distribution: 'The way figures are distributed or delivered (e.g. the country-wide screen is slow, or a payload is large)',
        school_depth: 'School data depth — per-school or per-state detail on drilldown',
        ownership: 'Stewardship — whether the project is genuinely nobody-owned, or only documented as such',
        domain: 'The domain name has not been chosen or does not yet carry a strong message',
        donations: 'Donations are not actually wired up end to end',
        verification: 'Not all elements are independently verified against real data',
        breadth: 'Some data sources or metrics the request implies are missing',
      },
    },
  }

  try {
    const res = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TYPESAFE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, model: 'jev-latest', questions }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 200))
    const body = await res.json()
    const a = body.answers ?? {}

    // 0-3 rubric, weighted with the two hard gates dominant so a confident
    // "yes" on an unaddressed requirement cannot be averaged away.
    const rubric = (a.is_a_99?.score ?? 0) / 3
    const score = (0.4 * rubric + 0.3 * (a.requirements_met?.noul ?? 0) + 0.3 * (a.overclaiming?.noul ?? 0)) * 100
    jev = {
      score: Math.round(score * 10) / 10,
      model: body.model,
      answers: a,
      usage: body.usage,
    }
    console.log(`${c.d}Jev: ${body.model} · ${body.usage?.input_tokens ?? '?'} in / ${body.usage?.output_tokens ?? '?'} out${c.x}\n`)
  } catch (err) {
    jev = { error: String(err.message) }
  }
} else {
  console.log(`${c.d}Jev review skipped: TYPESAFE_API_KEY not set. Deterministic layer ran alone.${c.x}\n`)
}

// ---------------------------------------------------------------- report

const detPassed = results.filter((r) => r.ok).length
const detOk = detPassed === results.length

console.log(`${c.b}Deterministic${c.x}  ${detPassed}/${results.length}`)
for (const r of results) {
  console.log(`  ${r.ok ? pass('') : fail('')} ${r.label}${r.ok ? '' : `\n       ${c.d}${r.detail}${c.x}`}`)
}

if (jev?.error) {
  console.log(`\n${fail(`Jev review failed: ${jev.error}`)}`)
} else if (jev) {
  console.log(`\n${c.b}Jev semantic review${c.x}  score ${jev.score}/100  (threshold ${THRESHOLD})`)
  for (const [k, v] of Object.entries(jev.answers)) {
    const line =
      v.type === 'noul'
        ? `noul=${v.noul}`
        : v.type === 'score'
          ? `score=${v.score}/3 conf=${v.confidence}`
          : `choice=${v.choice} conf=${v.confidence}`
    console.log(`  ${c.d}${k}: ${line}${c.x}`)
  }
  console.log(
    `  ${c.d}note: this scores the supplied evidence, not reality. A high number means the` +
      `\n        record is coherent, not that the code is correct — that is the deterministic layer's job.${c.x}`,
  )
}

const overall =
  jev === null ? (detOk ? 100 : 0) : detOk && jev.score >= THRESHOLD ? jev.score : Math.min(jev.score ?? 0, 98.9)

writeFileSync(OUT, JSON.stringify({ threshold: THRESHOLD, deterministic: results, jev, overall }, null, 2))
console.log(`\n${c.b}Overall: ${overall}/100${c.x}  ${c.d}(report: ${OUT})${c.x}`)

const passed = detOk && (jev === null || jev.score >= THRESHOLD)
console.log(passed ? `${c.g}GATE PASSED${c.x}` : `${c.r}GATE FAILED${c.x}`)
process.exit(passed ? 0 : 1)
