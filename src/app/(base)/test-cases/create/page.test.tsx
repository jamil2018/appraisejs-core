// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const {
  createTestCaseAction,
  createTestSuiteAction,
  createTagAction,
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
  getAllLocatorsAction,
  getAllTestSuitesAction,
  getAllLocatorGroupsAction,
  getAllTagsAction,
  getAllTestCasesAction,
  getAllModulesAction,
  getAllEnvironmentsAction,
  getAllStepBlocksAction,
  testCaseFormSpy,
} = vi.hoisted(() => ({
  createTestCaseAction: vi.fn(),
  createTestSuiteAction: vi.fn(),
  createTagAction: vi.fn(),
  getAllTemplateStepParamsAction: vi.fn(),
  getAllTemplateStepsAction: vi.fn(),
  getAllLocatorsAction: vi.fn(),
  getAllTestSuitesAction: vi.fn(),
  getAllLocatorGroupsAction: vi.fn(),
  getAllTagsAction: vi.fn(),
  getAllTestCasesAction: vi.fn(),
  getAllModulesAction: vi.fn(),
  getAllEnvironmentsAction: vi.fn(),
  getAllStepBlocksAction: vi.fn(),
  testCaseFormSpy: vi.fn(() => <div>Mock Test Case Form</div>),
}))

vi.mock('@/actions/template-step/template-step-actions', () => ({
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
}))

vi.mock('@/actions/locator/locator-actions', () => ({
  getAllLocatorsAction,
}))

vi.mock('@/actions/test-suite/test-suite-actions', () => ({
  getAllTestSuitesAction,
  createTestSuiteAction,
}))

vi.mock('@/actions/test-case/test-case-actions', () => ({
  createTestCaseAction,
  getAllTestCasesAction,
}))

vi.mock('@/actions/locator-groups/locator-group-actions', () => ({
  getAllLocatorGroupsAction,
}))

vi.mock('@/actions/tags/tag-actions', () => ({
  createTagAction,
  getAllTagsAction,
}))

vi.mock('@/actions/modules/module-actions', () => ({
  getAllModulesAction,
}))

vi.mock('@/actions/environments/environment-actions', () => ({
  getAllEnvironmentsAction,
}))

vi.mock('@/actions/step-block/step-block-actions', () => ({
  getAllStepBlocksAction,
}))

vi.mock('../test-case-form', () => ({
  __esModule: true,
  default: testCaseFormSpy,
}))

vi.mock('../test-case-resource-rows', () => ({
  getTemplateStepParamRows: vi.fn(() => [{ id: 'param-1' }]),
  getTemplateStepRows: vi.fn(() => [{ id: 'template-step-1', name: 'Click' }]),
  getTestSuiteRows: vi.fn(() => [{ id: 'suite-1', name: 'Smoke' }]),
  getLocatorRows: vi.fn(() => [{ id: 'locator-1', name: 'Submit button' }]),
  getLocatorGroupRows: vi.fn(() => [{ id: 'group-1', name: 'Checkout' }]),
  getTagRows: vi.fn(() => [{ id: 'tag-1', name: 'Regression' }]),
  getModuleRows: vi.fn(() => [{ id: 'module-1', name: 'Payments' }]),
  getEnvironmentRows: vi.fn(() => [{ id: 'env-1', name: 'Staging' }]),
  getFlowStepBlockRows: vi.fn(() => [{ id: 'step-block-1', name: 'Sign in' }]),
}))

vi.mock('../test-case-row-helpers', () => ({
  getTestCaseRows: vi.fn(() => [{ id: 'case-1', title: 'Checkout case', steps: [], tags: [] }]),
}))

describe('Create Test Case page', () => {
  it('passes test cases and modules into the shared test case form', async () => {
    getAllTemplateStepParamsAction.mockResolvedValue({ data: [] })
    getAllTemplateStepsAction.mockResolvedValue({ data: [] })
    getAllTestSuitesAction.mockResolvedValue({ data: [] })
    getAllLocatorsAction.mockResolvedValue({ data: [] })
    getAllLocatorGroupsAction.mockResolvedValue({ data: [] })
    getAllTagsAction.mockResolvedValue({ data: [] })
    getAllTestCasesAction.mockResolvedValue({ data: [] })
    getAllModulesAction.mockResolvedValue({ data: [] })
    getAllEnvironmentsAction.mockResolvedValue({ data: [] })
    getAllStepBlocksAction.mockResolvedValue({ data: [] })

    const { default: CreateTestCase } = await import('./page')

    render(await CreateTestCase())

    expect(screen.getByText('Mock Test Case Form')).toBeInTheDocument()
    expect(testCaseFormSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        testCases: [{ id: 'case-1', title: 'Checkout case', steps: [], tags: [] }],
        moduleList: [{ id: 'module-1', name: 'Payments' }],
        environments: [{ id: 'env-1', name: 'Staging' }],
        stepBlocks: [{ id: 'step-block-1', name: 'Sign in' }],
        onSubmitAction: createTestCaseAction,
        onCreateTestSuiteAction: createTestSuiteAction,
        onCreateTagAction: createTagAction,
      }),
      undefined,
    )
  })
})
