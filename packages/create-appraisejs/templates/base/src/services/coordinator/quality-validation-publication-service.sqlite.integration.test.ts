import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

const execFileAsync = promisify(execFile)
const workspaces: string[] = []
const source = (file: string) => path.join(process.cwd(), file).replaceAll('\\', '\\\\')

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

describe('quality validation publication SQLite concurrency', () => {
  it('keeps only the winning immutable generation when independent clients race', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-publication-service-race-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    try {
      const hash = (value: string) => `sha256:${value.repeat(64)}`
      await prisma.targetProject.create({
        data: {
          id: 'target-publication-service-race',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: `path:${workspace}`,
          canonicalPath: workspace,
          displayName: 'Publication service race',
          fingerprint: hash('a'),
        },
      })
      await prisma.qualityPlan.create({
        data: {
          id: 'plan-publication-service-race',
          targetProjectId: 'target-publication-service-race',
          title: 'Publication service race',
        },
      })
      await prisma.qualityPlanRevision.create({
        data: {
          id: 'revision-publication-service-race',
          targetProjectId: 'target-publication-service-race',
          qualityPlanId: 'plan-publication-service-race',
          revision: 1,
          status: 'SCENARIOS_APPROVED',
          contentHash: hash('b'),
          sourceSpecification: '{}',
          requirementGraphJson: '{}',
        },
      })
      await prisma.requirementAnalysisRevision.create({
        data: {
          id: 'analysis-publication-service-race',
          targetProjectId: 'target-publication-service-race',
          qualityPlanRevisionId: 'revision-publication-service-race',
          revision: 1,
          status: 'APPROVED',
          decision: 'APPROVED',
          analysisJson: '{}',
          provenanceJson: '{}',
          analysisHash: hash('d'),
          approvedAt: new Date(),
          approvedBy: 'fixture',
          approvalHash: hash('e'),
        },
      })
      await prisma.validationDesignRevision.create({
        data: {
          id: 'design-publication-service-race',
          targetProjectId: 'target-publication-service-race',
          qualityPlanRevisionId: 'revision-publication-service-race',
          requirementAnalysisRevisionId: 'analysis-publication-service-race',
          revision: 1,
          status: 'APPROVED',
          decision: 'APPROVED',
          strategyJson: '{}',
          scenarioPortfolioJson: '{}',
          provenanceJson: '{}',
          designHash: hash('f'),
          approvedAt: new Date(),
          approvedBy: 'fixture',
          approvalHash: hash('g'),
        },
      })
      await prisma.validationVersion.create({
        data: {
          id: 'validation-publication-service-race',
          targetProjectId: 'target-publication-service-race',
          qualityPlanRevisionId: 'revision-publication-service-race',
          validationDesignRevisionId: 'design-publication-service-race',
          validationIdentity: 'publication service race',
          version: 1,
          status: 'SCENARIO_APPROVED',
          canonicalAstJson: JSON.stringify({ title: 'Publication service race' }),
          canonicalHash: hash('c'),
        },
      })
      await prisma.environment.create({
        data: {
          id: 'environment-publication-service-race',
          targetProjectId: 'target-publication-service-race',
          name: 'Publication service race',
          baseUrl: 'https://example.test',
        },
      })

      const script = `
        import { createHash } from 'node:crypto'
        import { builtInStepDefinitions } from '${source('packages/cucumber-runtime/src/step-definitions/index.ts')}'
        import { computeStepReferenceHash } from '${source('packages/cucumber-runtime/src/step-definitions/contracts.ts')}'
        import { canonicalContractJson } from '${source('src/lib/catalog-contracts/index.ts')}'
        import { createCustomExtensionPolicy } from '${source('src/lib/validation-ast/extension-policy.ts')}'
        import { defaultOperationDefinitions } from '${source('src/lib/operation-catalog/index.ts')}'
        import { hashCanonical } from '${source('src/lib/quality-design/state.ts')}'
        import { publishQualityValidationRuntime } from '${source('src/services/coordinator/quality-validation-publication-service.ts')}'
        const hash = value => 'sha256:' + value.repeat(64).slice(0, 64)
        const digest = value => 'sha256:' + createHash('sha256').update(canonicalContractJson(value)).digest('hex')
        const targetProjectId = 'target-publication-service-race'
        const validationVersionId = 'validation-publication-service-race'
        const environmentId = 'environment-publication-service-race'
        const targetFingerprint = hash('a')
        const definition = builtInStepDefinitions.find(item => item.identity.id === 'browser.navigation.navigate.to.environment.base.url' && item.identity.version === '1')
        if (!definition) throw new Error('Expected environment-navigation Step Definition')
        const caseId = 'case-publication-service-race'
        const invocation = { step: { id: definition.identity.id, version: definition.identity.version, definitionHash: computeStepReferenceHash(definition) }, inputs: {}, presentation: { keyword: 'Given', description: 'the environment base URL is open' } }
        const steps = [{ id: 'step-publication-service-race', order: 1, label: 'the environment base URL is open', gherkinStep: 'Given the environment base URL is open', invocation, parameters: [] }]
        const gherkin = ['Scenario: Publication service race\\n  Given the environment base URL is open']
        const receiptHash = digest({ validationVersionId, environmentId, steps })
        const compilerReceipt = { schemaVersion: '1', catalogHash: digest([invocation.step]), locatorGraphHash: digest([]), environments: [environmentId], browsers: ['chromium'], runtimes: ['node'] }
        const runtimeInput = {
          schemaVersion: '2', targetProjectId, targetFingerprint, astId: validationVersionId, astHash: hash('c'), contextHash: digest({ targetProjectId, validationVersionId }), previewHash: digest({ gherkin, steps }), receiptHash,
          compilerReceipt: { ...compilerReceipt, contentHash: hashCanonical(compilerReceipt) }, extensionPolicy: createCustomExtensionPolicy({ projectId: targetProjectId, projectFingerprint: targetFingerprint, capabilityImports: {} }),
          rootInvocations: [{ caseId, stepId: steps[0].id, invocation }], locatorBindings: [], operationCardinalities: defaultOperationDefinitions.flatMap(operation => operation.inputs.filter(input => input.type === 'locator').map(input => ({ operation: operation.handler.id + '@' + operation.handler.version, inputName: input.name, cardinality: input.cardinality }))),
          stepDefinitions: [invocation.step], locators: [], extensions: [], matrix: [{ browser: 'chromium', environment: environmentId }], expected: { scenarios: [{ scenarioId: validationVersionId, caseId, stepIds: [steps[0].id] }], scenarioCount: 1 }, gherkinHash: digest(gherkin),
        }
        const node = { id: validationVersionId, testCaseIds: [caseId], appraiseArtifacts: { modules: [{ id: 'module-publication-service-race', name: 'Publication service race', parentId: null }], locatorGroups: [], locators: [], testCases: [{ id: caseId, title: 'Publication service race', description: 'Independent service race.', steps }], testSuites: [{ id: 'suite-publication-service-race', name: 'Publication service race', moduleId: 'module-publication-service-race', testCaseIds: [caseId] }] }, matrix: runtimeInput.matrix }
        try {
          const publication = await publishQualityValidationRuntime({
            targetProjectId, targetFingerprint, qualityPlanRevisionId: 'revision-publication-service-race', validationVersionId, idempotencyKey: 'publication-service-' + process.argv[1], expectedRevisionHash: hash('b'), validationHash: hash('c'), validationContent: JSON.stringify({ title: 'Publication service race' }), reviewContent: JSON.stringify({ reviewer: process.argv[1] }), astId: validationVersionId, astHash: hash('c'), contextHash: runtimeInput.contextHash, previewHash: runtimeInput.previewHash, receiptHash, projection: { validationNode: node, gherkin }, validationProjection: { validations: [node], gherkin }, runtimeInput, extensionReviews: [],
          })
          process.stdout.write(JSON.stringify({ outcome: 'published', id: publication.id }))
        } catch (error) {
          process.stdout.write(JSON.stringify({ outcome: 'error', code: error?.code, detail: error?.details?.code }))
        }
        process.exit(0)
      `
      const invoke = (reviewer: string) =>
        execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script, reviewer], {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' },
        })
      const [left, right] = await Promise.all([invoke('left'), invoke('right')])
      const results = [JSON.parse(left.stdout), JSON.parse(right.stdout)] as Array<{
        outcome: string
        code?: string
        detail?: string
      }>
      expect(results.filter(result => result.outcome === 'published')).toHaveLength(1)
      expect(results.filter(result => result.outcome === 'error')).toEqual([
        expect.objectContaining({ code: 'CONFLICT', detail: 'active_generation_conflict' }),
      ])
      expect(await prisma.qualityValidationGeneration.count()).toBe(1)
      expect(await prisma.qualityValidationPublication.count()).toBe(1)
      expect(await prisma.qualityValidationPublicationCommandReceipt.count()).toBe(1)
      expect(await prisma.module.count()).toBe(1)
      expect(await prisma.testCase.count()).toBe(1)
      expect(await prisma.$queryRaw<Array<{ table: string }>>`PRAGMA foreign_key_check`).toEqual([])
    } finally {
      await prisma.$disconnect()
    }
  }, 60_000)
})
