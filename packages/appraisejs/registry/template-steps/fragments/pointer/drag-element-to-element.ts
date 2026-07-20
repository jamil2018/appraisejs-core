/**
 * @name drag element to element
 * @description Drag a source locator and drop it onto a target locator
 * @icon MOUSE
 */
When(
  'the user drags the {string} element onto the {string} element',
  async function (this: CustomWorld, sourceName: SelectorName, targetName: SelectorName) {
    await executeHumanOperation(
      'browser.pointer.drag.element.to.element@1',
      this,
      ['sourceName', 'targetName'],
      [sourceName, targetName],
    )
  },
)
