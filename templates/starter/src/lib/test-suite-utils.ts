import crypto from 'crypto'

export function generateUniqueTestSuiteIdentifier(): string {
  const id = crypto.randomBytes(8).toString('hex')
  return `ts_${id}`
}
