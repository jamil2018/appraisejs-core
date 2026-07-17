/**
 * @name type text sequentially
 * @description Type text into an element one key at a time with a delay in milliseconds
 * @icon INPUT
 */
When(
  'the user types {string} sequentially into the {string} element with delay {int} milliseconds',
  async function (this: CustomWorld, value: string, elementName: SelectorName, delay: number) {
    const selector = await resolveLocator(this.page, elementName)
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).pressSequentially(value, { delay })
  },
)
