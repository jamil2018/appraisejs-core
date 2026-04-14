// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepParameterType } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

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

describe('TestCaseForm', () => {
  it('submits valid values and navigates back to the test cases list', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({
      status: 200,
    })

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
        testSuites={[{ id: 'suite-1', name: 'Smoke' } as never]}
        tags={[{ id: 'tag-1', name: 'Regression' } as never]}
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.type(screen.getByLabelText('Title'), 'Checkout flow')
    await user.type(screen.getByLabelText('Description'), 'Ensures checkout succeeds')
    await user.click(screen.getByRole('button', { name: 'Smoke' }))
    await user.click(screen.getByRole('button', { name: 'Regression' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        {
          title: 'Checkout flow',
          description: 'Ensures checkout succeeds',
          testSuiteIds: ['suite-1'],
          tagIds: ['tag-1'],
          steps: [
            {
              gherkinStep: 'click submit',
              label: 'Click submit',
              icon: 'MOUSE',
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
        testSuites={[{ id: 'suite-1', name: 'Smoke' } as never]}
        tags={[]}
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.type(screen.getByLabelText('Title'), 'Checkout flow')
    await user.click(screen.getByRole('button', { name: 'Smoke' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmitAction).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith({
      title: 'Validation Error',
      description:
        'The following nodes have missing mandatory parameters: Click submit. Please fill in all required parameters before saving.',
      variant: 'destructive',
    })
  })
})
