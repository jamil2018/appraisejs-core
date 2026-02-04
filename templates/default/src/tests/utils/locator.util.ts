import { Page } from 'playwright'
import { LocatorCache, LocatorMapCache } from './cache.util.js'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Retry helper: immediate first attempt, exponential backoff, selective retry.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  {
    retries = 5,
    delayMs = 100,
    backoff = 1.6,
    shouldRetry = () => true,
  }: {
    retries?: number
    delayMs?: number
    backoff?: number
    shouldRetry?: (e: unknown) => boolean
  } = {},
): Promise<T> {
  let lastErr: unknown
  let delay = delayMs

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i === retries || !shouldRetry(e)) break
      await sleep(delay)
      delay = Math.floor(delay * backoff)
    }
  }

  throw lastErr
}

const routeKey = (page: Page, includeSearch = false) => {
  const u = new URL(page.url())
  return includeSearch ? `${u.pathname}${u.search}` : u.pathname
}

/**
 * Wait for route to be "settled" without AUT changes:
 * - URL stable for urlStableMs
 * - no frame navigations during that window
 * - DOM quiet (no mutations) for domQuietMs
 */
export async function waitForRouteSettled(
  page: Page,
  {
    timeoutMs = 15_000,
    pollMs = 50,
    urlStableMs = 500,
    domQuietMs = 300,
    includeSearch = false,
  }: {
    timeoutMs?: number
    pollMs?: number
    urlStableMs?: number
    domQuietMs?: number
    includeSearch?: boolean
  } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs

  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs })

  let lastKey = routeKey(page, includeSearch)
  let stableSince = Date.now()

  let navBumpedAt = Date.now()
  const onFrameNav = () => {
    navBumpedAt = Date.now()
  }
  page.on('framenavigated', onFrameNav)

  try {
    while (Date.now() < deadline) {
      await sleep(pollMs)

      const key = routeKey(page, includeSearch)
      if (key !== lastKey) {
        lastKey = key
        stableSince = Date.now()
        continue
      }

      const now = Date.now()
      const urlStableLongEnough = now - stableSince >= urlStableMs
      const noRecentNav = now - navBumpedAt >= urlStableMs
      if (!urlStableLongEnough || !noRecentNav) continue

      const domQuiet = await page
        .evaluate(quietMs => {
          return new Promise<boolean>(resolve => {
            let lastMutation = Date.now()
            const obs = new MutationObserver(() => {
              lastMutation = Date.now()
            })
            obs.observe(document, { subtree: true, childList: true, attributes: true })

            const tick = () => {
              if (Date.now() - lastMutation >= quietMs) {
                obs.disconnect()
                resolve(true)
                return
              }
              setTimeout(tick, 50)
            }
            tick()
          })
        }, domQuietMs)
        .catch(() => false)

      if (domQuiet) return lastKey
    }

    return routeKey(page, includeSearch)
  } finally {
    page.off('framenavigated', onFrameNav)
  }
}

/**
 * Throw tagged error so we only retry on "map missing" cases.
 */
const getLocatorMapData = async (page: Page) => {
  const locatorMap = LocatorMapCache.getInstance()
  const currentPath = new URL(page.url()).pathname

  const data = locatorMap.get(currentPath)
  if (!data) throw new Error(`LOCATOR_MAP_NOT_FOUND::${currentPath}`)
  return data
}

/**
 * Validate that a selector "belongs" to the current page state.
 * - attached: element exists in DOM
 * - visible: element is visible (optional but very useful to avoid stale hidden elements)
 * - unique: avoids matching some leftover layout/header element found everywhere
 */
async function validateResolvedSelector(
  page: Page,
  selector: string,
  {
    timeoutMs = 1500,
    requireVisible = true,
    requireUnique = false,
  }: {
    timeoutMs?: number
    requireVisible?: boolean
    requireUnique?: boolean
  } = {},
): Promise<boolean> {
  try {
    const loc = page.locator(selector)

    // "attached" (exists) quickly
    await loc.first().waitFor({ state: 'attached', timeout: timeoutMs })

    if (requireVisible) {
      // visible check helps avoid stale hidden DOM (old route kept around)
      await loc.first().waitFor({ state: 'visible', timeout: timeoutMs })
    }

    if (requireUnique) {
      const c = await loc.count()
      if (c !== 1) return false
    }

    return true
  } catch {
    return false
  }
}

/**
 * Resolve locator with:
 * - route settled
 * - map lookup retry
 * - selector validation (protects against stale "same key across pages")
 * - rerun if validation fails or route changes mid-flight
 */
export async function resolveLocator(
  page: Page,
  locatorName: string,
  {
    maxResolvePasses = 2,
    validate = {
      timeoutMs: 1500,
      requireVisible: true,
      requireUnique: false,
    },
  }: {
    maxResolvePasses?: number
    validate?: {
      timeoutMs?: number
      requireVisible?: boolean
      requireUnique?: boolean
    }
  } = {},
) {
  try {
    for (let pass = 0; pass < maxResolvePasses; pass++) {
      await waitForRouteSettled(page, {
        timeoutMs: 15_000,
        urlStableMs: 500,
        domQuietMs: 300,
        pollMs: 50,
        includeSearch: false,
      })

      const beforePath = new URL(page.url()).pathname

      const locatorMapData = await retry(() => getLocatorMapData(page), {
        retries: 6,
        delayMs: 80,
        backoff: 1.5,
        shouldRetry: e => e instanceof Error && e.message.startsWith('LOCATOR_MAP_NOT_FOUND::'),
      })

      const locators = LocatorCache.getInstance().get(locatorMapData.name)
      if (!locators) throw new Error(`Locator bundle not found for name ${locatorMapData.name}`)

      const selector = locators[locatorName]
      if (!selector) throw new Error(`Locator "${locatorName}" not found for name ${locatorMapData.name}`)

      // Guard: route changed mid-resolution → re-run
      const afterPath = new URL(page.url()).pathname
      if (afterPath !== beforePath) continue

      // Critical: validate selector matches current page state.
      const ok = await validateResolvedSelector(page, selector as unknown as string, validate)
      if (ok) return selector as unknown as string

      // If validation failed, likely stale bundle (same locator key on multiple pages),
      // or transition still in progress. Loop and re-resolve after settling again.
    }

    throw new Error(`Failed to resolve a valid locator for "${locatorName}" after ${maxResolvePasses} passes`)
  } catch (error) {
    console.error(error)
    return null
  }
}
