/**
 * @name navigate to stored url
 * @description Navigate to a URL read from a stored runtime variable
 * @icon NAVIGATION
 */
When('the user navigates to the url in variable {string}', async function (this: CustomWorld, variableName: string) {
  const url = this.getVar<unknown>(variableName)
  if (typeof url !== 'string') throw new Error(`Stored variable ${variableName} must contain a URL string`)
  await this.page.goto(url, { waitUntil: 'domcontentloaded' })
})
