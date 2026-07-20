/**
 * @name click page coordinates
 * @description Click an exact x and y page coordinate with the mouse pointer
 * @icon MOUSE
 */
When('the user clicks page coordinates x {int} and y {int}', async function (this: CustomWorld, x: number, y: number) {
  await executeHumanOperation('browser.pointer.click.page.coordinates@1', this, ['x', 'y'], [x, y])
})
