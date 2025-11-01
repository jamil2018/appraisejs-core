import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../config/executor/world.js'

// This file is generated automatically. Add template steps to this group to generate content.

When('the user is navigated to the {string} page', async function (this: CustomWorld, page_url: string) {
  try {
    await this.page.goto(page_url)
  } catch (error) {
    console.error(error)
    throw new Error(`Error navigating to the ${page_url} page`)
  }
})
