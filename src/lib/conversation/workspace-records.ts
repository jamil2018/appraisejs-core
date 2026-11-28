import { withProjectScope } from '@/lib/project-scope'
import { reportStepEvidenceHref } from '@/lib/report-step-evidence'

export const workspaceRecordKinds = ['TEST_CASE', 'TEST_SUITE', 'CASE_TEMPLATE', 'TEST_RUN', 'REPORT'] as const
export type WorkspaceRecordKind = (typeof workspaceRecordKinds)[number]

export type WorkspaceRecord = {
  kind: WorkspaceRecordKind
  id: string
  title: string
  reportStepId?: string
}

export const conversationRecordKinds = [
  ...workspaceRecordKinds,
  'MODULE',
  'TAG',
  'PROJECT',
  'ENVIRONMENT',
  'LOCATOR',
  'LOCATOR_GROUP',
  'SETTINGS',
  'COLLABORATION',
  'STEP_DEFINITION',
  'QUALITY_JOURNEY',
] as const
type ConversationRecordKind = (typeof conversationRecordKinds)[number]
export type ConversationRecord = Omit<WorkspaceRecord, 'kind'> & {
  kind: ConversationRecordKind
  destination?: 'create'
  /** Exact published definition link; absent on older saved list links. */
  stepReference?: { version: string; definitionHash: string }
}

const creationRoutes = {
  QUALITY_JOURNEY: '/quality-journeys/new',
  TEST_CASE: '/test-cases/create',
  TEST_SUITE: '/test-suites/create',
  CASE_TEMPLATE: '/template-test-cases/create',
  MODULE: '/modules/create',
  TAG: '/tags/create',
  STEP_DEFINITION: '/step-definitions/create',
  ENVIRONMENT: '/environments/create',
  LOCATOR: '/locators/create',
  LOCATOR_GROUP: '/locator-groups/create',
} as const

export function isCreatableRecordKind(kind: ConversationRecordKind): kind is keyof typeof creationRoutes {
  return Object.hasOwn(creationRoutes, kind)
}

const records: Record<ConversationRecordKind, { label: string; plural: string; route: string }> = {
  TEST_CASE: { label: 'Test case', plural: 'test cases', route: '/test-cases/modify' },
  TEST_SUITE: { label: 'Test suite', plural: 'test suites', route: '/test-suites/modify' },
  CASE_TEMPLATE: { label: 'Case template', plural: 'case templates', route: '/template-test-cases/modify' },
  TEST_RUN: { label: 'Test run', plural: 'test runs', route: '/test-runs' },
  REPORT: { label: 'Report', plural: 'reports', route: '/reports' },
  MODULE: { label: 'Module', plural: 'modules', route: '/modules/modify' },
  TAG: { label: 'Tag', plural: 'tags', route: '/tags/modify' },
  PROJECT: { label: 'Project', plural: 'projects', route: '/projects' },
  ENVIRONMENT: { label: 'Environment', plural: 'environments', route: '/environments/modify' },
  LOCATOR: { label: 'Locator', plural: 'locators', route: '/locators/modify' },
  LOCATOR_GROUP: { label: 'Locator group', plural: 'locator groups', route: '/locator-groups/modify' },
  SETTINGS: { label: 'Settings', plural: 'settings', route: '/settings' },
  COLLABORATION: { label: 'Collaboration', plural: 'collaboration operations', route: '/collaboration' },
  STEP_DEFINITION: { label: 'Step definition', plural: 'step definitions', route: '/step-definitions' },
  QUALITY_JOURNEY: { label: 'Quality Journey', plural: 'Quality Journeys', route: '/quality-journeys' },
}

export function workspaceRecordLabel(kind: ConversationRecordKind) {
  return records[kind].label
}

export function workspaceRecordPlural(kind: WorkspaceRecordKind) {
  return records[kind].plural
}

export function workspaceRecordHref(projectId: string, record: ConversationRecord) {
  if (record.kind === 'REPORT' && record.reportStepId)
    return reportStepEvidenceHref(projectId, record.id, record.reportStepId)
  if (record.destination === 'create' && isCreatableRecordKind(record.kind))
    return withProjectScope(creationRoutes[record.kind], projectId)
  if (record.kind === 'PROJECT') return withProjectScope(records.PROJECT.route, record.id)
  if (record.kind === 'SETTINGS') return withProjectScope(records.SETTINGS.route, projectId)
  if (record.kind === 'STEP_DEFINITION') {
    if (record.stepReference) {
      const search = new URLSearchParams({
        id: record.id,
        version: record.stepReference.version,
        definitionHash: record.stepReference.definitionHash,
      })
      return withProjectScope(`/step-definitions/published?${search}`, projectId)
    }
    return withProjectScope(records.STEP_DEFINITION.route, projectId)
  }
  if (record.kind === 'COLLABORATION')
    return `${withProjectScope(`${records.COLLABORATION.route}?${new URLSearchParams({ operation: record.id })}`, projectId)}#operation-history`
  return withProjectScope(`${records[record.kind].route}/${encodeURIComponent(record.id)}`, projectId)
}
