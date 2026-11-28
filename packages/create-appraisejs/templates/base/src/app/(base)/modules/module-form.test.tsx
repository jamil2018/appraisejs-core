// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ModuleForm from './module-form'

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

describe('ModuleForm', () => {
  it('keeps a stale edit visible and explains the version conflict', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi
      .fn()
      .mockResolvedValue({ status: 409, error: 'This record changed. Reload it before saving your draft.' })
    render(
      <ModuleForm
        id="module-1"
        defaultValues={{ name: 'Checkout', parentId: '00000000-0000-0000-0000-000000000000' }}
        expectedUpdatedAt="2026-01-01T00:00:00.000Z"
        successTitle="Module updated"
        successMessage="Module updated successfully"
        onSubmitAction={onSubmitAction}
      />,
    )
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Edited checkout')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'This record changed. Reload it before saving your draft.',
        variant: 'destructive',
      }),
    )
    expect(onSubmitAction).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ name: 'Edited checkout' }),
      'module-1',
      '2026-01-01T00:00:00.000Z',
    )
    expect(screen.getByLabelText('Name')).toHaveValue('Edited checkout')
    expect(push).not.toHaveBeenCalled()
  })

  it('submits the selected parent module and navigates back to the modules list', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({
      status: 200,
    })

    render(
      <ModuleForm
        successTitle="Module created"
        successMessage="Module created successfully"
        parentOptions={[{ id: 'parent-1', name: 'Shared UI' }]}
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.type(screen.getByLabelText('Name'), 'Checkout')
    await user.click(screen.getByRole('combobox', { name: 'Parent' }))
    await user.click(await screen.findByRole('option', { name: 'Shared UI' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        undefined,
        {
          name: 'Checkout',
          parentId: 'parent-1',
        },
        undefined,
      )
    })

    expect(toast).toHaveBeenCalledWith({
      title: 'Module created',
      description: 'Module created successfully',
    })
    expect(push).toHaveBeenCalledWith('/modules')
  })

  it('shows validation feedback when the name is cleared and does not submit', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn()

    render(
      <ModuleForm
        successTitle="Module created"
        successMessage="Module created successfully"
        onSubmitAction={onSubmitAction}
      />,
    )

    const nameInput = screen.getByLabelText('Name')

    await user.type(nameInput, 'Checkout')
    await user.clear(nameInput)

    expect(screen.getByText('Name is required')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(onSubmitAction).not.toHaveBeenCalled()
  })
})
