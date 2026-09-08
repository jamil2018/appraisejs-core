function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const sensitivePattern = /(?:api[_-]?key|password|secret|authorization|bearer\s+|-----BEGIN)/i
const machinePathPattern = /(?:^|[\s"'`(])(?:~[\\/]|\/(?:Users|home|private|var|tmp)\/|[A-Za-z]:[\\/])/i

export function containsForbiddenLearningDetail(value) {
  return sensitivePattern.test(value) || machinePathPattern.test(value)
}

export function assertSanitizedLearningText(value, label, limit = 1200) {
  assert(typeof value === 'string' && value.trim().length > 0, `${label}: blank value`)
  assert(value.length <= limit, `${label}: value exceeds ${limit} characters`)
  assert(!/[\r\n]/.test(value), `${label}: multiline value is not allowed`)
  assert(
    !containsForbiddenLearningDetail(value),
    `${label}: potentially sensitive or machine-specific evidence is not allowed`,
  )
  return value.trim()
}

export function sanitizeLegacyLearningText(value) {
  const normalized = String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 1000)
  if (!normalized) return 'No sanitized detail was available.'
  return containsForbiddenLearningDetail(normalized)
    ? '[redacted potentially sensitive or machine-specific detail]'
    : normalized
}
