import { readFileSync } from 'fs'

interface EnvironmentConfig {
  baseUrl: string
  apiBaseUrl: string
  email: string
  password: string
}

/**
 * Retrieves the configuration for a specific environment from the environments.json file
 *
 * This function reads the environments configuration file and returns the configuration
 * object for the specified environment. The configuration typically contains URLs, API keys,
 * database connections, and other environment-specific settings.
 *
 * @param environment - The name of the environment to retrieve configuration for
 * @returns The environment configuration object, or undefined if environment not found
 *
 * @example
 * ```typescript
 * const devConfig = getEnvironment('development');
 * console.log(devConfig.baseUrl); // 'https://dev.example.com'
 *
 * const prodConfig = getEnvironment('production');
 * console.log(prodConfig.apiKey); // 'prod-api-key-123'
 * ```
 *
 * @throws Will throw an error if the environments.json file cannot be read or parsed
 */
export function getEnvironment(environment: string) {
  const environmentConfig: { [key: string]: EnvironmentConfig } = JSON.parse(
    readFileSync(`${process.cwd()}/src/tests/config/environments/environments.json`, 'utf8'),
  )
  return environmentConfig[environment.toLowerCase()] as EnvironmentConfig
}

/**
 * Retrieves all environment configurations from the environments.json file
 *
 * This function reads the entire environments configuration file and returns all
 * available environment configurations. Useful for listing available environments
 * or performing operations across all environments.
 *
 * @returns An object containing all environment configurations, keyed by environment name
 *
 * @example
 * ```typescript
 * const allEnvs = getAllEnvironments();
 * console.log(Object.keys(allEnvs)); // ['development', 'staging', 'production']
 *
 * // Iterate through all environments
 * Object.entries(allEnvs).forEach(([name, config]) => {
 *   console.log(`${name}: ${config.baseUrl}`);
 * });
 * ```
 *
 * @throws Will throw an error if the environments.json file cannot be read or parsed
 */
export function getAllEnvironments() {
  const environmentConfig = JSON.parse(
    readFileSync(`${process.cwd()}/src/tests/config/environments/environments.json`, 'utf8'),
  )
  return environmentConfig
}
