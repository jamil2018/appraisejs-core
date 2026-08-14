import { createHash } from 'node:crypto'

import type { Page } from 'playwright'

export type SelectorObservation = {
  selectorFingerprint: string
  checkedAt: string
  checkedUrl: string
  matchCount: number | null
  error?: string
}

export async function observeSelector(page: Page, selector: string): Promise<SelectorObservation> {
  const selectorFingerprint = `sha256:${createHash('sha256').update(selector).digest('hex')}`
  const checkedAt = new Date().toISOString()
  const checkedUrl = page.url()

  try {
    return {
      selectorFingerprint,
      checkedAt,
      checkedUrl,
      matchCount: await page.locator(selector).count(),
    }
  } catch (error) {
    return {
      selectorFingerprint,
      checkedAt,
      checkedUrl,
      matchCount: null,
      error: error instanceof Error ? error.message : 'Selector could not be evaluated.',
    }
  }
}

export function assertExactlyOneObservedMatch(
  observation: SelectorObservation,
): asserts observation is SelectorObservation & {
  matchCount: number
} {
  if (observation.error) throw new Error(`Selected selector is invalid on the live page: ${observation.error}`)
  if (observation.matchCount !== 1)
    throw new Error(`Selected selector must match exactly one live element; found ${observation.matchCount ?? 0}.`)
}
