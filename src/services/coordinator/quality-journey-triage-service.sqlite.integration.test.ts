import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import {
  clearAgentFactoryProviderAdaptersForTest,
  createQualityJourneyKernelState,
  hashQualityJourneyExecutionValue as hash,
  registerAgentFactoryProviderAdapter,
} from '@/lib/quality-journey'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  claimQualityJourneyWork,
  completeQualityJourneyWork,
  createQualityJourney,
  dispatchQualityJourneyWork,
  submitDurableQualityJourneyCommand,
} from './quality-journey-service'
import {
  getQualityJourneyTriage,
  prepareQualityJourneyTriage,
  requestQualityJourneyReportRevision,
  submitQualityJourneyTriageReport,
} from './quality-journey-triage-service'

const workspaces: string[] = []
const clients: PrismaClient[] = []
const digest = (character: string) => `sha256:${character.repeat(64)}`
const json = (value: unknown) => canonicalContractJson(value)

afterEach(async () => {
  clearAgentFactoryProviderAdaptersForTest()
  await Promise.all(clients.splice(0).map(client => client.$disconnect()))
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

function adapterFor(attemptId: string, adapterId: string) {
  registerAgentFactoryProviderAdapter({
    adapterId,
    supports: request => request.attemptId === attemptId,
    dispatch: async request => ({
      schemaVersion: 'appraise.quality-journey/v1',
      outcome: 'STARTED',
      spawnReceiptId: `receipt-${request.attemptId}`,
      assignmentId: request.assignmentId,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      roleDefinitionDigest: request.roleDefinitionDigest,
      capabilityProfileDigest: request.capabilityProfileDigest,
      effectiveWorker: {
        modelId: 'provider-selected',
        reasoningLevel: 'HIGH',
        latencyPreference: 'DELIBERATE',
        toolIds: request.scope.permittedTools,
      },
      boundaries: request.requiredBoundaries.map(boundary => ({
        boundary: boundary.boundary,
        requested: boundary.allowedValues,
        effective: boundary.allowedValues,
        status: 'VERIFIED',
        evidence: [digest('f')],
      })),
      startedAt: '2026-09-05T00:00:00.000Z',
    }),
  })
}

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-quality-journey-triage-'))
  workspaces.push(workspace)
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  // SQLite PRAGMAs are connection-local. All temporary Phase 3-7 antecedents
  // and restoration run through this single client connection.
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
  clients.push(client)
  await client.targetProject.create({
    data: {
      id: 'target-triage',
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'Triage fixture',
      fingerprint: digest('a'),
    },
  })
  await client.environment.create({
    data: {
      id: 'environment-triage',
      targetProjectId: 'target-triage',
      name: 'local',
      baseUrl: 'https://example.test',
    },
  })
  const created = await createQualityJourney(
    { targetProjectId: 'target-triage', idempotencyKey: 'triage-create', requirement: { objective: 'Checkout' } },
    client,
  )
  const journeyId = created.journey.journeyId
  const cycleId = created.journey.activeCycleId
  const kernel = createQualityJourneyKernelState({
    journeyId,
    targetProjectId: 'target-triage',
    activeCycleId: cycleId,
    stage: 'TRIAGE',
  })
  const analysisContent = {
    requirements: [
      { requirementId: 'REQ-CHECKOUT', statement: 'A shopper receives confirmation.' },
      { requirementId: 'REQ-UNRUN', statement: 'A shopper can view the order history.' },
    ],
  }
  const analysisHash = hash(analysisContent)
  const capsules = [{ preparedCapsuleId: 'prepared-triage', scenarioRevisionId: 'scenario-triage-r1' }]
  const capsulesHash = hash(capsules)
  const environmentSnapshotHash = digest('b')
  const evidence = {
    journeyId,
    targetProjectId: 'target-triage',
    cycleId,
    executionCycleId: 'execution-triage',
    testRunId: 'test-run-triage',
    runId: 'managed-run-triage',
    preparedCapsuleId: 'prepared-triage',
    preparedCapsulesHash: capsulesHash,
    environmentSnapshotHash,
    result: 'FAILED',
    status: 'COMPLETED',
    evidenceHealth: 'valid',
    missingArtifacts: [],
    artifacts: { report: digest('c') },
  }
  // Phase 8 is intentionally tested against a migrated database, but its Phase
  // 3-7 antecedents are a frozen relational packet rather than repeated APIs.
  await client.$executeRawUnsafe('PRAGMA foreign_keys=OFF')
  await client.qualityJourney.update({
    where: { id: journeyId },
    data: { stage: 'TRIAGE', stateHash: kernel.stateHash },
  })
  await client.qualityJourneyArtifact.create({
    data: {
      id: 'artifact-analysis',
      identityKey: 'ANALYSIS_CHARTER_REVISION:analysis:analysis-r1',
      journeyId,
      targetProjectId: 'target-triage',
      cycleId,
      kind: 'ANALYSIS_CHARTER_REVISION',
      artifactId: 'analysis',
      revisionId: 'analysis-r1',
      contentHash: analysisHash,
      artifactJson: json(analysisContent),
    },
  })
  await client.qualityJourneyAnalysisRevision.create({
    data: {
      id: 'analysis-row',
      journeyId,
      targetProjectId: 'target-triage',
      cycleId,
      artifactRecordId: 'artifact-analysis',
      artifactId: 'analysis',
      artifactRevisionId: 'analysis-r1',
      revision: 1,
      contentHash: analysisHash,
      submissionIdempotencyKey: 'analysis-submit',
      submissionHash: digest('d'),
      submittedWorkItemId: 'antecedent-work',
      submittedAttemptId: 'antecedent-attempt',
      inputHash: digest('e'),
    },
  })
  await client.qualityJourneyDiscoveryRevision.create({
    data: {
      id: 'discovery-triage',
      journeyId,
      targetProjectId: 'target-triage',
      cycleId,
      analysisRevisionId: 'analysis-row',
      analysisDecisionId: 'antecedent-decision',
      analysisArtifactId: 'analysis',
      analysisRevisionArtifactId: 'analysis-r1',
      analysisRevisionContentHash: analysisHash,
      analysisApprovalArtifactId: 'analysis-approval',
      analysisApprovalContentHash: digest('f'),
      approvedRequirementSetHash: digest('1'),
      environmentRegistryHash: digest('2'),
      locatorRegistryHash: digest('3'),
      resourceRegistryHash: digest('4'),
      stepDefinitionRegistryHash: digest('5'),
      operationRegistryHash: digest('6'),
      scoutScopeJson: '{}',
      scoutInputHash: digest('7'),
      resourceScopeJson: '{}',
      resourceInputHash: digest('8'),
      scopeHash: digest('9'),
      scoutWorkItemId: 'antecedent-scout',
      resourceWorkItemId: 'antecedent-resource',
      status: 'COMPLETED',
      completionHash: digest('a'),
    },
  })
  await client.qualityJourneyScenarioPortfolioRevision.create({
    data: {
      id: 'portfolio-triage',
      journeyId,
      targetProjectId: 'target-triage',
      cycleId,
      discoveryRevisionId: 'discovery-triage',
      discoveryCompletionHash: digest('a'),
      artifactRecordId: 'antecedent-portfolio-artifact',
      artifactId: 'portfolio',
      artifactRevisionId: 'portfolio-r1',
      revision: 1,
      contentHash: digest('b'),
      behavioralIntentHash: digest('c'),
      enrichmentHash: digest('d'),
      layoutHash: digest('e'),
      coverageRationale: 'Checkout confirmation is in scope.',
      graphJson: '{}',
      submissionIdempotencyKey: 'portfolio-submit',
      submissionHash: digest('f'),
      submittedWorkItemId: 'antecedent-designer',
      submittedAttemptId: 'antecedent-designer-attempt',
      status: 'APPROVED',
      approvedIntentHash: digest('1'),
    },
  })
  await client.qualityJourneyScenarioRevision.create({
    data: {
      id: 'scenario-row-triage',
      portfolioRevisionId: 'portfolio-triage',
      stableScenarioId: 'scenario-triage',
      scenarioRevisionId: 'scenario-triage-r1',
      behavioralIntentJson: json({ requirementIds: ['REQ-CHECKOUT'] }),
      behavioralIntentHash: digest('2'),
      enrichmentJson: '{}',
      enrichmentHash: digest('3'),
      layoutJson: '{}',
      layoutHash: digest('4'),
      contentHash: digest('5'),
    },
  })
  await client.qualityJourneyScenarioDecision.create({
    data: {
      id: 'scenario-decision-triage',
      portfolioRevisionId: 'portfolio-triage',
      scenarioRevisionId: 'scenario-triage-r1',
      decision: 'APPROVED',
      actor: 'USER',
      idempotencyKey: 'scenario-decision',
      requestHash: digest('6'),
      contentHash: digest('7'),
    },
  })
  // This approved scenario was outside the selected rerun. It remains in the
  // accepted portfolio and must therefore remain NOT_EVALUATED, never PASSED.
  await client.qualityJourneyScenarioRevision.create({
    data: {
      id: 'scenario-row-unrun',
      portfolioRevisionId: 'portfolio-triage',
      stableScenarioId: 'scenario-unrun',
      scenarioRevisionId: 'scenario-unrun-r1',
      behavioralIntentJson: json({ requirementIds: ['REQ-UNRUN'] }),
      behavioralIntentHash: digest('8'),
      enrichmentJson: '{}',
      enrichmentHash: digest('9'),
      layoutJson: '{}',
      layoutHash: digest('a'),
      contentHash: digest('b'),
    },
  })
  await client.qualityJourneyScenarioDecision.create({
    data: {
      id: 'scenario-decision-unrun',
      portfolioRevisionId: 'portfolio-triage',
      scenarioRevisionId: 'scenario-unrun-r1',
      decision: 'APPROVED',
      actor: 'USER',
      idempotencyKey: 'scenario-decision-unrun',
      requestHash: digest('c'),
      contentHash: digest('d'),
    },
  })
  await client.qualityJourneyExecutionCycle.create({
    data: {
      id: 'execution-triage',
      journeyId,
      targetProjectId: 'target-triage',
      cycleId,
      preparedCapsulesJson: json(capsules),
      preparedCapsulesHash: capsulesHash,
      environmentId: 'environment-triage',
      environmentSnapshotJson: '{}',
      environmentSnapshotHash,
      environmentSnapshotVersion: 1,
      targetFingerprint: digest('a'),
      stateHash: kernel.stateHash,
      idempotencyKey: 'execution',
      requestHash: digest('8'),
      status: 'COMPLETED',
      completedAt: new Date('2026-09-05T00:00:01.000Z'),
    },
  })
  await client.testRun.create({
    data: {
      id: 'test-run-triage',
      runId: 'managed-run-triage',
      name: 'managed triage run',
      targetProjectId: 'target-triage',
      environmentId: 'environment-triage',
      environmentSnapshotJson: '{}',
      environmentSnapshotHash,
      environmentSnapshotVersion: 1,
      browserEngine: 'CHROMIUM',
      intent: 'INDEPENDENT',
      result: 'FAILED',
      status: 'COMPLETED',
      evidenceHealth: 'valid',
    },
  })
  await client.qualityJourneyExecutionTestRun.create({
    data: {
      id: 'execution-run-triage',
      executionCycleId: 'execution-triage',
      preparedCapsuleId: 'prepared-triage',
      testRunId: 'test-run-triage',
      runId: 'managed-run-triage',
      status: 'COMPLETED',
    },
  })
  await client.qualityJourneyExecutionEvidenceReceipt.create({
    data: {
      id: 'evidence-triage',
      executionCycleId: 'execution-triage',
      testRunId: 'test-run-triage',
      runtimeBytesHash: hash(evidence.artifacts),
      receiptHash: hash(evidence),
      evidenceJson: json(evidence),
    },
  })
  await client.$executeRawUnsafe('PRAGMA foreign_keys=ON')
  const enforcement = await client.$queryRawUnsafe<Array<{ foreign_keys: bigint }>>('PRAGMA foreign_keys')
  expect(Number(enforcement[0]!.foreign_keys)).toBe(1)
  return { client, journeyId, cycleId, stateHash: kernel.stateHash }
}

function report(
  input: Awaited<ReturnType<typeof getQualityJourneyTriage>>['assignments'][number]['input'],
  revision: string,
  predecessorReportRevisionId?: string,
) {
  return {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    reportRevisionId: revision,
    executionCycleId: input.executionCycleId,
    cycleId: input.cycleId,
    ...(predecessorReportRevisionId ? { predecessorReportRevisionId } : {}),
    inputHash: hash(input),
    summary: 'The sealed execution outcome is attributed to the target.',
    findings: [
      {
        findingId: `${revision}-finding`,
        testRunId: 'test-run-triage',
        evidenceReceiptId: 'evidence-triage',
        scenarioRevisionId: 'scenario-triage-r1',
        requirementIds: ['REQ-CHECKOUT'],
        kind: 'TARGET_DEFECT' as const,
        targetOutcome: 'FAILED' as const,
        confidence: 'HIGH' as const,
        rationale: 'The sealed evidence records the missing confirmation.',
        competingHypotheses: [],
        unresolved: false,
        postmortem: {
          observation: 'Confirmation was missing.',
          expectedBehavior: 'Confirmation is displayed.',
          causalAnalysis: 'The target did not render confirmation.',
          nextAction: 'Correct confirmation handling.',
        },
      },
    ],
    coverage: [
      {
        requirementId: 'REQ-CHECKOUT',
        scenarioRevisionIds: ['scenario-triage-r1'],
        testRunIds: ['test-run-triage'],
        outcome: 'FAILED' as const,
        rationale: 'The only accepted scenario failed with valid sealed evidence.',
      },
      {
        requirementId: 'REQ-UNRUN',
        scenarioRevisionIds: ['scenario-unrun-r1'],
        testRunIds: [],
        outcome: 'NOT_EVALUATED' as const,
        rationale: 'The approved scenario was outside this selective execution cycle.',
      },
    ],
    residualRisks: ['The correction must be verified in a new cycle.'],
    recommendations: ['Correct confirmation handling and rerun the scenario.'],
  }
}

function result(
  claim: Awaited<ReturnType<typeof claimQualityJourneyWork>>,
  reportRevisionId: string,
  contentHash: string,
) {
  return {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    assignmentId: claim.assignment.assignmentId,
    workItemId: claim.workItem.id,
    attemptId: claim.attempt.id,
    roleContractDigest: claim.assignment.roleDefinition.digest,
    inputHash: claim.workItem.inputHash,
    role: 'TRIAGER' as const,
    status: 'COMPLETED' as const,
    outputs: [
      {
        kind: 'TEST_REPORT_ANALYSIS_REVISION' as const,
        artifactId: reportRevisionId,
        revisionId: reportRevisionId,
        contentHash,
      },
    ],
    evidenceReceipts: [],
    assumptions: [],
    blockers: [],
    unresolvedQuestions: [],
    submittedAt: '2026-09-05T00:00:00.000Z',
  }
}

describe('Quality Journey triage service on migrated SQLite', () => {
  it('uses the specialized Factory-to-report ingress, replays exactly, and creates an immutable feedback successor', async () => {
    const value = await fixture()
    const prepared = await prepareQualityJourneyTriage(
      { journeyId: value.journeyId, targetProjectId: 'target-triage', executionCycleId: 'execution-triage' },
      value.client,
    )
    expect(prepared.assignments).toHaveLength(1)
    const assignment = prepared.assignments[0]!
    expect(assignment.input.scenarios.map(scenario => scenario.revisionId)).toEqual([
      'scenario-triage-r1',
      'scenario-unrun-r1',
    ])
    const claim = await claimQualityJourneyWork(
      { journeyId: value.journeyId, targetProjectId: 'target-triage', role: 'TRIAGER' },
      value.client,
    )
    adapterFor(claim.attempt.id, 'triage-adapter-1')
    await dispatchQualityJourneyWork(
      {
        journeyId: value.journeyId,
        targetProjectId: 'target-triage',
        workItemId: claim.workItem.id,
        leaseId: claim.attempt.leaseId,
        ownerToken: claim.ownerToken,
      },
      value.client,
    )
    const first = report(assignment.input, 'report-triage-r1')
    const firstHash = hash({ report: first, source: assignment.input })
    const promoted = {
      ...report(assignment.input, 'report-triage-promoted'),
      coverage: [
        report(assignment.input, 'report-triage-promoted').coverage[0]!,
        {
          ...report(assignment.input, 'report-triage-promoted').coverage[1]!,
          outcome: 'PASSED' as const,
        },
      ],
    }
    const promotedHash = hash({ report: promoted, source: assignment.input })
    await expect(
      submitQualityJourneyTriageReport(
        {
          journeyId: value.journeyId,
          targetProjectId: 'target-triage',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'report-submit-promoted',
          report: promoted,
          result: result(claim, promoted.reportRevisionId, promotedHash),
        },
        value.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    const submit = {
      journeyId: value.journeyId,
      targetProjectId: 'target-triage',
      workItemId: claim.workItem.id,
      attemptId: claim.attempt.id,
      leaseId: claim.attempt.leaseId,
      ownerToken: claim.ownerToken,
      idempotencyKey: 'report-submit-1',
      report: first,
      result: result(claim, first.reportRevisionId, firstHash),
    }
    expect(await submitQualityJourneyTriageReport(submit, value.client)).toMatchObject({
      reportRevisionId: 'report-triage-r1',
      replayed: false,
    })
    expect(await submitQualityJourneyTriageReport(submit, value.client)).toMatchObject({
      reportRevisionId: 'report-triage-r1',
      replayed: true,
    })
    await expect(
      submitQualityJourneyTriageReport({ ...submit, report: { ...first, summary: 'forged replay' } }, value.client),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      value.client.$executeRawUnsafe(
        `UPDATE "QualityJourneyTriageReport" SET "reportJson" = '{}' WHERE "id" = 'report-triage-r1'`,
      ),
    ).rejects.toThrow('Quality Journey triage history is immutable')

    const reviewed = await getQualityJourneyTriage(
      { journeyId: value.journeyId, targetProjectId: 'target-triage' },
      value.client,
    )
    const reviewInput = {
      journeyId: value.journeyId,
      targetProjectId: 'target-triage',
      reportRevisionId: first.reportRevisionId,
      expectedReportHash: reviewed.reports[0]!.contentHash,
      expectedStateHash: (await value.client.qualityJourney.findUniqueOrThrow({ where: { id: value.journeyId } }))
        .stateHash,
      idempotencyKey: 'report-review-1',
      feedback: 'Reassess the complete report with this feedback.',
    }
    await expect(
      requestQualityJourneyReportRevision(
        { ...reviewInput, expectedStateHash: digest('e'), idempotencyKey: 'report-review-stale' },
        value.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await requestQualityJourneyReportRevision(reviewInput, value.client)
    await expect(
      requestQualityJourneyReportRevision({ ...reviewInput, feedback: 'Forged different feedback.' }, value.client),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    const successor = await getQualityJourneyTriage(
      { journeyId: value.journeyId, targetProjectId: 'target-triage' },
      value.client,
    )
    expect(successor.assignments).toHaveLength(2)
    const next = successor.assignments[1]!
    const nextClaim = await claimQualityJourneyWork(
      { journeyId: value.journeyId, targetProjectId: 'target-triage', role: 'TRIAGER' },
      value.client,
    )
    adapterFor(nextClaim.attempt.id, 'triage-adapter-2')
    await dispatchQualityJourneyWork(
      {
        journeyId: value.journeyId,
        targetProjectId: 'target-triage',
        workItemId: nextClaim.workItem.id,
        leaseId: nextClaim.attempt.leaseId,
        ownerToken: nextClaim.ownerToken,
      },
      value.client,
    )
    const revision = report(next.input, 'report-triage-r2', first.reportRevisionId)
    const revisionHash = hash({ report: revision, source: next.input })
    expect(
      await submitQualityJourneyTriageReport(
        {
          journeyId: value.journeyId,
          targetProjectId: 'target-triage',
          workItemId: nextClaim.workItem.id,
          attemptId: nextClaim.attempt.id,
          leaseId: nextClaim.attempt.leaseId,
          ownerToken: nextClaim.ownerToken,
          idempotencyKey: 'report-submit-2',
          report: revision,
          result: result(nextClaim, revision.reportRevisionId, revisionHash),
        },
        value.client,
      ),
    ).toMatchObject({ reportRevisionId: 'report-triage-r2', replayed: false })
  })

  it('rejects generic Triager completion before it can bypass the specialized report boundary', async () => {
    const value = await fixture()
    await prepareQualityJourneyTriage(
      { journeyId: value.journeyId, targetProjectId: 'target-triage', executionCycleId: 'execution-triage' },
      value.client,
    )
    const assignment = (
      await getQualityJourneyTriage({ journeyId: value.journeyId, targetProjectId: 'target-triage' }, value.client)
    ).assignments[0]!
    await expect(
      completeQualityJourneyWork(
        {
          journeyId: value.journeyId,
          targetProjectId: 'target-triage',
          workItemId: assignment.workItemId,
          leaseId: 'generic-lease',
          ownerToken: 'generic-owner',
          result: {
            schemaVersion: 'appraise.quality-journey/v1',
            assignmentId: 'generic-assignment',
            workItemId: assignment.workItemId,
            attemptId: 'generic-attempt',
            roleContractDigest: digest('a'),
            inputHash: assignment.inputHash,
            role: 'TRIAGER',
            status: 'COMPLETED',
            outputs: [],
            evidenceReceipts: [],
            assumptions: [],
            blockers: [],
            unresolvedQuestions: [],
            submittedAt: '2026-09-05T00:00:00.000Z',
          },
        },
        value.client,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('rejects wrong target scope, stale input and result attempts, unsealed evidence, and generic triage commands', async () => {
    const value = await fixture()
    await expect(
      getQualityJourneyTriage({ journeyId: value.journeyId, targetProjectId: 'target-other' }, value.client),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      prepareQualityJourneyTriage(
        { journeyId: value.journeyId, targetProjectId: 'target-other', executionCycleId: 'execution-triage' },
        value.client,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await value.client.qualityJourneyExecutionCycle.update({
      where: { id: 'execution-triage' },
      data: { status: 'RUNNING' },
    })
    await expect(
      prepareQualityJourneyTriage(
        { journeyId: value.journeyId, targetProjectId: 'target-triage', executionCycleId: 'execution-triage' },
        value.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await value.client.qualityJourneyExecutionCycle.update({
      where: { id: 'execution-triage' },
      data: { status: 'COMPLETED' },
    })
    await value.client.qualityJourneyExecutionCycle.create({
      data: {
        id: 'execution-missing-evidence',
        journeyId: value.journeyId,
        targetProjectId: 'target-triage',
        cycleId: value.cycleId,
        preparedCapsulesJson: json([]),
        preparedCapsulesHash: hash([]),
        environmentId: 'environment-triage',
        environmentSnapshotJson: '{}',
        environmentSnapshotHash: digest('a'),
        environmentSnapshotVersion: 1,
        targetFingerprint: digest('b'),
        stateHash: value.stateHash,
        idempotencyKey: 'missing-evidence',
        requestHash: digest('c'),
        status: 'COMPLETED',
      },
    })
    await expect(
      prepareQualityJourneyTriage(
        {
          journeyId: value.journeyId,
          targetProjectId: 'target-triage',
          executionCycleId: 'execution-missing-evidence',
        },
        value.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    const prepared = await prepareQualityJourneyTriage(
      { journeyId: value.journeyId, targetProjectId: 'target-triage', executionCycleId: 'execution-triage' },
      value.client,
    )
    const assignment = prepared.assignments[0]!
    const claim = await claimQualityJourneyWork(
      { journeyId: value.journeyId, targetProjectId: 'target-triage', role: 'TRIAGER' },
      value.client,
    )
    adapterFor(claim.attempt.id, 'triage-negative-adapter')
    await dispatchQualityJourneyWork(
      {
        journeyId: value.journeyId,
        targetProjectId: 'target-triage',
        workItemId: claim.workItem.id,
        leaseId: claim.attempt.leaseId,
        ownerToken: claim.ownerToken,
      },
      value.client,
    )
    const stale = { ...report(assignment.input, 'report-stale-input'), inputHash: digest('d') }
    const staleHash = hash({ report: stale, source: assignment.input })
    await expect(
      submitQualityJourneyTriageReport(
        {
          journeyId: value.journeyId,
          targetProjectId: 'target-triage',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'stale-input',
          report: stale,
          result: result(claim, stale.reportRevisionId, staleHash),
        },
        value.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    const wrongAttempt = report(assignment.input, 'report-wrong-attempt')
    const wrongAttemptHash = hash({ report: wrongAttempt, source: assignment.input })
    await expect(
      submitQualityJourneyTriageReport(
        {
          journeyId: value.journeyId,
          targetProjectId: 'target-triage',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'wrong-attempt',
          report: wrongAttempt,
          result: { ...result(claim, wrongAttempt.reportRevisionId, wrongAttemptHash), attemptId: 'forged-attempt' },
        },
        value.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      submitQualityJourneyTriageReport(
        {
          journeyId: value.journeyId,
          targetProjectId: 'target-other',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'wrong-target-submit',
          report: wrongAttempt,
          result: result(claim, wrongAttempt.reportRevisionId, wrongAttemptHash),
        },
        value.client,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    for (const [command, payload] of [
      ['PUBLISH_TRIAGE_REPORT', { artifactRevisionId: 'report-1', artifactHash: digest('1') }],
      [
        'REQUEST_REPORT_REVISION',
        { reviewedRevisionId: 'report-1', reviewedHash: digest('1'), feedback: 'Revise the full report.' },
      ],
      ['CLOSE_JOURNEY', { closureId: 'closure-1', reportRevisionId: 'report-1', reportHash: digest('1') }],
    ] as const)
      await expect(
        submitDurableQualityJourneyCommand(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            command,
            commandId: `generic-${command}`,
            journeyId: value.journeyId,
            targetProjectId: 'target-triage',
            actor: 'USER',
            expectedStateHash: value.stateHash,
            idempotencyKey: `generic-${command}`,
            inputArtifactRefs: [],
            payload,
          },
          value.client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('keeps replacement Triager inputs exact and permits at most one concurrent publication', async () => {
    const value = await fixture()
    const prepared = await prepareQualityJourneyTriage(
      { journeyId: value.journeyId, targetProjectId: 'target-triage', executionCycleId: 'execution-triage' },
      value.client,
    )
    const assignment = prepared.assignments[0]!
    const firstClaim = await claimQualityJourneyWork(
      { journeyId: value.journeyId, targetProjectId: 'target-triage', role: 'TRIAGER' },
      value.client,
    )
    await value.client.qualityJourneyArtifact.create({
      data: {
        id: 'unrelated-artifact',
        identityKey: 'TARGET_OBSERVATION_BUNDLE:unrelated',
        journeyId: value.journeyId,
        targetProjectId: 'target-triage',
        cycleId: value.cycleId,
        kind: 'TARGET_OBSERVATION_BUNDLE',
        artifactId: 'unrelated',
        contentHash: digest('a'),
        artifactJson: '{}',
      },
    })
    await value.client.qualityJourneyWorkAttempt.update({
      where: { id: firstClaim.attempt.id },
      data: { status: 'LEASE_EXPIRED' },
    })
    await value.client.qualityJourneyWorkItem.update({
      where: { id: firstClaim.workItem.id },
      data: { status: 'REPLACEMENT_REQUESTED' },
    })
    const replacement = await claimQualityJourneyWork(
      { journeyId: value.journeyId, targetProjectId: 'target-triage', role: 'TRIAGER' },
      value.client,
    )
    expect(replacement.assignment.inputArtifacts).toEqual(firstClaim.assignment.inputArtifacts)
    expect(replacement.assignment.inputArtifacts.some(artifact => artifact.artifactId === 'unrelated')).toBe(false)
    adapterFor(replacement.attempt.id, 'triage-concurrent-adapter')
    await dispatchQualityJourneyWork(
      {
        journeyId: value.journeyId,
        targetProjectId: 'target-triage',
        workItemId: replacement.workItem.id,
        leaseId: replacement.attempt.leaseId,
        ownerToken: replacement.ownerToken,
      },
      value.client,
    )
    const submissions = ['report-concurrent-a', 'report-concurrent-b'].map(reportRevisionId => {
      const candidate = report(assignment.input, reportRevisionId)
      return submitQualityJourneyTriageReport(
        {
          journeyId: value.journeyId,
          targetProjectId: 'target-triage',
          workItemId: replacement.workItem.id,
          attemptId: replacement.attempt.id,
          leaseId: replacement.attempt.leaseId,
          ownerToken: replacement.ownerToken,
          idempotencyKey: reportRevisionId,
          report: candidate,
          result: result(replacement, reportRevisionId, hash({ report: candidate, source: assignment.input })),
        },
        value.client,
      )
    })
    const outcomes = await Promise.allSettled(submissions)
    expect(outcomes.some(outcome => outcome.status === 'fulfilled')).toBe(true)
    expect(
      await value.client.qualityJourneyTriageReport.count({ where: { journeyId: value.journeyId } }),
    ).toBeLessThanOrEqual(1)
  })

  it('claims the active specialized Triager instead of an older eligible item from a previous cycle', async () => {
    const value = await fixture()
    await value.client.qualityJourneyCycle.create({
      data: { id: 'cycle-triage-old', journeyId: value.journeyId, sequence: 0, scopeJson: '{}' },
    })
    await value.client.qualityJourneyWorkItem.create({
      data: {
        id: 'triager-old-eligible',
        journeyId: value.journeyId,
        targetProjectId: 'target-triage',
        cycleId: 'cycle-triage-old',
        role: 'TRIAGER',
        status: 'ELIGIBLE',
        inputHash: digest('a'),
        roleContractDigest: digest('b'),
      },
    })
    const prepared = await prepareQualityJourneyTriage(
      { journeyId: value.journeyId, targetProjectId: 'target-triage', executionCycleId: 'execution-triage' },
      value.client,
    )
    const current = prepared.assignments[0]!
    const claim = await claimQualityJourneyWork(
      { journeyId: value.journeyId, targetProjectId: 'target-triage', role: 'TRIAGER' },
      value.client,
    )
    expect(claim.workItem.id).toBe(current.workItemId)
    expect(claim.workItem.id).not.toBe('triager-old-eligible')
  })
})
