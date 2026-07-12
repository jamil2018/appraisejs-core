import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'
import { sqliteTestClient } from '@/test/validation-ast-test-fixtures'
import {
  reviewedCapsuleAstHash as astHash,
  reviewedCapsuleHashText as hashText,
  reviewedCapsuleHashValue as hashValue,
  reviewedExtensionFixture as reviewedExtension,
  reviewedRuntimeInputFixture as reviewedRuntimeInput,
  seedReviewedCapsuleLifecycleFixture,
  validationForReviewedCapsule as validationFor,
} from '@/test/reviewed-capsule-lifecycle-fixture'
import {
  buildReviewedRuntimeCapsuleFiles,
  canonicalImmutableReviewedValidationProjection,
  RuntimeCapsuleMaterializer,
  withRuntimeCapsuleLeaseHeartbeat,
} from './materializer'
import { buildCapsuleSelectionTagExpression, canonicalCapsuleBaseUrl } from './command-receipt-sealer'
import {
  hashRuntimeCapsuleBytes,
  hashCapsuleCommandReceipt,
  parseCanonicalCapsuleCommandReceipt,
  RuntimeCapsuleBlobRepository,
  RuntimeCapsuleLeaseRepository,
  RuntimeCapsuleRepository,
  RuntimeCapsulePreflight,
  defaultCapsulePreflightDependencies,
  ManagedProjectManifestRepository,
} from './index'

async function writeCapsuleFiles(capsule: string, files: Array<{ path: string; bytes: Uint8Array }>) {
  for (const file of files) {
    const destination = path.join(capsule, file.path)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, file.bytes)
  }
}

afterEach(() => vi.useRealTimers())

describe('reviewed validation immutable projection', () => {
  const reviewed = () => validationFor('plan-one', 'operation-one', hashText('receipt'), hashText('runtime'))

  it('excludes Appraise-owned mutable lifecycle and reconciliation state', () => {
    const current = reviewed()
    current.baselineAttempts = []
    current.baselineAcknowledgements = []
    current.baselineDecision = 'accepted'
    current.validationDecisions = []
    current.approvals = []
    current.implementation = {
      taskStates: {},
      approvedGroupIds: [],
      pausedTaskIds: [],
      validationRuns: [],
      commits: [],
      reconciliationReceipts: [],
      evidenceProtected: true,
    }
    expect(canonicalImmutableReviewedValidationProjection(current)).toBe(
      canonicalImmutableReviewedValidationProjection(reviewed()),
    )
  })

  it.each([
    [
      'title',
      (value: ReturnType<typeof reviewed>) => (value.validations[0]!.appraiseArtifacts.testCases[0]!.title = 'Changed'),
    ],
    [
      'steps',
      (value: ReturnType<typeof reviewed>) => (value.validations[0]!.appraiseArtifacts.testCases[0]!.steps = []),
    ],
    [
      'actions',
      (value: ReturnType<typeof reviewed>) =>
        (value.validations[0]!.appraiseArtifacts.testCases[0]!.steps[0]!.templateStepName = 'changed-action@1'),
    ],
    [
      'locators',
      (value: ReturnType<typeof reviewed>) => {
        value.validations[0]!.appraiseArtifacts.locatorGroups = [
          { id: 'navigation-locators', name: 'Navigation', route: '/', moduleId: 'home-module' },
        ]
        value.validations[0]!.appraiseArtifacts.locators = [
          { id: 'home-link', name: 'Home link', value: 'a[href="/"]', locatorGroupId: 'navigation-locators' },
        ]
      },
    ],
    ['matrix', (value: ReturnType<typeof reviewed>) => (value.validations[0]!.matrix[0]!.browser = 'firefox')],
    [
      'provenance',
      (value: ReturnType<typeof reviewed>) => {
        value.validations[0]!.astProvenance!.astHash = hashText('changed-ast')
      },
    ],
    [
      'publication',
      (value: ReturnType<typeof reviewed>) => {
        if (value.validations[0]!.astProvenance?.schemaVersion === '2')
          value.validations[0]!.astProvenance.publishOperationId = 'changed-operation'
      },
    ],
  ])('retains immutable %s drift', (_name, mutate) => {
    const changed = reviewed()
    mutate(changed)
    expect(canonicalImmutableReviewedValidationProjection(changed)).not.toBe(
      canonicalImmutableReviewedValidationProjection(reviewed()),
    )
  })
})

describe('sealed command receipt inputs', () => {
  it('selects each reviewed case as its own validation, suite, and case conjunction', () => {
    expect(
      buildCapsuleSelectionTagExpression([
        { validationId: 'navigation', suiteId: 'home', caseId: 'open', scenarioId: 'open-scenario' },
        { validationId: 'navigation', suiteId: 'account', caseId: 'login', scenarioId: 'login-scenario' },
      ]),
    ).toBe(
      '(@appraise_validation_navigation and @ts_home and @tc_open) or (@appraise_validation_navigation and @ts_account and @tc_login)',
    )
  })

  it('canonicalizes HTTP(S) base URLs and rejects credentials or unsupported protocols', () => {
    expect(canonicalCapsuleBaseUrl('HTTPS://EXAMPLE.COM:443/app')).toBe('https://example.com/app')
    expect(() => canonicalCapsuleBaseUrl('https://user:secret@example.com')).toThrow(/credential-free HTTP\(S\)/)
    expect(() => canonicalCapsuleBaseUrl('file:///tmp/appraise')).toThrow(/credential-free HTTP\(S\)/)
  })
})

describe('reviewed runtime capsule byte generation', () => {
  it('is deterministic and rejects duplicate or incomplete expected-case mappings', () => {
    const receiptHash = hashText('unit-receipt')
    const runtimeInput = reviewedRuntimeInput('project-one', hashText('project-one'), receiptHash)
    const node = validationFor('plan-one', 'operation-one', receiptHash, hashValue(runtimeInput)).validations[0]!
    const first = buildReviewedRuntimeCapsuleFiles({ node, runtimeInput, extensionArtifacts: [] })
    const second = buildReviewedRuntimeCapsuleFiles({ node, runtimeInput, extensionArtifacts: [] })
    expect(first.files.map(file => [file.path, file.bytes.toString()])).toEqual(
      second.files.map(file => [file.path, file.bytes.toString()]),
    )
    expect(first.files.map(file => file.path)).toEqual([...first.files.map(file => file.path)].sort())
    expect(first.files.map(file => file.path)).toContain('expected-cases.json')
    expect(() =>
      buildReviewedRuntimeCapsuleFiles({
        node,
        runtimeInput: { ...runtimeInput, expected: { scenarioCount: 1, scenarios: [] } },
        extensionArtifacts: [],
      }),
    ).toThrow(/count is inconsistent/)
    expect(() =>
      buildReviewedRuntimeCapsuleFiles({
        node,
        runtimeInput: {
          ...runtimeInput,
          expected: {
            scenarioCount: 2,
            scenarios: [runtimeInput.expected.scenarios[0]!, runtimeInput.expected.scenarios[0]!],
          },
        },
        extensionArtifacts: [],
      }),
    ).toThrow(/duplicate/)
    const unsafeExtension = reviewedExtension('project-one', hashText('project-one')).artifact
    expect(() =>
      buildReviewedRuntimeCapsuleFiles({
        node,
        runtimeInput,
        extensionArtifacts: [{ ...unsafeExtension, extension: { ...unsafeExtension.extension, id: '../escape' } }],
      }),
    ).toThrow(/safe opaque identifier/)
    const injected = structuredClone(node)
    injected.appraiseArtifacts.testCases[0]!.title = 'Safe title\n@injected'
    expect(() => buildReviewedRuntimeCapsuleFiles({ node: injected, runtimeInput, extensionArtifacts: [] })).toThrow(
      /single Gherkin line/,
    )
    const injectedStep = structuredClone(node)
    injectedStep.appraiseArtifacts.testCases[0]!.steps[0]!.gherkinStep = 'When the user opens home\nScenario: injected'
    expect(() =>
      buildReviewedRuntimeCapsuleFiles({ node: injectedStep, runtimeInput, extensionArtifacts: [] }),
    ).toThrow(/single Gherkin line/)
  })

  it('registers every frozen projected step with the Appraise-owned Cucumber runtime', async () => {
    const receiptHash = hashText('executable-receipt')
    const runtimeInput = reviewedRuntimeInput('project-one', hashText('project-one'), receiptHash)
    const node = validationFor('plan-one', 'operation-one', receiptHash, hashValue(runtimeInput)).validations[0]!
    const built = buildReviewedRuntimeCapsuleFiles({ node, runtimeInput, extensionArtifacts: [] })
    const capsule = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-capsule-executable-'))
    try {
      await writeCapsuleFiles(capsule, built.files)
      await fs.mkdir(path.join(capsule, 'reports'), { recursive: true })
      expect(() =>
        execFileSync(
          process.execPath,
          [
            path.join(process.cwd(), 'node_modules/@cucumber/cucumber/bin/cucumber.js'),
            '--config',
            'cucumber.mjs',
            '--dry-run',
          ],
          { cwd: capsule, env: { ...process.env, APPRAISE_BASE_URL: 'http://localhost' }, stdio: 'pipe' },
        ),
      ).not.toThrow()
    } finally {
      await fs.rm(capsule, { recursive: true, force: true })
    }
  })

  it('executes a browser step with the frozen reviewed selector and no locator cache', async () => {
    const receiptHash = hashText('selector-receipt')
    const baseInput = reviewedRuntimeInput('project-one', hashText('project-one'), receiptHash)
    const runtimeInput = {
      ...baseInput,
      actions: [{ id: 'browser.mouse.click', version: '1', contentHash: hashText('click-action') }],
      locators: [
        {
          id: 'locator-submit',
          version: '1',
          contentHash: hashText('submit-locator'),
          binding: {
            id: 'submit',
            name: 'Submit button',
            value: '[data-frozen="submit"]',
            locatorGroupId: 'submit-group',
          },
        },
      ],
    }
    const node = validationFor('plan-one', 'operation-one', receiptHash, hashValue(runtimeInput)).validations[0]!
    const step = node.appraiseArtifacts.testCases[0]!.steps[0]!
    step.gherkinStep = 'When the user clicks submit'
    step.templateStepName = 'browser.mouse.click@1'
    step.parameters = [
      {
        name: 'target',
        value: JSON.stringify({ ref: 'locator', id: 'locator-submit', version: '1' }),
        locatorId: 'submit',
        locatorName: 'Submit button',
      },
    ]
    const built = buildReviewedRuntimeCapsuleFiles({ node, runtimeInput, extensionArtifacts: [] })
    const capsule = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-capsule-selector-'))
    try {
      await writeCapsuleFiles(capsule, built.files)
      const observed = path.join(capsule, 'observed-selector.txt')
      const runtimeUrl = pathToFileURL(path.resolve(process.cwd(), 'packages/cucumber-runtime/dist/index.js')).href
      await fs.writeFile(
        path.join(capsule, 'test-support.mjs'),
        `import { Before } from '${runtimeUrl}'\nimport { writeFile } from 'node:fs/promises'\nBefore(function () { this.page = { locator: selector => ({ click: async () => writeFile(${JSON.stringify(observed)}, selector) }), close: async () => {} } })\n`,
      )
      await fs.writeFile(
        path.join(capsule, 'test-cucumber.mjs'),
        `export default { paths: ['features/navigation.feature'], import: ['bindings/navigation.mjs', 'support/world.mjs', 'support/hooks.mjs', 'test-support.mjs'], format: ['json:reports/cucumber.json'], publishQuiet: true }\n`,
      )
      await fs.mkdir(path.join(capsule, 'reports'), { recursive: true })
      execFileSync(
        process.execPath,
        [path.join(process.cwd(), 'node_modules/@cucumber/cucumber/bin/cucumber.js'), '--config', 'test-cucumber.mjs'],
        {
          cwd: capsule,
          env: { ...process.env, APPRAISE_BASE_URL: 'http://localhost', HEADLESS: 'true', BROWSER: 'chromium' },
          stdio: 'pipe',
        },
      )
      await expect(fs.readFile(observed, 'utf8')).resolves.toBe('[data-frozen="submit"]')
    } finally {
      await fs.rm(capsule, { recursive: true, force: true })
    }
  })

  it('keeps ownership during work delayed beyond the original lease duration', async () => {
    vi.useFakeTimers()
    let expiresAt = 0
    const renew = vi.fn().mockImplementation(({ durationMs }) => {
      if (Date.now() >= expiresAt) throw new Error('expired')
      expiresAt = Date.now() + durationMs
      return { ownerToken: 'owner-one', leaseExpiresAt: new Date(expiresAt) }
    })
    const leases = {
      acquire: vi.fn().mockImplementation(({ durationMs }) => {
        expiresAt = Date.now() + durationMs
        return { ownerToken: 'owner-one', leaseExpiresAt: new Date(expiresAt) }
      }),
      renew,
      release: vi.fn().mockImplementation(({ ownerToken }) => ownerToken === 'owner-one' && Date.now() < expiresAt),
    } as unknown as RuntimeCapsuleLeaseRepository
    const delayed = withRuntimeCapsuleLeaseHeartbeat(
      leases,
      { projectId: 'project-one', validationHash: astHash, runId: 'run-one' },
      async assertOwned => {
        await assertOwned()
        await new Promise(resolve => setTimeout(resolve, 25_000))
        await assertOwned()
      },
      { durationMs: 10_000, heartbeatMs: 2_000 },
    )
    await vi.advanceTimersByTimeAsync(15_000)
    expect(expiresAt).toBeGreaterThan(Date.now())
    await vi.advanceTimersByTimeAsync(10_000)
    await delayed
    expect(renew.mock.calls.length).toBeGreaterThan(2)
    vi.useRealTimers()
  })

  it('awaits a deferred renewal and prevents an expired owner from mutating after takeover', async () => {
    let rejectRenewal!: (error: Error) => void
    const deferredRenewal = new Promise<never>((_resolve, reject) => {
      rejectRenewal = reject
    })
    let successorOwnsLease = false
    let mutated = false
    const release = vi.fn().mockImplementation(() => !successorOwnsLease)
    const leases = {
      acquire: vi.fn().mockResolvedValue({ ownerToken: 'owner-one' }),
      renew: vi.fn().mockReturnValue(deferredRenewal),
      release,
    } as unknown as RuntimeCapsuleLeaseRepository
    const attempt = withRuntimeCapsuleLeaseHeartbeat(
      leases,
      { projectId: 'project-one', validationHash: astHash, runId: 'run-one' },
      async assertOwned => {
        await assertOwned()
        mutated = true
      },
      { durationMs: 10_000, heartbeatMs: 2_000 },
    )
    await Promise.resolve()
    successorOwnsLease = true
    rejectRenewal(new Error('lease expired and successor acquired'))
    await expect(attempt).rejects.toThrow(/ownership changed|successor acquired/)
    expect(mutated).toBe(false)
    expect(release).toHaveBeenCalledWith(expect.objectContaining({ ownerToken: 'owner-one' }))
  })
})

describe('reviewed runtime capsule materialization integration', () => {
  let workspace: string
  let client: PrismaClient
  let environmentId: string

  beforeAll(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-reviewed-capsule-'))
    const databasePath = path.join(workspace, 'appraise.db')
    await fs.writeFile(databasePath, '')
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
      stdio: 'pipe',
    })
    client = sqliteTestClient(databasePath)
    environmentId = (
      await client.environment.upsert({
        where: { name: 'capsule-local' },
        update: {},
        create: { name: 'capsule-local', baseUrl: 'http://localhost' },
      })
    ).id
  })

  afterAll(async () => {
    await client?.$disconnect()
    await fs.rm(workspace, { recursive: true, force: true })
  })

  it('isolates equal display names and supports concurrent runs, replay, and drift rejection', async () => {
    const seed = (projectId: string, planId: string, runId: string, extension?: ReturnType<typeof reviewedExtension>) =>
      seedReviewedCapsuleLifecycleFixture({ client, workspace, environmentId, projectId, planId, runId, extension })
    const first = await seed('project-one', 'capsule-plan-one', 'run-one')
    const second = await seed('project-two', 'capsule-plan-two', 'run-two')
    const third = await seed('project-one', 'capsule-plan-three', 'run-three')
    const extension = reviewedExtension('project-three', hashText('project-three'))
    const fourth = await seed('project-three', 'capsule-plan-four', 'run-four', extension)
    const firstRun = first.testRun
    const secondRun = second.testRun
    const thirdRun = third.testRun
    const fourthRun = fourth.testRun
    if (!firstRun || !secondRun || !thirdRun || !fourthRun) throw new Error('Expected seeded test runs')
    const materializer = new RuntimeCapsuleMaterializer(client, path.join(workspace, '.appraise'))
    const [one, two, three, four] = await Promise.all([
      materializer.materialize({ operationId: first.operationId, testRunId: firstRun.id }),
      materializer.materialize({ operationId: second.operationId, testRunId: secondRun.id }),
      materializer.materialize({ operationId: third.operationId, testRunId: thirdRun.id }),
      materializer.materialize({ operationId: fourth.operationId, testRunId: fourthRun.id }),
    ])
    expect(one.row.integrityState).toBe('ready')
    expect(two.row.integrityState).toBe('ready')
    expect(one.row.storagePath).not.toBe(two.row.storagePath)
    const firstReceiptFile = one.manifest.files.find(file => file.role === 'command-receipt')!
    expect(one.manifest.commandReceipt).toEqual({ path: firstReceiptFile.path, hash: firstReceiptFile.hash })
    const firstReceiptBytes = await fs.readFile(
      path.join(workspace, '.appraise', 'projects', 'project-one', one.row.storagePath, firstReceiptFile.path),
      'utf8',
    )
    const firstReceipt = parseCanonicalCapsuleCommandReceipt(firstReceiptBytes)
    expect(hashCapsuleCommandReceipt(firstReceipt)).toBe(firstReceiptFile.hash)
    expect(firstReceipt.ownership.compilerReceiptHash).toBe(one.manifest.receiptHash)
    expect(firstReceipt.runtime.compiler.declarationBundleHash).toBe(
      createCustomExtensionPolicy({
        projectId: 'project-one',
        projectFingerprint: hashText('project-one'),
        capabilityImports: {},
      }).declarationHash,
    )
    expect(firstReceiptFile.hash).not.toBe(one.manifest.receiptHash)
    const replay = await materializer.materialize({ operationId: first.operationId, testRunId: firstRun.id })
    expect(replay.manifest.commandReceipt).toEqual(one.manifest.commandReceipt)
    const firstReceiptPath = path.join(
      workspace,
      '.appraise',
      'projects',
      'project-one',
      one.row.storagePath,
      firstReceiptFile.path,
    )
    await fs.writeFile(firstReceiptPath, Buffer.alloc(Buffer.byteLength(firstReceiptBytes), 120), { mode: 0o600 })
    await expect(
      new RuntimeCapsuleRepository(client, path.join(workspace, '.appraise')).inspect({
        projectId: 'project-one',
        validationHash: one.row.validationHash,
        testRunId: firstRun.id,
        runId: 'run-one',
      }),
    ).resolves.toBe('corrupt')
    await fs.writeFile(firstReceiptPath, firstReceiptBytes, { mode: 0o600 })
    expect(one.row.validationHash).not.toBe(three.row.validationHash)
    expect(one.row.storagePath).not.toBe(three.row.storagePath)
    const preflight = await new RuntimeCapsulePreflight(client, path.join(workspace, '.appraise')).check({
      projectId: 'project-one',
      validationHash: one.row.validationHash,
      testRunId: firstRun.id,
      runId: 'run-one',
    })
    expect(preflight.status, JSON.stringify(preflight)).toBe('ready')
    expect(preflight.resolved.selectedScenarioCount).toBe(1)
    expect(preflight.blockers).toEqual([])
    expect(preflight.checks).toHaveLength(13)
    expect(preflight.checks.every(check => check.status === 'passed')).toBe(true)
    expect(preflight.checks.at(-1)).toMatchObject({ stage: 'dry-run', code: 'PREFLIGHT_READY' })
    const configPath = path.join(workspace, '.appraise', 'projects', 'project-one', one.row.storagePath, 'cucumber.mjs')
    const exactConfig = await fs.readFile(configPath)
    let probeCount = 0
    const runProcess = vi.fn(defaultCapsulePreflightDependencies.runProcess)
    const mutationPreflight = new RuntimeCapsulePreflight(client, path.join(workspace, '.appraise'), {
      ...defaultCapsulePreflightDependencies,
      runProcess,
      async probeOutput(root, relativePath) {
        await defaultCapsulePreflightDependencies.probeOutput(root, relativePath)
        probeCount += 1
        if (probeCount === 3) await fs.writeFile(configPath, 'controlled mutation', { mode: 0o600 })
      },
    })
    const mutated = await mutationPreflight.check({
      projectId: 'project-one',
      validationHash: one.row.validationHash,
      testRunId: firstRun.id,
      runId: 'run-one',
    })
    expect(mutated).toMatchObject({ status: 'blocked', blockers: [{ code: 'CAPSULE_NOT_READY' }] })
    expect(runProcess).not.toHaveBeenCalled()
    await fs.writeFile(configPath, exactConfig, { mode: 0o600 })
    const extensionFile = four.manifest.files.find(file => file.role === 'extension')!
    expect(extensionFile.path).toBe('extensions/reviewed-extension/v1.2.3.mjs')
    const extensionBlob = await client.runtimeCapsuleBlob.findUniqueOrThrow({
      where: {
        targetProjectId_contentHash: { targetProjectId: 'project-three', contentHash: extensionFile.hash },
      },
    })
    await expect(
      fs.readFile(path.join(workspace, '.appraise', 'projects', 'project-three', extensionBlob.storagePath), 'utf8'),
    ).resolves.toBe(extension.artifact.compiledSource)
    expect(one.row.targetProjectId).not.toBe(two.row.targetProjectId)
    expect(await client.runtimeCapsuleBlobReference.count({ where: { capsuleId: one.row.id } })).toBe(
      one.manifest.files.length,
    )
    const runRoot = path.join(workspace, '.appraise', 'projects', 'project-one', one.row.storagePath)
    for (const file of one.manifest.files) {
      const runBytes = await fs.readFile(path.join(runRoot, file.path))
      expect(hashRuntimeCapsuleBytes(runBytes)).toBe(file.hash)
      expect((await fs.stat(path.join(runRoot, file.path))).mode & 0o777).toBe(0o600)
    }
    const repository = new RuntimeCapsuleRepository(client, path.join(workspace, '.appraise'))
    const reference = await client.runtimeCapsuleBlobReference.findFirstOrThrow({
      where: { capsuleId: one.row.id },
      include: { blob: true },
    })
    const blobPath = path.join(workspace, '.appraise', 'projects', 'project-one', reference.blob.storagePath)
    const reviewedBytes = await fs.readFile(blobPath)
    await fs.unlink(blobPath)
    await expect(
      repository.inspect({
        projectId: 'project-one',
        validationHash: one.row.validationHash,
        testRunId: firstRun.id,
        runId: 'run-one',
      }),
    ).resolves.toBe('missing')
    await new RuntimeCapsuleBlobRepository(client, path.join(workspace, '.appraise')).put({
      projectId: 'project-one',
      contentHash: reference.blob.contentHash,
      bytes: reviewedBytes,
    })
    await fs.writeFile(blobPath, Buffer.alloc(reviewedBytes.length, 120))
    await expect(
      repository.inspect({
        projectId: 'project-one',
        validationHash: one.row.validationHash,
        testRunId: firstRun.id,
        runId: 'run-one',
      }),
    ).resolves.toBe('corrupt')
    await fs.writeFile(blobPath, reviewedBytes)
    const foreignBytes = Buffer.from('different reviewed blob')
    const foreign = await new RuntimeCapsuleBlobRepository(client, path.join(workspace, '.appraise')).put({
      projectId: 'project-one',
      contentHash: hashRuntimeCapsuleBytes(foreignBytes),
      bytes: foreignBytes,
    })
    await client.runtimeCapsuleBlobReference.update({ where: { id: reference.id }, data: { blobId: foreign.id } })
    await expect(
      repository.inspect({
        projectId: 'project-one',
        validationHash: one.row.validationHash,
        testRunId: firstRun.id,
        runId: 'run-one',
      }),
    ).resolves.toBe('corrupt')
    await client.runtimeCapsuleBlobReference.update({ where: { id: reference.id }, data: { blobId: reference.blobId } })
    await expect(
      materializer.materialize({ operationId: first.operationId, testRunId: firstRun.id }),
    ).resolves.toMatchObject({ row: { id: one.row.id, integrityState: 'ready' } })

    const runFile = path.join(runRoot, reference.filePath)
    const siblingFile = three.manifest.files.find(file => file.hash === reference.blob.contentHash)!
    const siblingRunFile = path.join(
      workspace,
      '.appraise',
      'projects',
      'project-one',
      three.row.storagePath,
      siblingFile.path,
    )
    const siblingBytesBefore = await fs.readFile(siblingRunFile)
    const blobBytesBefore = await fs.readFile(blobPath)
    expect((await fs.stat(runFile)).ino).not.toBe((await fs.stat(blobPath)).ino)
    expect((await fs.stat(runFile)).ino).not.toBe((await fs.stat(siblingRunFile)).ino)
    await fs.unlink(runFile)
    await fs.writeFile(runFile, Buffer.alloc(reviewedBytes.length, 121), { mode: 0o600 })
    await expect(fs.readFile(blobPath)).resolves.toEqual(blobBytesBefore)
    await expect(fs.readFile(siblingRunFile)).resolves.toEqual(siblingBytesBefore)
    await expect(
      repository.inspect({
        projectId: 'project-one',
        validationHash: one.row.validationHash,
        testRunId: firstRun.id,
        runId: 'run-one',
      }),
    ).resolves.toBe('corrupt')
    await fs.unlink(runFile)
    await fs.copyFile(blobPath, runFile)
    await fs.chmod(runFile, 0o600)
    const secondReference = await client.runtimeCapsuleBlobReference.findFirstOrThrow({
      where: { capsuleId: one.row.id, id: { not: reference.id } },
      include: { blob: true },
    })
    const symlinkedRunFile = path.join(runRoot, secondReference.filePath)
    await fs.unlink(symlinkedRunFile)
    await fs.symlink(blobPath, symlinkedRunFile)
    await expect(
      repository.inspect({
        projectId: 'project-one',
        validationHash: one.row.validationHash,
        testRunId: firstRun.id,
        runId: 'run-one',
      }),
    ).resolves.toBe('corrupt')

    const projectManifests = new ManagedProjectManifestRepository(client, path.join(workspace, '.appraise'))
    const projectManifestPath = path.join(workspace, '.appraise', 'projects', 'project-one', 'project.json')
    const originalProjectManifest = JSON.parse(await fs.readFile(projectManifestPath, 'utf8'))
    expect(originalProjectManifest.projectId).toBe('project-one')
    expect((await fs.stat(projectManifestPath)).mode & 0o777).toBe(0o600)
    await client.targetProject.update({
      where: { id: 'project-one' },
      data: { displayName: 'Renamed target', canonicalPath: path.join(workspace, 'moved-target') },
    })
    const refreshedProjectManifest = await projectManifests.refresh('project-one')
    expect(refreshedProjectManifest).toMatchObject({
      projectId: 'project-one',
      displayName: 'Renamed target',
      canonicalPath: path.join(workspace, 'moved-target'),
      registeredAt: originalProjectManifest.registeredAt,
    })
    await expect(fs.stat(path.join(workspace, '.appraise', 'projects', 'project-one'))).resolves.toBeTruthy()
    await client.targetProject.update({ where: { id: 'project-one' }, data: { fingerprint: hashText('changed') } })
    await expect(projectManifests.inspect('project-one')).resolves.toBe('corrupt')
    await client.targetProject.update({ where: { id: 'project-one' }, data: { fingerprint: hashText('project-one') } })
    await fs.unlink(projectManifestPath)
    await expect(projectManifests.inspect('project-one')).resolves.toBe('missing')
    await projectManifests.refresh('project-one')
    await fs.writeFile(projectManifestPath, '{"schemaVersion":"1","projectId":"foreign"}', { mode: 0o600 })
    await expect(projectManifests.inspect('project-one')).resolves.toBe('corrupt')
    await expect(projectManifests.refresh('project-one')).rejects.toThrow(/corrupt/)

    await client.planProjection.update({
      where: { planId: 'capsule-plan-one' },
      data: { validationJson: JSON.stringify({ drifted: true }) },
    })
    await expect(materializer.materialize({ operationId: first.operationId, testRunId: firstRun.id })).rejects.toThrow(
      /differs from the reviewed publication/,
    )
    await expect(fs.stat(path.join(workspace, 'automation'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
