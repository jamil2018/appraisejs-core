// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Label } from './label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './select'

const items = [
  { value: 'env-7', label: 'Staging environment' },
  { value: 'env-9', label: 'Production environment' },
]
function EnvironmentSelect() {
  const [value, setValue] = useState('env-7')
  return (
    <>
      <Label htmlFor="environment">Environment</Label>
      <Select items={items} value={value} onValueChange={setValue}>
        <SelectTrigger id="environment">
          <SelectValue placeholder="Choose environment" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map(item => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  )
}

describe('Select', () => {
  it('shows controlled labels before opening and after changing selection', async () => {
    const user = userEvent.setup()
    render(<EnvironmentSelect />)
    const trigger = screen.getByRole('combobox', { name: /Environment/ })
    expect(trigger).toHaveTextContent('Staging environment')
    expect(trigger).not.toHaveTextContent('env-7')
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: 'Production environment' }))
    expect(trigger).toHaveTextContent('Production environment')
  })

  it.each([null, ''])('renders a placeholder with an empty controlled value (%s)', value => {
    render(
      <Select value={value} items={items}>
        <SelectTrigger aria-label="Environment">
          <SelectValue placeholder="Choose environment" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="env-7">Staging environment</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    )
    expect(screen.getByRole('combobox', { name: 'Environment' })).toHaveTextContent('Choose environment')
  })

  it('supports an explicit value formatter without requiring popup mounting', () => {
    render(
      <Select value="env-7">
        <SelectTrigger aria-label="Environment">
          <SelectValue>{value => (value === 'env-7' ? 'Staging environment' : 'Choose environment')}</SelectValue>
        </SelectTrigger>
      </Select>,
    )
    expect(screen.getByRole('combobox', { name: 'Environment' })).toHaveTextContent('Staging environment')
  })
})
