import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Evidence for clause_7: "no advertising, analytics, search logging, accounts or runtime backend"
 * (tools/completion-gate.mjs:1149). The gate reads the clause at 0.53; issue #79 records that.
 *
 * This file was written twice. The first draft asserted `functions/` does not exist - and went red,
 * because it does: five Pages Functions under `functions/api/muse/` relay model requests so a shared
 * key never reaches the browser. The project's own record says so
 * (`docs/gate-tree-completeness-2026-11-08.md`, S6: "the request says 'no runtime backend' without
 * that qualifier, and `functions/api/muse/*` are three deployed routes"). A test that asserts a
 * comfortable world is worse than no test, so what follows asserts the world that exists: no
 * advertising, no analytics, no accounts, no search logging, and a backend whose shape is pinned
 * rather than denied.
 *
 * Whether the clause's wording should exclude a zero-knowledge proxy is an owner disposition - it
 * changes what the instrument is asked, and the instrument is frozen for this lane.
 */

const ROOT = process.cwd()

/** Every .ts/.tsx file under src/, excluding tests. */
function sources(dir = join(ROOT, 'src')): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full)
    }
  }
  walk(dir)
  return out
}

/** file:line for every match, so a failure names the line rather than a count. */
function find(pattern: RegExp, files: string[]): string[] {
  const hits: string[] = []
  for (const file of files) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (pattern.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`)
      })
  }
  return hits
}

describe('clause_7 evidence: no advertising, analytics, accounts or search logging', () => {
  it('installs nothing at runtime that could collect or authenticate', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    // Pinned, not pattern-matched: the runtime surface is three rendering/geometry packages, so an
    // analytics or auth SDK cannot arrive without this suite going red first.
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(['d3-geo', 'react', 'react-dom'])
  })

  it('contains no analytics or advertising client, matched in identifying form only', () => {
    // Vendor names appear here only in the form that identifies a client. The bare word
    // "plausible" is ordinary English in this tree (`src/core/ai/meta-key.ts`), and a scanner that
    // flags prose is a scanner people switch off.
    const pattern =
      /gtag\(|googletagmanager\.com|google-analytics\.com|dataLayer\b|posthog\.|mixpanel\.|amplitude\.com|segment\.(io|com)|hotjar\.|fullstory\.com|clarity\.ms|sentry\.io|fbq\(|_paq\b|plausible\.io/
    expect(find(pattern, sources())).toEqual([])
  })

  it('sends no beacon and writes no cookie', () => {
    expect(find(/sendBeacon|document\.cookie\s*=/, sources())).toEqual([])
  })

  it('has no account surface: no credential form, session or sign-in flow', () => {
    expect(find(/signIn|signUp|sign_in|password\s*:/, sources())).toEqual([])
  })

  it('stores only named preferences, and no reader identifier', () => {
    const keys = new Set<string>()
    for (const file of sources()) {
      for (const match of readFileSync(file, 'utf8').matchAll(/'civicscope\.[^']*'/g)) keys.add(match[0])
    }
    // Measured, not imagined: each entry is a reader-owned value (their own Census key, their own
    // key-provenance note, view state, their saved list) and none carries an identity. A new key
    // must be added here deliberately, which is the review this test exists to force. The census
    // key deserves its name in lights: it is the reader's key, stored because they typed it, and
    // it never leaves their browser except to Census itself.
    expect([...keys].sort()).toEqual([
      "'civicscope.censusBudget.v1'",
      "'civicscope.censusKey.v1'",
      "'civicscope.diagnostics.v1'",
      "'civicscope.metaKey.v1'",
      "'civicscope.returnPath'",
      "'civicscope.saved-searches.v1'",
      "'civicscope.similarity.v1.cutoff'",
      "'civicscope.similarity.v1.enabled'",
      "'civicscope.similarity.v1.weights'",
      "'civicscope.toured.v1'",
    ])
  })

  it('opens only the local response cache, which holds no identity', () => {
    const opens = find(/indexedDB\.open\(/, sources())
    // Every open is the same cache database: it stores Census responses so a revisit does not
    // re-spend a shared daily quota. There is no second store an account could live in.
    for (const hit of opens) expect(hit).toMatch(/indexedDB\.open\(DB_NAME|'civicscope-cache'/)
    const names = new Set(opens.map((h) => h.split('indexedDB.open(')[1]?.trim()))
    expect([...names].sort()).toEqual(["'civicscope-cache', 2)", 'DB_NAME, DB_VERSION)'])
  })

  it('exposes a pinned, allowlisted proxy inventory rather than an open backend', () => {
    const dir = join(ROOT, 'functions', 'api', 'muse')
    expect(existsSync(dir)).toBe(true)
    const routes = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort()
    // Five routes, each framework-free and testable directly: three live (intent, explain,
    // briefing), one diagnostics surface, one deliberately inert shell (transcribe, Item 12).
    expect(routes).toEqual(['briefing.ts', 'diagnostics.ts', 'explain.ts', 'intent.ts', 'transcribe.ts'])

    const files = routes.map((f) => join(dir, f))
    // Every route goes through the shared gate: closed path allowlist, meter, breaker, shutoff.
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text, `${file} bypasses the shared proxy discipline`).toMatch(/muse-proxy|muse-adapter/)
      // And each one refuses a foreign origin: either through `preCallGate`, or - for the
      // diagnostics route, which serves GET and no body - by comparing the Origin header itself.
      expect(text, `${file} does not refuse a foreign origin`).toMatch(
        /preCallGate|origin !== url\.origin/,
      )
    }
    // No route writes a body, a query or an identifier anywhere: no storage binding, no database.
    expect(find(/\.put\(|\.insert\(|INSERT INTO|CREATE TABLE|env\.DB|env\.KV/i, files)).toEqual([])
    // No CORS header is served, so no foreign origin can use these routes.
    expect(find(/access-control-allow-origin/i, files)).toEqual([])
  })
})
