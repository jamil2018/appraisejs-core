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

const source = (file: string) => path.join(process.cwd(), file).replaceAll('\\', '\\\\')

describe('remote evaluation scope preparation SQLite lifecycle', () => {
  it('carries one valid approved binding through issuance, preflight, publication, readiness, and preparation', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-remote-scope-preparation-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)
    const script = `
      import { PrismaClient } from '@prisma/client'
      import { builtInStepDefinitions } from '${source('packages/cucumber-runtime/src/step-definitions/index.ts')}'
      import { hashCanonical } from '${source('src/lib/quality-design/state.ts')}'
      import { ensureBuiltInStepDefinitionReadiness } from '${source('src/services/step-definition/built-in-readiness-service.ts')}'
      import { searchLocatorGraph } from '${source('src/services/locator-graph/locator-graph-service.ts')}'
      import { assertRemoteEvaluationScopeCurrent, createRemoteEvaluationScope } from '${source('src/services/coordinator/remote-evaluation-scope-service.ts')}'
      import { preflightQualityAssessmentRun, prepareQualityAssessmentRun, resolveCanonicalAssessmentPreflight } from '${source('src/services/coordinator/assessment-preparation-service.ts')}'
      import { readQualityAssessment } from '${source('src/services/coordinator/quality-design-service.ts')}'
      import { setAssessmentRuntimeServiceFactoryForTests } from '${source('src/services/coordinator/assessment-execution-service.ts')}'
      import { decideExecutionConsent } from '${source('src/services/coordinator/quality-operating-system-service.ts')}'
      import { RuntimeCapsuleMaterializer } from '${source('src/lib/runtime-capsule/materializer.ts')}'
      import { RuntimeCapsulePreflight } from '${source('src/lib/runtime-capsule/preflight.ts')}'
      import { canonicalContractJson } from '${source('src/lib/catalog-contracts/index.ts')}'

      const prisma = new PrismaClient()
      const hash = character => 'sha256:' + character.repeat(64)
      const targetId = 'target-scope-preparation'
      const qualityPlanId = 'plan-scope-preparation'
      const revisionId = 'revision-scope-preparation'
      const validationId = 'validation-scope-preparation'
      const changedValidationId = 'validation-scope-preparation-changed-id'
      const environmentId = 'environment-scope-preparation'
      const locatorId = 'locator-scope-preparation'
      const secondaryLocatorId = 'z-locator-scope-preparation'
      const design = { title: 'Visible login form', behavior: 'The login form is visible.' }
      try {
        const definition = builtInStepDefinitions.find(item => item.identity.id === 'browser.assertions.visible' && item.identity.version === '1')
        const navigationDefinition = builtInStepDefinitions.find(item => item.identity.id === 'browser.navigation.navigate.to.environment.base.url' && item.identity.version === '1')
        if (!definition || !navigationDefinition) throw new Error('Expected visible and environment-navigation Step Definitions')
        await ensureBuiltInStepDefinitionReadiness(prisma)
        await prisma.targetProject.create({ data: {
          id: targetId, kind: 'REMOTE_BLACK_BOX', canonicalIdentity: 'remote:https://www.saucedemo.com',
          normalizedRemoteOrigin: 'https://www.saucedemo.com', displayName: 'Sauce Demo', fingerprint: hash('a'), executionConsentMode: 'TRUSTED_AGENT',
        }})
        await prisma.module.create({ data: { id: 'module-scope-preparation', name: 'Login', targetProjectId: targetId } })
        await prisma.locatorGroup.create({ data: {
          id: 'locator-group-scope-preparation', name: 'Login', route: '/', moduleId: 'module-scope-preparation', targetProjectId: targetId,
        }})
        await prisma.locator.create({ data: {
          id: locatorId, name: 'login form', value: '#login_button', locatorGroupId: 'locator-group-scope-preparation', targetProjectId: targetId,
        }})
        await prisma.locator.create({ data: {
          id: secondaryLocatorId, name: 'login helper', value: '#login_helper', locatorGroupId: 'locator-group-scope-preparation', targetProjectId: targetId,
        }})
        await prisma.qualityPlan.create({ data: { id: qualityPlanId, targetProjectId: targetId, title: 'Remote preparation' } })
        await prisma.qualityPlanRevision.create({ data: {
          id: revisionId, targetProjectId: targetId, qualityPlanId, revision: 1, status: 'SCENARIOS_APPROVED',
          contentHash: hash('b'), sourceSpecification: '{}', requirementGraphJson: '{}',
        }})
        await prisma.requirementAnalysisRevision.create({ data: {
          id: 'analysis-' + revisionId, targetProjectId: targetId, qualityPlanRevisionId: revisionId, revision: 1,
          status: 'APPROVED', decision: 'APPROVED', analysisJson: '{}', provenanceJson: '{}', analysisHash: hash('analysis'),
          decisionRationale: 'Fixture analysis.', decidedBy: 'fixture', decidedAt: new Date(), approvedAt: new Date(), approvedBy: 'fixture', approvalHash: hash('analysis-approval'),
        }})
        await prisma.validationDesignRevision.create({ data: {
          id: 'design-' + revisionId, targetProjectId: targetId, qualityPlanRevisionId: revisionId, requirementAnalysisRevisionId: 'analysis-' + revisionId, revision: 1,
          status: 'APPROVED', decision: 'APPROVED', strategyJson: '{}', scenarioPortfolioJson: '[]', provenanceJson: '{}', designHash: hash('design'),
          decisionRationale: 'Fixture design.', decidedBy: 'fixture', decidedAt: new Date(), approvedAt: new Date(), approvedBy: 'fixture', approvalHash: hash('design-approval'),
        }})
        await prisma.validationVersion.create({ data: {
          id: validationId, targetProjectId: targetId, qualityPlanRevisionId: revisionId,
          validationDesignRevisionId: 'design-' + revisionId,
          validationIdentity: 'visible login form', version: 1, status: 'SCENARIO_APPROVED',
          canonicalAstJson: JSON.stringify(design), canonicalHash: hash('c'),
        }})
        await prisma.environment.create({ data: {
          id: environmentId, targetProjectId: targetId, name: 'Sauce Demo', baseUrl: 'https://www.saucedemo.com',
        }})
        const discovered = await searchLocatorGraph({ qualityPlanId, query: 'login' }, prisma, targetId)
        const discoveredLocator = discovered.locators[0]
        if (
          !discoveredLocator ||
          discoveredLocator.id !== locatorId ||
          discoveredLocator.presentationId !== 'locator_' + locatorId ||
          discoveredLocator.group?.id !== 'locator-group-scope-preparation' ||
          discoveredLocator.group?.presentationId !== 'group_locator-group-scope-preparation'
        )
          throw new Error('locator_search did not return bindable persistent IDs plus graph presentation IDs')
        const binding = [{
          validationId,
          // Deliberately retain discovery order rather than lexical order.
          // Scope issuance normalizes it; public preflight must now do the
          // same inside the canonical resolver before it asserts the scope.
          locatorIds: [secondaryLocatorId, discoveredLocator.id],
          steps: [
            { stepId: 'browser.navigation.navigate.to.environment.base.url', version: '1', inputs: {}, keyword: 'Given', description: 'the environment base URL is open' },
            { stepId: 'browser.assertions.visible', version: '1', inputs: { target: discoveredLocator.id }, keyword: 'Then', description: 'the login form is visible' },
          ],
        }]
        const request = {
          target: targetId, qualityPlanId, revisionId, expectedDesignHash: hashCanonical([design]),
          validationBindings: binding, environment: { environmentId }, runtime: { browserEngine: 'CHROMIUM' },
        }
        let rejectedAlias = false
        try {
          await createRemoteEvaluationScope({
            ...request,
            validationBindings: [{
              ...binding[0],
              locatorIds: [discoveredLocator.presentationId],
              steps: [binding[0].steps[0], { ...binding[0].steps[1], inputs: { target: discoveredLocator.presentationId } }],
            }],
            idempotencyKey: 'remote-scope-prefixed-alias',
          })
        } catch {
          // Prefixed graph aliases intentionally remain invalid at the compact
          // binding boundary; callers must use locator_search.id.
          rejectedAlias = true
        }
        if (!rejectedAlias) throw new Error('Expected prefixed locator_search presentationId to be rejected by scope issuance')
        const issued = await createRemoteEvaluationScope({ ...request, idempotencyKey: 'remote-scope-preparation' })
        const validationCatalog = await prisma.validationVersion.findUniqueOrThrow({ where: { id: validationId } })
        const assertPreflightScopeDrift = async label => {
          try {
            await preflightQualityAssessmentRun({ ...request, subject: { subjectRevisionId: issued.subject.id } })
          } catch (error) {
            if (
              error &&
              typeof error === 'object' &&
              error.code === 'CONFLICT' &&
              error.details?.code === 'remote_evaluation_scope_stale'
            )
              return
            throw error
          }
          throw new Error('Expected remote scope preflight drift after ' + label)
        }
        await prisma.validationVersion.update({ where: { id: validationId }, data: { canonicalHash: hash('d') } })
        await assertPreflightScopeDrift('canonical validation hash')
        await prisma.validationVersion.update({
          where: { id: validationId }, data: { canonicalHash: validationCatalog.canonicalHash },
        })
        await prisma.validationVersion.update({
          where: { id: validationId }, data: { validationIdentity: 'changed-validation-identity' },
        })
        await assertPreflightScopeDrift('validation identity')
        await prisma.validationVersion.update({
          where: { id: validationId }, data: { validationIdentity: validationCatalog.validationIdentity },
        })
        await prisma.validationVersion.update({ where: { id: validationId }, data: { version: validationCatalog.version + 1 } })
        await assertPreflightScopeDrift('validation version')
        await prisma.validationVersion.update({ where: { id: validationId }, data: { version: validationCatalog.version } })
        await prisma.validationVersion.update({ where: { id: validationId }, data: { id: changedValidationId } })
        await assertPreflightScopeDrift('validation version identifier/set')
        await prisma.validationVersion.update({ where: { id: changedValidationId }, data: { id: validationId } })
        await prisma.validationVersion.update({
          where: { id: validationId }, data: { canonicalAstJson: JSON.stringify({ ...design, behavior: 'Changed approved design.' }) },
        })
        await assertPreflightScopeDrift('approved design content')
        await prisma.validationVersion.update({ where: { id: validationId }, data: { canonicalAstJson: JSON.stringify(design) } })
        const preflight = await preflightQualityAssessmentRun({ ...request, subject: { subjectRevisionId: issued.subject.id } })
        if (!preflight.ready || !preflight.preflightHash || !preflight.algorithmVersion || !preflight.scopeIntentHash || !preflight.realizationIntentHash)
          throw new Error('Expected a ready v2 remote preflight')
        if ('scopeIntent' in preflight || 'realizationIntent' in preflight)
          throw new Error('Public preflight exposed raw intent content')
        if (
          issued.scope.scopeIntentHash !== preflight.scopeIntentHash ||
          issued.scope.realizationIntentHash !== preflight.realizationIntentHash ||
          issued.scope.preflightHash !== preflight.preflightHash
        ) throw new Error('Scope issuance and public preflight returned different v2 identities')
        await prepareQualityAssessmentRun({
          ...request, subject: { subjectRevisionId: issued.subject.id }, idempotencyKey: 'remote-scope-missing-preflight',
        }).then(
          () => { throw new Error('Remote preparation accepted a missing v2 expectedPreflight token') },
          error => {
            if (error?.details?.code !== 'expected_preflight_required') throw error
          },
        )
        // The runtime factory is the sole external capsule/browser/process seam.
        // The scope, preflight, compiler, publication, Assessment, and SQLite reads remain real.
        setAssessmentRuntimeServiceFactoryForTests(() => ({
          prepareQuality: async input => prisma.testRun.create({ data: {
            name: input.name, preparationKey: input.preparationKey, targetProjectId: input.targetProjectId,
            environmentId: input.environmentId, browserEngine: input.browserEngine ?? 'CHROMIUM', intent: 'ASSESSMENT',
            environmentSnapshotHash: input.environmentSnapshot?.hash,
            environmentSnapshotJson: input.environmentSnapshot?.json,
            environmentSnapshotVersion: input.environmentSnapshot?.version,
          }}),
          startQuality: async () => undefined,
          cancel: async () => undefined,
        }))
        const consentRequested = await prepareQualityAssessmentRun({
          ...request, subject: { subjectRevisionId: issued.subject.id },
          expectedPreflight: {
            algorithmVersion: preflight.algorithmVersion,
            preflightHash: preflight.preflightHash,
          }, idempotencyKey: 'remote-scope-prepare',
        })
        if (consentRequested.failure?.message !== 'Explicit execution consent is required.' || !consentRequested.assessment?.id)
          throw new Error('Remote preparation did not create an explicit consent boundary: ' + JSON.stringify(consentRequested))
        const consent = await prisma.executionConsent.findUniqueOrThrow({ where: { assessmentId: consentRequested.assessment.id } })
        await decideExecutionConsent({
          consentId: consent.id,
          assessmentId: consentRequested.assessment.id,
          expectedManifestHash: consent.executionManifestHash,
          grantedBy: 'fixture',
        })
        const prepared = await prepareQualityAssessmentRun({
          ...request,
          subject: { subjectRevisionId: issued.subject.id },
          expectedPreflight: {
            algorithmVersion: preflight.algorithmVersion,
            preflightHash: preflight.preflightHash,
          },
          idempotencyKey: 'remote-scope-prepare',
          consentId: consent.id,
          expectedExecutionManifestHash: consent.executionManifestHash,
        })
        if (prepared.phase !== 'STARTED' || !prepared.assessment?.id)
          throw new Error('Expected a started prepared Assessment: ' + JSON.stringify(prepared))
        const preparation = await prisma.assessmentPreparation.findFirstOrThrow({ where: { id: prepared.preparationId } })
        const persistedPreflight = JSON.parse(preparation.receiptJson).preflight
        for (const key of ['algorithmVersion', 'scopeIntentHash', 'realizationIntentHash', 'preflightHash']) {
          if (persistedPreflight[key] !== preflight[key] || prepared.preflight?.[key] !== preflight[key])
            throw new Error('Preparation receipt did not retain the exact v2 preflight identity for ' + key)
        }
        if ('scopeIntent' in persistedPreflight || 'realizationIntent' in persistedPreflight)
          throw new Error('Persisted preparation receipt exposed raw intent content')
        await assertRemoteEvaluationScopeCurrent({
          subjectRevisionId: issued.subject.id, targetProjectId: targetId, qualityPlanId,
          revisionId, environmentId,
        })
        const packet = await readQualityAssessment(prepared.assessment.id)
        const version = await prisma.validationVersion.findUniqueOrThrow({
          where: { id: validationId }, include: { activeGeneration: { include: { publication: true } } },
        })
        const publication = version.activeGeneration?.publication
        if (version.status !== 'PUBLISHED' || !publication || packet.subject.id !== issued.subject.id)
          throw new Error('Prepared remote lifecycle did not retain publication or scope subject identity')
        const projectionNode = JSON.parse(publication.projectionJson).validationNode
        const validationNode = JSON.parse(publication.validationProjectionJson).validations.find(item => item.id === validationId)
        if (!validationNode || canonicalContractJson(projectionNode) !== canonicalContractJson(validationNode))
          throw new Error('Published logical projection and validation artifact differ')
        if (projectionNode.appraiseArtifacts.locatorGroups.some(group => 'targetProjectId' in group))
          throw new Error('Published logical locator group retained persistence-only target ownership')
        const bindingRow = await prisma.assessmentRunBinding.findFirstOrThrow({ where: { assessmentRun: { assessmentId: prepared.assessment.id } } })
        const capsule = await new RuntimeCapsuleMaterializer(prisma, '${workspace.replaceAll('\\', '\\\\')}').materializeQuality({
          publicationId: publication.id,
          testRunId: bindingRow.testRunId,
        })
        if (!capsule.row.id) throw new Error('Published binding did not materialize a runtime capsule')
        // Materializer and preflight must agree on the durable qvp_* identity.
        // A compiler-only astpub_* manifest previously failed this first
        // preflight gate as PUBLICATION_MISMATCH despite a correct binding.
        const capsulePreflight = await new RuntimeCapsulePreflight(
          prisma,
          '${workspace.replaceAll('\\', '\\\\')}',
          {
            probeOutput: async () => undefined,
            prepareOutput: async () => undefined,
            runProcess: async () => ({ exitCode: 1, stdout: '', stderr: '', timedOut: false }),
            now: () => new Date('2026-08-24T00:00:00.000Z'),
          },
        ).check({
          projectId: targetId,
          validationHash: publication.validationHash,
          testRunId: bindingRow.testRunId,
          runId: (await prisma.testRun.findUniqueOrThrow({ where: { id: bindingRow.testRunId } })).runId,
        })
        if (capsulePreflight.checks[0]?.code !== 'CHECK_PASSED')
          throw new Error('Materialized capsule failed durable publication identity preflight: ' + JSON.stringify(capsulePreflight))
        await prisma.qualityValidationPublication.update({
          where: { id: publication.id }, data: { preflightAuthority: 'foreign:authority' },
        }).then(
          () => { throw new Error('Published validation authority was mutable') },
          error => {
            // SQLite may surface the immutable-row trigger through the
            // dependent composite FK as P2003 instead of the trigger text.
            if (error?.code !== 'P2003' && !String(error).includes('QualityValidationPublication immutable')) throw error
          },
        )
        const scopeBeforeServerOutputs = await resolveCanonicalAssessmentPreflight(request)
        await prisma.validationVersion.update({
          where: { id: validationId },
          data: {
            status: 'REALIZED',
            publishedAt: new Date('2026-08-22T01:00:00.000Z'),
            realizationJson: JSON.stringify({ serverOwned: 'changed-output' }),
            realizationHash: hash('e'),
            compilationHash: hash('f'),
          },
        })
        const scopeAfterServerOutputs = await resolveCanonicalAssessmentPreflight(request)
        if (scopeBeforeServerOutputs.scopeIntentHash !== scopeAfterServerOutputs.scopeIntentHash)
          throw new Error('Server lifecycle, timestamp, realization, or publication output changed scope intent')
        await assertRemoteEvaluationScopeCurrent({
          subjectRevisionId: issued.subject.id, targetProjectId: targetId, qualityPlanId,
          revisionId, environmentId,
        })
        const assertScopeDrift = async label => {
          try {
            await assertRemoteEvaluationScopeCurrent({
              subjectRevisionId: issued.subject.id, targetProjectId: targetId, qualityPlanId,
              revisionId, environmentId,
            })
          } catch (error) {
            if (
              error &&
              typeof error === 'object' &&
              error.code === 'CONFLICT' &&
              error.details?.code === 'remote_evaluation_scope_stale'
            )
              return
            throw error
          }
          throw new Error('Expected remote scope drift after ' + label)
        }
        const step = await prisma.stepDefinition.findUniqueOrThrow({
          where: { id_version: { id: 'browser.assertions.visible', version: '1' } },
        })
        const changedStep = JSON.parse(step.definitionJson)
        changedStep.intent.description = 'Changed external Step Definition.'
        await prisma.stepDefinition.update({
          where: { id_version: { id: 'browser.assertions.visible', version: '1' } },
          data: { definitionJson: JSON.stringify(changedStep) },
        })
        await assertScopeDrift('Step Definition content')
        await prisma.stepDefinition.update({
          where: { id_version: { id: 'browser.assertions.visible', version: '1' } },
          data: { definitionJson: step.definitionJson },
        })
        const locator = await prisma.locator.findUniqueOrThrow({ where: { id: locatorId } })
        await prisma.locator.update({ where: { id: locatorId }, data: { value: '#changed-login-button' } })
        await assertScopeDrift('locator content')
        await prisma.locator.update({ where: { id: locatorId }, data: { value: locator.value } })
        await prisma.validationVersion.update({
          where: { id: validationId },
          data: { canonicalAstJson: JSON.stringify({ ...design, behavior: 'Changed approved design.' }) },
        })
        await assertScopeDrift('approved design content')
        await prisma.validationVersion.update({ where: { id: validationId }, data: { canonicalAstJson: JSON.stringify(design) } })
        await prisma.environment.update({
          where: { id: environmentId },
          data: { expectedPageTitle: 'Changed remote environment binding' },
        })
        await assertScopeDrift('environment binding')
        process.stdout.write(JSON.stringify({ subjectRevisionId: issued.subject.id, algorithmVersion: preflight.algorithmVersion, scopeIntentHash: preflight.scopeIntentHash, realizationIntentHash: preflight.realizationIntentHash, preflightHash: preflight.preflightHash, assessmentId: prepared.assessment.id, publicationId: publication.id }))
      } finally {
        setAssessmentRuntimeServiceFactoryForTests()
        await prisma.$disconnect()
      }
    `
    const result = await execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' },
    })
    expect(JSON.parse(result.stdout)).toMatchObject({
      subjectRevisionId: expect.any(String),
      algorithmVersion: 'appraise.quality-assessment-preflight/v2',
      scopeIntentHash: expect.stringMatching(/^sha256:/),
      realizationIntentHash: expect.stringMatching(/^sha256:/),
      preflightHash: expect.stringMatching(/^sha256:/),
      assessmentId: expect.any(String),
      publicationId: expect.any(String),
    })
  }, 90_000)

  it('keeps public remote preflight production-resolver pure across the complete database and target workspace', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-remote-public-preflight-'))
    workspaces.push(root)
    const targetWorkspace = path.join(root, 'target-workspace')
    const databasePath = path.join(root, 'coordinator-state', 'appraise.db')
    await Promise.all([
      fs.mkdir(path.join(targetWorkspace, 'nested'), { recursive: true }),
      fs.mkdir(path.dirname(databasePath), { recursive: true }),
    ])
    await Promise.all([
      fs.writeFile(path.join(targetWorkspace, 'package.json'), '{"name":"excluded-target"}\n'),
      fs.writeFile(path.join(targetWorkspace, 'nested', 'fixture.txt'), 'preflight must not touch target files\n'),
      copyMigratedTestDatabase(databasePath),
    ])
    const script = `
      import { promises as fs } from 'node:fs'
      import path from 'node:path'
      import { PrismaClient } from '@prisma/client'
      import { canonicalContractJson } from '${source('src/lib/catalog-contracts/index.ts')}'
      import { hashCanonical } from '${source('src/lib/quality-design/state.ts')}'
      import { ensureBuiltInStepDefinitionReadiness } from '${source('src/services/step-definition/built-in-readiness-service.ts')}'
      import { createRemoteEvaluationScope } from '${source('src/services/coordinator/remote-evaluation-scope-service.ts')}'
      import { preflightQualityAssessmentRun } from '${source('src/services/coordinator/assessment-preparation-service.ts')}'

      const prisma = new PrismaClient()
      const targetWorkspace = process.argv[1]
      const hash = character => 'sha256:' + character.repeat(64)
      const targetId = 'target-public-preflight'
      const qualityPlanId = 'plan-public-preflight'
      const revisionId = 'revision-public-preflight'
      const validationId = 'validation-public-preflight'
      const environmentId = 'environment-public-preflight'
      const locatorId = 'locator-public-preflight'
      const design = { title: 'Login form', behavior: 'The login form is visible.' }
      const normalized = value => {
        if (typeof value === 'bigint') return { bigint: value.toString() }
        if (Array.isArray(value)) return value.map(normalized)
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalized(entry)]))
        return value
      }
      const rows = async () => {
        const tables = await prisma.$queryRawUnsafe('SELECT name FROM sqlite_master WHERE type = \\\'table\\\' AND name NOT LIKE \\\'sqlite_%\\\' ORDER BY name')
        return Promise.all(tables.map(async ({ name }) => {
          const values = await prisma.$queryRawUnsafe('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
          return [name, values.map(normalized).sort((a, b) => canonicalContractJson(a).localeCompare(canonicalContractJson(b)))]
        }))
      }
      const workspace = async directory => {
        const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true })
        return Promise.all(entries.filter(entry => entry.isFile()).map(async entry => {
          const relative = path.relative(directory, path.join(entry.parentPath, entry.name))
          return [relative, (await fs.readFile(path.join(entry.parentPath, entry.name))).toString('base64')]
        })).then(items => items.sort((a, b) => a[0].localeCompare(b[0])))
      }
      try {
        await ensureBuiltInStepDefinitionReadiness(prisma)
        await prisma.targetProject.create({ data: {
          id: targetId, kind: 'REMOTE_BLACK_BOX', canonicalIdentity: 'remote:https://www.saucedemo.com', normalizedRemoteOrigin: 'https://www.saucedemo.com', displayName: 'Sauce Demo', fingerprint: hash('a'),
        }})
        await prisma.module.create({ data: { id: 'module-public-preflight', targetProjectId: targetId, name: 'Login' }})
        await prisma.locatorGroup.create({ data: { id: 'group-public-preflight', targetProjectId: targetId, moduleId: 'module-public-preflight', name: 'Login', route: '/' }})
        await prisma.locator.create({ data: { id: locatorId, targetProjectId: targetId, locatorGroupId: 'group-public-preflight', name: 'login form', value: '#login_button' }})
        await prisma.qualityPlan.create({ data: { id: qualityPlanId, targetProjectId: targetId, title: 'Public preflight' }})
        await prisma.qualityPlanRevision.create({ data: { id: revisionId, targetProjectId: targetId, qualityPlanId, revision: 1, status: 'SCENARIOS_APPROVED', contentHash: hash('b'), sourceSpecification: '{}', requirementGraphJson: '{}' }})
        await prisma.requirementAnalysisRevision.create({ data: { id: 'analysis-' + revisionId, targetProjectId: targetId, qualityPlanRevisionId: revisionId, revision: 1, status: 'APPROVED', decision: 'APPROVED', analysisJson: '{}', provenanceJson: '{}', analysisHash: hash('analysis'), decisionRationale: 'Fixture analysis.', decidedBy: 'fixture', decidedAt: new Date(), approvedAt: new Date(), approvedBy: 'fixture', approvalHash: hash('analysis-approval') }})
        await prisma.validationDesignRevision.create({ data: { id: 'design-' + revisionId, targetProjectId: targetId, qualityPlanRevisionId: revisionId, requirementAnalysisRevisionId: 'analysis-' + revisionId, revision: 1, status: 'APPROVED', decision: 'APPROVED', strategyJson: '{}', scenarioPortfolioJson: '[]', provenanceJson: '{}', designHash: hash('design'), decisionRationale: 'Fixture design.', decidedBy: 'fixture', decidedAt: new Date(), approvedAt: new Date(), approvedBy: 'fixture', approvalHash: hash('design-approval') }})
        await prisma.validationVersion.create({ data: { id: validationId, targetProjectId: targetId, qualityPlanRevisionId: revisionId, validationDesignRevisionId: 'design-' + revisionId, validationIdentity: 'login form visible', version: 1, status: 'SCENARIO_APPROVED', canonicalAstJson: JSON.stringify(design), canonicalHash: hash('c') }})
        await prisma.environment.create({ data: { id: environmentId, targetProjectId: targetId, name: 'Sauce Demo', baseUrl: 'https://www.saucedemo.com' }})
        const request = {
          target: targetId, qualityPlanId, revisionId, expectedDesignHash: hashCanonical([design]),
          validationBindings: [{ validationId, locatorIds: [locatorId], steps: [{ stepId: 'browser.navigation.navigate.to.environment.base.url', version: '1', inputs: {}, keyword: 'Given', description: 'the environment base URL is open' }, { stepId: 'browser.assertions.visible', version: '1', inputs: { target: locatorId }, keyword: 'Then', description: 'the login form is visible' }]}],
          environment: { environmentId }, runtime: { browserEngine: 'CHROMIUM' },
        }
        const issued = await createRemoteEvaluationScope({ ...request, idempotencyKey: 'public-preflight-scope' })
        const beforeRows = await rows()
        const beforeWorkspace = await workspace(targetWorkspace)
        const preflight = await preflightQualityAssessmentRun({ ...request, subject: { subjectRevisionId: issued.subject.id } })
        const afterRows = await rows()
        const afterWorkspace = await workspace(targetWorkspace)
        if (canonicalContractJson(beforeRows) !== canonicalContractJson(afterRows)) throw new Error('Public preflight mutated a coordinator user-table row')
        if (canonicalContractJson(beforeWorkspace) !== canonicalContractJson(afterWorkspace)) throw new Error('Public preflight mutated excluded target workspace paths or bytes')
        if (!preflight.ready || preflight.algorithmVersion !== 'appraise.quality-assessment-preflight/v2' || !preflight.preflightHash || canonicalContractJson(preflight.expectedPreflight) !== canonicalContractJson({ algorithmVersion: preflight.algorithmVersion, preflightHash: preflight.preflightHash }))
          throw new Error('Public preflight did not return one exact v2 expectedPreflight token')
        const counts = {
          issuance: await prisma.remoteEvaluationScopeIssuance.count(), preparation: await prisma.assessmentPreparation.count(), publication: await prisma.qualityValidationPublication.count(), assessment: await prisma.assessment.count(), testRun: await prisma.testRun.count(), capsule: await prisma.runtimeCapsule.count(), environment: await prisma.environment.count(), environmentVersion: (await prisma.environment.findUniqueOrThrow({ where: { id: environmentId } })).scopeVersion,
        }
        if (canonicalContractJson(counts) !== canonicalContractJson({ issuance: 1, preparation: 0, publication: 0, assessment: 0, testRun: 0, capsule: 0, environment: 1, environmentVersion: 1 })) throw new Error('Public preflight changed durable issuance/preparation/runtime/environment state: ' + canonicalContractJson(counts))
        process.stdout.write(JSON.stringify({ preflight, counts }))
      } finally { await prisma.$disconnect() }
    `
    const result = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', script, targetWorkspace],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' },
      },
    )
    expect(JSON.parse(result.stdout)).toMatchObject({
      preflight: {
        ready: true,
        algorithmVersion: 'appraise.quality-assessment-preflight/v2',
        expectedPreflight: expect.any(Object),
      },
      counts: {
        issuance: 1,
        preparation: 0,
        publication: 0,
        assessment: 0,
        testRun: 0,
        capsule: 0,
        environment: 1,
        environmentVersion: 1,
      },
    })
  }, 90_000)
})
