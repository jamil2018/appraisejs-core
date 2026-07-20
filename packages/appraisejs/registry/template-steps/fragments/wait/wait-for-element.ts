/**
 * @name wait for element
 * @description Wait for an element to become visible
 * @icon WAIT
 */
When(
  'the user waits for the element {string} to become visible',
  async function (this: CustomWorld, elementName: SelectorName) {
    await executeHumanOperation('browser.wait.wait.for.element@1', this, ['elementName'], [elementName])
  },
)
