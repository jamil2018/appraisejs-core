export function buildCapsuleExecutionArgv(input: {
  cucumberBinaryPath: string
  configPath: string
  profile: string
  tagExpression: string
}) {
  return [
    input.cucumberBinaryPath,
    '--config',
    input.configPath,
    '--profile',
    input.profile,
    '--tags',
    input.tagExpression,
  ]
}

export function buildCapsulePreflightArgv(input: {
  cucumberBinaryPath: string
  configPath: string
  profile: string
  tagExpression: string
}) {
  return [...buildCapsuleExecutionArgv(input), '--dry-run']
}
