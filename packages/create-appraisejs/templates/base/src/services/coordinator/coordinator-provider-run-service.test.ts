import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ensureProviderRunTestSchema } from '@/test/plan-runtime-schema-test-helper'

import {
  cancelProviderWorkflowRun,
  createProviderWorkflowRun,
  listProviderAdapters,
  listProviderRegistrations,
  probeProviderRegistration,
  recordProviderPermissionDecision,
  updateProviderRegistration,
} from './coordinator-provider-run-service'

let workspace: string
let databasePath: string
let client: PrismaClient

function createTestClient(dbPath: string) {
  return new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } })
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-provider-run-'))
  databasePath = path.join(workspace, 'provider-run.db')
  await fs.writeFile(path.join(workspace, 'package.json'), '{}')
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
  await ensureProviderRunTestSchema(databasePath)
  client = createTestClient(databasePath)
})

afterEach(async () => {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

async function createTargetProject() {
  return client.targetProject.create({
    data: {
      canonicalPath: workspace,
      displayName: 'Provider target',
      fingerprint: `sha256:${workspace}`,
    },
  })
}

async function createPlanProjection(targetProjectId: string | null = null) {
  return client.planProjection.create({
    data: {
      planId: `pln_${'1'.repeat(26)}`,
      slug: 'provider-run-plan',
      revision: 1,
      lifecycle: 'awaiting_plan_review',
      goal: 'Provider run plan',
      description: 'Plan bound to a target project.',
      sourceHash: `sha256:${'a'.repeat(64)}`,
      planPath: 'appraise/plans/provider-run-plan.yaml',
      lastValidProjectedAt: new Date(),
      targetProjectId,
    },
  })
}

describe('provider workflow runs', () => {
  it('registers adapters and requires durable plan changes for provider success', async () => {
    const targetProject = await createTargetProject()

    await expect(listProviderRegistrations(client)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'codex', providerKind: 'codex' }),
        expect.objectContaining({ key: 'claude', providerKind: 'claude', launchable: false }),
        expect.objectContaining({ key: 'cursor', providerKind: 'cursor', launchable: false }),
        expect.objectContaining({ key: 'mock-planning', providerKind: 'mock', launchable: true }),
      ]),
    )
    await expect(listProviderAdapters(client)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'mock-planning', providerKind: 'mock' })]),
    )

    const run = await createProviderWorkflowRun(
      {
        targetProjectId: targetProject.id,
        launchPrompt: 'Draft a plan for checkout improvements.',
      },
      client,
    )

    expect(run).toMatchObject({
      status: 'recovery_required',
      targetProjectId: targetProject.id,
      providerKind: 'mock',
      lifecyclePhase: 'planning',
    })
    expect(run.events.map(event => event.type)).toEqual([
      'provider_run_started',
      'provider_run_started',
      'provider_event_streamed',
      'provider_permission_requested',
      'provider_run_completed',
      'provider_run_failed',
    ])
    expect(run.capabilitySnapshot).toMatchObject({
      launch: true,
      resumeSession: false,
      permissionCallbacks: true,
    })
  })

  it('probes and updates provider registration without persisting secrets', async () => {
    await updateProviderRegistration(
      {
        providerKey: 'codex',
        executablePath: '/usr/local/bin/codex',
        defaultProfile: 'planning',
        defaultModel: 'gpt-5',
        enabled: true,
        settings: { theme: 'quiet', apiKey: 'should-not-persist' },
      },
      client,
    )

    const registrations = await listProviderRegistrations(client)
    expect(registrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'codex',
          executablePath: '/usr/local/bin/codex',
          defaultProfile: 'planning',
          defaultModel: 'gpt-5',
          enabled: true,
          settings: expect.not.objectContaining({ apiKey: 'should-not-persist' }),
        }),
      ]),
    )

    const probe = await probeProviderRegistration('mock-planning', client)
    expect(probe).toMatchObject({
      key: 'mock-planning',
      probeStatus: 'installed',
      launchEnabled: true,
      detectedVersion: 'built-in',
    })
  })

  it('persists permission decisions independently from provider exit status', async () => {
    const targetProject = await createTargetProject()
    const run = await createProviderWorkflowRun(
      {
        targetProjectId: targetProject.id,
        launchPrompt: 'Prepare review notes.',
      },
      client,
    )

    await recordProviderPermissionDecision(
      {
        runId: run.id,
        requestId: `mock-read-${run.id}`,
        decision: 'approved',
        riskTier: 'low',
        requestedScope: 'workspace:read',
        payload: { cwd: workspace },
        decidedBy: 'local-user',
      },
      client,
    )

    const updated = await cancelProviderWorkflowRun(run.id, client)
    expect(updated.status).toBe('cancelled')
    expect(updated.permissionDecisions).toEqual([
      expect.objectContaining({
        requestId: `mock-read-${run.id}`,
        decision: 'approved',
        payload: { cwd: workspace },
      }),
    ])
  })

  it('rejects provider runs that bind a plan to a different target project', async () => {
    const targetProject = await createTargetProject()
    const otherTarget = await client.targetProject.create({
      data: {
        canonicalPath: `${workspace}-other`,
        displayName: 'Other target',
        fingerprint: `sha256:${workspace}-other`,
      },
    })
    const plan = await createPlanProjection(otherTarget.id)

    await expect(
      createProviderWorkflowRun(
        {
          targetProjectId: targetProject.id,
          planId: plan.planId,
          launchPrompt: 'This should not launch against the wrong target.',
        },
        client,
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Provider run target project does not match the linked plan target project.',
    })
  })

  it('requires permission decisions to match a provider permission request event', async () => {
    const targetProject = await createTargetProject()
    const run = await createProviderWorkflowRun(
      {
        targetProjectId: targetProject.id,
        launchPrompt: 'Prepare review notes.',
      },
      client,
    )

    await expect(
      recordProviderPermissionDecision(
        {
          runId: run.id,
          requestId: 'fabricated-request',
          decision: 'approved',
          riskTier: 'low',
          requestedScope: 'workspace:read',
          payload: {},
          decidedBy: 'local-user',
        },
        client,
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Provider permission decision requires a matching provider permission request.',
    })

    await expect(
      recordProviderPermissionDecision(
        {
          runId: run.id,
          requestId: `mock-read-${run.id}`,
          decision: 'approved',
          riskTier: 'high',
          requestedScope: 'workspace:write',
          payload: {},
          decidedBy: 'local-user',
        },
        client,
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Provider permission decision does not match the original request payload.',
    })
  })
})
