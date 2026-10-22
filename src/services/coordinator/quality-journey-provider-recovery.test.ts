import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { createWorkerSpawnRequest } from '@/lib/quality-journey/agent-factory'
import {
  qualityJourneyCapabilityProfiles,
  qualityJourneyRoleDefinitions,
  qualityJourneyContractDigest,
} from '@/lib/quality-journey/role-definitions'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { assertHistoricalHubQuiescent } from './quality-journey-provider-recovery'

function historical() {
  const role = qualityJourneyRoleDefinitions.find(d => d.role === 'SCOUT')!
  const profile = qualityJourneyCapabilityProfiles.fastObservation
  const request = createWorkerSpawnRequest({
    requestId: 'request',
    attemptId: 'attempt',
    manifest: {
      schemaVersion: 'appraise.quality-journey/v1',
      assignmentId: 'assignment',
      journeyId: 'journey',
      targetProjectId: 'project',
      workItemId: 'work',
      roleDefinition: { role: 'SCOUT', version: '3', digest: qualityJourneyContractDigest(role) },
      capabilityProfile: { profileId: profile.profileId, version: '3', digest: qualityJourneyContractDigest(profile) },
      inputArtifacts: [],
      allowedTargetRoutes: ['/checkout'],
      allowedResourceIds: [],
      writableArtifactKinds: ['TARGET_OBSERVATION_BUNDLE', 'EVIDENCE_RECEIPT'],
      scope: {
        permittedTools: ['target.observe', 'evidence.publish'],
        permittedCommands: ['work.output.submit'],
        filesystemPaths: [],
        networkOrigins: ['https://example.test'],
        credentialGrantIds: [],
        targetAccess: 'READ_ONLY',
      },
      stateHash: hashCanonical('state'),
      inputHash: hashCanonical('input'),
      lease: { leaseId: 'lease', expiresAt: '2026-08-28T16:00:00.000Z', heartbeatSeconds: 30 },
      idempotencyKey: 'assignment',
      completionCriteria: ['Publish observations.'],
    },
  })
  const receipt = {
    schemaVersion: 'appraise.quality-journey/v1',
    outcome: 'REFUSED',
    refusalCode: 'REQUIRED_BOUNDARY_UNSUPPORTED',
    spawnReceiptId: 'refused',
    assignmentId: request.assignmentId,
    workItemId: request.workItemId,
    attemptId: request.attemptId,
    roleDefinitionDigest: request.roleDefinitionDigest,
    capabilityProfileDigest: request.capabilityProfileDigest,
    boundaries: request.requiredBoundaries.map(boundary => ({
      boundary: boundary.boundary,
      requested: boundary.allowedValues,
      status: boundary.boundary === 'TARGET' ? 'UNSUPPORTED' : 'ENFORCED',
      evidence: boundary.boundary === 'TARGET' ? [hashCanonical('evidence')] : [],
    })),
    refusedAt: '2026-08-28T15:00:00.000Z',
  }
  return {
    id: 'attempt',
    workItemId: 'work',
    assignmentId: 'assignment',
    status: 'REFUSED',
    spawnRequestJson: JSON.stringify(request),
    spawnRequestHash: hashCanonical(request),
    spawnReceiptJson: JSON.stringify(receipt),
    spawnReceiptHash: hashCanonical(receipt),
  }
}
function tx(records: ReturnType<typeof historical>[], conflict = false) {
  return {
    qualityJourneyProviderRun: { findFirst: vi.fn().mockResolvedValue(conflict ? { id: 'conflicting-run' } : null) },
    qualityJourneyWorkAttempt: { findMany: vi.fn().mockResolvedValue(records) },
  } as unknown as Prisma.TransactionClient
}
describe('unchanged historical M04 hub guard reused before internal claims', () => {
  it('allows an actually contract-valid REFUSED historical dispatch', async () => {
    await expect(assertHistoricalHubQuiescent(tx([historical()]))).resolves.toBeUndefined()
  })
  it.each(['status', 'hash', 'ids', 'malformed', 'missing'] as const)(
    'refuses %s evidence without treating it as nonstart',
    async kind => {
      const record = historical()
      if (kind === 'status') record.status = 'COMPLETED'
      if (kind === 'hash') record.spawnReceiptHash = hashCanonical('wrong')
      if (kind === 'ids') record.assignmentId = 'another-assignment'
      if (kind === 'malformed') record.spawnRequestJson = '{'
      if (kind === 'missing') record.spawnReceiptJson = ''
      await expect(assertHistoricalHubQuiescent(tx([record]))).rejects.toThrow(/Historical provider dispatch/)
    },
  )
  it('refuses a global conflicting run even without historical rows', async () => {
    await expect(assertHistoricalHubQuiescent(tx([], true))).rejects.toThrow(/Conflicting provider evidence/)
  })
})
