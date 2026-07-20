/**
 * @name scroll page by offset
 * @description Scroll the page horizontally and vertically by pixel offsets
 * @icon MOUSE
 */
When('the user scrolls the page by x {int} and y {int}', async function (this: CustomWorld, x: number, y: number) {
  await executeHumanOperation('browser.pointer.scroll.page.by.offset@1', this, ['x', 'y'], [x, y])
})
