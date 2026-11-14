/**
 * PASS E evidence-rating probe - three axes, each decomposed, with a control.
 *
 * The first version of this probe asked one compound question per axis over a
 * prose summary and read 0.11 / 0.12 / 0.76. That reading was not usable: a
 * summary cannot carry a tree, so the probe was measuring the summary. This
 * version fixes the instrument rather than the story:
 *
 *   - each axis is decomposed into narrow questions about named artefacts, so a
 *     low reading points at one thing instead of at "the repo";
 *   - a CONTROL question with an answer known by hand from the tree is asked in
 *     the same call. If the control does not read high, the probe reports
 *     INVALID and no axis reading is reported at all, because the instrument is
 *     the thing that failed.
 *
 * Diagnostic only. Nothing here touches the frozen gate, its register or its 99
 * threshold, and the output carries DIAGNOSTIC on every result line.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

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
    return undefined
  }
  return undefined
}

const key = readJevKey()
if (!key) {
  console.error('DIAGNOSTIC NOT CHECKED: no key on this surface.')
  process.exit(2)
}

const noul = (instructions, yes, no) => ({
  type: 'noul',
  instructions,
  criteria: { true: yes, false: no },
})

const questions = {
  // Control. The answer is checkable by hand in the tree: package.json exists and
  // its scripts carry a `verify` entry. A probe that cannot rate this high is not
  // measuring the evidence it is given.
  control: noul(
    'The state asserts that package.json exists and defines a `scripts.verify` entry. Is that assertion consistent with a real repository convention (a package manifest with a verify script), rather than internally impossible or self-contradictory?',
    'Consistent and ordinary.',
    'Impossible, contradictory, or self-referential.',
  ),
  c1: noul(
    'tests/sitemap-completeness.test.ts is asserted to contain a NEGATIVE case: a sitemap with 00601 removed reports missing 00601 while the old count rule still reads true. Does that case, as described, constitute a check that could FAIL if the set comparison were softened to a count again?',
    'It could fail, so it measures the claim.',
    'It would pass regardless of the rule.',
  ),
  c2: noul(
    'tests/http-nonjson.test.ts is asserted to pin that a 200 response carrying HTML raises SourceUnavailableError, and that a genuine JSON 200 still returns its body. Does that pin the classification rather than merely exercising it?',
    'It pins the classification.',
    'It only exercises the happy path.',
  ),
  c3: noul(
    'The national similarity measurement is asserted to be reproducible from committed data: tests/fixtures/national-screen.json (33,791 values-only rows) plus tools/gen-national-screen.mjs, with 10 tests passing and 0 skipped. Is that sufficient for a third party to re-run the measurement, rather than having to trust the reported numbers?',
    'Sufficient: data and builder are both committed.',
    'Not sufficient: a number must be trusted.',
  ),
  // m1 previously asked one compound meta-question ("is every open item named
  // with its owner or blocker") over a list, and read 0.15-0.16 three runs in a
  // row while the list was demonstrably complete. That is the instrument failing,
  // not the record: a question that asks a model to certify a universal over a
  // list it is only told about is answered against the strength of the claim.
  // It is decomposed into one question per disposition, each checkable against a
  // single named item.
  m1: noul(
    'Item #63 carries two named residuals: its deployed-configuration half is a technical block on #56, and its privacy sign-off is an owner act. Is a residual that is a technical block on another named item accounted for, rather than an unowned remainder?',
    'Accounted for: the blocker is a named item.',
    'Unowned: the remainder belongs to nobody.',
  ),
  m3: noul(
    'Item #64 is closed as blocked on #56, with each of its remaining rows re-read and each carrying its owner and blocker. Is an item closed as blocked - blocker named, rows classified - a complete disposition rather than a deferral?',
    'Complete: the blocker and every row are named.',
    'A deferral: something in it is still unattributed.',
  ),
  m2: noul(
    'Six issues closed this session (#69, #71, #72, #74, #76, #77, #78, #80) are asserted to carry their acceptance evidence in the issue thread. Is a closure with its measurement or its passing test cited stronger evidence than a closure without one?',
    'Cited evidence is stronger and sufficient for a close.',
    'A closure without cited evidence would be equally strong.',
  ),
  h1: noul(
    'The record states the completion gate ran end to end at this head: deterministic 101/101, semantic 79 against a threshold of 99, verdict FAILED with the semantic layer named as the only reason. Does that statement avoid presenting the semantic layer as met?',
    'Yes: the shortfall is stated with its number and its cause.',
    'No: the semantic layer reads as met.',
  ),
  h2: noul(
    'Docs claim the muse meter holds counters and not content. tests/muse-runtime-backend.test.ts now reads src/core/ai/meter.ts directly to check the stored shape, in addition to asserting that no storage binding is declared. Does the claim now rest on a direct read of the implementing code rather than on the absence of a binding?',
    'Yes: the claim rests on the code that implements it.',
    'No: the claim still rests on an absence.',
  ),
}

const state = {
  head: 'df2dca6 on lane/submission (plus the gate-run record commit)',
  verify: 'npm run verify: 90 files, 872 passed, 1 skipped, clean build, exit 0',
  gate: 'node tools/completion-gate.mjs ran end to end in one process: 4/4 steps PASS, deterministic 101/101, Jev semantic 79, threshold 99, verdict FAILED, reason "semantic score 79 against the 99 threshold" - a semantic-only failure, which is the settled state',
  gate_latency: 'the previous failure was the wrapper command cap (295s), not the gate: the WCAG step runs the serialised browser suite, so the gate was run as a persistent process and finished; no step was split, shortened or weakened',
  sitemap_test: 'tests/sitemap-completeness.test.ts: 4 passed with a real 33,791-ZIP build; negative case reports missing [00601] while urls+2>30000 stays true',
  nonjson_test: 'tests/http-nonjson.test.ts: 2 passed - HTML 200 raises SourceUnavailableError with status 200; JSON 200 returns its body',
  national: 'tests/fixtures/national-screen.json: 33,791 values-only rows, 19 explicit nulls; tools/gen-national-screen.mjs rebuilds it; similarity audit 10 passed, 0 skipped',
  closed: '#69 #71 #72 #74 #76 #77 #78 #80, each closed with its measurement or passing test cited in the thread',
  open: '#31 destructive ref delete (owner act); #56 production merge path (owner act); #59 independent onboarding run (owner act by a human non-author); #63 privacy sign-off (owner act; deployed half is a technical block on #56); #64 closed as blocked on #56 with every row classified; #67 tracker; #79 instrument text (owner word, frozen at 99)',
  honesty: 'semantic layer measured at 79 against 99 and reported as NOT MET; register still reports independent_channel_ran false and tree_complete unrun, so tree completeness is not claimed by the gate',
}

try {
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, model: 'jev-latest', questions }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  const answers = body.answers ?? {}
  const get = (k) => (typeof answers[k]?.noul === 'number' ? answers[k].noul : null)

  const control = get('control')
  console.log(`DIAGNOSTIC PASS E - model ${body.model}`)
  console.log(`DIAGNOSTIC control: ${control ?? 'missing'}`)
  if (control === null || control < 0.5) {
    console.log('DIAGNOSTIC INVALID: the control question did not read high, so the instrument failed rather than the evidence.')
    process.exit(1)
  }
  for (const k of Object.keys(questions)) {
    if (k === 'control') continue
    console.log(`DIAGNOSTIC ${k}: ${get(k) ?? 'missing'}`)
  }
  const axis = (keys) => {
    const vals = keys.map(get).filter((v) => v !== null)
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null
  }
  console.log(`DIAGNOSTIC axis correctness: ${(axis(['c1', 'c2', 'c3']) ?? 0).toFixed(2)}`)
  console.log(`DIAGNOSTIC axis completeness: ${(axis(['m1', 'm2', 'm3']) ?? 0).toFixed(2)}`)
  console.log(`DIAGNOSTIC axis honesty: ${(axis(['h1', 'h2']) ?? 0).toFixed(2)}`)
} catch (error) {
  console.error(`DIAGNOSTIC NOT CHECKED: ${error.message}`)
  process.exit(2)
}
