/**
 * @name wait
 * @description Template steps that handles waiting actions
 * @type ACTION
 */
import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world'

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name Wait
 * @description Template step that handles waiting for specific amount of time
 * @icon WAIT
 */
When('the user waits for {int} seconds', async function (this: CustomWorld, waitTime: number) {
  try {
    await this.page.waitForTimeout(waitTime * 1000)
  } catch (error) {
    console.error(error)
    throw error
  }
})
