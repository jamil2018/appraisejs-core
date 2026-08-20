import type { EnvironmentCredentialState } from '@prisma/client'

export type EnvironmentSecretReference = {
  passwordEnvironmentVariable: string | null
  credentialState: EnvironmentCredentialState
}

class EnvironmentSecretConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvironmentSecretConfigurationError'
  }
}

export function resolveEnvironmentPassword(
  environment: EnvironmentSecretReference,
  processEnvironment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const reference = environment.passwordEnvironmentVariable
  if (!reference) return undefined
  const value = processEnvironment[reference]
  if (!value) {
    throw new EnvironmentSecretConfigurationError(
      `The configured password environment variable "${reference}" is unavailable to this execution process.`,
    )
  }
  return value
}
