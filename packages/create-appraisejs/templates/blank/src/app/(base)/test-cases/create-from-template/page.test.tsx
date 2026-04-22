// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const {
  getAllTemplateTestCasesAction,
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
  getAllTestSuitesAction,
  getAllLocatorsAction,
  getAllLocatorGroupsAction,
  getAllTagsAction,
  getAllTestCasesAction,
  getAllModulesAction,
  createTestCaseAction,
  createTestSuiteAction,
  createTagAction,
  testCaseFormSpy,
} = vi.hoisted(() => ({
  getAllTemplateTestCasesAction: vi.fn(),
  getAllTemplateStepParamsAction: vi.fn(),
  getAllTemplateStepsAction: vi.fn(),
  getAllTestSuitesAction: vi.fn(),
  getAllLocatorsAction: vi.fn(),
  getAllLocatorGroupsAction: vi.fn(),
  getAllTagsAction: vi.fn(),
  getAllTestCasesAction: vi.fn(),
  getAllModulesAction: vi.fn(),
  createTestCaseAction: vi.fn(),
  createTestSuiteAction: vi.fn(),
  createTagAction: vi.fn(),
  testCaseFormSpy: vi.fn(() => <div>Mock Test Case Form</div>),
}))

vi.mock('@/actions/template-test-case/template-test-case-actions', () => ({
  getAllTemplateTestCasesAction,
}))

vi.mock('@/actions/template-step/template-step-actions', () => ({
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
}))

vi.mock('@/actions/locator/locator-actions', () => ({
  getAllLocatorsAction,
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

vi.mock('@/actions/test-suite/test-suite-actions', () => ({
  createTestSuiteAction,
  getAllTestSuitesAction,
}))

vi.mock('../test-case-form', () => ({
  __esModule: true,
  default: testCaseFormSpy,
}))

describe('Create Test Case From Template page', () => {
  it('passes template options and the selected template defaults into the shared test case form', async () => {
    getAllTemplateTestCasesAction.mockResolvedValue({
      data: [
        {
          id: 'template-1',
          name: 'Login template',
          description: 'Reusable login flow',
          steps: [
            {
              id: 'step-row-1',
              order: 1,
              label: 'Fill email',
              gherkinStep: 'fill email',
              icon: 'INPUT',
              templateStepId: 'step-1',
              parameters: [
                {
                  id: 'param-1',
                  name: 'email',
                  defaultValue: 'qa@appraise.dev',
                  type: 'STRING',
                  order: 1,
                },
              ],
            },
          ],
        },
      ],
    })
    getAllTemplateStepParamsAction.mockResolvedValue({ data: [{ id: 'template-param-1', templateStepId: 'step-1' }] })
    getAllTemplateStepsAction.mockResolvedValue({ data: [{ id: 'step-1', name: 'Input' }] })
    getAllTestSuitesAction.mockResolvedValue({ data: [{ id: 'suite-1', name: 'Smoke' }] })
    getAllLocatorsAction.mockResolvedValue({ data: [{ id: 'locator-1', name: 'Email field' }] })
    getAllLocatorGroupsAction.mockResolvedValue({ data: [{ id: 'group-1', name: 'Auth' }] })
    getAllTagsAction.mockResolvedValue({ data: [{ id: 'tag-1', name: 'Regression' }] })
    getAllTestCasesAction.mockResolvedValue({ data: [{ id: 'case-1', title: 'Checkout case', steps: [], tags: [] }] })
    getAllModulesAction.mockResolvedValue({ data: [{ id: 'module-1', name: 'Auth' }] })

    const { default: CreateTestCaseFromTemplate } = await import('./page')

    render(
      await CreateTestCaseFromTemplate({
        searchParams: Promise.resolve({ templateTestCaseId: 'template-1' }),
      }),
    )

    expect(screen.getByText('Mock Test Case Form')).toBeInTheDocument()
    expect(testCaseFormSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        templateTestCases: [
          expect.objectContaining({
            id: 'template-1',
            name: 'Login template',
          }),
        ],
        defaultTemplateTestCaseId: 'template-1',
        defaultTitle: 'Login template',
        defaultDescription: 'Reusable login flow',
        defaultNodesOrder: {
          'node-0': expect.objectContaining({
            label: 'Fill email',
            templateStepId: 'step-1',
          }),
        },
        onSubmitAction: createTestCaseAction,
        onCreateTestSuiteAction: createTestSuiteAction,
        onCreateTagAction: createTagAction,
      }),
      undefined,
    )
  })
})
