/**
 * @name wait for element state
 * @description Wait for an element to become attached, detached, visible, or hidden
 * @icon WAIT
 */
When(
  'the user waits for the {string} element state to be {string}',
  async function (this: CustomWorld, elementName: SelectorName, state: string) {
    if (!['attached', 'detached', 'visible', 'hidden'].includes(state)) {
      throw new Error(`Unsupported element wait state: ${state}`)
    }
    const selector = await resolveLocator(this.page, elementName, { validate: false })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    await this.page.locator(selector).waitFor({ state: state as 'attached' | 'detached' | 'visible' | 'hidden' })
  },
)
