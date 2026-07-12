import { createHash } from 'node:crypto'

export const capsuleValidationHash = `sha256:${'a'.repeat(64)}`
export const capsuleCommandBytes = Buffer.from('{}')
export const capsuleCommandHash = `sha256:${createHash('sha256').update(capsuleCommandBytes).digest('hex')}`
