// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  authorizeReturn: vi.fn(),
  confirm: vi.fn(),
  capture: vi.fn(),
  missing: vi.fn(),
  logout: vi.fn(),
  revoke: vi.fn(),
  replace: vi.fn(),
  close: vi.fn(),
  seal: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('../quality-journey-discovery-browser-actions', () => ({
  startQualityJourneyDiscoveryBrowserAction: mocks.start,
  authorizeQualityJourneyDiscoveryBrowserExactReturnAction: mocks.authorizeReturn,
  confirmQualityJourneyDiscoveryBrowserAccessAction: mocks.confirm,
  captureQualityJourneyDiscoveryBrowserReceiptAction: mocks.capture,
  markQualityJourneyDiscoveryBrowserMissingAccessAction: mocks.missing,
  logoutQualityJourneyDiscoveryBrowserAction: mocks.logout,
  revokeQualityJourneyDiscoveryBrowserAction: mocks.revoke,
  replaceQualityJourneyDiscoveryBrowserContextAction: mocks.replace,
  closeQualityJourneyDiscoveryBrowserAction: mocks.close,
  sealManagedScoutEvidenceReviewAction: mocks.seal,
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
      currentUrl: null,
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
  mocks.authorizeReturn.mockResolvedValue({
    success: true,
    data: {
      return: 'RETURN_COMMITTED',
      session: {
        id: 'session-1',
        state: 'ACTIVE',
        discoveryRevisionId: 'discovery-1',
        accessMode: 'AUTHENTICATED_INTENT',
        environmentId: 'environment-1',
        routeId: '/account',
        currentUrl: 'https://example.test/account',
        expiresAt: '2026-09-14T00:05:00.000Z',
      },
    },
  })
  mocks.close.mockResolvedValue({ success: true, data: { id: 'session-1', state: 'CLOSED' } })
  mocks.seal.mockResolvedValue({ success: true, data: {} })
})

const managedReview = {
  discoveryRevisionId: 'discovery-1',
  pages: [{ artifactId: 'receipt-1', routeId: '/account', environmentId: 'environment-1' }],
  reviewHash: `sha256:${'a'.repeat(64)}`,
}

it('shows the server-reviewed page set after reload and seals exactly that hash', async () => {
  const user = userEvent.setup()
  render(<DiscoveryBrowserPanel discovery={discovery} journeyId="journey-1" managedReview={managedReview} />)

  const review = screen.getByRole('region', { name: 'Inspected pages review' })
  expect(review).toHaveTextContent('/account')
  expect(review).toHaveTextContent('Local (environment-1)')
  expect(review).toHaveTextContent('receipt-1')
  await user.click(screen.getByRole('button', { name: 'Continue with inspected pages' }))
  expect(mocks.seal).toHaveBeenCalledWith({
    journeyId: 'journey-1',
    discoveryRevisionId: 'discovery-1',
    reviewHash: managedReview.reviewHash,
  })
  expect(mocks.refresh).toHaveBeenCalled()
})

it('closes a live browser before offering another page and never seals while it is open', async () => {
  const user = userEvent.setup()
  render(<DiscoveryBrowserPanel discovery={discovery} journeyId="journey-1" managedReview={managedReview} />)
  await user.click(screen.getByRole('button', { name: 'Open target app' }))
  expect(screen.getByRole('button', { name: 'Continue with inspected pages' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Close browser and inspect another page' }))
  expect(mocks.close).toHaveBeenCalledWith({
    journeyId: 'journey-1',
    discoveryRevisionId: 'discovery-1',
    sessionId: 'session-1',
  })
  expect(mocks.seal).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Open target app' })).toBeInTheDocument()
  expect(mocks.refresh).toHaveBeenCalled()
})

it('refreshes the durable reviewed set after a managed page inspection is saved', async () => {
  const user = userEvent.setup()
  mocks.start.mockResolvedValueOnce({
    success: true,
    data: {
      id: 'session-1',
      state: 'ACTIVE',
      discoveryRevisionId: 'discovery-1',
      accessMode: 'ANONYMOUS',
      environmentId: 'environment-1',
      routeId: '/account',
      currentUrl: 'https://example.test/account',
      expiresAt: '2026-09-14T00:05:00.000Z',
    },
  })
  mocks.capture.mockResolvedValueOnce({
    success: true,
    data: {
      artifactId: 'receipt-2',
      contentHash: 'b'.repeat(64),
      receipt: { observationFacts: ['Page heading was visible'] },
    },
  })
  render(<DiscoveryBrowserPanel discovery={discovery} journeyId="journey-1" managedReview={managedReview} />)
  await user.click(screen.getByRole('button', { name: 'Open target app' }))
  await user.click(screen.getByRole('button', { name: 'Save page inspection' }))
  expect(mocks.refresh).toHaveBeenCalled()
  expect(screen.getByText('Page inspection saved')).toBeInTheDocument()
})

it('keeps the browser session visible if the close action fails', async () => {
  const user = userEvent.setup()
  mocks.close.mockResolvedValueOnce({ success: false, error: 'Cleanup is not confirmed' })
  render(<DiscoveryBrowserPanel discovery={discovery} journeyId="journey-1" managedReview={managedReview} />)
  await user.click(screen.getByRole('button', { name: 'Open target app' }))
  await user.click(screen.getByRole('button', { name: 'Close browser and inspect another page' }))
  expect(screen.getByRole('region', { name: 'Discovery browser session status' })).toBeInTheDocument()
  expect(mocks.toast).toHaveBeenCalledWith({
    title: 'Browser could not be closed',
    description: 'Cleanup is not confirmed',
    variant: 'destructive',
  })
  expect(mocks.refresh).not.toHaveBeenCalled()
})

it('withholds continuation until the server supplies a review hash', () => {
  render(
    <DiscoveryBrowserPanel
      discovery={discovery}
      journeyId="journey-1"
      managedReview={{ ...managedReview, reviewHash: null }}
    />,
  )
  expect(screen.queryByRole('button', { name: 'Continue with inspected pages' })).not.toBeInTheDocument()
})

it('keeps credential and MFA entry out of Appraise actions', async () => {
  const user = userEvent.setup()
  render(<DiscoveryBrowserPanel discovery={discovery} journeyId="journey-1" />)

  expect(screen.queryByLabelText(/password|credential|mfa code/i)).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Access'), 'AUTHENTICATED_INTENT')
  await user.click(screen.getByRole('button', { name: 'Open target app' }))

  expect(mocks.start).toHaveBeenCalledWith({
    journeyId: 'journey-1',
    discoveryRevisionId: 'discovery-1',
    workItemId: 'scout-1',
    environmentId: 'environment-1',
    routeId: '/account',
    accessMode: 'AUTHENTICATED_INTENT',
    authFlowId: 'test-login',
    ttlSeconds: 900,
  })
  expect(JSON.stringify(mocks.start.mock.calls)).not.toMatch(/password|credential|mfaCode|cookie|storage/i)
  expect(screen.getByText(/Complete sign-in and MFA directly in the opened target browser/i)).toBeInTheDocument()
  expect(screen.queryByText('https://example.test/account')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Authorize exact return' }))
  expect(mocks.authorizeReturn).toHaveBeenCalledWith({
    sessionId: 'session-1',
    journeyId: 'journey-1',
    discoveryRevisionId: 'discovery-1',
  })
  expect(screen.getByText(/Appraise completed the exact return in the owned browser/i)).toBeInTheDocument()
  expect(screen.queryByText(/Type this server-derived/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(JSON.stringify(mocks.authorizeReturn.mock.calls)).not.toMatch(
    /password|credential|mfaCode|cookie|storage|returnUrl/i,
  )

  await user.click(screen.getByRole('button', { name: 'I can access the protected scoped page' }))
  expect(mocks.confirm).toHaveBeenCalledWith({
    sessionId: 'session-1',
    journeyId: 'journey-1',
    discoveryRevisionId: 'discovery-1',
  })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save page inspection' })).toBeEnabled())
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
  await user.click(screen.getByRole('button', { name: 'Open target app' }))
  await user.click(screen.getByRole('button', { name: 'Start a fresh session' }))
  expect(screen.getByRole('button', { name: 'Open target app' })).toBeInTheDocument()
})

it.each(['READY', 'INSPECTING'] as const)(
  'hides manual capture and recovery while automatic inspection is %s',
  status => {
    const { container } = render(
      <DiscoveryBrowserPanel discovery={discovery} journeyId="journey-1" automaticStatus={status} />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  },
)
it('shows an actionable cleanup explanation without offering a new capture while ownership is unresolved', () => {
  render(<DiscoveryBrowserPanel discovery={discovery} journeyId="journey-1" automaticStatus="RECOVERY_REQUIRED" />)
  expect(screen.getByRole('status')).toHaveTextContent('cleanup was confirmed')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('omits manual browser controls once admissible evidence is available', () => {
  const { container } = render(
    <DiscoveryBrowserPanel discovery={discovery} journeyId="journey-1" automaticStatus="EVIDENCE_AVAILABLE" />,
  )
  expect(container).toBeEmptyDOMElement()
})
