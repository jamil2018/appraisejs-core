/**
 * @name wait for element to disappear
 * @description Wait for an element to become hidden or detached
 * @icon WAIT
 */
When(
  'the user waits for the {string} element to disappear',
  async function (this: CustomWorld, elementName: SelectorName) {
    await executeHumanOperation('browser.wait.wait.for.element.to.disappear@1', this, ['elementName'], [elementName])
  },
)
