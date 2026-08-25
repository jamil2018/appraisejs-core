import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { canonicalFrozenRemoteEnvironmentPacket } from '@/lib/quality-design/frozen-environment-snapshot'
import { hashCanonical } from '@/lib/quality-design/state'
import { canonicalRuntimeCapsuleJson, hashRuntimeCapsuleValue } from '@/lib/runtime-capsule/contracts'
import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'

import {
  reconcileQualityAssessment,
  reserveReadyAssessmentForTests,
  setAssessmentExecutionClientForTests,
} from './assessment-execution-service'
import { readQualityAssessment } from './quality-design-service'

const workspaces: string[] = []
const execFileAsync = promisify(execFile)
const source = (file: string) => path.join(process.cwd(), file).replaceAll('\\', '\\\\')

async function seedCurrentPublication(
  client: PrismaClient,
  input: {
    targetProjectId: string
    qualityPlanRevisionId: string
    validationVersionId: string
    suffix: string
    runtimeInputJson: string
  },
) {
  const hash = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
  const generationId = `generation-${input.suffix}`
  const publicationId = `publication-${input.suffix}`
  const operationHash = hash(`operation-${input.suffix}`)
  const suppliedRuntimeInput = JSON.parse(input.runtimeInputJson) as Record<string, unknown>
  const runtimeInputJson = canonicalRuntimeCapsuleJson({
    ...suppliedRuntimeInput,
    astId: input.validationVersionId,
    expected: {
      scenarioCount: 1,
      scenarios: [{ scenarioId: 'scenario-1', caseId: 'case-1', stepIds: ['step-1'] }],
    },
  })
  const validationProjectionJson = canonicalRuntimeCapsuleJson({
    validations: [
      {
        id: input.validationVersionId,
        testCaseIds: ['case-1'],
        appraiseArtifacts: {
          testCases: [{ id: 'case-1', title: 'Fixture case', description: 'Fixture', steps: [] }],
          testSuites: [{ id: 'suite-1', name: 'Fixture suite', moduleId: 'module-1', testCaseIds: ['case-1'] }],
        },
        matrix: [{ browser: 'chromium', environment: 'fixture' }],
      },
    ],
  })
  await client.qualityValidationGeneration.create({
    data: {
      id: generationId,
      generationKey: hash(`generation-key-${input.suffix}`),
      targetProjectId: input.targetProjectId,
      qualityPlanRevisionId: input.qualityPlanRevisionId,
      validationVersionId: input.validationVersionId,
      artifactSchemaVersion: 'v3',
      preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
      preflightAuthority: 'appraisejs:quality-validation-publication:v2',
      scopeIntentHash: hash(`scope-${input.suffix}`),
      realizationIntentHash: hash(`realization-${input.suffix}`),
      preflightHash: hash(`preflight-${input.suffix}`),
      canonicalRealizationJson: '{}',
      realizationHash: hash(`realization-json-${input.suffix}`),
      compilationHash: hash(`compilation-${input.suffix}`),
      assuranceLevel: 'STANDARD',
      disposition: 'ACTIVE',
    },
  })
  await client.qualityValidationPublication.create({
    data: {
      id: publicationId,
      generation: { connect: { id: generationId } },
      targetProject: { connect: { id: input.targetProjectId } },
      targetFingerprint: hash(`target-${input.suffix}`),
      qualityPlanRevision: {
        connect: { id_targetProjectId: { id: input.qualityPlanRevisionId, targetProjectId: input.targetProjectId } },
      },
      validationVersion: {
        connect: {
          id_qualityPlanRevisionId_targetProjectId: {
            id: input.validationVersionId,
            qualityPlanRevisionId: input.qualityPlanRevisionId,
            targetProjectId: input.targetProjectId,
          },
        },
      },
      operationHash,
      expectedRevisionHash: hash(`revision-${input.suffix}`),
      validationHash: hash(`validation-${input.suffix}`),
      validationContent: '{}',
      reviewHash: hash(`review-${input.suffix}`),
      reviewContent: '{}',
      astId: input.validationVersionId,
      astHash: hash(`ast-${input.suffix}`),
      contextHash: hash(`context-${input.suffix}`),
      previewHash: hash(`preview-${input.suffix}`),
      receiptHash: hash(`receipt-${input.suffix}`),
      projectionHash: hash(`projection-${input.suffix}`),
      projectionJson: '{}',
      validationProjectionJson,
      runtimeInputHash: hash(`runtime-${input.suffix}`),
      runtimeInputJson,
    },
  })
  await client.validationVersion.update({
    where: { id: input.validationVersionId },
    data: { activeGenerationId: generationId },
  })
  return {
    generationId,
    generationKey: hash(`generation-key-${input.suffix}`),
    publicationId,
    operationHash,
    runtimeInputHash: hash(`runtime-${input.suffix}`),
    validationHash: hash(`validation-${input.suffix}`),
    projectionHash: hash(`projection-${input.suffix}`),
    receiptHash: hash(`receipt-${input.suffix}`),
  }
}

function canonicalManagedCapsuleFixture(input: {
  targetProjectId: string
  testRunId: string
  runId: string
  validationVersionId: string
  tuple: Awaited<ReturnType<typeof seedCurrentPublication>>
}) {
  const definition = builtInStepDefinitions[0]!
  const hashes = computeStepDefinitionHashes(definition)
  const step = {
    id: definition.identity.id,
    version: definition.identity.version,
    definitionHash: computeStepReferenceHash(definition),
  }
  const manifest = {
    schemaVersion: '2' as const,
    projectId: input.targetProjectId,
    validationHash: input.tuple.validationHash,
    runId: input.runId,
    operationHash: input.tuple.operationHash,
    projectionHash: input.tuple.projectionHash,
    receiptHash: input.tuple.receiptHash,
    runtimeInputHash: input.tuple.runtimeInputHash,
    source: {
      kind: 'PUBLISHED_VALIDATION' as const,
      sourceHash: input.tuple.validationHash,
      publishOperationId: input.tuple.publicationId,
      generationId: input.tuple.generationId,
      generationKey: input.tuple.generationKey,
    },
    commandReceipt: { path: 'command-receipt.json', hash: `sha256:${'c'.repeat(64)}` },
    generator: { id: 'appraise.validation-ast-capsule' as const, version: '2' as const },
    expectedCases: [
      { validationId: input.validationVersionId, suiteId: 'suite-1', caseId: 'case-1', scenarioId: 'scenario-1' },
    ],
    rootInvocations: [{ step, inputs: {} }],
    stepDefinitions: [
      {
        step,
        definition,
        definitionHash: hashes.definitionHash,
        humanProjectionHash: hashes.humanProjectionHash,
        agentContractHash: hashes.agentContractHash,
        executionHash: hashes.executionHash,
        publicationReceiptHash: `sha256:${'d'.repeat(64)}`,
      },
    ],
    extensions: [],
    files: [
      { path: 'command-receipt.json', role: 'command-receipt' as const, hash: `sha256:${'c'.repeat(64)}`, size: 1 },
    ],
  }
  const manifestHash = hashRuntimeCapsuleValue(manifest)
  return {
    manifestJson: canonicalRuntimeCapsuleJson(manifest),
    manifestHash,
    capsuleHash: hashRuntimeCapsuleValue({ ...manifest, manifestHash }),
  }
}

async function seedCheckpointAndBinding(
  client: PrismaClient,
  input: {
    assessmentRunId: string
    targetProjectId: string
    qualityPlanRevisionId: string
    validationVersionId: string
    resultMatrixCell: string
    testRunId: string
    tuple: Awaited<ReturnType<typeof seedCurrentPublication>>
  },
) {
  await client.assessmentRunPublicationCheckpoint.create({
    data: {
      assessmentRunId: input.assessmentRunId,
      targetProjectId: input.targetProjectId,
      qualityPlanRevisionId: input.qualityPlanRevisionId,
      validationVersionId: input.validationVersionId,
      generationId: input.tuple.generationId,
      publicationId: input.tuple.publicationId,
      publicationOperationHash: input.tuple.operationHash,
      runtimeInputHash: input.tuple.runtimeInputHash,
    },
  })
  await client.assessmentRunBinding.create({
    data: {
      assessmentRunId: input.assessmentRunId,
      targetProjectId: input.targetProjectId,
      qualityPlanRevisionId: input.qualityPlanRevisionId,
      validationVersionId: input.validationVersionId,
      resultMatrixCell: input.resultMatrixCell,
      testRunId: input.testRunId,
      runtimeInputHash: input.tuple.runtimeInputHash,
      generationId: input.tuple.generationId,
      publicationId: input.tuple.publicationId,
      publicationOperationHash: input.tuple.operationHash,
    },
  })
}

afterEach(async () => {
  setAssessmentExecutionClientForTests()
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

describe('assessment evidence reconciliation SQLite isolation', () => {
  it('keeps a multi-binding partial startup RUNNING and directs reconciliation instead of fresh preparation', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-partial-startup-sqlite-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)
    const script = `
      import { PrismaClient } from '@prisma/client'
      import { createHash } from 'node:crypto'
      import { runQualityAssessment, setAssessmentRuntimeServiceFactoryForTests } from '${source('src/services/coordinator/assessment-execution-service.ts')}'
      import { canonicalContractJson } from '${source('src/lib/catalog-contracts/index.ts')}'

      const prisma = new PrismaClient()
      const hash = character => 'sha256:' + character.repeat(64)
      const targetId = 'target-partial-startup'
      const qualityPlanId = 'plan-partial-startup'
      const revisionId = 'revision-partial-startup'
      const subjectId = 'subject-partial-startup'
      const assessmentId = 'assessment-partial-startup'
      const environmentId = 'environment-partial-startup'
      try {
        await prisma.targetProject.create({ data: {
          id: targetId, kind: 'LOCAL_WORKSPACE', canonicalIdentity: 'path:${workspace.replaceAll('\\', '\\\\')}',
          canonicalPath: '${workspace.replaceAll('\\', '\\\\')}', displayName: 'Partial startup fixture', fingerprint: hash('a'),
          executionConsentMode: 'TRUSTED_AGENT',
        }})
        await prisma.environment.create({ data: { id: environmentId, targetProjectId: targetId, name: 'Fixture', baseUrl: 'https://fixture.test' }})
        await prisma.qualityPlan.create({ data: { id: qualityPlanId, targetProjectId: targetId, title: 'Partial startup' }})
        await prisma.qualityPlanRevision.create({ data: {
          id: revisionId, targetProjectId: targetId, qualityPlanId, revision: 1, status: 'REALIZED',
          contentHash: hash('b'), sourceSpecification: '{}', requirementGraphJson: '{}',
        }})
        await prisma.requirementAnalysisRevision.create({ data: {
          id: 'analysis-partial-startup', targetProjectId: targetId, qualityPlanRevisionId: revisionId, revision: 1,
          status: 'APPROVED', decision: 'APPROVED', analysisJson: '{}', provenanceJson: '{}', analysisHash: hash('analysis-partial-startup'),
          approvedAt: new Date(), approvedBy: 'fixture', approvalHash: hash('approval-partial-startup'),
        }})
        await prisma.validationDesignRevision.create({ data: {
          id: 'design-partial-startup', targetProjectId: targetId, qualityPlanRevisionId: revisionId,
          requirementAnalysisRevisionId: 'analysis-partial-startup', revision: 1, status: 'APPROVED', decision: 'APPROVED',
          strategyJson: '{}', scenarioPortfolioJson: '{}', provenanceJson: '{}', designHash: hash('design-partial-startup'),
          approvedAt: new Date(), approvedBy: 'fixture', approvalHash: hash('approval-design-partial-startup'),
        }})
        for (const [id, identity, marker] of [['validation-partial-one', 'one', 'c'], ['validation-partial-two', 'two', 'd']]) {
          await prisma.validationVersion.create({ data: {
            id, targetProjectId: targetId, qualityPlanRevisionId: revisionId, validationDesignRevisionId: 'design-partial-startup', validationIdentity: identity, version: 1,
            status: 'PUBLISHED', canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }), canonicalHash: hash(marker),
          }})
          await prisma.qualityValidationGeneration.create({ data: {
            id: 'generation-' + identity, generationKey: hash('generation-' + identity), targetProjectId: targetId,
            qualityPlanRevisionId: revisionId, validationVersionId: id, artifactSchemaVersion: 'v3',
            preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
            preflightAuthority: 'appraisejs:quality-validation-publication:v2', scopeIntentHash: hash('scope-' + identity),
            realizationIntentHash: hash('realization-' + identity), preflightHash: hash('preflight-' + identity),
            canonicalRealizationJson: '{}', realizationHash: hash('realization-json-' + identity), compilationHash: hash('compile-' + identity),
            assuranceLevel: 'STANDARD', disposition: 'ACTIVE',
          }})
          await prisma.qualityValidationPublication.create({ data: {
            id: 'publication-' + identity, generation: { connect: { id: 'generation-' + identity } }, targetProject: { connect: { id: targetId } }, targetFingerprint: hash('a'), qualityPlanRevision: { connect: { id_targetProjectId: { id: revisionId, targetProjectId: targetId } } },
            validationVersion: { connect: { id_qualityPlanRevisionId_targetProjectId: { id, qualityPlanRevisionId: revisionId, targetProjectId: targetId } } }, idempotencyKey: 'publication-' + identity, operationHash: hash(identity), expectedRevisionHash: hash('b'),
            validationHash: hash(marker), validationContent: '{}', reviewHash: hash(marker + marker), reviewContent: '{}', astId: id,
            astHash: hash(marker + marker + marker), contextHash: hash('e'), previewHash: hash('f'), receiptHash: hash('g'),
            projectionHash: hash('h'), projectionJson: '{}', validationProjectionJson: '{}', runtimeInputHash: hash('i'),
            runtimeInputJson: JSON.stringify({ matrix: [{ browser: 'chromium', environment: environmentId }] }),
          }})
          await prisma.validationVersion.update({ where: { id }, data: { activeGenerationId: 'generation-' + identity }})
        }
        await prisma.evaluationSubjectRevision.create({ data: { id: subjectId, subjectDigest: hash('j'), subjectKind: 'ARTIFACT', authority: 'fixture' }})
        await prisma.assessment.create({ data: {
          id: assessmentId, targetProjectId: targetId, qualityPlanId, qualityPlanRevisionId: revisionId,
          evaluationSubjectRevisionId: subjectId, status: 'READY', alignment: 'CURRENT', lineageId: assessmentId, generation: 0,
        }})
        let starts = 0
        setAssessmentRuntimeServiceFactoryForTests(() => ({
          prepareQuality: async input => prisma.testRun.create({ data: {
            name: input.name, preparationKey: input.preparationKey, targetProjectId: input.targetProjectId,
            environmentId: input.environmentId, browserEngine: input.browserEngine ?? 'CHROMIUM', intent: 'ASSESSMENT',
          }}),
          startQuality: async input => {
            starts += 1
            if (starts === 1) {
              await prisma.testRun.update({ where: { id: input.testRunDbId }, data: { status: 'RUNNING' }})
              return
            }
            await prisma.testRun.update({ where: { id: input.testRunDbId }, data: {
              status: 'COMPLETED', result: 'FAILED', evidenceHealth: 'infrastructure_failure', completedAt: new Date(),
            }})
            throw new Error('second binding startup failure')
          },
          cancel: async () => undefined,
        }))
        try {
          await runQualityAssessment({ assessmentId, idempotencyKey: 'partial-startup-key' })
          throw new Error('Expected partial startup to remain unrecoverable until reconciliation')
        } catch (error) {
          if (error?.details?.code !== 'assessment_execution_incomplete' || error?.details?.nextRecommendedAction !== 'assessment_reconcile') throw error
        }
        const assessment = await prisma.assessment.findUniqueOrThrow({ where: { id: assessmentId }})
        const run = await prisma.assessmentRun.findUniqueOrThrow({
          where: { idempotencyScope_idempotencyKey: { idempotencyScope: assessmentId, idempotencyKey: 'partial-startup-key' }},
          include: { bindings: { include: { testRun: true } } },
        })
        if (
          assessment.status !== 'RUNNING' || run.bindings.length !== 2 ||
          run.bindings.filter(binding => binding.testRun.status === 'RUNNING').length !== 1 ||
          run.bindings.filter(binding => binding.testRun.status === 'COMPLETED' && binding.terminalizedAt).length !== 1
        ) throw new Error('Partial startup incorrectly reopened the Assessment: ' + JSON.stringify({ assessment, run }))
        const replayAssessmentId = 'assessment-crash-replay'
        const replaySubjectId = 'subject-crash-replay'
        const replayRunId = 'assessment-run-crash-replay'
        const replayTestRunId = 'test-run-crash-replay'
        const replayCell = {
          validationVersionId: 'validation-partial-one', resultMatrixCell: 'CHROMIUM:' + environmentId,
          environmentId, browserEngine: 'CHROMIUM',
        }
        const requestHash = 'sha256:' + createHash('sha256').update(canonicalContractJson({
          assessmentId: replayAssessmentId, targetProjectId: targetId, qualityPlanRevisionId: revisionId,
          evaluationSubjectRevisionId: replaySubjectId, cells: [replayCell], selections: [{
            validationVersionId: 'validation-partial-one', generationId: 'generation-one', generationKey: hash('generation-one'),
            publicationId: 'publication-one', publicationOperationHash: hash('one'), runtimeInputHash: hash('i'),
          }],
        })).digest('hex')
        await prisma.evaluationSubjectRevision.create({ data: {
          id: replaySubjectId, subjectDigest: hash('k'), subjectKind: 'ARTIFACT', authority: 'fixture',
        }})
        await prisma.assessment.create({ data: {
          id: replayAssessmentId, targetProjectId: targetId, qualityPlanId, qualityPlanRevisionId: revisionId,
          evaluationSubjectRevisionId: replaySubjectId, status: 'RUNNING', alignment: 'CURRENT', lineageId: replayAssessmentId, generation: 0,
        }})
        await prisma.testRun.create({ data: {
          id: replayTestRunId, name: 'crash-window queued binding', preparationKey: 'crash-window-queued',
          targetProjectId: targetId, environmentId, browserEngine: 'CHROMIUM', intent: 'ASSESSMENT', status: 'QUEUED', result: 'PENDING',
        }})
        await prisma.assessmentRun.create({ data: {
          id: replayRunId, targetProjectId: targetId, assessmentId: replayAssessmentId, qualityPlanRevisionId: revisionId,
          evaluationSubjectRevisionId: replaySubjectId, idempotencyScope: replayAssessmentId, idempotencyKey: 'crash-window-key',
          requestHash, status: 'PREPARED',
        }})
        await prisma.assessmentRunPublicationCheckpoint.create({ data: {
          assessmentRunId: replayRunId, targetProjectId: targetId, qualityPlanRevisionId: revisionId,
          validationVersionId: 'validation-partial-one', generationId: 'generation-one', publicationId: 'publication-one',
          publicationOperationHash: hash('one'), runtimeInputHash: hash('i'),
        }})
        await prisma.assessmentRunBinding.create({ data: {
          assessmentRunId: replayRunId, targetProjectId: targetId, qualityPlanRevisionId: revisionId,
          validationVersionId: 'validation-partial-one', resultMatrixCell: replayCell.resultMatrixCell,
          testRunId: replayTestRunId, runtimeInputHash: hash('i'), generationId: 'generation-one', publicationId: 'publication-one',
          publicationOperationHash: hash('one'),
        }})
        let replayStarts = 0
        setAssessmentRuntimeServiceFactoryForTests(() => ({
          prepareQuality: async () => { throw new Error('Queued binding replay must not create another TestRun') },
          startQuality: async input => {
            replayStarts += 1
            await prisma.testRun.update({ where: { id: input.testRunDbId }, data: { status: 'RUNNING' }})
          },
          cancel: async () => undefined,
        }))
        const resumed = await runQualityAssessment({
          assessmentId: replayAssessmentId, idempotencyKey: 'crash-window-key', validationVersionIds: ['validation-partial-one'],
          runtime: { environmentId, browserEngine: 'CHROMIUM' },
        })
        if (resumed.id !== replayRunId || replayStarts !== 1)
          throw new Error('Queued crash-window replay did not start the original binding exactly once')
        await runQualityAssessment({
          assessmentId: replayAssessmentId, idempotencyKey: 'crash-window-key', validationVersionIds: ['validation-partial-one'],
          runtime: { environmentId, browserEngine: 'CHROMIUM' },
        }).then(
          () => { throw new Error('Active crash-window replay was incorrectly restarted') },
          error => { if (error?.details?.code !== 'assessment_execution_incomplete') throw error },
        )
        if (replayStarts !== 1) throw new Error('Crash-window replay started the same TestRun twice')
        const zeroAssessmentId = 'assessment-zero-binding-replay'
        const zeroSubjectId = 'subject-zero-binding-replay'
        await prisma.evaluationSubjectRevision.create({ data: {
          id: zeroSubjectId, subjectDigest: hash('l'), subjectKind: 'ARTIFACT', authority: 'fixture',
        }})
        await prisma.assessment.create({ data: {
          id: zeroAssessmentId, targetProjectId: targetId, qualityPlanId, qualityPlanRevisionId: revisionId,
          evaluationSubjectRevisionId: zeroSubjectId, status: 'READY', alignment: 'CURRENT', lineageId: zeroAssessmentId, generation: 0,
        }})
        setAssessmentRuntimeServiceFactoryForTests(() => ({
          prepareQuality: async () => { throw new Error('pre-binding runtime outage') },
          startQuality: async () => { throw new Error('start must not run before a TestRun exists') },
          cancel: async () => undefined,
        }))
        await runQualityAssessment({
          assessmentId: zeroAssessmentId, idempotencyKey: 'zero-binding-key', validationVersionIds: ['validation-partial-one'],
          runtime: { environmentId, browserEngine: 'CHROMIUM' },
        }).then(
          () => { throw new Error('Expected pre-binding runtime outage') },
          error => { if (!(error instanceof Error) || error.message !== 'pre-binding runtime outage') throw error },
        )
        const zeroRunBeforeReplay = await prisma.assessmentRun.findUniqueOrThrow({
          where: { idempotencyScope_idempotencyKey: { idempotencyScope: zeroAssessmentId, idempotencyKey: 'zero-binding-key' }},
          include: { bindings: true },
        })
        if (zeroRunBeforeReplay.bindings.length || (await prisma.assessment.findUniqueOrThrow({ where: { id: zeroAssessmentId }})).status !== 'RUNNING')
          throw new Error('Pre-binding outage did not preserve a resumable RUNNING AssessmentRun')
        let zeroReplayStarts = 0
        setAssessmentRuntimeServiceFactoryForTests(() => ({
          prepareQuality: async input => prisma.testRun.create({ data: {
            name: input.name, preparationKey: input.preparationKey, targetProjectId: input.targetProjectId,
            environmentId: input.environmentId, browserEngine: input.browserEngine ?? 'CHROMIUM', intent: 'ASSESSMENT',
          }}),
          startQuality: async input => {
            zeroReplayStarts += 1
            await prisma.testRun.update({ where: { id: input.testRunDbId }, data: { status: 'RUNNING' }})
          },
          cancel: async () => undefined,
        }))
        const zeroResumed = await runQualityAssessment({
          assessmentId: zeroAssessmentId, idempotencyKey: 'zero-binding-key', validationVersionIds: ['validation-partial-one'],
          runtime: { environmentId, browserEngine: 'CHROMIUM' },
        })
        const zeroRunAfterReplay = await prisma.assessmentRun.findUniqueOrThrow({
          where: { id: zeroResumed.id }, include: { bindings: { include: { testRun: true } } },
        })
        if (zeroResumed.id !== zeroRunBeforeReplay.id || zeroReplayStarts !== 1 || zeroRunAfterReplay.bindings.length !== 1)
          throw new Error('Zero-binding replay did not resume its one immutable AssessmentRun/TestRun generation')
        await runQualityAssessment({
          assessmentId: zeroAssessmentId, idempotencyKey: 'zero-binding-key', validationVersionIds: ['validation-partial-one'],
          runtime: { environmentId, browserEngine: 'CHROMIUM' },
        }).then(
          () => { throw new Error('Active zero-binding replay was incorrectly restarted') },
          error => { if (error?.details?.code !== 'assessment_execution_incomplete') throw error },
        )
        if (zeroReplayStarts !== 1) throw new Error('Zero-binding replay created a duplicate runtime start')
      } finally {
        setAssessmentRuntimeServiceFactoryForTests()
        await prisma.$disconnect()
      }
    `
    await expect(
      execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' },
      }),
    ).resolves.toMatchObject({ stderr: '' })
  }, 60_000)

  it('returns a terminal startup failure as a cancellation that cannot reserve another root execution', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-recovery-reservation-sqlite-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    try {
      await client.targetProject.create({
        data: {
          id: 'target-recovery',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: `path:${workspace}`,
          canonicalPath: workspace,
          displayName: 'Recovery fixture',
          fingerprint: `sha256:${'a'.repeat(64)}`,
        },
      })
      await client.environment.create({
        data: {
          id: 'environment-recovery',
          targetProjectId: 'target-recovery',
          name: 'Fixture',
          baseUrl: 'https://fixture.test',
        },
      })
      await client.qualityPlan.create({
        data: { id: 'plan-recovery', targetProjectId: 'target-recovery', title: 'Recovery reservation' },
      })
      await client.qualityPlanRevision.create({
        data: {
          id: 'revision-recovery',
          targetProjectId: 'target-recovery',
          qualityPlanId: 'plan-recovery',
          revision: 1,
          status: 'REALIZED',
          contentHash: `sha256:${'b'.repeat(64)}`,
          sourceSpecification: '{}',
          requirementGraphJson: '{}',
        },
      })
      await client.requirementAnalysisRevision.create({
        data: {
          id: 'analysis-recovery',
          targetProjectId: 'target-recovery',
          qualityPlanRevisionId: 'revision-recovery',
          revision: 1,
          status: 'APPROVED',
          decision: 'APPROVED',
          analysisJson: '{}',
          provenanceJson: '{}',
          analysisHash: `sha256:${'analysis'.padEnd(64, 'a')}`,
          approvedAt: new Date(),
          approvedBy: 'fixture',
          approvalHash: `sha256:${'approval'.padEnd(64, 'a')}`,
        },
      })
      await client.validationDesignRevision.create({
        data: {
          id: 'design-recovery',
          targetProjectId: 'target-recovery',
          qualityPlanRevisionId: 'revision-recovery',
          requirementAnalysisRevisionId: 'analysis-recovery',
          revision: 1,
          status: 'APPROVED',
          decision: 'APPROVED',
          strategyJson: '{}',
          scenarioPortfolioJson: '{}',
          provenanceJson: '{}',
          designHash: `sha256:${'design'.padEnd(64, 'a')}`,
          approvedAt: new Date(),
          approvedBy: 'fixture',
          approvalHash: `sha256:${'approval-design'.padEnd(64, 'a')}`,
        },
      })
      await client.validationVersion.create({
        data: {
          id: 'validation-recovery',
          targetProjectId: 'target-recovery',
          qualityPlanRevisionId: 'revision-recovery',
          validationDesignRevisionId: 'design-recovery',
          validationIdentity: 'Recovery reservation',
          version: 1,
          status: 'PUBLISHED',
          canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
          canonicalHash: `sha256:${'c'.repeat(64)}`,
        },
      })
      const recoveryTuple = await seedCurrentPublication(client, {
        targetProjectId: 'target-recovery',
        qualityPlanRevisionId: 'revision-recovery',
        validationVersionId: 'validation-recovery',
        suffix: 'recovery',
        runtimeInputJson: JSON.stringify({ matrix: [{ browser: 'chromium', environment: 'environment-recovery' }] }),
      })
      await client.evaluationSubjectRevision.create({
        data: {
          id: 'subject-recovery',
          subjectDigest: `sha256:${'d'.repeat(64)}`,
          subjectKind: 'ARTIFACT',
          authority: 'fixture',
        },
      })
      await client.assessment.create({
        data: {
          id: 'assessment-recovery',
          targetProjectId: 'target-recovery',
          qualityPlanId: 'plan-recovery',
          qualityPlanRevisionId: 'revision-recovery',
          evaluationSubjectRevisionId: 'subject-recovery',
          status: 'RUNNING',
          alignment: 'CURRENT',
          lineageId: 'assessment-recovery',
          generation: 0,
        },
      })
      await client.testRun.create({
        data: {
          id: 'test-run-recovery',
          name: 'terminal startup failure',
          runId: 'run-recovery',
          targetProjectId: 'target-recovery',
          environmentId: 'environment-recovery',
          status: 'COMPLETED',
          result: 'FAILED',
          intent: 'ASSESSMENT',
          evidenceHealth: 'infrastructure_failure',
          completedAt: new Date('2026-08-22T00:00:00.000Z'),
        },
      })
      await client.assessmentRun.create({
        data: {
          id: 'assessment-run-recovery',
          targetProjectId: 'target-recovery',
          assessmentId: 'assessment-recovery',
          qualityPlanRevisionId: 'revision-recovery',
          evaluationSubjectRevisionId: 'subject-recovery',
          idempotencyScope: 'assessment-recovery',
          idempotencyKey: 'terminal-startup',
          requestHash: `sha256:${'e'.repeat(64)}`,
          status: 'PREPARED',
        },
      })
      await seedCheckpointAndBinding(client, {
        assessmentRunId: 'assessment-run-recovery',
        targetProjectId: 'target-recovery',
        qualityPlanRevisionId: 'revision-recovery',
        validationVersionId: 'validation-recovery',
        resultMatrixCell: 'CHROMIUM:environment-recovery',
        testRunId: 'test-run-recovery',
        tuple: recoveryTuple,
      })

      setAssessmentExecutionClientForTests(client)
      await reconcileQualityAssessment({ assessmentId: 'assessment-recovery' })
      expect(await client.assessment.findUniqueOrThrow({ where: { id: 'assessment-recovery' } })).toMatchObject({
        status: 'CANCELLED',
      })
      expect(
        await client.assessmentRunBinding.findFirstOrThrow({ where: { testRunId: 'test-run-recovery' } }),
      ).toMatchObject({
        terminalOutcome: 'FAILED',
        evidenceReceiptId: null,
      })
      const identity = {
        assessmentId: 'assessment-recovery',
        targetProjectId: 'target-recovery',
        qualityPlanRevisionId: 'revision-recovery',
        evaluationSubjectRevisionId: 'subject-recovery',
      }
      const attempts = await Promise.allSettled([
        reserveReadyAssessmentForTests(client as never, identity as never),
        reserveReadyAssessmentForTests(client as never, identity as never),
      ])
      expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(0)
      expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(2)
      expect(await client.assessment.findUniqueOrThrow({ where: { id: 'assessment-recovery' } })).toMatchObject({
        status: 'CANCELLED',
      })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('seals a valid local capsule but rejects a canonically rehashed semantic tuple tamper', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-reconciliation-sqlite-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    const reportPath = path.join(workspace, 'report.json')
    const logPath = path.join(workspace, 'run.log')
    await Promise.all([
      copyMigratedTestDatabase(databasePath),
      fs.writeFile(reportPath, '{"passed":true}'),
      fs.writeFile(logPath, 'passed'),
    ])
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    try {
      await client.targetProject.create({
        data: {
          id: 'target-reconcile',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: `path:${workspace}`,
          canonicalPath: workspace,
          displayName: 'Reconciliation fixture',
          fingerprint: `sha256:${'a'.repeat(64)}`,
        },
      })
      await client.environment.create({
        data: {
          id: 'environment-reconcile',
          targetProjectId: 'target-reconcile',
          name: 'Fixture',
          baseUrl: 'https://fixture.test',
        },
      })
      await client.qualityPlan.create({
        data: { id: 'plan-reconcile', targetProjectId: 'target-reconcile', title: 'Receipt isolation' },
      })
      await client.qualityPlanRevision.create({
        data: {
          id: 'revision-reconcile',
          targetProjectId: 'target-reconcile',
          qualityPlanId: 'plan-reconcile',
          revision: 1,
          status: 'REALIZED',
          contentHash: `sha256:${'b'.repeat(64)}`,
          sourceSpecification: '{}',
          requirementGraphJson: '{}',
        },
      })
      await client.requirementAnalysisRevision.create({
        data: {
          id: 'analysis-reconcile',
          targetProjectId: 'target-reconcile',
          qualityPlanRevisionId: 'revision-reconcile',
          revision: 1,
          status: 'APPROVED',
          decision: 'APPROVED',
          analysisJson: '{}',
          provenanceJson: '{}',
          analysisHash: `sha256:${'analysis'.padEnd(64, 'b')}`,
          approvedAt: new Date(),
          approvedBy: 'fixture',
          approvalHash: `sha256:${'approval'.padEnd(64, 'b')}`,
        },
      })
      await client.validationDesignRevision.create({
        data: {
          id: 'design-reconcile',
          targetProjectId: 'target-reconcile',
          qualityPlanRevisionId: 'revision-reconcile',
          requirementAnalysisRevisionId: 'analysis-reconcile',
          revision: 1,
          status: 'APPROVED',
          decision: 'APPROVED',
          strategyJson: '{}',
          scenarioPortfolioJson: '{}',
          provenanceJson: '{}',
          designHash: `sha256:${'design'.padEnd(64, 'b')}`,
          approvedAt: new Date(),
          approvedBy: 'fixture',
          approvalHash: `sha256:${'approval-design'.padEnd(64, 'b')}`,
        },
      })
      await client.validationVersion.create({
        data: {
          id: 'validation-reconcile',
          targetProjectId: 'target-reconcile',
          qualityPlanRevisionId: 'revision-reconcile',
          validationDesignRevisionId: 'design-reconcile',
          validationIdentity: 'receipt isolation',
          version: 1,
          status: 'PUBLISHED',
          canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
          canonicalHash: `sha256:${'c'.repeat(64)}`,
        },
      })
      const reconciliationTuple = await seedCurrentPublication(client, {
        targetProjectId: 'target-reconcile',
        qualityPlanRevisionId: 'revision-reconcile',
        validationVersionId: 'validation-reconcile',
        suffix: 'reconcile',
        runtimeInputJson: JSON.stringify({ matrix: [{ browser: 'chromium', environment: 'environment-reconcile' }] }),
      })
      await client.evaluationSubjectRevision.create({
        data: {
          id: 'subject-reconcile',
          subjectDigest: `sha256:${'d'.repeat(64)}`,
          subjectKind: 'ARTIFACT',
          authority: 'fixture',
        },
      })
      await client.assessment.create({
        data: {
          id: 'assessment-root',
          targetProjectId: 'target-reconcile',
          qualityPlanId: 'plan-reconcile',
          qualityPlanRevisionId: 'revision-reconcile',
          evaluationSubjectRevisionId: 'subject-reconcile',
          status: 'RUNNING',
          alignment: 'CURRENT',
          lineageId: 'assessment-root',
          generation: 0,
        },
      })
      await client.assessment.create({
        data: {
          id: 'assessment-successor',
          targetProjectId: 'target-reconcile',
          qualityPlanId: 'plan-reconcile',
          qualityPlanRevisionId: 'revision-reconcile',
          evaluationSubjectRevisionId: 'subject-reconcile',
          status: 'RUNNING',
          alignment: 'CURRENT',
          lineageId: 'assessment-root',
          generation: 1,
          supersedesAssessmentId: 'assessment-root',
        },
      })
      for (const fixture of [
        { run: 'root', assessmentId: 'assessment-root' },
        { run: 'successor', assessmentId: 'assessment-successor' },
      ]) {
        await client.testRun.create({
          data: {
            id: `test-run-${fixture.run}`,
            name: fixture.run,
            runId: `run-${fixture.run}`,
            targetProjectId: 'target-reconcile',
            environmentId: 'environment-reconcile',
            status: 'COMPLETED',
            result: 'PASSED',
            intent: 'ASSESSMENT',
            evidenceHealth: 'valid',
            completedAt: new Date('2026-08-22T00:00:00.000Z'),
            reportPath,
            logPath,
          },
        })
        const capsule = canonicalManagedCapsuleFixture({
          targetProjectId: 'target-reconcile',
          testRunId: `test-run-${fixture.run}`,
          runId: `run-${fixture.run}`,
          validationVersionId: 'validation-reconcile',
          tuple: reconciliationTuple,
        })
        if (fixture.run === 'successor') {
          const manifest = JSON.parse(capsule.manifestJson) as {
            expectedCases: Array<{ suiteId: string }>
          }
          manifest.expectedCases[0]!.suiteId = 'suite-tampered'
          capsule.manifestJson = canonicalRuntimeCapsuleJson(manifest)
          capsule.manifestHash = hashRuntimeCapsuleValue(manifest)
          capsule.capsuleHash = hashRuntimeCapsuleValue({ ...manifest, manifestHash: capsule.manifestHash })
        }
        await client.runtimeCapsule.create({
          data: {
            id: `capsule-${fixture.run}`,
            targetProjectId: 'target-reconcile',
            testRunId: `test-run-${fixture.run}`,
            validationHash: reconciliationTuple.validationHash,
            qualityPublicationId: reconciliationTuple.publicationId,
            ...capsule,
            storagePath: path.join(workspace, `capsule-${fixture.run}`),
            integrityState: 'ready',
          },
        })
        await client.assessmentRun.create({
          data: {
            id: `assessment-run-${fixture.run}`,
            targetProjectId: 'target-reconcile',
            assessmentId: fixture.assessmentId,
            qualityPlanRevisionId: 'revision-reconcile',
            evaluationSubjectRevisionId: 'subject-reconcile',
            idempotencyScope: fixture.run,
            idempotencyKey: fixture.run,
            requestHash: `sha256:${fixture.run.padEnd(64, fixture.run[0]!)}`,
            status: 'PREPARED',
          },
        })
        await seedCheckpointAndBinding(client, {
          assessmentRunId: `assessment-run-${fixture.run}`,
          targetProjectId: 'target-reconcile',
          qualityPlanRevisionId: 'revision-reconcile',
          validationVersionId: 'validation-reconcile',
          resultMatrixCell: 'CHROMIUM:environment-reconcile',
          testRunId: `test-run-${fixture.run}`,
          tuple: reconciliationTuple,
        })
      }

      setAssessmentExecutionClientForTests(client)
      await reconcileQualityAssessment({ assessmentId: 'assessment-root' })
      await reconcileQualityAssessment({ assessmentId: 'assessment-root' })
      await reconcileQualityAssessment({ assessmentId: 'assessment-successor' })

      const receipts = await client.evidenceReceipt.findMany({ orderBy: { assessmentId: 'asc' } })
      expect(receipts).toHaveLength(1)
      expect(receipts[0]!.assessmentId).toBe('assessment-root')
      expect(await client.assessmentRunBinding.count({ where: { evidenceReceiptId: { not: null } } })).toBe(1)
      expect(
        await client.assessmentRunBinding.findFirstOrThrow({ where: { testRunId: 'test-run-successor' } }),
      ).toMatchObject({
        terminalOutcome: 'INCONCLUSIVE',
        integrityRejectionCode: 'managed_capsule_integrity',
        evidenceReceiptId: null,
      })
      const review = await readQualityAssessment(
        'assessment-successor',
        client as unknown as Parameters<typeof readQualityAssessment>[1],
      )
      expect(review).toMatchObject({
        assessment: { status: 'CANCELLED' },
        evidenceReceiptCount: 0,
        targetOutcome: 'not_evaluated',
      })
      expect(await client.$queryRawUnsafe<Array<unknown>>('PRAGMA foreign_key_check')).toEqual([])
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('rejects a canonically rehashed semantic tuple tamper for a remote managed capsule', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-remote-tuple-tamper-sqlite-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    const reportPath = path.join(workspace, 'report.json')
    const logPath = path.join(workspace, 'run.log')
    await Promise.all([
      copyMigratedTestDatabase(databasePath),
      fs.writeFile(reportPath, '{"passed":true}'),
      fs.writeFile(logPath, 'passed'),
    ])
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    try {
      const ids = {
        target: 'target-remote-tuple',
        environment: 'environment-remote-tuple',
        plan: 'plan-remote-tuple',
        revision: 'revision-remote-tuple',
        validation: 'validation-remote-tuple',
        subject: 'subject-remote-tuple',
        assessment: 'assessment-remote-tuple',
        run: 'assessment-run-remote-tuple',
        testRun: 'test-run-remote-tuple',
      }
      const hash = (letter: string) => `sha256:${letter.repeat(64)}`
      await client.targetProject.create({
        data: {
          id: ids.target,
          kind: 'REMOTE_BLACK_BOX',
          canonicalIdentity: 'remote:https://fixture.test',
          normalizedRemoteOrigin: 'https://fixture.test',
          displayName: 'Remote tuple fixture',
          fingerprint: hash('a'),
        },
      })
      await client.environment.create({
        data: { id: ids.environment, targetProjectId: ids.target, name: 'Fixture', baseUrl: 'https://fixture.test' },
      })
      await client.qualityPlan.create({
        data: { id: ids.plan, targetProjectId: ids.target, title: 'Remote tuple integrity' },
      })
      await client.qualityPlanRevision.create({
        data: {
          id: ids.revision,
          targetProjectId: ids.target,
          qualityPlanId: ids.plan,
          revision: 1,
          status: 'REALIZED',
          contentHash: hash('b'),
          sourceSpecification: '{}',
          requirementGraphJson: '{}',
        },
      })
      await client.requirementAnalysisRevision.create({
        data: {
          id: 'analysis-remote-tuple',
          targetProjectId: ids.target,
          qualityPlanRevisionId: ids.revision,
          revision: 1,
          status: 'APPROVED',
          decision: 'APPROVED',
          analysisJson: '{}',
          provenanceJson: '{}',
          analysisHash: hash('analysis'),
          approvedAt: new Date(),
          approvedBy: 'fixture',
          approvalHash: hash('approval-analysis'),
        },
      })
      await client.validationDesignRevision.create({
        data: {
          id: 'design-remote-tuple',
          targetProjectId: ids.target,
          qualityPlanRevisionId: ids.revision,
          requirementAnalysisRevisionId: 'analysis-remote-tuple',
          revision: 1,
          status: 'APPROVED',
          decision: 'APPROVED',
          strategyJson: '{}',
          scenarioPortfolioJson: '{}',
          provenanceJson: '{}',
          designHash: hash('design'),
          approvedAt: new Date(),
          approvedBy: 'fixture',
          approvalHash: hash('approval-design'),
        },
      })
      await client.validationVersion.create({
        data: {
          id: ids.validation,
          targetProjectId: ids.target,
          qualityPlanRevisionId: ids.revision,
          validationDesignRevisionId: 'design-remote-tuple',
          validationIdentity: 'remote tuple',
          version: 1,
          status: 'PUBLISHED',
          canonicalAstJson: '{}',
          canonicalHash: hash('c'),
        },
      })
      const tuple = await seedCurrentPublication(client, {
        targetProjectId: ids.target,
        qualityPlanRevisionId: ids.revision,
        validationVersionId: ids.validation,
        suffix: 'remote-tuple',
        runtimeInputJson: JSON.stringify({ matrix: [{ browser: 'chromium', environment: ids.environment }] }),
      })
      await client.evaluationSubjectRevision.create({
        data: {
          id: ids.subject,
          subjectDigest: hash('d'),
          subjectKind: 'REMOTE_EVALUATION_SCOPE',
          authority: 'fixture',
        },
      })
      await client.assessment.create({
        data: {
          id: ids.assessment,
          targetProjectId: ids.target,
          qualityPlanId: ids.plan,
          qualityPlanRevisionId: ids.revision,
          evaluationSubjectRevisionId: ids.subject,
          status: 'RUNNING',
          alignment: 'CURRENT',
          lineageId: ids.assessment,
          generation: 0,
        },
      })
      const environment = await client.environment.findUniqueOrThrow({ where: { id: ids.environment } })
      const frozen = canonicalFrozenRemoteEnvironmentPacket(environment)
      await client.testRun.create({
        data: {
          id: ids.testRun,
          name: 'remote tuple tamper',
          runId: 'run-remote-tuple',
          targetProjectId: ids.target,
          environmentId: ids.environment,
          status: 'COMPLETED',
          result: 'PASSED',
          intent: 'ASSESSMENT',
          evidenceHealth: 'valid',
          completedAt: new Date('2026-08-24T00:00:00.000Z'),
          reportPath,
          logPath,
          environmentSnapshotHash: hashCanonical(frozen),
          environmentSnapshotJson: canonicalContractJson(frozen),
          environmentSnapshotVersion: frozen.scopeVersion,
        },
      })
      const capsule = canonicalManagedCapsuleFixture({
        targetProjectId: ids.target,
        testRunId: ids.testRun,
        runId: 'run-remote-tuple',
        validationVersionId: ids.validation,
        tuple,
      })
      const manifest = JSON.parse(capsule.manifestJson) as { expectedCases: Array<{ scenarioId: string }> }
      manifest.expectedCases[0]!.scenarioId = 'scenario-tampered'
      capsule.manifestJson = canonicalRuntimeCapsuleJson(manifest)
      capsule.manifestHash = hashRuntimeCapsuleValue(manifest)
      capsule.capsuleHash = hashRuntimeCapsuleValue({ ...manifest, manifestHash: capsule.manifestHash })
      await client.runtimeCapsule.create({
        data: {
          id: 'capsule-remote-tuple',
          targetProjectId: ids.target,
          testRunId: ids.testRun,
          validationHash: tuple.validationHash,
          qualityPublicationId: tuple.publicationId,
          ...capsule,
          storagePath: path.join(workspace, 'capsule'),
          integrityState: 'ready',
        },
      })
      await client.assessmentRun.create({
        data: {
          id: ids.run,
          targetProjectId: ids.target,
          assessmentId: ids.assessment,
          qualityPlanRevisionId: ids.revision,
          evaluationSubjectRevisionId: ids.subject,
          idempotencyScope: ids.assessment,
          idempotencyKey: ids.assessment,
          requestHash: hash('e'),
          status: 'PREPARED',
        },
      })
      await seedCheckpointAndBinding(client, {
        assessmentRunId: ids.run,
        targetProjectId: ids.target,
        qualityPlanRevisionId: ids.revision,
        validationVersionId: ids.validation,
        resultMatrixCell: `CHROMIUM:${ids.environment}`,
        testRunId: ids.testRun,
        tuple,
      })
      setAssessmentExecutionClientForTests(client)
      await reconcileQualityAssessment({ assessmentId: ids.assessment })
      expect(await client.assessmentRunBinding.findFirstOrThrow({ where: { testRunId: ids.testRun } })).toMatchObject({
        terminalOutcome: 'INCONCLUSIVE',
        integrityRejectionCode: 'managed_capsule_integrity',
        evidenceReceiptId: null,
      })
      expect(await client.evidenceReceipt.count({ where: { assessmentId: ids.assessment } })).toBe(0)
      expect(
        await readQualityAssessment(ids.assessment, client as unknown as Parameters<typeof readQualityAssessment>[1]),
      ).toMatchObject({
        assessment: { status: 'CANCELLED' },
        evidenceReceiptCount: 0,
        targetOutcome: 'not_evaluated',
      })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)
})
