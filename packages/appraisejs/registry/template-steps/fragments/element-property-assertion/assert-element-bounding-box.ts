/**
 * @name assert element bounding box
 * @description Assert an element bounding-box x, y, width, and height using rounded pixels
 * @icon VALIDATION
 */
Then(
  'the {string} element bounding box should be x {int} y {int} width {int} height {int}',
  async function (this: CustomWorld, elementName: SelectorName, x: number, y: number, width: number, height: number) {
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
)
