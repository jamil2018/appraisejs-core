import { cookies } from 'next/headers'
import { resolveActiveProject, type ActiveProjectContext } from '@/services/target-project/target-project-service'
import { ServiceError } from '@/services/shared/errors'
import { ACTIVE_PROJECT_COOKIE } from '@/lib/project-scope'

export { ACTIVE_PROJECT_COOKIE } from '@/lib/project-scope'

export async function readActiveProjectCookie(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value
}

export async function requireActiveProject(urlProjectId?: string | null): Promise<ActiveProjectContext> {
  const cookieProjectId = await readActiveProjectCookie()
  const project = await resolveActiveProject({ urlProjectId, cookieProjectId })
  if (!project) throw new ServiceError('Select an active project before accessing project data.', 'VALIDATION', 400)
  return project
}

export async function requireActiveProjectForMutation(
  callerTargetProjectId?: string | null,
): Promise<ActiveProjectContext> {
  const project = await requireActiveProject(callerTargetProjectId)
  if (callerTargetProjectId && callerTargetProjectId !== project.id) {
    throw new ServiceError('Caller project scope conflicts with the active project.', 'CONFLICT', 409)
  }
  return project
}
