export type EnvironmentColumn = { name: string }

export function environmentSchemaFailures(columns: EnvironmentColumn[], legacyRows: number, schema: string): string[] {
  return [
    columns.some(column => column.name === 'password') ? 'Environment table still has a password column' : null,
    legacyRows > 0 ? `${legacyRows} environment row(s) remain disabled with unresolved legacy credentials` : null,
    /^\s*password\s+String\??/m.test(schema) ? 'Prisma schema still declares Environment.password' : null,
  ].filter((failure): failure is string => failure !== null)
}

export function environmentJsonFailures(relativePath: string, content: string): string[] {
  const parsed = JSON.parse(content) as Record<string, Record<string, unknown>>
  const entryFailures = Object.entries(parsed).flatMap(([name, environment]) => [
    Object.hasOwn(environment, 'password') ? `${relativePath}:${name} contains a password field` : null,
    environment.passwordEnvironmentVariable !== undefined && typeof environment.passwordEnvironmentVariable !== 'string'
      ? `${relativePath}:${name} has a non-string passwordEnvironmentVariable`
      : null,
  ])
  return [
    ...entryFailures,
    content.includes('known-fixture-secret-sentinel') ? `${relativePath} contains the secret sentinel` : null,
  ].filter((failure): failure is string => failure !== null)
}
