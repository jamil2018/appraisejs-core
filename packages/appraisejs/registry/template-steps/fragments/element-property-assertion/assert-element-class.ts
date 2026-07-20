/**
 * @name assert element class
 * @description Assert whether an element class list contains a class name
 * @icon VALIDATION
 */
Then(
  'the {string} element should {boolean} have class {string}',
  async function (this: CustomWorld, elementName: SelectorName, shouldHave: boolean, className: string) {
    await executeHumanOperation(
      'browser.element.property.assertion.assert.element.class@1',
      this,
      ['elementName', 'shouldHave', 'className'],
      [elementName, shouldHave, className],
    )
  },
)
