import crypto from 'crypto'

export function generateUniqueTestCaseIdentifier(): string {
  const id = crypto.randomBytes(8).toString('hex')
  return `tc_${id}`
}
