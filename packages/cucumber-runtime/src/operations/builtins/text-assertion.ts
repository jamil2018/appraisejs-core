import { expect } from '../../assertion.ts'
import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const textAssertionBuiltins = [
  {
    id: 'browser.text.assertion.assert.element.contains.stored.variable.text',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'variableName', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
      const expectedText = this.getVar<unknown>(variableName)
      if (typeof expectedText !== 'string') {
        throw new Error(`Stored variable ${variableName} must contain a string`)
      }

      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)

      try {
        const actualText = await this.page.locator(selector).textContent()
        expect(actualText ?? '', `Expected ${elementName} to contain stored variable ${variableName}`).to.contain(
          expectedText,
        )
      } catch (error) {
        throw new Error(`Failed to compare ${elementName} text with stored variable ${variableName}: ${error}`)
      }
    },
  },
  {
    id: 'browser.assertions.text-contains',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'shouldContain', type: 'BOOLEAN' },
      { name: 'elementText', type: 'STRING' },
    ],
    execute: async function (
      this: CustomWorld,
      elementName: SelectorName,
      shouldContain: boolean,
      elementText: string,
    ) {
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
  },
  {
    id: 'browser.text.assertion.assert.element.equals.text',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'shouldEqual', type: 'BOOLEAN' },
      { name: 'elementText', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, shouldEqual: boolean, elementText: string) {
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
  },
] satisfies readonly BuiltinBrowserOperation[]
