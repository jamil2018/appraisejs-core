import crypto from 'crypto'

export function generateUniqueTestCaseIdentifier(): string {
  const bytes = crypto.randomBytes(16).toString('base64url').toLowerCase()
  const cleaned = bytes.replace(/[^a-z0-9]/g, '')
  return `tc_${cleaned.slice(0, 8)}`
}
