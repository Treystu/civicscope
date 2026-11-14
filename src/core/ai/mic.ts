/**
 * Voice input's pure logic: consent state, transcript assessment, and spoken
 * numbers.
 *
 * This is deliberately the part that touches no microphone. `functions/api/muse/transcribe.ts`
 * is an inert shell on purpose - "Item 12 remains planned-only: the independent-run
 * bar is AWAITING, so no microphone UI, consent, or CSP change ships" - so what ships
 * here is the logic that a future mic surface will call, with no CSP change, no
 * permission prompt, no provider call, and no dead button. Keeping the decision rules
 * in a pure module is also what makes them testable: a consent transition and a spoken
 * ZIP are exactly the things that cannot be checked by pressing a button.
 *
 * Three rules the module exists to hold:
 *
 * 1. Consent is never assumed and never sticky-by-accident. It begins at `idle`, moves
 *    to `requested` only when the reader has asked for voice, and reaches `granted`
 *    only through an explicit answer. A denial is final until the reader resets it, so
 *    a reader who said no is not asked again by a later render.
 * 2. A transcript is assessed before it is used. Silence, a single syllable and pure
 *    filler are not questions, and treating them as one turns a misheard fragment into
 *    a search nobody asked for.
 * 3. A spoken number is only accepted when it is unambiguous. "seven eight seven zero
 *    one" is a ZIP; five digits is a ZIP; "seven eight seven" is not a ZIP and is
 *    refused rather than zero-padded into one.
 */

/** Where the reader is in the microphone-permission conversation. */
export type ConsentState = 'idle' | 'requested' | 'granted' | 'denied'

export type ConsentEvent = 'ask' | 'allow' | 'decline' | 'reset'

export type ConsentResult =
  | { ok: true; state: ConsentState }
  | { ok: false; state: ConsentState; reason: string }

/**
 * Transitions, as a table rather than a chain of ifs, so an illegal move is a
 * refusal with a state attached instead of a silent no-op.
 */
const CONSENT_TRANSITIONS: Record<ConsentState, Partial<Record<ConsentEvent, ConsentState>>> = {
  idle: { ask: 'requested' },
  requested: { allow: 'granted', decline: 'denied' },
  granted: { reset: 'idle' },
  denied: { reset: 'idle' },
}

export function consentStep(state: ConsentState, event: ConsentEvent): ConsentResult {
  const next = CONSENT_TRANSITIONS[state]?.[event]
  if (!next) {
    return { ok: false, state, reason: `cannot ${event} while consent is ${state}` }
  }
  return { ok: true, state: next }
}

/** True only when the reader has actually granted permission. */
export function mayListen(state: ConsentState): boolean {
  return state === 'granted'
}

export type TranscriptProblem = 'empty' | 'too_short' | 'filler_only' | 'too_long'

export type TranscriptAssessment =
  | { usable: true; text: string; words: number }
  | { usable: false; problem: TranscriptProblem; reason: string }

/** Words a transcript can consist of and still carry no question at all. */
const FILLER = new Set([
  'um',
  'uh',
  'erm',
  'hmm',
  'mm',
  'ah',
  'eh',
  'oh',
  'okay',
  'ok',
  'so',
  'like',
  'hey',
  'please',
  'thanks',
  'thank',
  'you',
])

/**
 * A transcript needs at least this many words to be a question worth acting on.
 * Two is the shortest real request this tool has ("cheap rent", "rent burden"),
 * and one word is a misheard fragment far more often than a request.
 */
export const MIN_TRANSCRIPT_WORDS = 2

/** Beyond this a transcript is not a question; it is a paragraph read aloud. */
export const MAX_TRANSCRIPT_WORDS = 60

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export function assessTranscript(transcript: string): TranscriptAssessment {
  const cleaned = transcript.replace(/\s+/g, ' ').trim()
  if (!cleaned) {
    return { usable: false, problem: 'empty', reason: 'nothing was heard' }
  }
  const list = words(cleaned)
  if (!list.length) {
    return { usable: false, problem: 'empty', reason: 'the transcript carried no words' }
  }
  if (list.length > MAX_TRANSCRIPT_WORDS) {
    return {
      usable: false,
      problem: 'too_long',
      reason: `${list.length} words is longer than a question this tool answers`,
    }
  }
  if (list.every((word) => FILLER.has(word))) {
    return {
      usable: false,
      problem: 'filler_only',
      reason: 'the transcript is filler, so there is nothing to search for',
    }
  }
  if (list.length < MIN_TRANSCRIPT_WORDS) {
    return {
      usable: false,
      problem: 'too_short',
      reason: `one word is more often a misheard fragment than a request`,
    }
  }
  return { usable: true, text: cleaned, words: list.length }
}

/* ------------------------------------------------------------------ */
/* Spoken numbers                                                      */
/* ------------------------------------------------------------------ */

const DIGIT_WORDS: Record<string, number> = {
  zero: 0,
  oh: 0,
  o: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
}

const SMALL: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

const SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
}

export type SpokenNumberResult =
  | { ok: true; value: number; unit: string | null }
  | { ok: false; reason: string }

const UNITS: Record<string, string> = {
  percent: '%',
  percents: '%',
  dollars: 'USD',
  dollar: 'USD',
  bucks: 'USD',
}

/**
 * Reads a spoken number, with its unit when it was spoken.
 *
 * Digits said one at a time and digits said as a number are both accepted, because
 * both are how people read a ZIP aloud: "seven eight seven zero one" and "eight
 * seven seven zero one" are the same code said two ways. The two forms are not mixed
 * by guesswork - if the words parse as digit-by-digit, that reading wins, because a
 * run of digit words is never a quantity ("four five" is not forty-five).
 */
export function spokenNumber(text: string): SpokenNumberResult {
  const list = words(text).filter((word) => word !== 'and')
  if (!list.length) return { ok: false, reason: 'no number was spoken' }

  let unit: string | null = null
  const trailing = list[list.length - 1]
  if (trailing && UNITS[trailing]) {
    unit = UNITS[trailing] as string
    list.pop()
  }
  if (!list.length) return { ok: false, reason: 'no number was spoken' }

  if (list.every((word) => word in DIGIT_WORDS)) {
    // Digit-by-digit wins over the quantity reading, so "four five" is 45 spoken as
    // two digits rather than forty-five, which was not said.
    const value = Number(list.map((word) => DIGIT_WORDS[word]).join(''))
    return { ok: true, value, unit }
  }

  let total = 0
  let current = 0
  let seen = false
  for (const word of list) {
    if (word in SMALL) {
      current += SMALL[word] as number
      seen = true
      continue
    }
    if (word === 'hundred') {
      if (!seen) return { ok: false, reason: '"hundred" needs a quantity before it' }
      current = (current || 1) * 100
      continue
    }
    if (word in SCALES) {
      if (!seen) return { ok: false, reason: `"${word}" needs a quantity before it` }
      total += (current || 1) * (SCALES[word] as number)
      current = 0
      seen = false
      continue
    }
    return { ok: false, reason: `"${word}" is not part of a number` }
  }
  const value = total + current
  return { ok: true, value, unit }
}

export type SpokenZipResult =
  | { ok: true; zip: string }
  | { ok: false; reason: 'not_a_zip'; detail: string }

/**
 * A ZIP code read aloud, or a refusal.
 *
 * Five digits, exactly. Anything else is refused with its detail rather than padded,
 * because zero-padding a four-digit reading invents a place: 901 is not 0901, and a
 * reader in San Juan should not get a search for somewhere else.
 */
export function spokenZip(text: string): SpokenZipResult {
  const direct = text.match(/\b(\d{5})\b/)
  if (direct) return { ok: true, zip: direct[1] as string }

  const digits = words(text)
    .filter((word) => word in DIGIT_WORDS)
    .map((word) => String(DIGIT_WORDS[word]))
    .join('')

  if (digits.length === 5) return { ok: true, zip: digits }
  if (!digits) {
    return { ok: false, reason: 'not_a_zip', detail: 'no digits were spoken' }
  }
  return {
    ok: false,
    reason: 'not_a_zip',
    detail: `${digits.length} digit${digits.length === 1 ? '' : 's'} were spoken; a ZIP code has five`,
  }
}
