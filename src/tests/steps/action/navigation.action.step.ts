import { Given } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world.js'
import { getEnvironment } from '../../utils/environment.util.js'

Given('the user navigates to {string}', async function (this: CustomWorld, url: string) {
  await this.page.goto(url, { timeout: 600000 })
})

Given('the user navigates to {string} environment url', async function (this: CustomWorld, environment: string) {
  const environmentConfig = getEnvironment(environment)
  await this.page.goto(environmentConfig.url, { timeout: 600000 })
})
