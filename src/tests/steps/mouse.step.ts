import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../config/world.js'
import { Locator } from '../../types/step/step.type.js'
import { resolveLocator } from '../utils/locator.util.js'

When('the user clicks on the {string} element', async function (this: CustomWorld, element_name: Locator) {
  try {
    const elementLocator = resolveLocator(this.page, element_name)
    if (!elementLocator) {
      throw new Error(`Element locator not found for name ${element_name}`)
    }
    await this.page.click(elementLocator)
  } catch (error) {
    console.error(error)
    throw new Error(`Error clicking on element ${element_name}`)
  }
})

When('the user double clicks on the {string} element', async function (this: CustomWorld, element_name: Locator) {
  try {
    const elementLocator = resolveLocator(this.page, element_name)
    if (!elementLocator) {
      throw new Error(`Element locator not found for name ${element_name}`)
    }
    await this.page.dblclick(elementLocator)
  } catch (error) {
    console.error(error)
    throw new Error(`Error double clicking on element ${element_name}`)
  }
})
