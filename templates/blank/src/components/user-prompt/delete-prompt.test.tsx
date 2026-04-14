// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import DeletePrompt from './delete-prompt'

describe('DeletePrompt', () => {
  it('opens from the trigger and closes after a successful delete', async () => {
    const user = userEvent.setup()
    const deleteHandler = vi.fn().mockResolvedValue(true)

    render(
      <DeletePrompt
        dialogTitle="Delete Item"
        dialogDescription="Please confirm your action"
        confirmationText="Are you sure?"
        deleteHandler={deleteHandler}
      />,
    )

    await user.click(screen.getByRole('button', { name: /delete item/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(deleteHandler).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('keeps the dialog open when the delete handler reports a failure', async () => {
    const user = userEvent.setup()
    const deleteHandler = vi.fn().mockResolvedValue(false)

    render(
      <DeletePrompt
        dialogTitle="Delete Item"
        dialogDescription="Please confirm your action"
        confirmationText="Are you sure?"
        deleteHandler={deleteHandler}
      />,
    )

    await user.click(screen.getByRole('button', { name: /delete item/i }))
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(deleteHandler).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
