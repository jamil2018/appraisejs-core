/**
 * @name navigation
 * @description Template steps that handles navigation actions
 * @type ACTION
 */
import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world.js'
import { getEnvironment } from '../../utils/environment.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name Navigate to
 * @description Template step that handles navigating to a specific environment
 * @icon NAVIGATION
 */
When('the user navigates to the {string} environment', async function (this: CustomWorld, environmentName: string) {
  const environmentConfig = getEnvironment(environmentName)
  if (!environmentConfig) {
    throw new Error(`Environment ${environmentName} not found`)
  }
  await this.page.goto(environmentConfig.baseUrl, { timeout: 600000 })
})
