import { Page } from 'playwright'
import { LocatorCache, LocatorMapCache } from './cache.util.js'

/**
 * Resolves a Playwright locator for a given page and locator name by looking up
 * the locator definition from the cached locator files and mapping configuration.
 *
 * This function performs the following steps:
 * 1. Waits for DOM to be ready (domcontentloaded state)
 * 2. Waits for URL to stabilize (ensures route has fully updated after navigation)
 * 3. Extracts the current page path from the stabilized URL
 * 4. Looks up the locator mapping for the current path
 * 5. Retrieves the corresponding locator collection
 * 6. Returns the specific locator string for the given name
 *
 * The URL stabilization ensures that if navigation just occurred, the function will
 * wait until the route has fully updated before attempting to resolve the locator.
 * This prevents race conditions where the old route might still be active.
 *
 * @param page - The Playwright Page instance to resolve the locator for
 * @param locatorName - The name/key of the locator to resolve from the locator collection
 * @returns The locator string if found, null if not found or on error
 *
 * @example
 * ```typescript
 * const locator = await resolveLocator(page, 'loginButton');
 * if (locator) {
 *   await page.locator(locator).click();
 * }
 * ```
 *
 * @throws Will log errors to console if locator mapping or collection is not found
 */
/**
 * Waits for the URL to stabilize (not change) for a specified duration.
 * This ensures navigation has fully completed before resolving locators.
 * Uses Playwright's native waiting mechanisms to handle route changes.
 */
async function waitForUrlStable(page: Page, stabilityDuration: number = 100): Promise<string> {
  let lastUrl = page.url()
  let stableCount = 0
  const requiredStableChecks = 2 // URL must be stable for 2 consecutive checks
  const maxIterations = 50 // Prevent infinite loops (max ~5 seconds)

  for (let i = 0; i < maxIterations && stableCount < requiredStableChecks; i++) {
    await page.waitForTimeout(stabilityDuration)
    const currentUrl = page.url()

    if (currentUrl === lastUrl) {
      stableCount++
    } else {
      // URL changed, wait for DOM to be ready and reset stability counter
      stableCount = 0
      lastUrl = currentUrl
      await page.waitForLoadState('domcontentloaded', { timeout: 600000 })
    }
  }

  return lastUrl
}

export async function resolveLocator(page: Page, locatorName: string) {
  try {
    // Wait for DOM to be ready first (faster than networkidle)
    await page.waitForLoadState('domcontentloaded', { timeout: 600000 })

    // Wait for URL to stabilize to ensure route has fully updated
    const stableUrl = await waitForUrlStable(page, 100)

    const currentUrl = new URL(stableUrl).pathname
    const locatorMap = LocatorMapCache.getInstance()
    const locatorMapData = locatorMap.get(currentUrl)
    if (!locatorMapData) {
      throw new Error(`Locator ${locatorName} not found for path ${currentUrl}`)
    }
    const locators = LocatorCache.getInstance().get(locatorMapData.name)
    if (!locators) {
      throw new Error(`Locator ${locatorName} not found for name ${locatorMapData.name}`)
    }
    const locator = locators[locatorName]
    if (!locator) {
      throw new Error(`Locator ${locatorName} not found for name ${locatorMapData.name}`)
    }
    return locator as unknown as string
  } catch (error) {
    console.error(error)
    return null
  }
}
