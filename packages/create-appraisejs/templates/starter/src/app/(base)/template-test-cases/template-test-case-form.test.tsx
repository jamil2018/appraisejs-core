// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepParameterType } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import TemplateTestCaseForm from './template-test-case-form'

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

vi.mock('./template-test-case-flow', () => ({
  __esModule: true,
  default: () => <div>Mock template test case flow</div>,
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

describe('TemplateTestCaseForm', () => {
  it('maps default parameter values into submit values and navigates back to the template test cases list', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({
      status: 200,
    })

    render(
      <TemplateTestCaseForm
        defaultNodesOrder={{
          'node-1': {
            order: 1,
            label: 'Fill email',
            gherkinStep: 'fill email',
            icon: 'INPUT',
            parameters: [
              {
                name: 'email',
                defaultValue: 'qa@appraise.dev',
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
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.type(screen.getByLabelText('Title'), 'Reusable login')
    await user.type(screen.getByLabelText('Description'), 'Uses default credentials')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        {
          title: 'Reusable login',
          description: 'Uses default credentials',
          steps: [
            {
              gherkinStep: 'fill email',
              label: 'Fill email',
              icon: 'INPUT',
              parameters: [
                {
                  name: 'email',
                  value: 'qa@appraise.dev',
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
    expect(push).toHaveBeenCalledWith('/template-test-cases')
  })

  it('shows validation feedback when the form has no steps', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn()

    render(
      <TemplateTestCaseForm
        defaultNodesOrder={{}}
        templateStepParams={[]}
        templateSteps={[]}
        locators={[]}
        locatorGroups={[]}
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.type(screen.getByLabelText('Title'), 'Reusable login')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmitAction).not.toHaveBeenCalled()
    expect(screen.getByText('Steps are required')).toBeInTheDocument()
  })
})
