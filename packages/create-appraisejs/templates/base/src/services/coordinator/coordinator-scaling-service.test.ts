import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ensureCoordinatorPlanRuntimeTestSchema } from '@/test/plan-runtime-schema-test-helper'

import {
  createContinuationPackage,
  createLifecycleSnapshot,
  createObjective,
  evaluateCoordinationSlo,
  selectImpactedPlans,
} from './coordinator-scaling-service'

let workspace: string
let client: PrismaClient

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-coordination-scaling-'))
  await fs.writeFile(path.join(workspace, 'package.json'), '{"name":"coordination-scaling-test"}')
  const databasePath = path.join(workspace, 'coordinator.db')
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
  await ensureCoordinatorPlanRuntimeTestSchema(databasePath)
  client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  for (const [position, planId] of ['plan-one', 'plan-two'].entries()) {
    await client.planProjection.create({
      data: {
        planId,
        revision: 1,
        lifecycle: position ? 'completed' : 'implementation_in_progress',
        goal: `Coordinate ${planId}`,
        description: `Bounded plan ${planId}`,
        sourceHash: `sha256:${String(position).repeat(64)}`,
        planPath: `appraise/plans/${planId}.yaml`,
        lastValidProjectedAt: new Date(),
        tasks: {
          create: {
            taskId: `task-${position}`,
            title: 'Bounded task',
            description: 'Stay independently executable.',
            acceptanceJson: '[]',
            validationIntent: 'Run focused tests.',
            position,
          },
        },
      },
    })
  }
})

afterEach(async () => {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('bounded coordination scaling', () => {
  it('persists an objective with independently completable plans', async () => {
    const result = await createObjective(
      {
        objectiveId: 'release-objective',
        title: 'Ship the bounded release',
        milestones: [{ id: 'runtime', title: 'Runtime ready' }],
        plans: [
          { planId: 'plan-one', milestoneId: 'runtime', impactedPaths: ['src/runtime'] },
          { planId: 'plan-two', milestoneId: 'runtime', dependsOn: ['plan-one'] },
        ],
      },
      { client, projectDirectory: workspace },
    )

    expect(result.plans.map(plan => plan.independentlyComplete)).toEqual([false, true])
    await expect(fs.readFile(path.join(workspace, result.reference), 'utf8')).resolves.toContain('release-objective')
  })

  it('creates content-addressed snapshots and bounded handoffs', async () => {
    const snapshot = await createLifecycleSnapshot('plan-one', { client, projectDirectory: workspace })
    const handoff = await createContinuationPackage(
      {
        planId: 'plan-one',
        narrative: 'Continue with the next independently reviewable task.',
        references: [snapshot.reference],
      },
      { client, projectDirectory: workspace },
    )

    expect(snapshot.contentHash).toMatch(/^sha256:/)
    expect(handoff.provenance).toMatchObject({ authoredBy: 'agent', authoritativeStateBy: 'appraise' })
    expect(Buffer.byteLength(JSON.stringify(handoff))).toBeLessThan(32_768)
  })

  it('excludes human review from active time and fails response-budget regressions', () => {
    expect(
      evaluateCoordinationSlo({
        phases: [{ phase: 'planning', activeAppraiseMs: 100, activeAgentMs: 200, humanReviewMs: 10_000 }],
        responseBytes: [9_000],
        operations: 2,
        retries: 0,
        approvals: 1,
      }),
    ).toMatchObject({ passed: false, activeMs: 300, humanReviewMs: 10_000, blockers: ['lifecycle-summary-over-8kb'] })
  })

  it('selects path impacts and their dependent regression plans', () => {
    expect(
      selectImpactedPlans(
        [
          { planId: 'runtime', impactedPaths: ['src/runtime'] },
          { planId: 'ui', impactedPaths: ['src/app'] },
          { planId: 'release', dependsOn: ['runtime', 'ui'] },
        ],
        ['src/runtime/preflight.ts'],
      ),
    ).toEqual(['runtime', 'release'])
  })
})
