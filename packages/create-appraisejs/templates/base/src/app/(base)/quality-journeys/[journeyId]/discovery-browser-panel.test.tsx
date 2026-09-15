// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  arm: vi.fn(),
  confirm: vi.fn(),
  capture: vi.fn(),
  missing: vi.fn(),
  logout: vi.fn(),
  revoke: vi.fn(),
  replace: vi.fn(),
  close: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('../quality-journey-discovery-browser-actions', () => ({
  startQualityJourneyDiscoveryBrowserAction: mocks.start,
  armQualityJourneyDiscoveryBrowserHumanReturnAction: mocks.arm,
  confirmQualityJourneyDiscoveryBrowserAccessAction: mocks.confirm,
  captureQualityJourneyDiscoveryBrowserReceiptAction: mocks.capture,
  markQualityJourneyDiscoveryBrowserMissingAccessAction: mocks.missing,
  logoutQualityJourneyDiscoveryBrowserAction: mocks.logout,
  revokeQualityJourneyDiscoveryBrowserAction: mocks.revoke,
  replaceQualityJourneyDiscoveryBrowserContextAction: mocks.replace,
  closeQualityJourneyDiscoveryBrowserAction: mocks.close,
}))

import { DiscoveryBrowserPanel } from './discovery-browser-panel'

const discovery = {
  id: 'discovery-1',
  workItemId: 'scout-1',
  environments: [{ id: 'environment-1', name: 'Local' }],
  routes: ['/account'],
  authFlows: [{ environmentId: 'environment-1', flowId: 'test-login' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.start.mockResolvedValue({
    success: true,
    data: {
      id: 'session-1',
      state: 'ACTIVE',
      discoveryRevisionId: 'discovery-1',
      accessMode: 'AUTHENTICATED_INTENT',
      environmentId: 'environment-1',
      routeId: '/account',
      currentUrl: 'https://example.test/account',
      expiresAt: '2026-09-14T00:05:00.000Z',
    },
  })
  mocks.confirm.mockResolvedValue({
    success: true,
    data: {
      id: 'session-1',
      state: 'ACCESS_CONFIRMED',
      discoveryRevisionId: 'discovery-1',
      accessMode: 'AUTHENTICATED_INTENT',
      environmentId: 'environment-1',
      routeId: '/account',
      currentUrl: 'https://example.test/account',
      expiresAt: '2026-09-14T00:05:00.000Z',
    },
  })
  mocks.arm.mockResolvedValue({
    success: true,
    data: {
      session: {
        id: 'session-1',
        state: 'ACTIVE',
        discoveryRevisionId: 'discovery-1',
        accessMode: 'AUTHENTICATED_INTENT',
        environmentId: 'environment-1',
        routeId: '/account',
        currentUrl: 'https://idp.example.test/complete',
        expiresAt: '2026-09-14T00:05:00.000Z',
      },
      returnUrl: 'https://example.test/account',
    },
  })
})

it('keeps credential and MFA entry out of Appraise actions', async () => {
  const user = userEvent.setup()
  render(<DiscoveryBrowserPanel discovery={discovery} journeyId="journey-1" />)

  expect(screen.queryByLabelText(/password|credential|mfa code/i)).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Access'), 'AUTHENTICATED_INTENT')
  await user.click(screen.getByRole('button', { name: 'Open scoped browser' }))

  expect(mocks.start).toHaveBeenCalledWith({
    journeyId: 'journey-1',
    discoveryRevisionId: 'discovery-1',
    workItemId: 'scout-1',
    environmentId: 'environment-1',
    routeId: '/account',
    accessMode: 'AUTHENTICATED_INTENT',
    authFlowId: 'test-login',
  })
  expect(JSON.stringify(mocks.start.mock.calls)).not.toMatch(/password|credential|mfaCode|cookie|storage/i)
  expect(screen.getByText(/Complete sign-in and MFA directly in the opened target browser/i)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Authorize exact return' }))
  expect(mocks.arm).toHaveBeenCalledWith({
    sessionId: 'session-1',
    journeyId: 'journey-1',
    discoveryRevisionId: 'discovery-1',
  })
  expect(screen.getByText('https://example.test/account')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(JSON.stringify(mocks.arm.mock.calls)).not.toMatch(/password|credential|mfaCode|cookie|storage|returnUrl/i)

  await user.click(screen.getByRole('button', { name: 'I returned to the scoped page' }))
  expect(mocks.confirm).toHaveBeenCalledWith({
    sessionId: 'session-1',
    journeyId: 'journey-1',
    discoveryRevisionId: 'discovery-1',
  })
  expect(screen.getByRole('button', { name: 'Record Appraise browser receipt' })).toBeEnabled()
})

it('does not render outside an active discovery revision', () => {
  const { container } = render(<DiscoveryBrowserPanel discovery={null} journeyId="journey-1" />)
  expect(container).toBeEmptyDOMElement()
})

it('lets a terminal session return to the fresh-session controls', async () => {
  const user = userEvent.setup()
  mocks.start.mockResolvedValueOnce({
    success: true,
    data: {
      id: 'session-1',
      state: 'REVOKED',
      discoveryRevisionId: 'discovery-1',
      accessMode: 'ANONYMOUS',
      environmentId: 'environment-1',
      routeId: '/account',
      currentUrl: 'https://example.test/account',
      expiresAt: '2026-09-14T00:05:00.000Z',
    },
  })
  render(<DiscoveryBrowserPanel discovery={discovery} journeyId="journey-1" />)
  await user.click(screen.getByRole('button', { name: 'Open scoped browser' }))
  await user.click(screen.getByRole('button', { name: 'Start a fresh session' }))
  expect(screen.getByRole('button', { name: 'Open scoped browser' })).toBeInTheDocument()
})
