import type { Prisma, PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { validationArtifactSchema, type ValidationArtifact } from '@/lib/quality-design/validation-artifact-contract'
import { compiledCustomExtensionSchema } from '@/lib/validation-ast/custom-extension-compiler'
import { assertSafeGeneratedGherkin } from '@/lib/validation-ast/gherkin-safety'
import {
  validateValidationAstRuntimeInput,
  type ValidationAstRuntimeInput,
} from '@/lib/quality-design/validation-runtime-input-contract'
import {
  canonicalRuntimeCapsuleJson,
  hashRuntimeCapsuleBytes,
  hashRuntimeCapsuleValue,
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
import { recordStepDefinitionTelemetry } from '@/services/step-definition/step-definition-telemetry'
import { createCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'
import { defaultOperationDefinitions } from '@/lib/operation-catalog/default-operation-registry'
import {
  stepInvocationSchema,
  validateStepInvocationInputs,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

type ValidationNode = ValidationArtifact['validations'][number]
type CapsuleFile = { path: string; role: RuntimeCapsuleManifest['files'][number]['role']; bytes: Buffer }
type QualityPublication = Prisma.QualityValidationPublicationGetPayload<{
  include: { targetProject: true; extensionReviews: true; validationVersion: true }
}>
type CapsulePublication = Pick<
  QualityPublication,
  | 'id'
  | 'targetProjectId'
  | 'targetFingerprint'
  | 'phase'
  | 'operationHash'
  | 'validationHash'
  | 'astId'
  | 'astHash'
  | 'contextHash'
  | 'previewHash'
  | 'receiptHash'
  | 'projectionHash'
  | 'projectionJson'
  | 'validationProjectionJson'
  | 'runtimeInputHash'
  | 'runtimeInputJson'
  | 'extensionReviews'
>
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

function buildReviewedRuntimeCapsuleFiles(input: {
  node: ValidationNode
  runtimeInput: ValidationAstRuntimeInput
  extensionArtifacts: unknown[]
  sealedDefinitions?: Array<Pick<SealedRuntimeStepDefinition, 'step' | 'definition'>>
  verifiedExtensionArtifacts?: boolean
}) {
  const cases = expectedCases(input.node, input.runtimeInput)
  const locatorBindings = input.runtimeInput.locatorBindings ?? []
  const bindings = input.node.appraiseArtifacts.testCases.map(testCase => ({
    caseId: testCase.id,
    steps: [...testCase.steps]
      .sort((left, right) => left.order - right.order)
      .map(step => ({
        id: step.id,
        keywordText: step.gherkinStep,
        invocation: step.invocation,
        locatorCardinalities: Object.fromEntries(
          locatorBindings
            .filter(binding => binding.caseId === testCase.id && binding.stepId === step.id)
            .map(binding => [binding.inputName, binding.cardinality]),
        ),
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
          operationCardinalities: Object.fromEntries(
            (input.runtimeInput.operationCardinalities ?? []).map(binding => [
              binding.operation,
              Object.fromEntries(
                (input.runtimeInput.operationCardinalities ?? [])
                  .filter(candidate => candidate.operation === binding.operation)
                  .map(candidate => [candidate.inputName, candidate.cardinality]),
              ),
            ]),
          ),
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

function assertReviewedPhase2Node(operation: CapsulePublication, node: ValidationNode) {
  if (
    node.astProvenance?.astHash !== operation.astHash ||
    node.astProvenance?.schemaVersion !== '2' ||
    node.astProvenance.executionAuthority !== 'reviewed_publication'
  )
    throw new Error('Canonical validation node is not the exact reviewed compiler review AST projection.')
}

function assertReviewedPublicationProvenance(operation: CapsulePublication, node: ValidationNode) {
  const provenance = node.astProvenance
  if (
    provenance?.schemaVersion !== '2' ||
    provenance.publishOperationId !== operation.id ||
    provenance.receiptHash !== operation.receiptHash ||
    provenance.runtimeInputHash !== operation.runtimeInputHash
  )
    throw new Error('Canonical validation provenance does not match the exact reviewed publication snapshot.')
}

function reviewedNodeFor(operation: CapsulePublication, validation: ValidationArtifact) {
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
  operation: CapsulePublication,
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

function reviewedExtensionReviews(operation: CapsulePublication, bindings: Map<string, ReviewedExtensionBinding>) {
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
  review: CapsulePublication['extensionReviews'][number],
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

async function authoredExtensionArtifacts(sealedDefinitions: SealedRuntimeStepDefinition[], prisma: PrismaClient) {
  const bindings = reviewedExtensionBindings(sealedDefinitions)
  if (bindings.size === 0) return []
  const artifacts = await prisma.stepReviewedExtension.findMany({
    where: {
      OR: [...bindings.values()].map(binding => ({ id: binding.extensionId, version: binding.extensionVersion })),
    },
  })
  const byKey = new Map(artifacts.map(artifact => [`${artifact.id}@${artifact.version}`, artifact]))
  if (byKey.size !== bindings.size)
    throw new Error('Authored runtime capsule reviewed-extension binding has no reviewed artifact.')
  return [...bindings.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, binding]) => {
      const artifact = byKey.get(key)
      if (!artifact || artifact.sourceHash !== binding.sourceHash || artifact.compiledHash !== binding.compiledHash)
        throw new Error(`Authored reviewed extension ${key} does not match its sealed Step Definition.`)
      const conformance = JSON.parse(artifact.conformanceJson)
      const conformanceHash = stepDefinitionContentHash(conformance)
      if (
        !matchesExtensionByteHash(artifact.source, artifact.sourceHash) ||
        !matchesExtensionByteHash(artifact.compiledSource, artifact.compiledHash) ||
        (artifact.conformanceHash !== conformanceHash &&
          artifact.conformanceHash !==
            `sha256:${createHash('sha256').update(canonicalContractJson(conformance)).digest('hex')}`)
      )
        throw new Error(`Authored reviewed extension ${key} lacks valid review artifact evidence.`)
      return {
        id: artifact.id,
        version: artifact.version,
        sourceHash: artifact.sourceHash,
        compiledHash: artifact.compiledHash,
        compiledSource: artifact.compiledSource,
      }
    })
}

async function buildCapsuleManifest(
  operation: CapsulePublication,
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
    source: {
      kind: 'PUBLISHED_VALIDATION',
      sourceHash: operation.validationHash,
      publishOperationId: operation.id,
    },
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

  /** Materialize an immutable Quality ValidationVersion publication. The
   * executable bytes, command receipt, blob store and lease protocol are the
   * same as the former AST publication path; only ownership is Quality-first. */
  async materializeQuality(input: { publicationId: string; testRunId: string }) {
    const publication = await this.prisma.qualityValidationPublication.findUniqueOrThrow({
      where: { id: input.publicationId },
      include: {
        targetProject: true,
        validationVersion: true,
        extensionReviews: { orderBy: [{ extensionId: 'asc' }, { version: 'asc' }] },
      },
    })
    try {
      if (publication.phase !== 'review_ready')
        throw new Error('Runtime capsules require a review-ready Quality validation publication.')
      const testRun = await this.prisma.testRun.findUniqueOrThrow({
        where: { id: input.testRunId },
        include: { environment: true },
      })
      if (testRun.targetProjectId !== publication.targetProjectId)
        throw new Error('TestRun and Quality validation publication ownership do not match.')
      const validation = validationArtifactSchema.parse(
        JSON.parse(publication.validationProjectionJson),
      ) as ValidationArtifact
      const node = reviewedNodeFor(publication, validation)
      const { built, manifest } = await buildCapsuleManifest(publication, testRun, node, this.prisma)
      await new ManagedProjectManifestRepository(this.prisma, this.appraiseRoot).refresh(publication.targetProjectId)
      const leases = new RuntimeCapsuleLeaseRepository(this.prisma)
      const identity = {
        projectId: publication.targetProjectId,
        validationHash: publication.validationHash,
        runId: testRun.runId,
      }
      const paths = resolveRuntimeCapsulePaths({ appraiseRoot: this.appraiseRoot, ...identity })
      return await withRuntimeCapsuleLeaseHeartbeat(leases, identity, async assertOwned => {
        const blobs = new RuntimeCapsuleBlobRepository(this.prisma, this.appraiseRoot)
        for (const [index, file] of built.files.entries()) {
          await assertOwned()
          const blob = await blobs.put({
            projectId: publication.targetProjectId,
            contentHash: manifest.files[index]!.hash,
            bytes: file.bytes,
          })
          await assertOwned()
          await materializeRuntimeCapsuleFile({
            paths,
            filePath: file.path,
            blobPath: path.join(this.appraiseRoot, 'projects', publication.targetProjectId, blob.storagePath),
            contentHash: manifest.files[index]!.hash,
            expectedSize: manifest.files[index]!.size,
          })
        }
        await assertOwned()
        const row = await new RuntimeCapsuleRepository(this.prisma, this.appraiseRoot).create({
          projectId: publication.targetProjectId,
          testRunId: testRun.id,
          runId: testRun.runId,
          validationHash: publication.validationHash,
          qualityPublicationId: publication.id,
          manifest,
          assertLeaseOwned: assertOwned,
        })
        const correlationId = `quality:${publication.qualityPlanRevisionId}`
        await Promise.all(
          manifest.rootInvocations.map(invocation =>
            recordStepDefinitionTelemetry(this.prisma, {
              surface: 'runtime',
              outcome: 'runtime_ready',
              correlationId,
              step: { id: invocation.step.id, version: invocation.step.version },
              payload: {},
            }),
          ),
        )
        return { row, manifest }
      })
    } catch (error) {
      await recordStepDefinitionTelemetry(this.prisma, {
        surface: 'runtime',
        outcome: 'runtime_blocked',
        correlationId: `quality:${publication.qualityPlanRevisionId}`,
        payload: { reason: 'runtime_readiness' },
      }).catch(() => undefined)
      throw error
    }
  }

  /** Authoring is executable only after it is frozen as a target-owned snapshot.
   * The snapshot is deliberately not a Quality publication and can never be
   * used as Assessment evidence authority. */
  async materializeAuthored(input: { testRunId: string }) {
    const testRun = await this.prisma.testRun.findUniqueOrThrow({
      where: { id: input.testRunId },
      include: {
        environment: true,
        targetProject: true,
        testCases: {
          include: {
            testSuite: { select: { id: true, targetProjectId: true, name: true } },
            testCase: {
              include: {
                steps: { orderBy: { order: 'asc' } },
              },
            },
          },
          orderBy: { id: 'asc' },
        },
        assessmentRunBinding: true,
      },
    })
    if (testRun.intent !== 'INDEPENDENT')
      throw new Error('Authored runtime capsules are available only to independent TestRuns.')
    if (testRun.assessmentRunBinding)
      throw new Error('Independent authored TestRuns cannot have an AssessmentRun binding.')
    if (testRun.testCases.length === 0) throw new Error('Authored runtime capsules require at least one selected case.')

    const selected = testRun.testCases.map(link => {
      if (
        !link.testSuite ||
        link.testSuite.targetProjectId !== testRun.targetProjectId ||
        link.testCase.targetProjectId !== testRun.targetProjectId
      )
        throw new Error('Authored runtime selection must contain target-owned explicit suite/case links.')
      if (link.testCase.steps.length === 0)
        throw new Error(`Authored test case ${link.testCaseId} has no executable Step Invocations.`)
      const steps = link.testCase.steps.map(step => ({
        id: step.id,
        order: step.order,
        label: step.label,
        gherkinStep: step.gherkinStep,
        invocation: stepInvocationSchema.parse(JSON.parse(step.invocationJson)),
      }))
      return {
        suite: { id: link.testSuite.id, name: link.testSuite.name },
        testCase: { id: link.testCase.id, title: link.testCase.title, description: link.testCase.description, steps },
      }
    })
    const sourceSnapshot = {
      schemaVersion: '1',
      targetProjectId: testRun.targetProjectId,
      targetFingerprint: testRun.targetProject.fingerprint,
      environmentId: testRun.environmentId,
      browserEngine: testRun.browserEngine,
      selection: [...selected].sort((left, right) =>
        `${left.suite.id}/${left.testCase.id}`.localeCompare(`${right.suite.id}/${right.testCase.id}`),
      ),
    }
    const validationId = `authored_${hashRuntimeCapsuleValue(sourceSnapshot).slice('sha256:'.length)}`
    if (new Set(selected.map(item => item.testCase.id)).size !== selected.length)
      throw new Error('Authored runtime selection cannot include one case through multiple suites.')
    const allInvocations = selected.flatMap(item => item.testCase.steps.map(step => step.invocation))
    const sealedDefinitions = await resolveRuntimeStepDefinitionClosure(
      allInvocations.map(invocation => invocation.step),
      async step =>
        this.prisma.stepDefinition.findUnique({
          where: { id_version: { id: step.id, version: step.version } },
          include: { publicationReceipt: true },
        }),
    )
    const definitionByRef = new Map(
      sealedDefinitions.map(definition => [`${definition.step.id}@${definition.step.version}`, definition.definition]),
    )
    for (const invocation of allInvocations) {
      const definition = definitionByRef.get(`${invocation.step.id}@${invocation.step.version}`)
      if (!definition) throw new Error('Authored Step Invocation is missing its sealed Step Definition.')
      validateStepInvocationInputs(definition, invocation.inputs)
    }
    const locatorIds = new Set<string>()
    for (const invocation of allInvocations) {
      const definition = definitionByRef.get(`${invocation.step.id}@${invocation.step.version}`)!
      for (const inputDefinition of definition.inputs.filter(item => item.type === 'locator')) {
        const value = invocation.inputs[inputDefinition.name]
        if (typeof value !== 'string' || !value)
          throw new Error(`Authored locator input ${inputDefinition.name} must reference a target-owned locator ID.`)
        locatorIds.add(value)
      }
    }
    const locators = await this.prisma.locator.findMany({
      where: { id: { in: [...locatorIds] }, targetProjectId: testRun.targetProjectId },
      select: { id: true, name: true, value: true, locatorGroupId: true },
    })
    if (locators.length !== locatorIds.size)
      throw new Error('Authored runtime selection references an unavailable or cross-project locator.')
    const snapshotWithLocators = {
      ...sourceSnapshot,
      locators: [...locators].sort((left, right) => left.id.localeCompare(right.id)),
    }
    const sealedSourceHash = hashRuntimeCapsuleValue(snapshotWithLocators)
    const node = {
      id: validationId,
      testCaseIds: selected.map(item => item.testCase.id),
      appraiseArtifacts: {
        modules: [],
        locatorGroups: [],
        testSuites: selected.map(item => ({
          id: item.suite.id,
          name: item.suite.name,
          moduleId: `authored-module-${item.suite.id}`,
          testCaseIds: [item.testCase.id],
        })),
        testCases: selected.map(item => ({
          ...item.testCase,
          steps: item.testCase.steps.map(step => ({ ...step, parameters: [] })),
        })),
        locators: locators.map(locator => ({ ...locator, locatorGroupId: locator.locatorGroupId ?? 'unassigned' })),
      },
      matrix: [{ browser: testRun.browserEngine.toLowerCase(), environment: testRun.environmentId }],
    } as ValidationNode
    const gherkin = node.appraiseArtifacts.testCases.map(testCase => ({
      caseId: testCase.id,
      steps: testCase.steps.map(step => step.gherkinStep),
    }))
    const compilerReceipt = {
      schemaVersion: '1' as const,
      catalogHash: hashRuntimeCapsuleValue(sealedDefinitions.map(item => item.step)),
      locatorGraphHash: hashRuntimeCapsuleValue(snapshotWithLocators.locators),
      environments: [testRun.environmentId],
      browsers: [testRun.browserEngine.toLowerCase()],
      runtimes: ['node'],
    }
    const runtimeInput = {
      schemaVersion: '2' as const,
      targetProjectId: testRun.targetProjectId,
      targetFingerprint: testRun.targetProject.fingerprint,
      astId: validationId,
      astHash: sealedSourceHash,
      contextHash: hashRuntimeCapsuleValue({ targetProjectId: testRun.targetProjectId, sourceHash: sealedSourceHash }),
      previewHash: hashRuntimeCapsuleValue(gherkin),
      receiptHash: sealedSourceHash,
      compilerReceipt: { ...compilerReceipt, contentHash: hashRuntimeCapsuleValue(compilerReceipt) },
      extensionPolicy: {
        ...createCustomExtensionPolicy({
          projectId: testRun.targetProjectId,
          projectFingerprint: testRun.targetProject.fingerprint,
          capabilityImports: {},
        }),
        capabilityImports: {},
      },
      rootInvocations: selected.flatMap(item =>
        item.testCase.steps.map(step => ({ caseId: item.testCase.id, stepId: step.id, invocation: step.invocation })),
      ),
      locatorBindings: selected.flatMap(item =>
        item.testCase.steps.flatMap(step => {
          const definition = definitionByRef.get(`${step.invocation.step.id}@${step.invocation.step.version}`)!
          return definition.inputs
            .filter(input => input.type === 'locator')
            .map(input => ({
              caseId: item.testCase.id,
              stepId: step.id,
              inputName: input.name,
              cardinality: 'exactlyOne' as const,
            }))
        }),
      ),
      operationCardinalities: defaultOperationDefinitions.flatMap(operation =>
        operation.inputs
          .filter(input => input.type === 'locator' && input.cardinality)
          .map(input => ({
            operation: `${operation.handler.id}@${operation.handler.version}`,
            inputName: input.name,
            cardinality: input.cardinality!,
          })),
      ),
      stepDefinitions: sealedDefinitions.map(item => item.step),
      locators: locators.map(locator => ({
        id: locator.id,
        version: '1',
        contentHash: hashRuntimeCapsuleValue(locator),
        binding: {
          id: locator.id,
          name: locator.name,
          value: locator.value,
          locatorGroupId: locator.locatorGroupId ?? 'unassigned',
        },
      })),
      extensions: [],
      matrix: node.matrix,
      expected: {
        scenarios: selected.map(item => ({
          scenarioId: `authored-scenario-${item.testCase.id}`,
          caseId: item.testCase.id,
          stepIds: item.testCase.steps.map(step => step.id),
        })),
        scenarioCount: selected.length,
      },
      gherkinHash: hashRuntimeCapsuleValue(gherkin),
    } satisfies ValidationAstRuntimeInput
    const operation = {
      id: `authored_${sealedSourceHash.slice('sha256:'.length)}`,
      sourceKind: 'AUTHORED_TEST_SNAPSHOT' as const,
      sourceHash: sealedSourceHash,
      targetProjectId: testRun.targetProjectId,
      validationHash: sealedSourceHash,
      operationHash: hashRuntimeCapsuleValue(snapshotWithLocators),
      projectionHash: hashRuntimeCapsuleValue(node),
      receiptHash: sealedSourceHash,
      runtimeInputHash: hashRuntimeCapsuleValue(runtimeInput),
    }
    const extensionArtifacts = await authoredExtensionArtifacts(sealedDefinitions, this.prisma)
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
      projectId: testRun.targetProjectId,
      validationHash: sealedSourceHash,
      runId: testRun.runId,
      operationHash: operation.operationHash,
      projectionHash: operation.projectionHash,
      receiptHash: operation.receiptHash,
      runtimeInputHash: operation.runtimeInputHash,
      source: { kind: 'AUTHORED_TEST_SNAPSHOT', sourceHash: sealedSourceHash, snapshot: snapshotWithLocators },
      commandReceipt: { path: 'command-receipt.json', hash: hashCapsuleCommandReceipt(commandReceipt) },
      generator: GENERATOR,
      rootInvocations: allInvocations,
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
    await new ManagedProjectManifestRepository(this.prisma, this.appraiseRoot).refresh(testRun.targetProjectId)
    const identity = { projectId: testRun.targetProjectId, validationHash: sealedSourceHash, runId: testRun.runId }
    const paths = resolveRuntimeCapsulePaths({ appraiseRoot: this.appraiseRoot, ...identity })
    return withRuntimeCapsuleLeaseHeartbeat(
      new RuntimeCapsuleLeaseRepository(this.prisma),
      identity,
      async assertOwned => {
        const blobs = new RuntimeCapsuleBlobRepository(this.prisma, this.appraiseRoot)
        for (const [index, file] of built.files.entries()) {
          await assertOwned()
          const blob = await blobs.put({
            projectId: testRun.targetProjectId,
            contentHash: manifest.files[index]!.hash,
            bytes: file.bytes,
          })
          await materializeRuntimeCapsuleFile({
            paths,
            filePath: file.path,
            blobPath: path.join(this.appraiseRoot, 'projects', testRun.targetProjectId, blob.storagePath),
            contentHash: manifest.files[index]!.hash,
            expectedSize: manifest.files[index]!.size,
          })
        }
        const row = await new RuntimeCapsuleRepository(this.prisma, this.appraiseRoot).create({
          projectId: testRun.targetProjectId,
          testRunId: testRun.id,
          runId: testRun.runId,
          validationHash: sealedSourceHash,
          manifest,
          assertLeaseOwned: assertOwned,
        })
        return { row, manifest }
      },
    )
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
