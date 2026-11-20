import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/services/shared/errors'

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  request: vi.fn(),
  prepare: vi.fn(),
  triage: vi.fn(),
  revalidate: vi.fn(),
  compile: vi.fn(),
  invoke: vi.fn(),
  fence: vi.fn(),
  context: vi.fn(),
  precompile: vi.fn(),
}))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('@/services/coordinator/app-managed-automation-manual-recovery', () => ({
  requestAppManagedAutomatorManualRecovery: mocks.request,
  prepareAppManagedManualAutomationTask: mocks.prepare,
  getAppManagedManualAutomationDraftContext: mocks.context,
}))
vi.mock('@/services/coordinator/app-managed-scenario-automation-projection', () => ({
  appManagedPreparationProjection: () => ({ compile: mocks.precompile }),
}))
vi.mock('@/services/coordinator/app-managed-triage-service', () => ({ operatorTriage: mocks.triage }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import {
  requestManualAutomationRecoveryAction,
  submitManualAutomationAction,
  previewOperatorTriageAction,
  saveOperatorTriageAction,
} from './quality-journey-operator-actions'

const hash = `sha256:${'a'.repeat(64)}`
const scope = { journeyId: 'journey-1', expectedStateHash: hash }
const request = { ...scope, attemptId: 'attempt-1', expectedFailureHash: hash }
const draft = {
  scenarios: [
    {
      scenarioKey: 'scenario-1',
      steps: [{ bindingId: 'binding-1', parameters: [], testData: [], locatorRequirements: [] }],
    },
  ],
}
const submission = { journeyId: scope.journeyId, recoveryEventId: 'recovery-1', draftJson: JSON.stringify(draft) }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'active-project' })
  mocks.context.mockResolvedValue({ context: {} })
  mocks.precompile.mockImplementation(call => call)
  mocks.request.mockResolvedValue({ eventId: 'recovery-1' })
  mocks.prepare.mockResolvedValue({
    submissionIdempotencyKey: 'exact-issued-key',
    compile: mocks.compile,
    delivery: { invoke: mocks.invoke, fence: mocks.fence },
  })
  mocks.compile.mockImplementation(call => call)
  mocks.invoke.mockResolvedValue({ receipt: { accepted: true } })
  mocks.triage.mockResolvedValue({ inputHash: hash, expectedStateHash: hash, runs: [] })
})

describe('operator recovery and report actions', () => {
  it('validates semantic mapping against read-only choices before consuming any successor lease', async () => {
    mocks.precompile.mockImplementation(() => {
      throw new ServiceError('Binding is outside the exact approved resources.', 'CONFLICT')
    })
    expect(await submitManualAutomationAction(submission)).toMatchObject({ success: false, status: 409 })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.fence).not.toHaveBeenCalled()
  })
  it('issues recovery with only server-resolved project scope and does not claim preparation', async () => {
    expect(await requestManualAutomationRecoveryAction(request)).toMatchObject({ success: true })
    expect(mocks.request).toHaveBeenCalledWith({ ...request, targetProjectId: 'active-project' })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
    expect(await requestManualAutomationRecoveryAction({ ...request, targetProjectId: 'forged' })).toMatchObject({
      status: 400,
    })
  })
  it('validates JSON before claiming, injects exact submission identity, and always fences the acquired delivery', async () => {
    expect(await submitManualAutomationAction(submission)).toMatchObject({ success: true, data: { nativeSend: false } })
    expect(mocks.prepare).toHaveBeenCalledWith({
      journeyId: scope.journeyId,
      targetProjectId: 'active-project',
      recoveryEventId: 'recovery-1',
    })
    expect(mocks.compile).toHaveBeenCalledWith({
      toolName: 'quality_journey_automation_materialize',
      arguments: { ...draft, idempotencyKey: 'exact-issued-key' },
    })
    expect(mocks.invoke).toHaveBeenCalledWith({
      toolName: 'quality_journey_automation_materialize',
      arguments: { ...draft, idempotencyKey: 'exact-issued-key' },
      callId: 'exact-issued-key',
    })
    expect(mocks.fence).toHaveBeenCalledOnce()
  })
  it.each(['{', '{}', '{"scenarios":[],"targetProjectId":"forged"}'])(
    'rejects malformed preparation %s without acquiring authority',
    async draftJson => {
      expect(await submitManualAutomationAction({ ...submission, draftJson })).toMatchObject({
        success: false,
        status: 400,
      })
      expect(mocks.prepare).not.toHaveBeenCalled()
    },
  )
  it('fences after compilation or canonical submission refuses and preserves canonical error text', async () => {
    mocks.compile.mockImplementation(() => {
      throw new ServiceError('The approved steps changed.', 'CONFLICT')
    })
    expect(await submitManualAutomationAction(submission)).toMatchObject({
      status: 409,
      error: 'The approved steps changed.',
    })
    expect(mocks.fence).toHaveBeenCalledOnce()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it('previews without saving and saves only parsed findings against exact evidence and active scope', async () => {
    expect(await previewOperatorTriageAction(scope)).toMatchObject({ success: true })
    expect(mocks.triage).toHaveBeenCalledWith({ ...scope, targetProjectId: 'active-project' }, null)
    const findings = [
      {
        testRunId: 'run-1',
        kind: 'INCONCLUSIVE',
        observation: 'Not observed.',
        expectation: 'Confirmation appears.',
        nextAction: 'Check the environment.',
      },
    ]
    expect(await saveOperatorTriageAction({ ...scope, inputHash: hash, findings })).toMatchObject({ success: true })
    expect(mocks.triage).toHaveBeenLastCalledWith(
      { ...scope, targetProjectId: 'active-project' },
      { inputHash: hash, findings },
    )
    expect(
      await saveOperatorTriageAction({ ...scope, inputHash: hash, findings, targetProjectId: 'forged' }),
    ).toMatchObject({ status: 400 })
  })
  it('returns bounded generic uncertainty for unexpected errors', async () => {
    mocks.invoke.mockRejectedValue(new Error('private credential diagnostic'))
    const result = await submitManualAutomationAction(submission)
    expect(result).toMatchObject({ status: 500, success: false })
    expect(result.error).not.toContain('private credential')
    expect(mocks.fence).toHaveBeenCalledOnce()
  })
})
