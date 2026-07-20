/**
 * @name click and switch to popup
 * @description Click an element, wait for a popup tab, and switch the active page to it
 * @icon NAVIGATION
 */
When(
  'the user clicks the {string} element and switches to the opened popup',
  async function (this: CustomWorld, elementName: SelectorName) {
    await executeHumanOperation(
      'browser.tabs.frames.dialogs.click.and.switch.to.popup@1',
      this,
      ['elementName'],
      [elementName],
    )
  },
)
