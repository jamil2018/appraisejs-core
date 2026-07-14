import { type NextRequest, NextResponse } from 'next/server'

import { ACTIVE_PROJECT_COOKIE, shouldRequireProjectSelection } from '@/lib/project-scope'

export function proxy(request: NextRequest) {
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
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|favicon.svg).*)'],
}
