/**
 * Flexible completion: the one terminal the strict lane cannot answer.
 *
 * The strict lane stays the default for every question the Census registry can
 * serve. Its single unanswerable terminal is research mismatch - the parse
 * succeeded and the research named places, but none of those names resolved to
 * a Census place in the loaded data - where the honest answer is a note.
 *
 * This module is the shared surface for completing that terminal and no other:
 * the legal fall-through reasons, the typed evidence classes, the closed-schema
 * parse of a draft reply, and the deterministic verification that decides
 * whether a draft may render at all. It deliberately contains no provider call,
 * no key, and no prose of its own: the orchestration belongs to the caller.
 *
 * Written from the recorded behaviour of the hackathon lineage
 * (musehackathon@9403faa: src/core/ai/flexible.ts) rather than transplanted
 * from it, per the 2026-11-13 unification decision K1.
 */
import { realValidator, type FigureForValidation } from './validator'

/* ------------------------------------------------------------------ */
/* Fall-through                                                        */
/* ------------------------------------------------------------------ */

export type FallThroughReason = 'empty_parse' | 'no_census_match'

export const FALL_THROUGH_REASONS: readonly FallThroughReason[] = [
  'empty_parse',
  'no_census_match',
]

export interface ParseObservation {
  /** The parsed intent, or null when the parse produced nothing usable. */
  intent: unknown | null
  /** Number of places the screen matched, or null when no screen ran. */
  censusMatchCount: number | null
}

/**
 * The single decision point. Returns a reason only in the two legal cases; a
 * provider failure, a safety refusal and a screen that ran and matched are all
 * `null`, so they keep their own strict-lane behaviour rather than being
 * absorbed into the flexible lane.
 */
export function fallThroughReason(o: ParseObservation): FallThroughReason | null {
  if (o.intent === null || o.intent === undefined) return 'empty_parse'
  if (o.censusMatchCount === 0) return 'no_census_match'
  return null
}

/* ------------------------------------------------------------------ */
/* Evidence classes                                                    */
/* ------------------------------------------------------------------ */

export type EvidenceClass = 'census_measured' | 'research_named' | 'model_knowledge'

export const EVIDENCE_CLASSES: readonly EvidenceClass[] = [
  'census_measured',
  'research_named',
  'model_knowledge',
]

/**
 * Rendered beside the content itself, in plain words. A reader must never have
 * to infer which parts were measured and which came from the model, so an
 * unlabelled figure is not representable: the type has no class for it.
 */
export const EVIDENCE_CLASS_LABELS: Readonly<Record<EvidenceClass, string>> = {
  census_measured: 'measured from the Census figures shown here',
  research_named: 'named by the cited research, not measured by Census',
  model_knowledge: "the model's own knowledge, not verified against a source",
}

export interface ScreenedRow {
  key: string
  value: number | null
  marginOfError?: number
}

export interface FlexibleFigure {
  key: string
  value: number | null
  marginOfError?: number
  evidence: EvidenceClass
  /** Required in substance for `census_measured`: the row this figure is. */
  screenedRow?: ScreenedRow
}

export interface FlexiblePlace {
  name: string
  evidence: EvidenceClass
}

export interface FlexibleAnswer {
  criteria: string[]
  figures: FlexibleFigure[]
  places: FlexiblePlace[]
  prose: string
  gaps: string[]
}

/* ------------------------------------------------------------------ */
/* Closed-schema parse                                                 */
/* ------------------------------------------------------------------ */

export type FlexibleFailure =
  | 'empty_answer'
  | 'missing_evidence_class'
  | 'unknown_evidence_class'
  | 'census_figure_not_screened'
  | 'census_figure_not_equal'
  | 'research_place_not_named'
  | 'validator_withheld'

export type FlexibleVerdict =
  | { ok: true; answer: FlexibleAnswer }
  | { ok: false; failure: FlexibleFailure; detail: string }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isEvidenceClass(v: unknown): v is EvidenceClass {
  return typeof v === 'string' && (EVIDENCE_CLASSES as readonly string[]).includes(v)
}

function parseFigure(raw: unknown): FlexibleFigure | null {
  if (!isRecord(raw)) return null
  if (typeof raw.key !== 'string') return null
  const value = typeof raw.value === 'number' ? raw.value : null
  const moe = typeof raw.marginOfError === 'number' ? raw.marginOfError : undefined
  const evidence = isEvidenceClass(raw.evidence) ? raw.evidence : undefined
  const rowRaw = isRecord(raw.screenedRow) ? raw.screenedRow : null
  const screenedRow =
    rowRaw && typeof rowRaw.key === 'string'
      ? {
          key: rowRaw.key,
          value: typeof rowRaw.value === 'number' ? rowRaw.value : null,
          marginOfError:
            typeof rowRaw.marginOfError === 'number' ? rowRaw.marginOfError : undefined,
        }
      : undefined
  // A figure without a class is kept so verification can refuse it by name;
  // dropping it here would silently shorten the answer instead.
  return {
    key: raw.key,
    value,
    ...(moe !== undefined ? { marginOfError: moe } : {}),
    evidence: (evidence ?? (undefined as unknown)) as EvidenceClass,
    ...(screenedRow ? { screenedRow } : {}),
  }
}

/**
 * Closed schema: unknown top-level fields are ignored rather than forwarded,
 * and every accepted field is rebuilt from primitives. A reply that is not
 * this shape is `null` - never a partially parsed answer.
 */
export function parseFlexibleDraft(body: unknown): FlexibleAnswer | null {
  if (!isRecord(body)) return null
  const criteria = body.criteria
  const placesRaw = body.places
  const figuresRaw = body.figures
  const gapsRaw = body.gaps
  if (!Array.isArray(criteria) || !criteria.every((c) => typeof c === 'string')) return null
  if (typeof body.prose !== 'string') return null
  if (!Array.isArray(placesRaw)) return null
  if (!Array.isArray(figuresRaw)) return null
  if (!Array.isArray(gapsRaw) || !gapsRaw.every((g) => typeof g === 'string')) return null

  const places: FlexiblePlace[] = []
  for (const p of placesRaw) {
    if (!isRecord(p) || typeof p.name !== 'string') return null
    places.push({
      name: p.name,
      evidence: (isEvidenceClass(p.evidence) ? p.evidence : undefined) as EvidenceClass,
    })
  }
  const figures: FlexibleFigure[] = []
  for (const f of figuresRaw) {
    const parsed = parseFigure(f)
    if (!parsed) return null
    figures.push(parsed)
  }
  return { criteria, figures, places, prose: body.prose, gaps: gapsRaw }
}

/* ------------------------------------------------------------------ */
/* Deterministic verification                                          */
/* ------------------------------------------------------------------ */

function normalisePlace(name: string): string {
  return name.trim().toLowerCase()
}

function figuresForValidator(answer: FlexibleAnswer): FigureForValidation[] {
  return answer.figures
    .filter((f) => f.value !== null)
    .map((f) => ({
      key: f.key,
      value: f.value,
      ...(f.marginOfError !== undefined ? { marginOfError: f.marginOfError } : {}),
    }))
}

/**
 * The gate between a draft and the screen. Fail-closed: any refusal means the
 * strict lane's honest note stands, and no partial answer is rendered.
 */
export function verifyFlexibleAnswer(
  answer: FlexibleAnswer,
  researchNames: readonly string[],
): FlexibleVerdict {
  if (
    answer.figures.length === 0 &&
    answer.places.length === 0 &&
    answer.prose.trim() === ''
  ) {
    return { ok: false, failure: 'empty_answer', detail: 'no figures, places or prose' }
  }

  for (const f of answer.figures) {
    if (!isEvidenceClass(f.evidence)) {
      return {
        ok: false,
        failure: 'missing_evidence_class',
        detail: `figure ${f.key || '(unnamed)'} has no evidence class`,
      }
    }
    if (f.evidence === 'census_measured') {
      if (!f.screenedRow) {
        return {
          ok: false,
          failure: 'census_figure_not_screened',
          detail: `figure ${f.key} is census_measured with no screened row`,
        }
      }
      if (f.screenedRow.key !== f.key) {
        return {
          ok: false,
          failure: 'census_figure_not_screened',
          detail: `figure ${f.key} cites screened row ${f.screenedRow.key}`,
        }
      }
      if (f.screenedRow.value !== f.value) {
        return {
          ok: false,
          failure: 'census_figure_not_equal',
          detail: `figure ${f.key} states ${String(f.value)} but the screened row is ${String(f.screenedRow.value)}`,
        }
      }
    }
  }

  const named = new Set(researchNames.map(normalisePlace))
  for (const p of answer.places) {
    if (!isEvidenceClass(p.evidence)) {
      return {
        ok: false,
        failure: 'missing_evidence_class',
        detail: `place ${p.name || '(unnamed)'} has no evidence class`,
      }
    }
    if (p.evidence === 'research_named' && !named.has(normalisePlace(p.name))) {
      return {
        ok: false,
        failure: 'research_place_not_named',
        detail: `place ${p.name} is research_named but the research did not name it`,
      }
    }
  }

  const verdict = realValidator.validate(answer.prose, figuresForValidator(answer))
  if (!verdict.pass) {
    return {
      ok: false,
      failure: 'validator_withheld',
      detail: `${verdict.failure}: ${verdict.detail}`,
    }
  }

  return { ok: true, answer }
}
