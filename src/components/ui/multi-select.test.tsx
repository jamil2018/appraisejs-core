// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MultiSelect } from './multi-select'

const OPTIONS = [
  { label: 'Smoke', value: 'smoke' },
  { label: 'Regression', value: 'regression', disabled: true },
]

describe('MultiSelect', () => {
  it('selects and removes values through its combobox controls', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<MultiSelect label="Tags" options={OPTIONS} selected={[]} onChange={onChange} />)

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await user.click(screen.getByRole('option', { name: 'Smoke' }))

    expect(onChange).toHaveBeenCalledWith(['smoke'])

    rerender(<MultiSelect label="Tags" options={OPTIONS} selected={['smoke']} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Remove Smoke' }))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('does not call onChange for disabled options', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<MultiSelect label="Tags" options={OPTIONS} selected={[]} onChange={onChange} />)

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await user.click(screen.getByRole('option', { name: 'Regression' }))

    await waitFor(() => {
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  it('exposes field-specific names and validation relationships', async () => {
    const user = userEvent.setup()
    render(
      <>
        <MultiSelect
          id="test-suites"
          label="Test Suites"
          searchLabel="Search test suites"
          options={OPTIONS}
          selected={[]}
          onChange={vi.fn()}
          invalid
          required
          describedBy="test-suites-error"
        />
        <p id="test-suites-error">Choose at least one suite.</p>
      </>,
    )

    const control = screen.getByRole('combobox', { name: 'Test Suites' })
    expect(control).toHaveAttribute('id', 'test-suites')
    expect(control).toHaveAttribute('aria-invalid', 'true')
    expect(control).toHaveAttribute('aria-required', 'true')
    expect(control).toHaveAccessibleDescription('Choose at least one suite.')

    await user.click(control)
    expect(screen.getByRole('combobox', { name: 'Search test suites' })).toBeInTheDocument()
  })
})
