import { Page } from 'playwright'
import { LocatorCache, LocatorMapCache } from './cache.util.js'

/**
 * Small sleep helper.
 */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Retry helper with:
 * - immediate first attempt (no initial delay)
 * - exponential backoff
 * - selective retry via shouldRetry
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

/**
 * Route key helper. Include search if you have route-specific maps based on query.
 */
const routeKey = (page: Page, includeSearch = false) => {
  const u = new URL(page.url())
  return includeSearch ? `${u.pathname}${u.search}` : u.pathname
}

/**
 * Wait for route to be "settled" without requiring AUT changes:
 * 1) URL must be stable for urlStableMs
 * 2) DOM must be "quiet" (no mutations) for domQuietMs
 *
 * Why: SPAs often update URL before UI finishes transitioning.
 */
export async function waitForRouteSettled(
  page: Page,
  {
    timeoutMs = 15_000,
    pollMs = 50,
    urlStableMs = 400,
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

  // Ensure at least DOM content is there (fast and reliable)
  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs })

  // Track URL stability
  let lastKey = routeKey(page, includeSearch)
  let stableSince = Date.now()

  // Track navigations as an extra signal (helps some routers / redirects)
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

      // DOM quietness: no mutations for domQuietMs
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

    // Best-effort fallback
    return routeKey(page, includeSearch)
  } finally {
    page.off('framenavigated', onFrameNav)
  }
}

/**
 * Locator map lookup:
 * Throws a tagged error so retry can decide to retry only on "map missing" cases.
 */
const getLocatorMapData = async (page: Page) => {
  const locatorMap = LocatorMapCache.getInstance()
  const currentPath = new URL(page.url()).pathname

  const data = locatorMap.get(currentPath)
  if (!data) {
    throw new Error(`LOCATOR_MAP_NOT_FOUND::${currentPath}`)
  }
  return data
}

/**
 * Main resolver:
 * - waits for settled route (URL stable + DOM quiet)
 * - retries map lookup if map isn't found yet
 * - guards against route changing mid-resolution
 */
export async function resolveLocator(page: Page, locatorName: string) {
  try {
    // Basic readiness
    await page.waitForLoadState('domcontentloaded', { timeout: 60_000 })

    // Stronger readiness: route settled (no AUT changes needed)
    await waitForRouteSettled(page, {
      timeoutMs: 15_000,
      urlStableMs: 500,
      domQuietMs: 300,
      pollMs: 50,
      includeSearch: false,
    })

    const beforePath = new URL(page.url()).pathname

    // Retry ONLY when map is missing (likely mid-route or late map population)
    const locatorMapData = await retry(async () => await getLocatorMapData(page), {
      retries: 6,
      delayMs: 80,
      backoff: 1.5,
      shouldRetry: e => e instanceof Error && e.message.startsWith('LOCATOR_MAP_NOT_FOUND::'),
    })

    const locators = LocatorCache.getInstance().get(locatorMapData.name)
    if (!locators) {
      throw new Error(`Locator bundle not found for name ${locatorMapData.name}`)
    }

    const locator = locators[locatorName]
    if (!locator) {
      throw new Error(`Locator "${locatorName}" not found for name ${locatorMapData.name}`)
    }

    // Guard: if route changed while resolving, re-run once.
    const afterPath = new URL(page.url()).pathname
    if (afterPath !== beforePath) {
      return await resolveLocator(page, locatorName)
    }

    return locator as unknown as string
  } catch (error) {
    console.error(error)
    return null
  }
}
