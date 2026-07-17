/**
 * @name store element attribute
 * @description Store an element attribute value in a runtime variable
 * @icon STORE
 */
When(
  'the user stores attribute {string} from the {string} element in variable {string}',
  async function (this: CustomWorld, attribute: string, elementName: SelectorName, variableName: string) {
    const selector = await resolveLocator(this.page, elementName, { validate: { requireVisible: false } })
    if (!selector) throw new Error(`Selector ${elementName} not found`)
    this.setVar(variableName, (await this.page.locator(selector).getAttribute(attribute)) ?? '')
  },
)
