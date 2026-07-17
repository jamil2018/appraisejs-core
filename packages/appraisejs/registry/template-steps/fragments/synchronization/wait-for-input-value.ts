/**
 * @name wait for input value
 * @description Wait until an input element equals an expected value
 * @icon WAIT
 */
When(
  'the user waits for the {string} input value to equal {string}',
  async function (this: CustomWorld, elementName: SelectorName, expectedValue: string) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).evaluate(
      (element, value) =>
        new Promise<void>((resolve, reject) => {
          const deadline = Date.now() + 10_000
          const timer = setInterval(() => {
            if ((element as HTMLInputElement).value === value) {
              clearInterval(timer)
              resolve()
            } else if (Date.now() >= deadline) {
              clearInterval(timer)
              reject(new Error(`Input value did not become ${value}`))
            }
          }, 50)
        }),
      expectedValue,
    )
  },
)
