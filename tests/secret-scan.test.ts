/**
 * The A5 secret scan, pinned in both directions.
 *
 * A5 in `docs/hackathon-integration-plan.md` claims no key from the portal
 * environment reaches this repository, and names `tools/secret-scan.mjs` as the
 * method. That file did not exist until this pass, so the claim had nothing
 * measuring it (finding T7 in `docs/gate-tree-completeness-2026-11-08.md`).
 *
 * Both halves are asserted here because a scanner that misses a real token and a
 * scanner that flags `your-key-here` fail in opposite directions and only one of
 * them is noisy enough to be noticed. The specimens are built by concatenation
 * so this test file never contains the shape it is teaching the scanner to
 * catch - otherwise the repository self-scan below would flag its own fixture.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { findSecretsInLine, scanForSecrets } from '../tools/secret-scan.mjs'

const has = (line: string) => findSecretsInLine(line).length > 0
const filler = (n: number) => 'a'.repeat(n)

describe('secret scan: credential shapes are caught', () => {
  it('catches provider-issued token prefixes', () => {
    expect(has(`key = ${'sk-'}${filler(32)}`)).toBe(true)
    expect(has(`token=${'ghp_'}${filler(36)}`)).toBe(true)
    expect(has(`${'github_pat_'}${filler(40)}`)).toBe(true)
    expect(has(`${'AKIA'}${'ABCDEFGHIJKLMNOP'}`)).toBe(true)
    expect(has(`${'AIza'}${filler(35)}`)).toBe(true)
    expect(has(`${'xoxb-'}${'1234567890-abcd'}`)).toBe(true)
    expect(has(`${'sk_live_'}${filler(24)}`)).toBe(true)
  })

  it('catches a private key block and a JSON web token', () => {
    expect(has(`-----BEGIN ${'RSA '}PRIVATE KEY-----`)).toBe(true)
    expect(has(`eyJ${filler(12)}.${filler(12)}.${filler(12)}`)).toBe(true)
  })

  it('catches a credential assigned to a known variable', () => {
    expect(has(`MUSE_API_KEY=${filler(28)}`)).toBe(true)
    expect(has(`TYPESAFE_API_KEY="${filler(28)}"`)).toBe(true)
  })
})

describe('secret scan: prose and placeholders are left alone', () => {
  it('leaves placeholder values alone', () => {
    expect(has('MUSE_API_KEY=your-key-here')).toBe(false)
    expect(has('MUSE_API_KEY=<paste-your-key>')).toBe(false)
    expect(has('CENSUS_API_KEY=changeme')).toBe(false)
    expect(has('OPENAI_API_KEY=sk-...')).toBe(false)
    expect(has('API_KEY=example-value-from-the-portal')).toBe(false)
  })

  it('leaves short values and ordinary words alone', () => {
    expect(has('MUSE_MODEL=muse-spark-1.3')).toBe(false)
    expect(has('the sk- prefix marks an OpenAI-style key')).toBe(false)
    expect(has('BEGIN PRIVATE KEY appears in PEM files')).toBe(false)
  })

  it('leaves the redaction sentinels alone', () => {
    // These shapes are deliberate: the diagnostics tests feed a key-shaped value
    // to prove it is never echoed, and a harmless string would prove nothing.
    expect(has(`const SECRET = '${'sk-live-'}${'SENTINEL-route-never-echoed'}'`)).toBe(false)
    expect(has(`'${'sk-live-'}${'SENTINEL-9f2c-NEVER-EXPORT'}'`)).toBe(false)
  })

  it('does not flag its own pattern source', () => {
    // The scanner's literal patterns must not match themselves, or the
    // repository self-scan below would fail on the file that defines the rule.
    const own = `export const SHAPES = [{ name: 'provider API key', re: /\\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}/ }]`
    expect(has(own)).toBe(false)
  })
})

describe('secret scan: the tree it ships in', () => {
  it('finds no credential in this repository', () => {
    const { files, findings } = scanForSecrets('.')
    // A scanner pointed at the wrong directory reports zero findings and looks
    // identical to a clean tree, so the count is asserted too.
    expect(files).toBeGreaterThan(50)
    expect(findings).toEqual([])
  })

  it('reports a finding when a file in a temp tree holds a key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'secret-scan-'))
    writeFileSync(join(dir, 'config.ts'), `const k = '${'sk-'}${filler(32)}'\n`)
    const { findings } = scanForSecrets(dir)
    expect(findings.length).toBe(1)
    expect(findings[0]).toContain('config.ts:1')
    // The value is never echoed: a report that republishes the credential is
    // not an improvement on the leak.
    expect(findings[0]).not.toContain(filler(32))
  })
})
