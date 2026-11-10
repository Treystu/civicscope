/**
 * The completion gate's final decision, as a pure function.
 *
 * Extracted from `tools/completion-gate.mjs` because it could not be measured
 * there. The gate computed `overall` and `passed` in two expressions at the end
 * of a 1,800-line script, so the only way to ask "does a failing run read as
 * failing?" was to break something real and run the whole suite. That is why two
 * reporting defects survived in it, both found by calling the expression with
 * synthetic inputs on 2026-11-10:
 *
 *   1. A keyless run (the semantic layer never ran) reported `Overall: 100/100`
 *      and "GATE PASSED". 100 is the maximum possible score, printed for a run
 *      in which the 99-threshold criterion was never measured. Every CI run of
 *      the gate is keyless, so every CI green carried that claim.
 *   2. A run whose deterministic layer failed with a high semantic score
 *      reported `Overall: 98.9`, substituting a fabricated number for the
 *      measured one (99.6 in the case tested). A run with a semantic *error*
 *      reported `0` - a score for a layer that produced none.
 *
 * The repair reports what was measured and nothing else. What it does NOT
 * change, deliberately: the threshold (99), the weights, the criteria, and which
 * runs pass. A deterministic-only run still passes on its deterministic evidence
 * - that is this project's standing arrangement, since CI holds no Jev key - but
 * it now says the semantic criterion was NOT MEASURED rather than claiming a
 * perfect score it never earned.
 *
 * Fail-closed on the degenerate cases, because a run that measured nothing
 * reporting a pass is the same defect in a different place: an empty result set
 * is not a passing result set, and a semantic score that is absent, non-numeric
 * or non-finite is an unmeasured layer, never a zero.
 */

export const DEFAULT_THRESHOLD = 99

/**
 * Decide a gate run.
 *
 * @param {object} input
 * @param {Array<{ok: boolean, label: string}>} input.deterministic every check this run added
 * @param {null | {score?: number, error?: string}} input.jev null when the semantic layer was skipped
 * @param {number} [input.threshold] the pass threshold; 99 unless a caller overrides it for a probe
 * @returns {{
 *   threshold: number,
 *   checks: number,
 *   checksPassed: number,
 *   deterministicOk: boolean,
 *   semantic: 'measured' | 'skipped' | 'error',
 *   score: number | null,
 *   overall: number | null,
 *   thresholdMet: boolean | null,
 *   passed: boolean,
 *   verdict: 'PASSED' | 'FAILED',
 *   reason: string,
 * }}
 */
export function decideGate({ deterministic, jev, threshold = DEFAULT_THRESHOLD }) {
  const checks = Array.isArray(deterministic) ? deterministic : []
  const total = checks.length
  // Strictly `true`, not truthy, and a run with no checks at all is a failure:
  // `passed === total` alone is satisfied by 0 === 0.
  const passedChecks = checks.filter((c) => c && c.ok === true).length
  const deterministicOk = total > 0 && passedChecks === total

  let semantic = 'measured'
  let score = null
  let reason = ''

  if (jev === null || jev === undefined) {
    semantic = 'skipped'
    reason = 'the semantic layer was skipped (no TYPESAFE_API_KEY), so the 99-threshold criterion was not measured'
  } else if (jev.error) {
    semantic = 'error'
    reason = `the semantic layer failed: ${jev.error}`
  } else if (typeof jev.score === 'number' && Number.isFinite(jev.score)) {
    score = jev.score
    reason = `semantic score ${score} against the ${threshold} threshold`
  } else {
    // A present-but-unscored result is not a zero: it is an unmeasured layer.
    semantic = 'error'
    reason = 'the semantic layer returned no numeric score, so the 99-threshold criterion was not measured'
  }

  // The reported number is the measured score, never a substitute. A run with no
  // measured score reports null and says why.
  const overall = semantic === 'measured' ? score : null
  const thresholdMet = semantic === 'measured' ? score >= threshold : null

  // Pass semantics unchanged from the instrument this replaces: the deterministic
  // layer always gates, and the semantic layer gates only when it ran.
  const passed =
    deterministicOk && (semantic === 'skipped' ? true : semantic === 'measured' && score >= threshold)

  if (!deterministicOk) {
    reason = `${passedChecks}/${total} deterministic checks passed${reason ? `; ${reason}` : ''}`
  }

  return {
    threshold,
    checks: total,
    checksPassed: passedChecks,
    deterministicOk,
    semantic,
    score,
    overall,
    thresholdMet,
    passed,
    verdict: passed ? 'PASSED' : 'FAILED',
    reason,
  }
}
