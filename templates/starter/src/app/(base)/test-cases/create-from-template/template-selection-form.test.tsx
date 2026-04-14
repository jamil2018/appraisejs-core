// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import TemplateSelectionForm from './template-selection-form'

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
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
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({
      children,
    }: {
      children: React.ReactNode
    }) => {
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

describe('TemplateSelectionForm', () => {
  it('navigates to the generate route after a template is selected', async () => {
    const user = userEvent.setup()

    render(<TemplateSelectionForm templateTestCases={[{ id: 'template-1', name: 'Login flow' }]} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Template Test Case' }), 'template-1')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/test-cases/create-from-template/generate/template-1')
    })
  })

  it('shows validation feedback when no template is selected', async () => {
    const user = userEvent.setup()

    render(<TemplateSelectionForm templateTestCases={[{ id: 'template-1', name: 'Login flow' }]} />)

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByText('Template test case is required')).toBeInTheDocument()
  })
})
