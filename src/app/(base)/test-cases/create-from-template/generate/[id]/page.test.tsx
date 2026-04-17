// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const {
  getTemplateTestCaseByIdAction,
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
  testCaseFormSpy,
} = vi.hoisted(() => ({
  getTemplateTestCaseByIdAction: vi.fn(),
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
  testCaseFormSpy: vi.fn(() => <div>Mock Test Case Form</div>),
}))

vi.mock('@/actions/template-test-case/template-test-case-actions', () => ({
  getTemplateTestCaseByIdAction,
}))

vi.mock('@/actions/test-case/test-case-actions', () => ({
  createTestCaseAction,
  getAllTestCasesAction,
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

vi.mock('../../../test-case-form', () => ({
  __esModule: true,
  default: testCaseFormSpy,
}))

vi.mock('../../create-from-template-helpers', () => ({
  getTemplateTestCaseWithSteps: vi.fn(() => ({
    id: 'template-1',
    name: 'Login template',
    description: 'Reusable login flow',
  })),
  getConvertedTemplateTestCaseData: vi.fn(() => ({
    convertedData: {
      nodesOrder: { 'node-1': { order: 1 } },
      testSuiteIds: ['suite-1'],
    },
    error: null,
  })),
  getTemplateStepParamRows: vi.fn(() => [{ id: 'param-1' }]),
  getTemplateStepRows: vi.fn(() => [{ id: 'template-step-1', name: 'Click' }]),
  getLocatorRows: vi.fn(() => [{ id: 'locator-1', name: 'Submit button' }]),
  getTestSuiteRows: vi.fn(() => [{ id: 'suite-1', name: 'Smoke' }]),
  getLocatorGroupRows: vi.fn(() => [{ id: 'group-1', name: 'Checkout' }]),
  getTagRows: vi.fn(() => [{ id: 'tag-1', name: 'Regression' }]),
  getTestCaseRows: vi.fn(() => [{ id: 'case-1', title: 'Checkout case', steps: [], tags: [] }]),
  getModuleRows: vi.fn(() => [{ id: 'module-1', name: 'Payments' }]),
}))

describe('Generate Test Case From Template page', () => {
  it('passes test cases and modules into the shared test case form', async () => {
    getTemplateTestCaseByIdAction.mockResolvedValue({ data: {} })
    getAllTemplateStepParamsAction.mockResolvedValue({ data: [] })
    getAllTemplateStepsAction.mockResolvedValue({ data: [] })
    getAllLocatorsAction.mockResolvedValue({ data: [] })
    getAllTestSuitesAction.mockResolvedValue({ data: [] })
    getAllLocatorGroupsAction.mockResolvedValue({ data: [] })
    getAllTagsAction.mockResolvedValue({ data: [] })
    getAllTestCasesAction.mockResolvedValue({ data: [] })
    getAllModulesAction.mockResolvedValue({ data: [] })

    const { default: GenerateTestCaseFromTemplate } = await import('./page')

    render(await GenerateTestCaseFromTemplate({ params: Promise.resolve({ id: 'template-1' }) }))

    expect(screen.getByText('Mock Test Case Form')).toBeInTheDocument()
    expect(testCaseFormSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        testCases: [{ id: 'case-1', title: 'Checkout case', steps: [], tags: [] }],
        moduleList: [{ id: 'module-1', name: 'Payments' }],
        onSubmitAction: createTestCaseAction,
        onCreateTestSuiteAction: createTestSuiteAction,
        onCreateTagAction: createTagAction,
      }),
      undefined,
    )
  })
})
