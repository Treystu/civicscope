/**
 * Register-independent completeness probe - DIAGNOSTIC ONLY.
 *
 * Issue #80's finding is that the completion gate's semantic register is
 * operator-authored and menu-bound: it can score whether a listed aspect was
 * delivered, and it cannot find a property the menu never asks about. The gate
 * says so itself in its own caveat (`independent_channel_ran: false`,
 * `tree_complete: 'unrun'`).
 *
 * This probe is the additive cure approved by default under the gate-first rule:
 * one open-ended question, asked beside the scored run and never inside it. It
 * does not read or write the gate's score, the fourteen clause texts, the
 * weights, or the 99 threshold. It exits non-zero on any failure, and a failure
 * is reported as NOT CHECKED rather than as a clean result - an absence of
 * finding is not proof of completeness, and this file must never be read as one.
 *
 * What it asks: name a property that the record asserts and that the register's
 * own question set never asks about. The answer is a hypothesis list for a human
 * to check against the tree, which is the most a single judge call can honestly
 * produce here.
 *
 * Usage:
 *   node tools/register-probe.mjs            # reads gate-report.json if present
 *   node tools/register-probe.mjs dossier.json
 *
 * Output is labelled DIAGNOSTIC on every line that carries a result, so it
 * cannot be mistaken for a scored reading when quoted out of context.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Same resolution order as the gate, so the probe uses the same key or none. */
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
    /* unreadable config is not fatal; the probe reports NOT CHECKED */
  }
  return undefined
}

const statePath = process.argv[2] ?? join(process.cwd(), 'gate-report.json')
if (!existsSync(statePath)) {
  console.error(
    `DIAGNOSTIC NOT CHECKED: no dossier at ${statePath}. Run the completion gate first, ` +
      'or pass the path to a dossier JSON file.',
  )
  process.exit(2)
}

let state
try {
  state = JSON.parse(readFileSync(statePath, 'utf8'))
} catch (error) {
  console.error(`DIAGNOSTIC NOT CHECKED: ${statePath} is not valid JSON (${error.message})`)
  process.exit(2)
}

const key = readJevKey()
if (!key) {
  console.error(
    'DIAGNOSTIC NOT CHECKED: no TYPESAFE_API_KEY on this surface. This probe is not a ' +
      'deterministic check and cannot run without the keyed channel; it will not report a ' +
      'clean result it did not measure.',
  )
  process.exit(2)
}

const questions = {
  unasked_property: {
    type: 'choice',
    instructions:
      'Read `deliverable_summary`, `known_limitations` and `deterministic_results`. The ' +
      'completion gate asks a fixed menu of questions and therefore cannot notice a property ' +
      'it never asks about. Name ONE property the record asserts as delivered that the gate ' +
      'menu does not ask about, choosing the most significant such omission; choose `none` ' +
      'only if every asserted property has a corresponding menu question.',
    criteria: {
      none: 'Every property the record asserts is covered by one of the gate questions',
      unasked_gi: 'Something the record asserts about geography or coverage has no gate question',
      unasked_ai: 'Something the record asserts about the AI layer has no gate question',
      unasked_data: 'Something the record asserts about data sourcing or vintage has no gate question',
      unasked_claims: 'Something the record asserts about product behaviour or deployment has no gate question',
    },
  },
}

try {
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, model: 'jev-latest', questions }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const body = await res.json()
  const answer = body.answers?.unasked_property
  console.log(`DIAGNOSTIC - register-independent probe (not a scored reading)`)
  console.log(`DIAGNOSTIC model: ${body.model} - ${body.usage?.input_tokens ?? '?'} in / ${body.usage?.output_tokens ?? '?'} out`)
  console.log(`DIAGNOSTIC unasked property: ${answer?.choice ?? '(no answer)'} (confidence ${answer?.confidence ?? '?'})`)
  console.log(
    `DIAGNOSTIC note: a hypothesis list for a human to check against the tree. ` +
      `An absence of finding here is NOT proof that the tree is complete.`,
  )
} catch (error) {
  console.error(`DIAGNOSTIC NOT CHECKED: judge call failed (${error.message})`)
  process.exit(2)
}
