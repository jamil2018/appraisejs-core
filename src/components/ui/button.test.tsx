// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './button'

describe('Button', () => {
  it('submits only when explicitly requested', async () => {
    const user = userEvent.setup()
    const submit = vi.fn(event => event.preventDefault())
    render(
      <form onSubmit={submit}>
        <Button>Inspect</Button>
        <Button type="submit">Save</Button>
      </form>,
    )
    await user.click(screen.getByRole('button', { name: 'Inspect' }))
    expect(submit).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(submit).toHaveBeenCalledOnce()
  })

  it('preserves the semantics and child content of rendered navigation links', () => {
    render(
      <Button render={<a href="/journeys" />} nativeButton={false}>
        Open Journeys
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'Open Journeys' })).toHaveAttribute('href', '/journeys')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
