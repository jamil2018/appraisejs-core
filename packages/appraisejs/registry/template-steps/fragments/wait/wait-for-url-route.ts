/**
 * @name wait for url route
 * @description Template step for waiting for a url route to be loaded
 * @icon WAIT
 */
When(
  'the user waits for the route {string} to be loaded',
  async function (this: CustomWorld, routeName: string) {
    try {
      const baseUrl = getEnvironment(process.env.ENVIRONMENT as string).baseUrl;
      const sanitizedBaseUrl = baseUrl.endsWith('/')
        ? baseUrl.slice(0, -1)
        : baseUrl;
      const sanitizedRouteName = routeName.startsWith('/')
        ? routeName.slice(1)
        : routeName;
      const fullRoute = `${sanitizedBaseUrl}/${sanitizedRouteName}`;
      await this.page.waitForURL(fullRoute, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      throw new Error(
        `Failed to wait for the route ${routeName} to be loaded: ${error}`
      );
    }
  }
);
