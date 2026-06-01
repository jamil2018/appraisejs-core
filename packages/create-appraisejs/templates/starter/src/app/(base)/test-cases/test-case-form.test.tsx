// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepParameterType, TemplateStepIcon } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import type { ActionResponse } from '@/types/form/actionHandler'

import TestCaseForm from './test-case-form'

const { push, toast } = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast,
}))

vi.mock('./test-case-flow', () => ({
  __esModule: true,
  default: () => <div>Mock test case flow</div>,
}))

vi.mock('@/components/ui/multi-select', () => ({
  MultiSelect: ({
    options,
    selected,
    onChange,
  }: {
    options: Array<{ label: string; value: string }>
    selected: string[]
    onChange: (selected: string[]) => void
  }) => (
    <div>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() =>
            onChange(
              selected.includes(option.value)
                ? selected.filter(value => value !== option.value)
                : [...selected, option.value],
            )
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@/components/ui/select', async () => {
  const ReactModule = await import('react')

  const SelectContext = ReactModule.createContext<{
    value: string
    onValueChange: (value: string) => void
  }>({
    value: '',
    onValueChange: () => {},
  })

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string
      onValueChange: (value: string) => void
      children: React.ReactNode
    }) => <SelectContext.Provider value={{ value, onValueChange }}>{children}</SelectContext.Provider>,
    SelectTrigger: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const { value, onValueChange } = ReactModule.useContext(SelectContext)

      return (
        <select aria-label="Template Test Case" value={value} onChange={event => onValueChange(event.target.value)}>
          <option value="">Select a template test case</option>
          {children}
        </select>
      )
    },
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  }
})

vi.mock('@/app/(base)/test-suites/test-suite-form', () => ({
  TestSuiteForm: ({
    onSuccess,
    redirectPath,
  }: {
    onSuccess?: (suite: { id: string; name: string }) => void | Promise<void>
    redirectPath?: string | null
  }) => (
    <div>
      <div>Inline suite redirect: {String(redirectPath)}</div>
      <button type="button" onClick={() => void onSuccess?.({ id: 'suite-inline', name: 'Inline Suite' })}>
        Save Inline Suite
      </button>
      <button type="button">Fail Inline Suite</button>
    </div>
  ),
}))

vi.mock('@/app/(base)/tags/tag-form', () => ({
  __esModule: true,
  default: ({
    onSuccess,
    redirectPath,
  }: {
    onSuccess?: (tag: { id: string; name: string }) => void | Promise<void>
    redirectPath?: string | null
  }) => (
    <div>
      <div>Inline tag redirect: {String(redirectPath)}</div>
      <button type="button" onClick={() => void onSuccess?.({ id: 'tag-inline', name: 'Inline Tag' })}>
        Save Inline Tag
      </button>
      <button type="button">Fail Inline Tag</button>
    </div>
  ),
}))

vi.mock('@uiw/react-codemirror', () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => <div>{value}</div>,
  EditorView: { lineWrapping: {} },
}))

vi.mock('@uiw/codemirror-extensions-langs', () => ({
  langs: {
    feature: () => ({}),
  },
}))

vi.mock('@uiw/codemirror-theme-github', () => ({
  githubDark: {},
}))

function renderForm({
  onSubmitAction = vi
    .fn<(value: z.infer<typeof testCaseSchema>, id?: string) => Promise<ActionResponse>>()
    .mockResolvedValue({ status: 200 }),
  formProps = {},
}: {
  onSubmitAction?: (value: z.infer<typeof testCaseSchema>, id?: string) => Promise<ActionResponse>
  formProps?: Partial<React.ComponentProps<typeof TestCaseForm>>
} = {}) {
  const onCreateTestSuiteAction = vi.fn()
  const onCreateTagAction = vi.fn()

  render(
    <TestCaseForm
      defaultNodesOrder={{
        'node-1': {
          order: 1,
          label: 'Click submit',
          gherkinStep: 'click submit',
          icon: 'MOUSE',
          parameters: [
            {
              name: 'target',
              value: 'Submit',
              type: StepParameterType.STRING,
              order: 1,
            },
          ],
          templateStepId: 'step-1',
        },
      }}
      templateStepParams={[]}
      templateSteps={[]}
      locators={[]}
      locatorGroups={[]}
      environments={[]}
      testSuites={[{ id: 'suite-1', name: 'Smoke' } as never]}
      testCases={[{ id: 'case-1', title: 'Checkout case', steps: [], tags: [] } as never]}
      moduleList={[{ id: 'module-1', name: 'Payments' } as never]}
      tags={[{ id: 'tag-1', name: 'Regression' } as never]}
      onSubmitAction={onSubmitAction}
      onCreateTestSuiteAction={onCreateTestSuiteAction}
      onCreateTagAction={onCreateTagAction}
      {...formProps}
    />,
  )

  return { onCreateTestSuiteAction, onCreateTagAction }
}

describe('TestCaseForm', () => {
  beforeEach(() => {
    push.mockReset()
    toast.mockReset()
  })

  it('submits valid values and navigates back to the test cases list', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({
      status: 200,
    })

    renderForm({ onSubmitAction })

    await user.type(screen.getByLabelText('Title'), 'Checkout flow')
    await user.type(screen.getByLabelText('Description'), 'Ensures checkout succeeds')
    await user.click(screen.getByRole('button', { name: 'Smoke' }))
    await user.click(screen.getByRole('button', { name: 'Regression' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Mock test case flow')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save test case' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        {
          title: 'Checkout flow',
          description: 'Ensures checkout succeeds',
          testSuiteIds: ['suite-1'],
          tagIds: ['tag-1'],
          flowBlocks: [],
          steps: [
            {
              gherkinStep: 'click submit',
              label: 'Click submit',
              icon: 'MOUSE',
              nodeId: 'node-1',
              parameters: [
                {
                  name: 'target',
                  value: 'Submit',
                  type: StepParameterType.STRING,
                  order: 1,
                },
              ],
              order: 1,
              templateStepId: 'step-1',
            },
          ],
        },
        undefined,
      )
    })

    expect(toast).toHaveBeenCalledWith({
      title: 'Success',
      description: 'Test case saved successfully',
      variant: 'default',
    })
    expect(push).toHaveBeenCalledWith('/test-cases')
  })

  it('uses the selected template as the first step before showing the details form', async () => {
    const user = userEvent.setup()

    renderForm({
      formProps: {
        defaultNodesOrder: {},
        templateTestCases: [
          {
            id: 'template-1',
            name: 'Login flow',
            description: 'Reusable login flow',
            steps: [
              {
                id: 'template-step-row-1',
                order: 1,
                label: 'Fill email',
                gherkinStep: 'fill email',
                icon: TemplateStepIcon.INPUT,
                templateStepId: 'step-1',
                parameters: [
                  {
                    id: 'template-param-1',
                    name: 'email',
                    defaultValue: 'qa@appraise.dev',
                    type: StepParameterType.STRING,
                    order: 1,
                    testCaseStepId: 'template-step-row-1',
                  },
                ],
              },
            ],
          } as never,
        ],
      },
    })

    expect(screen.getByText('Choose the template that should seed the new test case')).toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Template Test Case' }), 'template-1')

    expect(screen.getByText('1 step')).toBeInTheDocument()
    expect(screen.getByText('Description included')).toBeInTheDocument()
    expect(screen.getByText('Fill email')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByLabelText('Title')).toHaveValue('Login flow')
    expect(screen.getByLabelText('Description')).toHaveValue('Reusable login flow')

    await user.click(screen.getByRole('button', { name: 'Smoke' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByText('Mock test case flow')).toBeInTheDocument()
  })

  it('opens inline suite creation and auto-selects the created suite without navigating away', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({ status: 200 })

    renderForm({ onSubmitAction })

    expect(screen.getByRole('button', { name: 'Create test suite' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create test suite' }))

    expect(screen.getByText('Inline suite redirect: null')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save Inline Suite' }))

    await waitFor(() => {
      expect(screen.queryByText('Inline suite redirect: null')).not.toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Inline Suite' })).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Title'), 'Checkout flow')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Save test case' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Checkout flow',
          testSuiteIds: ['suite-inline'],
        }),
        undefined,
      )
    })
  })

  it('shows an error toast and does not redirect when save returns 500', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({ status: 500, error: 'Save failed' })

    renderForm({ onSubmitAction })

    await user.click(screen.getByRole('button', { name: 'Create test suite' }))

    expect(screen.getByText('Inline suite redirect: null')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fail Inline Suite' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await user.type(screen.getByLabelText('Title'), 'Checkout flow')
    await user.click(screen.getByRole('button', { name: 'Smoke' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Save test case' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Checkout flow',
          testSuiteIds: ['suite-1'],
        }),
        undefined,
      )
    })

    expect(toast).toHaveBeenCalledWith({
      title: 'Error',
      description: 'Save failed',
      variant: 'destructive',
    })
    expect(push).not.toHaveBeenCalled()
  })

  it('opens inline tag creation and auto-selects the created tag without navigating away', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({ status: 200 })

    renderForm({ onSubmitAction })

    expect(screen.getByRole('button', { name: 'Create filter tag' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create filter tag' }))

    expect(screen.getByText('Inline tag redirect: null')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save Inline Tag' }))

    await waitFor(() => {
      expect(screen.queryByText('Inline tag redirect: null')).not.toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Inline Tag' })).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Title'), 'Checkout flow')
    await user.click(screen.getByRole('button', { name: 'Smoke' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Save test case' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Checkout flow',
          tagIds: ['tag-inline'],
        }),
        undefined,
      )
    })
  })

  it('shows a destructive toast and skips submit when a required node parameter is missing', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn()

    render(
      <TestCaseForm
        defaultNodesOrder={{
          'node-1': {
            order: 1,
            label: 'Click submit',
            gherkinStep: 'click submit',
            icon: 'MOUSE',
            parameters: [],
            templateStepId: 'step-1',
          },
        }}
        templateStepParams={[
          {
            id: 'param-1',
            name: 'target',
            type: StepParameterType.STRING,
            order: 1,
            isMandatory: true,
            templateStepId: 'step-1',
          } as never,
        ]}
        templateSteps={[]}
        locators={[]}
        locatorGroups={[]}
        environments={[]}
        testSuites={[{ id: 'suite-1', name: 'Smoke' } as never]}
        testCases={[{ id: 'case-1', title: 'Checkout case', steps: [], tags: [] } as never]}
        moduleList={[{ id: 'module-1', name: 'Payments' } as never]}
        tags={[]}
        onSubmitAction={onSubmitAction}
        onCreateTestSuiteAction={vi.fn()}
        onCreateTagAction={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Title'), 'Checkout flow')
    await user.click(screen.getByRole('button', { name: 'Smoke' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Save test case' }))

    expect(onSubmitAction).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith({
      title: 'Validation Error',
      description:
        'The following nodes have missing mandatory parameters: Click submit. Please fill in all required parameters before saving.',
      variant: 'destructive',
    })
  })

  it('keeps the user on details until the first step is valid', async () => {
    const user = userEvent.setup()

    renderForm()

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByText('Title must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Test suites are required')).toBeInTheDocument()
    expect(screen.queryByText('Mock test case flow')).not.toBeInTheDocument()
  })

  it('keeps immersive flow editing below overlay sidebars', async () => {
    const user = userEvent.setup()

    renderForm()

    await user.type(screen.getByLabelText('Title'), 'Checkout flow')
    await user.click(screen.getByRole('button', { name: 'Smoke' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Enter immersive flow editing' }))

    expect(screen.getByText('Mock test case flow').closest('.fixed')).toHaveClass('z-40')
  })
})
