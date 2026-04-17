// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TestSuiteForm } from './test-suite-form'

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

vi.mock('@/components/test-case/test-case-picker', () => ({
  __esModule: true,
  default: ({
    onSave,
  }: {
    onSave: (value: string[]) => void
  }) => (
    <button type="button" onClick={() => onSave(['case-1'])}>
      Select Cases
    </button>
  ),
}))

vi.mock('@/components/ui/multi-select-with-preview', () => ({
  __esModule: true,
  default: ({
    onSelectChange,
  }: {
    onSelectChange: (value: string[]) => void
  }) => (
    <button type="button" onClick={() => onSelectChange(['tag-1'])}>
      Select Tags
    </button>
  ),
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
        <select aria-label="Module" value={value || ''} onChange={event => onValueChange(event.target.value)}>
          <option value="">Select a module</option>
          {children}
        </select>
      )
    },
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  }
})

async function fillAndSubmitForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Name'), 'Smoke Suite')
  await user.type(screen.getByLabelText('Description'), 'Important tests')
  await user.click(screen.getByRole('button', { name: 'Select Cases' }))
  await user.selectOptions(screen.getByRole('combobox', { name: 'Module' }), 'module-1')
  await user.click(screen.getByRole('button', { name: 'Select Tags' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))
}

describe('TestSuiteForm', () => {
  beforeEach(() => {
    push.mockReset()
    toast.mockReset()
  })

  it('submits valid values and navigates back to the suites list in page mode', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({ status: 200 })

    render(
      <TestSuiteForm
        successTitle="Suite created"
        successMessage="Test suite created successfully"
        onSubmitAction={onSubmitAction}
        testCases={[]}
        moduleList={[{ id: 'module-1', name: 'Payments' } as never]}
        tags={[{ id: 'tag-1', name: 'smoke' } as never]}
      />,
    )

    await fillAndSubmitForm(user)

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        undefined,
        {
          name: 'Smoke Suite',
          description: 'Important tests',
          testCases: ['case-1'],
          moduleId: 'module-1',
          tagIds: ['tag-1'],
        },
        undefined,
      )
    })

    expect(toast).toHaveBeenCalledWith({
      title: 'Suite created',
      description: 'Test suite created successfully',
    })
    expect(push).toHaveBeenCalledWith('/test-suites')
  })

  it('does not redirect and calls onSuccess with created suite data in dialog mode', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onSubmitAction = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        id: 'suite-2',
        name: 'Inline Suite',
      },
    })

    render(
      <TestSuiteForm
        successTitle="Suite created"
        successMessage="Test suite created successfully"
        onSubmitAction={onSubmitAction}
        onSuccess={onSuccess}
        redirectPath={null}
        testCases={[]}
        moduleList={[{ id: 'module-1', name: 'Payments' } as never]}
        tags={[{ id: 'tag-1', name: 'smoke' } as never]}
      />,
    )

    await fillAndSubmitForm(user)

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        id: 'suite-2',
        name: 'Inline Suite',
      })
    })

    expect(toast).toHaveBeenCalledWith({
      title: 'Suite created',
      description: 'Test suite created successfully',
    })
    expect(push).not.toHaveBeenCalled()
  })
})
