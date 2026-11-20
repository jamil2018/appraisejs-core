import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  analysis: vi.fn(),
  discovery: vi.fn(),
  preparation: vi.fn(),
  triage: vi.fn(),
  readDiscovery: vi.fn(),
  followup: vi.fn(),
  designerSuccessor: vi.fn(),
  after: vi.fn(),
  enabled: true,
  captureStatus: vi.fn(),
  capture: vi.fn(),
}))
vi.mock('./app-managed-discovery-capture', () => ({
  readAppManagedAnonymousDiscoveryCapture: mocks.captureStatus,
  captureAppManagedAnonymousDiscovery: mocks.capture,
}))
vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('./app-managed-analysis-service', () => ({
  appManagedAnalysisEnabled: () => mocks.enabled,
  startAppManagedAnalysis: mocks.analysis,
}))
vi.mock('./app-managed-discovery-service', () => ({
  appManagedDiscoveryEnabled: () => mocks.enabled,
  startAppManagedDiscovery: mocks.discovery,
}))
vi.mock('./app-managed-scenario-automation-service', () => ({
  appManagedScenarioAutomationEnabled: () => mocks.enabled,
  startAppManagedScenarioAutomation: mocks.preparation,
}))
vi.mock('./app-managed-triage-service', () => ({
  appManagedTriageEnabled: () => mocks.enabled,
  startAppManagedTriage: mocks.triage,
}))
vi.mock('./quality-journey-discovery-service', () => ({ readInternalDiscoveryAssignment: mocks.readDiscovery }))
vi.mock('./app-managed-scenario-automation-task', () => ({ readAppManagedDesignerSuccessor: mocks.designerSuccessor }))
vi.mock('./quality-journey-service', () => ({ observeQualityJourneyAnalysisFollowupInTransaction: mocks.followup }))

import { ServiceError } from '@/services/shared/errors'
import {
  continueAppManagedJourney,
  readAppManagedJourneyContinuation,
  scheduleAppManagedJourneyContinuation,
} from './app-managed-progression-service'

const input = { journeyId: 'journey', targetProjectId: 'project', expectedStateHash: 'state' }
const tx = { qualityJourney: { findFirst: mocks.find, findFirstOrThrow: mocks.find } }
const client = { ...tx, $transaction: (read: (value: typeof tx) => unknown) => read(tx) } as unknown as PrismaClient
const item = { id: 'work', role: 'REQUIREMENT_ANALYZER', cycleId: 'cycle', status: 'ELIGIBLE', currentAttempt: 0 }
const journey = {
  id: 'journey',
  targetProjectId: 'project',
  stage: 'ANALYSIS',
  status: 'ACTIVE',
  stateHash: 'state',
  hostingMode: 'APP_SERVER_LOCAL_V1',
  blockerIdsJson: '[]',
  unresolvedQuestionIdsJson: '[]',
  activeWorkItemIdsJson: '["work"]',
  activeCycleId: 'cycle',
  workItems: [item],
  currentCoordinatorSession: { status: 'ACTIVE', ownerPrincipalId: 'appraise-local:project' },
  activeDiscoveryRevision: null,
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled = true
  mocks.captureStatus.mockResolvedValue({ status: 'MANUAL_REQUIRED', request: null })
  mocks.find.mockResolvedValue(journey)
  mocks.followup.mockResolvedValue({ expected: null })
  mocks.designerSuccessor.mockResolvedValue(null)
  mocks.readDiscovery.mockResolvedValue({})
})

describe('managed continuation', () => {
  it.each([
    { status: 'PAUSED' },
    { hostingMode: 'EXTERNAL_LEGACY' },
    { stateHash: 'new-state' },
    { stage: 'ANALYSIS_REVIEW' },
    { stage: 'SCENARIO_REVIEW' },
    { stage: 'EXECUTION' },
    { stage: 'REPORT_REVIEW' },
    { blockerIdsJson: '["blocked"]' },
    { unresolvedQuestionIdsJson: '["question"]' },
    { currentCoordinatorSession: { status: 'FENCED', ownerPrincipalId: 'appraise-local:project' } },
    { currentCoordinatorSession: { status: 'ACTIVE', ownerPrincipalId: 'another-owner' } },
    { workItems: [{ ...item, currentAttempt: 1, status: 'IN_PROGRESS' }] },
    { workItems: [{ ...item, currentAttempt: 1, status: 'COMPLETED' }] },
    { workItems: [{ ...item, cycleId: 'old-cycle' }] },
  ])('does not dispatch across a gate or consumed assignment: %j', async change => {
    mocks.find.mockResolvedValue({ ...journey, ...change })
    expect(await continueAppManagedJourney(input, client)).toEqual({ completed: [] })
    expect(mocks.analysis).not.toHaveBeenCalled()
    expect(mocks.preparation).not.toHaveBeenCalled()
  })

  it('stops at operator report review without recording a completed triage or repeating preparation', async () => {
    mocks.find.mockResolvedValue({ ...journey, stage: 'TRIAGE', workItems: [] })
    mocks.triage.mockResolvedValueOnce({ accepted: false, awaitingOperator: true })
    expect(await continueAppManagedJourney(input, client)).toEqual({ completed: [] })
    expect(mocks.triage).toHaveBeenCalledOnce()
  })

  it('starts initial Analysis, then stops at the resulting exact human review', async () => {
    mocks.analysis.mockImplementationOnce(async () => {
      mocks.find.mockResolvedValue({ ...journey, stage: 'ANALYSIS_REVIEW', stateHash: 'review' })
    })
    expect(await continueAppManagedJourney(input, client)).toEqual({ completed: ['REQUIREMENT_ANALYZER'] })
    expect(mocks.analysis).toHaveBeenCalledOnce()
    expect(mocks.analysis).toHaveBeenCalledWith(expect.objectContaining(input), client)
  })

  it('requires server-owner enablement', async () => {
    mocks.enabled = false
    expect(await readAppManagedJourneyContinuation(input, client)).toBeNull()
  })

  it('selects Explorer while Scout awaits browser capture without claiming Scout', async () => {
    mocks.find.mockResolvedValue({
      ...journey,
      stage: 'DISCOVERY',
      activeWorkItemIdsJson: '["work","resource"]',
      workItems: [
        { ...item, role: 'SCOUT' },
        { ...item, id: 'resource', role: 'RESOURCE_EXPLORER' },
      ],
    })
    mocks.readDiscovery.mockRejectedValueOnce(new ServiceError('Browser evidence required', 'CONFLICT'))
    expect(await readAppManagedJourneyContinuation(input, client)).toMatchObject({ role: 'RESOURCE_EXPLORER' })
    expect(mocks.discovery).not.toHaveBeenCalled()
  })

  it('automatically captures an exact anonymous page before dispatching Scout', async () => {
    mocks.find.mockResolvedValue({ ...journey, stage: 'DISCOVERY', workItems: [{ ...item, role: 'SCOUT' }] })
    mocks.captureStatus.mockResolvedValueOnce({ status: 'READY', request: {} })
    mocks.capture.mockImplementationOnce(async () => {
      mocks.captureStatus.mockResolvedValue({ status: 'EVIDENCE_AVAILABLE', request: null })
      mocks.find.mockResolvedValue({ ...journey, stage: 'SCENARIO_REVIEW' })
    })
    expect(await continueAppManagedJourney(input, client)).toEqual({ completed: ['DISCOVERY_CAPTURE'] })
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining(input), client)
    expect(mocks.discovery).not.toHaveBeenCalled()
  })
  it.each(['INSPECTING', 'RECOVERY_REQUIRED'])(
    'parks automatic browser work at %s without another capture or native role',
    async status => {
      mocks.find.mockResolvedValue({ ...journey, stage: 'DISCOVERY', workItems: [{ ...item, role: 'SCOUT' }] })
      mocks.captureStatus.mockResolvedValue({ status, request: null })
      expect(await readAppManagedJourneyContinuation(input, client)).toBeNull()
      expect(mocks.capture).not.toHaveBeenCalled()
      expect(mocks.discovery).not.toHaveBeenCalled()
    },
  )
  it('does not swallow unexpected Discovery reader failures', async () => {
    mocks.find.mockResolvedValue({ ...journey, stage: 'DISCOVERY', workItems: [{ ...item, role: 'SCOUT' }] })
    mocks.readDiscovery.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(readAppManagedJourneyContinuation(input, client)).rejects.toThrow('database unavailable')
  })

  it('moves completed Discovery into scenario design through the canonical service', async () => {
    mocks.find.mockResolvedValue({ ...journey, stage: 'DISCOVERY', activeDiscoveryRevision: { status: 'COMPLETED' } })
    mocks.preparation.mockImplementationOnce(async () => {
      mocks.find.mockResolvedValue({ ...journey, stage: 'SCENARIO_REVIEW' })
    })
    expect(await continueAppManagedJourney(input, client)).toEqual({ completed: ['TEST_SCENARIO_DESIGNER'] })
    expect(mocks.preparation).toHaveBeenCalledWith(expect.objectContaining({ role: 'TEST_SCENARIO_DESIGNER' }), client)
  })

  it('observes exact canonical followup issuance before continuing a reissued Analysis item', async () => {
    mocks.find.mockResolvedValue({ ...journey, workItems: [{ ...item, currentAttempt: 1 }] })
    mocks.followup.mockResolvedValue({ expected: { workItemId: 'work' } })
    expect(await readAppManagedJourneyContinuation(input, client)).toMatchObject({ role: 'REQUIREMENT_ANALYZER' })
    expect(mocks.followup).toHaveBeenCalledWith(input, tx)
  })

  it.each(['ELIGIBLE', 'REPLACEMENT_REQUESTED'])('selects only exact issued Designer successors (%s)', async status => {
    mocks.find.mockResolvedValue({
      ...journey,
      stage: 'SCENARIO_DESIGN',
      workItems: [{ ...item, role: 'TEST_SCENARIO_DESIGNER', currentAttempt: 1, status }],
    })
    expect(await readAppManagedJourneyContinuation(input, client)).toBeNull()
    mocks.designerSuccessor.mockResolvedValue({
      predecessorAttemptId: 'prior',
      kind: status === 'ELIGIBLE' ? 'REVIEW_REVISION' : 'REJECTED_OUTPUT',
    })
    expect(await readAppManagedJourneyContinuation(input, client)).toMatchObject({ role: 'TEST_SCENARIO_DESIGNER' })
  })

  it('does not select a forged Designer successor or swallow unexpected reader failures', async () => {
    mocks.find.mockResolvedValue({
      ...journey,
      stage: 'SCENARIO_DESIGN',
      workItems: [{ ...item, role: 'TEST_SCENARIO_DESIGNER', currentAttempt: 1 }],
    })
    mocks.designerSuccessor.mockRejectedValueOnce(new ServiceError('Stale exact feedback', 'CONFLICT'))
    expect(await readAppManagedJourneyContinuation(input, client)).toBeNull()
    mocks.designerSuccessor.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(readAppManagedJourneyContinuation(input, client)).rejects.toThrow('database unavailable')
  })

  it('registers a wake after the response instead of performing native work in the decision action', () => {
    scheduleAppManagedJourneyContinuation(input)
    expect(mocks.after).toHaveBeenCalledWith(expect.any(Function))
    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.analysis).not.toHaveBeenCalled()
  })
})
