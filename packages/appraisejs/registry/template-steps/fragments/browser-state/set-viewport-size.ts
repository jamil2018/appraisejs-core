/**
 * @name set viewport size
 * @description Set the browser viewport width and height in pixels
 * @icon NAVIGATION
 */
When(
  'the user sets the viewport to width {int} and height {int}',
  async function (this: CustomWorld, width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error('Viewport width and height must be positive integers')
    await this.page.setViewportSize({ width, height })
  },
)
