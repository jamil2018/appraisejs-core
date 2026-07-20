/**
 * @name click element inside frame
 * @description Click a locator inside an iframe resolved from the shared locator library
 * @icon MOUSE
 */
When(
  'the user clicks the {string} element inside the {string} frame',
  async function (this: CustomWorld, elementName: SelectorName, frameName: SelectorName) {
    await executeHumanOperation(
      'browser.tabs.frames.dialogs.click.element.inside.frame@1',
      this,
      ['elementName', 'frameName'],
      [elementName, frameName],
    )
  },
)
