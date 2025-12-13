import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world.js'
import { getEnvironment } from '../../utils/environment.util.js'

// This file is generated automatically. Add template steps to this group to generate content.
When('the user navigates to the {string} environment', async function (this: CustomWorld, environmentName: string) {
  const environmentConfig = getEnvironment(environmentName)
  if (!environmentConfig) {
    throw new Error(`Environment ${environmentName} not found`)
  }
  await this.page.goto(environmentConfig.baseUrl, { timeout: 600000 })
})
