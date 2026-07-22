import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  readDraft: vi.fn(),
  updateDraft: vi.fn(),
  deleteDraft: vi.fn(),
  validateDraft: vi.fn(),
  previewDraft: vi.fn(),
  submitForReview: vi.fn(),
  publishDraft: vi.fn(),
  deprecate: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
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
  deleteStepDefinitionDraftAction,
  publishStepDefinitionDraftAction,
  readStepDefinitionDraftAction,
  reviewStepDefinitionDraftAction,
  reviseStepDefinitionDraftAction,
} from './step-definition-actions'
import { StepDefinitionRegistryError } from '@/services/step-definition/step-definition-registry-service'

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
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/template-steps')
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

  it('maps stale registry revisions to a conflict envelope', async () => {
    mocks.submitForReview.mockRejectedValue(
      new StepDefinitionRegistryError('stale_revision', 'The draft changed before review.'),
    )

    await expect(
      reviewStepDefinitionDraftAction({ draftId, expectedRevision: 1, reviewAuthority: 'reviewer@example.test' }),
    ).resolves.toMatchObject({ status: 409, success: false, error: 'The draft changed before review.' })
  })

  it('binds publication to the exact draft revision and conformance run', async () => {
    mocks.publishDraft.mockResolvedValue({ receiptHash: 'sha256:receipt' })

    await publishStepDefinitionDraftAction({ draftId, expectedRevision: 4, conformanceRunId: 'conformance-4' })

    expect(mocks.publishDraft).toHaveBeenCalledWith({
      draftId,
      expectedRevision: 4,
      conformanceRunId: 'conformance-4',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/template-steps')
  })
})
