/**
 * @name navigate to environment base url
 * @description Navigate to the base url of the selected environment
 * @icon NAVIGATION
 */
When('the user navigates to the base url of the selected environment', async function (this: CustomWorld) {
  try {
    const environment = process.env.ENVIRONMENT as string
    if (!environment) {
      throw new Error('Environment is not set')
    }
    const environmentConfig = getEnvironment(environment)
    if (!environmentConfig) {
      throw new Error(`Environment ${environment} not found`)
    }
    await this.page.goto(environmentConfig.baseUrl, {
      waitUntil: 'domcontentloaded',
    })
  } catch (error) {
    throw new Error(`Failed to navigate to the base url of the selected environment: ${error}`)
  }
})
