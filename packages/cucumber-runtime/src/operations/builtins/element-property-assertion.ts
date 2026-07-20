import { expect } from '../../assertion.ts'
import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const elementPropertyAssertionBuiltins = [
  {
    id: 'browser.assertions.value',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'expected', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, expected: string) {
      const selector = await resolveLocator(this.page, elementName, { validate: false })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      expect(await this.page.locator(selector).inputValue()).to.equal(expected)
    },
  },
  {
    id: 'browser.element.property.assertion.assert.element.attribute',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'attribute', type: 'STRING' },
      { name: 'expected', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, attribute: string, expected: string) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      expect((await this.page.locator(selector).getAttribute(attribute)) ?? '').to.equal(expected)
    },
  },
  {
    id: 'browser.element.property.assertion.assert.element.class',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'shouldHave', type: 'BOOLEAN' },
      { name: 'className', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, shouldHave: boolean, className: string) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const classes = ((await this.page.locator(selector).getAttribute('class')) ?? '').split(/\s+/)
      expect(classes.includes(className)).to.equal(shouldHave)
    },
  },
  {
    id: 'browser.element.property.assertion.assert.element.css.property',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'property', type: 'STRING' },
      { name: 'expected', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, property: string, expected: string) {
      const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const actual = await this.page
        .locator(selector)
        .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)
      expect(actual).to.equal(expected)
    },
  },
  {
    id: 'browser.element.property.assertion.assert.element.count',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'expected', type: 'NUMBER' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, expected: number) {
      const selector = await resolveLocator(this.page, elementName, { validate: false })
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      expect(await this.page.locator(selector).count()).to.equal(expected)
    },
  },
  {
    id: 'browser.element.property.assertion.assert.element.bounding.box',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'x', type: 'NUMBER' },
      { name: 'y', type: 'NUMBER' },
      { name: 'width', type: 'NUMBER' },
      { name: 'height', type: 'NUMBER' },
    ],
    execute: async function (
      this: CustomWorld,
      elementName: SelectorName,
      x: number,
      y: number,
      width: number,
      height: number,
    ) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const box = await this.page.locator(selector).boundingBox()
      if (!box) throw new Error(`Element ${elementName} does not have a bounding box`)
      expect({
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      }).to.deep.equal({ x, y, width, height })
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
