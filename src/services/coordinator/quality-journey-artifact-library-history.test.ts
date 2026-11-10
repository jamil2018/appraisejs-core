import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

// Unit seams only: no PrismaClient constructor, SQLite, provider, or runtime source-use machinery.
vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('@prisma/client', () => ({
  Prisma: { sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }) },
}))
vi.mock('./quality-journey-artifact-metadata', () => ({ qualityJourneyArtifactMetadataSql: () => ({ metadata: true }) }))

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { qualityJourneyContractVersion } from '@/lib/quality-journey/contracts'
import {
  automationTargetBindingSchema,
  hashAutomationMaterialization as hash,
  hashAutomationTargetBinding,
} from '@/lib/quality-journey/automation-contracts'
import {
  M06_MATERIALIZATION_ARTIFACT_VERSION,
  reconstructMaterializationSource,
} from '@/lib/quality-journey/materialization-source-contract'
import {
  exportQualityJourney,
  getQualityJourneyLibraryArtifact,
  listQualityJourneyArtifactLibrary,
  type QualityJourneyArtifactLibraryEntry,
} from './quality-journey-artifact-library-service'

const scope = { journeyId: 'journey-1', targetProjectId: 'target-1' }
const when = new Date('2026-10-20T00:00:00.000Z')
const representation = 'M06_MATERIALIZATION_HISTORY_V1'

function retained(suffix = '1', options: { invocation?: string; caseId?: string; moduleId?: string } = {}) {
  const key = (kind: string) => `${kind}-${suffix}`
  const proposal = {
    scenarioRevisionId: key('scenario'),
    steps: [{
      sourceScenarioStepId: key('step'),
      stepDefinition: { id: 'definition-1', version: '1', definitionHash: hash('definition') },
      operation: { id: 'operation-1', version: '1', handler: { id: 'handler-1', version: '1', contentHash: hash('handler') } },
      parameters: [{ name: 'value', type: 'string', value: 'private-parameter-value' }],
      testData: [{ key: 'private-key', type: 'string', value: 'private-test-data' }],
      locatorRequirements: [{ requirementId: 'requirement-1', parameterName: 'locator', locatorId: 'private-locator-id' }],
    }],
  }
  const packet = automationTargetBindingSchema.parse({
    schemaVersion: qualityJourneyContractVersion,
    targetProjectId: scope.targetProjectId,
    moduleId: options.moduleId ?? 'module-1',
    suite: { id: 'suite-1', name: 'Frozen suite', description: null },
    testCase: { id: options.caseId ?? 'case-1', title: 'Frozen case', description: 'Frozen case description',
      steps: [{ order: 0, gherkinStep: 'Given frozen behavior', label: 'Given', icon: 'step',
        invocationJson: options.invocation ?? '{"value":"private-invocation-value"}' }],
    },
  })
  const manifest = {
    schemaVersion: qualityJourneyContractVersion, kind: 'PREPARED_RUNTIME_CAPSULE',
    materializationId: key('materialization'), sourceScenarioRevisionId: proposal.scenarioRevisionId,
    sourceScenarioContentHash: hash(key('scenario-content')), suiteId: packet.suite.id, testCaseId: packet.testCase.id,
    steps: proposal.steps.map(({ sourceScenarioStepId, stepDefinition, ...step }) =>
      ({ ...step, stepId: sourceScenarioStepId, definition: stepDefinition })),
    dataRequirements: proposal.steps.flatMap(step => step.testData),
    locatorRequirements: proposal.steps.flatMap(step => step.locatorRequirements),
    decision: { id: key('decision'), contentHash: hash(key('decision-content')) },
    portfolioRevisionId: key('portfolio'), portfolioHash: hash(key('portfolio-content')),
  }
  const source = {
    id: key('materialization'), ...scope, cycleId: 'old-cycle',
    scenarioRevisionId: proposal.scenarioRevisionId, scenarioContentHash: manifest.sourceScenarioContentHash,
    portfolioRevisionId: manifest.portfolioRevisionId, portfolioContentHash: manifest.portfolioHash,
    decisionId: manifest.decision.id, decisionHash: manifest.decision.contentHash,
    workItemId: key('work'), attemptId: key('attempt'), leaseId: key('lease'), inputHash: hash(key('input')),
    materializationHash: hash({ ...scope, expectedInputHash: hash(key('input')), expectedScopeHash: hash(key('scope')),
      workItemId: key('work'), attemptId: key('attempt'), leaseId: key('lease'), scenario: proposal }),
    sourceProofVersion: M06_MATERIALIZATION_ARTIFACT_VERSION as string, status: 'MATERIALIZED', failureKind: null,
    suiteId: packet.suite.id, testCaseId: packet.testCase.id, artifactRecordId: key('artifact'),
    artifactJson: canonicalContractJson(manifest), createdAt: when,
  }
  const binding = {
    id: key('binding'), journeyId: 'original-binding-owner', targetProjectId: scope.targetProjectId,
    suiteId: packet.suite.id, testCaseId: packet.testCase.id,
    suiteHash: hash({ targetProjectId: packet.targetProjectId, moduleId: packet.moduleId, suite: packet.suite }),
    testCaseHash: hashAutomationTargetBinding(packet), stepHash: hash(packet.testCase.steps),
    semanticHash: hash({ schemaVersion: packet.schemaVersion, targetProjectId: packet.targetProjectId, moduleId: packet.moduleId,
      suite: { name: packet.suite.name, description: packet.suite.description },
      testCase: { title: packet.testCase.title, description: packet.testCase.description, steps: packet.testCase.steps } }),
    bindingJson: canonicalContractJson(packet),
  }
  const association = { materializationId: source.id, bindingId: binding.id }
  const proof = { materializationId: source.id, expectedScopeHash: hash(key('scope')),
    reconstructionVersion: M06_MATERIALIZATION_ARTIFACT_VERSION }
  const artifact = { id: source.artifactRecordId, ...scope, cycleId: source.cycleId, kind: 'RUNTIME_CAPSULE',
    artifactId: source.id, contentHash: hash(manifest), artifactJson: source.artifactJson }
  const attempt = { id: source.attemptId, workItemId: source.workItemId, leaseId: source.leaseId,
    authorizationId: key('authorization'), assignmentId: key('assignment'), assignmentGeneration: 1 }
  const work = { id: source.workItemId, ...scope, cycleId: source.cycleId, role: 'AUTOMATOR', inputHash: source.inputHash }
  const authorization = { id: attempt.authorizationId, ...scope, workItemId: source.workItemId, role: 'AUTOMATOR' }
  const sessionBinding = { attemptId: attempt.id, ...scope, sessionId: key('session'), coordinatorGeneration: 7,
    assignmentGeneration: attempt.assignmentGeneration, workItemId: source.workItemId, role: 'AUTOMATOR',
    authorizationId: attempt.authorizationId, leaseId: source.leaseId, inputHash: source.inputHash,
    assignmentId: attempt.assignmentId, provenance: 'CLAIM_SESSION_V1' }
  const session = { id: key('session'), ...scope, generation: 7,
    e2EnrollmentKind: 'E2_V1', e2EnrollmentDigest: 'a'.repeat(64), e2EnrolledAt: when }
  return { packet, source, binding, association, proof, artifact, attempt, work, authorization, sessionBinding, session }
}

type Retained = ReturnType<typeof retained>
function database(fixtures: Retained[] = [retained()]) {
  const state = {
    fixtures,
    sources: fixtures.map(item => item.source),
    associations: fixtures.map(item => item.association),
    orphan: false,
    journey: { id: scope.journeyId, targetProjectId: scope.targetProjectId,
      status: 'PAUSED', stage: 'CLOSED', activeCycleId: 'replacement-cycle' },
    liveSuites: [{ id: 'suite-1', targetProjectId: scope.targetProjectId, name: 'Current suite',
      description: 'Current suite description', createdAt: when }],
    liveCases: [{ id: 'case-1', targetProjectId: scope.targetProjectId, title: 'Current case',
      description: 'Current case description', createdAt: when }],
  }
  const forbidden = () => vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => {
    throw new Error('unexpected live resource or write read')
  })
  const client = {
    qualityJourney: { findFirst: vi.fn(async () => state.journey as typeof state.journey | null) },
    qualityJourneyAutomationMaterialization: { findMany: vi.fn(async (args: {
      where: { journeyId: string; targetProjectId: string; suiteId?: string; testCaseId?: string; id?: string };
      take?: number; orderBy?: { id?: string; createdAt?: string }
    }) => {
      const rows = state.sources.filter(row => row.journeyId === args.where.journeyId && row.targetProjectId === args.where.targetProjectId &&
        (!args.where.suiteId || row.suiteId === args.where.suiteId) &&
        (!args.where.testCaseId || row.testCaseId === args.where.testCaseId) &&
        (!args.where.id || row.id === args.where.id))
      return (args.orderBy?.id ? [...rows].sort((a, b) => a.id.localeCompare(b.id)) : rows).slice(0, args.take)
    }) },
    qualityJourneyWorkAttempt: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      fixtures.find(item => item.attempt.id === where.id)?.attempt ?? null) },
    qualityJourneyWorkItem: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      fixtures.find(item => item.work.id === where.id)?.work ?? null) },
    qualityJourneyWorkAuthorization: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      fixtures.find(item => item.authorization.id === where.id)?.authorization ?? null) },
    qualityJourneyWorkAttemptSessionBinding: { findUnique: vi.fn(async ({ where }: { where: { attemptId: string } }) =>
      fixtures.find(item => item.sessionBinding.attemptId === where.attemptId)?.sessionBinding ?? null) },
    qualityJourneyCoordinatorSession: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      fixtures.find(item => item.session.id === where.id)?.session ?? null) },
    qualityJourneyE2Retirement: { findFirst: vi.fn(async () => state.orphan ? { id: 'retirement-1' } : null) },
    qualityJourneyAutomationMaterializationSourceProof: { findUnique: vi.fn(async ({ where }: { where: { materializationId: string } }) =>
      fixtures.find(item => item.proof.materializationId === where.materializationId)?.proof ?? null) },
    qualityJourneyAutomationMaterializationBinding: { findMany: vi.fn(async ({ where, take }: {
      where: { materializationId: string }; take: number
    }) => state.associations.filter(row => row.materializationId === where.materializationId).slice(0, take)) },
    qualityJourneyAutomationTargetBinding: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      fixtures.find(item => item.binding.id === where.id)?.binding ?? null) },
    qualityJourneyArtifact: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => fixtures.find(item => item.artifact.id === where.id)?.artifact ?? null),
    },
    testSuite: { findMany: forbidden() }, testCase: { findMany: forbidden() },
    locator: { findMany: forbidden(), findUnique: forbidden() },
    stepDefinition: { findMany: forbidden(), findUnique: forbidden() },
    qualityJourneySharedResourceUse: { findMany: forbidden(), create: forbidden(), update: forbidden() },
    qualityJourneySharedResourceClaim: { findMany: forbidden(), create: forbidden(), update: forbidden() },
    $queryRaw: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []),
    $executeRaw: forbidden(), $transaction: forbidden(),
  }
  const emptyModels = [
    'qualityJourneyRevision', 'qualityJourneyArtifactLink', 'qualityJourneyCycle', 'qualityJourneyAnalysisRevision',
    'qualityJourneyDiscoveryRevision', 'qualityJourneyScenarioPortfolioRevision', 'qualityJourneyScenarioRevision',
    'qualityJourneyScenarioDecision', 'qualityJourneyScenarioReviewComment', 'qualityJourneyScenarioDecisionReceipt',
    'qualityJourneyAnalysisDecision', 'qualityJourneyAnalysisPublication', 'qualityJourneyPreparedRuntimeCapsule',
    'qualityJourneyExecutionCycle', 'qualityJourneyExecutionTestRun', 'qualityJourneyExecutionEvidenceReceipt',
    'qualityJourneyTriageReport', 'qualityJourneyReportReview', 'qualityJourneyExecutionRerunProposal',
    'qualityJourneyExecutionConsent', 'qualityJourneyExecutionCancellationReceipt', 'qualityJourneyBlocker', 'qualityJourneyClosure',
  ]
  const extra = Object.fromEntries(emptyModels.map(name => [name, { findMany: vi.fn(async () => []) }]))
  const db = { ...client, ...extra } as unknown as PrismaClient
  return { state, client, db }
}

function assertNoLiveReads(client: ReturnType<typeof database>['client']) {
  for (const model of [client.testSuite, client.testCase, client.locator, client.stepDefinition,
    client.qualityJourneySharedResourceUse, client.qualityJourneySharedResourceClaim]) {
    for (const method of Object.values(model)) expect(method).not.toHaveBeenCalled()
  }
  expect(client.$executeRaw).not.toHaveBeenCalled()
  expect(client.$transaction).not.toHaveBeenCalled()
  expect(client.$queryRaw).not.toHaveBeenCalled()
}

async function detail(harness: ReturnType<typeof database>, entryId = 'TEST_CASE:case-1') {
  return (await getQualityJourneyLibraryArtifact({ ...scope, entryId }, harness.db)).entry
}

function refused(entry: QualityJourneyArtifactLibraryEntry, reasonCode: string) {
  expect(entry.contentHash).toBeNull()
  expect(entry.sourceContentHash).toBeNull()
  expect(entry.title).toMatch(/history unavailable$/)
  expect(entry.data).toEqual({ status: 'REFUSED_FROZEN_HISTORY', representation,
    reasonCode, sourceRepresentation: 'UNAVAILABLE' })
  expect(entry.projectionHash).toBe(hash({ entryId: entry.entryId, kind: entry.kind, artifactId: entry.artifactId,
    revisionId: entry.revisionId, sourceContentHash: null, cycleId: entry.cycleId, lineage: entry.lineage, data: entry.data }))
}

function legacySession(fixture: Retained) {
  Object.assign(fixture.session, { e2EnrollmentKind: null, e2EnrollmentDigest: null, e2EnrolledAt: null })
}

function explicitLegacy(fixture: Retained) {
  Object.assign(fixture.sessionBinding, { sessionId: null, coordinatorGeneration: null,
    provenance: 'CLAIM_EXPLICIT_LEGACY_NO_SESSION_V1' })
}

describe('materialized library immutable history (database delegates are unit mocks)', () => {
  it('constructs a valid real pure source proof before exercising the library', () => {
    const fixture = retained()
    expect(reconstructMaterializationSource({ materialization: fixture.source, proof: fixture.proof, artifact: fixture.artifact,
      materializationBindings: [fixture.association], targetBindings: [fixture.binding] }).sourceHash).toBe(fixture.source.materializationHash)
  })

  it.each(['changed', 'deleted'] as const)('reads frozen Case and Suite bytes after live roots are %s', async liveState => {
    const fixture = retained()
    const harness = database([fixture])
    if (liveState === 'deleted') { harness.state.liveSuites = []; harness.state.liveCases = [] }
    const caseEntry = await detail(harness)
    const suiteEntry = await detail(harness, 'TEST_SUITE:suite-1')
    expect(caseEntry.title).toBe('Frozen case')
    expect(caseEntry.sourceContentHash).toBe(fixture.binding.testCaseHash)
    expect(suiteEntry.title).toBe('Frozen suite')
    expect(suiteEntry.sourceContentHash).toBe(fixture.binding.suiteHash)
    expect(caseEntry.data).toMatchObject({ status: 'FROZEN_HISTORY', representation,
      description: 'Frozen case description', sourceRepresentation: 'CANONICAL_TARGET_BINDING_PACKET',
      timestampBasis: 'EARLIEST_SCOPED_MATERIALIZATION' })
    expect(suiteEntry.data).toMatchObject({ description: null, sourceRepresentation: 'SUITE_CANONICAL_PACKET' })
    expect(caseEntry.createdAt).toEqual(when)
    expect(caseEntry.cycleId).toBeNull()
    expect(caseEntry.revisionId).toBeNull()
    assertNoLiveReads(harness.client)
  })

  it('ignores current lifecycle/session/claim state and never exposes raw retained values', async () => {
    const fixture = retained()
    Object.assign(fixture.session, { status: 'FENCED', fencedAt: when, ownerPrincipalId: 'private-principal' })
    Object.assign(fixture.source, { ownerTokenHash: 'private-token-hash' })
    const harness = database([fixture])
    Object.assign(harness.state.journey, { currentCoordinatorSessionId: 'other-session', e2EnrollmentKind: null })
    harness.state.orphan = true // E2 enrollment remains historical even after retirement.
    const entry = await detail(harness)
    expect(entry.data).toMatchObject({ status: 'FROZEN_HISTORY' })
    const text = JSON.stringify(entry)
    for (const raw of ['private-invocation-value', 'private-parameter-value', 'private-test-data', 'private-locator-id',
      'private-token-hash', 'private-principal', fixture.source.artifactJson, fixture.binding.bindingJson, fixture.session.id,
      fixture.session.e2EnrollmentDigest, 'invocationJson', 'parameters', 'ownerToken', 'principal']) expect(text).not.toContain(raw)
    expect(harness.client.qualityJourneyE2Retirement.findFirst).not.toHaveBeenCalled()
    assertNoLiveReads(harness.client)
  })

  it.each(['semanticHash', 'suiteHash', 'testCaseHash', 'stepHash'] as const)('refuses a corrupt rich %s', async field => {
    const fixture = retained()
    fixture.binding[field] = hash('wrong')
    const harness = database([fixture])
    refused(await detail(harness), 'FROZEN_BINDING_CORRUPT_OR_HASH_MISMATCH')
    assertNoLiveReads(harness.client)
  })

  it.each(['invalid-json', 'noncanonical', 'null-case-description', 'wrong-root'] as const)('refuses binding bytes: %s', async fault => {
    const fixture = retained()
    if (fault === 'invalid-json') fixture.binding.bindingJson = '{'
    if (fault === 'noncanonical') fixture.binding.bindingJson = ` ${fixture.binding.bindingJson}`
    if (fault === 'null-case-description') fixture.binding.bindingJson = canonicalContractJson({ ...fixture.packet,
      testCase: { ...fixture.packet.testCase, description: null } })
    if (fault === 'wrong-root') fixture.binding.bindingJson = canonicalContractJson({ ...fixture.packet, moduleId: 'foreign-module' })
    const harness = database([fixture])
    refused(await detail(harness), 'FROZEN_BINDING_CORRUPT_OR_HASH_MISMATCH')
    assertNoLiveReads(harness.client)
  })

  it.each(['proof', 'artifact', 'association', 'binding', 'status', 'version', 'materialization-hash', 'artifact-hash', 'association-endpoint'] as const)(
    'refuses missing or invalid complete source: %s', async fault => {
      const fixture = retained()
      const harness = database([fixture])
      if (fault === 'proof') harness.client.qualityJourneyAutomationMaterializationSourceProof.findUnique.mockResolvedValue(null)
      if (fault === 'artifact') harness.client.qualityJourneyArtifact.findUnique.mockResolvedValue(null)
      if (fault === 'association') harness.state.associations = []
      if (fault === 'binding') harness.client.qualityJourneyAutomationTargetBinding.findUnique.mockResolvedValue(null)
      if (fault === 'status') fixture.source.status = 'FAILED'
      if (fault === 'version') fixture.source.sourceProofVersion = 'UNSUPPORTED'
      if (fault === 'materialization-hash') fixture.source.materializationHash = hash('wrong')
      if (fault === 'artifact-hash') fixture.artifact.contentHash = hash('wrong')
      if (fault === 'association-endpoint') harness.client.qualityJourneyAutomationMaterializationBinding.findMany.mockResolvedValue([
        { materializationId: 'foreign-source', bindingId: fixture.binding.id },
      ])
      refused(await detail(harness), 'FROZEN_SOURCE_MISSING_OR_UNSUPPORTED')
      assertNoLiveReads(harness.client)
    })

  it('does not select a passing association when another endpoint is retained', async () => {
    const first = retained()
    const second = retained('2')
    const harness = database([first, second])
    harness.state.associations.push({ materializationId: first.source.id, bindingId: second.binding.id })
    refused(await detail(harness), 'FROZEN_SOURCE_MISSING_OR_UNSUPPORTED')
    expect(harness.client.qualityJourneyAutomationTargetBinding.findUnique).toHaveBeenCalledWith({ where: { id: first.binding.id } })
    expect(harness.client.qualityJourneyAutomationTargetBinding.findUnique).toHaveBeenCalledWith({ where: { id: second.binding.id } })
    assertNoLiveReads(harness.client)
  })

  it.each(['attempt', 'work', 'authorization', 'session-binding'] as const)('refuses missing original %s', async fault => {
    const harness = database()
    if (fault === 'attempt') harness.client.qualityJourneyWorkAttempt.findUnique.mockResolvedValue(null)
    if (fault === 'work') harness.client.qualityJourneyWorkItem.findUnique.mockResolvedValue(null)
    if (fault === 'authorization') harness.client.qualityJourneyWorkAuthorization.findUnique.mockResolvedValue(null)
    if (fault === 'session-binding') harness.client.qualityJourneyWorkAttemptSessionBinding.findUnique.mockResolvedValue(null)
    refused(await detail(harness), 'HISTORICAL_LINEAGE_UNPROVEN')
    assertNoLiveReads(harness.client)
  })

  it.each(['foreign-work', 'wrong-cycle', 'wrong-role', 'foreign-authorization', 'assignment', 'assignment-generation', 'lease', 'input'] as const)(
    'refuses contradictory historical lineage: %s', async fault => {
      const fixture = retained()
      if (fault === 'foreign-work') fixture.work.journeyId = 'other-journey'
      if (fault === 'wrong-cycle') fixture.work.cycleId = 'other-cycle'
      if (fault === 'wrong-role') fixture.work.role = 'SCOUT'
      if (fault === 'foreign-authorization') fixture.authorization.targetProjectId = 'other-target'
      if (fault === 'assignment') fixture.sessionBinding.assignmentId = 'other-assignment'
      if (fault === 'assignment-generation') fixture.sessionBinding.assignmentGeneration++
      if (fault === 'lease') fixture.attempt.leaseId = 'other-lease'
      if (fault === 'input') fixture.sessionBinding.inputHash = hash('other-input')
      const harness = database([fixture])
      refused(await detail(harness), 'HISTORICAL_LINEAGE_UNPROVEN')
      assertNoLiveReads(harness.client)
    })

  it.each(['missing-session', 'generation', 'foreign-session', 'half-null', 'missing-provenance', 'partial-enrollment', 'bad-digest', 'bad-date', 'orphan'] as const)(
    'refuses unproven original enrollment: %s', async fault => {
      const fixture = retained()
      const harness = database([fixture])
      if (fault === 'missing-session') harness.client.qualityJourneyCoordinatorSession.findUnique.mockResolvedValue(null)
      if (fault === 'generation') fixture.session.generation++
      if (fault === 'foreign-session') fixture.session.journeyId = 'other-journey'
      if (fault === 'half-null') Object.assign(fixture.sessionBinding, { sessionId: null })
      if (fault === 'missing-provenance') fixture.sessionBinding.provenance = 'UNSUPPORTED'
      if (fault === 'partial-enrollment') Object.assign(fixture.session, { e2EnrolledAt: null })
      if (fault === 'bad-digest') fixture.session.e2EnrollmentDigest = hash('prefixed-digest-is-not-enrollment')
      if (fault === 'bad-date') fixture.session.e2EnrolledAt = new Date('invalid')
      if (fault === 'orphan') { legacySession(fixture); harness.state.orphan = true }
      refused(await detail(harness), 'ENROLLMENT_PROVENANCE_UNPROVEN')
      assertNoLiveReads(harness.client)
    })

  it.each(['qualityJourneyWorkAttemptSessionBinding', 'qualityJourneyCoordinatorSession',
    'qualityJourneyAutomationMaterializationSourceProof', 'qualityJourneyAutomationMaterializationBinding',
    'qualityJourneyAutomationTargetBinding'] as const)('refuses unavailable historical query model %s', async model => {
    const harness = database()
    Reflect.deleteProperty(harness.db, model)
    refused(await detail(harness), 'HISTORY_QUERY_CAPABILITY_UNAVAILABLE')
    assertNoLiveReads(harness.client)
  })

  it('does not hide a second unknown source behind a passing E2 source', async () => {
    const first = retained()
    const second = retained('2')
    second.sessionBinding.provenance = 'UNKNOWN'
    const harness = database([first, second])
    refused(await detail(harness), 'ENROLLMENT_PROVENANCE_UNPROVEN')
    expect(harness.client.qualityJourneyWorkAttemptSessionBinding.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { attemptId: second.source.attemptId } }))
    assertNoLiveReads(harness.client)
  })

  it('verifies every source in mixed E2/legacy history and does not drop a broken legacy proof', async () => {
    const first = retained()
    const second = retained('2')
    explicitLegacy(second)
    const harness = database([first, second])
    expect((await detail(harness)).data).toMatchObject({ status: 'FROZEN_HISTORY', sources: [
      expect.objectContaining({ materializationId: first.source.id }), expect.objectContaining({ materializationId: second.source.id }),
    ] })
    second.proof.expectedScopeHash = hash('wrong')
    refused(await detail(harness), 'FROZEN_SOURCE_MISSING_OR_UNSUPPORTED')
    assertNoLiveReads(harness.client)
  })

  it('accepts identical Suite packets with independently valid different Case portions', async () => {
    const first = retained()
    const second = retained('2', { caseId: 'case-2', invocation: '{"changed":"private-other-invocation"}' })
    second.source.createdAt = new Date('2026-10-19T00:00:00.000Z')
    const harness = database([second, first])
    const entry = await detail(harness, 'TEST_SUITE:suite-1')
    expect(entry.contentHash).toBe(first.binding.suiteHash)
    expect(entry.createdAt).toEqual(second.source.createdAt)
    expect(entry.lineage.materializedBy).toBe('materialization-1,materialization-2')
    expect(entry.data).toMatchObject({ status: 'FROZEN_HISTORY', sources: [
      expect.objectContaining({ bindingId: first.binding.id }), expect.objectContaining({ bindingId: second.binding.id }),
    ] })
    assertNoLiveReads(harness.client)
  })

  it.each(['steps', 'module'] as const)('refuses Case versions differing only in frozen %s with identical public text', async variant => {
    const first = retained()
    const second = retained('2', variant === 'steps' ? { invocation: '{"other":"private-value"}' } : { moduleId: 'module-2' })
    const harness = database([first, second])
    expect(first.packet.testCase.title).toBe(second.packet.testCase.title)
    refused(await detail(harness), 'AMBIGUOUS_FROZEN_VERSIONS')
    assertNoLiveReads(harness.client)
  })

  it.each(['no-session', 'retained-session'] as const)('preserves positively proven %s legacy live inspection', async mode => {
    const fixture = retained()
    if (mode === 'no-session') explicitLegacy(fixture)
    else legacySession(fixture)
    const harness = database([fixture])
    harness.client.testCase.findMany.mockImplementation(async () => harness.state.liveCases)
    harness.client.testSuite.findMany.mockImplementation(async () => harness.state.liveSuites)
    const entry = await detail(harness)
    expect(entry.title).toBe('Current case')
    expect(entry.data).toEqual({ description: 'Current case description' })
    expect(entry.sourceContentHash).toBeNull()
    expect(harness.client.qualityJourneyAutomationMaterializationSourceProof.findUnique).not.toHaveBeenCalled()
    expect(harness.client.testSuite.findMany).not.toHaveBeenCalled()
    expect(harness.client.testCase.findMany).toHaveBeenCalledWith({ where: { id: { in: ['case-1'] }, targetProjectId: scope.targetProjectId } })
    harness.state.liveCases = []
    await expect(detail(harness)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses an all-null retained session when retirement enumeration is unavailable', async () => {
    const fixture = retained()
    legacySession(fixture)
    const harness = database([fixture])
    Reflect.deleteProperty(harness.db, 'qualityJourneyE2Retirement')
    refused(await detail(harness), 'HISTORY_QUERY_CAPABILITY_UNAVAILABLE')
    assertNoLiveReads(harness.client)
  })

  it('does not treat omitted enrollment fields as an all-null legacy tuple', async () => {
    const fixture = retained()
    legacySession(fixture)
    Reflect.deleteProperty(fixture.session, 'e2EnrollmentDigest')
    const harness = database([fixture])
    refused(await detail(harness), 'ENROLLMENT_PROVENANCE_UNPROVEN')
    assertNoLiveReads(harness.client)
  })

  it('does not infer explicit no-session legacy from missing provenance', async () => {
    const fixture = retained()
    explicitLegacy(fixture)
    fixture.sessionBinding.provenance = 'UNKNOWN'
    const harness = database([fixture])
    refused(await detail(harness), 'ENROLLMENT_PROVENANCE_UNPROVEN')
    assertNoLiveReads(harness.client)
  })

  it('ignores foreign Journey sources even when they reference the same root and binding', async () => {
    const first = retained()
    const foreign = retained('foreign')
    foreign.source.journeyId = 'other-journey'
    foreign.source.status = 'FAILED'
    foreign.association.bindingId = first.binding.id
    const harness = database([first, foreign])
    const entry = await detail(harness)
    expect(entry.data).toMatchObject({ status: 'FROZEN_HISTORY', sources: [expect.objectContaining({ materializationId: first.source.id })] })
    expect(JSON.stringify(entry)).not.toContain(foreign.source.id)
    expect(harness.client.qualityJourneyWorkAttempt.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: foreign.source.attemptId } }))
    assertNoLiveReads(harness.client)
  })

  it('refuses a take4097 source sentinel without inspecting a passing subset', async () => {
    const harness = database()
    harness.state.sources = Array.from({ length: 4097 }, (_, i) => ({ ...retained().source, id: `materialization-${i}` }))
    refused(await detail(harness), 'HISTORY_SOURCE_BOUNDS_EXCEEDED')
    expect(harness.client.qualityJourneyWorkAttempt.findUnique).not.toHaveBeenCalled()
    expect(harness.client.qualityJourneyAutomationMaterialization.findMany).toHaveBeenCalledWith({
      where: { ...scope, testCaseId: 'case-1' }, orderBy: { id: 'asc' }, take: 4097,
    })
    assertNoLiveReads(harness.client)
  })

  it('refuses a take4097 association sentinel and oversized binding bytes', async () => {
    const fixture = retained()
    const harness = database([fixture])
    harness.state.associations = Array.from({ length: 4097 }, (_, i) => ({ materializationId: fixture.source.id, bindingId: `binding-${i}` }))
    refused(await detail(harness), 'HISTORY_SOURCE_BOUNDS_EXCEEDED')
    harness.state.associations = [fixture.association]
    fixture.binding.bindingJson = 'x'.repeat(1_048_577)
    refused(await detail(harness), 'HISTORY_SOURCE_BOUNDS_EXCEEDED')
    assertNoLiveReads(harness.client)
  })

  it.each(['depth', 'nodes'] as const)('refuses canonical binding %s overflow before schema projection', async fault => {
    const fixture = retained()
    fixture.binding.bindingJson = fault === 'depth'
      ? '['.repeat(34) + '0' + ']'.repeat(34)
      : '[' + Array.from({ length: 65_536 }, () => '0').join(',') + ']'
    const harness = database([fixture])
    refused(await detail(harness), 'HISTORY_SOURCE_BOUNDS_EXCEEDED')
    assertNoLiveReads(harness.client)
  })

  it('does not turn export enumeration or retained query infrastructure failures into a partial manifest', async () => {
    const harness = database()
    const fault = new Error('enumeration unavailable')
    harness.client.qualityJourneyAutomationMaterialization.findMany.mockRejectedValueOnce(fault)
    await expect(exportQualityJourney(scope, harness.db)).rejects.toBe(fault)
    harness.client.qualityJourneyAutomationMaterializationSourceProof.findUnique.mockRejectedValueOnce(fault)
    await expect(exportQualityJourney(scope, harness.db)).rejects.toBe(fault)
    assertNoLiveReads(harness.client)
  })

  it('propagates scope, enumeration, source-query and indispensable metadata faults', async () => {
    const harness = database()
    const fault = new Error('infrastructure unavailable')
    harness.client.qualityJourneyAutomationMaterialization.findMany.mockRejectedValueOnce(fault)
    await expect(detail(harness)).rejects.toBe(fault)
    harness.client.qualityJourneyAutomationMaterializationBinding.findMany.mockRejectedValueOnce(fault)
    await expect(detail(harness)).rejects.toBe(fault)
    harness.state.sources[0].createdAt = new Date('invalid')
    await expect(detail(harness)).rejects.toMatchObject({ code: 'CONFLICT' })
    harness.client.qualityJourney.findFirst.mockResolvedValueOnce(null)
    await expect(detail(harness)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    assertNoLiveReads(harness.client)
  })

  it('keeps unknown scoped roots NOT_FOUND while preserving deleted protected roots', async () => {
    const harness = database()
    await expect(detail(harness, 'TEST_CASE:unrelated')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await detail(harness)).data).toMatchObject({ status: 'FROZEN_HISTORY' })
    assertNoLiveReads(harness.client)
  })

  it('keeps detail/projection/export hashes distinct and exports frozen, legacy and refusal entries', async () => {
    const frozen = retained()
    const legacy = retained('legacy', { caseId: 'legacy-case' })
    legacy.source.suiteId = 'legacy-suite'
    explicitLegacy(legacy)
    const broken = retained('broken', { caseId: 'broken-case' })
    broken.sessionBinding.provenance = 'UNKNOWN'
    const harness = database([frozen, legacy, broken])
    harness.client.testSuite.findMany.mockImplementation(async () => [{ ...harness.state.liveSuites[0], id: 'legacy-suite' }])
    harness.client.testCase.findMany.mockImplementation(async () => [{ ...harness.state.liveCases[0], id: 'legacy-case' }])
    const entry = await detail(harness)
    expect(entry.sourceContentHash).toBe(hash(frozen.packet))
    expect(entry.contentHash).toBe(entry.sourceContentHash)
    expect(entry.projectionHash).toBe(hash({ entryId: entry.entryId, kind: entry.kind, artifactId: entry.artifactId,
      revisionId: entry.revisionId, sourceContentHash: entry.sourceContentHash, cycleId: entry.cycleId, lineage: entry.lineage, data: entry.data }))
    expect(entry.projectionHash).not.toBe(entry.sourceContentHash)
    expect(entry.sourceContentHash).not.toBe(hash({ id: entry.artifactId })) // Existing worker protocol is independent.
    const exported = await exportQualityJourney(scope, harness.db)
    expect(exported.artifacts.find(item => item.entryId === entry.entryId)).toEqual(entry)
    expect(exported.artifacts.find(item => item.entryId === 'TEST_CASE:legacy-case')?.data).toEqual({ description: 'Current case description' })
    refused(exported.artifacts.find(item => item.entryId === 'TEST_CASE:broken-case')!, 'ENROLLMENT_PROVENANCE_UNPROVEN')
    const { contentHash, ...manifest } = exported
    expect(contentHash).toBe(hash(manifest))
    expect(manifest.format).toBe('appraise.quality-journey-artifact-library/v1')
    expect(harness.client.$executeRaw).not.toHaveBeenCalled()
    expect(harness.client.qualityJourneySharedResourceUse.findMany).not.toHaveBeenCalled()
  })

  it('preserves list metadata as data:null without loading historical source or live resource bytes', async () => {
    const harness = database()
    harness.client.$queryRaw.mockResolvedValueOnce([{
      entryId: 'TEST_CASE:case-1', source: 'TEST_CASE', recordId: 'case-1', kind: 'TEST_CASE',
      title: 'Current metadata title', artifactId: 'case-1', revisionId: null, contentHash: null,
      cycleId: null, createdAt: when.toISOString(),
    }]).mockResolvedValueOnce([{ kind: 'TEST_CASE', total: BigInt(1) }])
    const listed = await listQualityJourneyArtifactLibrary(scope, harness.db)
    expect(listed.entries[0]).toMatchObject({ title: 'Current metadata title', data: null, sourceContentHash: null })
    expect(harness.client.qualityJourneyAutomationMaterialization.findMany).not.toHaveBeenCalled()
    expect(harness.client.qualityJourneyWorkAttemptSessionBinding.findUnique).not.toHaveBeenCalled()
    expect(harness.client.testCase.findMany).not.toHaveBeenCalled()
    expect(harness.client.testSuite.findMany).not.toHaveBeenCalled()
  })
})
