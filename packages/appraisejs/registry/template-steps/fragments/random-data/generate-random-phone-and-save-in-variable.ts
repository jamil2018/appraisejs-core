/**
 * @name generate random phone and save in variable
 * @description Template step for generating a random phone and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random phone and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    const data = generateRandomData(RandomDataType.PHONE)
    try {
      this.setVar(variableName, data)
    } catch (error) {
      throw new Error(`Failed to generate a random phone and store it inside the variable ${variableName}: ${error}`)
    }
  },
)
