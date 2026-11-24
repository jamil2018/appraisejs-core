import { withProjectScope } from '@/lib/project-scope'
import type { JourneyRecordReference } from '@/lib/quality-journey/record-context'

const kinds = {
  'test-case': 'TEST_CASE',
  'test-run': 'TEST_RUN',
  report: 'REPORT',
} as const

export type ChatContext = {
  kind: (typeof kinds)[keyof typeof kinds]
  id: string
  title: string
}

export type ChatContextReference = Omit<ChatContext, 'title'>

export function conversationContextHref(projectId: string, { kind, id }: JourneyRecordReference) {
  const query = new URLSearchParams({ kind, record: id })
  return withProjectScope(`/conversations/new?${query}`, projectId)
}

export function chatContextFromJourney(record: JourneyRecordReference & { title: string }): ChatContext {
  return { kind: kinds[record.kind], id: record.id, title: record.title }
}

export function journeyReferenceFromChat({ kind, id }: ChatContextReference): JourneyRecordReference {
  const mapping = { TEST_CASE: 'test-case', TEST_RUN: 'test-run', REPORT: 'report' } as const
  return { kind: mapping[kind], id }
}
