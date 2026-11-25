import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  runConversationChatGptLookup,
  runConversationClaudeCodeLookup,
  runConversationCursorLookup,
  selectConversationReadProvider,
} from './conversation-read-actions'

const mocks = vi.hoisted(() => ({
  activeProject: vi.fn(),
  token: vi.fn(),
  provider: vi.fn(),
  nativeProvider: vi.fn(),
  nativeImage: vi.fn(),
  claudeConnection: vi.fn(),
  claudeProvider: vi.fn(),
  cursorConnection: vi.fn(),
  cursorProvider: vi.fn(),
  platform: vi.fn(),
  select: vi.fn(),
  verify: vi.fn(),
  revalidate: vi.fn(),
}))

vi.mock('node:os', async importOriginal => ({
  ...(await importOriginal<typeof import('node:os')>()),
  platform: mocks.platform,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.activeProject }))
vi.mock('@/services/conversation/chatgpt-read-provider', () => ({ createChatGptReadProvider: mocks.provider }))
vi.mock('@/services/conversation/claude-code-read-provider', () => ({
  createClaudeCodeReadProvider: mocks.claudeProvider,
}))
vi.mock('@/services/conversation/cursor-read-provider', () => ({ createCursorReadProvider: mocks.cursorProvider }))
vi.mock('@/services/conversation/codex-read-runtime', () => ({
  createConfiguredCodexReadProvider: mocks.nativeProvider,
}))
vi.mock('@/services/conversation/codex-read-launcher', () => ({ configuredMacCodexReadExecutable: mocks.nativeImage }))
vi.mock('@/services/conversation/conversation-read-service', () => ({
  verifyConversationLookup: mocks.verify,
  setConversationReadProvider: mocks.select,
}))
vi.mock('@/services/provider-connection/chatgpt-connection-service', () => ({
  chatGptConnection: { readLookupAccessToken: mocks.token },
  isChatGptConnectionSupported: () => true,
}))
vi.mock('@/services/provider-connection/claude-code-connection-service', () => ({
  getClaudeCodeConnection: mocks.claudeConnection,
}))
vi.mock('@/services/provider-connection/cursor-connection-service', () => ({
  getCursorConnection: mocks.cursorConnection,
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
    mocks.platform.mockReturnValue('darwin')
    mocks.activeProject.mockResolvedValue({ id: input.projectId })
    mocks.nativeImage.mockReturnValue({ executable: '/pinned/codex', sha256: 'a'.repeat(64) })
    mocks.token.mockResolvedValue('secret')
    mocks.claudeConnection.mockResolvedValue({ state: 'connected' })
    mocks.cursorConnection.mockResolvedValue({ state: 'connected' })
  })

  it('rejects a changed project or credential before attempting the read', async () => {
    mocks.activeProject.mockResolvedValueOnce({ id: 'project-other' })
    expect(await runConversationChatGptLookup(input)).toMatchObject({ success: false, error: /different project/ })
    expect(mocks.token).not.toHaveBeenCalled()
    mocks.token.mockResolvedValueOnce(undefined)
    expect(await runConversationChatGptLookup(input)).toMatchObject({ success: false, error: /connection changed/ })
    expect(mocks.token).toHaveBeenCalledExactlyOnceWith(input.profileKey)
    expect(mocks.verify).not.toHaveBeenCalled()
  })

  it('routes the selected engine to only its corresponding provider with the trusted scope', async () => {
    const directProvider = vi.fn()
    const nativeProvider = vi.fn()
    mocks.provider.mockReturnValue(directProvider)
    mocks.nativeProvider.mockReturnValue(nativeProvider)

    expect(await runConversationChatGptLookup(input)).toEqual({ success: true })
    expect(mocks.verify).toHaveBeenLastCalledWith(
      expect.objectContaining({ ...input, targetProjectId: input.projectId, expectedEngine: 'RESPONSES' }),
      directProvider,
    )
    expect(mocks.nativeProvider).not.toHaveBeenCalled()

    expect(await runConversationChatGptLookup({ ...input, engine: 'CODEX' })).toEqual({ success: true })
    expect(mocks.verify).toHaveBeenLastCalledWith(
      expect.objectContaining({ ...input, engine: 'CODEX', targetProjectId: input.projectId, expectedEngine: 'CODEX' }),
      nativeProvider,
    )
    expect(mocks.nativeProvider).toHaveBeenCalledOnce()
    expect(mocks.provider).toHaveBeenCalledOnce()
  })

  it.each([
    { host: 'darwin', configured: false },
    { host: 'linux', configured: true },
  ])(
    'rejects unsupported native selection or dispatch on $host (configured: $configured)',
    async ({ host, configured }) => {
      mocks.platform.mockReturnValue(host)
      if (!configured) mocks.nativeImage.mockReturnValue(undefined)
      expect(
        await selectConversationReadProvider({
          projectId: input.projectId,
          conversationId: input.conversationId,
          provider: 'CHATGPT',
          engine: 'CODEX',
        }),
      ).toMatchObject({ success: false, error: /Native Codex is unavailable/ })
      expect(await runConversationChatGptLookup({ ...input, engine: 'CODEX' })).toMatchObject({
        success: false,
        error: /Native Codex is unavailable/,
      })
      expect(mocks.select).not.toHaveBeenCalled()
      expect(mocks.verify).not.toHaveBeenCalled()
      expect(mocks.provider).not.toHaveBeenCalled()
      expect(mocks.nativeProvider).not.toHaveBeenCalled()
    },
  )

  it('does not fall back to Responses when native provider setup fails', async () => {
    mocks.nativeProvider.mockImplementationOnce(() => {
      throw new Error('native-setup-secret')
    })
    expect(await runConversationChatGptLookup({ ...input, engine: 'CODEX' })).toEqual({
      success: false,
      error: 'Could not update the provider read. Reload this chat.',
    })
    expect(mocks.provider).not.toHaveBeenCalled()
    expect(mocks.verify).not.toHaveBeenCalled()
  })

  it('persists a native choice and rejects invalid engine values', async () => {
    expect(
      await selectConversationReadProvider({
        projectId: input.projectId,
        conversationId: input.conversationId,
        provider: 'CHATGPT',
        engine: 'CODEX',
      }),
    ).toEqual({ success: true })
    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({ targetProjectId: input.projectId }),
      'CHATGPT',
      undefined,
      'CODEX',
    )
    expect(await runConversationChatGptLookup({ ...input, engine: 'OTHER' })).toMatchObject({ success: false })
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

  it('routes a Claude Code lookup through its own connection and provider', async () => {
    const provider = vi.fn()
    mocks.claudeProvider.mockResolvedValue(provider)
    expect(await runConversationClaudeCodeLookup({ ...input, profileKey: undefined, engine: 'CLAUDE_CODE' })).toEqual({
      success: false,
      error: 'Choose a valid conversation and read.',
    })
    expect(
      await runConversationClaudeCodeLookup({
        projectId: input.projectId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        engine: 'CLAUDE_CODE',
      }),
    ).toEqual({ success: true })
    expect(mocks.verify).toHaveBeenCalledWith(
      expect.objectContaining({ targetProjectId: input.projectId, expectedEngine: 'CLAUDE_CODE' }),
      provider,
    )
    expect(mocks.token).not.toHaveBeenCalled()
  })

  it('requires a connected Claude Code session before reserving a read', async () => {
    mocks.claudeConnection.mockResolvedValueOnce({ state: 'disconnected' })
    expect(
      await runConversationClaudeCodeLookup({
        projectId: input.projectId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        engine: 'CLAUDE_CODE',
      }),
    ).toMatchObject({ success: false, error: /Connect Claude Code/ })
    expect(mocks.claudeProvider).not.toHaveBeenCalled()
    expect(mocks.verify).not.toHaveBeenCalled()
  })

  it('selects Claude Code without reading ChatGPT credentials', async () => {
    expect(
      await selectConversationReadProvider({
        projectId: input.projectId,
        conversationId: input.conversationId,
        provider: 'CLAUDE',
        engine: 'CLAUDE_CODE',
      }),
    ).toEqual({ success: true })
    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({ targetProjectId: input.projectId }),
      'CLAUDE',
      undefined,
      'RESPONSES',
    )
    expect(mocks.token).not.toHaveBeenCalled()
  })

  it('routes a Cursor lookup through its own connection and provider', async () => {
    const provider = vi.fn()
    mocks.cursorProvider.mockResolvedValue(provider)
    expect(
      await runConversationCursorLookup({
        projectId: input.projectId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        engine: 'CURSOR_CLI',
      }),
    ).toEqual({ success: true })
    expect(mocks.verify).toHaveBeenCalledWith(
      expect.objectContaining({ targetProjectId: input.projectId, expectedEngine: 'CURSOR_CLI' }),
      provider,
    )
    expect(mocks.token).not.toHaveBeenCalled()
    expect(mocks.claudeProvider).not.toHaveBeenCalled()
  })

  it('requires a connected Cursor session before reserving a read', async () => {
    mocks.cursorConnection.mockResolvedValueOnce({ state: 'disconnected' })
    expect(
      await runConversationCursorLookup({
        projectId: input.projectId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        engine: 'CURSOR_CLI',
      }),
    ).toMatchObject({ success: false, error: /Connect Cursor/ })
    expect(mocks.cursorProvider).not.toHaveBeenCalled()
    expect(mocks.verify).not.toHaveBeenCalled()
  })

  it('selects Cursor without reading another provider credential', async () => {
    expect(
      await selectConversationReadProvider({
        projectId: input.projectId,
        conversationId: input.conversationId,
        provider: 'CURSOR',
        engine: 'CURSOR_CLI',
      }),
    ).toEqual({ success: true })
    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({ targetProjectId: input.projectId }),
      'CURSOR',
      undefined,
      'RESPONSES',
    )
    expect(mocks.token).not.toHaveBeenCalled()
    expect(mocks.claudeConnection).not.toHaveBeenCalled()
  })

  it('rejects Cursor when the local CLI is unavailable', async () => {
    mocks.cursorConnection.mockResolvedValueOnce({ state: 'unavailable' })
    expect(
      await selectConversationReadProvider({
        projectId: input.projectId,
        conversationId: input.conversationId,
        provider: 'CURSOR',
        engine: 'CURSOR_CLI',
      }),
    ).toMatchObject({ success: false, error: /Cursor is unavailable/ })
    expect(mocks.select).not.toHaveBeenCalled()
  })
})
