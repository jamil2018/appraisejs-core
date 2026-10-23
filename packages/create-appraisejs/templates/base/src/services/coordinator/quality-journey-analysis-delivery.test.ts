import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { providerIntentPolicy } from '@/lib/quality-journey/provider-intent-contract'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { compileAnalysisFollowupDescriptor } from './quality-journey-analysis-followup'
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  issued: vi.fn(),
  snapshot: vi.fn(),
  outcome: vi.fn(),
  submit: vi.fn(),
  library: vi.fn(),
  supervisor: vi.fn(),
  launch: vi.fn(),
}))
vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('@/lib/quality-journey', async original => ({
  ...(await original<typeof import('@/lib/quality-journey')>()),
  assignmentManifestSchema: { parse: (value: unknown) => value },
}))
vi.mock('@/lib/quality-journey/codex-app-server/owned-child', () => ({ launchOwnedFixtureChild: mocks.launch }))
vi.mock('./quality-journey-service', () => ({
  authenticateExternalQualityJourneySubmission: mocks.authenticate,
  readQualityJourneyAnalysisFollowupIssuanceInTransaction: mocks.issued,
  readQualityJourneyAnalysisFollowupInTransaction: mocks.snapshot,
  readExternalQualityJourneySubmissionOutcome: mocks.outcome,
}))
vi.mock('./quality-journey-analysis-service', () => ({ submitExternalQualityJourneyAnalysisSuccessor: mocks.submit }))
vi.mock('./quality-journey-artifact-library-service', () => ({ getQualityJourneyLibraryArtifact: mocks.library }))
vi.mock('./quality-journey-process-supervisor', () => ({
  createQualityJourneyProcessSupervisor: mocks.supervisor,
  trustedJourneyProcessAdapter: Symbol('unit-only'),
}))
import { createQualityJourneyAnalysisFixtureDelivery } from './quality-journey-analysis-delivery'
import type { PrepareQualityJourneyProviderRunInput } from './quality-journey-provider-run-service'

function fixture() {
  const charter = {
    schemaVersion: 'appraise.quality-journey/v1',
    charterId: 'charter',
    analysisRevisionId: 'A',
    journeyId: 'journey',
    targetProjectId: 'project',
    cycleId: 'cycle',
    requirementRevisionId: 'requirement',
    objectives: ['Bound scope.'],
    scope: { included: ['Checkout'], excluded: [] },
    actors: ['User'],
    requirements: [{ requirementId: 'REQ-1', statement: 'A requirement.', sourceRefs: ['source'] }],
    obligations: [
      { obligationId: 'OBL-1', requirementId: 'REQ-1', statement: 'Evidence.', acceptanceSignals: ['Evidence'] },
    ],
    constraints: [],
    assumptions: [],
    risks: [],
    acceptanceSignals: ['Evidence'],
    retiredRequirementIds: [],
    questions: [],
    resolvedQuestionAnswerIds: [],
  }
  const refs = {
    requirement: {
      kind: 'JOURNEY_REVISION',
      artifactId: 'requirement',
      revisionId: 'requirement',
      contentHash: hashCanonical({ objective: 'Bound scope.' }),
    },
    predecessor: {
      kind: 'ANALYSIS_CHARTER_REVISION',
      artifactId: 'charter',
      revisionId: 'A',
      contentHash: hashCanonical(charter),
    },
    question: { kind: 'ANALYSIS_QUESTION', artifactId: 'q', revisionId: 'A', contentHash: hashCanonical('question') },
    answer: { kind: 'ANALYSIS_ANSWER', artifactId: 'current-head', contentHash: hashCanonical('answer') },
  }
  const compiled = compileAnalysisFollowupDescriptor({
    schemaVersion: 'appraise.analysis-followup-descriptor/v1',
    journeyId: 'journey',
    targetProjectId: 'project',
    cycleId: 'cycle',
    workItemId: 'work',
    predecessor: {
      revisionId: 'A',
      artifact: refs.predecessor,
      attemptId: 'prior',
      authorizationId: 'prior-auth',
      inputHash: hashCanonical('prior'),
    },
    requirement: refs.requirement,
    questions: [{ questionId: 'q', required: true, question: refs.question, answer: refs.answer }],
    feedback: null,
    cause: { eventId: 'event', sequence: 5 },
    advisoryInputRefs: [],
    advisoryDigest: hashCanonical([]),
    roleContractDigest: hashCanonical('role'),
  })
  const assignment = { inputArtifacts: compiled.inputArtifacts }
  mocks.authenticate.mockResolvedValue({
    item: { cycleId: 'cycle', inputHash: compiled.inputHash },
    attempt: {
      authorizationId: 'auth',
      assignmentJson: JSON.stringify(assignment),
      assignmentHash: hashCanonical(assignment),
    },
  })
  mocks.issued.mockResolvedValue(compiled)
  mocks.snapshot.mockResolvedValue({ ready: true, inputHash: compiled.inputHash })
  mocks.library.mockImplementation(async ({ entryId }: { entryId: string }) => {
    if (entryId.startsWith('REQUIREMENT_REVISION:'))
      return {
        entry: {
          artifactId: 'requirement',
          sourceContentHash: refs.requirement.contentHash,
          data: { objective: 'Bound scope.' },
        },
      }
    const reference = Object.values(refs).find(ref => entryId === `ARTIFACT:${ref.artifactId}`)!
    return {
      entry: {
        ...reference,
        revisionId: 'revisionId' in reference ? reference.revisionId : null,
        sourceContentHash: reference.contentHash,
        cycleId: 'cycle',
        data:
          reference.kind === 'ANALYSIS_CHARTER_REVISION'
            ? charter
            : reference.kind === 'ANALYSIS_QUESTION'
              ? { questionId: 'q', required: true, prompt: 'Scope?' }
              : { answerId: 'current-head', answer: 'Human scope.' },
      },
    }
  })
  mocks.outcome.mockRejectedValue(new (class extends Error {})())
  mocks.submit.mockResolvedValue({ accepted: true })
  const tx = { qualityJourneyAnalysisRevision: { count: vi.fn().mockResolvedValue(1) } }
  const client = {
    $transaction: async (callback: (tx: unknown) => unknown) => callback(tx),
    qualityJourneyArtifact: { findMany: vi.fn(async ({ where }) => [{ id: where.artifactId }]) },
  } as unknown as PrismaClient
  const binding = {
    journeyId: 'journey',
    targetProjectId: 'project',
    role: 'REQUIREMENT_ANALYZER',
    workItemId: 'work',
    attemptId: 'attempt',
    assignmentId: 'assignment',
    assignmentGeneration: 1,
    leaseId: 'lease',
    assignmentSecret: 'original-secret-01234567890123456789',
    principal: { principalId: 'principal', assurance: 'PROJECT_CREDENTIAL_ONLY' },
    idempotencyKey: 'prepare',
    providerNamespace: 'synthetic:unit',
    configurationDigest: hashCanonical('config'),
    envelopeDigest: hashCanonical('envelope'),
  } as PrepareQualityJourneyProviderRunInput
  return { charter, compiled, client, binding }
}
beforeEach(() => vi.resetAllMocks())
describe('exact Analysis fixture envelope (mocked process and authority)', () => {
  it('projects only the pinned predecessor and current heads before any start', async () => {
    const f = fixture()
    mocks.supervisor.mockReturnValue({
      snapshot: () => ({ fenced: false, threadId: 'thread' }),
      start: vi.fn(),
      cancel: vi.fn(),
    })
    await createQualityJourneyAnalysisFixtureDelivery(
      f.binding,
      { fixturePath: 'scripts/tests/fixtures/m06-analysis-child.mjs', submissionIdempotencyKey: 'submit' },
      f.client,
    )
    const envelope = JSON.parse(mocks.supervisor.mock.calls[0]![1].input[0].text)
    expect(envelope.followup.predecessorAnalysisRevisionId).toBe('A')
    expect(envelope.followup.questions[0].currentAnswer.reference.artifactId).toBe('current-head')
    expect(envelope.followup.questions).toHaveLength(1)
    expect(envelope.requirement.artifactId).toBe('requirement')
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it('exposes only immutable passive metadata identical to the actual supervisor binding', async () => {
    const f = fixture()
    mocks.supervisor.mockReturnValue({ snapshot: () => ({ fenced: false }), start: vi.fn(), cancel: vi.fn() })
    const delivery = await createQualityJourneyAnalysisFixtureDelivery(
      f.binding,
      { fixturePath: 'scripts/tests/fixtures/m06-analysis-child.mjs', submissionIdempotencyKey: 'submit' },
      f.client,
    )
    const [actualBinding, adapter] = mocks.supervisor.mock.calls[0]!
    expect(Object.isFrozen(delivery.preparationIdentity)).toBe(true)
    expect(Object.keys(delivery.preparationIdentity).sort()).toEqual([
      'configurationDigest',
      'envelopeDigest',
      'idempotencyKey',
      'providerNamespace',
    ])
    expect(delivery.preparationIdentity).toEqual({
      idempotencyKey: actualBinding.idempotencyKey,
      providerNamespace: actualBinding.providerNamespace,
      configurationDigest: adapter.configurationDigest,
      envelopeDigest: hashCanonical({
        input: adapter.input,
        model: providerIntentPolicy.model,
        effort: providerIntentPolicy.reasoning,
      }),
    })
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it('refuses a changed pinned artifact projection before supervisor construction or child start', async () => {
    const f = fixture()
    const original = mocks.library.getMockImplementation()!
    mocks.library.mockImplementation(async (...args) => {
      const result = await original(...args)
      return args[0].entryId === 'ARTIFACT:current-head'
        ? { entry: { ...result.entry, sourceContentHash: hashCanonical('wrong-head') } }
        : result
    })
    await expect(
      createQualityJourneyAnalysisFixtureDelivery(
        f.binding,
        { fixturePath: 'scripts/tests/fixtures/m06-analysis-child.mjs', submissionIdempotencyKey: 'submit' },
        f.client,
      ),
    ).rejects.toThrow(/projection changed/)
    expect(mocks.supervisor).not.toHaveBeenCalled()
    expect(mocks.launch).not.toHaveBeenCalled()
  })
})

import path from 'node:path'
import { readFileSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { transform } from 'esbuild'
import { collectAnalysisRuntimePackageInputs } from '../../../scripts/test-harness/m06/analysis-retained/analysis-retained-package-inputs.mjs'
import { inspectAnalysisPreRuntimeClosure } from '../../../scripts/test-harness/m06/analysis-retained/analysis-retained-preruntime-inputs.mjs'
import {
  preserveAnalysisOwnedChildOrigin,
  inspectEmittedAnalysisOwnedChildOrigin,
} from '../../../scripts/test-harness/m06/analysis-retained/analysis-retained-owned-child-origin.mjs'
import { analysisCharter } from '../../../scripts/tests/fixtures/m06-analysis-charter.mjs'

function packageInventoryFixture() {
  const root = '/repo/.appraisejs/m06-work/worktrees/custody-fix',
    installed = '/repo/node_modules'
  const metadata: Record<string, object> = {
    [`${installed}/alpha/package.json`]: {
      name: 'alpha',
      dependencies: { 'alias-dep': 'npm:beta@^1' },
      optionalDependencies: { missing: '*' },
    },
    [`${installed}/alias-dep/package.json`]: { name: 'beta' },
  }
  const entries: Record<string, Array<[string, 'file' | 'directory' | 'symlink']>> = {
    [`${installed}/alpha`]: [
      ['package.json', 'file'],
      ['index.js', 'file'],
      ['.env', 'file'],
      ['known.db', 'file'],
      ['.ssh', 'directory'],
      ['linked', 'symlink'],
      ['lib', 'directory'],
    ],
    [`${installed}/alpha/lib`]: [['nested.js', 'file']],
    [`${installed}/alias-dep`]: [
      ['package.json', 'file'],
      ['index.js', 'file'],
    ],
  }
  const io = {
    realpathSync: vi.fn((filename: string) => filename),
    existsSync: vi.fn((filename: string) => filename in metadata),
    readFileSync: vi.fn((filename: string) => {
      if (!(filename in metadata)) throw new Error('Forbidden non-metadata read')
      return JSON.stringify(metadata[filename])
    }),
    readdirSync: vi.fn((filename: string) =>
      entries[filename]!.map(([name, kind]) => ({
        name,
        isDirectory: () => kind === 'directory',
        isFile: () => kind === 'file',
        isSymbolicLink: () => kind === 'symlink',
      })),
    ),
    lstatSync: vi.fn(() => ({ size: 7, mode: 0o600 })),
  }
  return { root, installed, metadata, io }
}
describe('actual static runtime-input inventory and admission import closure', () => {
  it('binds declared aliases/dependencies and inventories forbidden candidates as metadata only', () => {
    const f = packageInventoryFixture(),
      clientEntry = '/selected/C/index.js'
    const actual = collectAnalysisRuntimePackageInputs(
      ['node:fs', 'fs', clientEntry, 'alpha'],
      { root: f.root, clientEntry },
      f.io,
    )
    expect([...actual.packageFiles].sort()).toEqual([
      `${f.installed}/alias-dep/index.js`,
      `${f.installed}/alias-dep/package.json`,
      `${f.installed}/alpha/index.js`,
      `${f.installed}/alpha/lib/nested.js`,
      `${f.installed}/alpha/package.json`,
    ])
    expect(actual.packageDependencyEdges).toMatchObject([
      { specifier: 'alpha', actualName: 'alpha' },
      { specifier: 'alias-dep', declared: 'npm:beta@^1', actualName: 'beta' },
    ])
    expect(actual.excludedPackageInputs.map((row: { filename: string }) => path.basename(row.filename)).sort()).toEqual(
      ['.env', '.ssh', 'known.db', 'linked'],
    )
    expect(f.io.readFileSync.mock.calls.every(([filename]) => filename.endsWith('/package.json'))).toBe(true)
    expect(
      f.io.existsSync.mock.calls.every(
        ([filename]) => filename.startsWith(f.root + '/node_modules/') || filename.startsWith(f.installed + '/'),
      ),
    ).toBe(true)
  })
  it('refuses required missing packages, undeclared aliases and realpath escape', () => {
    const f = packageInventoryFixture()
    expect(() => collectAnalysisRuntimePackageInputs(['missing'], { root: f.root, clientEntry: '/C' }, f.io)).toThrow(
      /unavailable/,
    )
    f.metadata[`${f.installed}/alpha/package.json`] = { name: 'foreign' }
    expect(() => collectAnalysisRuntimePackageInputs(['alpha'], { root: f.root, clientEntry: '/C' }, f.io)).toThrow()
    f.io.readFileSync.mockClear()
    f.io.realpathSync.mockImplementation(filename => (filename.endsWith('/alpha') ? '/foreign/alpha' : filename))
    expect(() => collectAnalysisRuntimePackageInputs(['alpha'], { root: f.root, clientEntry: '/C' }, f.io)).toThrow(
      /escaped/,
    )
    expect(f.io.readFileSync).not.toHaveBeenCalled()
  })
  it('visits the full static closure, permits deferred product imports and refuses product/foreign evaluation before admission', () => {
    const root = '/repo',
      sourceEntry = '/repo/src/test/m06-analysis-retained-controller.ts'
    const makeEmittedModule = (
      inputs: Record<string, unknown>,
      imports: Array<{ path: string; kind: string; external?: boolean }>,
    ) => ({ inputs, imports })
    const metafile = {
      outputs: {
        'out/controller.js': makeEmittedModule({ 'src/test/m06-analysis-retained-controller.ts': {} }, [
          { path: 'out/lifetime.js', kind: 'import-statement' },
          { path: 'out/product.js', kind: 'dynamic-import' },
        ]),
        'out/lifetime.js': makeEmittedModule({ 'src/test/m06-analysis-retained-lifetime.ts': {} }, [
          { path: 'node:assert/strict', kind: 'import-statement', external: true },
        ]),
      },
    }
    expect([
      ...inspectAnalysisPreRuntimeClosure(metafile, { filename: '/repo/out/controller.js' }, { root, sourceEntry }),
    ]).toEqual(['out/controller.js', 'out/lifetime.js'])
    metafile.outputs['out/lifetime.js'] = makeEmittedModule({ 'src/services/product.ts': {} }, [])
    expect(() =>
      inspectAnalysisPreRuntimeClosure(metafile, { filename: '/repo/out/controller.js' }, { root, sourceEntry }),
    ).toThrow(/Product input before admission/)
    metafile.outputs['out/lifetime.js'] = makeEmittedModule({ 'src/test/m06-analysis-retained-lifetime.ts': {} }, [
      { path: '/selected/C/index.js', kind: 'import-statement', external: true },
    ])
    expect(() =>
      inspectAnalysisPreRuntimeClosure(metafile, { filename: '/repo/out/controller.js' }, { root, sourceEntry }),
    ).toThrow(/Runtime dependency before admission/)
  })
})
describe('actual fixed child charter projection without importing the child entry', () => {
  const envelope = () => ({
    journeyId: 'journey',
    targetProjectId: 'project',
    cycleId: 'cycle',
    requirement: { artifactId: 'requirement', data: { objective: 'Bound the fixture.' } },
  })
  it('preserves the original initial charter and current-only successor answer/feedback projection', () => {
    const initial = analysisCharter(envelope())
    expect(initial).toMatchObject({
      analysisRevisionId: 'm06-analysis-revision',
      requirementRevisionId: 'requirement',
      resolvedQuestionAnswerIds: [],
    })
    const predecessor = { ...initial, analysisRevisionId: 'A', assumptions: ['original'] }
    const followup = {
      predecessorAnalysisRevisionId: 'A',
      inputHash: `sha256:${'a'.repeat(64)}`,
      predecessor: { data: predecessor },
      questions: [
        {
          question: { data: { questionId: 'required', required: true } },
          currentAnswer: { reference: { artifactId: 'current-answer' } },
        },
        { question: { data: { questionId: 'optional', required: false } }, currentAnswer: null },
      ],
      feedback: { data: { feedback: 'exact feedback' } },
    }
    const successor = analysisCharter({ ...envelope(), followup })
    expect(successor.resolvedQuestionAnswerIds).toEqual(['current-answer'])
    expect(successor.questions).toEqual([{ questionId: 'optional', required: false }])
    expect(successor.assumptions).toEqual(['original', 'exact feedback'])
    expect(predecessor.assumptions).toEqual(['original'])
  })
  it('retains exit92 refusal for inconsistent predecessor or unanswered required inputs', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('inert exit92')
    })
    try {
      const initial = analysisCharter(envelope())
      const followup = {
        predecessorAnalysisRevisionId: 'other',
        inputHash: 'sha256:x',
        predecessor: { data: { ...initial, analysisRevisionId: 'A' } },
        questions: [],
        feedback: null,
      }
      expect(() => analysisCharter({ ...envelope(), followup })).toThrow('inert exit92')
      followup.predecessorAnalysisRevisionId = 'A'
      Object.assign(followup, { questions: [{ question: { data: { required: true } }, currentAnswer: null }] })
      expect(() => analysisCharter({ ...envelope(), followup })).toThrow('inert exit92')
      expect(exit).toHaveBeenNthCalledWith(1, 92)
      expect(exit).toHaveBeenNthCalledWith(2, 92)
    } finally {
      exit.mockRestore()
    }
  })
})
describe('exact source-owned supervisor origin substitution (static AST only)', () => {
  const ownedChildPath = path.resolve('src/lib/quality-journey/codex-app-server/owned-child.ts'),
    supervisorPath = path.resolve('scripts/owned-process-supervisor.mjs')
  const source = readFileSync(ownedChildPath, 'utf8')
  it('inverts exactly and preserves the actual emitted launch-site resource URL including spaces', async () => {
    const actual = preserveAnalysisOwnedChildOrigin(ownedChildPath, source, { ownedChildPath, supervisorPath })
    const change = actual.receipt.replacement
    expect(
      actual.contents.slice(0, change.start) +
        change.originalText +
        actual.contents.slice(change.start + change.replacementText.length),
    ).toBe(source)
    expect(actual.receipt.originalSha256).toBe(actual.receipt.inverseSha256)
    expect(fileURLToPath(new URL('../../../../scripts/owned-process-supervisor.mjs', actual.receipt.sourceURL))).toBe(
      supervisorPath,
    )
    expect(
      fileURLToPath(
        new URL(
          '../../../../scripts/owned-process-supervisor.mjs',
          pathToFileURL(path.resolve('.appraisejs/output/chunk.js')),
        ),
      ),
    ).not.toBe(supervisorPath)
    const emitted = await transform(actual.contents, { loader: 'ts', format: 'esm', target: 'node26' })
    expect(
      inspectEmittedAnalysisOwnedChildOrigin(
        [{ filename: '/static/owned-child.js', contents: emitted.code }],
        actual.receipt.sourceURL,
      ).expression,
    ).toContain(JSON.stringify(actual.receipt.sourceURL))
  })
  it.each(['zero', 'two', 'property', 'resource', 'scope'])(
    'rejects %s origin/context drift before static build',
    kind => {
      const changed =
        kind === 'zero'
          ? source.replace('import.meta.url', JSON.stringify(pathToFileURL(ownedChildPath).href))
          : kind === 'two'
            ? source + '\nconst second = import.meta.url\n'
            : kind === 'property'
              ? source.replace('import.meta.url', 'import.meta.href')
              : kind === 'resource'
                ? source.replace('../../../../scripts/owned-process-supervisor.mjs', '../../../foreign.mjs')
                : source.replace('async function launchOwnedFixtureChild', 'async function foreignLaunch')
      expect(() =>
        preserveAnalysisOwnedChildOrigin(ownedChildPath, changed, { ownedChildPath, supervisorPath }),
      ).toThrow()
    },
  )
})
