import { promises as fs } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'

import { PlanContractError, serializeYamlArtifact, type PlanArtifact } from '@/lib/plan-contract'
import { createPlanRuntimeTestWorkspace } from '@/test/validation-ast-test-fixtures'

import { countPendingPlanSync, isLegacyManagedValidationProjectionError, syncPlans } from './plan-sync-service'

let workspace: string
let client: PrismaClient

function plan(planId: string, revision = 1): PlanArtifact {
  return {
    version: '1',
    planId,
    revision,
    lifecycle: 'draft',
    goal: `Deliver ${planId}`,
    description: `Describe the implementation scope for ${planId}.`,
    tasks: [
      {
        id: 'first-task',
        title: revision === 1 ? 'First task' : 'Updated first task',
        description: 'Implement the first task',
        acceptanceCriteria: ['It works'],
        validationIntent: 'Run focused tests',
      },
    ],
    edges: [],
    implementationGroups: [],
  }
}

async function writePlan(planId: string, source: string) {
  const plansRoot = path.join(workspace, 'appraise', 'plans')
  await fs.mkdir(plansRoot, { recursive: true })
  await fs.writeFile(path.join(plansRoot, `${planId}.yaml`), source)
}

async function writeValidation(planId: string, source: string) {
  const validationsRoot = path.join(workspace, 'appraise', 'plans', 'validations')
  await fs.mkdir(validationsRoot, { recursive: true })
  await fs.writeFile(path.join(validationsRoot, `${planId}.validation.yaml`), source)
}

beforeEach(async () => {
  ;({ workspace, client } = await createPlanRuntimeTestWorkspace('appraise-plan-sync-project-', 'sync.db'))
})

async function cleanupWorkspace() {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
}

afterEach(cleanupWorkspace)

describe('syncPlans', () => {
  it('recognizes only the closed legacy managed-validation incompatibility', () => {
    const message = 'Managed v2 validation steps require only an exact invocation.'
    const path = ['validations', '0', 'appraiseArtifacts', 'testCases']
    expect(isLegacyManagedValidationProjectionError(new PlanContractError('invalid-artifact', message, path))).toBe(
      true,
    )
    expect(
      isLegacyManagedValidationProjectionError(
        new PlanContractError('invalid-artifact', 'A different validation failure.', path),
      ),
    ).toBe(false)
    expect(isLegacyManagedValidationProjectionError(new PlanContractError('invalid-artifact', message))).toBe(false)
    expect(isLegacyManagedValidationProjectionError(new Error(message))).toBe(false)
  })

  it('upserts stable task projections and keeps the last valid view stale after malformed input', async () => {
    await writePlan('checkout-flow', serializeYamlArtifact('plan', plan('checkout-flow')))
    await expect(syncPlans({ projectDirectory: workspace, client })).resolves.toMatchObject({ created: 1, errors: 0 })

    const first = await client.planProjection.findUniqueOrThrow({
      where: { planId: 'checkout-flow' },
      include: { tasks: true, revisions: true },
    })
    expect(first).toMatchObject({ slug: 'checkout-flow', legacyPlanId: 'checkout-flow' })
    expect(first.tasks).toHaveLength(1)
    expect(first.revisions[0].reducedAssurance).toBe(true)
    const stableTaskId = first.tasks[0].id

    await writePlan('checkout-flow', serializeYamlArtifact('plan', plan('checkout-flow', 2)))
    await syncPlans({ projectDirectory: workspace, client })
    const updated = await client.planProjection.findUniqueOrThrow({
      where: { planId: 'checkout-flow' },
      include: { tasks: true },
    })
    expect(updated.tasks[0]).toMatchObject({ id: stableTaskId, title: 'Updated first task' })

    await writePlan('checkout-flow', 'version: "1"\n<<<<<<< HEAD\n')
    await writePlan('account-flow', serializeYamlArtifact('plan', plan('account-flow')))
    await expect(syncPlans({ projectDirectory: workspace, client })).resolves.toMatchObject({
      created: 1,
      errors: 1,
      stale: 1,
      conflicted: 1,
    })
    await expect(
      client.planProjection.findUniqueOrThrow({ where: { planId: 'checkout-flow' } }),
    ).resolves.toMatchObject({
      revision: 2,
      stale: true,
      conflicted: true,
    })
  })

  it('does not advertise retained legacy projections as actionable sync work or duplicate their issue', async () => {
    await writePlan('checkout-flow', serializeYamlArtifact('plan', plan('checkout-flow')))
    await syncPlans({ projectDirectory: workspace, client })
    await writeValidation(
      'checkout-flow',
      stringify({
        version: '1',
        planId: 'checkout-flow',
        revision: 1,
        baseRevision: {
          gitCommit: null,
          snapshotHash: `sha256:${'a'.repeat(64)}`,
          reducedAssurance: false,
        },
        classificationOverrides: [],
        validations: [
          {
            id: 'legacy-validation',
            taskIds: ['first-task'],
            required: true,
            testCaseIds: ['legacy-case'],
            appraiseArtifacts: {
              modules: [{ id: 'legacy-module', name: 'Legacy module' }],
              testSuites: [
                {
                  id: 'legacy-suite',
                  name: 'Legacy suite',
                  moduleId: 'legacy-module',
                  testCaseIds: ['legacy-case'],
                },
              ],
              testCases: [
                {
                  id: 'legacy-case',
                  title: 'Legacy case',
                  description: 'Uses a retired managed step.',
                  steps: [
                    {
                      id: 'legacy-step',
                      order: 0,
                      label: 'Legacy step',
                      gherkinStep: 'Given a legacy step',
                      parameters: [],
                    },
                  ],
                },
              ],
              locatorGroups: [],
              locators: [],
            },
            gherkinPaths: ['automation/features/legacy.feature'],
            stepPaths: [],
            executable: { path: 'automation/features/legacy.feature' },
            astProvenance: {
              schemaVersion: '2',
              astHash: `sha256:${'b'.repeat(64)}`,
              executionAuthority: 'reviewed_publication',
              publishOperationId: 'legacy-publication',
              receiptHash: `sha256:${'c'.repeat(64)}`,
              runtimeInputHash: `sha256:${'d'.repeat(64)}`,
            },
            matrix: [{ browser: 'chromium', environment: 'local' }],
            expectedFailures: [],
          },
        ],
        approvals: [],
        validationDecisions: [],
        files: [],
        manifestPaths: [],
        baselineAttempts: [],
        baselineAcknowledgements: [],
      }),
    )

    await expect(syncPlans({ projectDirectory: workspace, client })).resolves.toMatchObject({
      errors: 0,
      stale: 1,
      issues: [expect.objectContaining({ code: 'legacy-managed-validation' })],
    })
    await expect(countPendingPlanSync({ projectDirectory: workspace, client })).resolves.toBe(0)

    await syncPlans({ projectDirectory: workspace, client })
    await expect(
      client.planSyncIssue.count({
        where: {
          plan: { planId: 'checkout-flow' },
          code: 'legacy-managed-validation',
          resolvedAt: null,
        },
      }),
    ).resolves.toBe(1)
  })

  it('deletes missing projections without deleting linked test runs', async () => {
    await writePlan('checkout-flow', serializeYamlArtifact('plan', plan('checkout-flow')))
    await syncPlans({ projectDirectory: workspace, client })
    const environment = await client.environment.create({
      data: { name: `Plan sync ${Date.now()}`, baseUrl: 'https://example.test' },
    })
    const testRun = await client.testRun.create({
      data: {
        name: `Plan run ${Date.now()}`,
        environmentId: environment.id,
        planId: 'checkout-flow',
      },
    })

    await fs.rm(path.join(workspace, 'appraise', 'plans', 'checkout-flow.yaml'))
    await expect(syncPlans({ projectDirectory: workspace, client })).resolves.toMatchObject({ deleted: 1 })
    await expect(client.testRun.findUniqueOrThrow({ where: { id: testRun.id } })).resolves.toMatchObject({
      planId: null,
    })
  })

  it('reports invalid new plan artifacts that have no projection yet', async () => {
    await writePlan('invalid-new-flow', 'version: "1"\nversion: "1"\n')

    await expect(syncPlans({ projectDirectory: workspace, client })).resolves.toMatchObject({
      errors: 1,
      stale: 0,
      issues: [
        expect.objectContaining({
          planId: 'invalid-new-flow',
          artifactPath: 'appraise/plans/invalid-new-flow.yaml',
          code: 'invalid-artifact',
          projected: false,
          message: expect.stringContaining('YAML map keys must be unique'),
        }),
      ],
    })
  })
})
