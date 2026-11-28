import { z } from 'zod'

import { withProjectScope } from '@/lib/project-scope'
import { qualityJourneyIdentifierSchema } from './contracts'

export const journeyRecordReferenceSchema = z.object({
  kind: z.enum(['test-case', 'test-run', 'report']),
  id: qualityJourneyIdentifierSchema,
})

const recordContextSchema = journeyRecordReferenceSchema.extend({
  source: z.literal('appraise.record/v1'),
  title: z.string().min(1).max(512),
})

const briefFileContextSchema = z
  .object({
    source: z.literal('appraise.brief-file/v1'),
    originalContext: z.string().max(8_000).nullable(),
    file: z.object({ name: z.string().min(1).max(128), content: z.string().min(1).max(6_000) }).strict(),
  })
  .strict()

export type BriefFile = z.infer<typeof briefFileContextSchema>['file']

export function getBriefFileContext(context?: string) {
  if (!context?.startsWith('{')) return undefined
  try {
    const parsed = briefFileContextSchema.safeParse(JSON.parse(context))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

export function withBriefFileContext(originalContext: string | undefined, file: BriefFile | null) {
  if (!file) return originalContext
  const context = JSON.stringify({ source: 'appraise.brief-file/v1', originalContext: originalContext ?? null, file })
  if (context.length > 8_000) throw new Error('The selected file is too long for this brief.')
  return context
}

export function withoutBriefFileContext(context?: string) {
  const attached = getBriefFileContext(context)
  return attached ? (attached.originalContext ?? undefined) : context
}

export type JourneyRecordReference = z.infer<typeof journeyRecordReferenceSchema>
export type JourneyRecordContext = z.infer<typeof recordContextSchema>

export const journeyRecordLabels: Record<JourneyRecordReference['kind'], string> = {
  'test-case': 'Test case',
  'test-run': 'Test run',
  report: 'Report',
}

export function journeyRecordBriefHref(projectId: string, reference: JourneyRecordReference) {
  const query = new URLSearchParams({ record: reference.id, kind: reference.kind })
  return withProjectScope(`/quality-journeys/new?${query}`, projectId)
}

export function getBriefRecordContext(context?: string) {
  context = withoutBriefFileContext(context)
  if (!context?.startsWith('{')) return undefined
  try {
    const parsed = recordContextSchema.safeParse(JSON.parse(context))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}
