/**
 * @name navigation
 * @description Template steps that deals with browser navigation
 * @type ACTION
 */
import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world.js'
import { getEnvironment } from '../../utils/environment.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name navigate to url
 * @description Navigate to the specified URL
 * @icon NAVIGATION
 */
When('the user navigates to the {string} url', async function (this: CustomWorld, url: string) {
  try {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' })
  } catch (error) {
    throw new Error(`Failed to navigate to the ${url} url: ${error}`)
  }
})

/**
 * @name navigate to environment base url
 * @description Navigate to the base url of the selected environment
 * @icon NAVIGATION
 */
When('the user navigates to the base url of the selected environment', async function (this: CustomWorld) {
  try {
    const environment = process.env.ENVIRONMENT as string
    if (!environment) {
      throw new Error('Environment is not set')
    }
    const environmentConfig = getEnvironment(environment)
    if (!environmentConfig) {
      throw new Error(`Environment ${environment} not found`)
    }
    await this.page.goto(environmentConfig.baseUrl, {
      waitUntil: 'domcontentloaded',
    })
  } catch (error) {
    throw new Error(`Failed to navigate to the base url of the selected environment: ${error}`)
  }
})

/**
 * @name reload
 * @description Template step for reloading the current page
 * @icon NAVIGATION
 */
When('the user reloads the page', async function (this: CustomWorld) {
  try {
    await this.page.reload()
    await this.page.waitForLoadState('domcontentloaded')
  } catch (error) {
    throw new Error(`Failed to reload the page: ${error}`)
  }
})

/**
 * @name go back
 * @description Template step for going back to the previous page
 * @icon NAVIGATION
 */
When('the user goes back to the previous page', async function (this: CustomWorld) {
  try {
    await this.page.goBack({ waitUntil: 'domcontentloaded' })
  } catch (error) {
    throw new Error(`Failed to go back to the previous page: ${error}`)
  }
})
