'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  cancelProviderWorkflowRun,
  createProviderWorkflowRun,
  recordProviderPermissionDecision,
} from '@/services/coordinator/coordinator-provider-run-service'
import { ensureProjectIdentity } from '@/services/coordinator/coordinator-service'
import { providerActionErrorResponse } from '@/actions/shared/provider-action-error'
import { registerTargetProject, writeTargetProjectMarker } from '@/services/target-project/target-project-service'
import type { ActionResponse } from '@/types/form/actionHandler'

const createProviderRunSchema = z.object({
  targetProjectId: z.string().uuid(),
  planId: z.string().trim().min(1).optional(),
  providerKey: z.string().trim().min(1).default('mock-planning'),
  providerProfile: z.string().trim().optional(),
  launchPrompt: z.string().trim().min(1),
})

const cancelProviderRunSchema = z.object({ runId: z.string().uuid() })

const registerTargetProjectSchema = z.object({
  projectPath: z.string().trim().min(1),
  displayName: z.string().trim().optional(),
})

const permissionDecisionSchema = z.object({
  runId: z.string().uuid(),
  requestId: z.string().trim().min(1),
  decision: z.enum(['approved', 'denied']),
  riskTier: z.string().trim().min(1),
  requestedScope: z.string().trim().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().optional(),
})

function revalidateProviderRunPaths(runId?: string) {
  revalidatePath('/provider-runs')
  if (runId) revalidatePath(`/provider-runs/${runId}`)
}

async function runProviderAction<T>(
  operation: () => Promise<T>,
  errorPrefix: string,
  success: (value: T) => ActionResponse = () => ({ status: 200, success: true }),
): Promise<ActionResponse> {
  try {
    return success(await operation())
  } catch (error) {
    return providerActionErrorResponse(error, errorPrefix)
  }
}

export async function createProviderRunAction(input: unknown): Promise<ActionResponse> {
  return runProviderAction(
    async () => {
      const value = createProviderRunSchema.parse(input)
      const run = await createProviderWorkflowRun({
        ...value,
        planId: value.planId || undefined,
        approvedScope: { mode: 'planning_only' },
      })
      revalidateProviderRunPaths(run.id)
      return run
    },
    'Provider run launch failed',
    run => ({ status: 200, success: true, data: { runId: run.id } }),
  )
}

export async function registerProviderTargetProjectAction(input: unknown): Promise<ActionResponse> {
  return runProviderAction(
    async () => {
      const value = registerTargetProjectSchema.parse(input)
      const [identity, targetProject] = await Promise.all([
        ensureProjectIdentity(),
        registerTargetProject({ projectPath: value.projectPath, displayName: value.displayName }),
      ])
      const marker = await writeTargetProjectMarker(targetProject, identity.projectFingerprint)
      revalidateProviderRunPaths()
      return { targetProject, marker }
    },
    'Target project registration failed',
    result => ({
      status: 200,
      success: true,
      data: {
        targetProjectId: result.targetProject.id,
        displayName: result.targetProject.displayName,
        marker: result.marker,
      },
    }),
  )
}

export async function cancelProviderRunAction(input: unknown): Promise<ActionResponse> {
  return runProviderAction(
    async () => {
      const value = cancelProviderRunSchema.parse(input)
      const run = await cancelProviderWorkflowRun(value.runId)
      revalidateProviderRunPaths(run.id)
      return run
    },
    'Provider run cancellation failed',
    run => ({ status: 200, success: true, data: { runId: run.id } }),
  )
}

export async function decideProviderPermissionAction(input: unknown): Promise<ActionResponse> {
  return runProviderAction(async () => {
    const value = permissionDecisionSchema.parse(input)
    await recordProviderPermissionDecision({ ...value, decidedBy: 'local-user' })
    revalidateProviderRunPaths(value.runId)
  }, 'Provider permission decision failed')
}
