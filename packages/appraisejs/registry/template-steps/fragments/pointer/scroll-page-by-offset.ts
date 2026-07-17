/**
 * @name scroll page by offset
 * @description Scroll the page horizontally and vertically by pixel offsets
 * @icon MOUSE
 */
When('the user scrolls the page by x {int} and y {int}', async function (this: CustomWorld, x: number, y: number) {
  await this.page.mouse.wheel(x, y)
})
