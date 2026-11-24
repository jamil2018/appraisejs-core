import { beforeEach, describe, expect, it, vi } from 'vitest'

import { submitConversationMessage } from './conversation-actions'

const mocks = vi.hoisted(() => ({
  activeProject: vi.fn(),
  replay: vi.fn(),
  append: vi.fn(),
  loadContext: vi.fn(),
  answer: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.activeProject }))
vi.mock('@/services/conversation/conversation-service', () => ({
  replayConversationTurn: mocks.replay,
  appendConversationTurn: mocks.append,
}))
vi.mock('@/services/coordinator/quality-journey-record-context', () => ({
  loadJourneyRecordContext: mocks.loadContext,
}))
vi.mock('@/services/workspace-search/workspace-record-search', () => ({ answerWorkspaceRequest: mocks.answer }))

const order = {
  projectId: 'project-a',
  idempotencyKey: '4494156a-2712-41fd-a744-09e73e5ca22d',
  content: 'Rename this case to Guest checkout',
  context: { kind: 'TEST_CASE', id: 'case-a', shownTitle: 'Old checkout' },
}

describe('conversation action boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.activeProject.mockResolvedValue({ id: order.projectId })
  })

  it('checks the trusted project before reading any conversation or record', async () => {
    mocks.activeProject.mockResolvedValue({ id: 'project-b' })
    expect(await submitConversationMessage(order)).toMatchObject({ success: false, error: /different project/ })
    expect(mocks.replay).not.toHaveBeenCalled()
    expect(mocks.loadContext).not.toHaveBeenCalled()
  })

  it('recovers the same committed turn before loading the old attachment', async () => {
    mocks.replay.mockResolvedValue({ conversation: { id: 'saved' } })
    expect(await submitConversationMessage(order)).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.replay).toHaveBeenCalledWith(expect.objectContaining({ context: order.context }))
    expect(mocks.loadContext).not.toHaveBeenCalled()
    expect(mocks.append).not.toHaveBeenCalled()
  })

  it('refuses a rename if the latest case title differs from the attachment shown to the user', async () => {
    mocks.loadContext.mockResolvedValue({ kind: 'test-case', id: 'case-a', title: 'A manual edit' })
    expect(await submitConversationMessage(order)).toMatchObject({ success: false, error: /case name changed/ })
    expect(mocks.append).not.toHaveBeenCalled()
  })

  it('sends the exact attached record to the guarded transaction', async () => {
    mocks.loadContext.mockResolvedValue({ kind: 'test-case', id: 'case-a', title: 'Old checkout' })
    mocks.append.mockResolvedValue({ conversation: { id: 'saved' } })
    expect(await submitConversationMessage(order)).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({
        targetProjectId: 'project-a',
        renameAttachedCaseTo: 'Guest checkout',
        context: { kind: 'TEST_CASE', id: 'case-a', title: 'Old checkout' },
      }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/test-cases')
  })
})
