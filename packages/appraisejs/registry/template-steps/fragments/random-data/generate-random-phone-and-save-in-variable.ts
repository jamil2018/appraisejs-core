/**
 * @name generate random phone and save in variable
 * @description Template step for generating a random phone and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random phone and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation(
      'browser.random.data.generate.random.phone.and.save.in.variable@1',
      this,
      ['variableName'],
      [variableName],
    )
  },
)
