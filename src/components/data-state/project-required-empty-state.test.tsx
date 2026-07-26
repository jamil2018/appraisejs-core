// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ProjectRequiredEmptyState from './project-required-empty-state'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/actions/target-project/target-project-actions', () => ({
  registerTargetProjectAction: vi.fn(),
}))

describe('ProjectRequiredEmptyState', () => {
  it('explains the project requirement and opens registration', async () => {
    const user = userEvent.setup()
    render(<ProjectRequiredEmptyState />)

    expect(screen.getByRole('heading', { name: 'Create your first project' })).toBeInTheDocument()
    expect(screen.getByText(/before it can show dashboard metrics or project data/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Register project' }))

    expect(screen.getByRole('dialog', { name: 'Register workspace' })).toBeInTheDocument()
  })
})
