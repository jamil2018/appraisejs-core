import type { Prisma, PrismaClient } from '@prisma/client'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { validationArtifactSchema, type ValidationArtifact } from '@/lib/plan-contract'
import { compiledCustomExtensionSchema } from '@/lib/validation-ast/custom-extension-compiler'
import { assertSafeGeneratedGherkin } from '@/lib/validation-ast'
import {
  validateStoredValidationAstPublish,
  validateValidationAstRuntimeInput,
  type ValidationAstRuntimeInputV1,
} from '@/services/coordinator/validation-ast-publish-journal-service'
import {
  canonicalRuntimeCapsuleJson,
  hashRuntimeCapsuleBytes,
  runtimeCapsuleManifestSchema,
  runtimeCapsuleSegmentSchema,
  type RuntimeCapsuleManifest,
} from './contracts'
import { canonicalCapsuleCommandReceipt, hashCapsuleCommandReceipt } from './command-receipt-contract'
import { sealCapsuleCommandReceipt } from './command-receipt-sealer'
import { RuntimeCapsuleLeaseRepository } from './lease-repository'
import { RuntimeCapsuleBlobRepository, RuntimeCapsuleRepository } from './repository'
import { materializeRuntimeCapsuleFile, resolveRuntimeCapsulePaths } from './storage'
import { ManagedProjectManifestRepository } from './project-manifest'
import { generateCucumberConfig, generateReviewedFeature, generateSupportFiles } from './file-generator'
import { generateExecutableBindings } from './binding-generator'

type ValidationNode = ValidationArtifact['validations'][number]
type CapsuleFile = { path: string; role: RuntimeCapsuleManifest['files'][number]['role']; bytes: Buffer }
type PublishOperation = Prisma.ValidationAstPublishOperationGetPayload<{
  include: { plan: true; targetProject: true; extensionReviews: true }
}>
type MaterializerTestRun = Prisma.TestRunGetPayload<{ include: { environment: true } }>

const GENERATOR = { id: 'appraise.validation-ast-capsule', version: '1' } as const
const APPRAISE_RUNTIME_IMPORT = pathToFileURL(
  path.resolve(process.cwd(), 'packages/cucumber-runtime/dist/index.js'),
).href
const APPRAISE_HOOKS_IMPORT = pathToFileURL(path.resolve(process.cwd(), 'packages/cucumber-runtime/dist/hooks.js')).href

export function canonicalImmutableReviewedValidationProjection(value: unknown) {
  const parsed = validationArtifactSchema.parse(value)
  const {
    approvals: _approvals,
    validationDecisions: _validationDecisions,
    reviewSubmittedAt: _reviewSubmittedAt,
    baselineAttempts: _baselineAttempts,
    baselineAcknowledgements: _baselineAcknowledgements,
    baselineDecision: _baselineDecision,
    implementation: _implementation,
    ...immutable
  } = parsed
  void [_approvals, _validationDecisions, _reviewSubmittedAt, _baselineAttempts, _baselineAcknowledgements]
  void [_baselineDecision, _implementation]
  return canonicalContractJson(immutable)
}
function expectedCases(node: ValidationNode, runtimeInput: ValidationAstRuntimeInputV1) {
  const suiteByCase = new Map<string, string>()
  for (const suite of node.appraiseArtifacts.testSuites)
    for (const caseId of suite.testCaseIds) {
      if (suiteByCase.has(caseId)) throw new Error(`Reviewed projected case ${caseId} belongs to multiple suites.`)
      suiteByCase.set(caseId, suite.id)
    }
  if (suiteByCase.size !== node.appraiseArtifacts.testCases.length)
    throw new Error('Reviewed projection has missing or extra suite/case associations.')
  if (runtimeInput.expected.scenarioCount !== runtimeInput.expected.scenarios.length)
    throw new Error('Reviewed runtime input scenario count is inconsistent.')
  const runtimeScenarioByCase = new Map(runtimeInput.expected.scenarios.map(item => [item.caseId, item]))
  if (runtimeScenarioByCase.size !== runtimeInput.expected.scenarios.length)
    throw new Error('Reviewed runtime input contains duplicate expected cases.')
  const cases = node.appraiseArtifacts.testCases.map(testCase => {
    const suiteId = suiteByCase.get(testCase.id)
    if (!suiteId) throw new Error(`Reviewed projected case ${testCase.id} has no suite.`)
    const runtimeScenario = runtimeScenarioByCase.get(testCase.id)
    if (!runtimeScenario) throw new Error(`Reviewed runtime input is missing projected case ${testCase.id}.`)
    if (
      canonicalRuntimeCapsuleJson(testCase.steps.map(step => step.id)) !==
      canonicalRuntimeCapsuleJson(runtimeScenario.stepIds)
    )
      throw new Error(`Reviewed runtime input step identities differ for case ${testCase.id}.`)
    return { validationId: node.id, suiteId, caseId: testCase.id, scenarioId: runtimeScenario.scenarioId }
  })
  const ids = cases.map(item => item.caseId)
  if (new Set(ids).size !== ids.length) throw new Error('Reviewed projection contains duplicate expected cases.')
  return cases.sort((left, right) => left.caseId.localeCompare(right.caseId))
}

export function buildReviewedRuntimeCapsuleFiles(input: {
  node: ValidationNode
  runtimeInput: ValidationAstRuntimeInputV1
  extensionArtifacts: unknown[]
}) {
  const cases = expectedCases(input.node, input.runtimeInput)
  const bindings = input.node.appraiseArtifacts.testCases.map(testCase => ({
    caseId: testCase.id,
    steps: [...testCase.steps]
      .sort((left, right) => left.order - right.order)
      .map(step => ({
        id: step.id,
        keywordText: step.gherkinStep,
        action: step.templateStepName,
        parameters: [...step.parameters].sort((left, right) => left.name.localeCompare(right.name)),
      })),
  }))
  const selectors = Object.fromEntries(
    input.runtimeInput.locators.flatMap(locator => [
      [locator.binding.id, locator.binding.value],
      [locator.binding.name, locator.binding.value],
    ]),
  )
  const extensions = input.extensionArtifacts
    .map(value => compiledCustomExtensionSchema.parse(value))
    .sort((left, right) =>
      `${left.extension.id}@${left.extension.version}`.localeCompare(
        `${right.extension.id}@${right.extension.version}`,
      ),
    )
    .map(extension => {
      const extensionId = runtimeCapsuleSegmentSchema.parse(extension.extension.id)
      if (!/^\d+(?:\.\d+){0,2}$/.test(extension.extension.version))
        throw new Error('Reviewed extension version is not a safe portable path token.')
      return {
        path: `extensions/${extensionId}/v${extension.extension.version}.mjs`,
        role: 'extension' as const,
        bytes: Buffer.from(extension.compiledSource),
      }
    })
  const profileImports = [
    `bindings/${input.node.id}.mjs`,
    ...extensions.map(file => file.path),
    'support/world.mjs',
    'support/hooks.mjs',
  ]
  const defaultProfile = {
    paths: [`features/${input.node.id}.feature`],
    import: profileImports,
    format: ['json:reports/cucumber.json'],
    publishQuiet: true,
  }
  const files: CapsuleFile[] = [
    {
      path: `features/${input.node.id}.feature`,
      role: 'feature',
      bytes: Buffer.from(generateReviewedFeature(input.node)),
    },
    {
      path: `bindings/${input.node.id}.mjs`,
      role: 'binding',
      bytes: Buffer.from(generateExecutableBindings({ bindings, selectors, runtimeImport: APPRAISE_RUNTIME_IMPORT })),
    },
    ...extensions,
    ...generateSupportFiles(APPRAISE_RUNTIME_IMPORT, APPRAISE_HOOKS_IMPORT),
    {
      path: 'cucumber.mjs',
      role: 'config',
      bytes: Buffer.from(
        generateCucumberConfig({
          featurePath: defaultProfile.paths[0]!,
          imports: profileImports,
          canonicalJson: canonicalRuntimeCapsuleJson,
        }),
      ),
    },
    { path: 'expected-cases.json', role: 'expected-cases', bytes: Buffer.from(canonicalRuntimeCapsuleJson(cases)) },
  ]
  return { cases, files: files.sort((left, right) => left.path.localeCompare(right.path)) }
}

function reviewedValidationFor(operation: PublishOperation) {
  validateStoredValidationAstPublish(operation)
  if (!operation.runtimeInputHash || !operation.runtimeInputJson)
    throw new Error('Reviewed AST publication is missing its immutable runtime input snapshot.')
  if (operation.phase !== 'review_ready') throw new Error('Runtime capsules require a review-ready AST publication.')
  try {
    if (!operation.plan.validationJson) throw new Error('missing validation projection')
    const reviewed = validationArtifactSchema.parse(JSON.parse(operation.validationProjectionJson))
    const current = validationArtifactSchema.parse(JSON.parse(operation.plan.validationJson))
    if (
      canonicalImmutableReviewedValidationProjection(current) !==
      canonicalImmutableReviewedValidationProjection(reviewed)
    )
      throw new Error('different immutable projection')
    return reviewed
  } catch {
    throw new Error('Current plan validation projection differs from the reviewed publication.')
  }
}

function assertMaterializationOwnership(operation: PublishOperation, testRun: MaterializerTestRun) {
  if (
    testRun.planId !== operation.planId ||
    testRun.targetProjectId !== operation.targetProjectId ||
    operation.plan.targetProjectId !== operation.targetProjectId
  )
    throw new Error('TestRun, plan, publication, and target project ownership do not match.')
}

function assertReviewedPhase2Node(operation: PublishOperation, node: ValidationNode) {
  if (
    node.astProvenance?.astHash !== operation.astHash ||
    node.astProvenance?.schemaVersion !== '2' ||
    node.astProvenance.executionAuthority !== 'reviewed_publication'
  )
    throw new Error('Canonical validation node is not the exact reviewed compiler review AST projection.')
}

function assertReviewedPublicationProvenance(operation: PublishOperation, node: ValidationNode) {
  const provenance = node.astProvenance
  if (
    provenance?.schemaVersion !== '2' ||
    provenance.publishOperationId !== operation.id ||
    provenance.receiptHash !== operation.receiptHash ||
    provenance.runtimeInputHash !== operation.runtimeInputHash
  )
    throw new Error('Canonical validation provenance does not match the exact reviewed publication snapshot.')
}

function reviewedNodeFor(operation: PublishOperation, validation: ValidationArtifact) {
  const logical = JSON.parse(operation.projectionJson) as { validationNode?: unknown; gherkin?: unknown }
  assertSafeGeneratedGherkin(logical.gherkin)
  const node = validation.validations.find(item => item.id === operation.astId)
  if (!node || canonicalContractJson(node) !== canonicalContractJson(logical.validationNode))
    throw new Error('Reviewed logical projection does not match the current canonical validation node.')
  assertReviewedPhase2Node(operation, node)
  assertReviewedPublicationProvenance(operation, node)
  return node
}

async function buildCapsuleManifest(
  operation: PublishOperation & { runtimeInputHash: string },
  testRun: MaterializerTestRun,
  node: ValidationNode,
) {
  const runtimeInput = validateValidationAstRuntimeInput({
    operation,
    projectionJson: operation.projectionJson,
    extensionReviews: operation.extensionReviews,
  })
  const extensionArtifacts = operation.extensionReviews.map(review => JSON.parse(review.artifactJson))
  const built = buildReviewedRuntimeCapsuleFiles({ node, runtimeInput, extensionArtifacts })
  const commandReceipt = await sealCapsuleCommandReceipt({ operation, testRun, runtimeInput, built })
  built.files.push({
    path: 'command-receipt.json',
    role: 'command-receipt',
    bytes: Buffer.from(canonicalCapsuleCommandReceipt(commandReceipt)),
  })
  built.files.sort((left, right) => left.path.localeCompare(right.path))
  const manifest = runtimeCapsuleManifestSchema.parse({
    schemaVersion: '1',
    projectId: operation.targetProjectId,
    validationHash: operation.validationHash,
    runId: testRun.runId,
    operationHash: operation.operationHash,
    projectionHash: operation.projectionHash,
    receiptHash: operation.receiptHash,
    runtimeInputHash: operation.runtimeInputHash,
    commandReceipt: { path: 'command-receipt.json', hash: hashCapsuleCommandReceipt(commandReceipt) },
    generator: GENERATOR,
    expectedCases: built.cases,
    files: built.files.map(file => ({
      path: file.path,
      role: file.role,
      hash: hashRuntimeCapsuleBytes(file.bytes),
      size: file.bytes.byteLength,
    })),
  })
  return { built, manifest }
}

export class RuntimeCapsuleMaterializer {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly appraiseRoot: string,
  ) {}

  async materialize(input: { operationId: string; testRunId: string }) {
    const operation = await this.prisma.validationAstPublishOperation.findUniqueOrThrow({
      where: { id: input.operationId },
      include: {
        plan: true,
        targetProject: true,
        extensionReviews: { orderBy: [{ extensionId: 'asc' }, { version: 'asc' }] },
      },
    })
    const reviewedValidation = reviewedValidationFor(operation)
    const testRun = await this.prisma.testRun.findUniqueOrThrow({
      where: { id: input.testRunId },
      include: { environment: true },
    })
    assertMaterializationOwnership(operation, testRun)
    const node = reviewedNodeFor(operation, reviewedValidation)
    const { built, manifest } = await buildCapsuleManifest(
      { ...operation, runtimeInputHash: operation.runtimeInputHash! },
      testRun,
      node,
    )
    await new ManagedProjectManifestRepository(this.prisma, this.appraiseRoot).refresh(operation.targetProjectId)
    const leases = new RuntimeCapsuleLeaseRepository(this.prisma)
    const identity = {
      projectId: operation.targetProjectId,
      validationHash: operation.validationHash,
      runId: testRun.runId,
    }
    const paths = resolveRuntimeCapsulePaths({ appraiseRoot: this.appraiseRoot, ...identity })
    return withRuntimeCapsuleLeaseHeartbeat(leases, identity, async assertOwned => {
      const blobs = new RuntimeCapsuleBlobRepository(this.prisma, this.appraiseRoot)
      for (const [index, file] of built.files.entries()) {
        await assertOwned()
        const blob = await blobs.put({
          projectId: operation.targetProjectId,
          contentHash: manifest.files[index]!.hash,
          bytes: file.bytes,
        })
        await assertOwned()
        await materializeRuntimeCapsuleFile({
          paths,
          filePath: file.path,
          blobPath: path.join(this.appraiseRoot, 'projects', operation.targetProjectId, blob.storagePath),
          contentHash: manifest.files[index]!.hash,
          expectedSize: manifest.files[index]!.size,
        })
      }
      await assertOwned()
      const repository = new RuntimeCapsuleRepository(this.prisma, this.appraiseRoot)
      const row = await repository.create({
        projectId: operation.targetProjectId,
        testRunId: testRun.id,
        runId: testRun.runId,
        validationHash: operation.validationHash,
        manifest,
        assertLeaseOwned: assertOwned,
      })
      return { row, manifest }
    })
  }
}

type LeaseIdentity = { projectId: string; validationHash: string; runId: string }

export async function withRuntimeCapsuleLeaseHeartbeat<T>(
  leases: RuntimeCapsuleLeaseRepository,
  identity: LeaseIdentity,
  work: (assertOwned: () => Promise<void>) => Promise<T>,
  options: { durationMs?: number; heartbeatMs?: number } = {},
): Promise<T> {
  const durationMs = options.durationMs ?? 30_000
  const heartbeatMs = options.heartbeatMs ?? Math.max(1_000, Math.floor(durationMs / 3))
  if (heartbeatMs >= durationMs) throw new Error('Runtime capsule heartbeat must occur before lease expiry.')
  const lease = await leases.acquire({ ...identity, durationMs })
  let heartbeatFailure: unknown
  let renewal: Promise<void> | null = null
  const renewOnce = async () => {
    if (heartbeatFailure) throw heartbeatFailure
    try {
      await leases.renew({ ...identity, ownerToken: lease.ownerToken, durationMs })
    } catch (error) {
      heartbeatFailure = error
      throw error
    }
  }
  const assertOwned = async () => {
    if (renewal) await renewal
    if (heartbeatFailure) throw heartbeatFailure
    const current = renewOnce()
    const tracked = current.finally(() => {
      if (renewal === tracked) renewal = null
    })
    renewal = tracked
    await tracked
  }
  const timer = setInterval(() => {
    if (renewal || heartbeatFailure) return
    const current = renewOnce()
    const tracked = current.finally(() => {
      if (renewal === tracked) renewal = null
    })
    renewal = tracked
    void tracked.catch(() => undefined)
  }, heartbeatMs)
  timer.unref?.()
  try {
    return await work(assertOwned)
  } finally {
    clearInterval(timer)
    const pendingRenewal = renewal as Promise<void> | null
    await pendingRenewal?.catch(() => undefined)
    const released = await leases.release({ ...identity, ownerToken: lease.ownerToken })
    if (!released) throw new Error('Runtime capsule lease ownership changed before release.')
    if (heartbeatFailure) throw heartbeatFailure
  }
}
