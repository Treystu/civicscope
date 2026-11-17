/**
 * Pins the clause-proof audit's rules in both directions.
 *
 * The instrument reads the gate's own clause register, so the thing that needs
 * pinning is the classification: a rule that quietly widens (crediting a step
 * label as a measurement) or narrows (calling every clause unproven) would still
 * print a plausible summary. Each class is therefore built from a register whose
 * answer is known, and the determinism claim is asserted by measuring the same
 * input twice and comparing bytes rather than by trusting the absence of a clock.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  audit,
  canonical,
  digest,
  measureA5,
  measureClauses,
  sameSubject,
  sharedSubject,
  tokens,
} from '../tools/clause-proof-audit.mjs'

const reportWith = (clauses: { req: string; proofs: { proof: string; labels: string[]; passed: boolean }[] }[]) => ({
  deterministic: [
    {
      label: 'no credential reaches the repository tree (274 files scanned; A5)',
      ok: true,
      detail: '',
    },
  ],
  clauses: {
    steps: ['typecheck + build', 'unit + security tests', 'live API contracts', 'WCAG 2.2 AA audit (axe-core, real browser)'],
    clauses,
  },
})

describe('clause proof audit: the classifier', () => {
  it('drops sub-four-character tokens and stopwords, so identity rests on the subject', () => {
    expect(tokens('WCAG 2.2 AA with zero violations')).toEqual(['wcag', 'violations'])
    expect(sharedSubject('WCAG 2.2 AA with zero violations', 'WCAG 2.2 AA audit (axe-core, real browser)')).toEqual([
      'wcag',
    ])
  })

  it('matches inflected forms, so a clause proven in different words is not called opaque', () => {
    // Measured on the first run: "with its limits disclosed" against "the page
    // discloses that donations go to a person" is the same measurement, and an
    // exact-match rule called it label-opaque. Pinned so the widening is not lost.
    expect(sameSubject('disclosed', 'discloses')).toBe(true)
    expect(sameSubject('donation', 'donations')).toBe(true)
    expect(sameSubject('map', 'maps')).toBe(false)
    const measured = measureClauses(
      reportWith([
        {
          req: 'a stewardship path that is genuinely nobody-owned, with its limits disclosed',
          proofs: [
            {
              proof: 'the page discloses that donations go to a person',
              labels: ['the page discloses that donations go to a person rather than a collective'],
              passed: true,
            },
          ],
        },
      ]),
    )
    expect(measured.clauses[0]!.class).toBe('subject-named')
  })

  it('calls a clause label-opaque when its only proof is a pipeline step, which is P4', () => {
    // Clause 14 as it ships: "a completion gate passed on evidence rather than
    // assertion", proven by the test suite. The words share nothing, and that is
    // the finding - the clause is credited to the suite having run.
    const measured = measureClauses(
      reportWith([
        {
          req: 'a completion gate passed on evidence rather than assertion',
          proofs: [{ proof: 'unit + security tests', labels: ['unit + security tests'], passed: true }],
        },
      ]),
    )
    expect(measured.clauses[0]!.class).toBe('label-opaque')
    expect(measured.clauses[0]!.proofs[0]!.step).toBe(true)
    expect(measured.clauses[0]!.proofs[0]!.shared_subject).toEqual([])
  })

  it('calls a clause subject-named when a cited check names its subject', () => {
    const measured = measureClauses(
      reportWith([
        {
          req: 'WCAG 2.2 AA with zero violations',
          proofs: [
            { proof: 'WCAG 2.2 AA audit', labels: ['WCAG 2.2 AA audit (axe-core, real browser)'], passed: true },
          ],
        },
      ]),
    )
    expect(measured.clauses[0]!.class).toBe('subject-named')
  })

  it('calls a clause unproven when a citation resolves to nothing, to several, or to a failure', () => {
    const measured = measureClauses(
      reportWith([
        { req: 'a sitemap covering every ZIP', proofs: [{ proof: 'sitemap covers every ZIP code', labels: [], passed: false }] },
        {
          req: 'a selected domain, live',
          proofs: [
            { proof: 'production serves a build', labels: ['a', 'b'], passed: true },
          ],
        },
        {
          req: 'the free Census API rate limit respected',
          proofs: [{ proof: 'the national ZIP enumeration is cached', labels: ['the national ZIP enumeration is cached'], passed: false }],
        },
      ]),
    )
    expect(measured.clauses.map((c) => c.class)).toEqual(['unproven', 'unproven', 'unproven'])
    expect(measured.clauses[1]!.proofs[0]!.resolved).toBe(false)
  })

  it('refuses a report that carries no clause register instead of reporting zero clauses', () => {
    expect(() => measureClauses({ deterministic: [] })).toThrow(/no clause register/)
  })
})

describe('clause proof audit: A5 and reconciliation', () => {
  it('counts a passing scan as one pass, one declared limitation and no defect', () => {
    const a5 = measureA5(reportWith([]))
    expect(a5).toMatchObject({ present: true, pass: 1, known_limitation: 1, new_defect: 0, files_scanned: 274 })
  })

  it('counts a missing A5 row as a defect, because an unrun scan proves nothing', () => {
    expect(measureA5({ deterministic: [] })).toMatchObject({ present: false, pass: 0, new_defect: 1 })
  })

  it('counts a failing scan as a defect rather than as a limitation', () => {
    const failing = {
      deterministic: [{ label: 'no credential reaches the repository tree (12 files scanned; A5)', ok: false, detail: 'x' }],
      clauses: { steps: [], clauses: [] },
    }
    expect(measureA5(failing)).toMatchObject({ pass: 0, known_limitation: 1, new_defect: 1 })
  })
})

describe('clause proof audit: determinism', () => {
  it('measures the same report to the same bytes and the same digest', () => {
    const report = reportWith([
      {
        req: 'a Fair Housing notice on every surface that shows neighbourhood data',
        proofs: [
          { proof: 'Fair Housing notice renders on any screen', labels: ['Fair Housing notice renders on any screen'], passed: true },
        ],
      },
    ])
    const first = audit(report)
    const second = audit(reportWith(report.clauses.clauses as never))
    expect(canonical(first)).toBe(canonical(second))
    expect(first.digest).toBe(second.digest)
    expect(first.digest).toBe(digest(canonical({ clauses: first.clauses, a5: first.a5 })))
    // No clock, no path, no environment value can be hiding in the output.
    expect(canonical(first)).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
  })
})

describe('clause proof audit: the live register', () => {
  const path = join(__dirname, '..', 'gate-report.json')
  const live = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null

  it('reconciles against the live gate report when one is present', () => {
    if (!live?.clauses) {
      // Not a silent skip: the gate report is a generated artifact, absent on a
      // fresh clone and on any head whose last gate run predates the register.
      // The measurement is then produced by running the tool after the gate, and
      // recorded with its digest in docs/clause-proof-audit-2026-11-08.md.
      console.log('clause proof audit: no live gate report with a clause register on disk; rules pinned only')
      return
    }
    const measured = audit(live)
    const counts = measured.clauses.counts
    console.log(
      `live: ${counts.clauses} clauses, ${counts.proofs} citations, ` +
        `unproven ${counts.unproven}, label-opaque ${counts['label-opaque']}, subject-named ${counts['subject-named']}, ` +
        `digest ${measured.digest.slice(0, 16)}`,
    )
    expect(counts.clauses).toBe(14)
    const classSum = counts.unproven + counts['label-opaque'] + counts['subject-named']
    expect(classSum, 'clause classes must partition the clauses').toBe(counts.clauses)
    const a5 = measured.a5
    expect(a5.pass + a5.known_limitation + a5.new_defect).toBe(2)
    expect(a5.files_scanned).toBeGreaterThan(0)
  })
})
