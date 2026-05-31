/**
 * @name generate random password and save in variable
 * @description Template step for generating a random password and saving it inside a variable
 * @icon DATA
 */
When(
  'the user generates a random password and stores it inside the variable {string}',
  async function (this: CustomWorld, variableName: string) {
    const data = generateRandomData(RandomDataType.PASSWORD)
    try {
      this.setVar(variableName, data)
    } catch (error) {
      throw new Error(`Failed to generate a random password and store it inside the variable ${variableName}: ${error}`)
    }
  },
)
