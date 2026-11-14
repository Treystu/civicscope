/**
 * Finds credentials in the source tree.
 *
 * This file exists because assumption A5 in `docs/hackathon-integration-plan.md`
 * (`docs/hackathon-integration-plan.md:110`) names its verification method as
 * "`tools/secret-scan.mjs` in the gate + review of every diff". The file did not
 * exist, nothing referenced it, and no CI step ran it, so the standing claim
 * that no key from the portal environment reaches this repository had no
 * measurement behind it. Name-only verification is the defect this scanner
 * removes: the gate now runs the same code a reviewer reads here.
 *
 * WHAT IT LOOKS FOR, AND WHY SHAPE RATHER THAN FILENAME
 *
 * A file named `secrets.ts` is not a leak and a file named `config.ts` can be
 * one, so filename rules miss both. The patterns below are value shapes: the
 * prefixes and lengths providers actually issue. A finding names the file, the
 * line, and the shape that matched, never the value, so the gate's report can
 * be pasted into an issue without republishing the credential it caught.
 *
 * THE PLACEHOLDER PROBLEM, MEASURED IN BOTH DIRECTIONS
 *
 * A scanner that flags `MUSE_API_KEY=your-key-here` fails on a clean tree and
 * gets switched off, and one that only looks for `sk-` misses every other
 * provider. So env assignments are only flagged when the value is long enough
 * to be a real credential AND does not carry a placeholder marker (`<...>`,
 * `your`, `xxx`, `redacted`, `changeme`, `placeholder`, `example`, `dummy`,
 * `...`). `tests/secret-scan.test.ts` pins both directions so neither half can
 * rot silently.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not verify liveness and does not read git history: it scans the
 * working tree as it is checked out. An already-committed key that was later
 * removed from the tree is a history question, and a scan that claims to cover
 * history without reading it would be the same kind of overclaim as A5 was.
 *
 * Used by `tools/completion-gate.mjs` and pinned by `tests/secret-scan.test.ts`.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Directories that are never product source.
 *
 * `dist` and `.wrangler` hold build and dev-server output that is regenerated
 * from the tree, and `.git` holds objects a text scan cannot read. `docs` is
 * deliberately NOT skipped here: a key pasted into a planning document is
 * still a key in the repository.
 */
const SKIP_DIRS = new Set([
  '.git',
  '.wrangler',
  'audit',
  'dist',
  'node_modules',
  'packs',
  '.agents',
  '.claude',
  '.opencode',
])

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mjs',
  '.js',
  '.json',
  '.jsonc',
  '.css',
  '.html',
  '.md',
  '.txt',
  '.yml',
  '.yaml',
  '.toml',
  '.sh',
  '.ps1',
  '.env',
  '',
])

/**
 * Provider-issued value shapes.
 *
 * Every pattern is a literal prefix plus a length bound, because length is what
 * separates a real token from prose that happens to start with the same three
 * characters. Each carries the name of the shape so a failure reads as
 * "GitHub token" rather than "regex matched".
 */
const SHAPES = [
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{30,}/ },
  { name: 'AWS access key id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Stripe key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'provider API key', re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}/ },
  { name: 'JSON web token', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
]

/**
 * Env assignments whose value must be examined.
 *
 * Only names that hold a credential are listed. A variable like `MUSE_MODEL` is
 * configuration, and flagging it would train the reader to ignore this scan.
 */
const SECRET_VARS =
  /(?:TYPESAFE_API_KEY|MUSE_API_KEY|CENSUS_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|API_KEY|SECRET|ACCESS_TOKEN|AUTH_TOKEN|CLIENT_SECRET)\s*[:=]\s*['"]?([^\s'"`,;]+)/

/**
 * Markers that mean the value is a stand-in rather than a credential.
 *
 * The ellipsis is escaped on purpose. An unescaped `...` matches any three
 * characters, so it would mark every long value as a placeholder and turn this
 * scan into an always-green check - the failure mode it exists to prevent.
 */
const PLACEHOLDER = /^(?:<|\[|\$|\{)|\.\.\.|your|xxx|redacted|changeme|placeholder|example|dummy|sample|test-key|not-a|todo/i

/**
 * Values this project uses to prove a secret is never echoed.
 *
 * `tests/ai/diagnostics*.test.ts` hold values shaped exactly like a key - that
 * is the point of those tests: a redaction check fed a harmless string proves
 * nothing. They are marked with the project's own SENTINEL convention, and a
 * credential issued by a provider does not contain that word, so recognising it
 * costs no real detection. Pinned in both directions by the test file.
 */
const TEST_SENTINEL = /SENTINEL|never[-_]export|never[-_]echoed/i

/**
 * Finds credential-shaped values in one line.
 *
 * Returns shape names only. The matched text is deliberately dropped at this
 * boundary so no caller can print a credential by accident.
 */
export function findSecretsInLine(line) {
  const found = []
  for (const shape of SHAPES) {
    const m = shape.re.exec(line)
    if (m && !TEST_SENTINEL.test(m[0])) found.push(shape.name)
  }
  const m = SECRET_VARS.exec(line)
  if (m && m[1].length >= 20 && !PLACEHOLDER.test(m[1]) && !TEST_SENTINEL.test(m[1])) {
    found.push('credential assignment')
  }
  return found
}

/** Every finding in one file, or `[]` if it cannot be read as text. */
export function findSecretsInFile(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  const out = []
  text.split(/\r?\n/).forEach((line, i) => {
    for (const shape of findSecretsInLine(line)) out.push(`${path}:${i + 1} ${shape}`)
  })
  return out
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    // A dotfile is skipped except `.env` itself: an environment file is the most
    // likely place for a pasted key, while editor and tool dotfiles are noise.
    if (entry.isDirectory()) {
      walk(full, out)
      continue
    }
    if (entry.name.startsWith('.') && !entry.name.startsWith('.env')) continue
    // An env file carries no extension in the usual sense (`.env`, `.env.example`),
    // and it is the single most likely place for a pasted key, so both are read.
    if (entry.name.startsWith('.env') || TEXT_EXTENSIONS.has(extname(entry.name))) out.push(full)
  }
  return out
}

/**
 * Every credential-shaped value under `root`.
 *
 * @param {string} root absolute or cwd-relative directory to scan
 * @returns {{ files: number, findings: string[] }}
 */
export function scanForSecrets(root = '.') {
  const files = walk(root)
  const findings = []
  for (const file of files) findings.push(...findSecretsInFile(file))
  return { files: files.length, findings }
}

// pathToFileURL rather than string concatenation: `import.meta.url` on Windows
// is `file:///C:/...` with three slashes, so a hand-built `file://${argv[1]}`
// never matches and the CLI silently does nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { files, findings } = scanForSecrets(process.argv[2] ?? '.')
  for (const f of findings) console.log(f)
  console.log(`\n${findings.length} credential finding(s) in ${files} scanned file(s)`)
  process.exit(findings.length === 0 ? 0 : 1)
}
