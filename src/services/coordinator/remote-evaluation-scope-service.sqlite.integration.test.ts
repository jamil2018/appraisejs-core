import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { hashCanonical } from '@/lib/quality-design/state'
import { ensureBuiltInStepDefinitionReadiness } from '@/services/step-definition/built-in-readiness-service'

const execFileAsync = promisify(execFile)
const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

const source = (file: string) => path.join(process.cwd(), file).replaceAll('\\', '\\\\')

/** Each child imports its own Prisma singleton from the same SQLite file. This
 * exercises the actual service's P2002 replay/retry path, not a shared fake. */
describe('remote evaluation scope service SQLite concurrency', () => {
  it('converges two independent service clients on one scope subject and two issuance receipts', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-remote-scope-service-sqlite-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    try {
      const design = { title: 'Login form', behavior: 'The login form is visible.' }
      await ensureBuiltInStepDefinitionReadiness(prisma)
      await prisma.targetProject.create({
        data: {
          id: 'target-remote-concurrent',
          kind: 'REMOTE_BLACK_BOX',
          canonicalIdentity: 'remote:https://www.saucedemo.com',
          normalizedRemoteOrigin: 'https://www.saucedemo.com',
          displayName: 'Sauce Demo',
          fingerprint: `sha256:${'a'.repeat(64)}`,
        },
      })
      await prisma.qualityPlan.create({
        data: { id: 'plan-remote-concurrent', targetProjectId: 'target-remote-concurrent', title: 'Remote scope' },
      })
      await prisma.qualityPlanRevision.create({
        data: {
          id: 'revision-remote-concurrent',
          targetProjectId: 'target-remote-concurrent',
          qualityPlanId: 'plan-remote-concurrent',
          revision: 1,
          status: 'SCENARIOS_APPROVED',
          contentHash: `sha256:${'b'.repeat(64)}`,
          sourceSpecification: '{}',
          requirementGraphJson: '{}',
        },
      })
      await prisma.environment.create({
        data: {
          id: 'environment-remote-concurrent',
          targetProjectId: 'target-remote-concurrent',
          name: 'Sauce Demo',
          baseUrl: 'https://www.saucedemo.com',
        },
      })
      await prisma.module.create({
        data: { id: 'module-remote-concurrent', targetProjectId: 'target-remote-concurrent', name: 'Login' },
      })
      await prisma.locatorGroup.create({
        data: {
          id: 'group-remote-concurrent',
          targetProjectId: 'target-remote-concurrent',
          moduleId: 'module-remote-concurrent',
          name: 'Login',
          route: '/',
        },
      })
      await prisma.locator.create({
        data: {
          id: 'locator-remote-concurrent',
          targetProjectId: 'target-remote-concurrent',
          locatorGroupId: 'group-remote-concurrent',
          name: 'login form',
          value: '#login_button',
        },
      })
      await prisma.validationVersion.create({
        data: {
          id: 'validation-remote-concurrent',
          targetProjectId: 'target-remote-concurrent',
          qualityPlanRevisionId: 'revision-remote-concurrent',
          validationIdentity: 'login form visible',
          version: 1,
          status: 'SCENARIO_APPROVED',
          canonicalAstJson: JSON.stringify(design),
          canonicalHash: `sha256:${'c'.repeat(64)}`,
        },
      })

      const script = `
        import '${source('src/services/coordinator/assessment-preparation-service.ts')}'
        import { createRemoteEvaluationScope } from '${source('src/services/coordinator/remote-evaluation-scope-service.ts')}'
        const result = await createRemoteEvaluationScope({
          target: 'target-remote-concurrent',
          qualityPlanId: 'plan-remote-concurrent',
          revisionId: 'revision-remote-concurrent',
          expectedDesignHash: '${hashCanonical([design])}',
          validationBindings: [{ validationId: 'validation-remote-concurrent', locatorIds: ['locator-remote-concurrent'], steps: [{ stepId: 'browser.navigation.navigate.to.environment.base.url', version: '1', inputs: {}, keyword: 'Given', description: 'the environment base URL is open' }, { stepId: 'browser.assertions.visible', version: '1', inputs: { target: 'locator-remote-concurrent' }, keyword: 'Then', description: 'the login form is visible' }] }],
          environment: { environmentId: 'environment-remote-concurrent' },
          runtime: { browserEngine: 'CHROMIUM' },
          idempotencyKey: process.argv[1],
        })
        process.stdout.write(JSON.stringify({ subjectId: result.subject.id, replayed: result.replayed }))
        process.exit(0)
      `
      const invoke = (key: string) =>
        execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script, key], {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' },
        })
      const [left, right] = await Promise.all([invoke('scope-concurrent-left'), invoke('scope-concurrent-right')])
      const results = [JSON.parse(left.stdout), JSON.parse(right.stdout)] as Array<{ subjectId: string }>
      expect(new Set(results.map(result => result.subjectId)).size).toBe(1)
      expect(await prisma.remoteEvaluationScopeBinding.count()).toBe(1)
      expect(await prisma.remoteEvaluationScopeIssuance.count()).toBe(2)

      const beforeRecovery = {
        subjects: await prisma.evaluationSubjectRevision.count(),
        bindings: await prisma.remoteEvaluationScopeBinding.count(),
        issuances: await prisma.remoteEvaluationScopeIssuance.count(),
      }
      const recoveryScript = `
        import { readRemoteEvaluationScope } from '${source('src/services/coordinator/remote-evaluation-scope-service.ts')}'
        const result = await readRemoteEvaluationScope({
          target: 'target-remote-concurrent',
          qualityPlanId: 'plan-remote-concurrent',
          revisionId: 'revision-remote-concurrent',
          subjectRevisionId: process.argv[1],
          responseMode: 'full',
        })
        process.stdout.write(JSON.stringify(result))
        process.exit(0)
      `
      const recovery = await execFileAsync(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '--eval', recoveryScript, results[0]!.subjectId],
        { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' } },
      )
      const packet = JSON.parse(recovery.stdout) as {
        subject: { subjectRevisionId: string }
        environment: { environmentId: string }
        runtime: { browserEngine: string }
        scope: { expectedPreflight: { algorithmVersion: string; preflightHash: string } }
        validationBindings: Array<{ validationId: string; steps: Array<{ inputs: Record<string, unknown> }> }>
      }
      expect(packet).toMatchObject({
        subject: { subjectRevisionId: results[0]!.subjectId },
        environment: { environmentId: 'environment-remote-concurrent' },
        runtime: { browserEngine: 'CHROMIUM' },
        scope: { expectedPreflight: { algorithmVersion: 'appraise.quality-assessment-preflight/v2' } },
        validationBindings: [
          {
            validationId: 'validation-remote-concurrent',
            steps: [{ inputs: {} }, { inputs: { target: 'locator-remote-concurrent' } }],
          },
        ],
      })
      expect(await prisma.evaluationSubjectRevision.count()).toBe(beforeRecovery.subjects)
      expect(await prisma.remoteEvaluationScopeBinding.count()).toBe(beforeRecovery.bindings)
      expect(await prisma.remoteEvaluationScopeIssuance.count()).toBe(beforeRecovery.issuances)

      await prisma.environment.create({
        data: {
          id: 'environment-remote-concurrent-secondary',
          targetProjectId: 'target-remote-concurrent',
          name: 'Sauce Demo secondary',
          baseUrl: 'https://www.saucedemo.com',
        },
      })
      await prisma.validationVersion.createMany({
        data: [
          {
            id: 'validation-remote-concurrent-secondary',
            targetProjectId: 'target-remote-concurrent',
            qualityPlanRevisionId: 'revision-remote-concurrent',
            validationIdentity: 'secondary login form visible',
            version: 1,
            status: 'SCENARIO_APPROVED',
            canonicalAstJson: JSON.stringify(design),
            canonicalHash: `sha256:${'d'.repeat(64)}`,
          },
          {
            id: 'validation-remote-concurrent-tertiary',
            targetProjectId: 'target-remote-concurrent',
            qualityPlanRevisionId: 'revision-remote-concurrent',
            validationIdentity: 'tertiary login form visible',
            version: 1,
            status: 'SCENARIO_APPROVED',
            canonicalAstJson: JSON.stringify(design),
            canonicalHash: `sha256:${'e'.repeat(64)}`,
          },
        ],
      })

      // Separate processes and Prisma clients force the manifest's real
      // idempotency race path (including SQLite lock recovery), rather than a
      // shared-client promise race. Both callers use the exact same key and
      // sealed partition packet, so a successful loser must return the
      // winner's immutable child identities.
      const partitionRaceScript = `
        import '${source('src/services/coordinator/assessment-preparation-service.ts')}'
        import { createRemoteEvaluationScopePartition } from '${source('src/services/coordinator/remote-evaluation-scope-service.ts')}'
        const altered = process.argv[1] === 'altered'
        const navigation = { stepId: 'browser.navigation.navigate.to.environment.base.url', version: '1', inputs: {}, keyword: 'Given', description: altered ? 'a changed environment navigation description' : 'the environment base URL is open' }
        const visible = validationId => ({ validationId, locatorIds: ['locator-remote-concurrent'], steps: [navigation, { stepId: 'browser.assertions.visible', version: '1', inputs: { target: 'locator-remote-concurrent' }, keyword: 'Then', description: 'the login form is visible' }] })
        try {
          const result = await createRemoteEvaluationScopePartition({
            target: 'target-remote-concurrent', qualityPlanId: 'plan-remote-concurrent', revisionId: 'revision-remote-concurrent',
            expectedDesignHash: '${hashCanonical([design, design, design])}',
            partitions: [
              { partitionKey: 'primary', environment: { environmentId: 'environment-remote-concurrent' }, validationBindings: [visible('validation-remote-concurrent')] },
              { partitionKey: 'secondary', environment: { environmentId: 'environment-remote-concurrent-secondary' }, validationBindings: [visible('validation-remote-concurrent-secondary'), visible('validation-remote-concurrent-tertiary')] },
            ],
            runtime: { browserEngine: 'CHROMIUM' }, idempotencyKey: 'partition-manifest-key',
          })
          process.stdout.write(JSON.stringify({ outcome: 'success', manifestId: result.manifest.manifestId, children: result.children.map(child => ({ partitionKey: child.partitionKey, subjectRevisionId: child.subject.subjectRevisionId })) }))
        } catch (error) {
          process.stdout.write(JSON.stringify({ outcome: 'error', code: error?.code, detail: error?.details?.code }))
        }
        process.exit(0)
      `
      const invokePartitionRace = (mode: 'exact' | 'altered') =>
        execFileAsync(
          process.execPath,
          ['--import', 'tsx', '--input-type=module', '--eval', partitionRaceScript, mode],
          {
            cwd: process.cwd(),
            env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' },
          },
        )
      const [partitionRaceLeft, partitionRaceRight] = await Promise.all([
        invokePartitionRace('exact'),
        invokePartitionRace('exact'),
      ])
      const partitionRaceResults = [
        JSON.parse(partitionRaceLeft.stdout),
        JSON.parse(partitionRaceRight.stdout),
      ] as Array<{
        outcome: string
        manifestId?: string
        children?: Array<{ partitionKey: string; subjectRevisionId: string }>
      }>
      expect(partitionRaceResults).toEqual([
        expect.objectContaining({ outcome: 'success', manifestId: expect.any(String), children: expect.any(Array) }),
        expect.objectContaining({ outcome: 'success', manifestId: expect.any(String), children: expect.any(Array) }),
      ])
      expect(new Set(partitionRaceResults.map(result => result.manifestId)).size).toBe(1)
      expect(partitionRaceResults[0]!.children).toEqual(partitionRaceResults[1]!.children)
      expect(await prisma.remoteEvaluationScopePartitionManifest.count()).toBe(1)
      const partitionConflict = JSON.parse((await invokePartitionRace('altered')).stdout) as {
        outcome: string
        code?: string
      }
      expect(partitionConflict).toMatchObject({ outcome: 'error', code: 'CONFLICT' })

      const partitionScript = `
        import { PrismaClient } from '@prisma/client'
        import { createRemoteEvaluationScope, createRemoteEvaluationScopePartition } from '${source('src/services/coordinator/remote-evaluation-scope-service.ts')}'
        import { preflightQualityAssessmentRun, prepareQualityAssessmentRun } from '${source('src/services/coordinator/assessment-preparation-service.ts')}'
        import { runQualityAssessment, setAssessmentRuntimeServiceFactoryForTests } from '${source('src/services/coordinator/assessment-execution-service.ts')}'
        const prisma = new PrismaClient()
        const bindings = {
          first: { validationId: 'validation-remote-concurrent', locatorIds: ['locator-remote-concurrent'], steps: [{ stepId: 'browser.navigation.navigate.to.environment.base.url', version: '1', inputs: {}, keyword: 'Given', description: 'the environment base URL is open' }, { stepId: 'browser.assertions.visible', version: '1', inputs: { target: 'locator-remote-concurrent' }, keyword: 'Then', description: 'the login form is visible' }] },
          second: { validationId: 'validation-remote-concurrent-secondary', locatorIds: ['locator-remote-concurrent'], steps: [{ stepId: 'browser.navigation.navigate.to.environment.base.url', version: '1', inputs: {}, keyword: 'Given', description: 'the environment base URL is open' }, { stepId: 'browser.assertions.visible', version: '1', inputs: { target: 'locator-remote-concurrent' }, keyword: 'Then', description: 'the login form is visible' }] },
          third: { validationId: 'validation-remote-concurrent-tertiary', locatorIds: ['locator-remote-concurrent'], steps: [{ stepId: 'browser.navigation.navigate.to.environment.base.url', version: '1', inputs: {}, keyword: 'Given', description: 'the environment base URL is open' }, { stepId: 'browser.assertions.visible', version: '1', inputs: { target: 'locator-remote-concurrent' }, keyword: 'Then', description: 'the login form is visible' }] },
        }
        const request = {
          target: 'target-remote-concurrent',
          qualityPlanId: 'plan-remote-concurrent',
          revisionId: 'revision-remote-concurrent',
          expectedDesignHash: '${hashCanonical([design, design, design])}',
          partitions: [{
            partitionKey: 'primary',
            environment: { environmentId: 'environment-remote-concurrent' },
            validationBindings: [bindings.first],
          }, {
            partitionKey: 'secondary',
            environment: { environmentId: 'environment-remote-concurrent-secondary' },
            validationBindings: [bindings.second, bindings.third],
          }],
          runtime: { browserEngine: 'CHROMIUM' },
          idempotencyKey: 'partition-manifest-key',
        }
        // Legacy v2 retains all-approved authority. The partition feature must
        // not let a caller manufacture a subset through the legacy operation.
        const legacy = await createRemoteEvaluationScope({
          target: request.target, qualityPlanId: request.qualityPlanId, revisionId: request.revisionId,
          expectedDesignHash: request.expectedDesignHash,
          validationBindings: [bindings.first, bindings.second, bindings.third],
          environment: { environmentId: 'environment-remote-concurrent' }, runtime: request.runtime,
          idempotencyKey: 'legacy-all-approved-key',
        })
        const result = await createRemoteEvaluationScopePartition(request)
        const preflight = async child => preflightQualityAssessmentRun({
          target: request.target, qualityPlanId: request.qualityPlanId, revisionId: request.revisionId,
          expectedDesignHash: request.expectedDesignHash, validationBindings: child.validationBindings,
          environment: { environmentId: child.environmentId }, runtime: request.runtime,
          subject: { subjectRevisionId: child.subject.subjectRevisionId, expectedSubjectDigest: child.subject.subjectDigest },
        })
        const primary = result.children.find(child => child.partitionKey === 'primary')
        const secondary = result.children.find(child => child.partitionKey === 'secondary')
        if (!primary || !secondary) throw new Error('Expected both persisted partition children')
        const [primaryPreflight, secondaryPreflight] = await Promise.all([preflight(primary), preflight(secondary)])
        const legacyPreflight = await preflightQualityAssessmentRun({
          target: request.target, qualityPlanId: request.qualityPlanId, revisionId: request.revisionId,
          expectedDesignHash: request.expectedDesignHash,
          validationBindings: [bindings.first, bindings.second, bindings.third],
          environment: { environmentId: 'environment-remote-concurrent' }, runtime: request.runtime,
          subject: { subjectRevisionId: legacy.subject.id, expectedSubjectDigest: legacy.subject.subjectDigest },
        })
        let partitionViolation
        try {
          await preflightQualityAssessmentRun({
            target: request.target, qualityPlanId: request.qualityPlanId, revisionId: request.revisionId,
            expectedDesignHash: request.expectedDesignHash, validationBindings: secondary.validationBindings,
            environment: { environmentId: primary.environmentId }, runtime: request.runtime,
            subject: { subjectRevisionId: primary.subject.subjectRevisionId, expectedSubjectDigest: primary.subject.subjectDigest },
          })
        } catch (error) {
          partitionViolation = { code: error?.code, detail: error?.details?.code }
        }
        // Exercise real compile/publication/preparation with only the primary
        // member. The runtime seam prevents browser/network I/O after all
        // durable phase guards have run.
        setAssessmentRuntimeServiceFactoryForTests(() => ({
          prepareQuality: async input => prisma.testRun.create({ data: {
            name: input.name, preparationKey: input.preparationKey, targetProjectId: input.targetProjectId,
            environmentId: input.environmentId, browserEngine: input.browserEngine ?? 'CHROMIUM', intent: 'ASSESSMENT',
            environmentSnapshotHash: input.environmentSnapshot?.hash, environmentSnapshotJson: input.environmentSnapshot?.json,
            environmentSnapshotVersion: input.environmentSnapshot?.version,
          }}),
          startQuality: async () => undefined,
          cancel: async () => undefined,
        }))
        const prepared = await prepareQualityAssessmentRun({
          target: request.target, qualityPlanId: request.qualityPlanId, revisionId: request.revisionId,
          expectedDesignHash: request.expectedDesignHash, validationBindings: primary.validationBindings,
          environment: { environmentId: primary.environmentId }, runtime: request.runtime,
          subject: { subjectRevisionId: primary.subject.subjectRevisionId, expectedSubjectDigest: primary.subject.subjectDigest },
          expectedPreflight: primaryPreflight.expectedPreflight, idempotencyKey: 'partition-primary-prepare',
        })
        const preparedReady = await prepareQualityAssessmentRun({
          target: request.target, qualityPlanId: request.qualityPlanId, revisionId: request.revisionId,
          expectedDesignHash: request.expectedDesignHash, validationBindings: primary.validationBindings,
          environment: { environmentId: primary.environmentId }, runtime: request.runtime,
          subject: { subjectRevisionId: primary.subject.subjectRevisionId, expectedSubjectDigest: primary.subject.subjectDigest },
          expectedPreflight: primaryPreflight.expectedPreflight, idempotencyKey: 'partition-primary-prepare',
        })
        const statuses = await prisma.validationVersion.findMany({
          where: { qualityPlanRevisionId: request.revisionId }, orderBy: { id: 'asc' }, select: { id: true, status: true, activeGenerationId: true },
        })
        const assessment = await prisma.assessment.findUniqueOrThrow({
          where: { id: preparedReady.assessment.id }, select: { status: true },
        })
        let executionViolation
        try {
          await runQualityAssessment({
            assessmentId: preparedReady.assessment.id,
            validationVersionIds: ['validation-remote-concurrent-secondary'],
            runtime: { environmentId: primary.environmentId, browserEngine: 'CHROMIUM' },
            idempotencyKey: 'partition-outside-execution',
          })
        } catch (error) {
          executionViolation = { code: error?.code, detail: error?.details?.code }
        }
        setAssessmentRuntimeServiceFactoryForTests()
        const replay = await createRemoteEvaluationScopePartition(request)
        process.stdout.write(JSON.stringify({
          result,
          replayed: replay.replayed,
          preflights: {
            primary: primaryPreflight.validations.map(item => item.validationVersionId),
            secondary: secondaryPreflight.validations.map(item => item.validationVersionId),
            legacy: legacyPreflight.validations.map(item => item.validationVersionId),
          },
          partitionViolation,
          executionViolation,
          prepared: { phase: prepared.phase, assessmentStatus: assessment.status, statuses },
        }))
        await prisma.$disconnect()
      `
      const partition = await execFileAsync(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '--eval', partitionScript],
        { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' } },
      )
      const partitionResult = JSON.parse(partition.stdout) as {
        manifest: { coverageHash: string }
        result: {
          manifest: { coverageHash: string }
          children: Array<{ partitionKey: string; validationBindings: Array<{ validationId: string }> }>
        }
        replayed: boolean
        preflights: { primary: string[]; secondary: string[]; legacy: string[] }
        partitionViolation: { code: string; detail: string }
        executionViolation: { code: string; detail: string }
        prepared: {
          phase: string
          assessmentStatus?: string
          statuses: Array<{ id: string; status: string; activeGenerationId: string | null }>
        }
      }
      expect(partitionResult).toMatchObject({
        result: {
          manifest: { coverageHash: expect.stringMatching(/^sha256:/) },
          children: [
            { partitionKey: 'primary', validationBindings: [{ validationId: 'validation-remote-concurrent' }] },
            {
              partitionKey: 'secondary',
              validationBindings: [
                { validationId: 'validation-remote-concurrent-secondary' },
                { validationId: 'validation-remote-concurrent-tertiary' },
              ],
            },
          ],
        },
        replayed: true,
        preflights: {
          primary: ['validation-remote-concurrent'],
          secondary: ['validation-remote-concurrent-secondary', 'validation-remote-concurrent-tertiary'],
          legacy: [
            'validation-remote-concurrent',
            'validation-remote-concurrent-secondary',
            'validation-remote-concurrent-tertiary',
          ],
        },
        partitionViolation: { code: 'CONFLICT', detail: 'REMOTE_SCOPE_PARTITION_AUTHORITY_VIOLATION' },
        executionViolation: { code: 'CONFLICT', detail: 'REMOTE_SCOPE_PARTITION_AUTHORITY_VIOLATION' },
        prepared: {
          phase: 'STARTED',
          assessmentStatus: 'RUNNING',
          statuses: [
            { id: 'validation-remote-concurrent', status: 'PUBLISHED', activeGenerationId: expect.any(String) },
            { id: 'validation-remote-concurrent-secondary', status: 'SCENARIO_APPROVED', activeGenerationId: null },
            { id: 'validation-remote-concurrent-tertiary', status: 'SCENARIO_APPROVED', activeGenerationId: null },
          ],
        },
      })
      expect(await prisma.remoteEvaluationScopePartitionManifest.count()).toBe(1)
      expect(await prisma.remoteEvaluationScopePartition.count()).toBe(2)

      // SQLite's insert-only trigger is the normal defense. Deliberately
      // bypass it in this isolated copy to prove replay recomputes the parent
      // packet before it can return any child authority.
      const manifest = await prisma.remoteEvaluationScopePartitionManifest.findFirstOrThrow({
        where: { idempotencyKey: 'partition-manifest-key' },
        select: { manifestHash: true },
      })
      await prisma.$executeRawUnsafe('DROP TRIGGER "RemoteEvaluationScopePartitionManifest_no_update"')
      await prisma.$executeRawUnsafe(
        'UPDATE "RemoteEvaluationScopePartitionManifest" SET "manifestHash" = \'sha256:9999999999999999999999999999999999999999999999999999999999999999\' WHERE "idempotencyKey" = \'partition-manifest-key\'',
      )
      const corruptedReplay = JSON.parse((await invokePartitionRace('exact')).stdout) as {
        outcome: string
        code?: string
        detail?: string
        children?: unknown
      }
      expect(corruptedReplay).toMatchObject({
        outcome: 'error',
        code: 'CONFLICT',
        detail: 'remote_evaluation_scope_stale',
      })
      expect(corruptedReplay.children).toBeUndefined()

      await prisma.$executeRawUnsafe(
        `UPDATE "RemoteEvaluationScopePartitionManifest" SET "manifestHash" = '${manifest.manifestHash}' WHERE "idempotencyKey" = 'partition-manifest-key'`,
      )
      await prisma.$executeRawUnsafe('DROP TRIGGER "RemoteEvaluationScopeBinding_no_update"')
      await prisma.$executeRawUnsafe(
        'UPDATE "RemoteEvaluationScopeBinding" SET "canonicalPreflightJson" = \'{}\' WHERE "id" IN (SELECT "remoteEvaluationScopeBindingId" FROM "RemoteEvaluationScopePartition")',
      )
      const corruptedBindingReplay = JSON.parse((await invokePartitionRace('exact')).stdout) as {
        outcome: string
        code?: string
        detail?: string
        children?: unknown
      }
      expect(corruptedBindingReplay).toMatchObject({
        outcome: 'error',
        code: 'CONFLICT',
        detail: 'remote_evaluation_scope_stale',
      })
      expect(corruptedBindingReplay.children).toBeUndefined()
    } finally {
      await prisma.$disconnect()
    }
  }, 60_000)

  it('lets only one independent root-assessment service client reserve an exact local scope', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-root-reservation-sqlite-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    try {
      await prisma.targetProject.create({
        data: {
          id: 'target-root-concurrent',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: `path:${workspace}`,
          canonicalPath: workspace,
          displayName: 'Root reservation',
          fingerprint: `sha256:${'f'.repeat(64)}`,
        },
      })
      await prisma.qualityPlan.create({
        data: { id: 'plan-root-concurrent', targetProjectId: 'target-root-concurrent', title: 'Root reservation' },
      })
      await prisma.qualityPlanRevision.create({
        data: {
          id: 'revision-root-concurrent',
          targetProjectId: 'target-root-concurrent',
          qualityPlanId: 'plan-root-concurrent',
          revision: 1,
          status: 'SCENARIOS_APPROVED',
          contentHash: `sha256:${'1'.repeat(64)}`,
          sourceSpecification: '{}',
          requirementGraphJson: '{}',
        },
      })
      const rootHash = (value: string) => `sha256:${value.repeat(64)}`
      await prisma.validationVersion.create({
        data: {
          id: 'validation-root-concurrent',
          targetProjectId: 'target-root-concurrent',
          qualityPlanRevisionId: 'revision-root-concurrent',
          validationIdentity: 'root readiness validation',
          version: 1,
          status: 'PUBLISHED',
          canonicalAstJson: '{}',
          canonicalHash: rootHash('2'),
        },
      })
      await prisma.qualityValidationGeneration.create({
        data: {
          id: 'generation-root-concurrent',
          generationKey: rootHash('3'),
          targetProjectId: 'target-root-concurrent',
          qualityPlanRevisionId: 'revision-root-concurrent',
          validationVersionId: 'validation-root-concurrent',
          artifactSchemaVersion: 'appraise.quality-validation-generation/v3',
          preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightAuthority: 'appraisejs:quality-validation-publication:v2',
          scopeIntentHash: rootHash('4'),
          realizationIntentHash: rootHash('5'),
          preflightHash: rootHash('6'),
          canonicalRealizationJson: '{}',
          realizationHash: rootHash('7'),
          compilationHash: rootHash('8'),
          assuranceLevel: 'STANDARD',
          disposition: 'ACTIVE',
        },
      })
      await prisma.qualityValidationPublication.create({
        data: {
          id: 'publication-root-concurrent',
          generationId: 'generation-root-concurrent',
          targetProjectId: 'target-root-concurrent',
          targetFingerprint: rootHash('f'),
          qualityPlanRevisionId: 'revision-root-concurrent',
          validationVersionId: 'validation-root-concurrent',
          operationHash: rootHash('9'),
          phase: 'review_ready',
          preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightAuthority: 'appraisejs:quality-validation-publication:v2',
          scopeIntentHash: rootHash('4'),
          realizationIntentHash: rootHash('5'),
          preflightHash: rootHash('6'),
          preflightDisposition: 'ACTIVE',
          expectedRevisionHash: rootHash('1'),
          validationHash: rootHash('2'),
          validationContent: '{}',
          reviewHash: rootHash('a'),
          reviewContent: '{}',
          astId: 'validation-root-concurrent',
          astHash: rootHash('b'),
          contextHash: rootHash('c'),
          previewHash: rootHash('d'),
          receiptHash: rootHash('e'),
          projectionHash: rootHash('f'),
          projectionJson: '{}',
          validationProjectionJson: '{}',
          runtimeInputHash: rootHash('a'),
          runtimeInputJson: '{}',
        },
      })
      await prisma.validationVersion.update({
        where: { id: 'validation-root-concurrent' },
        data: { activeGenerationId: 'generation-root-concurrent' },
      })
      const script = `
        import { createQualityAssessment } from '${source('src/services/coordinator/quality-design-service.ts')}'
        try {
          const result = await createQualityAssessment({
            qualityPlanId: 'plan-root-concurrent',
            revisionId: 'revision-root-concurrent',
            subject: { subjectDigest: 'sha256:${'2'.repeat(64)}', authority: 'artifact://root-concurrent' },
            idempotencyKey: process.argv[1],
          })
          process.stdout.write(JSON.stringify({ outcome: 'created', assessmentId: result.assessment.id, status: result.assessment.status }))
        } catch (error) {
          process.stdout.write(JSON.stringify({ outcome: 'error', code: error?.code, message: error instanceof Error ? error.message : String(error) }))
        }
        process.exit(0)
      `
      const invoke = (key: string) =>
        execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script, key], {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' },
        })
      const [left, right] = await Promise.all([invoke('root-concurrent-left'), invoke('root-concurrent-right')])
      const results = [JSON.parse(left.stdout), JSON.parse(right.stdout)] as Array<{
        outcome: string
        status?: string
        code?: string
        message?: string
      }>
      expect(results.filter(result => result.outcome === 'created')).toHaveLength(1)
      expect(results.filter(result => result.outcome === 'error')).toHaveLength(1)
      expect(results.find(result => result.outcome === 'created')).toMatchObject({ status: 'READY' })
      expect(results.find(result => result.outcome === 'error')).toMatchObject({ code: 'CONFLICT' })
      expect(await prisma.assessment.count()).toBe(1)
      expect(await prisma.assessment.findFirstOrThrow()).toMatchObject({ status: 'READY' })
    } finally {
      await prisma.$disconnect()
    }
  }, 60_000)

  it('rolls back a losing independent publication after one active generation wins', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-publication-race-sqlite-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    try {
      const hash = (value: string) => `sha256:${value.repeat(64)}`
      await prisma.targetProject.create({
        data: {
          id: 'target-publication-race',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: `path:${workspace}`,
          canonicalPath: workspace,
          displayName: 'Publication race',
          fingerprint: hash('a'),
        },
      })
      await prisma.qualityPlan.create({
        data: { id: 'plan-publication-race', targetProjectId: 'target-publication-race', title: 'Publication race' },
      })
      await prisma.qualityPlanRevision.create({
        data: {
          id: 'revision-publication-race',
          targetProjectId: 'target-publication-race',
          qualityPlanId: 'plan-publication-race',
          revision: 1,
          status: 'SCENARIOS_APPROVED',
          contentHash: hash('b'),
          sourceSpecification: '{}',
          requirementGraphJson: '{}',
        },
      })
      await prisma.validationVersion.create({
        data: {
          id: 'validation-publication-race',
          targetProjectId: 'target-publication-race',
          qualityPlanRevisionId: 'revision-publication-race',
          validationIdentity: 'publication race validation',
          version: 1,
          status: 'SCENARIO_APPROVED',
          canonicalAstJson: JSON.stringify({ title: 'Publication race' }),
          canonicalHash: hash('c'),
        },
      })
      await prisma.environment.create({
        data: {
          id: 'environment-publication-race',
          targetProjectId: 'target-publication-race',
          name: 'Publication race',
          baseUrl: 'https://example.test',
        },
      })

      // Each process constructs the real canonical envelope and imports its
      // own Prisma singleton.  Different review bytes intentionally create
      // different immutable generations; exactly one may become active.
      const script = `
        import { createHash } from 'node:crypto'
        import { builtInStepDefinitions } from '${source('packages/cucumber-runtime/src/step-definitions/index.ts')}'
        import { computeStepReferenceHash } from '${source('packages/cucumber-runtime/src/step-definitions/contracts.ts')}'
        import { createCustomExtensionPolicy } from '${source('src/lib/validation-ast/extension-policy.ts')}'
        import { defaultOperationDefinitions } from '${source('src/lib/operation-catalog/index.ts')}'
        import { canonicalContractJson } from '${source('src/lib/catalog-contracts/index.ts')}'
        import { hashCanonical } from '${source('src/lib/quality-design/state.ts')}'
        import { publishQualityValidationRuntime } from '${source('src/services/coordinator/quality-validation-publication-service.ts')}'

        const hash = value => 'sha256:' + value.repeat(64).slice(0, 64)
        const digest = value => 'sha256:' + createHash('sha256').update(canonicalContractJson(value)).digest('hex')
        const targetId = 'target-publication-race'
        const versionId = 'validation-publication-race'
        const environmentId = 'environment-publication-race'
        const targetFingerprint = hash('a')
        const definition = builtInStepDefinitions.find(item => item.identity.id === 'browser.navigation.navigate.to.environment.base.url' && item.identity.version === '1')
        if (!definition) throw new Error('Expected environment navigation Step Definition')
        const caseId = 'case-publication-race'
        const invocation = {
          step: { id: definition.identity.id, version: definition.identity.version, definitionHash: computeStepReferenceHash(definition) },
          inputs: {}, presentation: { keyword: 'Given', description: 'the environment base URL is open' },
        }
        const steps = [{ id: 'step-publication-race', order: 1, label: 'the environment base URL is open', gherkinStep: 'Given the environment base URL is open', invocation, parameters: [] }]
        const gherkin = ['Scenario: Publication race\\n  Given the environment base URL is open']
        const receiptHash = digest({ versionId, environmentId, steps })
        const compilerReceipt = { schemaVersion: '1', catalogHash: digest([invocation.step]), locatorGraphHash: digest([]), environments: [environmentId], browsers: ['chromium'], runtimes: ['node'] }
        const runtimeInput = {
          schemaVersion: '2', targetProjectId: targetId, targetFingerprint, astId: versionId, astHash: hash('c'),
          contextHash: digest({ targetId, versionId }), previewHash: digest({ gherkin, steps }), receiptHash,
          compilerReceipt: { ...compilerReceipt, contentHash: hashCanonical(compilerReceipt) },
          extensionPolicy: createCustomExtensionPolicy({ projectId: targetId, projectFingerprint: targetFingerprint, capabilityImports: {} }),
          rootInvocations: [{ caseId, stepId: steps[0].id, invocation }], locatorBindings: [],
          operationCardinalities: defaultOperationDefinitions.flatMap(operation => operation.inputs.filter(input => input.type === 'locator').map(input => ({ operation: operation.handler.id + '@' + operation.handler.version, inputName: input.name, cardinality: input.cardinality }))),
          stepDefinitions: [invocation.step], locators: [], extensions: [], matrix: [{ browser: 'chromium', environment: environmentId }],
          expected: { scenarios: [{ scenarioId: versionId, caseId, stepIds: [steps[0].id] }], scenarioCount: 1 }, gherkinHash: digest(gherkin),
        }
        const node = { id: versionId, testCaseIds: [caseId], appraiseArtifacts: {
          modules: [{ id: 'module-publication-race', name: 'Publication race', parentId: null }], locatorGroups: [], locators: [],
          testCases: [{ id: caseId, title: 'Publication race', description: 'Independent publication race.', steps }],
          testSuites: [{ id: 'suite-publication-race', name: 'Publication race', moduleId: 'module-publication-race', testCaseIds: [caseId] }],
        }, matrix: runtimeInput.matrix }
        const reviewContent = JSON.stringify({ reviewer: process.argv[1] })
        try {
          const result = await publishQualityValidationRuntime({
            targetProjectId: targetId, targetFingerprint, qualityPlanRevisionId: 'revision-publication-race', validationVersionId: versionId,
            idempotencyKey: 'publication-race-' + process.argv[1], expectedRevisionHash: hash('b'), validationHash: hash('c'), validationContent: JSON.stringify({ title: 'Publication race' }),
            reviewContent, astId: versionId, astHash: hash('c'), contextHash: runtimeInput.contextHash, previewHash: runtimeInput.previewHash, receiptHash,
            projection: { validationNode: node, gherkin }, validationProjection: { validations: [node], gherkin }, runtimeInput, extensionReviews: [],
          })
          process.stdout.write(JSON.stringify({ outcome: 'published', id: result.id }))
        } catch (error) {
          process.stdout.write(JSON.stringify({ outcome: 'error', code: error?.code, detail: error?.details?.code, message: error instanceof Error ? error.message : String(error) }))
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
      expect(
        await prisma.validationVersion.findUniqueOrThrow({ where: { id: 'validation-publication-race' } }),
      ).toMatchObject({
        activeGenerationId: expect.any(String),
      })
    } finally {
      await prisma.$disconnect()
    }
  }, 60_000)

  it('rechecks a remote predecessor and makes successor races exact across independent service processes', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-successor-race-sqlite-'))
    workspaces.push(workspace)
    const databasePath = path.join(workspace, 'appraise.db')
    await copyMigratedTestDatabase(databasePath)
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    try {
      const hash = (value: string) => `sha256:${value.repeat(64)}`
      const design = { title: 'Login form', behavior: 'The login form is visible.' }
      await ensureBuiltInStepDefinitionReadiness(prisma)
      await prisma.targetProject.create({
        data: {
          id: 'target-successor-race',
          kind: 'REMOTE_BLACK_BOX',
          canonicalIdentity: 'remote:https://www.saucedemo.com',
          normalizedRemoteOrigin: 'https://www.saucedemo.com',
          displayName: 'Successor race',
          fingerprint: hash('a'),
        },
      })
      await prisma.qualityPlan.create({
        data: { id: 'plan-successor-race', targetProjectId: 'target-successor-race', title: 'Successor race' },
      })
      await prisma.qualityPlanRevision.create({
        data: {
          id: 'revision-successor-race',
          targetProjectId: 'target-successor-race',
          qualityPlanId: 'plan-successor-race',
          revision: 1,
          status: 'SCENARIOS_APPROVED',
          contentHash: hash('b'),
          sourceSpecification: '{}',
          requirementGraphJson: '{}',
        },
      })
      await prisma.environment.create({
        data: {
          id: 'environment-successor-race',
          targetProjectId: 'target-successor-race',
          name: 'Successor race',
          baseUrl: 'https://www.saucedemo.com',
        },
      })
      await prisma.module.create({
        data: { id: 'module-successor-race', targetProjectId: 'target-successor-race', name: 'Login' },
      })
      await prisma.locatorGroup.create({
        data: {
          id: 'group-successor-race',
          targetProjectId: 'target-successor-race',
          moduleId: 'module-successor-race',
          name: 'Login',
          route: '/',
        },
      })
      await prisma.locator.create({
        data: {
          id: 'locator-successor-race',
          targetProjectId: 'target-successor-race',
          locatorGroupId: 'group-successor-race',
          name: 'login form',
          value: '#login_button',
        },
      })
      await prisma.validationVersion.create({
        data: {
          id: 'validation-successor-race',
          targetProjectId: 'target-successor-race',
          qualityPlanRevisionId: 'revision-successor-race',
          validationIdentity: 'login form visible',
          version: 1,
          status: 'SCENARIO_APPROVED',
          canonicalAstJson: JSON.stringify(design),
          canonicalHash: hash('c'),
        },
      })

      const scopeScript = `
        import '${source('src/services/coordinator/assessment-preparation-service.ts')}'
        import { createRemoteEvaluationScope } from '${source('src/services/coordinator/remote-evaluation-scope-service.ts')}'
        const result = await createRemoteEvaluationScope({
          target: 'target-successor-race', qualityPlanId: 'plan-successor-race', revisionId: 'revision-successor-race', expectedDesignHash: '${hashCanonical([design])}',
          validationBindings: [{ validationId: 'validation-successor-race', locatorIds: ['locator-successor-race'], steps: [{ stepId: 'browser.navigation.navigate.to.environment.base.url', version: '1', inputs: {}, keyword: 'Given', description: 'the environment base URL is open' }, { stepId: 'browser.assertions.visible', version: '1', inputs: { target: 'locator-successor-race' }, keyword: 'Then', description: 'the login form is visible' }] }],
          environment: { environmentId: 'environment-successor-race' }, runtime: { browserEngine: 'CHROMIUM' }, idempotencyKey: 'scope-successor-race',
        })
        process.stdout.write(JSON.stringify(result.subject)); process.exit(0)
      `
      const scopeResult = await execFileAsync(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '--eval', scopeScript],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' },
        },
      )
      const subject = JSON.parse(scopeResult.stdout) as { id: string; subjectDigest: string }
      for (const id of ['assessment-successor-same', 'assessment-successor-different']) {
        await prisma.assessment.create({
          data: {
            id,
            targetProjectId: 'target-successor-race',
            qualityPlanId: 'plan-successor-race',
            qualityPlanRevisionId: 'revision-successor-race',
            evaluationSubjectRevisionId: subject.id,
            status: 'DECIDED',
            lineageId: id,
          },
        })
      }
      const predecessorBefore = await prisma.assessment.findMany({
        where: { id: { in: ['assessment-successor-same', 'assessment-successor-different'] } },
        orderBy: { id: 'asc' },
      })

      const successorScript = `
        import '${source('src/services/coordinator/assessment-preparation-service.ts')}'
        import { createQualityAssessmentSuccessor } from '${source('src/services/coordinator/quality-design-service.ts')}'
        try {
          const result = await createQualityAssessmentSuccessor({
            assessmentId: process.argv[1],
            subject: { subjectRevisionId: '${subject.id}', expectedSubjectDigest: '${subject.subjectDigest}' },
            disposition: { code: 'retry', rationale: 'Independent race fixture', retryReason: 'fresh immutable evaluation' },
            idempotencyKey: process.argv[2],
          })
          process.stdout.write(JSON.stringify({ outcome: 'created', id: result.assessment.id, status: result.assessment.status }))
        } catch (error) {
          process.stdout.write(JSON.stringify({ outcome: 'error', code: error?.code, message: error instanceof Error ? error.message : String(error) }))
        }
        process.exit(0)
      `
      const invoke = (assessmentId: string, key: string) =>
        execFileAsync(
          process.execPath,
          ['--import', 'tsx', '--input-type=module', '--eval', successorScript, assessmentId, key],
          {
            cwd: process.cwd(),
            env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'test' },
          },
        )

      // The remote recheck occurs before any successor write.  A changed
      // environment rejects the request and leaves both predecessors alone.
      await prisma.environment.update({
        where: { id: 'environment-successor-race' },
        data: { scopeVersion: 2 },
      })
      const stale = JSON.parse((await invoke('assessment-successor-same', 'stale-key')).stdout) as {
        outcome: string
        code?: string
      }
      expect(stale).toMatchObject({ outcome: 'error', code: 'CONFLICT' })
      expect(await prisma.assessment.count()).toBe(2)
      await prisma.environment.update({ where: { id: 'environment-successor-race' }, data: { scopeVersion: 1 } })

      const [sameLeft, sameRight] = await Promise.all([
        invoke('assessment-successor-same', 'same-successor-key'),
        invoke('assessment-successor-same', 'same-successor-key'),
      ])
      const sameResults = [JSON.parse(sameLeft.stdout), JSON.parse(sameRight.stdout)] as Array<{
        outcome: string
        id?: string
        status?: string
      }>
      expect(sameResults).toEqual([
        expect.objectContaining({ outcome: 'created', status: 'READY' }),
        expect.objectContaining({ outcome: 'created', status: 'READY' }),
      ])
      expect(new Set(sameResults.map(result => result.id)).size).toBe(1)

      const [differentLeft, differentRight] = await Promise.all([
        invoke('assessment-successor-different', 'different-successor-left'),
        invoke('assessment-successor-different', 'different-successor-right'),
      ])
      const differentResults = [JSON.parse(differentLeft.stdout), JSON.parse(differentRight.stdout)] as Array<{
        outcome: string
        code?: string
      }>
      expect(differentResults.filter(result => result.outcome === 'created')).toHaveLength(1)
      expect(differentResults.filter(result => result.outcome === 'error')).toEqual([
        expect.objectContaining({ code: 'CONFLICT' }),
      ])

      const predecessorsAfter = await prisma.assessment.findMany({
        where: { id: { in: ['assessment-successor-same', 'assessment-successor-different'] } },
        orderBy: { id: 'asc' },
      })
      expect(predecessorsAfter).toEqual(predecessorBefore)
      const successors = await prisma.assessment.findMany({
        where: { supersedesAssessmentId: { in: ['assessment-successor-same', 'assessment-successor-different'] } },
        include: { evidenceReceipts: true, runs: true, decisions: true },
        orderBy: { supersedesAssessmentId: 'asc' },
      })
      expect(successors).toHaveLength(2)
      for (const successor of successors) {
        expect(successor).toMatchObject({ status: 'READY', generation: 1, evaluationSubjectRevisionId: subject.id })
        expect(successor.evidenceReceipts).toEqual([])
        expect(successor.runs).toEqual([])
        expect(successor.decisions).toEqual([])
      }
    } finally {
      await prisma.$disconnect()
    }
  }, 60_000)
})
