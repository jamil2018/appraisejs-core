'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ACTIVE_PROJECT_COOKIE, requireActiveProjectForMutation } from '@/lib/active-project'
import { deriveCoordinatorProjectIdentity } from '@/lib/coordinator-api/project-identity'
import { ServiceError } from '@/services/shared/errors'
import {
  initializeTargetGitRepository,
  registerTargetProject,
  deleteTargetProject,
  renameTargetProject,
  resolveTargetProject,
  writeTargetProjectMarker,
} from '@/services/target-project/target-project-service'
import type { ActionResponse } from '@/types/form/actionHandler'

const registrationSchema = z.union([
  z
    .object({
      path: z.string().trim().min(1),
      displayName: z.string().trim().min(1).optional(),
      description: z.string().trim().max(1000).optional(),
      initializeGit: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      url: z.string().trim().url(),
      displayName: z.string().trim().min(1).optional(),
      description: z.string().trim().max(1000).optional(),
    })
    .strict(),
])
const renameSchema = z.object({
  targetProjectId: z.string().uuid(),
  displayName: z.string().trim().min(1),
  description: z.string().trim().max(1000).optional(),
})
const selectionSchema = z.object({ targetProjectId: z.string().uuid() })
const deletionSchema = z.object({ targetProjectId: z.string().uuid() })

function errorResponse(error: unknown, prefix: string): ActionResponse {
  const message = error instanceof Error ? error.message : String(error)
  const status = error instanceof ServiceError ? error.statusCode : 500
  return { status, success: false, message: `${prefix}: ${message}` }
}

export async function registerTargetProjectAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = registrationSchema.parse(input)
    const git =
      'path' in value ? await initializeTargetGitRepository(value.path, value.initializeGit ?? false) : undefined
    const targetProject = await registerTargetProject(value)
    const marker =
      targetProject.kind === 'LOCAL_WORKSPACE'
        ? await deriveCoordinatorProjectIdentity(process.cwd()).then(identity =>
            targetProject.canonicalPath === identity.canonicalProjectPath
              ? { status: 'skipped' as const }
              : writeTargetProjectMarker(targetProject, identity.projectFingerprint),
          )
        : { status: 'skipped' as const }

    const cookieStore = await cookies()
    cookieStore.set(ACTIVE_PROJECT_COOKIE, targetProject.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    revalidatePath('/', 'layout')
    return { status: 200, success: true, data: { targetProject, marker, git } }
  } catch (error) {
    return errorResponse(error, 'Project registration failed')
  }
}

export async function renameTargetProjectAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = renameSchema.parse(input)
    await requireActiveProjectForMutation(value.targetProjectId)
    const targetProject = await renameTargetProject(value)
    const marker =
      targetProject.kind === 'LOCAL_WORKSPACE'
        ? await deriveCoordinatorProjectIdentity(process.cwd()).then(identity =>
            targetProject.canonicalPath === identity.canonicalProjectPath
              ? { status: 'skipped' as const }
              : writeTargetProjectMarker(targetProject, identity.projectFingerprint),
          )
        : { status: 'skipped' as const }
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

export async function deleteTargetProjectAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = deletionSchema.parse(input)
    const targetProject = await deleteTargetProject(value.targetProjectId)
    const cookieStore = await cookies()
    if (cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value === targetProject.id) {
      cookieStore.delete(ACTIVE_PROJECT_COOKIE)
    }
    revalidatePath('/', 'layout')
    revalidatePath('/projects')
    return { status: 200, success: true, data: { targetProjectId: targetProject.id } }
  } catch (error) {
    return errorResponse(error, 'Project removal failed')
  }
}
