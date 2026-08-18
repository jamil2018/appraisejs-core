import { type NextRequest, NextResponse } from 'next/server'

import { ACTIVE_PROJECT_COOKIE } from '@/lib/project-scope'

function safeReturnTo(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL(safeReturnTo(request.nextUrl.searchParams.get('returnTo')), request.url),
  )
  response.cookies.delete(ACTIVE_PROJECT_COOKIE)
  return response
}
