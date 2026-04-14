// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TemplateStepGroupForm } from './template-step-group-form'

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

describe('TemplateStepGroupForm', () => {
  it('submits valid values and navigates back to the template step groups list', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({
      status: 200,
    })

    render(
      <TemplateStepGroupForm
        successTitle="Group created"
        successMessage="Template step group created successfully"
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.type(screen.getByLabelText('Name'), 'API checks')
    await user.type(screen.getByLabelText('Description'), 'Validations for API responses')
    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(screen.getByRole('option', { name: 'VALIDATION' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        undefined,
        {
          name: 'API checks',
          description: 'Validations for API responses',
          type: 'VALIDATION',
        },
        undefined,
      )
    })

    expect(toast).toHaveBeenCalledWith({
      title: 'Group created',
      description: 'Template step group created successfully',
    })
    expect(push).toHaveBeenCalledWith('/template-step-groups')
  })

  it('shows validation feedback when the name is too short and does not submit', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn()

    render(
      <TemplateStepGroupForm
        successTitle="Group created"
        successMessage="Template step group created successfully"
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.type(screen.getByLabelText('Name'), 'ab')

    expect(screen.getByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(onSubmitAction).not.toHaveBeenCalled()
  })
})
