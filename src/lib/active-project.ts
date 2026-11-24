import { cookies, headers } from 'next/headers'
import { resolveActiveProject, type ActiveProjectContext } from '@/services/target-project/target-project-service'
import { ServiceError } from '@/services/shared/errors'
import { ACTIVE_PROJECT_COOKIE, APPRAISE_REQUEST_TARGET_HEADER } from '@/lib/project-scope'

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
  // The proxy sets this from the actual action request, including the project in a workspace link.
  const requestTarget = (await headers()).get(APPRAISE_REQUEST_TARGET_HEADER)
  const scopedUrl =
    requestTarget &&
    /^\/(?:quality-journeys|conversations|reports|test-cases|test-runs|test-suites|template-test-cases)(?:[/?]|$)/.test(
      requestTarget,
    )
      ? new URL(requestTarget, 'http://appraise.local')
      : null
  const project = await requireActiveProject(scopedUrl?.searchParams.get('project') || callerTargetProjectId)
  if (callerTargetProjectId && callerTargetProjectId !== project.id) {
    throw new ServiceError('Caller project scope conflicts with the active project.', 'CONFLICT', 409)
  }
  return project
}
