/**
 * @name assert element bounding box
 * @description Assert an element bounding-box x, y, width, and height using rounded pixels
 * @icon VALIDATION
 */
Then(
  'the {string} element bounding box should be x {int} y {int} width {int} height {int}',
  async function (this: CustomWorld, elementName: SelectorName, x: number, y: number, width: number, height: number) {
    await executeHumanOperation(
      'browser.element.property.assertion.assert.element.bounding.box@1',
      this,
      ['elementName', 'x', 'y', 'width', 'height'],
      [elementName, x, y, width, height],
    )
  },
)
