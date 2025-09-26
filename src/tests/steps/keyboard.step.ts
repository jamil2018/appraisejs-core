import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../config/world.js'
import { Locator } from '../../types/step/step.type.js'
import { resolveLocator } from '../utils/locator.util.js'

When(
  'the user fills in the {string} input field with value {string}',
  async function (this: CustomWorld, field_name: Locator, field_value: string) {
    try {
      const fieldLocator = resolveLocator(this.page, field_name)
      if (!fieldLocator) {
        throw new Error(`Field locator not found for name ${field_name}`)
      }
      await this.page.fill(fieldLocator, field_value)
    } catch (error) {
      console.error(error)
      throw new Error(`Error filling in the ${field_name} input field with value ${field_value}`)
    }
  },
)
