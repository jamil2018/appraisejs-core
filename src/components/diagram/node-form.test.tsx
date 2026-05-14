// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepParameterType, TemplateStepIcon, TemplateStepType } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import NodeForm from './node-form'

const validateMock = vi.fn(() => true)

vi.mock('./dynamic-parameters', async () => {
  const React = await import('react')

  function MockDynamicFormFields({
    ref,
    onChange,
  }: {
    onChange?: (values: Array<{ name: string; value: string; type: StepParameterType; order: number }>) => void
  } & React.RefAttributes<{ validate: () => boolean }>) {
    React.useImperativeHandle(ref, () => ({
      validate: validateMock,
    }))
    return (
      <button
        type="button"
        onClick={() =>
          onChange?.([
            {
              name: 'target',
              value: 'Submit',
              type: StepParameterType.STRING,
              order: 1,
            },
          ])
        }
      >
        Apply Parameters
      </button>
    )
  }

  MockDynamicFormFields.displayName = 'MockDynamicFormFields'

  return {
    __esModule: true,
    default: MockDynamicFormFields,
  }
})

vi.mock('./template-step-combobox', () => ({
  __esModule: true,
  default: ({
    value,
    onValueChange,
    templateSteps,
    id,
  }: {
    value: string
    onValueChange: (value: string) => void
    templateSteps: Array<{ id: string; name: string }>
    id?: string
  }) => (
    <select aria-label="Template Step" id={id} value={value} onChange={event => onValueChange(event.target.value)}>
      <option value="">Select a template step</option>
      {templateSteps.map(step => (
        <option key={step.id} value={step.id}>
          {step.name}
        </option>
      ))}
    </select>
  ),
}))

describe('NodeForm', () => {
  beforeEach(() => {
    validateMock.mockReturnValue(true)
  })

  const templateSteps = [
    {
      id: 'step-1',
      name: 'Click',
      icon: TemplateStepIcon.MOUSE,
      signature: 'click {string}',
      type: TemplateStepType.ACTION,
    } as never,
  ]

  const templateStepParams = [
    {
      id: 'param-1',
      name: 'target',
      type: StepParameterType.STRING,
      order: 1,
      templateStepId: 'step-1',
    } as never,
  ]

  it('submits the shaped node payload', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn()

    render(
      <NodeForm
        onSubmitAction={onSubmitAction}
        initialValues={{
          label: '',
          gherkinStep: '',
          templateStepId: '',
          parameters: [],
        }}
        templateSteps={templateSteps}
        templateStepParams={templateStepParams}
        showAddNodeDialog
        locators={[]}
        locatorGroups={[]}
        environments={[]}
        modules={[]}
        setShowAddNodeDialog={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Label'), 'Click submit')
    await user.selectOptions(screen.getByLabelText('Template Step'), 'step-1')
    await user.click(screen.getByRole('button', { name: 'Apply Parameters' }))

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith({
        icon: TemplateStepIcon.MOUSE,
        label: 'Click submit',
        parameters: [
          {
            name: 'target',
            value: 'Submit',
            type: StepParameterType.STRING,
            order: 1,
          },
        ],
        gherkinStep: 'When click "Submit"',
        templateStepId: 'step-1',
      })
    })
  })

  it('shows validation feedback when required fields are missing', async () => {
    const user = userEvent.setup()

    render(
      <NodeForm
        onSubmitAction={vi.fn()}
        initialValues={{
          label: '',
          gherkinStep: '',
          templateStepId: '',
          parameters: [],
        }}
        templateSteps={[]}
        templateStepParams={[]}
        showAddNodeDialog
        locators={[]}
        locatorGroups={[]}
        environments={[]}
        modules={[]}
        setShowAddNodeDialog={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Label must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Template step is required')).toBeInTheDocument()
  })

  it('preserves the selected template step when locator options update', async () => {
    const user = userEvent.setup()
    const baseInitialValues = {
      label: '',
      gherkinStep: '',
      templateStepId: '',
      parameters: [],
    }

    const { rerender } = render(
      <NodeForm
        onSubmitAction={vi.fn()}
        initialValues={baseInitialValues}
        templateSteps={templateSteps}
        templateStepParams={templateStepParams}
        showAddNodeDialog
        locators={[]}
        locatorGroups={[]}
        environments={[]}
        modules={[]}
        setShowAddNodeDialog={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Template Step'), 'step-1')
    expect(screen.getByLabelText('Template Step')).toHaveValue('step-1')

    rerender(
      <NodeForm
        onSubmitAction={vi.fn()}
        initialValues={{ ...baseInitialValues, parameters: [] }}
        templateSteps={templateSteps}
        templateStepParams={templateStepParams}
        showAddNodeDialog
        locators={[{ id: 'locator-1', name: 'Submit button', locatorGroupId: 'group-1' }]}
        locatorGroups={[{ id: 'group-1', name: 'Checkout', route: '/checkout', moduleId: 'module-1' }]}
        environments={[]}
        modules={[]}
        setShowAddNodeDialog={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Template Step')).toHaveValue('step-1')
    })
  })

  it('resets the selected template step when reopening the add node sidebar', async () => {
    const user = userEvent.setup()
    const baseInitialValues = {
      label: '',
      gherkinStep: '',
      templateStepId: '',
      parameters: [],
    }

    const { rerender } = render(
      <NodeForm
        onSubmitAction={vi.fn()}
        initialValues={baseInitialValues}
        templateSteps={templateSteps}
        templateStepParams={templateStepParams}
        showAddNodeDialog
        locators={[]}
        locatorGroups={[]}
        environments={[]}
        modules={[]}
        setShowAddNodeDialog={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Template Step'), 'step-1')
    expect(screen.getByLabelText('Template Step')).toHaveValue('step-1')

    rerender(
      <NodeForm
        onSubmitAction={vi.fn()}
        initialValues={baseInitialValues}
        templateSteps={templateSteps}
        templateStepParams={templateStepParams}
        showAddNodeDialog={false}
        locators={[]}
        locatorGroups={[]}
        environments={[]}
        modules={[]}
        setShowAddNodeDialog={vi.fn()}
      />,
    )

    rerender(
      <NodeForm
        onSubmitAction={vi.fn()}
        initialValues={{ ...baseInitialValues, parameters: [] }}
        templateSteps={templateSteps}
        templateStepParams={templateStepParams}
        showAddNodeDialog
        locators={[]}
        locatorGroups={[]}
        environments={[]}
        modules={[]}
        setShowAddNodeDialog={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Template Step')).toHaveValue('')
    })
  })
})
