import { withProjectScope } from '@/lib/project-scope'

export const workspaceRecordKinds = ['TEST_CASE', 'TEST_SUITE', 'CASE_TEMPLATE', 'TEST_RUN', 'REPORT'] as const
export type WorkspaceRecordKind = (typeof workspaceRecordKinds)[number]

export type WorkspaceRecord = {
  kind: WorkspaceRecordKind
  id: string
  title: string
}

const records: Record<WorkspaceRecordKind, { label: string; plural: string; route: string }> = {
  TEST_CASE: { label: 'Test case', plural: 'test cases', route: '/test-cases/modify' },
  TEST_SUITE: { label: 'Test suite', plural: 'test suites', route: '/test-suites/modify' },
  CASE_TEMPLATE: { label: 'Case template', plural: 'case templates', route: '/template-test-cases/modify' },
  TEST_RUN: { label: 'Test run', plural: 'test runs', route: '/test-runs' },
  REPORT: { label: 'Report', plural: 'reports', route: '/reports' },
}

export function workspaceRecordLabel(kind: WorkspaceRecordKind) {
  return records[kind].label
}

export function workspaceRecordPlural(kind: WorkspaceRecordKind) {
  return records[kind].plural
}

export function workspaceRecordHref(projectId: string, record: WorkspaceRecord) {
  return withProjectScope(`${records[record.kind].route}/${encodeURIComponent(record.id)}`, projectId)
}
