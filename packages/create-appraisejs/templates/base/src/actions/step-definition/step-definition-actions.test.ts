import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  createVersionDraft: vi.fn(),
  readDraft: vi.fn(),
  listHumanDrafts: vi.fn(),
  updateDraft: vi.fn(),
  deleteDraft: vi.fn(),
  validateDraft: vi.fn(),
  previewDraft: vi.fn(),
  issueHumanReviewReceipt: vi.fn(),
  publishDraft: vi.fn(),
  deprecateFromHumanUi: vi.fn(),
  readCoordinatorSearch: vi.fn(),
  recordSelectionRejected: vi.fn(),
  recordSelectionSelected: vi.fn(),
  listAllReady: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/services/coordinator/coordinator-step-definition-service', () => ({
  coordinatorStepDefinitionService: {
    read: mocks.readCoordinatorSearch,
    recordSelectionRejected: mocks.recordSelectionRejected,
    recordSelectionSelected: mocks.recordSelectionSelected,
  },
}))
vi.mock('@/services/step-definition/step-definition-registry-service', async importOriginal => {
  const original = await importOriginal<typeof import('@/services/step-definition/step-definition-registry-service')>()
  return {
    ...original,
    StepDefinitionRegistryService: vi.fn(function Registry() {
      return mocks
    }),
  }
})

import {
  createStepDefinitionDraftAction,
  createStepDefinitionVersionDraftAction,
  deprecateStepDefinitionAction,
  deleteStepDefinitionDraftAction,
  listStepDefinitionDraftsAction,
  publishStepDefinitionDraftAction,
  readStepDefinitionDraftAction,
  rejectReadyStepDefinitionSelectionAction,
  selectReadyStepDefinitionAction,
  reviewStepDefinitionDraftAction,
  reviseStepDefinitionDraftAction,
  searchReadyStepDefinitionContractsAction,
  listReadyStepDefinitionOptionsAction,
} from './step-definition-actions'
import { StepDefinitionRegistryError } from '@/services/step-definition/step-definition-registry-service'
import { builtInStepDefinitions } from '../../../packages/cucumber-runtime/src/step-definitions/index'

const draftId = '00000000-0000-4000-8000-000000000001'

beforeEach(() => vi.clearAllMocks())

describe('Step Definition Server Actions', () => {
  it('creates a draft through the registry and invalidates the authoring route', async () => {
    mocks.createDraft.mockResolvedValue({ id: draftId, revision: 1 })

    await expect(createStepDefinitionDraftAction({ identity: { id: 'custom.open' } })).resolves.toMatchObject({
      status: 200,
      success: true,
      data: { id: draftId, revision: 1 },
    })
    expect(mocks.createDraft).toHaveBeenCalledWith({ identity: { id: 'custom.open' } })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/step-definitions')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/step-definitions/create')
  })

  it('uses the coordinator ready-definition search through the server action boundary', async () => {
    mocks.readCoordinatorSearch.mockResolvedValue({ body: { matches: [{ step: { id: 'browser.search' } }] } })

    await expect(searchReadyStepDefinitionContractsAction(' search ')).resolves.toMatchObject({
      status: 200,
      success: true,
      data: { matches: [{ step: { id: 'browser.search' } }] },
    })
    expect(mocks.readCoordinatorSearch).toHaveBeenCalledWith(
      ['step-definitions', 'search'],
      new URLSearchParams({ query: 'search', limit: '10', surface: 'human' }),
    )
  })

  it('returns every ready definition to both Test Case and Template Test Case consumers, beyond 100 rows', async () => {
    const rows = builtInStepDefinitions.map(definition => ({
      id: definition.identity.id,
      version: definition.identity.version,
      definitionJson: JSON.stringify(definition),
    }))
    expect(rows.length).toBeGreaterThan(100)
    mocks.listAllReady.mockResolvedValue(rows)

    const result = await listReadyStepDefinitionOptionsAction()

    expect(mocks.listAllReady).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ status: 200, success: true })
    expect((result.data as unknown[]).length).toBe(rows.length)
  })

  it('records a bounded human selection rejection through the coordinator boundary', async () => {
    mocks.recordSelectionRejected.mockResolvedValue({ recorded: true })

    await expect(
      rejectReadyStepDefinitionSelectionAction({
        step: { id: 'browser.search', version: '1' },
        reason: 'overlap',
      }),
    ).resolves.toMatchObject({ status: 200, success: true, data: { recorded: true } })
    expect(mocks.recordSelectionRejected).toHaveBeenCalledWith({
      surface: 'human',
      step: { id: 'browser.search', version: '1' },
      reason: 'overlap',
    })
  })

  it('records a bounded deliberate human selection through the coordinator boundary', async () => {
    mocks.recordSelectionSelected.mockResolvedValue({ recorded: true })

    await expect(
      selectReadyStepDefinitionAction({
        step: { id: 'browser.search', version: '1' },
        planId: 'human-plan',
        correlationId: 'plan:human-plan',
      }),
    ).resolves.toMatchObject({ status: 200, success: true, data: { recorded: true } })
    expect(mocks.recordSelectionSelected).toHaveBeenCalledWith({
      surface: 'human',
      step: { id: 'browser.search', version: '1' },
      planId: 'human-plan',
      correlationId: 'plan:human-plan',
    })
  })

  it('rejects malformed adapter inputs before calling the registry', async () => {
    await expect(readStepDefinitionDraftAction('not-a-draft-id')).resolves.toMatchObject({
      status: 400,
      success: false,
      error: 'Invalid Step Definition request.',
    })
    expect(mocks.readDraft).not.toHaveBeenCalled()
  })

  it('passes optimistic revisions to revise and delete operations', async () => {
    mocks.updateDraft.mockResolvedValue({ id: draftId, revision: 3 })
    mocks.deleteDraft.mockResolvedValue(undefined)

    await reviseStepDefinitionDraftAction({ draftId, expectedRevision: 2, definition: { schemaVersion: '1' } })
    await deleteStepDefinitionDraftAction({ draftId, expectedRevision: 3 })

    expect(mocks.updateDraft).toHaveBeenCalledWith(draftId, 2, { schemaVersion: '1' })
    expect(mocks.deleteDraft).toHaveBeenCalledWith(draftId, 3)
  })

  it('lists resumable human drafts through the action boundary', async () => {
    const draft = {
      id: draftId,
      proposedStepId: 'custom.open',
      proposedVersion: '2',
      revision: 3,
      title: 'Open a page',
      updatedAt: '2026-07-26T00:00:00.000Z',
    }
    mocks.listHumanDrafts.mockResolvedValue([draft])

    await expect(listStepDefinitionDraftsAction()).resolves.toMatchObject({
      status: 200,
      success: true,
      data: [draft],
    })
  })

  it('creates immutable successor drafts and deprecates ready versions with human authority', async () => {
    mocks.createVersionDraft.mockResolvedValue({ id: draftId, revision: 1 })
    mocks.deprecateFromHumanUi.mockResolvedValue({ receiptHash: 'sha256:receipt' })

    await createStepDefinitionVersionDraftAction({
      stepId: 'custom.open',
      version: '1',
      newVersion: '2',
    })
    await deprecateStepDefinitionAction({
      stepId: 'custom.open',
      version: '1',
      reason: 'Use version 2.',
    })

    expect(mocks.createVersionDraft).toHaveBeenCalledWith({
      stepId: 'custom.open',
      version: '1',
      newVersion: '2',
      createdBy: 'local-user',
    })
    expect(mocks.deprecateFromHumanUi).toHaveBeenCalledWith({
      stepId: 'custom.open',
      version: '1',
      reason: 'Use version 2.',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/step-definitions')
  })

  it('maps stale registry revisions to a conflict envelope', async () => {
    mocks.issueHumanReviewReceipt.mockRejectedValue(
      new StepDefinitionRegistryError('stale_revision', 'The draft changed before review.'),
    )

    await expect(reviewStepDefinitionDraftAction({ draftId, expectedRevision: 1 })).resolves.toMatchObject({
      status: 409,
      success: false,
      error: 'The draft changed before review.',
    })
  })

  it('binds publication to the exact draft revision while deriving conformance evidence server-side', async () => {
    mocks.publishDraft.mockResolvedValue({ receiptHash: 'sha256:receipt' })

    await publishStepDefinitionDraftAction({ draftId, expectedRevision: 4 })

    expect(mocks.publishDraft).toHaveBeenCalledWith({
      draftId,
      expectedRevision: 4,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/step-definitions/create')
  })
})
