// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import TagForm from './tag-form'

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

describe('TagForm', () => {
  it('submits valid values, shows a toast, and navigates back to the tags list', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({
      status: 200,
    })

    render(
      <TagForm
        successTitle="Tag created"
        successMessage="Tag created successfully"
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.type(screen.getByLabelText('Name'), 'Smoke')
    await user.type(screen.getByLabelText('Tag Expression'), '@smoke')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        undefined,
        {
          name: 'Smoke',
          tagExpression: '@smoke',
        },
        undefined,
      )
    })

    expect(toast).toHaveBeenCalledWith({
      title: 'Tag created',
      description: 'Tag created successfully',
    })
    expect(push).toHaveBeenCalledWith('/tags')
  })

  it('shows validation feedback for an invalid tag expression and does not submit', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn()

    render(
      <TagForm
        successTitle="Tag created"
        successMessage="Tag created successfully"
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.type(screen.getByLabelText('Name'), 'Smoke')
    await user.type(screen.getByLabelText('Tag Expression'), 'smoke')

    expect(
      screen.getByText('Tag expression must be a single tag starting with @ and contain no spaces (e.g., "@smoke")'),
    ).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(onSubmitAction).not.toHaveBeenCalled()
  })
})
