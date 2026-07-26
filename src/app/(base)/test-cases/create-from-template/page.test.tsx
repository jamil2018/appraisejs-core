// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const {
  getAllTemplateTestCasesAction,
  listReadyStepDefinitionOptionsAction,
  getAllTestSuitesAction,
  getAllLocatorsAction,
  getAllLocatorGroupsAction,
  getAllTagsAction,
  getAllTestCasesAction,
  getAllModulesAction,
  getAllEnvironmentsAction,
  createTestCaseAction,
  createTestSuiteAction,
  createTagAction,
  testCaseFormSpy,
} = vi.hoisted(() => ({
  getAllTemplateTestCasesAction: vi.fn(),
  listReadyStepDefinitionOptionsAction: vi.fn(),
  getAllTestSuitesAction: vi.fn(),
  getAllLocatorsAction: vi.fn(),
  getAllLocatorGroupsAction: vi.fn(),
  getAllTagsAction: vi.fn(),
  getAllTestCasesAction: vi.fn(),
  getAllModulesAction: vi.fn(),
  getAllEnvironmentsAction: vi.fn(),
  createTestCaseAction: vi.fn(),
  createTestSuiteAction: vi.fn(),
  createTagAction: vi.fn(),
  testCaseFormSpy: vi.fn(() => <div>Mock Test Case Form</div>),
}))

vi.mock('@/actions/template-test-case/template-test-case-actions', () => ({
  getAllTemplateTestCasesAction,
}))

vi.mock('@/actions/step-definition/step-definition-actions', () => ({
  listReadyStepDefinitionOptionsAction,
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

vi.mock('@/actions/environments/environment-actions', () => ({
  getAllEnvironmentsAction,
}))

vi.mock('@/actions/test-suite/test-suite-actions', () => ({
  createTestSuiteAction,
  getAllTestSuitesAction,
}))

vi.mock('../test-case-form', () => ({
  __esModule: true,
  default: testCaseFormSpy,
}))

import CreateTestCaseFromTemplate from './page'

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
              invocationJson: JSON.stringify({
                step: {
                  id: 'browser.forms.fill',
                  version: '1',
                  definitionHash: `sha256:${'a'.repeat(64)}`,
                },
                inputs: { email: 'qa@appraise.dev' },
                presentation: { keyword: 'When', description: 'fill email' },
              }),
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
    listReadyStepDefinitionOptionsAction.mockResolvedValue({
      data: [
        {
          id: 'browser.forms.fill',
          version: '1',
          definitionHash: `sha256:${'a'.repeat(64)}`,
          label: 'Fill form field',
        },
      ],
    })
    getAllTestSuitesAction.mockResolvedValue({ data: [{ id: 'suite-1', name: 'Smoke' }] })
    getAllLocatorsAction.mockResolvedValue({ data: [{ id: 'locator-1', name: 'Email field' }] })
    getAllLocatorGroupsAction.mockResolvedValue({ data: [{ id: 'group-1', name: 'Auth' }] })
    getAllTagsAction.mockResolvedValue({ data: [{ id: 'tag-1', name: 'Regression' }] })
    getAllTestCasesAction.mockResolvedValue({ data: [{ id: 'case-1', title: 'Checkout case', steps: [], tags: [] }] })
    getAllModulesAction.mockResolvedValue({ data: [{ id: 'module-1', name: 'Auth' }] })
    getAllEnvironmentsAction.mockResolvedValue({ data: [{ id: 'env-1', name: 'Staging' }] })

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
        environments: [{ id: 'env-1', name: 'Staging' }],
        stepDefinitions: [
          expect.objectContaining({ id: 'browser.forms.fill', version: '1' }),
        ],
        defaultNodesOrder: {
          'node-0': expect.objectContaining({
            label: 'Fill email',
            invocation: expect.objectContaining({
              step: expect.objectContaining({ id: 'browser.forms.fill', version: '1' }),
            }),
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
