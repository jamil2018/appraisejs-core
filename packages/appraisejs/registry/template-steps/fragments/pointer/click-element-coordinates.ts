/**
 * @name click element coordinates
 * @description Click an x and y coordinate relative to a locator element
 * @icon MOUSE
 */
When(
  'the user clicks coordinates x {int} and y {int} inside the {string} element',
  async function (this: CustomWorld, x: number, y: number, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.pointer.click.element.coordinates@1',
      this,
      ['x', 'y', 'elementName'],
      [x, y, elementName],
    )
  },
)
