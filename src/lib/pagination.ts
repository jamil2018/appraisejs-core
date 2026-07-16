import { z } from 'zod'

import { ServiceError } from '@/services/shared/errors'

export const DEFAULT_PAGE_LIMIT = 50
export const MAX_PAGE_LIMIT = 100

const cursorSchema = z.object({ scope: z.string().min(1), id: z.string().min(1), sortValue: z.string().min(1) })

export type PageCursor = z.infer<typeof cursorSchema>
export type PageRequest = { cursor?: string; limit?: number }
export type Page<T> = { items: T[]; nextCursor: string | null; appliedLimit: number }

export function appliedPageLimit(limit?: number): number {
  if (limit === undefined) return DEFAULT_PAGE_LIMIT
  if (!Number.isInteger(limit) || limit < 1)
    throw new ServiceError('Pagination limit must be a positive integer.', 'VALIDATION', 400)
  return Math.min(limit, MAX_PAGE_LIMIT)
}

export function encodePageCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodePageCursor(value: string | undefined, expectedScope: string): PageCursor | undefined {
  if (!value) return undefined
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')))
    if (cursor.scope !== expectedScope) throw new Error('scope mismatch')
    return cursor
  } catch {
    throw new ServiceError('Pagination cursor is invalid for this project.', 'VALIDATION', 400)
  }
}

export function pageFromItems<T>(input: { items: T[]; limit: number; encodeCursor: (last: T) => string }): Page<T> {
  const hasMore = input.items.length > input.limit
  const items = hasMore ? input.items.slice(0, input.limit) : input.items
  const last = items.at(-1)
  return {
    items,
    nextCursor: hasMore && last ? input.encodeCursor(last) : null,
    appliedLimit: input.limit,
  }
}
