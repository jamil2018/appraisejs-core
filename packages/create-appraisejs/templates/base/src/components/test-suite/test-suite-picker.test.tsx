// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import TestSuitePicker from './test-suite-picker'

describe('TestSuitePicker', () => {
  it('saves a partial suite selection', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <TestSuitePicker
        testSuites={[
          {
            id: 'suite-1',
            name: 'Checkout',
            description: 'Checkout flow',
            module: { id: 'module-1', name: 'Payments' },
            tags: [],
            testCases: [
              {
                id: 'case-1',
                title: 'Pay with card',
                description: 'Card path',
                steps: [],
                tags: [],
              },
              {
                id: 'case-2',
                title: 'Pay with wallet',
                description: 'Wallet path',
                steps: [],
                tags: [],
              },
            ],
          } as never,
        ]}
        selectedSuites={[]}
        onSave={onSave}
        triggerPlaceholder="Select test suite(s)"
        dialogTitle="Select Test Suites"
        dialogDescription="Pick suites"
        selectedLabel="Selected suites"
      />,
    )

    await user.click(screen.getByRole('button', { name: /select test suite/i }))
    await user.click(screen.getByRole('button', { name: /checkout/i }))
    await user.click(screen.getByRole('checkbox', { name: 'Select test case Pay with card' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith([
        {
          testSuiteId: 'suite-1',
          runAll: false,
          testCaseIds: ['case-1'],
        },
      ])
    })
  })
})
