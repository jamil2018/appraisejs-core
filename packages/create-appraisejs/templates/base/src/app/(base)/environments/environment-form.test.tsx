// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import EnvironmentForm from './environment-form'

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

describe('EnvironmentForm', () => {
  it('submits valid values and navigates back to the environments list', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({
      status: 200,
    })

    render(
      <EnvironmentForm
        successTitle="Environment created"
        successMessage="Environment created successfully"
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.type(screen.getByLabelText('Name'), 'Staging')
    await user.type(screen.getByLabelText('Base URL'), 'https://example.com')
    await user.type(screen.getByLabelText('API Base URL (Optional)'), 'https://api.example.com')
    await user.type(screen.getByLabelText('Username (Optional)'), 'tester')
    await user.type(screen.getByLabelText('Password environment variable (Optional)'), 'APPRAISE_STAGING_PASSWORD')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        undefined,
        {
          name: 'Staging',
          baseUrl: 'https://example.com',
          apiBaseUrl: 'https://api.example.com',
          username: 'tester',
          passwordEnvironmentVariable: 'APPRAISE_STAGING_PASSWORD',
        },
        undefined,
      )
    })

    expect(toast).toHaveBeenCalledWith({
      title: 'Environment created',
      description: 'Environment created successfully',
    })
    expect(push).toHaveBeenCalledWith('/environments')
  })

  it('shows validation feedback for invalid base URLs and environment variable names', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn()

    render(
      <EnvironmentForm
        successTitle="Environment created"
        successMessage="Environment created successfully"
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.type(screen.getByLabelText('Name'), 'Staging')
    await user.type(screen.getByLabelText('Base URL'), 'not-a-url')
    await user.type(screen.getByLabelText('Password environment variable (Optional)'), 'not valid')

    expect(screen.getByText('Base URL must be a valid URL')).toBeInTheDocument()
    expect(screen.getByText('Use a valid process environment variable name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(onSubmitAction).not.toHaveBeenCalled()
  })
})
