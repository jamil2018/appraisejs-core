import { Page } from 'playwright'
import { LocatorCache, LocatorMapCache } from './cache.util.js'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
    shouldRetry?: (error: unknown) => boolean
  } = {},
): Promise<T> {
  let lastErr: unknown
  let delay = delayMs

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastErr = error
      if (i === retries || !shouldRetry(error)) {
        break
      }
      await sleep(delay)
      delay = Math.floor(delay * backoff)
    }
  }

  throw lastErr
}

const routeKey = (page: Page, includeSearch = false) => {
  const url = new URL(page.url())
  return includeSearch ? `${url.pathname}${url.search}` : url.pathname
}

export async function waitForRouteSettled(
  page: Page,
  {
    timeoutMs = 15000,
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
      if (!urlStableLongEnough || !noRecentNav) {
        continue
      }

      const domQuiet = await page
        .evaluate(quietMs => {
          return new Promise<boolean>(resolve => {
            let lastMutation = Date.now()
            const observer = new MutationObserver(() => {
              lastMutation = Date.now()
            })
            observer.observe(document, { subtree: true, childList: true, attributes: true })

            const tick = () => {
              if (Date.now() - lastMutation >= quietMs) {
                observer.disconnect()
                resolve(true)
                return
              }
              setTimeout(tick, 50)
            }

            tick()
          })
        }, domQuietMs)
        .catch(() => false)

      if (domQuiet) {
        return lastKey
      }
    }

    return routeKey(page, includeSearch)
  } finally {
    page.off('framenavigated', onFrameNav)
  }
}

const getLocatorMapData = async (page: Page) => {
  const locatorMap = LocatorMapCache.getInstance()
  const currentPath = new URL(page.url()).pathname
  const data = locatorMap.get(currentPath)

  if (!data) {
    throw new Error(`LOCATOR_MAP_NOT_FOUND::${currentPath}`)
  }

  return data
}

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
    const locator = page.locator(selector)
    await locator.first().waitFor({ state: 'attached', timeout: timeoutMs })

    if (requireVisible) {
      await locator.first().waitFor({ state: 'visible', timeout: timeoutMs })
    }

    if (requireUnique) {
      const count = await locator.count()
      if (count !== 1) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

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
    validate?:
      | false
      | {
          timeoutMs?: number
          requireVisible?: boolean
          requireUnique?: boolean
        }
  } = {},
): Promise<string | null> {
  try {
    for (let pass = 0; pass < maxResolvePasses; pass++) {
      await waitForRouteSettled(page, {
        timeoutMs: 15000,
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
        shouldRetry: error => error instanceof Error && error.message.startsWith('LOCATOR_MAP_NOT_FOUND::'),
      })

      const locators = LocatorCache.getInstance().get(locatorMapData.name)
      if (!locators) {
        throw new Error(`Locator bundle not found for name ${locatorMapData.name}`)
      }

      const selector = locators[locatorName]
      if (!selector) {
        throw new Error(`Locator "${locatorName}" not found for name ${locatorMapData.name}`)
      }

      const afterPath = new URL(page.url()).pathname
      if (afterPath !== beforePath) {
        continue
      }

      if (validate === false) {
        return selector as unknown as string
      }

      const isValid = await validateResolvedSelector(page, selector as unknown as string, validate)
      if (isValid) {
        return selector as unknown as string
      }
    }

    throw new Error(`Failed to resolve a valid locator for "${locatorName}" after ${maxResolvePasses} passes`)
  } catch (error) {
    console.error(error)
    return null
  }
}
