// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  description: null,
  packageName: null,
  packageManager: null,
  packageJson: null,
  fingerprint: 'sha256:target',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastDetectedAt: new Date(),
}

describe('ProviderRunWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('links to settings when no launchable providers are available', () => {
    render(<ProviderRunWorkspace runs={[]} adapters={[]} targetProjects={[targetProject]} plans={[]} />)

    expect(screen.getByText('No coding agent provider is enabled and launchable.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Settings/i })).toHaveAttribute('href', '/settings')
  })

  it('does not select an existing target project by default', () => {
    render(<ProviderRunWorkspace runs={[]} adapters={[]} targetProjects={[targetProject]} plans={[]} />)

    expect(screen.getByRole('combobox', { name: 'Target Project' })).toHaveTextContent('No target selected')
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

    await user.click(screen.getByRole('tab', { name: /Register new/i }))
    const packageFile = new File(['{}'], 'package.json', { type: 'application/json' })
    Object.defineProperty(packageFile, 'path', { value: '/tmp/new-target/package.json' })
    Object.defineProperty(packageFile, 'webkitRelativePath', { value: 'new-target/package.json' })

    await user.upload(screen.getByLabelText('Project folder chooser'), packageFile)
    await user.type(screen.getByLabelText('Display Name'), 'New Target')
    await user.click(screen.getByRole('button', { name: 'Add Target' }))

    expect(registerProviderTargetProjectAction).toHaveBeenCalledWith({
      projectPath: '/tmp/new-target',
      displayName: 'New Target',
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('registers a target project from a manually entered path', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    registerProviderTargetProjectAction.mockResolvedValue({
      status: 200,
      success: true,
      data: { targetProjectId: 'target-3' },
    })

    render(<ProviderRunWorkspace runs={[]} adapters={[]} targetProjects={[targetProject]} plans={[]} />)

    await user.click(screen.getByRole('tab', { name: /Register new/i }))
    await user.type(screen.getByLabelText('Project Path'), '/tmp/manual-target')
    await user.click(screen.getByRole('button', { name: 'Add Target' }))

    expect(registerProviderTargetProjectAction).toHaveBeenCalledWith({
      projectPath: '/tmp/manual-target',
      displayName: undefined,
    })
  })
})
