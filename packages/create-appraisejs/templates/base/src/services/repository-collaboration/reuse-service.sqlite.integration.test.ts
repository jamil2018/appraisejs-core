import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { collaborationHash } from '@/lib/repository-collaboration'
import { hashQualityJourneyRequirement } from '@/lib/quality-journey'
import { confirmQualityJourneyDraft } from '@/services/coordinator/quality-journey-draft-service'
import { claimQualityJourneyWork } from '@/services/coordinator/quality-journey-service'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import {
  createQualityJourneyDraftFromReuseBrief,
  listQualityJourneyReuseAssets,
  readQualityJourneyAdvisoryReuseSeeds,
  selectQualityJourneyReuseSeeds,
} from './reuse-service'

const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

const requirement = {
  objective: 'Protect customer checkout',
  coverageRigor: 'STANDARD' as const,
  testDimensions: ['FUNCTIONAL' as const],
  includedScope: ['Order submission'],
  environmentIds: ['reuse-environment'],
  desiredEvidenceSignals: ['Order ID'],
}

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-reuse-service-'))
  workspaces.push(workspace)
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  await client.targetProject.create({
    data: {
      id: 'reuse-project',
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'Reuse fixture',
      fingerprint: `sha256:${'f'.repeat(64)}`,
    },
  })
  await client.environment.create({
    data: {
      id: 'reuse-environment',
      targetProjectId: 'reuse-project',
      name: 'Staging',
      baseUrl: 'https://example.test',
    },
  })
  await client.collaborationBinding.create({
    data: {
      id: 'reuse-binding',
      targetProjectId: 'reuse-project',
      portableProjectId: 'project_reuse',
      repositoryRoot: workspace,
      trackedBranch: 'appraise-0.5',
    },
  })
  return client
}

async function addAsset(
  client: PrismaClient,
  input: { portableId: string; sourceVersion: number; kind: 'brief' | 'analysis' | 'scenario'; content: object },
) {
  const payload = { assetKind: input.kind, title: `${input.kind} ${input.sourceVersion}`, content: input.content }
  return client.collaborationReuseAsset.create({
    data: {
      bindingId: 'reuse-binding',
      portableId: input.portableId,
      sourceVersion: input.sourceVersion,
      kind: input.kind,
      payloadJson: JSON.stringify(payload),
      payloadHash: collaborationHash(payload),
      sourceRevision: `commit-${input.sourceVersion}`,
    },
  })
}

describe('Journey reuse service', () => {
  it('creates a fresh, unlinked draft pinned to the exact immutable source asset', async () => {
    const client = await fixture()
    try {
      await addAsset(client, { portableId: 'brief_checkout', sourceVersion: 1, kind: 'brief', content: requirement })
      const first = await createQualityJourneyDraftFromReuseBrief(
        {
          bindingId: 'reuse-binding',
          targetProjectId: 'reuse-project',
          assetPortableId: 'brief_checkout',
          sourceVersion: 1,
          idempotencyKey: 'copy-checkout-v1',
        },
        client,
      )
      expect(first).toMatchObject({
        replayed: false,
        draft: { requirement, predecessorJourneyId: undefined, status: 'ACTIVE' },
        reuseAnnotation: {
          bindingId: 'reuse-binding',
          assetPortableId: 'brief_checkout',
          sourceVersion: 1,
          payloadHash: collaborationHash({ assetKind: 'brief', title: 'brief 1', content: requirement }),
          sourceRevision: 'commit-1',
        },
      })
      const replay = await createQualityJourneyDraftFromReuseBrief(
        {
          bindingId: 'reuse-binding',
          targetProjectId: 'reuse-project',
          assetPortableId: 'brief_checkout',
          sourceVersion: 1,
          idempotencyKey: 'copy-checkout-v1',
        },
        client,
      )
      expect(replay).toMatchObject({
        replayed: true,
        draft: { id: first.draft.id },
        reuseAnnotation: first.reuseAnnotation,
      })

      const newerRequirement = { ...requirement, objective: 'Protect refunded checkout' }
      await addAsset(client, {
        portableId: 'brief_checkout',
        sourceVersion: 2,
        kind: 'brief',
        content: newerRequirement,
      })
      const second = await createQualityJourneyDraftFromReuseBrief(
        {
          bindingId: 'reuse-binding',
          targetProjectId: 'reuse-project',
          assetPortableId: 'brief_checkout',
          sourceVersion: 2,
          idempotencyKey: 'copy-checkout-v2',
        },
        client,
      )
      const pinned = await client.qualityJourneyDraftReuseAnnotation.findUniqueOrThrow({
        where: { draftId: first.draft.id },
      })
      expect(pinned).toMatchObject({ sourceVersion: 1, sourceRevision: 'commit-1' })
      expect(second.draft).toMatchObject({ requirement: newerRequirement, predecessorJourneyId: undefined })
      expect(await client.qualityJourney.count()).toBe(0)
    } finally {
      await client.$disconnect()
    }
  })

  it('keeps reuse content outside authority tables and enters the ordinary local approval path', async () => {
    const client = await fixture()
    try {
      await addAsset(client, { portableId: 'brief_checkout', sourceVersion: 1, kind: 'brief', content: requirement })
      await addAsset(client, {
        portableId: 'analysis_untrusted',
        sourceVersion: 1,
        kind: 'analysis',
        content: { approval: 'APPROVED', evidence: 'foreign proof', executionConsent: true },
      })
      await addAsset(client, {
        portableId: 'scenario_untrusted',
        sourceVersion: 1,
        kind: 'scenario',
        content: { approval: 'APPROVED', executionLease: 'foreign lease' },
      })
      expect(
        await listQualityJourneyReuseAssets({ bindingId: 'reuse-binding', targetProjectId: 'reuse-project' }, client),
      ).toEqual([
        expect.objectContaining({ portableId: 'analysis_untrusted', kind: 'analysis' }),
        expect.objectContaining({ portableId: 'brief_checkout', kind: 'brief' }),
        expect.objectContaining({ portableId: 'scenario_untrusted', kind: 'scenario' }),
      ])
      await expect(
        createQualityJourneyDraftFromReuseBrief(
          {
            bindingId: 'reuse-binding',
            targetProjectId: 'reuse-project',
            assetPortableId: 'analysis_untrusted',
            sourceVersion: 1,
            idempotencyKey: 'no-analysis-authority',
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION' })

      const copied = await createQualityJourneyDraftFromReuseBrief(
        {
          bindingId: 'reuse-binding',
          targetProjectId: 'reuse-project',
          assetPortableId: 'brief_checkout',
          sourceVersion: 1,
          idempotencyKey: 'normal-local-gates',
        },
        client,
      )
      const confirmed = await confirmQualityJourneyDraft(
        {
          draftId: copied.draft.id,
          targetProjectId: 'reuse-project',
          expectedVersion: copied.draft.version,
          expectedDraftHash: copied.draft.draftHash,
          requirementHash: hashQualityJourneyRequirement(requirement),
        },
        client,
      )
      expect(confirmed.replayed).toBe(false)
      expect(await client.qualityJourneyAnalysisRevision.count()).toBe(0)
      expect(await client.qualityJourneyScenarioPortfolioRevision.count()).toBe(0)
      expect(await client.qualityJourneyWorkAttempt.count()).toBe(0)
      expect(await client.qualityJourneyExecutionConsent.count()).toBe(0)
      expect(
        await client.qualityJourneyWorkItem.findMany({
          where: { journeyId: confirmed.journeyId },
          select: { role: true },
        }),
      ).toEqual([{ role: 'REQUIREMENT_ANALYZER' }])
      expect(await client.qualityJourneyWorkAuthorization.count({ where: { journeyId: confirmed.journeyId } })).toBe(1)
    } finally {
      await client.$disconnect()
    }
  })

  it('binds selected normalized seeds to the draft and admits them only through exact local leases', async () => {
    const client = await fixture()
    try {
      await addAsset(client, { portableId: 'brief_checkout', sourceVersion: 1, kind: 'brief', content: requirement })
      const analysisContent = { foreignApproval: 'approved', observation: 'Informational only' }
      const scenarioContent = { foreignScenario: 'checkout succeeds', evidence: 'Informational only' }
      await addAsset(client, {
        portableId: 'analysis_checkout',
        sourceVersion: 1,
        kind: 'analysis',
        content: analysisContent,
      })
      await addAsset(client, {
        portableId: 'scenario_checkout',
        sourceVersion: 1,
        kind: 'scenario',
        content: scenarioContent,
      })
      const copied = await createQualityJourneyDraftFromReuseBrief(
        {
          bindingId: 'reuse-binding',
          targetProjectId: 'reuse-project',
          assetPortableId: 'brief_checkout',
          sourceVersion: 1,
          idempotencyKey: 'seeded-copy',
        },
        client,
      )
      const seeded = await selectQualityJourneyReuseSeeds(
        {
          bindingId: 'reuse-binding',
          targetProjectId: 'reuse-project',
          draftId: copied.draft.id,
          expectedVersion: copied.draft.version,
          expectedDraftHash: copied.draft.draftHash,
          assets: [
            { kind: 'SCENARIO', assetPortableId: 'scenario_checkout', sourceVersion: 1 },
            { kind: 'ANALYSIS', assetPortableId: 'analysis_checkout', sourceVersion: 1 },
          ],
        },
        client,
      )
      expect(seeded).toMatchObject({ version: copied.draft.version + 1 })
      expect(seeded.draftHash).not.toBe(copied.draft.draftHash)
      expect(seeded.advisoryInputRefs.map(ref => ref.kind)).toEqual(['ANALYSIS', 'SCENARIO'])
      await expect(
        confirmQualityJourneyDraft(
          {
            draftId: copied.draft.id,
            targetProjectId: 'reuse-project',
            expectedVersion: copied.draft.version,
            expectedDraftHash: copied.draft.draftHash,
            requirementHash: hashQualityJourneyRequirement(requirement),
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      const confirmed = await confirmQualityJourneyDraft(
        {
          draftId: copied.draft.id,
          targetProjectId: 'reuse-project',
          expectedVersion: seeded.version,
          expectedDraftHash: seeded.draftHash,
          requirementHash: hashQualityJourneyRequirement(requirement),
        },
        client,
      )
      const analyzerClaim = await claimQualityJourneyWork(
        { journeyId: confirmed.journeyId, targetProjectId: 'reuse-project', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      expect(analyzerClaim.assignment.advisoryInputRefs).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'ANALYSIS', assetPortableId: 'analysis_checkout' })]),
      )
      const analyzerSeeds = await readQualityJourneyAdvisoryReuseSeeds(
        {
          journeyId: confirmed.journeyId,
          targetProjectId: 'reuse-project',
          workItemId: analyzerClaim.workItem.id,
          role: 'REQUIREMENT_ANALYZER',
          leaseId: analyzerClaim.attempt.leaseId,
          ownerToken: analyzerClaim.ownerToken,
          assignmentId: analyzerClaim.assignment.assignmentId,
          assignmentHash: analyzerClaim.attempt.assignmentHash,
          inputHash: analyzerClaim.assignment.inputHash,
        },
        client,
      )
      expect(analyzerSeeds).toEqual([expect.objectContaining({ kind: 'ANALYSIS', content: analysisContent })])
      await expect(
        readQualityJourneyAdvisoryReuseSeeds(
          {
            journeyId: confirmed.journeyId,
            targetProjectId: 'reuse-project',
            workItemId: analyzerClaim.workItem.id,
            role: 'REQUIREMENT_ANALYZER',
            leaseId: analyzerClaim.attempt.leaseId,
            ownerToken: 'wrong-owner',
            assignmentId: analyzerClaim.assignment.assignmentId,
            assignmentHash: analyzerClaim.attempt.assignmentHash,
            inputHash: analyzerClaim.assignment.inputHash,
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

      await client.qualityJourney.update({
        where: { id: confirmed.journeyId },
        data: { stage: 'SCENARIO_DESIGN', stateHash: `sha256:${'b'.repeat(64)}` },
      })
      const scenarioClaim = await claimQualityJourneyWork(
        { journeyId: confirmed.journeyId, targetProjectId: 'reuse-project', role: 'TEST_SCENARIO_DESIGNER' },
        client,
      )
      expect(scenarioClaim.assignment.advisoryInputRefs).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'SCENARIO', assetPortableId: 'scenario_checkout' })]),
      )
      expect(
        await readQualityJourneyAdvisoryReuseSeeds(
          {
            journeyId: confirmed.journeyId,
            targetProjectId: 'reuse-project',
            workItemId: scenarioClaim.workItem.id,
            role: 'TEST_SCENARIO_DESIGNER',
            leaseId: scenarioClaim.attempt.leaseId,
            ownerToken: scenarioClaim.ownerToken,
            assignmentId: scenarioClaim.assignment.assignmentId,
            assignmentHash: scenarioClaim.attempt.assignmentHash,
            inputHash: scenarioClaim.assignment.inputHash,
          },
          client,
        ),
      ).toEqual([expect.objectContaining({ kind: 'SCENARIO', content: scenarioContent })])
      expect(await client.qualityJourneyAnalysisRevision.count()).toBe(0)
      expect(await client.qualityJourneyScenarioPortfolioRevision.count()).toBe(0)
      expect(await client.qualityJourneyExecutionConsent.count()).toBe(0)
    } finally {
      await client.$disconnect()
    }
  })
})
