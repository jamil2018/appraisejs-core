import { Page } from 'playwright'
import { LocatorCache, LocatorMapCache } from './cache.util.js'

/**
 * Resolves a Playwright locator for a given page and locator name by looking up
 * the locator definition from the cached locator files and mapping configuration.
 *
 * This function performs the following steps:
 * 1. Extracts the current page path from the URL
 * 2. Looks up the locator mapping for the current path
 * 3. Retrieves the corresponding locator collection
 * 4. Returns the specific locator string for the given name
 *
 * @param page - The Playwright Page instance to resolve the locator for
 * @param locatorName - The name/key of the locator to resolve from the locator collection
 * @returns The locator string if found, null if not found or on error
 *
 * @example
 * ```typescript
 * const locator = resolveLocator(page, 'loginButton');
 * if (locator) {
 *   await page.locator(locator).click();
 * }
 * ```
 *
 * @throws Will log errors to console if locator mapping or collection is not found
 */
export function resolveLocator(page: Page, locatorName: string) {
  try {
    const currentUrl = new URL(page.url()).pathname
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
