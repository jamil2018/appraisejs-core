import { describe, expect, it } from 'vitest'

import {
  createReplacementAssignment,
  createWorkerSpawnRequest,
  qualityJourneyCapabilityProfiles,
  qualityJourneyContractDigest,
  qualityJourneyRoleDefinitions,
  validateWorkerResult,
  validateWorkerSpawnReceipt,
  type AssignmentManifest,
} from './index'

const digest = (character: string) => `sha256:${character.repeat(64)}`
const scout = qualityJourneyRoleDefinitions.find(definition => definition.role === 'SCOUT')!
const profile = qualityJourneyCapabilityProfiles.fastObservation

function manifest(): AssignmentManifest {
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    assignmentId: 'assignment-1',
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    workItemId: 'work-1',
    roleDefinition: { role: 'SCOUT', version: '1', digest: qualityJourneyContractDigest(scout) },
    capabilityProfile: { profileId: profile.profileId, version: '1', digest: qualityJourneyContractDigest(profile) },
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
    stateHash: digest('c'),
    inputHash: digest('d'),
    lease: { leaseId: 'lease-1', expiresAt: '2026-08-28T16:00:00.000Z', heartbeatSeconds: 30 },
    idempotencyKey: 'assignment-1',
    completionCriteria: ['Publish observations.'],
  }
}

function startedReceipt(request: ReturnType<typeof createWorkerSpawnRequest>) {
  return {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    outcome: 'STARTED' as const,
    spawnReceiptId: 'spawn-1',
    assignmentId: request.assignmentId,
    workItemId: request.workItemId,
    attemptId: request.attemptId,
    roleDefinitionDigest: request.roleDefinitionDigest,
    capabilityProfileDigest: request.capabilityProfileDigest,
    effectiveWorker: {
      modelId: 'provider-selected-model',
      reasoningLevel: 'medium',
      toolIds: ['target.observe', 'evidence.publish'],
    },
    boundaries: request.requiredBoundaries.map(boundary => ({
      boundary: boundary.boundary,
      requested: boundary.allowedValues,
      effective: boundary.allowedValues,
      status: 'VERIFIED' as const,
      evidence: [digest('e')],
    })),
    startedAt: '2026-08-28T15:00:00.000Z',
  }
}

describe('Quality Journey Agent Factory', () => {
  it('creates a provider-neutral least-privilege spawn request', () => {
    const request = createWorkerSpawnRequest({
      requestId: 'request-1',
      attemptId: 'attempt-1',
      manifest: manifest(),
    })
    expect(request.scope).toEqual(manifest().scope)
    expect(request.assignment.allowedTargetRoutes).toEqual(['/checkout'])
    expect(request.assignment.writableArtifactKinds).toEqual(['TARGET_OBSERVATION_BUNDLE', 'EVIDENCE_RECEIPT'])
    expect(request.role).toBe('SCOUT')
    expect(Object.keys(request)).not.toContain('modelId')
    expect(JSON.stringify(request.capabilityProfile).toLowerCase()).not.toContain('model')
  })

  it('binds assignments to the exact registry version and digests', () => {
    expect(() =>
      createWorkerSpawnRequest({
        requestId: 'request-1',
        attemptId: 'attempt-1',
        manifest: { ...manifest(), roleDefinition: { ...manifest().roleDefinition, digest: digest('a') } },
      }),
    ).toThrow('role definition version or digest mismatch')
    expect(() =>
      createWorkerSpawnRequest({
        requestId: 'request-1',
        attemptId: 'attempt-1',
        manifest: { ...manifest(), capabilityProfile: { ...manifest().capabilityProfile, version: '2' } },
      }),
    ).toThrow('capability profile version or digest mismatch')
  })

  it('fails closed for missing or unverifiable required boundaries', () => {
    const request = createWorkerSpawnRequest({
      requestId: 'request-1',
      attemptId: 'attempt-1',
      manifest: manifest(),
    })
    const receipt = startedReceipt(request)
    expect(() =>
      validateWorkerSpawnReceipt(
        { ...receipt, boundaries: receipt.boundaries.filter(boundary => boundary.boundary !== 'TARGET') },
        request,
      ),
    ).toThrow('required TARGET boundary was not reported')
    expect(() =>
      validateWorkerSpawnReceipt(
        {
          ...receipt,
          boundaries: receipt.boundaries.map(boundary =>
            boundary.boundary === 'NETWORK' ? { ...boundary, status: 'UNVERIFIED' as const, evidence: [] } : boundary,
          ),
        },
        request,
      ),
    ).toThrow()
  })

  it('rejects effective runtime scope broader than the assignment', () => {
    const request = createWorkerSpawnRequest({ requestId: 'request-1', attemptId: 'attempt-1', manifest: manifest() })
    const receipt = startedReceipt(request)
    expect(() =>
      validateWorkerSpawnReceipt(
        {
          ...receipt,
          boundaries: receipt.boundaries.map(boundary =>
            boundary.boundary === 'NETWORK'
              ? { ...boundary, effective: ['https://example.test', 'https://unscoped.test'] }
              : boundary,
          ),
        },
        request,
      ),
    ).toThrow('effective NETWORK boundary exceeds the assignment')
    expect(() =>
      validateWorkerSpawnReceipt(
        {
          ...receipt,
          boundaries: [
            ...receipt.boundaries,
            {
              boundary: 'FILESYSTEM',
              requested: ['/outside'],
              effective: ['/outside'],
              status: 'VERIFIED',
              evidence: [digest('f')],
            },
          ],
        },
        request,
      ),
    ).toThrow('unrequested FILESYSTEM boundary was reported')
  })

  it('revalidates received spawn requests against canonical assignment authority', () => {
    const request = createWorkerSpawnRequest({ requestId: 'request-1', attemptId: 'attempt-1', manifest: manifest() })
    const tampered = {
      ...request,
      scope: { ...request.scope, permittedTools: [...request.scope.permittedTools, 'automation.write'] },
    }
    expect(() => validateWorkerSpawnReceipt(startedReceipt(request), tampered)).toThrow(
      'request does not match canonical assignment authority',
    )
    expect(() =>
      validateWorkerResult(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          assignmentId: request.assignmentId,
          workItemId: request.workItemId,
          attemptId: request.attemptId,
          roleContractDigest: request.roleDefinitionDigest,
          inputHash: request.inputHash,
          role: request.role,
          status: 'COMPLETED',
          outputs: [],
          evidenceReceipts: [],
          assumptions: [],
          blockers: [],
          unresolvedQuestions: [],
          submittedAt: '2026-08-28T15:05:00.000Z',
        },
        { spawnRequest: tampered, spawnReceipt: startedReceipt(request), currentInputHash: request.inputHash },
      ),
    ).toThrow('request does not match canonical assignment authority')
  })

  it('allows provider model changes without changing journey or work identity', () => {
    const request = createWorkerSpawnRequest({
      requestId: 'request-1',
      attemptId: 'attempt-1',
      manifest: manifest(),
    })
    const first = validateWorkerSpawnReceipt(startedReceipt(request), request)
    const second = validateWorkerSpawnReceipt(
      {
        ...startedReceipt(request),
        spawnReceiptId: 'spawn-2',
        effectiveWorker: { ...startedReceipt(request).effectiveWorker, modelId: 'different-selected-model' },
      },
      request,
    )
    expect(second.assignmentId).toBe(first.assignmentId)
    expect(second.workItemId).toBe(first.workItemId)
  })

  it('rejects forged, stale, cross-role, and out-of-scope results', () => {
    const request = createWorkerSpawnRequest({
      requestId: 'request-1',
      attemptId: 'attempt-1',
      manifest: manifest(),
    })
    const receipt = validateWorkerSpawnReceipt(startedReceipt(request), request)
    const result = {
      schemaVersion: 'appraise.quality-journey/v1',
      assignmentId: request.assignmentId,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      roleContractDigest: request.roleDefinitionDigest,
      inputHash: request.inputHash,
      role: 'SCOUT',
      status: 'COMPLETED',
      outputs: [],
      evidenceReceipts: [],
      assumptions: [],
      blockers: [],
      unresolvedQuestions: [],
      submittedAt: '2026-08-28T15:05:00.000Z',
    }
    expect(
      validateWorkerResult(result, {
        spawnRequest: request,
        spawnReceipt: receipt,
        currentInputHash: digest('d'),
      }),
    ).toEqual(result)
    expect(() =>
      validateWorkerResult(
        { ...result, assignmentId: 'forged-assignment' },
        { spawnRequest: request, spawnReceipt: receipt, currentInputHash: digest('d') },
      ),
    ).toThrow('assignment identity mismatch')
    expect(() =>
      validateWorkerResult(result, {
        spawnRequest: request,
        spawnReceipt: receipt,
        currentInputHash: digest('f'),
      }),
    ).toThrow('stale input hash')
    expect(() =>
      validateWorkerResult(
        { ...result, role: 'RESOURCE_EXPLORER' },
        { spawnRequest: request, spawnReceipt: receipt, currentInputHash: digest('d') },
      ),
    ).toThrow('role identity mismatch')
    expect(() =>
      validateWorkerResult(result, {
        spawnRequest: request,
        spawnReceipt: { ...receipt, capabilityProfileDigest: digest('f') },
        currentInputHash: digest('d'),
      }),
    ).toThrow('spawn receipt identity mismatch')
  })

  it('creates replacement assignments only from current artifacts and authority', () => {
    const replacement = createReplacementAssignment(manifest(), {
      assignmentId: 'assignment-2',
      stateHash: digest('f'),
      inputHash: digest('1'),
      inputArtifacts: [],
      lease: { leaseId: 'lease-2', expiresAt: '2026-08-28T17:00:00.000Z', heartbeatSeconds: 30 },
      idempotencyKey: 'assignment-2',
    })
    expect(replacement.workItemId).toBe('work-1')
    expect(replacement.assignmentId).toBe('assignment-2')
    expect(Object.keys(replacement)).not.toContain('transcript')
    expect(() =>
      createReplacementAssignment(
        { ...manifest(), transcript: ['hidden context'] },
        {
          assignmentId: 'assignment-2',
          stateHash: digest('f'),
          inputHash: digest('1'),
          inputArtifacts: [],
          lease: { leaseId: 'lease-2', expiresAt: '2026-08-28T17:00:00.000Z', heartbeatSeconds: 30 },
          idempotencyKey: 'assignment-2',
        },
      ),
    ).toThrow()
  })
})
