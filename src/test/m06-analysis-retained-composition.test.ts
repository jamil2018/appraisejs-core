import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { z } from 'zod'
import { analysisCharterSchema } from '@/lib/quality-journey/analysis-contracts'
import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const product = vi.hoisted(() => ({ submit: vi.fn(), answer: vi.fn(), compile: vi.fn(), advance: vi.fn() }))
vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('@/services/coordinator/quality-journey-analysis-service', () => ({
  submitExternalQualityJourneyAnalysisSuccessor: product.submit,
  answerQualityJourneyAnalysisQuestion: product.answer,
}))
vi.mock('@/services/coordinator/quality-journey-service', () => ({
  ensureQualityJourneyAnalysisFollowupInTransaction: product.compile,
}))
vi.mock('@/services/coordinator/quality-journey-analysis-scheduler', () => ({
  advanceQualityJourneyAnalysisFollowup: product.advance,
}))
import { RetainedAnalysisLifetime } from './m06-analysis-retained-lifetime'
import {
  compileRetainedAnalysisFollowup,
  projectRetainedAnalysisSubmissionBinding,
  composeRetainedAnalysisAfterOriginalNonstart,
} from './m06-analysis-retained-composition'
function fixture(extra = false) {
  const originalIntent = {
    id: 'original-intent',
    providerRunId: 'original-run',
    status: 'NONSTART_RECONCILED',
    turnOrdinal: 1,
  }
  const controlIntent = {
    id: 'control-intent',
    providerRunId: 'original-run',
    status: 'PENDING',
    turnOrdinal: 2,
    operationKey: 'control-intent',
    providerNamespace: 'synthetic:control:intent',
    requestHash: 'sha256:control-request',
    envelopeDigest: 'sha256:control-envelope',
    armedAt: null,
    invalidatedAt: null,
    reconciledAt: null,
    sendBoundaryId: null,
    claimEpoch: 0,
    claimOwner: null,
    claimExpiresAt: null,
    acknowledgedAt: null,
    threadId: null,
    turnId: null,
    createdAt: new Date('2026-10-22T19:59:00.000Z'),
  }
  const addedIntent = { id: 'B-intent', providerRunId: 'B-run', status: 'UNKNOWN', turnOrdinal: 1 }
  const baseline = [controlIntent, originalIntent]
  const currentControl = {
    ...controlIntent,
    status: 'INVALIDATED',
    invalidatedAt: new Date('2026-10-22T20:03:00.000Z'),
  }
  const currentOriginal = structuredClone(originalIntent)
  const current = [
    addedIntent,
    currentControl,
    currentOriginal,
    ...(extra ? [{ ...addedIntent, id: 'unrequested-extra' }] : []),
  ].sort((a, b) => a.id.localeCompare(b.id))
  const originalRun = {
    id: 'original-run',
    attemptId: 'original-attempt',
    workItemId: 'work',
    status: 'NONSTART_RECONCILED',
    turnsReserved: 1,
  }
  const observation = { id: 'original-observation', exact: 'preserved' }
  const currentRun = structuredClone(originalRun)
  const currentObservation = structuredClone(observation)
  let originalRunReads = 0
  const client = {
    qualityJourneyProviderDispatchIntent: {
      findUniqueOrThrow: vi.fn().mockResolvedValueOnce(originalIntent).mockResolvedValue(currentOriginal),
      findMany: vi.fn().mockResolvedValueOnce(baseline).mockResolvedValue(current),
      count: vi.fn().mockResolvedValueOnce(2).mockResolvedValue(current.length),
    },
    qualityJourneyProviderRun: {
      findUniqueOrThrow: vi.fn(async ({ where }) =>
        where.id === 'B-run'
          ? { id: 'B-run', attemptId: 'B-attempt', turnsReserved: 1 }
          : originalRunReads++ === 0
            ? originalRun
            : currentRun,
      ),
      count: vi.fn().mockResolvedValue(2),
    },
    qualityJourneyProviderObservation: {
      findUniqueOrThrow: vi.fn().mockResolvedValueOnce(observation).mockResolvedValue(currentObservation),
    },
    qualityJourneyProviderSlot: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValueOnce({ intentId: null })
        .mockResolvedValue({ intentId: 'B-intent', providerRunId: 'B-run' }),
    },
    qualityJourney: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ activeRevisionIdsJson: '{"journey":"requirement"}', activeCycleId: 'cycle' }),
    },
    qualityJourneyAnalysisRevision: {
      findFirstOrThrow: vi
        .fn()
        .mockResolvedValue({ id: 'B', submittedWorkItemId: 'work', submittedAttemptId: 'B-attempt' }),
    },
    qualityJourneyWorkItem: { findUniqueOrThrow: vi.fn().mockResolvedValue({ currentAttempt: 2 }) },
    qualityJourneyWorkAttempt: { count: vi.fn().mockResolvedValue(2) },
    qualityJourneyWorkAuthorization: { count: vi.fn().mockResolvedValue(2) },
    $transaction: async (invoke: (tx: unknown) => Promise<unknown>) => invoke(client),
  }
  const admitted = {
    journeyId: 'journey',
    targetProjectId: 'project',
    workItemId: 'work',
    attemptId: 'original-attempt',
    role: 'REQUIREMENT_ANALYZER',
    assignmentId: 'original-assignment',
    assignmentGeneration: 1,
    leaseId: 'original-lease',
    assignmentSecret: 'original-inert-assignment-secret-0123456789',
    coordinatorSessionId: 'original-session',
    coordinatorGeneration: 1,
    coordinatorPrincipalId: 'principal',
    principal: { principalId: 'principal', assurance: 'PROJECT_CREDENTIAL_ONLY' },
  } as Parameters<typeof composeRetainedAnalysisAfterOriginalNonstart>[1]
  const result = {
    conflicted: false,
    quarantined: false,
    receipt: { physical: { outcome: 'NONSTART' }, identity: { intentId: 'original-intent' } },
    observation,
    requestHash: 'sha256:original',
  } as unknown as Parameters<typeof composeRetainedAnalysisAfterOriginalNonstart>[2]
  return { client, admitted, result, controlIntent, currentControl, currentOriginal, currentRun, currentObservation }
}
beforeEach(() => {
  vi.resetAllMocks()
  product.submit.mockResolvedValue({ analysisRevision: { id: 'A' } })
  product.compile.mockResolvedValue({ expected: { workItemId: 'work' } })
  product.advance
    .mockResolvedValueOnce({ phase: 'CLAIMED' })
    .mockResolvedValueOnce({ phase: 'ADMITTED' })
    .mockResolvedValue({ phase: 'DELIVERY', result: { status: 'ACCEPTED', supervisor: { providerRunId: 'B-run' } } })
})
describe('actual composition intent topology assertions (mocked product effects)', () => {
  const settings = {
    fixture: { fixturePath: 'not-executed' },
    followupAssignmentSecret: 'original-secret-not-executed',
    controller: { retainDelivery: vi.fn() },
  }
  it('accepts only canonical control retirement while preserving original history and requiring exactly one new B intent', async () => {
    const f = fixture()
    const result = await composeRetainedAnalysisAfterOriginalNonstart(
      f.client as unknown as PrismaClient,
      f.admitted,
      f.result,
      settings,
    )
    expect(result.intentTopology).toEqual({
      baseline: ['control-intent', 'original-intent'],
      current: ['B-intent', 'control-intent', 'original-intent'],
      added: 'B-intent',
    })
    expect(result.runtimeQualified).toBe(false)
  })
  it.each([
    ['pending control', { status: 'PENDING', invalidatedAt: null }],
    ['null invalidation timestamp', { invalidatedAt: null }],
    ['invalid Date', { invalidatedAt: new Date(NaN) }],
    ['timestamp coercion', { invalidatedAt: '2026-10-22T20:03:00.000Z' }],
    ['negative timestamp', { invalidatedAt: new Date(-1) }],
    ['wrong status', { status: 'ACKNOWLEDGED' }],
    ['changed request', { requestHash: 'sha256:changed' }],
    ['changed envelope', { envelopeDigest: 'sha256:changed' }],
    ['changed namespace', { providerNamespace: 'synthetic:other' }],
    ['changed run', { providerRunId: 'other-run' }],
    ['changed operation', { operationKey: 'other-operation' }],
    ['changed ordinal', { turnOrdinal: 3 }],
    ['new arm', { armedAt: new Date('2026-10-22T20:03:00.000Z') }],
    ['new send boundary', { sendBoundaryId: 'unexpected-boundary' }],
    ['new charge epoch', { claimEpoch: 1 }],
    ['new claim owner', { claimOwner: 'unexpected-owner' }],
    ['new reconciliation', { reconciledAt: new Date('2026-10-22T20:03:00.000Z') }],
    ['changed creation', { createdAt: new Date('2026-10-22T20:03:00.000Z') }],
  ])('refuses %s in the retained control', async (_label, patch) => {
    const f = fixture()
    Object.assign(f.currentControl, patch)
    await expect(
      composeRetainedAnalysisAfterOriginalNonstart(f.client as unknown as PrismaClient, f.admitted, f.result, settings),
    ).rejects.toThrow()
  })
  it.each([
    ['armed', { armedAt: new Date('2026-10-22T20:00:00.000Z') }],
    ['already invalidated', { invalidatedAt: new Date('2026-10-22T20:00:00.000Z') }],
    ['already reconciled', { reconciledAt: new Date('2026-10-22T20:00:00.000Z') }],
    ['charged', { claimEpoch: 1 }],
    ['wrong identity', { operationKey: 'other-control' }],
    ['wrong namespace', { providerNamespace: 'synthetic:other' }],
    ['wrong run', { providerRunId: 'other-run' }],
    ['wrong ordinal', { turnOrdinal: 1 }],
  ])('refuses an ineligible %s baseline control before product effects', async (_label, patch) => {
    const f = fixture()
    Object.assign(f.controlIntent, patch)
    await expect(
      composeRetainedAnalysisAfterOriginalNonstart(f.client as unknown as PrismaClient, f.admitted, f.result, settings),
    ).rejects.toThrow()
    expect(product.submit).not.toHaveBeenCalled()
    expect(product.advance).not.toHaveBeenCalled()
  })
  it.each(['currentOriginal', 'currentRun', 'currentObservation'] as const)(
    'refuses mutation of original physical history: %s',
    async key => {
      const f = fixture()
      Object.assign(f[key], { unexpectedMutation: true })
      await expect(
        composeRetainedAnalysisAfterOriginalNonstart(
          f.client as unknown as PrismaClient,
          f.admitted,
          f.result,
          settings,
        ),
      ).rejects.toThrow()
    },
  )
  it('passes only current coordinator authority and follow-up inputs to each scheduler step', async () => {
    const f = fixture()
    const admitted = Object.freeze({
      ...f.admitted,
      coordinatorHandoffId: undefined,
      futureCoordinatorSession: 'future-session-must-not-leak',
      futureAuthorization: Object.freeze({ id: 'future-auth-must-not-leak' }),
    })
    const before = structuredClone(admitted)
    const expected = Object.freeze({
      workItemId: 'work',
      cycleId: 'cycle',
      version: 2,
      inputHash: 'sha256:followup-input',
      authorizationId: 'followup-authorization',
      causeHash: 'sha256:followup-cause',
    })
    product.compile.mockResolvedValue({ expected })
    const followupSettings = {
      ...settings,
      followupAssignmentSecret: 'followup-inert-secret-01234567890123456789',
    }
    await composeRetainedAnalysisAfterOriginalNonstart(
      f.client as unknown as PrismaClient,
      admitted,
      f.result,
      followupSettings,
    )
    expect(product.advance).toHaveBeenCalledTimes(3)
    const firstInput = product.advance.mock.calls[0]![0]
    const intended = {
      journeyId: admitted.journeyId,
      targetProjectId: admitted.targetProjectId,
      coordinatorSessionId: admitted.coordinatorSessionId,
      coordinatorHandoffId: admitted.coordinatorHandoffId,
      coordinatorGeneration: admitted.coordinatorGeneration,
      coordinatorPrincipalId: admitted.coordinatorPrincipalId,
      principal: admitted.principal,
      expected,
      assignmentSecret: followupSettings.followupAssignmentSecret,
      fixture: followupSettings.fixture,
    }
    for (const [input, client, controller] of product.advance.mock.calls) {
      expect(input).toBe(firstInput)
      expect(Object.keys(input).sort()).toEqual(Object.keys(intended).sort())
      expect(input).toStrictEqual(intended)
      expect(input.principal).toBe(admitted.principal)
      expect(input.expected).toBe(expected)
      expect(input.fixture).toBe(followupSettings.fixture)
      expect(client).toBe(f.client)
      expect(controller).toBe(followupSettings.controller)
      for (const key of [
        'workItemId',
        'attemptId',
        'assignmentId',
        'assignmentGeneration',
        'leaseId',
        'role',
        'futureCoordinatorSession',
        'futureAuthorization',
      ])
        expect(Object.hasOwn(input, key)).toBe(false)
    }
    expect(admitted).toStrictEqual(before)
    expect(admitted.principal).toBe(f.admitted.principal)
    expect(admitted.assignmentSecret).not.toBe(followupSettings.followupAssignmentSecret)
  })
  it('refuses an additional unrequested intent instead of accepting a larger baseline-adjusted count', async () => {
    const f = fixture(true)
    await expect(
      composeRetainedAnalysisAfterOriginalNonstart(f.client as unknown as PrismaClient, f.admitted, f.result, settings),
    ).rejects.toThrow()
    expect(product.advance).toHaveBeenCalledTimes(3)
  })
})

it('retains both actual nested compiler and transaction promises for canonical B/C rounds', async () => {
  const owner = new RetainedAnalysisLifetime(),
    scope = { journeyId: 'journey', targetProjectId: 'project' }
  let resolve!: (value: { status: string; expected: null }) => void
  const compiler = new Promise<{ status: string; expected: null }>(yes => {
    resolve = yes
  })
  const transaction = compiler.then(value => value)
  product.compile.mockReturnValue(compiler)
  const tx = { exact: 'transaction-object' }
  const client = {
    $transaction: (invoke: (value: unknown) => unknown) => {
      expect(invoke(tx)).toBe(compiler)
      return transaction
    },
  } as unknown as PrismaClient
  const actual = compileRetainedAnalysisFollowup(owner, client, scope)
  expect(actual).toBe(transaction)
  expect(owner.operations.map(operation => operation.original)).toEqual([transaction, compiler])
  await expect(owner.closeKnownSettledClients()).rejects.toThrow(/still pending/)
  resolve({ status: 'AUTHORITY_BLOCKED', expected: null })
  await actual
  expect(product.compile).toHaveBeenCalledWith(scope, tx)
  expect(owner.operations.map(operation => operation.state)).toEqual(['FULFILLED', 'FULFILLED'])
})

// Parse the exact strict boundary declaration, without importing the DB-backed ingress.
describe('initial retained Analysis submission request boundary (DB-free)', () => {
  const sourcePath = path.resolve('src/services/coordinator/quality-journey-analysis-service.ts')
  const parsed = ts.createSourceFile(sourcePath, readFileSync(sourcePath, 'utf8'), ts.ScriptTarget.Latest, true)
  const declaration = parsed.statements.find(
    node =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations[0]?.name.getText(parsed) === 'externalAnalysisSubmissionSchema',
  )
  if (!declaration) throw new Error('Exact strict external Analysis submission schema required.')
  const schema = vm.runInNewContext(
    ts.transpileModule(declaration.getText(parsed) + '\nexternalAnalysisSubmissionSchema', {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { z, analysisCharterSchema },
  ) as z.ZodType<unknown>
  const scenarioPath = path.resolve('src/test/m06-analysis-retained-scenarios.ts')
  const scenarios = ts.createSourceFile(scenarioPath, readFileSync(scenarioPath, 'utf8'), ts.ScriptTarget.Latest, true)
  const constructors = ['seedCharter', 'canonicalPredecessor'].map(name => {
    const fn = scenarios.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
    if (!fn) throw new Error('Actual retained request constructor required: ' + name)
    return fn.getText(scenarios)
  })
  const canonicalPredecessor = vm.runInNewContext(
    ts.transpileModule(constructors.join('\n') + '\ncanonicalPredecessor', {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { projectRetainedAnalysisSubmissionBinding, submitExternalQualityJourneyAnalysisSuccessor: product.submit },
  ) as (fixture: unknown) => Promise<unknown>
  const settings = {
    fixture: { fixturePath: 'not-executed' },
    followupAssignmentSecret: 'original-secret-not-executed',
    controller: { retainDelivery: vi.fn() },
  }
  it('constructs both actual initial-A calls as strict requests while preserving principal/client/credentials and original submit promise', async () => {
    const f = fixture()
    await composeRetainedAnalysisAfterOriginalNonstart(
      f.client as unknown as PrismaClient,
      f.admitted,
      f.result,
      settings,
    )
    const compositionArgs = product.submit.mock.calls[0]!
    expect(schema.safeParse(compositionArgs[0]).success).toBe(true)
    expect(compositionArgs.slice(1)).toEqual([f.admitted.principal, f.client, f.admitted])
    expect(compositionArgs[1]).toBe(f.admitted.principal)
    expect(compositionArgs[2]).toBe(f.client)
    expect(compositionArgs[3]).toBe(f.admitted)
    product.submit.mockClear()
    const owner = new RetainedAnalysisLifetime()
    const credentials = {
      coordinatorSessionId: 'separate-session',
      coordinatorGeneration: 4,
      coordinatorPrincipalId: 'separate-principal',
    }
    const scenarioFixture = {
      binding: f.admitted,
      principal: f.admitted.principal,
      client: f.client,
      credentials,
      owner,
      scope: { journeyId: f.admitted.journeyId, targetProjectId: f.admitted.targetProjectId },
      created: { journey: { activeCycleId: 'cycle', activeRevisionIds: { journey: 'requirement' } } },
    }
    await canonicalPredecessor(scenarioFixture)
    const scenarioArgs = product.submit.mock.calls[0]!
    expect(schema.safeParse(scenarioArgs[0]).success).toBe(true)
    expect(scenarioArgs[1]).toBe(scenarioFixture.principal)
    expect(scenarioArgs[2]).toBe(scenarioFixture.client)
    expect(scenarioArgs[3]).toBe(credentials)
    expect(owner.operations[0]!.original).toBe(product.submit.mock.results[0]!.value)
    expect(owner.operations[0]!.label).toBe('original:submitExternalQualityJourneyAnalysisSuccessor')
    for (const request of [compositionArgs[0], scenarioArgs[0]]) {
      expect(Object.keys(request).sort()).toEqual(
        [
          'journeyId',
          'targetProjectId',
          'workItemId',
          'attemptId',
          'assignmentId',
          'assignmentGeneration',
          'leaseId',
          'assignmentSecret',
          'idempotencyKey',
          'charter',
        ].sort(),
      )
      for (const [key, value] of Object.entries(projectRetainedAnalysisSubmissionBinding(f.admitted)))
        expect(request[key]).toBe(value)
    }
    const originalSpread = { ...f.admitted, idempotencyKey: 'original-spread', charter: scenarioArgs[0].charter }
    const refused = schema.safeParse(originalSpread)
    expect(refused.success).toBe(false)
    if (refused.success) throw new Error('Full credential binding must remain refused.')
    const unknown = refused.error.issues.flatMap(issue => (issue.code === 'unrecognized_keys' ? issue.keys : []))
    expect(unknown.sort()).toEqual(
      ['coordinatorSessionId', 'coordinatorGeneration', 'coordinatorPrincipalId', 'role', 'principal'].sort(),
    )
  })
  it('positively selects exactly eight original values and excludes future auth/session fields without mutating binding', () => {
    const f = fixture()
    const binding = Object.freeze({
      ...f.admitted,
      futureCoordinatorSession: 'future-session',
      futureAuthorization: Object.freeze({ id: 'future-auth' }),
    })
    const before = structuredClone(binding)
    const projected = projectRetainedAnalysisSubmissionBinding(binding)
    expect(Object.keys(projected).sort()).toEqual(
      [
        'journeyId',
        'targetProjectId',
        'workItemId',
        'attemptId',
        'assignmentId',
        'assignmentGeneration',
        'leaseId',
        'assignmentSecret',
      ].sort(),
    )
    for (const key of Object.keys(projected) as Array<keyof typeof projected>) expect(projected[key]).toBe(binding[key])
    expect(binding).toEqual(before)
    expect(binding.principal).toBe(f.admitted.principal)
    expect(Object.hasOwn(projected, 'futureCoordinatorSession')).toBe(false)
    expect(Object.hasOwn(projected, 'futureAuthorization')).toBe(false)
  })
})

// Evaluate only exact pure declarations, never the matrix factory, module body, controller or runtime imports.
describe('actual matrix diagnostic-control oracle (AST-extracted, no service runtime)', () => {
  const matrixPath = path.resolve('scripts/test-harness/m06/service-custody/custody-service-matrix.ts')
  const datePath = path.resolve('scripts/test-harness/m06/service-custody/custody-fixture-datetime.ts')
  const matrix = ts.createSourceFile(matrixPath, readFileSync(matrixPath, 'utf8'), ts.ScriptTarget.Latest, true)
  const dates = ts.createSourceFile(datePath, readFileSync(datePath, 'utf8'), ts.ScriptTarget.Latest, true)
  function exactDeclaration(source: ts.SourceFile, name: string, kind: 'function' | 'variable') {
    const found: ts.Node[] = []
    function visit(node: ts.Node) {
      if (
        (kind === 'function' && ts.isFunctionDeclaration(node) && node.name?.text === name) ||
        (kind === 'variable' && ts.isVariableDeclaration(node) && node.name.getText(source) === name)
      )
        found.push(node)
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(found).toHaveLength(1)
    return found[0]!
  }
  const oracle = ts.transpileModule(
    [
      exactDeclaration(matrix, 'assertFields', 'function').getText(matrix),
      exactDeclaration(matrix, 'assertDiagnosticControl', 'function').getText(matrix),
      exactDeclaration(dates, 'fixtureDateTime', 'function')
        .getText(dates)
        .replace(/^export /, ''),
      'const ' + exactDeclaration(matrix, 'composition', 'variable').getText(matrix),
      'assertDiagnosticControl()',
    ].join('\n'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const fresh = exactDeclaration(matrix, 'freshRemainingServiceCases', 'variable') as ts.VariableDeclaration
  if (!fresh.initializer || !ts.isArrayLiteralExpression(fresh.initializer))
    throw new Error('Exact fresh case list required')
  const names = fresh.initializer.elements.map(element => {
    if (!ts.isStringLiteral(element)) throw new Error('Literal fresh case names required')
    return element.text
  })
  const compositionCase = 'original-nonstart-authored-analysis-composition16z'
  function check(name: string, patch: Record<string, unknown> = {}, sourcePatch: Record<string, unknown> = {}) {
    const controlSource = { sourceId: 'control-intent', lifecycle: 'ACTIVE', sequence: 0 }
    vm.runInNewContext(oracle, {
      expect,
      Date,
      name,
      compositionServiceCase: compositionCase,
      controlIntent: {
        id: 'control-intent',
        providerRunId: 'original-run',
        turnOrdinal: 2,
        providerNamespace: 'synthetic:control:intent',
        sendBoundaryId: null,
        status: name === compositionCase ? 'INVALIDATED' : 'PENDING',
        armedAt: null,
        claimEpoch: 0,
        claimOwner: null,
        acknowledgedAt: null,
        reconciledAt: null,
        invalidatedAt: name === compositionCase ? 1792699380000 : null,
        ...patch,
      },
      identity: { runId: 'original-run' },
      control: { ordinal: 2, providerNamespace: 'synthetic:control:intent' },
      intent: { turnOrdinal: 1 },
      controlState: { ...controlSource, ...sourcePatch },
      expected: { controlSource },
    })
  }
  it('accepts exact composition invalidation as integer epoch or Prisma Date', () => {
    expect(() => check(compositionCase)).not.toThrow()
    expect(() => check(compositionCase, { invalidatedAt: new Date(1792699380000) })).not.toThrow()
  })
  it('keeps all 17 fresh case names pending and rejects retirement leakage', () => {
    expect(names).toHaveLength(17)
    for (const name of names) {
      expect(() => check(name)).not.toThrow()
      expect(() => check(name, { status: 'INVALIDATED', invalidatedAt: 1792699380000 })).toThrow()
      expect(() => check(name, { invalidatedAt: 1792699380000 })).toThrow()
    }
  })
  it.each([
    { status: 'PENDING' },
    { status: 'ACKNOWLEDGED' },
    { invalidatedAt: null },
    { invalidatedAt: '2026-10-22T20:03:00.000Z' },
    { invalidatedAt: NaN },
    { invalidatedAt: -1 },
    { invalidatedAt: 0.5 },
    { invalidatedAt: new Date(NaN) },
    { armedAt: 1792699380000 },
    { sendBoundaryId: 'unexpected-boundary' },
    { providerRunId: 'other-run' },
    { providerNamespace: 'synthetic:other' },
    { turnOrdinal: 1 },
    { claimEpoch: 1 },
    { claimOwner: 'unexpected-owner' },
    { acknowledgedAt: 1792699380000 },
    { reconciledAt: 1792699380000 },
  ])('rejects invalid composition control state %#', patch => {
    expect(() => check(compositionCase, patch)).toThrow()
  })
  it('keeps the actual source-state assertion effective', () => {
    expect(() => check(compositionCase, {}, { sequence: 1 })).toThrow()
  })
})
