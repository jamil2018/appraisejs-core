interface EnvironmentConfig {
  baseUrl: string
  apiBaseUrl: string
  email: string
  passwordEnvironmentVariable: string
}

type ProjectableEnvironment = {
  baseUrl: string
  apiBaseUrl: string | null
  username: string | null
  passwordEnvironmentVariable: string | null
}

export function projectEnvironmentConfig(environment: ProjectableEnvironment): EnvironmentConfig {
  return {
    baseUrl: environment.baseUrl,
    apiBaseUrl: environment.apiBaseUrl || '',
    email: environment.username || '',
    passwordEnvironmentVariable: environment.passwordEnvironmentVariable || '',
  }
}
