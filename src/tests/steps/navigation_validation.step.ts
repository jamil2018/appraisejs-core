import { Then } from '@cucumber/cucumber'
import { CustomWorld } from '../config/world.js'

Then('the user should be navigated to the {string} page', async function (this: CustomWorld, page_route: string) {
  try {
    await this.page.waitForLoadState('networkidle')
    const currentUrl = new URL(this.page.url()).pathname
    if (currentUrl !== `/${page_route}`) {
      throw new Error(`User is not navigated to the ${page_route} page`)
    }
  } catch (error) {
    console.error(error)
    throw new Error(`Error navigating to the ${page_route} page`)
  }
})
