import { ServiceError } from './errors'

export function authoringEditVersion(current: Date, expectedUpdatedAt?: string) {
  if (expectedUpdatedAt === undefined) return undefined
  const expected = new Date(expectedUpdatedAt)
  if (!Number.isFinite(expected.getTime()) || expected.toISOString() !== expectedUpdatedAt)
    throw new ServiceError('The edit version is invalid. Reload this editor.', 'VALIDATION', 400)
  if (current.getTime() !== expected.getTime())
    throw new ServiceError('This record changed. Reload it before saving your draft.', 'CONFLICT', 409)
  return {
    expected,
    next: new Date(Math.max(Date.now(), expected.getTime() + 1)),
  }
}

export function throwIfStaleAuthoringUpdate(error: unknown): never {
  if (error instanceof Error && 'code' in error && error.code === 'P2025')
    throw new ServiceError('This record changed. Reload it before saving your draft.', 'CONFLICT', 409)
  throw error
}
