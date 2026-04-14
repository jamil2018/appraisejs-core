// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import TestCasePicker from './test-case-picker'

describe('TestCasePicker', () => {
  it('saves selected test cases from the dialog', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <TestCasePicker
        testCases={[
          {
            id: 'case-1',
            title: 'Login test',
            description: 'Checks login',
            tags: [{ id: 'tag-1', name: 'smoke' }],
            steps: [],
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            updatedAt: new Date('2024-01-01T00:00:00.000Z'),
          } as never,
        ]}
        selectedIds={[]}
        onSave={onSave}
        triggerPlaceholder="Select test case(s)"
        dialogTitle="Select Test Cases"
        dialogDescription="Pick cases"
        selectedLabel="Selected test case(s)"
      />,
    )

    await user.click(screen.getByRole('button', { name: /select test case/i }))
    await user.click(screen.getByRole('checkbox', { name: /select row/i }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(['case-1'])
    })
  })
})
