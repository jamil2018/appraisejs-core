import type { Prisma, PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { validationArtifactSchema, type ValidationArtifact } from '@/lib/plan-contract'
import { compiledCustomExtensionSchema } from '@/lib/validation-ast/custom-extension-compiler'
import { assertSafeGeneratedGherkin } from '@/lib/validation-ast'
import {
  validateStoredValidationAstPublish,
  validateValidationAstRuntimeInput,
  type ValidationAstRuntimeInput,
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
import { resolveRuntimeStepDefinitionClosure, type SealedRuntimeStepDefinition } from './step-definition-closure'
import { stepDefinitionContentHash } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'
import {
  recordStepDefinitionTelemetry,
  telemetryContextForPlan,
} from '@/services/step-definition/step-definition-telemetry'

type ValidationNode = ValidationArtifact['validations'][number]
type CapsuleFile = { path: string; role: RuntimeCapsuleManifest['files'][number]['role']; bytes: Buffer }
type PublishOperation = Prisma.ValidationAstPublishOperationGetPayload<{
  include: { plan: true; targetProject: true; extensionReviews: true }
}>
type MaterializerTestRun = Prisma.TestRunGetPayload<{ include: { environment: true } }>
type RuntimeExtensionArtifact = {
  id: string
  version: string
  sourceHash: string
  compiledHash: string
  compiledSource: string
}
const runtimeExtensionArtifactSchema = z.object({
  id: z.string().min(1).max(80),
  version: z.string().regex(/^\d+(?:\.\d+){0,2}$/),
  sourceHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  compiledHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  compiledSource: z.string().max(262_144),
})
type ReviewedExtensionBinding = Extract<
  SealedRuntimeStepDefinition['definition']['execution'],
  { kind: 'reviewed-extension' }
>
type PersistedReviewedExtension = NonNullable<Awaited<ReturnType<PrismaClient['stepReviewedExtension']['findFirst']>>>

const GENERATOR = { id: 'appraise.validation-ast-capsule', version: '2' } as const
const APPRAISE_RUNTIME_IMPORT = pathToFileURL(
  path.resolve(process.cwd(), 'packages/cucumber-runtime/dist/index.js'),
).href
const APPRAISE_HOOKS_IMPORT = pathToFileURL(path.resolve(process.cwd(), 'packages/cucumber-runtime/dist/hooks.js')).href

function matchesExtensionByteHash(value: string, expectedHash: string) {
  return (
    expectedHash === stepDefinitionContentHash(value) ||
    expectedHash === `sha256:${createHash('sha256').update(value).digest('hex')}`
  )
}

function persistedLifecycleCorrelation(operation: { planId: string; runtimeInputJson: string | null }) {
  try {
    const parsed = JSON.parse(operation.runtimeInputJson ?? '') as {
      lifecycleCorrelation?: { planId?: unknown; correlationId?: unknown }
    }
    const value = parsed.lifecycleCorrelation
    if (typeof value?.planId === 'string' && typeof value.correlationId === 'string')
      return { planId: value.planId, correlationId: value.correlationId }
  } catch {
    // The runtime-input validator remains the authority for normal execution;
    // this is only a bounded telemetry fallback in an error path.
  }
  return undefined
}

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
function expectedCases(node: ValidationNode, runtimeInput: ValidationAstRuntimeInput) {
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
  runtimeInput: ValidationAstRuntimeInput
  extensionArtifacts: unknown[]
  sealedDefinitions?: Array<Pick<SealedRuntimeStepDefinition, 'step' | 'definition'>>
  verifiedExtensionArtifacts?: boolean
}) {
  const cases = expectedCases(input.node, input.runtimeInput)
  const bindings = input.node.appraiseArtifacts.testCases.map(testCase => ({
    caseId: testCase.id,
    steps: [...testCase.steps]
      .sort((left, right) => left.order - right.order)
      .map(step => ({
        id: step.id,
        keywordText: step.gherkinStep,
        invocation: step.invocation,
      })),
  }))
  if (bindings.some(testCase => testCase.steps.some(step => !step.invocation)))
    throw new Error('Runtime capsule bindings require exact Step Invocations.')
  const selectors = Object.fromEntries(
    input.runtimeInput.locators.flatMap(locator => [
      [locator.binding.id, locator.binding.value],
      [locator.binding.name, locator.binding.value],
    ]),
  )
  const extensions = input.extensionArtifacts
    .map(artifact => runtimeExtensionArtifact(artifact, input.verifiedExtensionArtifacts === true))
    .sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`))
    .map(extension => {
      const extensionId = runtimeCapsuleSegmentSchema.parse(extension.id)
      if (!/^\d+(?:\.\d+){0,2}$/.test(extension.version))
        throw new Error('Reviewed extension version is not a safe portable path token.')
      return {
        id: extension.id,
        version: extension.version,
        sourceHash: extension.sourceHash,
        compiledHash: extension.compiledHash,
        path: `extensions/${extensionId}/v${extension.version}.mjs`,
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
      bytes: Buffer.from(
        generateExecutableBindings({
          bindings,
          selectors,
          sealedDefinitions: (input.sealedDefinitions ?? []).map(sealed => ({
            step: sealed.step,
            definition: sealed.definition,
          })),
          extensionModules: Object.fromEntries(
            extensions.map(extension => [`${extension.id}@${extension.version}`, `../${extension.path}`]),
          ),
          runtimeImport: APPRAISE_RUNTIME_IMPORT,
        }),
      ),
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
  return {
    cases,
    bindings,
    extensions: extensions.map(({ id, version, sourceHash, compiledHash, path }) => ({
      id,
      version,
      sourceHash,
      compiledHash,
      path,
    })),
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  }
}

function compiledRuntimeExtensionArtifact(
  compiled: ReturnType<typeof compiledCustomExtensionSchema.safeParse>,
): RuntimeExtensionArtifact | undefined {
  if (!compiled.success) return undefined
  const artifact = compiled.data
  runtimeCapsuleSegmentSchema.parse(artifact.extension.id)
  if (!/^\d+(?:\.\d+){0,2}$/.test(artifact.extension.version))
    throw new Error('Reviewed extension version is not a safe portable path token.')
  if (
    !matchesExtensionByteHash(artifact.source, artifact.sourceHash) ||
    !matchesExtensionByteHash(artifact.compiledSource, artifact.compiledHash)
  )
    throw new Error('Reviewed extension artifact bytes do not match their declared hashes.')
  return {
    id: artifact.extension.id,
    version: artifact.extension.version,
    sourceHash: artifact.sourceHash,
    compiledHash: artifact.compiledHash,
    compiledSource: artifact.compiledSource,
  }
}

function runtimeExtensionArtifact(value: unknown, allowVerifiedCompact = false): RuntimeExtensionArtifact {
  const compact = runtimeExtensionArtifactSchema.safeParse(value)
  if (allowVerifiedCompact && compact.success) {
    runtimeCapsuleSegmentSchema.parse(compact.data.id)
    if (!matchesExtensionByteHash(compact.data.compiledSource, compact.data.compiledHash))
      throw new Error('Runtime capsules require an exact reviewed extension compiled hash.')
    return compact.data
  }
  const artifact = compiledRuntimeExtensionArtifact(compiledCustomExtensionSchema.safeParse(value))
  if (!artifact)
    throw new Error('Runtime capsules require the exact reviewed extension artifact schema and compiled hashes.')
  return artifact
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

async function reviewedExtensionArtifacts(
  operation: PublishOperation,
  sealedDefinitions: SealedRuntimeStepDefinition[],
  prisma: PrismaClient,
): Promise<RuntimeExtensionArtifact[]> {
  const bindings = reviewedExtensionBindings(sealedDefinitions)
  const reviews = reviewedExtensionReviews(operation, bindings)
  if (bindings.size === 0) return []
  const persisted = await prisma.stepReviewedExtension.findMany({
    where: {
      OR: [...bindings.values()].map(binding => ({
        id: binding.extensionId,
        version: binding.extensionVersion,
      })),
    },
  })
  const persistedByKey = new Map(persisted.map(extension => [`${extension.id}@${extension.version}`, extension]))
  if (persistedByKey.size !== bindings.size)
    throw new Error('A sealed reviewed-extension binding has no registered reviewed artifact.')
  return [...bindings.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, binding]) => verifiedRuntimeExtension(key, binding, reviews.get(key)!, persistedByKey.get(key)))
}

function reviewedExtensionBindings(sealedDefinitions: SealedRuntimeStepDefinition[]) {
  const bindings = new Map<string, ReviewedExtensionBinding>()
  for (const sealed of sealedDefinitions) {
    const execution = sealed.definition.execution
    if (execution.kind !== 'reviewed-extension') continue
    const key = `${execution.extensionId}@${execution.extensionVersion}`
    const existing = bindings.get(key)
    if (
      existing &&
      (existing.sourceHash !== execution.sourceHash ||
        existing.compiledHash !== execution.compiledHash ||
        existing.exportName !== execution.exportName)
    )
      throw new Error(`Sealed reviewed-extension binding ${key} conflicts within the definition closure.`)
    bindings.set(key, execution)
  }
  return bindings
}

function reviewedExtensionReviews(operation: PublishOperation, bindings: Map<string, ReviewedExtensionBinding>) {
  const reviews = new Map(operation.extensionReviews.map(review => [`${review.extensionId}@${review.version}`, review]))
  if (reviews.size !== operation.extensionReviews.length || reviews.size !== bindings.size)
    throw new Error('Reviewed extension evidence does not exactly match the sealed definition closure.')
  for (const key of bindings.keys())
    if (!reviews.has(key)) throw new Error(`Reviewed extension ${key} is missing publication evidence.`)
  return reviews
}

function verifiedRuntimeExtension(
  key: string,
  binding: ReviewedExtensionBinding,
  review: PublishOperation['extensionReviews'][number],
  artifact: PersistedReviewedExtension | undefined,
): RuntimeExtensionArtifact {
  if (!artifact) throw new Error(`Reviewed extension ${key} is missing its registered artifact.`)
  const expected = [binding.sourceHash, binding.compiledHash, review.artifactHash]
  const recorded = [review.sourceHash, review.compiledHash, artifact.artifactHash]
  const persisted = [artifact.sourceHash, artifact.compiledHash, artifact.artifactHash]
  const conformance = JSON.parse(artifact.conformanceJson)
  const conformanceHashMatches =
    artifact.conformanceHash === stepDefinitionContentHash(conformance) ||
    artifact.conformanceHash ===
      `sha256:${createHash('sha256').update(canonicalContractJson(conformance)).digest('hex')}`
  if (
    expected.some((value, index) => value !== recorded[index]) ||
    recorded.some((value, index) => value !== persisted[index]) ||
    !matchesExtensionByteHash(artifact.source, artifact.sourceHash) ||
    !matchesExtensionByteHash(artifact.compiledSource, artifact.compiledHash) ||
    !conformanceHashMatches
  )
    throw new Error(`Reviewed extension ${key} does not match its exact publication evidence.`)
  return {
    id: artifact.id,
    version: artifact.version,
    sourceHash: artifact.sourceHash,
    compiledHash: artifact.compiledHash,
    compiledSource: artifact.compiledSource,
  }
}

async function buildCapsuleManifest(
  operation: PublishOperation & { runtimeInputHash: string },
  testRun: MaterializerTestRun,
  node: ValidationNode,
  prisma: PrismaClient,
) {
  const runtimeInput = validateValidationAstRuntimeInput({
    operation,
    projectionJson: operation.projectionJson,
    extensionReviews: operation.extensionReviews,
  })
  const rootInvocations = node.appraiseArtifacts.testCases.flatMap(testCase =>
    testCase.steps
      .sort((left, right) => left.order - right.order)
      .flatMap(step => (step.invocation ? [step.invocation] : [])),
  )
  if (rootInvocations.length === 0) throw new Error('Runtime capsule requires exact projected Step Invocations.')
  const sealedDefinitions = await resolveRuntimeStepDefinitionClosure(
    rootInvocations.map(invocation => invocation.step),
    async step =>
      prisma.stepDefinition.findUnique({
        where: { id_version: { id: step.id, version: step.version } },
        include: { publicationReceipt: true },
      }),
  )
  const extensionArtifacts = await reviewedExtensionArtifacts(operation, sealedDefinitions, prisma)
  const built = buildReviewedRuntimeCapsuleFiles({
    node,
    runtimeInput,
    extensionArtifacts,
    sealedDefinitions,
    verifiedExtensionArtifacts: true,
  })
  const commandReceipt = await sealCapsuleCommandReceipt({ operation, testRun, runtimeInput, built })
  built.files.push({
    path: 'command-receipt.json',
    role: 'command-receipt',
    bytes: Buffer.from(canonicalCapsuleCommandReceipt(commandReceipt)),
  })
  built.files.sort((left, right) => left.path.localeCompare(right.path))
  const manifest = runtimeCapsuleManifestSchema.parse({
    schemaVersion: '2',
    projectId: operation.targetProjectId,
    validationHash: operation.validationHash,
    runId: testRun.runId,
    operationHash: operation.operationHash,
    projectionHash: operation.projectionHash,
    receiptHash: operation.receiptHash,
    runtimeInputHash: operation.runtimeInputHash,
    ...(runtimeInput.lifecycleCorrelation ? { lifecycleCorrelation: runtimeInput.lifecycleCorrelation } : {}),
    commandReceipt: { path: 'command-receipt.json', hash: hashCapsuleCommandReceipt(commandReceipt) },
    generator: GENERATOR,
    rootInvocations,
    stepDefinitions: sealedDefinitions.map(sealed => ({
      step: sealed.step,
      definition: sealed.definition,
      definitionHash: sealed.hashes.definition,
      humanProjectionHash: sealed.hashes.humanProjection,
      agentContractHash: sealed.hashes.agentContract,
      executionHash: sealed.hashes.execution,
      publicationReceiptHash: sealed.hashes.publicationReceipt,
    })),
    extensions: built.extensions,
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
    try {
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
        this.prisma,
      )
      await new ManagedProjectManifestRepository(this.prisma, this.appraiseRoot).refresh(operation.targetProjectId)
      const leases = new RuntimeCapsuleLeaseRepository(this.prisma)
      const identity = {
        projectId: operation.targetProjectId,
        validationHash: operation.validationHash,
        runId: testRun.runId,
      }
      const paths = resolveRuntimeCapsulePaths({ appraiseRoot: this.appraiseRoot, ...identity })
      return await withRuntimeCapsuleLeaseHeartbeat(leases, identity, async assertOwned => {
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
        const telemetry =
          manifest.lifecycleCorrelation ?? (await telemetryContextForPlan(this.prisma, operation.planId))
        await Promise.all(
          manifest.rootInvocations.map(invocation =>
            recordStepDefinitionTelemetry(this.prisma, {
              surface: 'runtime',
              outcome: 'runtime_ready',
              correlationId: telemetry.correlationId,
              planId: telemetry.planId,
              step: { id: invocation.step.id, version: invocation.step.version },
              payload: {},
            }),
          ),
        )
        return { row, manifest }
      })
    } catch (error) {
      const telemetry =
        persistedLifecycleCorrelation(operation) ?? (await telemetryContextForPlan(this.prisma, operation.planId))
      await recordStepDefinitionTelemetry(this.prisma, {
        surface: 'runtime',
        outcome: 'runtime_blocked',
        correlationId: telemetry.correlationId,
        planId: telemetry.planId,
        payload: { reason: 'runtime_readiness' },
      }).catch(() => undefined)
      throw error
    }
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
