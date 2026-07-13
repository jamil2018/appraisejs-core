'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ensureProjectIdentity } from '@/services/coordinator/coordinator-service'
import { ACTIVE_PROJECT_COOKIE, requireActiveProjectForMutation } from '@/lib/active-project'
import { ServiceError } from '@/services/shared/errors'
import {
  registerTargetProject,
  renameTargetProject,
  resolveTargetProject,
  writeTargetProjectMarker,
} from '@/services/target-project/target-project-service'
import type { ActionResponse } from '@/types/form/actionHandler'

const registrationSchema = z.object({
  projectPath: z.string().trim().min(1),
  displayName: z.string().trim().optional(),
})
const renameSchema = z.object({ targetProjectId: z.string().uuid(), displayName: z.string().trim().min(1) })
const selectionSchema = z.object({ targetProjectId: z.string().uuid() })

function errorResponse(error: unknown, prefix: string): ActionResponse {
  const message = error instanceof Error ? error.message : String(error)
  const status = error instanceof ServiceError ? error.statusCode : 500
  return { status, success: false, message: `${prefix}: ${message}` }
}

export async function registerTargetProjectAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = registrationSchema.parse(input)
    const identity = await ensureProjectIdentity()
    const targetProject = await registerTargetProject({
      projectPath: value.projectPath,
      displayName: value.displayName,
    })
    const marker =
      targetProject.canonicalPath === identity.canonicalProjectPath
        ? {
            status: 'skipped' as const,
            path: `${targetProject.canonicalPath}/.appraisejs/project.json`,
            warning: undefined,
          }
        : await writeTargetProjectMarker(targetProject, identity.projectFingerprint)

    revalidatePath('/projects')
    return { status: 200, success: true, data: { targetProject, marker } }
  } catch (error) {
    return errorResponse(error, 'Project registration failed')
  }
}

export async function renameTargetProjectAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = renameSchema.parse(input)
    await requireActiveProjectForMutation(value.targetProjectId)
    const identity = await ensureProjectIdentity()
    const targetProject = await renameTargetProject(value)
    const marker =
      targetProject.canonicalPath === identity.canonicalProjectPath
        ? { status: 'skipped' as const, path: `${targetProject.canonicalPath}/.appraisejs/project.json` }
        : await writeTargetProjectMarker(targetProject, identity.projectFingerprint)
    revalidatePath('/projects')
    return { status: 200, success: true, data: { targetProject, marker } }
  } catch (error) {
    return errorResponse(error, 'Project rename failed')
  }
}

export async function selectTargetProjectAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = selectionSchema.parse(input)
    const project = await resolveTargetProject(value.targetProjectId)
    const cookieStore = await cookies()
    cookieStore.set(ACTIVE_PROJECT_COOKIE, project.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    return { status: 200, success: true, data: { targetProjectId: project.id } }
  } catch (error) {
    return errorResponse(error, 'Project selection failed')
  }
}
