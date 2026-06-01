/**
 * @name generate random full name and save in variable
 * @description Template step for generating a random full name and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random full name and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    const data = generateRandomData(RandomDataType.FULL_NAME)
    try {
      this.setVar(variableName, data)
    } catch (error) {
      throw new Error(
        `Failed to generate a random full name and store it inside the variable ${variableName}: ${error}`,
      )
    }
  },
)
