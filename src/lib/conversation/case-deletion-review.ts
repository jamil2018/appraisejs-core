import { z } from 'zod'

export const caseDeletionReviewHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const caseDeletionReviewSchema = z
  .object({
    hash: caseDeletionReviewHashSchema,
    status: z.enum(['PENDING', 'DELETED', 'KEPT']),
    cases: z
      .array(
        z
          .object({
            id: z.string().min(1).max(128),
            title: z.string().min(1).max(512),
            updatedAt: z.string().datetime(),
            guardEpoch: z.number().int().min(0).max(2_147_483_646),
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict()
export type CaseDeletionReview = z.infer<typeof caseDeletionReviewSchema>

export function isCaseDeletionRequest(content: string) {
  return /^(?:please\s+)?delete\s+(?:(?:all|these|the|one|two|three|\d+)\s+){0,3}(?:test\s+)?cases?\b/i.test(content)
}

export function parseCaseDeletionRequest(content: string) {
  const clause = /^(?:please\s+)?delete\s+(?:test\s+)?cases?\s+(.+?)[.!?]?$/i.exec(content)?.[1]
  if (!clause || !/^(?:"[^"\r\n]+"|“[^”\r\n]+”)(?:\s*,\s*(?:"[^"\r\n]+"|“[^”\r\n]+”)){0,31}$/.test(clause)) return null
  const titles = [...clause.matchAll(/"([^"\r\n]+)"|“([^”\r\n]+)”/g)].map(match => match[1] ?? match[2])
  return titles.some(title => !title.trim() || title.length > 512) || new Set(titles).size !== titles.length
    ? null
    : titles
}
