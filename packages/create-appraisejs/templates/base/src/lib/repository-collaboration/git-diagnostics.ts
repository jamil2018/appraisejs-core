const maximumDiagnosticLength = 4_000

function redactValue(value: string): string {
  return value
    .replace(/(https?:\/\/)[^\s/@]+@/giu, '$1[REDACTED]@')
    .replace(/(authorization|token|password|secret|credential)=([^\s&]+)/giu, '$1=[REDACTED]')
    .replace(/(bearer\s+)[^\s]+/giu, '$1[REDACTED]')
}

/** Keeps Git failures actionable without exposing credential material. */
export function sanitizeGitDiagnostic(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? '')
  const sanitized = redactValue(message.replace(/\u001b\[[0-9;]*m/gu, '').trim())
  return sanitized.length > maximumDiagnosticLength ? `${sanitized.slice(0, maximumDiagnosticLength)}…` : sanitized
}
