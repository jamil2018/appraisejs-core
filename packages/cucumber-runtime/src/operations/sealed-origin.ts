import type { Page } from 'playwright'

/** Raised when a managed browser operation leaves its sealed target origin. */
export class SealedOriginError extends Error {
  constructor() {
    super('Browser navigation is outside the sealed target origin.')
    this.name = 'SealedOriginError'
  }
}

function sealedOrigin(baseUrl: string | undefined) {
  return baseUrl ? new URL(baseUrl).origin : undefined
}

/**
 * Managed capsules may use relative navigation, but every absolute destination
 * has to remain on the origin sealed into their command receipt.
 */
export function resolveSealedNavigationUrl(value: string, baseUrl: string | undefined) {
  if (!baseUrl) return value
  const destination = new URL(value, baseUrl)
  if (destination.origin !== sealedOrigin(baseUrl)) throw new SealedOriginError()
  return destination.toString()
}

/** `about:blank` is valid only before the first sealed navigation. */
export function assertSealedPageOrigin(pageUrl: string, baseUrl: string | undefined, allowBlank = false) {
  if (!baseUrl) return
  if (allowBlank && pageUrl === 'about:blank') return
  try {
    if (new URL(pageUrl).origin === sealedOrigin(baseUrl)) return
  } catch {
    // Fall through to the closed-world failure below.
  }
  throw new SealedOriginError()
}

export async function gotoSealedOrigin(
  page: Page,
  value: string,
  baseUrl: string | undefined,
  options: Parameters<Page['goto']>[1],
) {
  return page.goto(resolveSealedNavigationUrl(value, baseUrl), options)
}
