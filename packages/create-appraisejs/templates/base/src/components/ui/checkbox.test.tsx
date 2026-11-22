// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Checkbox, type CheckedState } from './checkbox'
import { Label } from './label'

function MixedCheckbox() {
  const [checked, setChecked] = useState<CheckedState>('indeterminate')
  return (
    <>
      <Checkbox id="suite" checked={checked} onCheckedChange={setChecked} />
      <Label htmlFor="suite">Suite selection</Label>
    </>
  )
}

describe('Checkbox', () => {
  it('exposes a mixed state and changes it to checked through its label', async () => {
    const user = userEvent.setup()
    render(<MixedCheckbox />)
    const checkbox = screen.getByRole('checkbox', { name: 'Suite selection' })
    expect(checkbox).toHaveAttribute('aria-checked', 'mixed')
    await user.click(screen.getByText('Suite selection'))
    expect(checkbox).toHaveAttribute('aria-checked', 'true')
    await user.click(checkbox)
    expect(checkbox).toHaveAttribute('aria-checked', 'false')
  })

  it('supports uncontrolled mixed state and keyboard selection', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<Checkbox aria-label="Select suite" defaultChecked="indeterminate" onCheckedChange={onCheckedChange} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Select suite' })
    expect(checkbox).toHaveAttribute('aria-checked', 'mixed')
    await user.tab()
    await user.keyboard(' ')
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(checkbox).toHaveAttribute('aria-checked', 'true')
  })
})
