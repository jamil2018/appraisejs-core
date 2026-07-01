// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SettingsCodingAgentsPanel, type CodingAgentRegistration } from './settings-coding-agents-panel'

const { refresh, probeProviderAction, updateProviderAction } = vi.hoisted(() => ({
  refresh: vi.fn(),
  probeProviderAction: vi.fn(),
  updateProviderAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/actions/settings/provider-agent-actions', () => ({
  probeProviderAction,
  updateProviderAction,
}))

const providers: CodingAgentRegistration[] = [
  {
    key: 'codex',
    displayName: 'Codex',
    providerKind: 'codex',
    enabled: false,
    executablePath: 'codex',
    detectedVersion: null,
    probeStatus: 'not_probed',
    probeMessage: 'Install and sign in to Codex.',
    lastProbedAt: null,
    defaultProfile: 'planning-default',
    defaultModel: null,
    launchEnabled: false,
    launchable: false,
    settings: { setupMessage: 'Install and sign in to Codex.' },
  },
]

describe('SettingsCodingAgentsPanel', () => {
  it('renders provider state and probes a provider', async () => {
    const user = userEvent.setup()
    probeProviderAction.mockResolvedValue({ status: 200, success: true })

    render(<SettingsCodingAgentsPanel providers={providers} />)

    expect(screen.getByText('Coding Agents')).toBeInTheDocument()
    expect(screen.getByText('Codex')).toBeInTheDocument()
    expect(screen.getByText('not probed')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Probe' }))

    await waitFor(() => {
      expect(probeProviderAction).toHaveBeenCalledWith({ providerKey: 'codex' })
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('saves executable and enable state without secrets', async () => {
    const user = userEvent.setup()
    updateProviderAction.mockResolvedValue({ status: 200, success: true })

    render(<SettingsCodingAgentsPanel providers={providers} />)

    await user.clear(screen.getByLabelText('Executable'))
    await user.type(screen.getByLabelText('Executable'), '/opt/bin/codex')
    await user.click(screen.getByRole('button', { name: 'Enable' }))

    await waitFor(() => {
      expect(updateProviderAction).toHaveBeenCalledWith(
        expect.objectContaining({
          providerKey: 'codex',
          executablePath: '/opt/bin/codex',
          enabled: true,
          launchEnabled: true,
        }),
      )
    })
  })
})
