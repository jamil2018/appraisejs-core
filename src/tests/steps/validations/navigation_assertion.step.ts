/**
 * @name navigation assertion
 * @description Template steps that handles navigation validations
 * @type VALIDATION
 */
import { Then } from '@cucumber/cucumber'
import { CustomWorld, expect } from '../../config/executor/world.js'

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name assert url route equals
 * @description Template step for validating whether a url route equals the provided value or not
 * @icon VALIDATION
 */
Then('the url route should be equal to {string}', async function (this: CustomWorld, route: string) {
  try {
    await this.page.waitForLoadState('networkidle')
    const currentRoute = new URL(this.page.url()).pathname
    expect(currentRoute, `Expected the current route to be "${route}"`).to.equal(route.toLowerCase())
  } catch (error) {
    throw new Error(`Failed to validate the equality of the current route to the route "${route}": ${error}`)
  }
})
