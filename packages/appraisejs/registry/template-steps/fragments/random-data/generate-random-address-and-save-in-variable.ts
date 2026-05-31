/**
 * @name generate random address and save in variable
 * @description Template step for generating a random address and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random address and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    const data = generateRandomData(RandomDataType.ADDRESS)
    try {
      this.setVar(variableName, data)
    } catch (error) {
      throw new Error(`Failed to generate a random address and store it inside the variable ${variableName}: ${error}`)
    }
  },
)
