/**
 * @name close current browser tab
 * @description Close the current tab and switch to the last remaining browser tab
 * @icon NAVIGATION
 */
When('the user closes the current browser tab', async function (this: CustomWorld) {
  await this.page.close()
  const pages = this.context.pages()
  const target = pages.at(-1)
  if (!target) throw new Error('No browser tabs remain after closing the current tab')
  this.page = target
  await target.bringToFront()
})
