// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import TestCasePicker from './test-case-picker'

const fixtureTimestamp = '2024-01-01T00:00:00.000Z'

describe('TestCasePicker', () => {
  it('saves selected test cases from the dialog', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const testCases = [
      {
        id: 'case-1',
        title: 'Login test',
        description: 'Checks login',
        tags: [{ id: 'tag-1', name: 'smoke' }],
        steps: [],
        createdAt: new Date(fixtureTimestamp),
        updatedAt: new Date(fixtureTimestamp),
      } as never,
    ]

    render(
      <TestCasePicker
        testCases={testCases}
        selectedIds={[]}
        onSave={onSave}
        triggerPlaceholder="Select test case(s)"
        dialogTitle="Select Test Cases"
        dialogDescription="Pick cases"
        selectedLabel="Selected test case(s)"
      />,
    )

    const trigger = screen.getByRole('button', { name: /select test case/i })
    await user.click(trigger)
    await user.click(screen.getByRole('checkbox', { name: 'Select Login test' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(['case-1'])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    })
  })

  it('discards draft selection on Escape and returns focus to Browse', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <TestCasePicker
        testCases={[
          {
            id: 'case-1',
            title: 'Login test',
            description: 'Checks login',
            tags: [],
            steps: [],
            createdAt: new Date(fixtureTimestamp),
            updatedAt: new Date(fixtureTimestamp),
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

    const trigger = screen.getByRole('button', { name: /select test case/i })
    await user.click(trigger)
    await user.click(screen.getByRole('checkbox', { name: 'Select Login test' }))
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    })
    expect(onSave).not.toHaveBeenCalled()

    await user.click(trigger)
    expect(screen.getByRole('checkbox', { name: 'Select Login test' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSave).not.toHaveBeenCalled()
  })
})
