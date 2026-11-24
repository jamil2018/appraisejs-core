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
  if (!context?.startsWith('{')) return undefined
  try {
    const parsed = recordContextSchema.safeParse(JSON.parse(context))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}
