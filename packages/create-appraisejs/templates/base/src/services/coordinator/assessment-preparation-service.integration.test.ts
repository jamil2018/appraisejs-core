import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

const execFileAsync = promisify(execFile)
const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

describe('assessment preflight SQLite boundary', () => {
  it('leaves every persisted row and local runtime workspace unchanged', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-preflight-sqlite-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)

    const script = `
      import { PrismaClient } from '@prisma/client'
      import { createHash } from 'node:crypto'
      import { builtInStepDefinitions } from '${path.join(process.cwd(), 'packages/cucumber-runtime/src/step-definitions/index.ts').replaceAll('\\', '\\\\')}'
      import { ensureBuiltInStepDefinitionReadiness } from '${path.join(process.cwd(), 'src/services/step-definition/built-in-readiness-service.ts').replaceAll('\\', '\\\\')}'
      import { preflightQualityAssessmentRun } from '${path.join(process.cwd(), 'src/services/coordinator/assessment-preparation-service.ts').replaceAll('\\', '\\\\')}'
      import { hashCanonical } from '${path.join(process.cwd(), 'src/lib/quality-design/state.ts').replaceAll('\\', '\\\\')}'

      const prisma = new PrismaClient()
      const hash = value => 'sha256:' + value.repeat(64).slice(0, 64)
      const design = { title: 'Preflight', behavior: 'The candidate remains read-only.' }
      const snapshot = async () => {
        const tables = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        const rows = {}
        for (const { name } of tables) rows[name] = await prisma.$queryRawUnsafe('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
        return JSON.stringify(rows, (_, value) => typeof value === 'bigint' ? value.toString() : value)
      }
      try {
        await ensureBuiltInStepDefinitionReadiness(prisma)
        const definition = builtInStepDefinitions.find(item => item.inputs.length === 0)
        const navigation = builtInStepDefinitions.find(item => item.identity.id === 'browser.navigation.navigate.to.environment.base.url')
        if (!definition) throw new Error('Expected a no-input built-in Step Definition')
        if (!navigation) throw new Error('Expected the environment-base-url navigation Step Definition')
        await prisma.targetProject.create({ data: {
          id: 'target-preflight', kind: 'LOCAL_WORKSPACE', canonicalIdentity: 'path:${workspace.replaceAll('\\', '\\\\')}',
          canonicalPath: '${workspace.replaceAll('\\', '\\\\')}', displayName: 'preflight target', fingerprint: hash('a'),
        }})
        await prisma.qualityPlan.create({ data: { id: 'plan-preflight', targetProjectId: 'target-preflight', title: 'Preflight' } })
        await prisma.qualityPlanRevision.create({ data: {
          id: 'revision-preflight', targetProjectId: 'target-preflight', qualityPlanId: 'plan-preflight', revision: 1,
          status: 'SCENARIOS_APPROVED', contentHash: hash('b'), sourceSpecification: '{}', requirementGraphJson: '{}',
        }})
        await prisma.validationVersion.create({ data: {
          id: 'validation-preflight', targetProjectId: 'target-preflight', qualityPlanRevisionId: 'revision-preflight',
          validationIdentity: 'preflight validation', version: 1, status: 'SCENARIO_APPROVED',
          canonicalAstJson: JSON.stringify(design), canonicalHash: hash('c'),
        }})
        await prisma.environment.create({ data: {
          id: 'environment-preflight', targetProjectId: 'target-preflight', name: 'existing', baseUrl: 'https://example.test',
        }})
        const before = await snapshot()
        const result = await preflightQualityAssessmentRun({
          target: 'target-preflight', qualityPlanId: 'plan-preflight', revisionId: 'revision-preflight', expectedDesignHash: hashCanonical([design]),
          validationBindings: [{ validationId: 'validation-preflight', locatorIds: [], steps: [{
            stepId: navigation.identity.id, version: navigation.identity.version, inputs: {}, description: 'the user navigates to the base url of the selected environment',
          }, {
            stepId: definition.identity.id, version: definition.identity.version, inputs: {}, description: 'the preflight fixture is ready',
          }]}],
          environment: { environmentId: 'environment-preflight' },
          subject: { subjectDigest: hash('d'), authority: 'artifact://preflight' }, runtime: { browserEngine: 'CHROMIUM' },
        })
        const after = await snapshot()
        if (
          !result.ready ||
          result.expectedPreflight?.algorithmVersion !== 'appraise.quality-assessment-preflight/v2' ||
          result.expectedPreflight.preflightHash !== result.preflightHash
        ) throw new Error('Expected the exact v2 preflight handoff token')
        if (before !== after) throw new Error('Preflight mutated SQLite rows')
        await prisma.$disconnect()
      } catch (error) {
        await prisma.$disconnect()
        throw error
      }
    `

    const beforeFiles = await fs.readdir(workspace)
    await expect(
      execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' },
      }),
    ).resolves.toMatchObject({ stderr: '' })
    expect(await fs.readdir(workspace)).toEqual(beforeFiles)
  }, 60_000)

  it('replays the real compiler canonicalization with stable persisted realization bytes', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-realization-replay-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)

    const script = `
      import { PrismaClient } from '@prisma/client'
      import { createHash } from 'node:crypto'
      import { builtInStepDefinitions } from '${path.join(process.cwd(), 'packages/cucumber-runtime/src/step-definitions/index.ts').replaceAll('\\', '\\\\')}'
      import { computeStepReferenceHash } from '${path.join(process.cwd(), 'packages/cucumber-runtime/src/step-definitions/contracts.ts').replaceAll('\\', '\\\\')}'
      import { compileQualityValidations } from '${path.join(process.cwd(), 'src/services/coordinator/quality-design-service.ts').replaceAll('\\', '\\\\')}'
      import { preflightQualityAssessmentRun, prepareQualityAssessmentRun } from '${path.join(process.cwd(), 'src/services/coordinator/assessment-preparation-service.ts').replaceAll('\\', '\\\\')}'
      import { setAssessmentRuntimeServiceFactoryForTests } from '${path.join(process.cwd(), 'src/services/coordinator/assessment-execution-service.ts').replaceAll('\\', '\\\\')}'
      import { ensureBuiltInStepDefinitionReadiness } from '${path.join(process.cwd(), 'src/services/step-definition/built-in-readiness-service.ts').replaceAll('\\', '\\\\')}'
      import { createCustomExtensionPolicy } from '${path.join(process.cwd(), 'src/lib/validation-ast/extension-policy.ts').replaceAll('\\', '\\\\')}'
      import { hashCanonical } from '${path.join(process.cwd(), 'src/lib/quality-design/state.ts').replaceAll('\\', '\\\\')}'
      import { canonicalContractJson } from '${path.join(process.cwd(), 'src/lib/catalog-contracts/index.ts').replaceAll('\\', '\\\\')}'
      import { defaultOperationDefinitions } from '${path.join(process.cwd(), 'src/lib/operation-catalog/index.ts').replaceAll('\\', '\\\\')}'

      const prisma = new PrismaClient()
      const hash = value => 'sha256:' + value.repeat(64).slice(0, 64)
      const digest = value => 'sha256:' + createHash('sha256').update(canonicalContractJson(value)).digest('hex')
      const targetId = 'target-realization-replay'
      const qualityPlanId = 'plan-realization-replay'
      const revisionId = 'revision-realization-replay'
      const versionId = 'validation-realization-replay'
      const targetFingerprint = hash('a')
      const canonicalHash = hash('b')
      const environmentId = 'env-replay'
      const design = { title: 'Replay', behavior: 'Replay stays canonical.' }
      try {
        const definition = builtInStepDefinitions.find(item => item.inputs.length === 0)
        const navigation = builtInStepDefinitions.find(item => item.identity.id === 'browser.navigation.navigate.to.environment.base.url')
        if (!definition) throw new Error('Expected a no-input built-in Step Definition')
        if (!navigation) throw new Error('Expected the environment-base-url navigation Step Definition')
        await ensureBuiltInStepDefinitionReadiness(prisma)
        const caseId = 'quality-case-' + versionId
        const moduleId = 'quality-module-' + versionId
        const suiteId = 'quality-suite-' + versionId
        const navigationInvocation = {
          step: { id: navigation.identity.id, version: navigation.identity.version, definitionHash: computeStepReferenceHash(navigation) },
          inputs: {}, presentation: { keyword: 'Given', description: 'the user navigates to the base url of the selected environment' },
        }
        const invocation = {
          step: { id: definition.identity.id, version: definition.identity.version, definitionHash: computeStepReferenceHash(definition) },
          inputs: {}, presentation: { keyword: 'Given', description: 'the compiler fixture is ready' },
        }
        const steps = [
          { id: caseId + '-step-1', order: 1, label: 'the user navigates to the base url of the selected environment', gherkinStep: 'Given the user navigates to the base url of the selected environment', invocation: navigationInvocation, parameters: [] },
          { id: caseId + '-step-2', order: 2, label: 'the compiler fixture is ready', gherkinStep: 'Given the compiler fixture is ready', invocation, parameters: [] },
        ]
        const gherkin = ['Scenario: Replay\\n  Given the user navigates to the base url of the selected environment\\n  Given the compiler fixture is ready']
        const receiptHash = digest({ validationVersionId: versionId, environmentId, browser: 'chromium', steps })
        const compilerReceipt = { schemaVersion: '1', catalogHash: digest(steps.map(step => step.invocation.step)), locatorGraphHash: digest([]), environments: [environmentId], browsers: ['chromium'], runtimes: ['node'] }
        const runtimeInput = {
          schemaVersion: '2', targetProjectId: targetId, targetFingerprint, astId: versionId, astHash: canonicalHash,
          contextHash: digest({ targetProjectId: targetId, validationVersionId: versionId }), previewHash: digest({ gherkin, steps }), receiptHash,
          compilerReceipt: { ...compilerReceipt, contentHash: hashCanonical(compilerReceipt) },
          extensionPolicy: createCustomExtensionPolicy({ projectId: targetId, projectFingerprint: targetFingerprint, capabilityImports: {} }),
          rootInvocations: steps.map(step => ({ caseId, stepId: step.id, invocation: step.invocation })),
          locatorBindings: [], operationCardinalities: defaultOperationDefinitions.flatMap(operation => operation.inputs.filter(input => input.type === 'locator').map(input => ({ operation: operation.handler.id + '@' + operation.handler.version, inputName: input.name, cardinality: input.cardinality }))),
          stepDefinitions: [navigationInvocation.step, invocation.step], locators: [], extensions: [], matrix: [{ browser: 'chromium', environment: environmentId }],
          expected: { scenarios: [{ scenarioId: versionId, caseId, stepIds: steps.map(step => step.id) }], scenarioCount: 1 },
          gherkinHash: digest(gherkin),
        }
        const node = {
          id: versionId, testCaseIds: [caseId],
          appraiseArtifacts: {
            modules: [{ id: moduleId, name: 'Replay', parentId: null }], locatorGroups: [],
            testSuites: [{ id: suiteId, name: 'Replay', moduleId, testCaseIds: [caseId] }],
            testCases: [{ id: caseId, title: 'Replay', description: 'Replay stays canonical.', steps }],
            locators: [],
          }, matrix: runtimeInput.matrix,
        }
        const realization = { validations: [{ validationVersionId: versionId, realization: { runtimePublication: { idempotencyKey: 'replay-1', projection: { validationNode: node, gherkin }, validationProjection: { validations: [node], gherkin }, runtimeInput, extensionReviews: [] } } }] }
        await prisma.targetProject.create({ data: { id: targetId, kind: 'LOCAL_WORKSPACE', canonicalIdentity: 'path:${workspace.replaceAll('\\', '\\\\')}', canonicalPath: '${workspace.replaceAll('\\', '\\\\')}', displayName: 'replay target', fingerprint: targetFingerprint } })
        await prisma.qualityPlan.create({ data: { id: qualityPlanId, targetProjectId: targetId, title: 'Replay' } })
        await prisma.qualityPlanRevision.create({ data: { id: revisionId, targetProjectId: targetId, qualityPlanId, revision: 1, status: 'SCENARIOS_APPROVED', contentHash: hash('2'), sourceSpecification: '{}', requirementGraphJson: '{}' } })
        await prisma.validationVersion.create({ data: { id: versionId, targetProjectId: targetId, qualityPlanRevisionId: revisionId, validationIdentity: 'replay', version: 1, status: 'SCENARIO_APPROVED', canonicalAstJson: JSON.stringify(design), canonicalHash } })
        await prisma.environment.create({ data: { id: environmentId, targetProjectId: targetId, name: 'Replay', baseUrl: 'https://example.test' } })
        const command = { qualityPlanId, revisionId, expectedDesignHash: hashCanonical([design]), realization }
        await compileQualityValidations(command)
        const first = await prisma.validationVersion.findUniqueOrThrow({ where: { id: versionId } })
        await compileQualityValidations(command)
        const second = await prisma.validationVersion.findUniqueOrThrow({ where: { id: versionId } })
        if (first.realizationJson !== second.realizationJson || first.realizationHash !== second.realizationHash) throw new Error('Compiler replay changed canonical realization')
        const snapshot = async () => JSON.stringify(await prisma.$queryRawUnsafe('SELECT id, realizationJson, realizationHash, status FROM ValidationVersion WHERE id = ?', versionId))
        const before = await snapshot()
        const compact = { target: targetId, qualityPlanId, revisionId, expectedDesignHash: hashCanonical([design]), validationBindings: [{ validationId: versionId, locatorIds: [], steps: [{ stepId: navigation.identity.id, version: navigation.identity.version, inputs: {}, description: 'the user navigates to the base url of the selected environment' }, { stepId: definition.identity.id, version: definition.identity.version, inputs: {}, description: 'the compiler fixture is ready' }] }], environment: { environmentId }, subject: { subjectDigest: hash('9'), authority: 'artifact://replay' }, runtime: { browserEngine: 'CHROMIUM' } }
        const same = await preflightQualityAssessmentRun(compact)
        if (!same.ready) throw new Error('Matching persisted compact intent did not preflight')
        if (before !== await snapshot()) throw new Error('Persisted preflight mutated realized validation')
        let runtimeStarts = 0
        setAssessmentRuntimeServiceFactoryForTests(() => ({
          prepareQuality: async input => prisma.testRun.create({ data: {
            name: input.name, preparationKey: input.preparationKey, targetProjectId: input.targetProjectId,
            environmentId: input.environmentId, browserEngine: input.browserEngine ?? 'CHROMIUM', intent: 'ASSESSMENT',
          }}),
          startQuality: async input => {
            runtimeStarts += 1
            if (runtimeStarts !== 1) return
            await prisma.testRun.update({ where: { id: input.testRunDbId }, data: {
              status: 'COMPLETED', result: 'FAILED', evidenceHealth: 'infrastructure_failure', completedAt: new Date(),
            }})
            throw new Error('terminal startup fixture')
          },
          cancel: async () => undefined,
        }))
        const firstRecovery = await prepareQualityAssessmentRun({ ...compact, idempotencyKey: 'terminal-startup-key' })
        if (
          firstRecovery.failure?.classification !== 'terminal_execution_failure' ||
          firstRecovery.nextRecommendedAction !== 'assessment_prepare_run' ||
          firstRecovery.nextRequiredAgentBehavior !== 'start_fresh_assessment_preparation_with_a_new_idempotency_key'
        ) throw new Error('Terminal preparation did not issue fresh-key recovery guidance: ' + JSON.stringify(firstRecovery))
        const beforeReplay = await prisma.assessmentRun.findMany({
          where: { assessmentId: firstRecovery.assessment?.id }, include: { bindings: { include: { testRun: true } } },
        })
        const sameRecovery = await prepareQualityAssessmentRun({ ...compact, idempotencyKey: 'terminal-startup-key' })
        if (!sameRecovery.unchanged || sameRecovery.preparationId !== firstRecovery.preparationId)
          throw new Error('Terminal preparation key was not replayed as its immutable receipt')
        const afterReplay = await prisma.assessmentRun.findMany({
          where: { assessmentId: firstRecovery.assessment?.id }, include: { bindings: { include: { testRun: true } } },
        })
        if (JSON.stringify(beforeReplay) !== JSON.stringify(afterReplay))
          throw new Error('Terminal preparation replay created or mutated execution history')
        const [freshLeft, freshRight] = await Promise.all([
          prepareQualityAssessmentRun({ ...compact, idempotencyKey: 'fresh-concurrent-left' }),
          prepareQualityAssessmentRun({ ...compact, idempotencyKey: 'fresh-concurrent-right' }),
        ])
        const fresh = [freshLeft, freshRight]
        if (fresh.filter(result => result.phase === 'STARTED').length !== 1)
          throw new Error('Concurrent fresh keys did not yield one production-path winner: ' + JSON.stringify(fresh))
        const loser = fresh.find(result => result.phase !== 'STARTED')
        if (
          loser?.failure?.classification !== 'execution_reserved' ||
          loser.nextRecommendedAction !== 'assessment_reconcile' ||
          loser.nextRequiredAgentBehavior !== 'wait_for_active_assessment_execution_then_reconcile'
        ) throw new Error('Concurrent fresh-key loser received unsafe recovery advice: ' + JSON.stringify(loser))
        const assessmentId = firstRecovery.assessment?.id
        if (!assessmentId || fresh.find(result => result.phase === 'STARTED')?.assessment?.id !== assessmentId)
          throw new Error('Fresh preparation did not reuse the exact READY Assessment root')
        const runs = await prisma.assessmentRun.findMany({
          where: { assessmentId }, include: { bindings: { include: { testRun: true } } }, orderBy: { idempotencyKey: 'asc' },
        })
        if (runs.length !== 2 || runs.filter(run => ['PREPARED', 'RUNNING'].includes(run.status)).length !== 1)
          throw new Error('Concurrent fresh preparation created duplicate active AssessmentRuns: ' + JSON.stringify(runs))
        const failed = runs.find(run => run.idempotencyKey === 'prepare:terminal-startup-key')
        const replacement = runs.find(run => run.idempotencyKey !== 'prepare:terminal-startup-key')
        if (
          !failed || !replacement || failed.assessmentId !== replacement.assessmentId ||
          failed.bindings.length !== 1 || replacement.bindings.length !== 1 ||
          failed.bindings[0].testRun.status !== 'COMPLETED' || failed.bindings[0].testRun.result !== 'FAILED' ||
          !failed.bindings[0].terminalizedAt || failed.bindings[0].evidenceReceiptId !== null ||
          failed.bindings[0].testRunId === replacement.bindings[0].testRunId
        ) throw new Error('Fresh preparation did not preserve immutable failed history while creating distinct runtime rows')
        await preflightQualityAssessmentRun({ ...compact, validationBindings: [{ ...compact.validationBindings[0], steps: [{ ...compact.validationBindings[0].steps[0], description: 'changed semantic intent' }] }] }).then(() => { throw new Error('Changed compact intent was accepted') }, error => { if (error.details?.code !== 'active_generation_conflict') throw error })
        await prisma.validationVersion.update({ where: { id: versionId }, data: { realizationJson: JSON.stringify({ historical: true }), realizationHash: hash('7'), status: 'REALIZED' } })
        const historicalBefore = await snapshot()
        const activeGenerationPreflight = await preflightQualityAssessmentRun(compact)
        if (!activeGenerationPreflight.ready) throw new Error('Active generation did not remain the sole preflight authority')
        if (historicalBefore !== await snapshot()) throw new Error('Historical realization was backfilled or mutated')
        await prisma.$disconnect()
      } catch (error) { await prisma.$disconnect(); throw error }
    `

    await expect(
      execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' },
      }),
    ).resolves.toMatchObject({ stderr: '' })
  }, 60_000)
})
