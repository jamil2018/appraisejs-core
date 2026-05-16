import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { moduleSchema } from '@/constants/form-opts/module-form-opts'
import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import { tagSchema } from '@/constants/form-opts/tag-form-opts'
import { testSuiteSchema } from '@/constants/form-opts/test-suite-form-opts'
import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import { testRunSchema } from '@/constants/form-opts/test-run-form-opts'
import { templateTestCaseSchema } from '@/constants/form-opts/template-test-case-form-opts'
import { templateStepGroupSchema } from '@/constants/form-opts/template-step-group-form-opts'
import {
  createModule,
  deleteModules,
  getModuleByIdOrThrow,
  listModules,
  updateModule,
} from '@/services/module/module-service'
import {
  createEnvironment,
  deleteEnvironments,
  getEnvironmentByIdOrThrow,
  listEnvironments,
  updateEnvironment,
} from '@/services/environment/environment-service'
import {
  createTag,
  deleteTags,
  getTagByIdOrThrow,
  listFilterTags,
  updateTag,
} from '@/services/tag/tag-service'
import {
  checkLocatorGroupNameUnique,
  createLocatorGroup,
  deleteLocatorGroups,
  getLocatorGroupByIdOrThrow,
  listLocatorGroups,
  updateLocatorGroup,
} from '@/services/locator-group/locator-group-service'
import {
  deleteLocators,
  getLocatorByIdOrThrow,
  listLocators,
  syncLocatorsFromFiles,
} from '@/services/locator/locator-service'
import {
  createTestSuiteFromInput,
  deleteTestSuitesByIds,
  getTestSuiteByIdOrThrow,
  listTestSuites,
  updateTestSuiteFromInput,
} from '@/services/test-suite/test-suite-service'
import {
  createTestCaseFromInput,
  deleteTestCasesByIds,
  getTestCaseByIdOrThrow,
  listTestCases,
  updateTestCaseFromInput,
} from '@/services/test-case/test-case-service'
import {
  createTemplateStep,
  deleteTemplateSteps,
  getTemplateStepByIdOrThrow,
  listAllTemplateStepParameters,
  listTemplateSteps,
  updateTemplateStep,
} from '@/services/template-step/template-step-service'
import {
  createTemplateTestCase,
  deleteTemplateTestCases,
  getTemplateTestCaseByIdOrThrow,
  listTemplateTestCases,
  updateTemplateTestCase,
} from '@/services/template-test-case/template-test-case-service'
import {
  createTemplateStepGroup,
  deleteTemplateStepGroups,
  getTemplateStepGroupByIdOrThrow,
  listTemplateStepGroups,
  updateTemplateStepGroup,
} from '@/services/template-step-group/template-step-group-service'
import {
  cancelTestRunService,
  checkTraceViewerStatusService,
  createTestRunFromValidatedValue,
  deleteTestRunsByIds,
  getTestRunByIdOrThrow,
  getTestRunLogsService,
  isTestRunNameTaken,
  listTestRuns,
  listTestSuiteTestCases,
  spawnTraceViewerService,
} from '@/services/test-run/test-run-service'
import {
  getAllTestCaseMetricsForFilter,
  getAllTestSuiteMetricsForFilter,
  getReportByIdOrThrow,
  listReports,
} from '@/services/report/report-service'
import {
  getDashboardMetrics,
  getEntityMetrics,
  getRunningTestRunsCount,
  getTestSuiteExecutionData,
} from '@/services/dashboard/dashboard-service'
import {
  createModuleAction,
  deleteModuleAction,
  getAllModulesAction,
  getModuleByIdAction,
  updateModuleAction,
} from '@/actions/modules/module-actions'
import {
  createEnvironmentAction,
  deleteEnvironmentAction,
  getAllEnvironmentsAction,
  getEnvironmentByIdAction,
  updateEnvironmentAction,
} from '@/actions/environments/environment-actions'
import {
  createTagAction,
  deleteTagAction,
  getAllTagsAction,
  getTagByIdAction,
  updateTagAction,
} from '@/actions/tags/tag-actions'
import {
  checkLocatorGroupNameUniqueAction,
  createLocatorGroupAction,
  deleteLocatorGroupAction,
  getAllLocatorGroupsAction,
  getLocatorGroupByIdAction,
  updateLocatorGroupAction,
} from '@/actions/locator-groups/locator-group-actions'
import {
  deleteLocatorAction,
  getAllLocatorsAction,
  getLocatorByIdAction,
  syncLocatorsFromFilesAction,
} from '@/actions/locator/locator-actions'
import {
  createTestSuiteAction,
  deleteTestSuiteAction,
  getAllTestSuitesAction,
  getTestSuiteByIdAction,
  updateTestSuiteAction,
} from '@/actions/test-suite/test-suite-actions'
import {
  createTestCaseAction,
  deleteTestCaseAction,
  getAllTestCasesAction,
  getTestCaseByIdAction,
  updateTestCaseAction,
} from '@/actions/test-case/test-case-actions'
import {
  createTemplateStepAction,
  deleteTemplateStepAction,
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
  getTemplateStepByIdAction,
  updateTemplateStepAction,
} from '@/actions/template-step/template-step-actions'
import {
  createTemplateTestCaseAction,
  deleteTemplateTestCaseAction,
  getAllTemplateTestCasesAction,
  getTemplateTestCaseByIdAction,
  updateTemplateTestCaseAction,
} from '@/actions/template-test-case/template-test-case-actions'
import {
  createTemplateStepGroupAction,
  deleteTemplateStepGroupAction,
  getAllTemplateStepGroupsAction,
  getTemplateStepGroupByIdAction,
  updateTemplateStepGroupAction,
} from '@/actions/template-step-group/template-step-group-actions'
import {
  cancelTestRunAction,
  checkTestRunNameUniqueAction,
  checkTraceViewerStatusAction,
  createTestRunAction,
  deleteTestRunAction,
  getAllTestRunsAction,
  getAllTestSuiteTestCasesAction,
  getTestRunByIdAction,
  getTestRunLogsAction,
  spawnTraceViewerAction,
} from '@/actions/test-run/test-run-actions'
import {
  getAllReportsAction,
  getAllTestCaseMetricsAction,
  getAllTestSuiteMetricsAction,
  getReportByIdAction,
} from '@/actions/reports/report-actions'
import {
  getDashboardMetricsAction,
  getEntityMetricsAction,
  getRunningTestRunsCountAction,
  getTestSuiteExecutionDataAction,
} from '@/actions/dashboard/dashboard-actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/constants/form-opts/module-form-opts', () => ({ moduleSchema: { parse: vi.fn() } }))
vi.mock('@/constants/form-opts/environment-form-opts', () => ({ environmentSchema: { parse: vi.fn() } }))
vi.mock('@/constants/form-opts/tag-form-opts', () => ({ tagSchema: { parse: vi.fn() } }))
vi.mock('@/constants/form-opts/test-suite-form-opts', () => ({ testSuiteSchema: { parse: vi.fn() } }))
vi.mock('@/constants/form-opts/test-case-form-opts', () => ({ testCaseSchema: { parse: vi.fn() } }))
vi.mock('@/constants/form-opts/test-run-form-opts', () => ({ testRunSchema: { parse: vi.fn() } }))
vi.mock('@/constants/form-opts/template-test-case-form-opts', () => ({
  templateTestCaseSchema: { parse: vi.fn() },
}))
vi.mock('@/constants/form-opts/template-step-group-form-opts', () => ({
  templateStepGroupSchema: { parse: vi.fn() },
}))
vi.mock('@/constants/form-opts/template-test-step-form-opts', () => ({
  templateStepSchema: { parse: vi.fn() },
}))

vi.mock('@/services/module/module-service', () => ({
  createModule: vi.fn(),
  deleteModules: vi.fn(),
  getModuleByIdOrThrow: vi.fn(),
  listModules: vi.fn(),
  updateModule: vi.fn(),
}))

vi.mock('@/services/environment/environment-service', () => ({
  createEnvironment: vi.fn(),
  deleteEnvironments: vi.fn(),
  getEnvironmentByIdOrThrow: vi.fn(),
  listEnvironments: vi.fn(),
  updateEnvironment: vi.fn(),
}))

vi.mock('@/services/tag/tag-service', () => ({
  createTag: vi.fn(),
  deleteTags: vi.fn(),
  getTagByIdOrThrow: vi.fn(),
  listFilterTags: vi.fn(),
  updateTag: vi.fn(),
}))

vi.mock('@/services/locator-group/locator-group-service', () => ({
  checkLocatorGroupNameUnique: vi.fn(),
  createLocatorGroup: vi.fn(),
  deleteLocatorGroups: vi.fn(),
  getLocatorGroupByIdOrThrow: vi.fn(),
  listLocatorGroups: vi.fn(),
  updateLocatorGroup: vi.fn(),
}))

vi.mock('@/services/locator/locator-service', () => ({
  deleteLocators: vi.fn(),
  getLocatorByIdOrThrow: vi.fn(),
  listLocators: vi.fn(),
  syncLocatorsFromFiles: vi.fn(),
}))

vi.mock('@/services/test-suite/test-suite-service', () => ({
  createTestSuiteFromInput: vi.fn(),
  deleteTestSuitesByIds: vi.fn(),
  getTestSuiteByIdOrThrow: vi.fn(),
  listTestSuites: vi.fn(),
  updateTestSuiteFromInput: vi.fn(),
}))

vi.mock('@/services/test-case/test-case-service', () => ({
  createTestCaseFromInput: vi.fn(),
  deleteTestCasesByIds: vi.fn(),
  getTestCaseByIdOrThrow: vi.fn(),
  listTestCases: vi.fn(),
  updateTestCaseFromInput: vi.fn(),
}))

vi.mock('@/services/template-step/template-step-service', () => ({
  createTemplateStep: vi.fn(),
  deleteTemplateSteps: vi.fn(),
  getTemplateStepByIdOrThrow: vi.fn(),
  listAllTemplateStepParameters: vi.fn(),
  listTemplateSteps: vi.fn(),
  updateTemplateStep: vi.fn(),
}))

vi.mock('@/services/template-test-case/template-test-case-service', () => ({
  createTemplateTestCase: vi.fn(),
  deleteTemplateTestCases: vi.fn(),
  getTemplateTestCaseByIdOrThrow: vi.fn(),
  listTemplateTestCases: vi.fn(),
  updateTemplateTestCase: vi.fn(),
}))

vi.mock('@/services/template-step-group/template-step-group-service', () => ({
  createTemplateStepGroup: vi.fn(),
  deleteTemplateStepGroups: vi.fn(),
  getTemplateStepGroupByIdOrThrow: vi.fn(),
  listTemplateStepGroups: vi.fn(),
  updateTemplateStepGroup: vi.fn(),
}))

vi.mock('@/services/test-run/test-run-service', () => ({
  cancelTestRunService: vi.fn(),
  checkTraceViewerStatusService: vi.fn(),
  createTestRunFromValidatedValue: vi.fn(),
  deleteTestRunsByIds: vi.fn(),
  getTestRunByIdOrThrow: vi.fn(),
  getTestRunLogsService: vi.fn(),
  isTestRunNameTaken: vi.fn(),
  listTestRuns: vi.fn(),
  listTestSuiteTestCases: vi.fn(),
  spawnTraceViewerService: vi.fn(),
}))

vi.mock('@/services/report/report-service', () => ({
  getAllTestCaseMetricsForFilter: vi.fn(),
  getAllTestSuiteMetricsForFilter: vi.fn(),
  getReportByIdOrThrow: vi.fn(),
  listReports: vi.fn(),
}))

vi.mock('@/services/dashboard/dashboard-service', () => ({
  getDashboardMetrics: vi.fn(),
  getEntityMetrics: vi.fn(),
  getRunningTestRunsCount: vi.fn(),
  getTestSuiteExecutionData: vi.fn(),
}))

const payload = { name: 'Smoke' }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('module actions', () => {
  it('wraps list, get, delete, create, and update module service calls', async () => {
    vi.mocked(listModules).mockResolvedValueOnce([{ id: 'module-1' }] as never)
    await expect(getAllModulesAction()).resolves.toMatchObject({ success: true, data: [{ id: 'module-1' }] })

    vi.mocked(getModuleByIdOrThrow).mockResolvedValueOnce({ id: 'module-1' } as never)
    await expect(getModuleByIdAction('module-1')).resolves.toMatchObject({ success: true, data: { id: 'module-1' } })

    await expect(deleteModuleAction(['module-1'])).resolves.toMatchObject({
      success: true,
      message: 'Modules deleted successfully',
    })
    expect(deleteModules).toHaveBeenCalledWith(['module-1'])

    vi.mocked(createModule).mockResolvedValueOnce({ id: 'module-2' } as never)
    await expect(createModuleAction(null, payload as never)).resolves.toMatchObject({
      success: true,
      data: { id: 'module-2' },
    })

    vi.mocked(updateModule).mockResolvedValueOnce({ id: 'module-1' } as never)
    await expect(updateModuleAction(null, payload as never, 'module-1')).resolves.toMatchObject({
      success: true,
      data: { id: 'module-1' },
    })

    expect(moduleSchema.parse).toHaveBeenCalledTimes(2)
    expect(createModule).toHaveBeenCalledWith(payload)
    expect(updateModule).toHaveBeenCalledWith('module-1', payload)
    expect(revalidatePath).toHaveBeenCalledWith('/modules')
  })
})

describe('environment actions', () => {
  it('wraps list, get, delete, create, and update environment service calls', async () => {
    vi.mocked(listEnvironments).mockResolvedValueOnce([{ id: 'env-1' }] as never)
    await expect(getAllEnvironmentsAction()).resolves.toMatchObject({ success: true, data: [{ id: 'env-1' }] })

    vi.mocked(getEnvironmentByIdOrThrow).mockResolvedValueOnce({ id: 'env-1' } as never)
    await expect(getEnvironmentByIdAction('env-1')).resolves.toMatchObject({ success: true, data: { id: 'env-1' } })

    await expect(deleteEnvironmentAction(['env-1'])).resolves.toMatchObject({
      success: true,
      message: 'Environments deleted successfully',
    })
    expect(deleteEnvironments).toHaveBeenCalledWith(['env-1'])

    vi.mocked(createEnvironment).mockResolvedValueOnce({ id: 'env-2' } as never)
    await expect(createEnvironmentAction(null, payload as never)).resolves.toMatchObject({
      success: true,
      data: { id: 'env-2' },
    })

    vi.mocked(updateEnvironment).mockResolvedValueOnce({ id: 'env-1' } as never)
    await expect(updateEnvironmentAction(null, payload as never, 'env-1')).resolves.toMatchObject({
      success: true,
      data: { id: 'env-1' },
    })

    expect(environmentSchema.parse).toHaveBeenCalledTimes(2)
    expect(createEnvironment).toHaveBeenCalledWith(payload)
    expect(updateEnvironment).toHaveBeenCalledWith('env-1', payload)
    expect(revalidatePath).toHaveBeenCalledWith('/environments')
  })
})

describe('tag actions', () => {
  it('wraps list, get, delete, create, and update tag service calls', async () => {
    vi.mocked(listFilterTags).mockResolvedValueOnce([{ id: 'tag-1' }] as never)
    await expect(getAllTagsAction()).resolves.toMatchObject({ success: true, data: [{ id: 'tag-1' }] })

    vi.mocked(getTagByIdOrThrow).mockResolvedValueOnce({ id: 'tag-1' } as never)
    await expect(getTagByIdAction('tag-1')).resolves.toMatchObject({ success: true, data: { id: 'tag-1' } })

    await expect(deleteTagAction(['tag-1'])).resolves.toMatchObject({
      success: true,
      message: 'Tag deleted successfully',
    })
    expect(deleteTags).toHaveBeenCalledWith(['tag-1'])

    vi.mocked(createTag).mockResolvedValueOnce({ id: 'tag-2' } as never)
    await expect(createTagAction(null, payload as never)).resolves.toMatchObject({
      success: true,
      data: { id: 'tag-2' },
    })

    vi.mocked(updateTag).mockResolvedValueOnce({ id: 'tag-1' } as never)
    await expect(updateTagAction(null, payload as never, 'tag-1')).resolves.toMatchObject({
      success: true,
      data: { id: 'tag-1' },
    })

    expect(tagSchema.parse).toHaveBeenCalledTimes(2)
    expect(createTag).toHaveBeenCalledWith(payload)
    expect(updateTag).toHaveBeenCalledWith('tag-1', payload)
    expect(revalidatePath).toHaveBeenCalledWith('/tags')
  })
})

describe('locator group actions', () => {
  it('wraps locator group service calls and uniqueness checks', async () => {
    vi.mocked(listLocatorGroups).mockResolvedValueOnce([{ id: 'group-1' }] as never)
    await expect(getAllLocatorGroupsAction()).resolves.toMatchObject({ success: true, data: [{ id: 'group-1' }] })

    vi.mocked(getLocatorGroupByIdOrThrow).mockResolvedValueOnce({ id: 'group-1' } as never)
    await expect(getLocatorGroupByIdAction('group-1')).resolves.toMatchObject({
      success: true,
      data: { id: 'group-1' },
    })

    vi.mocked(createLocatorGroup).mockResolvedValueOnce({ id: 'group-2' } as never)
    await expect(createLocatorGroupAction(null, payload as never)).resolves.toMatchObject({
      success: true,
      data: { id: 'group-2' },
    })

    vi.mocked(updateLocatorGroup).mockResolvedValueOnce({ id: 'group-1' } as never)
    await expect(updateLocatorGroupAction(null, payload as never, 'group-1')).resolves.toMatchObject({
      success: true,
      data: { id: 'group-1' },
    })

    await expect(deleteLocatorGroupAction(['group-1', 'group-2'])).resolves.toMatchObject({
      success: true,
      data: ['group-1', 'group-2'],
    })
    expect(deleteLocatorGroups).toHaveBeenCalledWith(['group-1', 'group-2'])

    vi.mocked(checkLocatorGroupNameUnique).mockResolvedValueOnce(true)
    await expect(checkLocatorGroupNameUniqueAction('Home', 'group-1')).resolves.toMatchObject({
      success: true,
      data: { isUnique: true },
    })

    expect(createLocatorGroup).toHaveBeenCalledWith(payload)
    expect(updateLocatorGroup).toHaveBeenCalledWith('group-1', payload)
    expect(checkLocatorGroupNameUnique).toHaveBeenCalledWith('Home', 'group-1')
    expect(revalidatePath).toHaveBeenCalledWith('/locator-groups')
  })
})

describe('locator actions', () => {
  it('wraps locator service calls and sync results', async () => {
    vi.mocked(listLocators).mockResolvedValueOnce([{ id: 'loc-1' }] as never)
    await expect(getAllLocatorsAction()).resolves.toMatchObject({ success: true, data: [{ id: 'loc-1' }] })

    vi.mocked(getLocatorByIdOrThrow).mockResolvedValueOnce({ id: 'loc-1' } as never)
    await expect(getLocatorByIdAction('loc-1')).resolves.toMatchObject({ success: true, data: { id: 'loc-1' } })

    vi.mocked(deleteLocators).mockResolvedValueOnce({ count: 1 } as never)
    await expect(deleteLocatorAction(['loc-1'])).resolves.toMatchObject({ success: true, data: { count: 1 } })

    vi.mocked(syncLocatorsFromFiles).mockResolvedValueOnce({
      conflicts: 0,
      errors: [],
      locatorsCreated: 2,
      locatorsMergedToFile: 1,
    } as never)
    await expect(syncLocatorsFromFilesAction()).resolves.toMatchObject({
      success: true,
      data: { conflicts: 0, errors: [], locatorsCreated: 2, locatorsMergedToFile: 1 },
    })

    expect(deleteLocators).toHaveBeenCalledWith(['loc-1'])
    expect(revalidatePath).toHaveBeenCalledWith('/locators')
  })
})

describe('test suite actions', () => {
  it('wraps test suite service calls and rejects missing update ids', async () => {
    vi.mocked(listTestSuites).mockResolvedValueOnce([{ id: 'suite-1' }] as never)
    await expect(getAllTestSuitesAction()).resolves.toMatchObject({ success: true, data: [{ id: 'suite-1' }] })

    vi.mocked(getTestSuiteByIdOrThrow).mockResolvedValueOnce({ id: 'suite-1' } as never)
    await expect(getTestSuiteByIdAction('suite-1')).resolves.toMatchObject({ success: true, data: { id: 'suite-1' } })

    vi.mocked(createTestSuiteFromInput).mockResolvedValueOnce({ id: 'suite-2' } as never)
    await expect(createTestSuiteAction(null, payload as never)).resolves.toMatchObject({
      success: true,
      data: { id: 'suite-2' },
    })

    await expect(deleteTestSuiteAction(['suite-1'])).resolves.toMatchObject({
      success: true,
      message: 'Test suite(s) deleted successfully',
    })
    expect(deleteTestSuitesByIds).toHaveBeenCalledWith(['suite-1'])

    await expect(updateTestSuiteAction(null, payload as never)).resolves.toMatchObject({
      status: 400,
      success: false,
    })

    await expect(updateTestSuiteAction(null, payload as never, 'suite-1')).resolves.toMatchObject({
      success: true,
      message: 'Test suite updated successfully',
    })

    expect(testSuiteSchema.parse).toHaveBeenCalledTimes(3)
    expect(updateTestSuiteFromInput).toHaveBeenCalledWith(payload, 'suite-1')
    expect(revalidatePath).toHaveBeenCalledWith('/test-suites')
  })
})

describe('test case actions', () => {
  it('wraps test case service calls and rejects missing update ids', async () => {
    vi.mocked(listTestCases).mockResolvedValueOnce([{ id: 'case-1' }] as never)
    await expect(getAllTestCasesAction()).resolves.toMatchObject({ success: true, data: [{ id: 'case-1' }] })

    vi.mocked(getTestCaseByIdOrThrow).mockResolvedValueOnce({ id: 'case-1' } as never)
    await expect(getTestCaseByIdAction('case-1')).resolves.toMatchObject({ success: true, data: { id: 'case-1' } })

    vi.mocked(createTestCaseFromInput).mockResolvedValueOnce({ id: 'case-2' } as never)
    await expect(createTestCaseAction(payload as never)).resolves.toMatchObject({
      success: true,
      data: { id: 'case-2' },
    })

    await expect(deleteTestCaseAction(['case-1'])).resolves.toMatchObject({
      success: true,
      message: 'Test case(s) deleted successfully',
    })
    expect(deleteTestCasesByIds).toHaveBeenCalledWith(['case-1'])

    await expect(updateTestCaseAction(payload as never)).resolves.toMatchObject({
      status: 400,
      success: false,
    })

    vi.mocked(updateTestCaseFromInput).mockResolvedValueOnce({ id: 'case-1' } as never)
    await expect(updateTestCaseAction(payload as never, 'case-1')).resolves.toMatchObject({
      success: true,
      data: { id: 'case-1' },
    })

    expect(testCaseSchema.parse).toHaveBeenCalledTimes(2)
    expect(updateTestCaseFromInput).toHaveBeenCalledWith(payload, 'case-1')
    expect(revalidatePath).toHaveBeenCalledWith('/test-cases')
  })
})

describe('template step actions', () => {
  it('wraps template step service calls and parameter listing', async () => {
    vi.mocked(listTemplateSteps).mockResolvedValueOnce([{ id: 'step-1' }] as never)
    await expect(getAllTemplateStepsAction()).resolves.toMatchObject({ success: true, data: [{ id: 'step-1' }] })

    vi.mocked(getTemplateStepByIdOrThrow).mockResolvedValueOnce({ id: 'step-1' } as never)
    await expect(getTemplateStepByIdAction('step-1')).resolves.toMatchObject({ success: true, data: { id: 'step-1' } })

    vi.mocked(createTemplateStep).mockResolvedValueOnce({ id: 'step-2' } as never)
    await expect(createTemplateStepAction(null, payload as never)).resolves.toMatchObject({
      success: true,
      data: { id: 'step-2' },
    })

    vi.mocked(updateTemplateStep).mockResolvedValueOnce({ id: 'step-1' } as never)
    await expect(updateTemplateStepAction(null, payload as never, 'step-1')).resolves.toMatchObject({
      success: true,
      data: { id: 'step-1' },
    })

    await expect(deleteTemplateStepAction(['step-1'])).resolves.toMatchObject({
      success: true,
      message: 'Template steps deleted successfully',
    })
    expect(deleteTemplateSteps).toHaveBeenCalledWith(['step-1'])

    vi.mocked(listAllTemplateStepParameters).mockResolvedValueOnce([{ name: 'value' }] as never)
    await expect(getAllTemplateStepParamsAction()).resolves.toMatchObject({
      success: true,
      data: [{ name: 'value' }],
    })

    expect(createTemplateStep).toHaveBeenCalledWith(payload)
    expect(updateTemplateStep).toHaveBeenCalledWith('step-1', payload)
    expect(revalidatePath).toHaveBeenCalledWith('/template-steps')
  })
})

describe('template test case actions', () => {
  it('wraps template test case service calls', async () => {
    vi.mocked(listTemplateTestCases).mockResolvedValueOnce([{ id: 'template-case-1' }] as never)
    await expect(getAllTemplateTestCasesAction()).resolves.toMatchObject({
      success: true,
      data: [{ id: 'template-case-1' }],
    })

    vi.mocked(getTemplateTestCaseByIdOrThrow).mockResolvedValueOnce({ id: 'template-case-1' } as never)
    await expect(getTemplateTestCaseByIdAction('template-case-1')).resolves.toMatchObject({
      success: true,
      data: { id: 'template-case-1' },
    })

    vi.mocked(createTemplateTestCase).mockResolvedValueOnce({ id: 'template-case-2' } as never)
    await expect(createTemplateTestCaseAction(payload as never)).resolves.toMatchObject({
      success: true,
      data: { id: 'template-case-2' },
    })

    vi.mocked(updateTemplateTestCase).mockResolvedValueOnce({ id: 'template-case-1' } as never)
    await expect(updateTemplateTestCaseAction(payload as never, 'template-case-1')).resolves.toMatchObject({
      success: true,
      data: { id: 'template-case-1' },
    })

    await expect(deleteTemplateTestCaseAction(['template-case-1'])).resolves.toMatchObject({
      success: true,
      message: 'Template test case(s) deleted successfully',
    })
    expect(deleteTemplateTestCases).toHaveBeenCalledWith(['template-case-1'])

    expect(templateTestCaseSchema.parse).toHaveBeenCalledTimes(2)
    expect(updateTemplateTestCase).toHaveBeenCalledWith('template-case-1', payload)
    expect(revalidatePath).toHaveBeenCalledWith('/template-test-cases')
  })
})

describe('template step group actions', () => {
  it('wraps template step group service calls', async () => {
    vi.mocked(listTemplateStepGroups).mockResolvedValueOnce([{ id: 'group-1' }] as never)
    await expect(getAllTemplateStepGroupsAction()).resolves.toMatchObject({ success: true, data: [{ id: 'group-1' }] })

    vi.mocked(getTemplateStepGroupByIdOrThrow).mockResolvedValueOnce({ id: 'group-1' } as never)
    await expect(getTemplateStepGroupByIdAction('group-1')).resolves.toMatchObject({
      success: true,
      data: { id: 'group-1' },
    })

    await expect(createTemplateStepGroupAction(null, payload as never)).resolves.toMatchObject({
      success: true,
      message: 'Template step group created successfully',
    })

    await expect(updateTemplateStepGroupAction(null, payload as never, 'group-1')).resolves.toMatchObject({
      success: true,
      message: 'Template step group updated successfully',
    })

    await expect(deleteTemplateStepGroupAction(['group-1'])).resolves.toMatchObject({
      success: true,
      message: 'Template step group(s) deleted successfully',
    })
    expect(deleteTemplateStepGroups).toHaveBeenCalledWith(['group-1'])

    expect(templateStepGroupSchema.parse).toHaveBeenCalledTimes(2)
    expect(createTemplateStepGroup).toHaveBeenCalledWith(payload)
    expect(updateTemplateStepGroup).toHaveBeenCalledWith('group-1', payload)
    expect(revalidatePath).toHaveBeenCalledWith('/template-step-groups')
  })
})

describe('test run actions', () => {
  it('wraps test run service calls and maps action-specific outcomes', async () => {
    vi.mocked(listTestRuns).mockResolvedValueOnce([{ id: 'run-1' }] as never)
    await expect(getAllTestRunsAction('all')).resolves.toMatchObject({ success: true, data: [{ id: 'run-1' }] })
    expect(listTestRuns).toHaveBeenCalledWith('all')

    vi.mocked(getTestRunByIdOrThrow).mockResolvedValueOnce({ id: 'run-1' } as never)
    await expect(getTestRunByIdAction('run-1')).resolves.toMatchObject({ success: true, data: { id: 'run-1' } })

    await expect(deleteTestRunAction(['run-1'])).resolves.toMatchObject({
      success: true,
      message: 'Test run(s) deleted successfully',
    })

    vi.mocked(listTestSuiteTestCases).mockResolvedValueOnce([{ id: 'case-1' }] as never)
    await expect(getAllTestSuiteTestCasesAction()).resolves.toMatchObject({ success: true, data: [{ id: 'case-1' }] })

    vi.mocked(getTestRunLogsService).mockResolvedValueOnce(['log line'] as never)
    await expect(getTestRunLogsAction('run-1')).resolves.toMatchObject({ success: true, data: ['log line'] })

    vi.mocked(createTestRunFromValidatedValue).mockResolvedValueOnce({ id: 'db-run-1', runId: 'run-1' } as never)
    await expect(createTestRunAction(null, payload as never)).resolves.toMatchObject({
      success: true,
      data: { id: 'db-run-1', testRunId: 'run-1' },
    })
    expect(testRunSchema.parse).toHaveBeenCalledWith(payload)

    vi.mocked(checkTraceViewerStatusService).mockResolvedValueOnce({
      isRunning: true,
      kind: 'ok',
      processName: 'trace-viewer',
    } as never)
    await expect(checkTraceViewerStatusAction('run-1', 'case-1')).resolves.toMatchObject({
      success: true,
      data: { isRunning: true, processName: 'trace-viewer' },
    })

    vi.mocked(spawnTraceViewerService).mockResolvedValueOnce({ kind: 'no_trace_path' } as never)
    await expect(spawnTraceViewerAction('run-1', 'case-1')).resolves.toMatchObject({
      status: 400,
      success: false,
    })

    vi.mocked(cancelTestRunService).mockResolvedValueOnce({ kind: 'already_cancelling' } as never)
    await expect(cancelTestRunAction('run-1')).resolves.toMatchObject({
      success: true,
      message: 'Test run cancellation is already in progress',
    })

    vi.mocked(cancelTestRunService).mockResolvedValueOnce({ kind: 'stopped' } as never)
    await expect(cancelTestRunAction('run-1')).resolves.toMatchObject({
      success: true,
      message: 'Test run stopped successfully',
    })

    vi.mocked(isTestRunNameTaken).mockResolvedValueOnce(false)
    await expect(checkTestRunNameUniqueAction('Nightly', 'run-1')).resolves.toMatchObject({
      success: true,
      data: { isUnique: true },
    })

    expect(deleteTestRunsByIds).toHaveBeenCalledWith(['run-1'])
    expect(isTestRunNameTaken).toHaveBeenCalledWith('Nightly', 'run-1')
    expect(revalidatePath).toHaveBeenCalledWith('/test-runs')
    expect(revalidatePath).toHaveBeenCalledWith('/test-runs/run-1')
  })
})

describe('report actions', () => {
  it('wraps report service calls and metrics lookups', async () => {
    vi.mocked(listReports).mockResolvedValueOnce([{ id: 'report-1' }] as never)
    await expect(getAllReportsAction()).resolves.toMatchObject({ success: true, data: [{ id: 'report-1' }] })

    vi.mocked(getReportByIdOrThrow).mockResolvedValueOnce({ id: 'report-1' } as never)
    await expect(getReportByIdAction('report-1')).resolves.toMatchObject({ success: true, data: { id: 'report-1' } })

    vi.mocked(getAllTestCaseMetricsForFilter).mockResolvedValueOnce([{ total: 1 }] as never)
    await expect(getAllTestCaseMetricsAction('last-7-days')).resolves.toMatchObject({
      success: true,
      data: [{ total: 1 }],
    })

    vi.mocked(getAllTestSuiteMetricsForFilter).mockResolvedValueOnce([{ total: 2 }] as never)
    await expect(getAllTestSuiteMetricsAction('last-7-days')).resolves.toMatchObject({
      success: true,
      data: [{ total: 2 }],
    })
  })
})

describe('dashboard actions', () => {
  it('wraps dashboard service calls', async () => {
    vi.mocked(getDashboardMetrics).mockResolvedValueOnce({ total: 1 } as never)
    await expect(getDashboardMetricsAction()).resolves.toMatchObject({ success: true, data: { total: 1 } })

    vi.mocked(getEntityMetrics).mockResolvedValueOnce({ modules: 1 } as never)
    await expect(getEntityMetricsAction()).resolves.toMatchObject({ success: true, data: { modules: 1 } })

    vi.mocked(getRunningTestRunsCount).mockResolvedValueOnce(2)
    await expect(getRunningTestRunsCountAction()).resolves.toMatchObject({ success: true, data: 2 })

    vi.mocked(getTestSuiteExecutionData).mockResolvedValueOnce([{ suite: 'Smoke' }] as never)
    await expect(getTestSuiteExecutionDataAction()).resolves.toMatchObject({
      success: true,
      data: [{ suite: 'Smoke' }],
    })
  })
})
