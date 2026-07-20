/**
 * @name Set viewport size
 * @description Set the browser viewport to an exact width and height.
 * @icon NAVIGATION
 */
When(
  'the user sets the viewport to width {int} and height {int}',
  async function (this: CustomWorld, width: number, height: number) {
    await executeHumanOperation('browser.viewport.set@1', this, ['width', 'height'], [width, height])
  },
)
