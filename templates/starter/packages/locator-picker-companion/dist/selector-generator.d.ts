import type { ElementHandle, Page } from 'playwright'
import type { CompanionPickedLocatorPayload } from './types.js'
export declare function generatePickedLocatorPayload(
  page: Page,
  elementHandle: ElementHandle,
): Promise<CompanionPickedLocatorPayload>
