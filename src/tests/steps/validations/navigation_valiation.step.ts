import { Then } from '@cucumber/cucumber'
import { CustomWorld, expect } from '../../config/executor/world.js'

// This file is generated automatically. Add template steps to this group to generate content.

Then('the user should be navigated to the {string} route', async function (this: CustomWorld, route: string) {
  await this.page.waitForLoadState('networkidle', { timeout: 600000 })
  const currentUrl = new URL(this.page.url()).pathname
  expect(currentUrl).to.include(route)
})
