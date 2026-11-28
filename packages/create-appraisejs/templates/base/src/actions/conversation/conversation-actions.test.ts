import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ServiceError } from '@/services/shared/errors'

import { submitConversationMessage } from './conversation-actions'

const mocks = vi.hoisted(() => ({
  activeProject: vi.fn(),
  replay: vi.fn(),
  append: vi.fn(),
  loadContext: vi.fn(),
  answer: vi.fn(),
  revalidatePath: vi.fn(),
  schedule: vi.fn(),
  latestJourney: vi.fn(),
  evidence: vi.fn(),
  execution: vi.fn(),
  approveWithTurn: vi.fn(),
  prepareCollaboration: vi.fn(),
  getConversation: vi.fn(),
  after: vi.fn(),
  continueCollaboration: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.activeProject }))
vi.mock('@/services/conversation/conversation-service', () => ({
  replayConversationTurn: mocks.replay,
  appendConversationTurn: mocks.append,
  getLatestConversationJourney: mocks.latestJourney,
  getProjectConversation: mocks.getConversation,
}))
vi.mock('@/services/conversation/conversation-collaboration-review', () => ({
  prepareConversationCollaboration: mocks.prepareCollaboration,
}))
vi.mock('@/services/repository-collaboration/operation-service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/repository-collaboration/operation-service')>()),
  continueAcceptedCollaborationOperation: mocks.continueCollaboration,
}))
vi.mock('@/services/conversation/conversation-journey-evidence', () => ({
  readConversationJourneyEvidence: mocks.evidence,
}))
vi.mock('@/services/conversation/conversation-execution-service', () => ({
  readConversationExecution: mocks.execution,
  approveConversationExecutionWithTurn: mocks.approveWithTurn,
}))
vi.mock('@/services/coordinator/quality-journey-record-context', () => ({
  loadJourneyRecordContext: mocks.loadContext,
}))
vi.mock('@/services/workspace-search/workspace-record-search', () => ({ answerWorkspaceRequest: mocks.answer }))
vi.mock('@/services/coordinator/app-managed-progression-service', () => ({
  scheduleAppManagedJourneyContinuation: mocks.schedule,
}))

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

  it('opens the canonical scoped brief without creating a Journey from the message', async () => {
    mocks.append.mockResolvedValue({ conversation: { id: 'saved' } })
    expect(
      await submitConversationMessage({
        projectId: order.projectId,
        idempotencyKey: order.idempotencyKey,
        content: 'Start a Journey for checkout',
      }),
    ).toMatchObject({ success: true })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({
        reply: expect.objectContaining({
          records: [
            { kind: 'QUALITY_JOURNEY', id: order.projectId, title: 'Start a Quality Journey', destination: 'create' },
          ],
        }),
      }),
    )
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('links the original unknown run when asked for observed activity', async () => {
    const conversationId = '00000000-0000-4000-8000-000000000001'
    mocks.latestJourney.mockResolvedValue('journey-a')
    mocks.execution.mockResolvedValue({
      execution: {
        cycles: [
          { status: 'RUNNING', testRuns: [{ testRunId: 'run-a', diagnostic: { duplicateLaunchPrevented: true } }] },
        ],
      },
    })
    mocks.append.mockResolvedValue({ conversation: { id: conversationId } })
    const request = {
      projectId: order.projectId,
      conversationId,
      idempotencyKey: order.idempotencyKey,
      content: 'Show run activity',
    }
    expect(await submitConversationMessage(request)).toMatchObject({ success: true })
    expect(mocks.execution).toHaveBeenCalledExactlyOnceWith({
      targetProjectId: order.projectId,
      conversationId,
      journeyId: 'journey-a',
    })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({
        reply: {
          content: expect.stringContaining('cannot confirm'),
          records: [{ kind: 'TEST_RUN', id: 'run-a', title: 'Recorded test run 1' }],
        },
      }),
    )
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('does not forward a typed approval if the trusted project changed', async () => {
    const hash = `sha256:${'ab'.repeat(32)}`
    mocks.activeProject.mockResolvedValue({ id: 'project-b' })
    expect(
      await submitConversationMessage({
        projectId: order.projectId,
        conversationId: '00000000-0000-4000-8000-000000000001',
        idempotencyKey: order.idempotencyKey,
        content: 'Approve criteria',
        analysisReview: { journeyId: 'journey-a', revisionId: 'revision-a', reviewHash: hash, stateHash: hash },
      }),
    ).toMatchObject({ success: false, status: 409 })
    expect(mocks.append).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('routes only an exact displayed Run permission to the atomic consent service', async () => {
    const conversationId = '00000000-0000-4000-8000-000000000001'
    const review = {
      journeyId: 'journey-a',
      executionConsentId: 'consent-a',
      expectedScopeHash: `sha256:${'a'.repeat(64)}`,
    }
    mocks.approveWithTurn.mockResolvedValue({ conversation: { id: conversationId }, messages: [] })
    expect(
      await submitConversationMessage({
        projectId: order.projectId,
        conversationId,
        idempotencyKey: order.idempotencyKey,
        content: 'Allow and run these tests',
        runPermissionReview: review,
      }),
    ).toEqual({ success: true, conversationId })
    expect(mocks.approveWithTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        targetProjectId: order.projectId,
        conversationId,
        ...review,
      }),
    )
    expect(mocks.append).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/quality-journeys/journey-a')
  })

  it('keeps typed Run permission text review-only when no current card is bound', async () => {
    const conversationId = '00000000-0000-4000-8000-000000000001'
    mocks.latestJourney.mockResolvedValue('journey-a')
    mocks.append.mockResolvedValue({ conversation: { id: conversationId }, messages: [] })
    expect(
      await submitConversationMessage({
        projectId: order.projectId,
        conversationId,
        idempotencyKey: order.idempotencyKey,
        content: 'Allow and run these tests',
      }),
    ).toEqual({ success: true, conversationId })
    expect(mocks.approveWithTurn).not.toHaveBeenCalled()
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({
        reply: expect.objectContaining({ content: expect.stringContaining('Review the current Run permission') }),
      }),
    )
  })

  it('recovers the same committed turn before loading the old attachment', async () => {
    mocks.replay.mockResolvedValue({ conversation: { id: 'saved' } })
    expect(await submitConversationMessage(order)).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.replay).toHaveBeenCalledWith(expect.objectContaining({ context: order.context }))
    expect(mocks.loadContext).not.toHaveBeenCalled()
    expect(mocks.append).not.toHaveBeenCalled()
  })

  it('saves the exact observed failed step and replays its scoped link without reading newer evidence', async () => {
    const conversationId = '00000000-0000-4000-8000-000000000001'
    const evidenceRecord = {
      kind: 'REPORT',
      id: 'report-a',
      title: 'Then the order number is visible',
      reportStepId: 'step-a',
    }
    const request = {
      projectId: order.projectId,
      conversationId,
      content: 'Show me where.',
      idempotencyKey: order.idempotencyKey,
    }
    const stored = {
      conversation: { id: conversationId, targetProjectId: order.projectId },
      messages: [{ records: [evidenceRecord] }],
    }
    mocks.latestJourney.mockResolvedValue('journey-a')
    mocks.evidence.mockResolvedValue({
      latestCycleId: 'cycle-a',
      runs: [
        {
          executionCycleId: 'old-cycle',
          outcome: 'FAILED',
          reportId: 'old-report',
          steps: [{ status: 'FAILED', id: 'old-step' }],
        },
        {
          executionCycleId: 'cycle-a',
          outcome: 'FAILED',
          reportId: 'report-a',
          steps: [
            { status: 'PASSED', id: 'setup-step', label: 'Given checkout opens' },
            { status: 'FAILED', id: 'step-a', label: evidenceRecord.title },
          ],
        },
      ],
    })
    mocks.append.mockResolvedValue(stored)

    const response = {
      success: true,
      conversationId,
      evidenceHref: '/reports/report-a?project=project-a&step=step-a#step-evidence',
    }
    expect(await submitConversationMessage(request)).toEqual(response)
    expect(mocks.evidence).toHaveBeenCalledWith({
      targetProjectId: 'project-a',
      conversationId,
      journeyId: 'journey-a',
    })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({ reply: { content: 'Here is the recorded failed step.', records: [evidenceRecord] } }),
    )
    mocks.replay.mockResolvedValue(stored)
    expect(await submitConversationMessage(request)).toEqual(response)
    expect(mocks.evidence).toHaveBeenCalledTimes(1)
    expect(mocks.append).toHaveBeenCalledTimes(1)
    expect(mocks.answer).not.toHaveBeenCalled()
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

  it('binds an exact suite membership request to the shown case title and project', async () => {
    const request = {
      ...order,
      content: 'Add this case to suite “Checkout smoke” in module “Checkout”',
    }
    mocks.loadContext.mockResolvedValue({ kind: 'test-case', id: 'case-a', title: 'Changed elsewhere' })
    expect(await submitConversationMessage(request)).toMatchObject({ success: false, status: 409 })
    expect(mocks.append).not.toHaveBeenCalled()
    mocks.loadContext.mockResolvedValue({ kind: 'test-case', id: 'case-a', title: 'Old checkout' })
    mocks.append.mockResolvedValue({ conversation: { id: 'saved' }, messages: [] })
    expect(await submitConversationMessage(request)).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({
        targetProjectId: 'project-a',
        addAttachedCaseToSuite: { suiteName: 'Checkout smoke', moduleName: 'Checkout' },
        context: { kind: 'TEST_CASE', id: 'case-a', title: 'Old checkout' },
        reply: undefined,
      }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/test-suites')
  })

  it('routes an exact uniquely scoped suite rename through the saved turn', async () => {
    mocks.append.mockResolvedValue({ conversation: { id: 'saved' }, messages: [] })
    expect(
      await submitConversationMessage({
        projectId: 'project-a',
        idempotencyKey: order.idempotencyKey,
        content: 'Rename test suite “Checkout smoke” in module “Checkout” to “Guest smoke”',
      }),
    ).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({
        targetProjectId: 'project-a',
        renameExactSuite: { currentName: 'Checkout smoke', moduleName: 'Checkout', nextName: 'Guest smoke' },
        context: undefined,
        reply: undefined,
      }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/test-suites')
  })

  it('routes an exact filter tag rename through the saved turn', async () => {
    mocks.append.mockResolvedValue({ conversation: { id: 'saved' }, messages: [] })
    expect(
      await submitConversationMessage({
        projectId: 'project-a',
        idempotencyKey: order.idempotencyKey,
        content: 'Rename tag “Smoke” with expression @smoke to “Release smoke”',
      }),
    ).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({
        targetProjectId: 'project-a',
        renameExactTag: { currentName: 'Smoke', tagExpression: '@smoke', nextName: 'Release smoke' },
        context: undefined,
        reply: undefined,
      }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/tags')
  })

  it('routes an explicit module creation through the saved turn and invalidates modules', async () => {
    mocks.append.mockResolvedValue({ conversation: { id: 'saved' } })
    expect(
      await submitConversationMessage({
        projectId: order.projectId,
        idempotencyKey: order.idempotencyKey,
        content: 'Create a module named Checkout',
      }),
    ).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({
        targetProjectId: order.projectId,
        createRootModuleName: 'Checkout',
        reply: undefined,
      }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/modules')
    expect(mocks.answer).not.toHaveBeenCalled()
  })

  it('recovers a committed module request after a lost response before attempting another write', async () => {
    mocks.replay.mockResolvedValue({ conversation: { id: 'saved' }, messages: [] })
    expect(
      await submitConversationMessage({
        projectId: order.projectId,
        idempotencyKey: order.idempotencyKey,
        content: 'Add a checkout module',
      }),
    ).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.append).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('routes an exact tag create to the saved turn and invalidates tags', async () => {
    mocks.append.mockResolvedValue({ conversation: { id: 'saved' } })
    expect(
      await submitConversationMessage({
        projectId: order.projectId,
        idempotencyKey: order.idempotencyKey,
        content: 'Create a tag named Smoke with expression @smoke',
      }),
    ).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({ createExactTag: { name: 'Smoke', tagExpression: '@smoke' }, reply: undefined }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/tags')
  })

  it('recovers an exact tag create before another mutation', async () => {
    mocks.replay.mockResolvedValue({ conversation: { id: 'saved' }, messages: [] })
    expect(
      await submitConversationMessage({
        projectId: order.projectId,
        idempotencyKey: order.idempotencyKey,
        content: 'Create a tag named Smoke with expression @smoke',
      }),
    ).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.append).not.toHaveBeenCalled()
  })

  it('routes an exact environment create through the saved turn and invalidates environments', async () => {
    mocks.append.mockResolvedValue({ conversation: { id: 'saved' } })
    expect(
      await submitConversationMessage({
        projectId: order.projectId,
        idempotencyKey: order.idempotencyKey,
        content: 'Create an environment named Staging with base URL https://staging.example.test',
      }),
    ).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({
        createExactEnvironment: { name: 'Staging', baseUrl: 'https://staging.example.test' },
        reply: undefined,
      }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/environments')
  })

  it.each([
    'https://fixture-user:fixture-password@staging.example.test',
    'https://staging.example.test?token=fixture-token',
    'https://staging.example.test#fixture-fragment',
  ])('rejects sensitive environment URLs before reading or writing a saved turn', async baseUrl => {
    const result = await submitConversationMessage({
      projectId: order.projectId,
      idempotencyKey: order.idempotencyKey,
      content: `Create an environment named Staging with base URL ${baseUrl}`,
    })

    expect(result).toMatchObject({ success: false, status: 400 })
    expect(JSON.stringify(result)).not.toContain(baseUrl)
    expect(mocks.replay).not.toHaveBeenCalled()
    expect(mocks.append).not.toHaveBeenCalled()
  })

  it('recovers a committed environment create before another mutation', async () => {
    mocks.replay.mockResolvedValue({ conversation: { id: 'saved' }, messages: [] })
    expect(
      await submitConversationMessage({
        projectId: order.projectId,
        idempotencyKey: order.idempotencyKey,
        content: 'Create an environment named Staging with base URL https://staging.example.test',
      }),
    ).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.append).not.toHaveBeenCalled()
  })

  it('routes an exact suite create through the saved turn and invalidates suites', async () => {
    mocks.append.mockResolvedValue({ conversation: { id: 'saved' } })
    expect(
      await submitConversationMessage({
        projectId: order.projectId,
        idempotencyKey: order.idempotencyKey,
        content: 'Create a test suite named “Checkout smoke” in module “Checkout”',
      }),
    ).toEqual({ success: true, conversationId: 'saved' })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({
        createExactSuite: { name: 'Checkout smoke', moduleName: 'Checkout' },
        reply: undefined,
      }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/test-suites')
    expect(mocks.answer).not.toHaveBeenCalled()
  })

  it.each([
    'Create a test suite named Checkout smoke in module Checkout and run it',
    'Create a test suite named “https://fixture:fixture-password@example.test” in module “Checkout”',
    'Create a test suite named “Checkout smoke” in module “Check\u0000out”',
  ])('refuses an invalid suite create before replay or persistence', async content => {
    const result = await submitConversationMessage({
      projectId: order.projectId,
      idempotencyKey: order.idempotencyKey,
      content,
    })
    expect(result).toMatchObject({ success: false, status: 400 })
    expect(JSON.stringify(result)).not.toContain(content)
    expect(mocks.replay).not.toHaveBeenCalled()
    expect(mocks.append).not.toHaveBeenCalled()
  })

  it('uses the exact chat review and schedules Analysis only for a newly committed request', async () => {
    const hash = `sha256:${'ab'.repeat(32)}`
    const analysisReview = { journeyId: 'journey-a', revisionId: 'revision-a', reviewHash: hash, stateHash: hash }
    const request = {
      projectId: order.projectId,
      conversationId: '00000000-0000-4000-8000-000000000001',
      idempotencyKey: order.idempotencyKey,
      content: 'Also check that I get an order number.',
      analysisReview,
    }
    const analysisWake = { journeyId: 'journey-a', targetProjectId: order.projectId, expectedStateHash: hash }
    mocks.append.mockResolvedValue({ conversation: { id: request.conversationId }, analysisWake })
    expect(await submitConversationMessage(request)).toMatchObject({ success: true })
    expect(mocks.append).toHaveBeenCalledWith(expect.objectContaining({ analysisReview, content: request.content }))
    expect(mocks.schedule).toHaveBeenCalledExactlyOnceWith(analysisWake)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/quality-journeys/journey-a')

    mocks.append.mockRejectedValueOnce(new ServiceError('The displayed review changed.', 'CONFLICT'))
    expect(
      await submitConversationMessage({ ...request, idempotencyKey: 'ab7ddabd-049d-4812-896f-48af38809234' }),
    ).toEqual({
      success: false,
      status: 409,
      error: 'The displayed review changed.',
    })

    mocks.replay.mockResolvedValue({ conversation: { id: request.conversationId } })
    expect(await submitConversationMessage(request)).toMatchObject({ success: true })
    expect(mocks.replay).toHaveBeenLastCalledWith(expect.objectContaining({ analysisReview }))
    expect(mocks.append).toHaveBeenCalledTimes(2)
    expect(mocks.schedule).toHaveBeenCalledTimes(1)
  })

  it('recovers a collaboration preparation from its saved turn without preparing twice', async () => {
    const conversationId = '00000000-0000-4000-8000-000000000001'
    const request = {
      projectId: order.projectId,
      conversationId,
      idempotencyKey: order.idempotencyKey,
      content: 'Prepare publication',
    }
    const stored = { conversation: { id: conversationId } }
    mocks.prepareCollaboration.mockResolvedValue({ id: 'operation-a', state: 'READY' })
    mocks.append.mockResolvedValue(stored)
    expect(await submitConversationMessage(request)).toEqual({ success: true, conversationId })
    expect(mocks.getConversation).toHaveBeenCalledWith(
      expect.objectContaining({ targetProjectId: order.projectId, conversationId }),
    )
    expect(mocks.prepareCollaboration).toHaveBeenCalledExactlyOnceWith({
      targetProjectId: order.projectId,
      intent: 'PUBLISH',
      idempotencyKey: `chat:${conversationId}:${order.idempotencyKey}`,
    })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({
        reply: expect.objectContaining({
          records: [{ kind: 'COLLABORATION', id: 'operation-a', title: 'Review collaboration operation' }],
        }),
      }),
    )
    mocks.replay.mockResolvedValue(stored)
    expect(await submitConversationMessage(request)).toEqual({ success: true, conversationId })
    expect(mocks.prepareCollaboration).toHaveBeenCalledTimes(1)
  })

  it('continues the exact collaboration decision once after the saved transaction', async () => {
    const conversationId = '00000000-0000-4000-8000-000000000001'
    const digest = `sha256:${'ab'.repeat(32)}`
    const request = {
      projectId: order.projectId,
      conversationId,
      idempotencyKey: order.idempotencyKey,
      content: 'Use all incoming',
    }
    const collaborationReview = {
      kind: 'RECORDS',
      targetProjectId: order.projectId,
      operationId: 'operation-a',
      intent: 'RECEIVE',
      expectedVersion: 2,
      preparedDigest: digest,
      reviewItems: [{ recordKey: 'TEST_CASE:checkout', disposition: 'CONFLICT' }],
    }
    expect(await submitConversationMessage(request)).toMatchObject({ success: false, status: 409 })
    expect(mocks.append).not.toHaveBeenCalled()
    const stored = {
      conversation: { id: conversationId },
      collaborationDecision: { operationId: 'operation-a', state: 'READY', afterCommit: 'CONTINUE_ACCEPTED' },
    }
    mocks.append.mockResolvedValue(stored)
    expect(await submitConversationMessage({ ...request, collaborationReview })).toMatchObject({ success: true })
    expect(mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({ collaborationReview, content: request.content }),
    )
    expect(mocks.continueCollaboration).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.continueCollaboration).toHaveBeenCalledExactlyOnceWith({ operationId: 'operation-a' })
    mocks.replay.mockResolvedValue(stored)
    expect(await submitConversationMessage({ ...request, collaborationReview })).toMatchObject({ success: true })
    expect(mocks.after).toHaveBeenCalledTimes(1)
  })
})
