/**
 * @name text assertion
 * @description Template steps for asserting text inside elements
 * @type VALIDATION
 */
import { When } from '@cucumber/cucumber'
import { Then } from '@cucumber/cucumber'
import { CustomWorld, expect } from '../../config/executor/world.js'
import { SelectorName } from '@/types/locator/locator.type'
import { resolveLocator } from '../../utils/locator.util.js'

// This file is generated automatically. Add template steps to this group to generate content.

/**
 * @name assert element contains text
 * @description Template step for validating whether an element contains a certain text or not
 * @icon VALIDATION
 */
Then(
  'the element {string} should {boolean} contain the text {string}',
  async function (this: CustomWorld, elementName: SelectorName, shouldContain: boolean, elementText: string) {
    try {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const elementTextContent = await this.page.locator(selector).textContent()

      if (!elementTextContent) throw new Error(`Element ${elementName} does not have any text content`)

      if (shouldContain) {
        expect(elementTextContent, `Expected ${elementName} to contain "${elementText}"`).to.contain(elementText)
      } else {
        expect(elementTextContent, `Expected ${elementName} NOT to contain "${elementText}"`).to.not.contain(
          elementText,
        )
      }
    } catch (error) {
      throw new Error(`Failed to validate the containment of the text of the element ${elementName}: ${error}`)
    }
  },
)

/**
 * @name assert element equals text
 * @description Template step for validating whether an element text equals a provided text or not
 * @icon VALIDATION
 */
Then(
  'the element {string} should {boolean} equal the text {string}',
  async function (this: CustomWorld, elementName: SelectorName, shouldEqual: boolean, elementText: string) {
    try {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const elementTextContent = await this.page.locator(selector).textContent()
      if (!elementTextContent) throw new Error(`Element ${elementName} does not have any text content`)
      if (shouldEqual) {
        expect(elementTextContent, `Expected ${elementName} to equal "${elementText}"`).to.equal(elementText)
      } else {
        expect(elementTextContent, `Expected ${elementName} NOT to equal "${elementText}"`).to.not.equal(elementText)
      }
    } catch (error) {
      throw new Error(`Failed to validate the equality of the text of the element ${elementName}: ${error}`)
    }
  },
)
