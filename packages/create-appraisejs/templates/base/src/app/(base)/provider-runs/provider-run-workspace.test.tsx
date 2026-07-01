// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProviderRunWorkspace } from './provider-run-workspace'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/actions/provider-runs/provider-run-actions', () => ({
  cancelProviderRunAction: vi.fn(),
  createProviderRunAction: vi.fn(),
  decideProviderPermissionAction: vi.fn(),
}))

describe('ProviderRunWorkspace', () => {
  it('links to settings when no launchable providers are available', () => {
    render(
      <ProviderRunWorkspace
        runs={[]}
        adapters={[]}
        targetProjects={[
          {
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
          },
        ]}
        plans={[]}
      />,
    )

    expect(screen.getByText('No coding agent provider is enabled and launchable.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Settings/i })).toHaveAttribute('href', '/settings')
  })
})
