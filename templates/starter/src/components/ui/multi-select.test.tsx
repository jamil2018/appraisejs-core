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
})
