/**
 * Live Jev stage-gate probe.
 *
 * This is the evidence that the stage gates read a live judge rather than a
 * fixture: it prints the model string the provider itself returned, which a
 * hardcoded value cannot produce, and it reports the per-stage verdicts the
 * judge gave for a state describing this build.
 *
 * Skipped, not passed, when no key is configured. The key is read from the
 * environment first and from the user-level configuration second, is never
 * printed, and is never stored.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  STAGE_GATE_STAGES,
  createLiveJudgeTransport,
  runStageGates,
} from '../core/ai/stage-gates'

function readKey(): string | null {
  const fromEnv = process.env.TYPESAFE_API_KEY
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()
  try {
    const path = join(homedir(), '.config', 'harness', 'jev.env')
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(TYPESAFE_API_KEY|HARNESS_JEV_KEY)\s*=\s*(.*)\s*$/.exec(line)
      const value = m?.[2]
      if (value) return value.trim()
    }
  } catch {
    return null
  }
  return null
}

const KEY = readKey()

describe.skipIf(!KEY)('live Jev stage gates', () => {
  it(
    'obtains all three stage verdicts from a live judge and reports its model',
    async () => {
      const transport = createLiveJudgeTransport({ apiKey: KEY as string })
      const verdicts = await runStageGates({
        state: [
          'CivicScope is a free, client-side US housing and neighbourhood data site.',
          'The strict lane parses an intent, screens Census data, composes, and validates in code.',
          'A flexible completion lane exists for exactly two terminals: an empty parse, or a',
          'screen that matched zero places. Every figure it shows carries one of three evidence',
          'classes, and a draft that fails deterministic verification does not render.',
        ].join('\n'),
        transport,
      })

      const model = verdicts.find((v) => v.model)?.model ?? null
      console.log(
        `[live jev stage gates] model=${model} ` +
          verdicts.map((v) => `${v.stage}=${v.status}(${v.probability ?? 'n/a'})`).join(' '),
      )

      expect(model).toMatch(/^jev-/)
      expect(verdicts).toHaveLength(STAGE_GATE_STAGES.length)
      // A live judge must answer; 'unavailable' here means the probe did not run.
      for (const v of verdicts) expect(v.status).not.toBe('unavailable')
    },
    60_000,
  )
})

// The skip is deliberate and is stated rather than silent.
if (!KEY) {
  // eslint-disable-next-line no-console
  console.log('[live jev stage gates] skipped: no TYPESAFE_API_KEY in env or user config')
}
