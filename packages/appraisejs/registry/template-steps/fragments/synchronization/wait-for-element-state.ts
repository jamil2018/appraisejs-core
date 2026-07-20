/**
 * @name wait for element state
 * @description Wait for an element to become attached, detached, visible, or hidden
 * @icon WAIT
 */
When(
  'the user waits for the {string} element state to be {string}',
  async function (this: CustomWorld, elementName: SelectorName, state: string) {
    await executeHumanOperation(
      'browser.synchronization.wait.for.element.state@1',
      this,
      ['elementName', 'state'],
      [elementName, state],
    )
  },
)
