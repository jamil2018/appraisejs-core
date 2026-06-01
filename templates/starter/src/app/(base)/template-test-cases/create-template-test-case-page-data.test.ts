import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import {
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
} from '@/actions/template-step/template-step-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'

import { loadCreateTemplateTestCasePageData } from './create-template-test-case-page-data'

vi.mock('@/actions/template-step/template-step-actions', () => ({
  getAllTemplateStepParamsAction: vi.fn(),
  getAllTemplateStepsAction: vi.fn(),
}))

vi.mock('@/actions/locator/locator-actions', () => ({
  getAllLocatorsAction: vi.fn(),
}))

vi.mock('@/actions/locator-groups/locator-group-actions', () => ({
  getAllLocatorGroupsAction: vi.fn(),
}))

vi.mock('@/actions/environments/environment-actions', () => ({
  getAllEnvironmentsAction: vi.fn(),
}))

vi.mock('@/actions/modules/module-actions', () => ({
  getAllModulesAction: vi.fn(),
}))

const getAllTemplateStepParamsActionMock = vi.mocked(getAllTemplateStepParamsAction)
const getAllTemplateStepsActionMock = vi.mocked(getAllTemplateStepsAction)
const getAllLocatorsActionMock = vi.mocked(getAllLocatorsAction)
const getAllLocatorGroupsActionMock = vi.mocked(getAllLocatorGroupsAction)
const getAllEnvironmentsActionMock = vi.mocked(getAllEnvironmentsAction)
const getAllModulesActionMock = vi.mocked(getAllModulesAction)

describe('loadCreateTemplateTestCasePageData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error when template step params fail to load', async () => {
    getAllTemplateStepParamsActionMock.mockResolvedValue({ data: null, error: 'params failed' })

    await expect(loadCreateTemplateTestCasePageData()).resolves.toEqual({
      status: 'error',
      message: 'params failed',
    })
  })

  it('returns success when all requests succeed', async () => {
    const templateStepParams = [{ id: 'param-1', name: 'url', type: 'STRING', templateStepId: 'step-1', order: 0 }]
    const templateSteps = [{ id: 'step-1', name: 'Navigate', type: 'NAVIGATION', signature: 'navigate' }]
    const locators = [{ id: 'loc-1', name: 'Submit', locatorGroupId: 'group-1' }]
    const locatorGroups = [{ id: 'group-1', name: 'Checkout', route: '/checkout', moduleId: 'module-1' }]
    const environments = [{ id: 'env-1', name: 'Staging' }]
    const modules = [{ id: 'module-1', name: 'Shop', parentId: null }]

    getAllTemplateStepParamsActionMock.mockResolvedValue({ data: templateStepParams, error: null })
    getAllTemplateStepsActionMock.mockResolvedValue({ data: templateSteps, error: null })
    getAllLocatorsActionMock.mockResolvedValue({ data: locators, error: null })
    getAllLocatorGroupsActionMock.mockResolvedValue({ data: locatorGroups, error: null })
    getAllEnvironmentsActionMock.mockResolvedValue({ data: environments, error: null })
    getAllModulesActionMock.mockResolvedValue({ data: modules, error: null })

    await expect(loadCreateTemplateTestCasePageData()).resolves.toEqual({
      status: 'success',
      templateStepParams,
      templateSteps,
      locators,
      locatorGroups,
      environments,
      modules,
    })
  })
})
