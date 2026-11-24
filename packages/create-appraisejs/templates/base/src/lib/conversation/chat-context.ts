import { withProjectScope } from '@/lib/project-scope'
import type { JourneyRecordReference } from '@/lib/quality-journey/record-context'

const kinds = {
  'test-case': 'TEST_CASE',
  'test-run': 'TEST_RUN',
  report: 'REPORT',
} as const

export const chatContextKinds = ['TEST_CASE', 'TEST_RUN', 'REPORT', 'QUALITY_JOURNEY'] as const

export type ChatContext = {
  kind: (typeof chatContextKinds)[number]
  id: string
  title: string
}

export type ChatContextReference = Omit<ChatContext, 'title'>

export function conversationContextHref(projectId: string, { kind, id }: JourneyRecordReference) {
  const query = new URLSearchParams({ kind, record: id })
  return withProjectScope(`/conversations/new?${query}`, projectId)
}

export function chatContextFromJourney(record: JourneyRecordReference & { title: string }): ChatContext {
  return { ...chatContextReferenceFromJourney(record), title: record.title }
}

export function chatContextReferenceFromJourney({ kind, id }: JourneyRecordReference): ChatContextReference {
  return { kind: kinds[kind], id }
}

export function journeyReferenceFromChat({
  kind,
  id,
}: {
  kind: Exclude<ChatContext['kind'], 'QUALITY_JOURNEY'>
  id: string
}): JourneyRecordReference {
  const mapping = { TEST_CASE: 'test-case', TEST_RUN: 'test-run', REPORT: 'report' } as const
  return { kind: mapping[kind], id }
}
