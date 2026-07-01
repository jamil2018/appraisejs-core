// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProviderRunWorkspace } from './provider-run-workspace'

const { registerProviderTargetProjectAction, refresh } = vi.hoisted(() => ({
  registerProviderTargetProjectAction: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/actions/provider-runs/provider-run-actions', () => ({
  cancelProviderRunAction: vi.fn(),
  createProviderRunAction: vi.fn(),
  decideProviderPermissionAction: vi.fn(),
  registerProviderTargetProjectAction,
}))

const targetProject = {
  id: 'target-1',
  canonicalPath: '/tmp/target',
  displayName: 'Target',
  packageName: null,
  packageManager: null,
  packageJson: null,
  fingerprint: 'sha256:target',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastDetectedAt: new Date(),
}

describe('ProviderRunWorkspace', () => {
  it('links to settings when no launchable providers are available', () => {
    render(<ProviderRunWorkspace runs={[]} adapters={[]} targetProjects={[targetProject]} plans={[]} />)

    expect(screen.getByText('No coding agent provider is enabled and launchable.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Settings/i })).toHaveAttribute('href', '/settings')
  })

  it('registers a target project from the launch workspace', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    registerProviderTargetProjectAction.mockResolvedValue({
      status: 200,
      success: true,
      data: { targetProjectId: 'target-2' },
    })

    render(<ProviderRunWorkspace runs={[]} adapters={[]} targetProjects={[targetProject]} plans={[]} />)

    await user.type(screen.getByLabelText('Project Path'), '/tmp/new-target')
    await user.type(screen.getByLabelText('Display Name'), 'New Target')
    await user.click(screen.getByRole('button', { name: 'Add Target' }))

    expect(registerProviderTargetProjectAction).toHaveBeenCalledWith({
      projectPath: '/tmp/new-target',
      displayName: 'New Target',
    })
    expect(refresh).toHaveBeenCalled()
  })
})
