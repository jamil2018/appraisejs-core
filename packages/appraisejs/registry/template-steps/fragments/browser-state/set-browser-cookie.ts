/**
 * @name set browser cookie
 * @description Set a cookie for the current page URL
 * @icon DATA
 */
When(
  'the user sets the browser cookie {string} to {string}',
  async function (this: CustomWorld, name: string, value: string) {
    await this.context.addCookies([{ name, value, url: this.page.url() }])
  },
)
