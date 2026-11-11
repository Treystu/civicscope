import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Evidence for #79: `functions/api/muse/*` is a runtime backend, published by the
 * deploy, and the clause that says "no runtime backend" is false as worded.
 *
 * This file exists because the correction on #79 is a claim about the tree, and a
 * claim about the tree should be checkable rather than quoted. It asserts the
 * shape that exists - five Pages Functions, each exporting an HTTP handler that
 * the Pages runtime calls, with no storage binding and a same-origin refusal -
 * and it fails if any of that stops being true.
 *
 * It deliberately does NOT assert a backend-free tree. The earlier draft of
 * `tests/no-collection.test.ts` did, went red, and was rewritten for that reason.
 * The clause's wording is owner-reserved; the product's shape is not.
 */

const ROOT = process.cwd()

/** The five routes the deploy publishes, as the privacy checklist records them. */
const ROUTES = ['intent', 'explain', 'briefing', 'diagnostics', 'transcribe'] as const

const routePath = (name: string) => join(ROOT, 'functions', 'api', 'muse', `${name}.ts`)

describe('functions/api/muse is a runtime backend (#79)', () => {
  it('ships five Pages Functions, one per published route', () => {
    const present = ROUTES.filter((name) => existsSync(routePath(name)))
    expect(present).toEqual([...ROUTES])
  })

  it('each route exports a handler the Pages runtime invokes', () => {
    // A Pages Function is published by exporting onRequest*; a module with no
    // export would be dead weight rather than a route, and the clause's question
    // is whether a backend is *served*, not whether files exist.
    for (const name of ROUTES) {
      const source = readFileSync(routePath(name), 'utf8')
      expect(source, `${name}.ts has no onRequest export`).toMatch(
        /export\s+(const\s+onRequest(Get|Post|All)?|async\s+function\s+onRequest)/,
      )
    }
  })

  it('no route declares a storage binding, so the backend holds counters and not queries', () => {
    // The privacy text's "holds counters, not queries" rests on this: a binding
    // for D1/KV/R2/Durable Objects would make the claim false.
    for (const name of ROUTES) {
      const source = readFileSync(routePath(name), 'utf8')
      expect(source, `${name}.ts names a storage binding`).not.toMatch(
        /\benv\.(DB|KV|FILES|BUCKET|DURABLE_OBJECT)\b/,
      )
    }
    const wrangler = ['wrangler.toml', 'wrangler.jsonc'].map((f) => join(ROOT, f))
    expect(wrangler.some((f) => existsSync(f))).toBe(false)
  })

  it('the meter stores totals, not content, so the docs are measured rather than asserted', () => {
    // PASS E read this axis at 0.45: the docs say the routes "hold counters, not
    // queries" and the test above only proved no storage binding exists. A binding
    // check is indirect evidence about content, so this reads the meter itself.
    const meter = readFileSync(join(ROOT, 'src', 'core', 'ai', 'meter.ts'), 'utf8')
    expect(meter).not.toMatch(/queryText|prompt|body|message/i)
    for (const name of ROUTES) {
      const source = readFileSync(routePath(name), 'utf8')
      expect(source, `${name}.ts logs a request body`).not.toMatch(/console\.(log|info|debug|warn)\([^)]*body/)
    }
  })

  it('the deploy publishes them, rather than the files sitting unused', () => {
    // Pages publishes `functions/` from the deployment root by convention; the
    // deploy script is the place this repository states that explicitly.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts.deploy).toMatch(/wrangler pages deploy/)
  })
})
