import { cookies } from 'next/headers'
import { resolveActiveProject, type ActiveProjectContext } from '@/services/target-project/target-project-service'
import { ServiceError } from '@/services/shared/errors'

export const ACTIVE_PROJECT_COOKIE = 'appraise-active-project'

export async function readActiveProjectCookie(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value
}

export async function requireActiveProjectForMutation(
  callerTargetProjectId?: string | null,
): Promise<ActiveProjectContext> {
  const cookieProjectId = await readActiveProjectCookie()
  const project = await resolveActiveProject({ cookieProjectId })
  if (!project) throw new ServiceError('Select an active project before changing project data.', 'VALIDATION', 400)
  if (callerTargetProjectId && callerTargetProjectId !== project.id) {
    throw new ServiceError('Caller project scope conflicts with the active project.', 'CONFLICT', 409)
  }
  return project
}
