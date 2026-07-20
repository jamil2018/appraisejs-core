/**
 * @name fill element inside frame
 * @description Fill a locator inside an iframe resolved from the shared locator library
 * @icon INPUT
 */
When(
  'the user fills the {string} element inside the {string} frame with {string}',
  async function (this: CustomWorld, elementName: SelectorName, frameName: SelectorName, value: string) {
    await executeHumanOperation(
      'browser.tabs.frames.dialogs.fill.element.inside.frame@1',
      this,
      ['elementName', 'frameName', 'value'],
      [elementName, frameName, value],
    )
  },
)
