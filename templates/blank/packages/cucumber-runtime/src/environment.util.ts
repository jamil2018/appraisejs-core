import { readFileSync } from 'fs'
import { getAutomationEnvironmentsFilePath } from './paths.js'

interface EnvironmentConfig {
  baseUrl: string
  apiBaseUrl: string
  email: string
  password: string
}

export function getEnvironment(environment: string): EnvironmentConfig {
  const environmentConfig: Record<string, EnvironmentConfig> = JSON.parse(
    readFileSync(getAutomationEnvironmentsFilePath(), 'utf8'),
  )

  return environmentConfig[environment.toLowerCase()] as EnvironmentConfig
}

export function getAllEnvironments(): Record<string, EnvironmentConfig> {
  return JSON.parse(readFileSync(getAutomationEnvironmentsFilePath(), 'utf8'))
}
