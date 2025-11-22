import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world'
import { SelectorName } from '@/types/locator/locator.type'
import { resolveLocator } from '../../utils/locator.util'

// This file is generated automatically. Add template steps to this group to generate content.

When('the user waits for {int} seconds', async function (this: CustomWorld, waitTime: number) {
  try {
    await this.page.waitForTimeout(waitTime * 1000)
  } catch (error) {
    console.error(error)
    throw error
  }
})
