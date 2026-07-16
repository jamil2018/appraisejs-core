import { type NextRequest, NextResponse } from 'next/server'

import { ACTIVE_PROJECT_COOKIE, shouldRequireProjectSelection } from '@/lib/project-scope'
import { evaluateLocalRequestBoundary } from '@/lib/local-request-boundary'

export function proxy(request: NextRequest) {
  const boundary = evaluateLocalRequestBoundary({
    method: request.method,
    host: request.headers.get('host'),
    origin: request.headers.get('origin'),
    forwardedFor: request.headers.get('x-forwarded-for'),
  })
  if (!boundary.allowed) {
    return NextResponse.json({ error: boundary.message, code: boundary.code }, { status: 403 })
  }

  if (
    !shouldRequireProjectSelection({
      pathname: request.nextUrl.pathname,
      urlProjectId: request.nextUrl.searchParams.get('project'),
      cookieProjectId: request.cookies.get(ACTIVE_PROJECT_COOKIE)?.value,
    })
  ) {
    return NextResponse.next()
  }

  const selectionUrl = request.nextUrl.clone()
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`
  selectionUrl.pathname = '/projects'
  selectionUrl.search = ''
  selectionUrl.searchParams.set('selectProject', 'required')
  selectionUrl.searchParams.set('returnTo', returnTo)

  return NextResponse.rewrite(selectionUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)'],
}
