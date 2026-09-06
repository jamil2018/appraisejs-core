import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'
import { hashQualityJourneyRequirement } from '@/lib/quality-journey'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import {
  archiveQualityJourneyDraft,
  confirmQualityJourneyDraft,
  copyQualityJourneyBriefToDraft,
  createQualityJourneyDraft,
  getQualityJourneyDraft,
  saveQualityJourneyDraft,
  restoreQualityJourneyDraft,
} from './quality-journey-draft-service'
import { createQualityJourney } from './quality-journey-service'

const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-quality-journey-draft-'))
  workspaces.push(workspace)
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  await client.targetProject.create({
    data: {
      id: 'draft-project',
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'Draft fixture',
      fingerprint: `sha256:${'a'.repeat(64)}`,
    },
  })
  await client.environment.create({
    data: {
      id: 'draft-environment',
      targetProjectId: 'draft-project',
      name: 'Staging',
      baseUrl: 'https://example.test',
    },
  })
  return client
}

describe('Quality Journey drafts', () => {
  it('uses scoped optimistic saves and confirms the exact saved brief only once', async () => {
    const client = await fixture()
    try {
      const created = await createQualityJourneyDraft(
        {
          targetProjectId: 'draft-project',
          idempotencyKey: 'first-meaningful-edit',
          requirement: { objective: 'Checkout' },
        },
        client,
      )
      const requirement = {
        objective: 'Checkout',
        coverageRigor: 'STANDARD' as const,
        testDimensions: ['FUNCTIONAL' as const],
        includedScope: ['Order submission'],
        environmentIds: ['draft-environment'],
        desiredEvidenceSignals: ['Order ID'],
      }
      const saved = await saveQualityJourneyDraft(
        {
          draftId: created.draft.id,
          targetProjectId: 'draft-project',
          expectedVersion: created.draft.version,
          requirement,
          currentStep: 3,
        },
        client,
      )
      await expect(
        saveQualityJourneyDraft(
          {
            draftId: created.draft.id,
            targetProjectId: 'draft-project',
            expectedVersion: created.draft.version,
            requirement,
            currentStep: 3,
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      const confirmed = await confirmQualityJourneyDraft(
        {
          draftId: saved.id,
          targetProjectId: 'draft-project',
          expectedVersion: saved.version,
          expectedDraftHash: saved.draftHash,
          requirementHash: hashQualityJourneyRequirement(requirement),
        },
        client,
      )
      const replay = await confirmQualityJourneyDraft(
        {
          draftId: saved.id,
          targetProjectId: 'draft-project',
          expectedVersion: saved.version,
          expectedDraftHash: saved.draftHash,
          requirementHash: hashQualityJourneyRequirement(requirement),
        },
        client,
      )
      expect(replay).toEqual({ replayed: true, journeyId: confirmed.journeyId })
      expect(
        await getQualityJourneyDraft({ draftId: saved.id, targetProjectId: 'draft-project' }, client),
      ).toMatchObject({
        status: 'CONFIRMED',
        confirmedJourneyId: confirmed.journeyId,
      })
      expect(await client.qualityJourney.count({ where: { targetProjectId: 'draft-project' } })).toBe(1)
    } finally {
      await client.$disconnect()
    }
  })

  it('rolls back Journey creation when the draft confirmation cannot commit after submission', async () => {
    const client = await fixture()
    try {
      const created = await createQualityJourneyDraft(
        {
          targetProjectId: 'draft-project',
          idempotencyKey: 'rollback-confirmation',
          requirement: { objective: 'Checkout' },
        },
        client,
      )
      const requirement = {
        objective: 'Checkout',
        coverageRigor: 'STANDARD' as const,
        testDimensions: ['FUNCTIONAL' as const],
        includedScope: ['Order submission'],
        environmentIds: ['draft-environment'],
        desiredEvidenceSignals: ['Order ID'],
      }
      const saved = await saveQualityJourneyDraft(
        {
          draftId: created.draft.id,
          targetProjectId: 'draft-project',
          expectedVersion: 1,
          requirement,
          currentStep: 3,
        },
        client,
      )
      await client.$executeRawUnsafe(`
        CREATE TRIGGER "QualityJourneyDraft_force_confirmation_rollback"
        BEFORE UPDATE OF "status" ON "QualityJourneyDraft"
        WHEN NEW."status" = 'CONFIRMED'
        BEGIN SELECT RAISE(ABORT, 'forced confirmation rollback after submission'); END;
      `)

      await expect(
        confirmQualityJourneyDraft(
          {
            draftId: saved.id,
            targetProjectId: 'draft-project',
            expectedVersion: saved.version,
            expectedDraftHash: saved.draftHash,
            requirementHash: hashQualityJourneyRequirement(requirement),
          },
          client,
        ),
      ).rejects.toThrow()
      expect(await client.qualityJourney.count({ where: { targetProjectId: 'draft-project' } })).toBe(0)
      expect(await client.qualityJourneyCommand.count()).toBe(0)
      expect(
        await getQualityJourneyDraft({ draftId: saved.id, targetProjectId: 'draft-project' }, client),
      ).toMatchObject({
        status: 'ACTIVE',
        version: saved.version,
        draftHash: saved.draftHash,
      })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('permits exactly one confirmation when two clients submit the same saved draft', async () => {
    const firstClient = await fixture()
    const target = await firstClient.targetProject.findUniqueOrThrow({ where: { id: 'draft-project' } })
    const secondClient = new PrismaClient({
      datasources: { db: { url: `file:${path.join(target.canonicalPath!, 'appraise.db')}` } },
    })
    try {
      const created = await createQualityJourneyDraft(
        {
          targetProjectId: 'draft-project',
          idempotencyKey: 'confirmation-race',
          requirement: { objective: 'Checkout' },
        },
        firstClient,
      )
      const requirement = {
        objective: 'Checkout',
        coverageRigor: 'STANDARD' as const,
        testDimensions: ['FUNCTIONAL' as const],
        includedScope: ['Order submission'],
        environmentIds: ['draft-environment'],
        desiredEvidenceSignals: ['Order ID'],
      }
      const saved = await saveQualityJourneyDraft(
        {
          draftId: created.draft.id,
          targetProjectId: 'draft-project',
          expectedVersion: 1,
          requirement,
          currentStep: 3,
        },
        firstClient,
      )
      const input = {
        draftId: saved.id,
        targetProjectId: 'draft-project',
        expectedVersion: saved.version,
        expectedDraftHash: saved.draftHash,
        requirementHash: hashQualityJourneyRequirement(requirement),
      }
      const outcomes = await Promise.allSettled([
        confirmQualityJourneyDraft(input, firstClient),
        confirmQualityJourneyDraft(input, secondClient),
      ])

      expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(2)
      expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(0)
      expect(outcomes.map(outcome => (outcome.status === 'fulfilled' ? outcome.value.replayed : null)).sort()).toEqual([
        false,
        true,
      ])
      expect(await firstClient.qualityJourney.count({ where: { targetProjectId: 'draft-project' } })).toBe(1)
      expect(await firstClient.qualityJourneyDraft.count({ where: { status: 'CONFIRMED' } })).toBe(1)
    } finally {
      await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()])
    }
  }, 60_000)

  it('rejects the later concurrent save and keeps the winning save in order', async () => {
    const firstClient = await fixture()
    const target = await firstClient.targetProject.findUniqueOrThrow({ where: { id: 'draft-project' } })
    const secondClient = new PrismaClient({
      datasources: { db: { url: `file:${path.join(target.canonicalPath!, 'appraise.db')}` } },
    })
    try {
      const created = await createQualityJourneyDraft(
        { targetProjectId: 'draft-project', idempotencyKey: 'save-race', requirement: { objective: 'Original' } },
        firstClient,
      )
      const outcomes = await Promise.allSettled([
        saveQualityJourneyDraft(
          {
            draftId: created.draft.id,
            targetProjectId: 'draft-project',
            expectedVersion: 1,
            requirement: { objective: 'First save' },
            currentStep: 0,
          },
          firstClient,
        ),
        saveQualityJourneyDraft(
          {
            draftId: created.draft.id,
            targetProjectId: 'draft-project',
            expectedVersion: 1,
            requirement: { objective: 'Second save' },
            currentStep: 0,
          },
          secondClient,
        ),
      ])
      const saved = outcomes.find(
        (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof saveQualityJourneyDraft>>> =>
          outcome.status === 'fulfilled',
      )

      expect(saved).toBeDefined()
      expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1)
      expect(saved!.value).toMatchObject({ version: 2 })
      expect(
        await getQualityJourneyDraft({ draftId: created.draft.id, targetProjectId: 'draft-project' }, firstClient),
      ).toMatchObject({ version: 2, requirement: { objective: saved!.value.requirement.objective } })
    } finally {
      await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()])
    }
  }, 60_000)

  it('copies an immutable brief without creating follow-up lineage', async () => {
    const client = await fixture()
    try {
      const journey = await createQualityJourney(
        {
          targetProjectId: 'draft-project',
          idempotencyKey: 'source-journey',
          requirement: { objective: 'Copy this brief', includedScope: ['Checkout'] },
        },
        client,
      )
      const copied = await copyQualityJourneyBriefToDraft(
        { targetProjectId: 'draft-project', journeyId: journey.journey.journeyId, idempotencyKey: 'copy-one' },
        client,
      )
      expect(copied.draft).toMatchObject({
        requirement: { objective: 'Copy this brief', includedScope: ['Checkout'] },
        predecessorJourneyId: undefined,
      })
    } finally {
      await client.$disconnect()
    }
  })

  it('replays concurrent creation, prevents cross-project writes, and preserves archive/restore hashes', async () => {
    const client = await fixture()
    try {
      const input = {
        targetProjectId: 'draft-project',
        idempotencyKey: 'racing-create',
        requirement: { objective: 'Race' },
      }
      const [first, second] = await Promise.all([
        createQualityJourneyDraft(input, client),
        createQualityJourneyDraft(input, client),
      ])
      expect([first.replayed, second.replayed].filter(Boolean)).toHaveLength(1)
      const archived = await archiveQualityJourneyDraft(
        { draftId: first.draft.id, targetProjectId: 'draft-project', expectedVersion: first.draft.version },
        client,
      )
      const restored = await restoreQualityJourneyDraft(
        { draftId: archived.id, targetProjectId: 'draft-project', expectedVersion: archived.version },
        client,
      )
      expect(restored).toMatchObject({ status: 'ACTIVE', version: archived.version + 1 })
      expect(restored.draftHash).not.toBe(archived.draftHash)
      await expect(
        saveQualityJourneyDraft(
          {
            draftId: restored.id,
            targetProjectId: 'other-project',
            expectedVersion: restored.version,
            requirement: { objective: 'Nope' },
            currentStep: 0,
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    } finally {
      await client.$disconnect()
    }
  })
})
