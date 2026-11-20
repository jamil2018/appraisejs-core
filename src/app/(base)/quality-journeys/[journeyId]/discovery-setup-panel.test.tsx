// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ select: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/actions/target-project/target-project-actions', () => ({ selectTargetProjectAction: mocks.select }))

import { DiscoverySetupPanel } from './discovery-setup-panel'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.select.mockResolvedValue({ success: true })
})

it('selects the Journey project before opening canonical setup forms', async () => {
  render(
    <DiscoverySetupPanel
      projectId="project-b"
      prerequisites={{ ready: false, missing: ['environment', 'module', 'locator-group'] }}
    />,
  )
  expect(screen.getByText(/No locators are required yet/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Create environment' }))
  expect(mocks.select).toHaveBeenCalledWith({ targetProjectId: 'project-b' })
  expect(mocks.push).toHaveBeenCalledWith('/environments/create?project=project-b')
  expect(mocks.select.mock.invocationCallOrder[0]).toBeLessThan(mocks.push.mock.invocationCallOrder[0])
})

it('stays in the Journey when selecting the setup project fails', async () => {
  mocks.select.mockResolvedValue({ success: false, error: 'Project unavailable' })
  render(<DiscoverySetupPanel projectId="project-b" prerequisites={{ ready: false, missing: ['module'] }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Create module' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Project unavailable')
  expect(mocks.push).not.toHaveBeenCalled()
})

it('does not offer setup when the project is ready', () => {
  render(<DiscoverySetupPanel projectId="project-b" prerequisites={{ ready: true, missing: [] }} />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('keeps setup recoverable if project selection is interrupted', async () => {
  mocks.select.mockRejectedValue(new Error('Connection lost'))
  render(<DiscoverySetupPanel projectId="project-b" prerequisites={{ ready: false, missing: ['module'] }} />)
  await userEvent.click(screen.getByRole('button', { name: 'Create module' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Project selection was interrupted')
  expect(mocks.push).not.toHaveBeenCalled()
})
