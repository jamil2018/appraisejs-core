/** Redacts resolved credentials without recording them in any durable runtime evidence. */
export function redactResolvedCredentials(value: string, values: Array<string | undefined | null>): string {
  const secrets = [
    ...new Set(values.filter((item): item is string => typeof item === 'string' && item.length > 0)),
  ].sort((left, right) => right.length - left.length)
  return secrets.reduce((redacted, secret) => redacted.split(secret).join('[REDACTED]'), value)
}

export function credentialRedactor(values: Array<string | undefined | null>) {
  return (value: string) => redactResolvedCredentials(value, values)
}
