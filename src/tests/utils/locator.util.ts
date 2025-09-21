import { Page } from 'playwright'
import { LocatorCache, LocatorMapCache } from './cache.util'

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
