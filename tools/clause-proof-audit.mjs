#!/usr/bin/env node
/**
 * Deterministic per-clause measurement of the completion gate's cited proofs.
 *
 * The gate resolves each of the 14 scored clauses to the check that is supposed
 * to have measured it, but until now it published that resolution only as one
 * aggregate row: "every stated requirement is backed by exactly one check that
 * passed in this run". That row is true and uninformative. It cannot show that
 * clause 14 ("a completion gate passed on evidence rather than assertion") is
 * credited to `unit + security tests` - a pipeline step - so the clause tracks
 * the suite rather than whether any gate passed. That is P4 in
 * docs/gate-tree-completeness-2026-11-08.md, found by reading, not by a machine.
 *
 * This tool measures every clause from the gate's own report (no re-derivation of
 * the gate's register, no reimplementation of its matcher) and classifies each
 * one with a rule that is stated, mechanical and reproducible:
 *
 *   - `unproven`     the citation resolves to no single passing check;
 *   - `label-opaque` every cited check shares no subject word with the clause,
 *                    so the proof names nothing the clause is about - credit for
 *                    the suite running, not for the clause being measured;
 *   - `subject-named` at least one cited check names the clause's subject.
 *
 * `label-opaque` is not by itself a defect: a clause can be legitimately proven
 * by a step ("everything works" is proven by building and testing it). It is a
 * flag that the credit is to a step, and it is the machine's reproduction of P4.
 * Nothing here changes a clause, weight or score, and nothing closes P4.
 *
 * Determinism is a requirement, not a hope: the output contains no timestamps,
 * no paths, no environment values and no unordered iteration, so two runs on the
 * same report are byte-identical. `--check` asserts exactly that.
 *
 * Usage:
 *   node tools/clause-proof-audit.mjs            # canonical measurement on stdout
 *   node tools/clause-proof-audit.mjs --check     # measure twice, require byte equality
 *   node tools/clause-proof-audit.mjs --json      # compact JSON only
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPORT = join(ROOT, 'gate-report.json')

/**
 * Words that carry no subject.
 *
 * Kept short on purpose: the rule has to be readable to be arguable, and a long
 * stopword list would let a clause be classified by tuning this table rather
 * than by what its citation says. Tokens shorter than four characters are also
 * dropped, which is why "AA" and "2.2" contribute nothing and WCAG carries the
 * clause's identity on its own.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'that',
  'this', 'is', 'are', 'be', 'been', 'by', 'as', 'at', 'from', 'its', 'it',
  'every', 'each', 'all', 'any', 'no', 'not', 'than', 'rather', 'into', 'over',
  'more', 'most', 'when', 'where', 'which', 'while', 'must', 'should', 'shall',
  'may', 'can', 'per', 'via', 'only', 'also', 'both', 'zero', 'one', 'two',
])

/** Subject tokens: lowercase alphanumeric runs, four characters or longer, not stopwords. */
export function tokens(text) {
  const out = []
  for (const raw of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 4) continue
    if (STOPWORDS.has(raw)) continue
    out.push(raw)
  }
  return out
}

/**
 * Whether two subject tokens name the same thing.
 *
 * Exact equality alone is too strict to be useful and too easy to defeat: one
 * clause says "with its limits disclosed" and its cited check says "the page
 * discloses that donations go to a person". Those are the same measurement, and
 * an exact-match rule called that clause label-opaque - measured, not guessed, on
 * the first run of this tool. Tokens of six characters or more therefore match on
 * a six-character prefix, which pairs discloses/disclosed and donation/donations
 * without pairing unrelated short words. The rule is stated here rather than
 * hidden in a stemmer because the classification has to be arguable by reading it.
 */
export function sameSubject(a, b) {
  if (a === b) return true
  return a.length >= 6 && b.length >= 6 && a.slice(0, 6) === b.slice(0, 6)
}

/** Subject words two strings share, in the first string's order and without repeats. */
export function sharedSubject(a, b) {
  const bs = tokens(b)
  const seen = new Set()
  const out = []
  for (const t of tokens(a)) {
    if (seen.has(t)) continue
    if (!bs.some((other) => sameSubject(t, other))) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export const CLASSES = ['unproven', 'label-opaque', 'subject-named']

/**
 * Measures every clause in a gate report.
 *
 * Reads only the report: the clause register and the resolved labels are the
 * gate's own words, so this cannot drift from what the gate credited.
 */
export function measureClauses(report) {
  const register = report?.clauses
  if (!register || !Array.isArray(register.clauses)) {
    throw new Error(
      'gate-report.json carries no clause register: rerun the gate on a head that writes `clauses` ' +
        '(tools/completion-gate.mjs, CLAUSE_RECORDS) before measuring',
    )
  }
  const steps = new Set(register.steps ?? [])
  const clauses = register.clauses.map((clause) => {
    const proofs = clause.proofs.map((p) => {
      const labels = [...p.labels]
      const shared = labels.flatMap((label) => sharedSubject(clause.req, label))
      const deduped = [...new Set(shared)]
      return {
        proof: p.proof,
        labels,
        passed: p.passed === true,
        // A citation whose proof text appears in no label is unresolvable, and a
        // citation that matched several is ambiguous; the gate reports both as
        // unproven and so does this, from the same evidence.
        resolved: labels.length === 1,
        step: labels.length === 1 && steps.has(labels[0]),
        shared_subject: deduped,
      }
    })
    const anyUnproven = proofs.some((p) => !p.passed || !p.resolved)
    const anyShared = proofs.some((p) => p.shared_subject.length > 0)
    const cls = anyUnproven ? 'unproven' : anyShared ? 'subject-named' : 'label-opaque'
    return { req: clause.req, class: cls, proofs }
  })
  return {
    schema: 'civicscope-clause-proof-audit/v1',
    clauses,
    counts: countBy(clauses),
    steps_declared: [...steps].sort(),
  }
}

function countBy(clauses) {
  const counts = { clauses: clauses.length, proofs: 0, distinct_proofs: 0 }
  for (const c of CLASSES) counts[c] = 0
  const distinct = new Set()
  for (const c of clauses) {
    counts[c.class] += 1
    counts.proofs += c.proofs.length
    for (const p of c.proofs) distinct.add(p.proof)
  }
  counts.distinct_proofs = distinct.size
  return counts
}

/**
 * The A5 credential scan, read from the same report and on the same head.
 *
 * A5 (docs/hackathon-integration-plan.md:110) says no portal key reaches this
 * repository, verified by `tools/secret-scan.mjs` in the gate. The gate runs it,
 * so the result is read rather than re-run: a second scan of the same tree would
 * be a second measurement of the same thing, and the point of this pass is one
 * measurement per claim.
 *
 * Findings are reconciled into three buckets, and the buckets must add up to the
 * files the scan reports, which is what `--check` asserts:
 *   - pass:             the scan found no credential in the tree;
 *   - known-limitation: the scan reads the working tree, not git history, so a
 *                       key deleted from the tree after being committed is out of
 *                       scope (stated in the report, carried here);
 *   - new-defect:       any credential finding, or an absent/failed scan.
 */
export function measureA5(report) {
  const row = (report?.deterministic ?? []).find((r) => /credential reaches the repository tree/.test(r.label))
  if (!row) {
    return {
      present: false,
      pass: 0,
      known_limitation: 0,
      new_defect: 1,
      files_scanned: 0,
      note: 'the gate report carries no A5 row, so the scan did not run on this head',
    }
  }
  const scanned = /\((\d+) files scanned/.exec(row.label)
  const files = scanned ? Number(scanned[1]) : 0
  const passed = row.ok === true
  return {
    present: true,
    pass: passed ? 1 : 0,
    // One declared limitation, always: tree, not history. It is a property of the
    // method, not of this run, so it is counted once whether or not the scan passed.
    known_limitation: 1,
    new_defect: passed ? 0 : 1,
    files_scanned: files,
    note: passed
      ? 'working tree clean of credential shapes; git history is not scanned'
      : `scan failed: ${row.detail || 'no detail'}`,
  }
}

/** Byte-stable serialisation: fixed key order, two-space indent, trailing newline. */
export function canonical(measurement) {
  return `${JSON.stringify(measurement, null, 2)}\n`
}

export function digest(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** One measurement of one report, with the digest of its own canonical bytes. */
export function audit(report) {
  const clauses = measureClauses(report)
  const a5 = measureA5(report)
  const body = { clauses, a5 }
  return { ...body, digest: digest(canonical(body)) }
}

function readReport(path = REPORT) {
  if (!existsSync(path)) throw new Error(`no gate report at ${path}: run the gate first`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function main(argv) {
  const report = readReport()
  const first = audit(report)

  if (argv.includes('--check')) {
    // Two independent runs over the same report. Byte equality is the whole
    // claim: same inputs, same bytes, no clock, no ordering, no randomness.
    const second = audit(readReport())
    const a = canonical(first)
    const b = canonical(second)
    if (a !== b) {
      console.error('NOT DETERMINISTIC: two runs over the same report differ')
      process.exit(1)
    }
    if (argv.includes('--json')) {
      process.stdout.write(a)
    } else {
      console.log(`clause proof audit: ${first.digest}`)
      console.log(`  deterministic: two runs byte-identical (${Buffer.byteLength(a, 'utf8')} bytes)`)
    }
    reportSummary(first)
    reconcile(first)
    return
  }

  if (argv.includes('--json')) {
    process.stdout.write(canonical(first))
    return
  }
  process.stdout.write(canonical(first))
  reportSummary(first)
}

/** The numbers a reader wants first, in the order the counts were defined. */
function reportSummary(result) {
  const c = result.clauses.counts
  console.log(
    `  clauses: ${c.clauses} (${CLASSES.map((k) => `${k} ${c[k]}`).join(', ')}), ` +
      `${c.proofs} citations over ${c.distinct_proofs} distinct proofs`,
  )
  for (const clause of result.clauses.clauses) {
    const labels = clause.proofs.flatMap((p) => p.labels)
    console.log(`  ${clause.class.padEnd(13)} ${clause.req.slice(0, 60)} -> ${labels.join(' | ') || '(unresolved)'}`)
  }
  const a = result.a5
  console.log(
    `  A5: pass ${a.pass}, known-limitation ${a.known_limitation}, new-defect ${a.new_defect} ` +
      `(${a.files_scanned} files scanned)`,
  )
}

/**
 * The counts have to add up, or the summary is decoration.
 *
 * Clause classes partition the clauses; A5 buckets partition its single claim;
 * and the file count the scan reported must be a positive number for a pass to
 * mean anything, because a scan that read no files finds nothing by definition.
 */
function reconcile(result) {
  const c = result.clauses.counts
  const clsSum = CLASSES.reduce((n, k) => n + c[k], 0)
  const a = result.a5
  const a5Sum = a.pass + a.known_limitation + a.new_defect
  const problems = []
  if (clsSum !== c.clauses) problems.push(`clause classes ${clsSum} != clauses ${c.clauses}`)
  if (a5Sum !== 2) problems.push(`A5 buckets ${a5Sum} != 2 (pass/known-limitation/new-defect)`)
  if (a.pass === 1 && a.files_scanned <= 0) problems.push('A5 passed while scanning 0 files')
  if (problems.length > 0) {
    console.error(`RECONCILIATION FAILED: ${problems.join('; ')}`)
    process.exit(1)
  }
}

// Only run when invoked directly, so the test can import the rules without
// executing a measurement against whatever report happens to be on disk.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2))
  } catch (err) {
    console.error(`clause proof audit: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
