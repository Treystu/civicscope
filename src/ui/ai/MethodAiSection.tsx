import { METRIC_KEYS } from '../../core/civicscope-registry'
import { MUSE_SPARK_MODEL } from '../../core/ai/meta-client'
import {
  DISCLOSURE_TEXT,
  VALIDATOR_FAILURES,
  type ValidatorFailure,
} from '../../core/ai/validator'
import type { IntentMode } from '../../core/ai/provider'

/**
 * The AI-layer section of the methodology page, generated from the same
 * registry and closed unions the layer enforces at runtime.
 *
 * The metric count comes from METRIC_KEYS, the mode and withhold labels are
 * total Records over their unions, and the disclosure and model id are the
 * shipped constants. Adding a metric, a mode, or a validator class without
 * describing it here is a type error or a stale count, not a silently
 * hand-written paragraph. That is the same anti-drift rule the rest of this
 * page follows.
 */

const MODE_ORDER: readonly IntentMode[] = ['lookup', 'compare', 'sweep_filter', 'similarity']

const MODE_LABELS: Record<IntentMode, string> = {
  lookup: 'look up one place',
  compare: 'compare places',
  sweep_filter: 'filter the national screen',
  similarity: 'find ZIP codes similar to one you name',
}

const WITHHOLD_LABELS: Record<ValidatorFailure, string> = {
  intent_gate:
    'a filter, sort, or similarity request that names a key the fair-housing gate does not allow',
  invented_numeral: 'a number that is not among the figures on screen',
  precision: 'more decimal places than the shown figure carries',
  banned_construction: 'a ranking, recommendation, steering, or evaluative phrase',
}

function modeSentence(): string {
  const labels = MODE_ORDER.map((mode) => MODE_LABELS[mode])
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`
}

export function MethodAiSection() {
  return (
    <section aria-labelledby="ai-heading">
      <h2 id="ai-heading" className="section-title">
        AI search and Explain
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-700">
        <p>
          Ask CivicScope reads a typed English question into a structured request over the same{' '}
          <strong>{METRIC_KEYS.length} figures</strong> listed above. It can {modeSentence()}.
          The parsed request is shown as editable chips before anything runs.
        </p>
        <p>
          The wording model is <code>{MUSE_SPARK_MODEL}</code>, called through this site&rsquo;s
          same-origin <code>/api/muse</code> routes. It writes prose; it does not supply figures.
          Every number shown beside an explanation is computed by the app from the published
          source.
        </p>
        <p>
          Before any model wording is displayed, it is checked against the figures on screen.
          Wording is withheld when it contains:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {VALIDATOR_FAILURES.map((failure) => (
            <li key={failure}>{WITHHOLD_LABELS[failure]}</li>
          ))}
        </ul>
        <p>
          A withheld answer shows the plain figures and a note that wording was withheld, never
          the failed prose.
        </p>
        <p>Every displayed explanation carries this disclosure: {DISCLOSURE_TEXT}</p>
        <p>
          Ask is typed only. This build has no microphone, recording, or transcription interface,
          and the browser permission policy keeps the microphone closed.
        </p>
        <p>
          A typed question leaves the browser as text for the same-origin AI route, which
          forwards it to Meta&rsquo;s API to be parsed. Explain sends the figures the view already
          shows, not the question. Counts of failures and withholds stay in this browser and can
          be exported from the diagnostics panel below.
        </p>
      </div>
    </section>
  )
}
