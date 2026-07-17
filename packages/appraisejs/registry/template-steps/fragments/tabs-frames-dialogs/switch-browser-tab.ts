/**
 * @name switch browser tab
 * @description Switch to a browser tab or popup using its zero-based index
 * @icon NAVIGATION
 */
When('the user switches to browser tab {int}', async function (this: CustomWorld, index: number) {
  const pages = this.context.pages()
  const target = pages[index]
  if (!target) throw new Error(`Browser tab index ${index} does not exist; ${pages.length} tab(s) are open`)
  this.page = target
  await target.bringToFront()
})
