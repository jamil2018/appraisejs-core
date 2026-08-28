import { describe, expect, it } from 'vitest'
import {
  journeyClosureSchema,
  journeyCommandKindSchema,
  journeyCommandResultSchema,
  journeyCommandSchema,
  providerCapabilityProfileSchema,
  qualityJourneyGoldenFixtureSchema,
  qualityJourneyGoldenFixtures,
  qualityJourneyRoleDefinitions,
  qualityJourneyTransitions,
  roleDefinitionSchema,
  stageRoleEligibility,
  testOutcomeAttributionSchema,
  validateAssignmentManifest,
  validateQualityJourneyGoldenFixture,
  workerSpawnReceiptSchema,
  workerResultEnvelopeSchema,
  workItemTransitions,
} from './index'
import { qualityJourneyCapabilityProfiles } from './role-definitions'
import { hashQualityJourneyState } from './state'

const digest = (character: string) => `sha256:${character.repeat(64)}`

describe('Quality Journey Phase 0 contracts', () => {
  it('defines exactly six role contracts with unique negative authority', () => {
    const definitions = qualityJourneyRoleDefinitions.map(definition => roleDefinitionSchema.parse(definition))
    expect(definitions.map(definition => definition.role)).toEqual([
      'REQUIREMENT_ANALYZER',
      'SCOUT',
      'RESOURCE_EXPLORER',
      'TEST_SCENARIO_DESIGNER',
      'AUTOMATOR',
      'TRIAGER',
    ])
    expect(definitions.every(definition => definition.forbiddenCapabilities.length > 0)).toBe(true)
    expect(stageRoleEligibility.DISCOVERY).toEqual(['SCOUT', 'RESOURCE_EXPLORER'])
  })

  it('keeps capability requests provider and model neutral', () => {
    for (const profile of Object.values(qualityJourneyCapabilityProfiles)) {
      expect(providerCapabilityProfileSchema.parse(profile)).toEqual(profile)
      const canonical = JSON.stringify(profile).toLowerCase()
      expect(canonical).not.toContain('provider')
      expect(canonical).not.toContain('model')
    }
  })

  it('rejects unsupported started workers and over-privileged assignments', () => {
    expect(() =>
      workerSpawnReceiptSchema.parse({
        schemaVersion: 'appraise.quality-journey/v1',
        outcome: 'STARTED',
        spawnReceiptId: 'spawn-1',
        assignmentId: 'assignment-1',
        workItemId: 'work-1',
        attemptId: 'attempt-1',
        roleDefinitionDigest: digest('a'),
        capabilityProfileDigest: digest('b'),
        effectiveWorker: {
          modelId: 'effective-worker',
          reasoningLevel: 'MEDIUM',
          latencyPreference: 'BALANCED',
          toolIds: [],
        },
        boundaries: [{ boundary: 'LIFECYCLE_COMMAND', requested: [], status: 'UNSUPPORTED', evidence: [] }],
        startedAt: '2026-08-28T00:00:00.000Z',
      }),
    ).toThrow()

    const scout = qualityJourneyRoleDefinitions.find(definition => definition.role === 'SCOUT')!
    const profile = qualityJourneyCapabilityProfiles.fastObservation
    const manifest = {
      schemaVersion: 'appraise.quality-journey/v1',
      assignmentId: 'assignment-1',
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      workItemId: 'work-1',
      roleDefinition: { role: 'SCOUT', version: '1', digest: digest('a') },
      capabilityProfile: { profileId: 'fast-observation', version: '1', digest: digest('b') },
      inputArtifacts: [],
      allowedTargetRoutes: ['/checkout'],
      allowedResourceIds: [],
      writableArtifactKinds: ['RUNTIME_CAPSULE'],
      scope: {
        permittedTools: ['target.observe', 'automation.write'],
        permittedCommands: ['work.output.submit'],
        filesystemPaths: [],
        networkOrigins: ['https://example.test'],
        credentialGrantIds: [],
        targetAccess: 'MUTATING',
      },
      stateHash: digest('c'),
      inputHash: digest('d'),
      lease: { leaseId: 'lease-1', expiresAt: '2026-08-28T00:05:00.000Z', heartbeatSeconds: 30 },
      idempotencyKey: 'assignment-1',
      completionCriteria: ['Publish observations.'],
    }
    expect(() => validateAssignmentManifest(manifest, scout, profile)).toThrow()
  })

  it('rejects unknown command fields and distinguishes stale-state conflicts', () => {
    const command = journeyCommandSchema.parse({
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'command-1',
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      actor: 'USER',
      command: 'DECIDE_ANALYSIS',
      expectedStateHash: digest('a'),
      idempotencyKey: 'decision-1',
      inputArtifactRefs: [],
      payload: { revisionId: 'analysis-1', contentHash: digest('c'), decision: 'APPROVED' },
    })
    expect(() => journeyCommandSchema.parse({ ...command, conversationApproval: true })).toThrow()
    expect(() => journeyCommandSchema.parse({ ...command, payload: { decision: 'APPROVED' } })).toThrow()
    expect(
      journeyCommandResultSchema.parse({
        schemaVersion: 'appraise.quality-journey/v1',
        outcome: 'CONFLICT',
        commandId: command.commandId,
        code: 'STALE_STATE_HASH',
        currentStateHash: digest('b'),
        currentStage: 'ANALYSIS_REVIEW',
        safeNextCommands: ['DECIDE_ANALYSIS'],
      }),
    ).toMatchObject({ outcome: 'CONFLICT', code: 'STALE_STATE_HASH' })
  })

  it('binds worker results to the exact work item, attempt, role contract, and input', () => {
    const result = workerResultEnvelopeSchema.parse({
      schemaVersion: 'appraise.quality-journey/v1',
      assignmentId: 'assignment-1',
      workItemId: 'work-1',
      attemptId: 'attempt-2',
      roleContractDigest: digest('c'),
      inputHash: digest('d'),
      role: 'AUTOMATOR',
      status: 'COMPLETED',
      outputs: [],
      evidenceReceipts: [],
      assumptions: [],
      blockers: [],
      unresolvedQuestions: [],
      submittedAt: '2026-08-27T00:00:00.000Z',
    })
    expect(result.attemptId).toBe('attempt-2')
    expect(() =>
      workerResultEnvelopeSchema.parse({
        ...result,
        outputs: [
          {
            kind: 'TEST_REPORT_ANALYSIS_REVISION',
            artifactId: 'report-1',
            revisionId: 'report-revision-1',
            contentHash: digest('e'),
          },
        ],
      }),
    ).toThrow()
  })

  it('requires explicit risk acceptance for closure with unresolved items', () => {
    const base = {
      schemaVersion: 'appraise.quality-journey/v1' as const,
      closureId: 'closure-1',
      journeyId: 'journey-1',
      cycleId: 'cycle-1',
      reportRevision: {
        kind: 'TEST_REPORT_ANALYSIS_REVISION' as const,
        artifactId: 'report-1',
        revisionId: 'report-revision-1',
        contentHash: digest('e'),
      },
      actorId: 'user-1',
      unresolvedItems: [{ itemId: 'risk-1', summary: 'Known browser limitation.', artifactRefs: [] }],
      closedAt: '2026-08-27T00:00:00.000Z',
    }
    expect(() => journeyClosureSchema.parse({ ...base, decision: 'CLOSED' })).toThrow()
    expect(() =>
      journeyClosureSchema.parse({
        ...base,
        reportRevision: { ...base.reportRevision, revisionId: undefined },
        decision: 'RISK_ACCEPTED',
        riskAcceptance: {
          rationale: 'The limitation is accepted for this release.',
          acceptedItemIds: ['risk-1'],
          acceptedAt: '2026-08-27T00:00:00.000Z',
        },
      }),
    ).toThrow()
    expect(() =>
      journeyClosureSchema.parse({
        ...base,
        decision: 'RISK_ACCEPTED',
        riskAcceptance: {
          rationale: 'The limitation is accepted for this release.',
          acceptedItemIds: ['different-risk'],
          acceptedAt: '2026-08-27T00:00:00.000Z',
        },
      }),
    ).toThrow()
    expect(
      journeyClosureSchema.parse({
        ...base,
        decision: 'RISK_ACCEPTED',
        riskAcceptance: {
          rationale: 'The limitation is accepted for this release.',
          acceptedItemIds: ['risk-1'],
          acceptedAt: '2026-08-27T00:00:00.000Z',
        },
      }).decision,
    ).toBe('RISK_ACCEPTED')
    expect(() =>
      journeyClosureSchema.parse({
        ...base,
        decision: 'RISK_ACCEPTED',
        unresolvedItems: [...base.unresolvedItems, ...base.unresolvedItems],
        riskAcceptance: {
          rationale: 'The limitation is accepted for this release.',
          acceptedItemIds: ['risk-1', 'risk-1'],
          acceptedAt: '2026-08-27T00:00:00.000Z',
        },
      }),
    ).toThrow()
    expect(() =>
      journeyClosureSchema.parse({
        ...base,
        decision: 'CLOSED',
        unresolvedItems: [],
        riskAcceptance: {
          rationale: 'Not permitted for normal closure.',
          acceptedItemIds: ['risk-1'],
          acceptedAt: '2026-08-27T00:00:00.000Z',
        },
      }),
    ).toThrow()
  })

  it('hashes only the canonical authoritative projection', () => {
    const projection = {
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      stage: 'DISCOVERY' as const,
      activeCycleId: 'cycle-1',
      activeRevisionIds: { analysis: 'analysis-1', journey: 'journey-revision-1' },
      unresolvedQuestionIds: ['question-2', 'question-1'],
      blockerIds: [],
      activeWorkItemIds: ['scout', 'resources'],
      permittedCommands: ['RESUME_BLOCKER', 'START_SCENARIO_DESIGN'],
    }
    expect(hashQualityJourneyState(projection)).toBe(
      hashQualityJourneyState({
        ...projection,
        activeRevisionIds: { journey: 'journey-revision-1', analysis: 'analysis-1' },
        unresolvedQuestionIds: ['question-1', 'question-2'],
        activeWorkItemIds: ['resources', 'scout'],
      }),
    )
    expect(hashQualityJourneyState({ ...projection, blockerIds: ['blocker-1'] })).not.toBe(
      hashQualityJourneyState(projection),
    )
  })

  it('publishes a complete normal transition table and terminal work-item states', () => {
    expect(qualityJourneyTransitions[0]).toMatchObject({ from: 'INTAKE', to: 'ANALYSIS' })
    expect(qualityJourneyTransitions).toContainEqual(expect.objectContaining({ from: 'REPORT_REVIEW', to: 'CLOSED' }))
    expect(qualityJourneyTransitions).toContainEqual(
      expect.objectContaining({ from: 'ANALYSIS_REVIEW', to: 'ANALYSIS' }),
    )
    expect(qualityJourneyTransitions.every(transition => transition.failureCodes.length > 0)).toBe(true)
    expect(workItemTransitions.COMPLETED).toEqual([])
    expect(workItemTransitions.CANCELLED).toEqual([])
    expect(workItemTransitions.SUPERSEDED).toEqual([])
    expect(workItemTransitions.LEASE_EXPIRED).toContain('REPLACEMENT_REQUESTED')
    expect(new Set(qualityJourneyTransitions.map(transition => transition.command))).toEqual(
      new Set(journeyCommandKindSchema.options),
    )
  })

  it('publishes all eleven consumable golden lifecycle fixtures', () => {
    expect(qualityJourneyGoldenFixtures).toHaveLength(11)
    expect(qualityJourneyGoldenFixtures.map(fixture => fixture.id)).toEqual([
      'happy-path',
      'analysis-revision-loop',
      'reconnect-and-reclaim',
      'stale-command',
      'partial-scenario-approval',
      'worker-replacement',
      'unsupported-provider-boundary',
      'remediation-rerun-cycle',
      'target-defect',
      'validation-design-defect',
      'risk-accepted-closure',
    ])
    for (const fixture of qualityJourneyGoldenFixtures) {
      qualityJourneyGoldenFixtureSchema.parse(fixture)
      validateQualityJourneyGoldenFixture(fixture)
    }
    const happyCommands = qualityJourneyGoldenFixtures[0].steps.filter(step => step.kind === 'COMMAND')
    for (let index = 1; index < happyCommands.length; index += 1) {
      const predecessor = happyCommands[index - 1]
      const successor = happyCommands[index]
      if (
        predecessor.kind !== 'COMMAND' ||
        successor.kind !== 'COMMAND' ||
        predecessor.expected.outcome !== 'COMMITTED'
      )
        throw new Error('Happy-path fixture command shape changed unexpectedly.')
      expect(successor.request.expectedStateHash).toBe(predecessor.expected.successorStateHash)
    }
  })

  it('permits target failure only for sealed target-defect attribution', () => {
    const attribution = {
      schemaVersion: 'appraise.quality-journey/v1',
      attributionId: 'attribution-1',
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      cycleId: 'cycle-1',
      reportRevision: {
        kind: 'TEST_REPORT_ANALYSIS_REVISION',
        artifactId: 'report-1',
        revisionId: 'report-revision-1',
        contentHash: digest('a'),
      },
      kind: 'VALIDATION_DESIGN_DEFECT',
      targetOutcome: 'FAILED',
      evidence: [{ kind: 'EVIDENCE_RECEIPT', artifactId: 'evidence-1', contentHash: digest('b') }],
      confidence: 'HIGH',
      competingHypotheses: [],
      rationale: 'The validation design lacks an observable oracle.',
    }
    expect(() => testOutcomeAttributionSchema.parse(attribution)).toThrow()
  })
})
