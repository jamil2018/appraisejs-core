import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  submitScout: vi.fn(),
  submitResourceExplorer: vi.fn(),
}))

vi.mock('@/services/target-project/target-project-service', () => ({ resolveTargetProject: mocks.resolve }))
vi.mock('@/services/coordinator/quality-journey-discovery-service', () => ({
  submitExternalQualityJourneyTargetObservation: mocks.submitScout,
  submitExternalQualityJourneyResourceResolution: mocks.submitResourceExplorer,
}))

import { postQualityJourneyDiscoveryRoute } from './quality-journey-discovery-route'

const digest = `sha256:${'a'.repeat(64)}`
const principal = { principalId: 'principal-1', assurance: 'PROJECT_CREDENTIAL_ONLY' } as const
const coordinatorSession = { coordinatorHandoffId: 'handoff-1', coordinatorGeneration: 2 }
const submission = {
  target: 'project-binding',
  discoveryRevisionId: 'discovery-1',
  workItemId: 'work-1',
  attemptId: 'attempt-1',
  leaseId: 'lease-1',
  expectedInputHash: digest,
  expectedScopeHash: digest,
  assignmentId: 'assignment-1',
  assignmentGeneration: 2,
  assignmentSecret: 's'.repeat(32),
  idempotencyKey: 'submission-1',
  bundle: { observedUrls: ['https://example.test'] },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockResolvedValue({ id: 'target-1' })
  mocks.submitScout.mockResolvedValue({ receiptId: 'scout-receipt' })
  mocks.submitResourceExplorer.mockResolvedValue({ receiptId: 'resource-receipt' })
})

it.each([
  ['external-target-observations', mocks.submitScout],
  ['external-resource-resolutions', mocks.submitResourceExplorer],
])('projects %s onto the exact external service envelope', async (operation, service) => {
  const response = await postQualityJourneyDiscoveryRoute(
    ['quality', 'journeys', 'journey-1', 'discovery', operation],
    submission,
    coordinatorSession,
    principal,
  )

  expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith('project-binding')
  expect(service).toHaveBeenCalledExactlyOnceWith(
    {
      discoveryRevisionId: 'discovery-1',
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      leaseId: 'lease-1',
      expectedInputHash: digest,
      expectedScopeHash: digest,
      assignmentId: 'assignment-1',
      assignmentGeneration: 2,
      assignmentSecret: 's'.repeat(32),
      idempotencyKey: 'submission-1',
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      bundle: {
        observedUrls: ['https://example.test'],
        schemaVersion: 'appraise.quality-journey/v1',
        journeyId: 'journey-1',
        targetProjectId: 'target-1',
        workItemId: 'work-1',
        attemptId: 'attempt-1',
      },
    },
    principal,
    undefined,
    coordinatorSession,
  )
  expect(response?.status).toBe(201)
})
