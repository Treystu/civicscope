/**
 * PASS E evidence-rating probe (one question per axis), diagnostic only.
 *
 * Built because this lane's semantic readings were believed to require CI, and
 * that belief was wrong on this machine (see #80). The three axes are the ones
 * the standing prompt names: correctness, completeness, honesty of the record.
 *
 * It is a hypothesis generator, not a verdict: every reading is reported with
 * its confidence, and a low-confidence reading is filed as an investigation, not
 * as a finding. Nothing here touches the frozen gate or its threshold.
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

const state = {
  evidence_artifacts:
    'tests/sitemap-completeness.test.ts (4 passed incl. negative case); tests/similarity-audit.test.ts (10 passed, 0 skipped, national corpus); tests/http-nonjson.test.ts (2 passed); audit suites 32 passed; docs/champion-audit-69-similarity.md carries the measured table; docs/privacy-verification-checklist.md carries 15 rows with observed evidence',
  reproducible_commands:
    'npm run verify (89 files, 868 passed); npx vitest run tests/similarity-audit.test.ts; node tools/emoji-scan.mjs . (0/258); node tools/mojibake-scan.mjs . (0/310)',
  head: 'e867ce7 on lane/submission',
  deterministic_layer: 'settled 101/101; npm run verify = 89 test files, 868 passed, clean build, exit 0',
  audit_suites: 'tests/http-retry-audit, place-ranking-audit, minimum-n-audit, cache-freshness-audit, similarity-audit: 32 tests passed',
  sitemap_check: 'compares the served sitemap to the committed ZIP index as a set; 4 tests pass including the missing-00601 negative case',
  national_corpus: 'tests/fixtures/national-screen.json: 33,791 values-only ACS rows, 19 explicit nulls, ZIP set equals the committed index',
  closed_this_session: '#69, #72, #74, #76, #77, #78 - each with the measurement or cure attached',
  open_issues: '#31, #56, #59, #63, #64, #67 (tracker), #71, #79, #80',
  owner_reserved: '#79 clause_7 text; #56 production merge path; #31 destructive ref delete; #71 live window',
  honesty_notes:
    'gate semantic score has no run on this head; the register still reports independent_channel_ran: false and tree_complete: unrun; the probe reading was unasked_data at 0.3 confidence',
}

const questions = {
  correctness: {
    type: 'noul',
    instructions:
      'Given `deterministic_layer`, `audit_suites`, `sitemap_check` and `national_corpus`, how completely does the evidence establish that what this repository claims to measure is correct, rather than merely passing?',
    criteria: { true: 'Correctness is established by measurement that can disagree with the claim.', false: 'Correctness rests on checks that could pass while the claim is wrong.' },
  },
  completeness: {
    type: 'noul',
    instructions:
      'Given `closed_this_session`, `open_issues` and `owner_reserved`, how completely does the record establish that the work is complete rather than deferred - with deferrals named and owned?',
    criteria: { true: 'Every remaining item is either closed on evidence or named with its owner.', false: 'Work is described as done without evidence, or deferrals are unowned.' },
  },
  honesty: {
    type: 'noul',
    instructions:
      'Given `honesty_notes` and the rest of the state, how completely does the record avoid claiming more than was measured?',
    criteria: { true: 'Claims are bounded by what was run, and unmeasured properties are labelled unmeasured.', false: 'A claim exceeds its evidence, or an unmeasured property is presented as verified.' },
  },
}

try {
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, model: 'jev-latest', questions }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  console.log(`DIAGNOSTIC PASS E - model ${body.model}`)
  for (const axis of Object.keys(questions)) {
    const a = body.answers?.[axis]
    console.log(`DIAGNOSTIC ${axis}: ${a?.noul ?? '(no answer)'} (confidence ${a?.confidence ?? '?'})`)
  }
} catch (error) {
  console.error(`DIAGNOSTIC NOT CHECKED: ${error.message}`)
  process.exit(2)
}
