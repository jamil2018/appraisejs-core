export const ACTIVE_PROJECT_COOKIE = 'appraise-active-project'

const PROJECT_SCOPED_ROUTE_SEGMENTS = new Set([
  'environments',
  'locator-groups',
  'locators',
  'modules',
  'plans',
  'provider-runs',
  'reports',
  'step-blocks',
  'tags',
  'template-steps',
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
