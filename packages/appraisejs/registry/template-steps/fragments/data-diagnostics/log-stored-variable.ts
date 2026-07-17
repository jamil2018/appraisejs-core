/**
 * @name log stored variable
 * @description Log a stored runtime variable as JSON for test diagnostics
 * @icon DEBUG
 */
When('the user logs the stored variable {string}', async function (this: CustomWorld, variableName: string) {
  const value = this.getVar(variableName)
  console.log(`[stored:${variableName}]`, JSON.stringify(value))
})
