import { readFileSync } from 'fs'
import { getAutomationEnvironmentsFilePath } from './paths.js'

interface EnvironmentConfig {
  baseUrl: string
  apiBaseUrl: string
  email: string
  passwordEnvironmentVariable: string
}

export type ResolvedEnvironmentConfig = Omit<EnvironmentConfig, 'passwordEnvironmentVariable'> & {
  passwordEnvironmentVariable: string
  password?: string
}

function resolvePassword(config: EnvironmentConfig) {
  if (!config.passwordEnvironmentVariable) return undefined
  const password = process.env[config.passwordEnvironmentVariable]
  if (!password) {
    throw new Error(`Missing environment credential reference ${config.passwordEnvironmentVariable}.`)
  }
  return password
}

export function getEnvironment(environment: string): ResolvedEnvironmentConfig {
  const environmentConfig: Record<string, EnvironmentConfig> = JSON.parse(
    readFileSync(getAutomationEnvironmentsFilePath(), 'utf8'),
  )

  const config = environmentConfig[environment.toLowerCase()] as EnvironmentConfig
  return { ...config, password: resolvePassword(config) }
}

export function getAllEnvironments(): Record<string, EnvironmentConfig> {
  return JSON.parse(readFileSync(getAutomationEnvironmentsFilePath(), 'utf8'))
}
