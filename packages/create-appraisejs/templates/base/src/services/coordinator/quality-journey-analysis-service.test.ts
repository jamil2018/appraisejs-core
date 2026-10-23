import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('./quality-journey-coordinator-session', () => ({ assertCoordinatorMutationSession: vi.fn() }))

import { answerQualityJourneyAnalysisQuestion, getQualityJourneyAnalysis } from './quality-journey-analysis-service'

describe('getQualityJourneyAnalysis', () => {
  it('uses a stable ID tie-breaker when answer timestamps are equal', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const client = {
      qualityJourney: { findFirst: vi.fn().mockResolvedValue({ id: 'journey-1' }) },
      qualityJourneyAnalysisRevision: { findMany },
    } as unknown as PrismaClient

    await getQualityJourneyAnalysis({ journeyId: 'journey-1', targetProjectId: 'project-1' }, client)

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          questions: expect.objectContaining({
            include: expect.objectContaining({
              answers: expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
            }),
          }),
        }),
      }),
    )
  })
})

describe('managed Analysis human mutation fences', () => {
  const request = {
    idempotencyKey: 'answer',
    answer: {
      schemaVersion: 'appraise.quality-journey/v1',
      answerId: 'answer',
      journeyId: 'journey',
      targetProjectId: 'project',
      analysisRevisionId: 'old-cycle-leaf',
      questionId: 'q',
      answer: 'Human answer',
      actor: 'USER',
    },
  }
  it.each(['CANCELLED', 'CLOSED'])('rejects new answers after %s before persistence', async status => {
    const create = vi.fn()
    const tx = {
      qualityJourney: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'journey', hostingMode: 'APP_SERVER_LOCAL_V1', stage: 'ANALYSIS', status }),
      },
      qualityJourneyAnalysisAnswer: { findUnique: vi.fn().mockResolvedValue(null), create },
    }
    const client = {
      $transaction: async (callback: (tx: unknown) => unknown) => callback(tx),
    } as unknown as PrismaClient
    await expect(answerQualityJourneyAnalysisQuestion(request, client)).rejects.toThrow(/Inactive/)
    expect(create).not.toHaveBeenCalled()
  })
  it('rejects an older cycle leaf even when it has no successor', async () => {
    const create = vi.fn()
    const tx = {
      qualityJourney: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'journey',
          targetProjectId: 'project',
          hostingMode: 'APP_SERVER_LOCAL_V1',
          stage: 'ANALYSIS',
          status: 'ACTIVE',
          activeCycleId: 'current',
        }),
      },
      qualityJourneyAnalysisAnswer: { findUnique: vi.fn().mockResolvedValue(null), create },
      qualityJourneyAnalysisRevision: { findMany: vi.fn().mockResolvedValue([{ id: 'current-leaf' }]) },
    }
    const client = {
      $transaction: async (callback: (tx: unknown) => unknown) => callback(tx),
    } as unknown as PrismaClient
    await expect(answerQualityJourneyAnalysisQuestion(request, client)).rejects.toThrow(/active cycle/)
    expect(create).not.toHaveBeenCalled()
  })
})

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { compileAnalysisFollowupDescriptor } from './quality-journey-analysis-followup'
import {
  assertManagedAnalysisAssignmentEvidence,
  assertManagedAnalysisRoleContract,
  assertManagedAnalysisArtifactBindings,
  assertManagedAnalysisCurrentInputs,
  assertManagedAnalysisSuccessorInputs,
  assertExternalAnalysisGeneration,
  assertCurrentExternalAnalysisAuthorization,
  assertPublishableAnalysisLeaf,
  assertPublishableAnalysisWork,
  assertPublishableAnalysisAttempt,
} from './quality-journey-analysis-authority'
function authorityFixture() {
  const ref = (kind: string, artifactId: string, revisionId: string) => ({
    kind,
    artifactId,
    revisionId,
    contentHash: hashCanonical(artifactId),
  })
  const compiled = compileAnalysisFollowupDescriptor({
    schemaVersion: 'appraise.analysis-followup-descriptor/v1',
    journeyId: 'journey',
    targetProjectId: 'project',
    cycleId: 'cycle',
    workItemId: 'work',
    predecessor: {
      revisionId: 'A',
      artifact: ref('ANALYSIS_CHARTER_REVISION', 'charter', 'A'),
      attemptId: 'prior',
      authorizationId: 'prior-auth',
      inputHash: hashCanonical('prior'),
    },
    requirement: ref('JOURNEY_REVISION', 'requirement', 'requirement'),
    questions: [],
    feedback: null,
    cause: { eventId: 'human', sequence: 1 },
    advisoryInputRefs: [],
    advisoryDigest: hashCanonical([]),
    roleContractDigest: hashCanonical('role'),
  })
  const issued = {
    ...compiled,
    issuance: {
      schemaVersion: 'appraise.analysis-followup-issuance/v1' as const,
      descriptor: compiled.descriptor,
      inputHash: compiled.inputHash,
      causeHash: compiled.causeHash,
      workItemId: 'work',
      authorizationId: 'auth',
      issuedWorkItemVersion: 2,
    },
  }
  const manifest: Record<string, unknown> = {
    inputHash: issued.inputHash,
    stateHash: issued.inputHash,
    roleDefinition: { digest: issued.descriptor.roleContractDigest },
    inputArtifacts: issued.inputArtifacts,
    advisoryInputRefs: [],
  }
  const authorized: Record<string, unknown> = { inputArtifacts: issued.inputArtifacts, advisoryInputRefs: [] }
  return {
    issued,
    manifest,
    authorized,
    item: {
      inputHash: issued.inputHash,
      roleContractDigest: issued.descriptor.roleContractDigest,
      inputArtifactRefsJson: canonicalContractJson(issued.inputArtifacts),
    },
    attempt: { assignmentHash: hashCanonical(manifest) },
    authorization: {
      authorizationHash: hashCanonical(authorized),
      roleContractDigest: issued.descriptor.roleContractDigest,
    },
  }
}
describe('actual managed Analysis authority responsibilities (pure canonical bytes)', () => {
  it('accepts exact persisted evidence, role and artifact bindings, then current causal/predecessor inputs', () => {
    const f = authorityFixture()
    assertManagedAnalysisAssignmentEvidence(f.issued, f.attempt, f.authorization, f.manifest, f.authorized)
    assertManagedAnalysisRoleContract(f.issued, f.item, f.authorization, f.manifest)
    assertManagedAnalysisArtifactBindings(f.issued, f.item, f.manifest, f.authorized)
    assertManagedAnalysisCurrentInputs(f.issued, f.issued, f.item)
    assertManagedAnalysisSuccessorInputs(
      'A',
      'requirement',
      { unresolvedQuestionIdsJson: '[]', blockerIdsJson: '[]' },
      f.issued,
    )
  })
  it.each(['inputHash', 'stateHash'])('rejects changed manifest %s before role/artifact interpretation', field => {
    const f = authorityFixture()
    f.manifest[field] = hashCanonical('changed')
    expect(() =>
      assertManagedAnalysisAssignmentEvidence(f.issued, f.attempt, f.authorization, f.manifest, f.authorized),
    ).toThrow(/canonical input identity/)
  })
  it('rejects either changed persisted evidence hash', () => {
    const f = authorityFixture()
    f.attempt.assignmentHash = hashCanonical('bad')
    expect(() =>
      assertManagedAnalysisAssignmentEvidence(f.issued, f.attempt, f.authorization, f.manifest, f.authorized),
    ).toThrow()
    f.attempt.assignmentHash = hashCanonical(f.manifest)
    f.authorization.authorizationHash = hashCanonical('bad')
    expect(() =>
      assertManagedAnalysisAssignmentEvidence(f.issued, f.attempt, f.authorization, f.manifest, f.authorized),
    ).toThrow()
  })
  it('refuses a foreign role digest or missing role definition', () => {
    const f = authorityFixture()
    f.authorization.roleContractDigest = hashCanonical('foreign')
    expect(() => assertManagedAnalysisRoleContract(f.issued, f.item, f.authorization, f.manifest)).toThrow()
    f.authorization.roleContractDigest = f.issued.descriptor.roleContractDigest
    f.manifest.roleDefinition = undefined
    expect(() => assertManagedAnalysisRoleContract(f.issued, f.item, f.authorization, f.manifest)).toThrow()
  })
  it('refuses stale artifact projections and advisory inputs', () => {
    const f = authorityFixture()
    f.item.inputArtifactRefsJson = '[]'
    expect(() => assertManagedAnalysisArtifactBindings(f.issued, f.item, f.manifest, f.authorized)).toThrow()
    f.item.inputArtifactRefsJson = canonicalContractJson(f.issued.inputArtifacts)
    f.authorized.advisoryInputRefs = ['foreign']
    expect(() => assertManagedAnalysisArtifactBindings(f.issued, f.item, f.manifest, f.authorized)).toThrow()
  })
  it('refuses missing readiness, stale cause, wrong predecessor and unresolved blockers', () => {
    const f = authorityFixture()
    expect(() => assertManagedAnalysisCurrentInputs(null, f.issued, f.item)).toThrow()
    expect(() =>
      assertManagedAnalysisCurrentInputs({ ...f.issued, causeHash: hashCanonical('stale') }, f.issued, f.item),
    ).toThrow()
    expect(() =>
      assertManagedAnalysisSuccessorInputs(
        'older',
        'requirement',
        { unresolvedQuestionIdsJson: '[]', blockerIdsJson: '[]' },
        f.issued,
      ),
    ).toThrow()
    expect(() =>
      assertManagedAnalysisSuccessorInputs(
        'A',
        'requirement',
        { unresolvedQuestionIdsJson: '[]', blockerIdsJson: '["blocker"]' },
        f.issued,
      ),
    ).toThrow()
  })
  it('keeps external generation checks exact', () => {
    assertExternalAnalysisGeneration(
      'attempt',
      { assignmentId: 'assignment', assignmentGeneration: 2 },
      { id: 'attempt', assignmentId: 'assignment', assignmentGeneration: 2 },
    )
    expect(() =>
      assertExternalAnalysisGeneration(
        'attempt',
        { assignmentId: 'assignment', assignmentGeneration: 2 },
        { id: 'attempt', assignmentId: 'assignment', assignmentGeneration: 1 },
      ),
    ).toThrow(/generation is stale/)
  })
  it('requires current sole publication leaf, completed work and its exact completed ordinal', () => {
    const revision = { id: 'B', cycleId: 'cycle', inputHash: hashCanonical('B') },
      work = {
        id: 'work',
        cycleId: 'cycle',
        role: 'REQUIREMENT_ANALYZER' as const,
        status: 'COMPLETED' as const,
        inputHash: revision.inputHash,
        currentAttempt: 2,
      },
      attempt = { status: 'COMPLETED', workItemId: 'work', attempt: 2 }
    assertPublishableAnalysisLeaf('cycle', revision, [{ id: 'B' }])
    assertPublishableAnalysisWork('cycle', revision, work)
    assertPublishableAnalysisAttempt(work, attempt)
    expect(() => assertPublishableAnalysisLeaf('cycle', revision, [{ id: 'A' }])).toThrow(
      /current completed Analysis leaf/,
    )
    expect(() => assertPublishableAnalysisWork('cycle', revision, { ...work, status: 'ELIGIBLE' })).toThrow()
    expect(() => assertPublishableAnalysisAttempt(work, { ...attempt, attempt: 1 })).toThrow()
    expect(() => assertPublishableAnalysisAttempt(work, null)).toThrow()
  })
})

describe('current external Analysis authorization', () => {
  const authorization = {
    id: 'authorization',
    revokedAt: null,
    cancelledAt: null,
    externalAdmissionProtocol: 'protocol',
    externalPrincipalId: 'principal',
    externalPrincipalAssurance: 'assurance',
  }
  const principal = { principalId: 'principal', assurance: 'assurance' }
  it('accepts only the current authorization for the original admitted principal and protocol', () => {
    assertCurrentExternalAnalysisAuthorization(authorization, { id: 'authorization' }, principal, 'protocol')
    expect(() => assertCurrentExternalAnalysisAuthorization(null, null, principal, 'protocol')).toThrow(
      /authority is not current/,
    )
    for (const changed of [
      { revokedAt: new Date() },
      { cancelledAt: new Date() },
      { externalAdmissionProtocol: 'other' },
      { externalPrincipalId: 'other' },
      { externalPrincipalAssurance: 'other' },
    ])
      expect(() =>
        assertCurrentExternalAnalysisAuthorization(
          { ...authorization, ...changed },
          { id: 'authorization' },
          principal,
          'protocol',
        ),
      ).toThrow(/authority is not current/)
    expect(() => assertCurrentExternalAnalysisAuthorization(authorization, null, principal, 'protocol')).toThrow(
      /authority is not current/,
    )
    expect(() =>
      assertCurrentExternalAnalysisAuthorization(authorization, { id: 'superseded' }, principal, 'protocol'),
    ).toThrow(/authority is not current/)
  })
})
