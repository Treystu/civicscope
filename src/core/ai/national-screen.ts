/**
 * The placeless screen: what a question that names no place may be answered with.
 *
 * Every other lane in `ai/` starts from a place - a lookup, a comparison, a
 * sweep filter all presuppose that the reader has named where they mean. This is
 * the lane for the reader who has not: "how many renters are there", "is rent
 * burden worse than it used to be" - a question the tool can answer for the
 * country, if the country-wide screen carries the figure.
 *
 * Deterministic on purpose. It reads the registry for the figures it may offer and
 * nothing else: no model, no network, no key. That is what lets it run while every
 * provider is down, and it is what lets a refusal be a rule instead of a guess.
 *
 * Three outcomes, and the refusals are the interesting half:
 *
 * - `answer_national`: the question names a figure the registry holds, so the
 *   national screen can answer it. The screen reports medians over the ZCTAs that
 *   carry a figure, which is why it can only promise a national reading of the
 *   figures listed here, not a total or an average.
 * - `has_place`: the question names a place, so this is the wrong lane and it says
 *   so rather than answering nationally about a place the reader asked about.
 * - `refuse`: the question asks the tool to rank places, to characterise who lives
 *   in them, or about something the registry does not publish. Ranking is refused
 *   for the reason the Fair Housing notice gives - "which place is best for me" is
 *   a steering statement - and a protected-class question is refused because the
 *   only way to answer it is with a proxy characterisation of residents.
 *
 * The figure table is phrase-to-key, most specific first, because the labels in the
 * registry are written for a table header and not for the way a person asks: the
 * label "Median rent as share of income" appears in no question, while "rent
 * burden" appears in many. Every pattern here is a phrase the registry's own
 * vocabulary can honour; nothing is offered that the registry does not publish.
 */
import { METRIC_DEFS } from '../civicscope-registry'
import { STATE_NAMES } from '../sweep/chunk'

/** A registry figure that answers a national question, with why it answers it. */
export interface NationalFigure {
  key: string
  label: string
  unit: string
  /** The phrase in the question that selected this figure. */
  why: string
}

export type NationalRefusal = 'steering' | 'protected_class' | 'not_in_registry'

export type NationalScreenDecision =
  | { decision: 'answer_national'; figures: NationalFigure[]; note: string }
  | { decision: 'has_place'; place: string }
  | { decision: 'refuse'; refusal: NationalRefusal; reason: string }

interface PhraseRule {
  pattern: RegExp
  keys: readonly string[]
  /**
   * A rule whose phrase is also satisfied by a more specific one.
   *
   * Two of these were found by a test rather than by reading: "what is the rent
   * burden" matched the bare rent rule as well and came back with two figures, and
   * "average household" matched the count of households rather than the household
   * size. Both are the same defect - a general phrase answering a specific question
   * - so the general rules only speak when no specific rule has, instead of each
   * collision being patched with its own lookbehind.
   */
  generic?: boolean
}

/*
 * Most specific first: "rent burden" before "rent", "household size" before
 * "households". A general rule placed first would answer "how big is the average
 * household" with a count of households, which is not the same question.
 */
const PHRASE_RULES: readonly PhraseRule[] = [
  { pattern: /\brent\s+burden\b|\brent\s+as\s+(?:a\s+)?(?:share|percent\w*)\s+of\s+income\b/, keys: ['median_rent_burden_pct'] },
  { pattern: /\b(?:gross\s+)?rent\b|\bmonthly\s+rent\b/, keys: ['median_gross_rent'], generic: true },
  { pattern: /\bhome\s+(?:value|values|price|prices)\b|\bhouse\s+(?:value|values|price|prices)\b/, keys: ['median_home_value'] },
  { pattern: /\b(?:household\s+)?income\b|\bearnings?\b/, keys: ['median_household_income'] },
  { pattern: /\bhousehold\s+size\b|\bpeople\s+per\s+household\b|\baverage\s+household\b/, keys: ['average_household_size'] },
  { pattern: /\bmedian\s+age\b|\baverage\s+age\b|\bhow\s+old\b/, keys: ['median_age'] },
  { pattern: /\bpoverty\b|\bpoor\b|\bbelow\s+the\s+poverty\b/, keys: ['below_poverty_count'] },
  { pattern: /\bbachelor\w*\b|\bcollege\s+degree\w*\b|\bdegree\s+holders?\b/, keys: ['bachelors_count'] },
  { pattern: /\bno\s+internet\b|\binternet\s+access\b|\bwith\s+internet\b|\bbroadband\b/, keys: ['no_internet_access'] },
  { pattern: /\bcommut(?:e|ers?|ing)\b/, keys: ['commuting_workers'] },
  { pattern: /\bvacan(?:t|cy)\b|\bempty\s+homes?\b/, keys: ['vacant_units'] },
  { pattern: /\brenters?\b|\brenter[- ]occupied\b|\brenting\b/, keys: ['renter_occupied'] },
  { pattern: /\bowners?\b|\bowner[- ]occupied\b|\bhomeowners?\b/, keys: ['owner_occupied'] },
  { pattern: /\bpopulation\b|\bhow\s+many\s+people\b|\bresidents\b/, keys: ['population'], generic: true },
  { pattern: /\bhouseholds?\b|\bhousing\s+units?\b/, keys: ['households'], generic: true },
]

/*
 * Refusals, both of them rules rather than judgements about a particular ask.
 *
 * The steering list is the vocabulary of the question the Fair Housing notice
 * exists to warn about: asking the tool to choose a place for someone is the one
 * thing a housing data tool must not do, and the national screen is where that
 * question arrives most often, because it is the question that names no place.
 */
const STEERING_PATTERNS: readonly RegExp[] = [
  /\bbest\b|\bworst\b/,
  /\bshould\s+(?:i|we)\b|\bworth\s+(?:moving|buying|investing)\b/,
  /\brecommend\w*\b|\bsuggest\w*\b/,
  /\bsafe(?:st|r)?\b|\bdangerous\b/,
  /\brank\w*\b|\btop\s+\d+\b|\bcompare\s+cities\b/,
  /\bgood\s+(?:place|area|neighbou?rhood|school)\b/,
]

const PROTECTED_CLASS_PATTERNS: readonly RegExp[] = [
  /\brace\b|\bracial\b|\bethnic\w*\b/,
  /\breligio\w*\b|\bchurch\b|\bmosque\b|\bsynagogue\b/,
  /\bnational\s+origin\b|\bimmigrants?\b|\bimmigration\b/,
  /\bdisabilit\w*\b|\bdisabled\b/,
  /\bfamilial\s+status\b|\bchildren\s+in\s+the\s+area\b/,
  /\bsex\b|\bgender\b|\bsexual\s+orientation\b/,
]

function normalise(question: string): string {
  return question.toLowerCase().replace(/\s+/g, ' ').trim()
}

function figure(key: string, why: string): NationalFigure | null {
  const definition = METRIC_DEFS.find((metric) => metric.key === key)
  if (!definition) return null
  return { key: definition.key, label: definition.label, unit: definition.unit, why }
}

/**
 * Finds a place named in the question, if there is one.
 *
 * Two forms only, both unambiguous: a five-digit ZIP code, and a state name from
 * the one list this tree already trusts. City names are deliberately not matched,
 * because "in Austin" and "in Austin County" are different places and a substring
 * match would answer the second about the first.
 */
export function namedPlace(question: string): string | null {
  const text = normalise(question)
  const zip = text.match(/\b\d{5}\b/)
  if (zip) return zip[0]
  for (const name of Object.values(STATE_NAMES)) {
    const pattern = new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (pattern.test(text)) return name
  }
  return null
}

/** The national screen's decision for a question that names no place. */
export function screenNationalQuestion(question: string): NationalScreenDecision {
  const text = normalise(question)

  if (!text) {
    return {
      decision: 'refuse',
      refusal: 'not_in_registry',
      reason: 'the question is empty, so there is nothing to answer',
    }
  }

  for (const pattern of STEERING_PATTERNS) {
    if (pattern.test(text)) {
      return {
        decision: 'refuse',
        refusal: 'steering',
        reason:
          'this asks which place is best, which is a steering statement about where someone should live rather than a figure; the tool does not rank places',
      }
    }
  }

  for (const pattern of PROTECTED_CLASS_PATTERNS) {
    if (pattern.test(text)) {
      return {
        decision: 'refuse',
        refusal: 'protected_class',
        reason:
          'the only way to answer this is to characterise residents by a protected class, which the Fair Housing Act forbids and this tool will not do',
      }
    }
  }

  const place = namedPlace(text)
  if (place) {
    return { decision: 'has_place', place }
  }

  const specific: NationalFigure[] = []
  const generic: NationalFigure[] = []
  const add = (into: NationalFigure[], key: string, why: string) => {
    if (specific.some((seen) => seen.key === key) || generic.some((seen) => seen.key === key)) return
    const resolved = figure(key, why)
    if (resolved) into.push(resolved)
  }
  for (const rule of PHRASE_RULES) {
    const hit = text.match(rule.pattern)
    if (!hit) continue
    for (const key of rule.keys) add(rule.generic ? generic : specific, key, hit[0])
  }
  const figures = specific.length ? specific : generic
  const matched = figures.map((entry) => entry.label)

  if (!figures.length) {
    return {
      decision: 'refuse',
      refusal: 'not_in_registry',
      reason:
        'no figure in the registry answers this, so a national reading of it would have to come from somewhere other than the published data',
    }
  }

  return {
    decision: 'answer_national',
    figures,
    note: `The country-wide screen reports the median of ${matched.join(', ')} over the ZIP codes that carry a figure, in the request chunks the Census API accepts - a national reading of a published figure, not a mean of every area and not a total.`,
  }
}
