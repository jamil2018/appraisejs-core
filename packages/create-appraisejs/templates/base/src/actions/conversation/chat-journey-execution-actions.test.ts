import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ activeProject: vi.fn(), request: vi.fn(), approve: vi.fn(), refresh: vi.fn() }))

vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.activeProject }))
vi.mock('@/services/conversation/conversation-execution-service', () => ({
  requestConversationExecution: mocks.request,
  approveConversationExecution: mocks.approve,
}))

import { ServiceError } from '@/services/shared/errors'
import {
  approveChatJourneyExecutionPermission,
  requestChatJourneyExecutionPermission,
} from './chat-journey-execution-actions'

const scope = { conversationId: '953a9c63-fd67-47e4-a2ec-d5c94a3b2478', journeyId: 'journey-1' }
const digest = `sha256:${'a'.repeat(64)}`

describe('saved chat run permission actions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.activeProject.mockResolvedValue({ id: 'checkout-project' })
  })

  it('resolves the active project and refreshes the chat and canonical Journey', async () => {
    const input = { ...scope, environmentId: 'checkout', browserEngine: 'CHROMIUM', expectedStateHash: digest }
    await expect(requestChatJourneyExecutionPermission(input)).resolves.toEqual({ success: true })
    expect(mocks.request).toHaveBeenCalledWith({ ...input, targetProjectId: 'checkout-project' })
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(mocks.refresh.mock.calls).toEqual([
      [`/conversations/${scope.conversationId}`],
      [`/quality-journeys/${scope.journeyId}`],
    ])
  })

  it('passes only the displayed consent identity and returns the canonical refusal', async () => {
    const input = { ...scope, executionConsentId: 'consent-1', expectedScopeHash: digest }
    mocks.approve.mockRejectedValue(new ServiceError('Run permission expired.', 'CONFLICT'))

    await expect(approveChatJourneyExecutionPermission(input)).resolves.toEqual({
      success: false,
      status: 409,
      error: 'Run permission expired.',
    })
    expect(mocks.approve).toHaveBeenCalledWith({ ...input, targetProjectId: 'checkout-project' })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('refuses caller-supplied project or invalid scope data before invoking the service', async () => {
    await expect(
      approveChatJourneyExecutionPermission({
        ...scope,
        executionConsentId: 'consent-1',
        expectedScopeHash: digest,
        targetProjectId: 'foreign-project',
      }),
    ).resolves.toMatchObject({ success: false, status: 400 })
    await expect(
      requestChatJourneyExecutionPermission({ ...scope, environmentId: 'checkout', expectedStateHash: 'invalid' }),
    ).resolves.toMatchObject({ success: false, status: 400 })
    expect(mocks.activeProject).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.approve).not.toHaveBeenCalled()
  })
})
