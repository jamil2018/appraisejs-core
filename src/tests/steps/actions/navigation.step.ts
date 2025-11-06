import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world.js'
import { getEnvironment } from '@/tests/utils/environment.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

When('the user navigates to {string}', async function (this: CustomWorld, url: string) {
  try {
    await this.page.goto(url, { timeout: 600000 })
  } catch (error) {
    console.error(error)
  }
})

When('the user navigates to {string} environment url', async function (this: CustomWorld, environmentName: string) {
  try {
    const environmentConfig = getEnvironment(environmentName)
    if (!environmentConfig) {
      throw new Error(`Environment ${environmentName} not found`)
    }
    await this.page.goto(environmentConfig.url, { timeout: 600000 })
  } catch (error) {
    console.error(error)
  }
})
