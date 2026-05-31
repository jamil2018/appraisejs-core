/**
 * @name generate random email and save in variable
 * @description Template step for generating a random email and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random email and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    const data = generateRandomData(RandomDataType.EMAIL)
    try {
      this.setVar(variableName, data)
    } catch (error) {
      throw new Error(`Failed to generate a random email and store it inside the variable ${variableName}: ${error}`)
    }
  },
)
