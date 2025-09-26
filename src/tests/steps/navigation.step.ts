import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../config/world.js'

When('the user navigates to the {string} page', async function (this: CustomWorld, page_url: string) {
  try {
    await this.page.goto(page_url)
  } catch (error) {
    console.error(error)
    throw new Error(`Error navigating to the ${page_url} page`)
  }
})
