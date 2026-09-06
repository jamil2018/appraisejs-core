export const ACTIVE_PROJECT_COOKIE = 'appraise-active-project'
export const APPRAISE_PATHNAME_HEADER = 'x-appraise-pathname'
export const APPRAISE_REQUEST_TARGET_HEADER = 'x-appraise-request-target'

const PROJECT_SCOPED_ROUTE_SEGMENTS = new Set([
  'environments',
  'locator-groups',
  'locators',
  'modules',
  'quality-journeys',
  'reports',
  'tags',
  'step-definitions',
  'template-test-cases',
  'test-cases',
  'test-runs',
  'test-suites',
])

export function isProjectScopedPath(pathname: string) {
  if (pathname === '/') return true
  const [segment] = pathname.split('/').filter(Boolean)
  return Boolean(segment && PROJECT_SCOPED_ROUTE_SEGMENTS.has(segment))
}

export function shouldRequireProjectSelection(input: {
  pathname: string
  urlProjectId?: string | null
  cookieProjectId?: string | null
}) {
  return isProjectScopedPath(input.pathname) && !input.urlProjectId && !input.cookieProjectId
}

export function withProjectScope(returnTo: string, projectId: string) {
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
  const [pathname, query = ''] = safeReturnTo.split('?', 2)
  const searchParams = new URLSearchParams(query)
  searchParams.set('project', projectId)
  return `${pathname}?${searchParams.toString()}`
}

export function staleProjectScopeReturnTo(input: {
  requestTarget: string
  registeredProjectIds: ReadonlySet<string>
  cookieProjectId?: string | null
}) {
  const requestTarget = new URL(input.requestTarget, 'http://appraise.local')
  const urlProjectId = requestTarget.searchParams.get('project')
  const invalidUrlProject = Boolean(urlProjectId && !input.registeredProjectIds.has(urlProjectId))
  const invalidCookieProject = Boolean(input.cookieProjectId && !input.registeredProjectIds.has(input.cookieProjectId))
  if (!invalidUrlProject && !invalidCookieProject) return null

  if (invalidUrlProject) requestTarget.searchParams.delete('project')
  return `${requestTarget.pathname}${requestTarget.search}`
}
