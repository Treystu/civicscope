import { afterEach, expect, it, vi } from 'vitest'
import { getJson, SourceUnavailableError } from '../src/core/http'
import { _resetPacing, configureRateLimit, resetBudget } from '../src/core/ratelimit'

/**
 * Issue #72's F1: a source that answers HTTP 200 with an HTML error page.
 *
 * Census and TIGERweb both do this when a parameter or key is wrong, and it was
 * recorded in the audit as a design call waiting on the owner. It is not a policy
 * question: an uncaught `SyntaxError` from `res.json()` told the executor the
 * response was malformed in a way it could not classify, while the truth is that
 * the publisher was unavailable. Classifying it as a source failure is the
 * behaviour every other failed status already gets.
 */
afterEach(() => {
  vi.unstubAllGlobals()
  _resetPacing()
  resetBudget()
  configureRateLimit({ minIntervalMs: 400, maxConcurrency: 2, dailyBudget: 450 })
})

it('classifies a 200 carrying an HTML error page as a source failure', async () => {
  configureRateLimit({ minIntervalMs: 0, maxConcurrency: 2, dailyBudget: 450 })
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response('<!doctype html><title>Invalid key</title>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    ),
  )

  const request = getJson('https://example.test/html-200', {
    signal: new AbortController().signal,
    cache: false,
  })

  await expect(request).rejects.toBeInstanceOf(SourceUnavailableError)
  await expect(request).rejects.toMatchObject({ name: 'SourceUnavailableError', status: 200 })
})

it('still returns a JSON body that arrives with a 200', async () => {
  configureRateLimit({ minIntervalMs: 0, maxConcurrency: 2, dailyBudget: 450 })
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response('{"value":42}', { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    ),
  )

  await expect(
    getJson('https://example.test/json-200', { signal: new AbortController().signal, cache: false }),
  ).resolves.toEqual({ value: 42 })
})
