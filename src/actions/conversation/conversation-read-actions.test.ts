import { beforeEach, describe, expect, it, vi } from 'vitest'

import { runConversationChatGptLookup } from './conversation-read-actions'

const mocks = vi.hoisted(() => ({
  activeProject: vi.fn(),
  token: vi.fn(),
  provider: vi.fn(),
  verify: vi.fn(),
  revalidate: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.activeProject }))
vi.mock('@/services/conversation/chatgpt-read-provider', () => ({ createChatGptReadProvider: mocks.provider }))
vi.mock('@/services/conversation/conversation-read-service', () => ({ verifyConversationLookup: mocks.verify }))
vi.mock('@/services/provider-connection/chatgpt-connection-service', () => ({
  chatGptConnection: { readLookupAccessToken: mocks.token },
  isChatGptConnectionSupported: () => true,
}))

const input = {
  projectId: 'project-a',
  conversationId: '114779d6-5e94-43a0-babe-3ccbf880c8bb',
  messageId: '51de84c8-2fad-4c59-b47f-11e8060e47d4',
  profileKey: 'a'.repeat(64),
}

describe('ChatGPT lookup action', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.activeProject.mockResolvedValue({ id: input.projectId })
  })

  it('rejects a changed project or credential before attempting the read', async () => {
    mocks.activeProject.mockResolvedValueOnce({ id: 'project-other' })
    expect(await runConversationChatGptLookup(input)).toMatchObject({ success: false, error: /different project/ })
    expect(mocks.token).not.toHaveBeenCalled()
    expect(await runConversationChatGptLookup(input)).toMatchObject({ success: false, error: /connection changed/ })
    expect(mocks.token).toHaveBeenCalledExactlyOnceWith(input.profileKey)
    expect(mocks.verify).not.toHaveBeenCalled()
  })

  it('keeps unexpected server and credential-store errors out of the action result', async () => {
    mocks.token.mockRejectedValueOnce(new Error('sensitive-sentinel'))
    expect(await runConversationChatGptLookup(input)).toEqual({
      success: false,
      error: 'Could not update the provider read. Reload this chat.',
    })
    expect(mocks.verify).not.toHaveBeenCalled()
  })
})
