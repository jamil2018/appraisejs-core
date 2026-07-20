/**
 * @name generate random email and save in variable
 * @description Template step for generating a random email and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random email and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    await executeHumanOperation(
      'browser.random.data.generate.random.email.and.save.in.variable@1',
      this,
      ['variableName'],
      [variableName],
    )
  },
)
