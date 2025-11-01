import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../config/executor/world.js'
import { Locator } from '../../types/step/step.type'
import { resolveLocator } from '../utils/locator.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

When(
  'the user fills in the {string} input field with value {string}',
  async function (this: CustomWorld, element_name: Locator, value: string) {
    try {
      const elementLocator = await resolveLocator(this.page, element_name)
      if (!elementLocator) {
        throw new Error(`Element ${element_name} not found`)
      }
      await this.page.locator(elementLocator).waitFor({ state: 'visible' })
      await this.page.fill(elementLocator, value)
    } catch (error) {
      console.error(error)
      throw new Error(`Error filling in the ${element_name} input field with value ${value}`)
    }
  },
)
