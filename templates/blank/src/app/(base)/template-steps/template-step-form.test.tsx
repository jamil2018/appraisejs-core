// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepParameterType } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { TemplateStepForm } from './template-step-form'

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

vi.mock('./paramChip', () => ({
  __esModule: true,
  default: ({
    onSubmit,
  }: {
    onSubmit: (value: Array<{ name: string; type: StepParameterType; order: number }>) => void
  }) => (
    <button type="button" onClick={() => onSubmit([{ name: 'target', type: StepParameterType.STRING, order: 1 }])}>
      Apply Params
    </button>
  ),
}))

vi.mock('@uiw/react-codemirror', () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => <div>{value}</div>,
  EditorView: { lineWrapping: {} },
}))

vi.mock('@uiw/codemirror-extensions-langs', () => ({
  langs: {
    ts: () => ({}),
  },
}))

vi.mock('@uiw/codemirror-theme-github', () => ({
  githubDark: {},
}))

vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  const SelectContext = React.createContext<{ value?: string; onValueChange: (value: string) => void }>({
    value: '',
    onValueChange: () => {},
  })

  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string
      onValueChange: (value: string) => void
      children: React.ReactNode
    }) => <SelectContext.Provider value={{ value, onValueChange }}>{children}</SelectContext.Provider>,
    SelectTrigger: ({ id, children }: { id?: string; children: React.ReactNode }) => <div id={id}>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const { value, onValueChange } = React.useContext(SelectContext)
      return (
        <select aria-label="Select" value={value || ''} onChange={event => onValueChange(event.target.value)}>
          <option value="">Select</option>
          {children}
        </select>
      )
    },
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  }
})

describe('TemplateStepForm', () => {
  it('submits valid values and navigates back to template steps', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({ status: 200 })

    render(
      <TemplateStepForm
        successTitle="Template Step Created"
        successMessage="Created successfully"
        onSubmitAction={onSubmitAction}
        templateStepGroups={[{ id: 'group-1', name: 'Actions' }]}
      />,
    )

    const selects = screen.getAllByRole('combobox', { name: 'Select' })

    await user.type(screen.getByLabelText('Name'), 'Click button')
    await user.type(screen.getByLabelText('Description'), 'Clicks a button')
    await user.selectOptions(selects[0], 'MOUSE')
    await user.selectOptions(selects[1], 'group-1')
    await user.selectOptions(selects[2], 'ACTION')
    fireEvent.change(screen.getByLabelText('Signature'), { target: { value: 'click {string}' } })
    await user.click(screen.getByRole('button', { name: 'Apply Params' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: 'Click button',
          description: 'Clicks a button',
          icon: 'MOUSE',
          templateStepGroupId: 'group-1',
          type: 'ACTION',
          signature: 'click {string}',
          params: [{ name: 'target', type: StepParameterType.STRING, order: 1 }],
          functionDefinition: `When('click {string}', async function(this:CustomWorld, target: string){});`,
        }),
        undefined,
      )
    })

    expect(push).toHaveBeenCalledWith('/template-steps')
  })
})
