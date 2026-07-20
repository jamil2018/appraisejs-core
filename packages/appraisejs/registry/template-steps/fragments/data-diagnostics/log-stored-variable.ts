/**
 * @name log stored variable
 * @description Log a stored runtime variable as JSON for test diagnostics
 * @icon DEBUG
 */
When('the user logs the stored variable {string}', async function (this: CustomWorld, variableName: string) {
  await executeHumanOperation('browser.data.diagnostics.log.stored.variable@1', this, ['variableName'], [variableName])
})
