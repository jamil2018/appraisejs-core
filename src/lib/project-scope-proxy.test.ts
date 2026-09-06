import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { ACTIVE_PROJECT_COOKIE } from '@/lib/project-scope'

import { proxy } from '../proxy'

describe('project scope proxy', () => {
  it('redirects an unscoped resource request to project selection', () => {
    const response = proxy(new NextRequest('http://localhost:3000/quality-journeys/journey-1?review=triage'))
    const redirect = new URL(response.headers.get('location')!)

    expect(response.status).toBe(307)
    expect(redirect.pathname).toBe('/projects')
    expect(redirect.searchParams.get('selectProject')).toBe('required')
    expect(redirect.searchParams.get('returnTo')).toBe('/quality-journeys/journey-1?review=triage')
  })

  it('allows project-scoped URLs and cookie-backed requests through', () => {
    const scopedResponse = proxy(new NextRequest('http://localhost:3000/test-suites?project=project-1'))
    const cookieResponse = proxy(
      new NextRequest('http://localhost:3000/quality-journeys', {
        headers: { cookie: `${ACTIVE_PROJECT_COOKIE}=project-1` },
      }),
    )

    expect(scopedResponse.headers.get('x-middleware-next')).toBe('1')
    expect(cookieResponse.headers.get('x-middleware-next')).toBe('1')
  })

  it('leaves unscoped management routes available', () => {
    const response = proxy(new NextRequest('http://localhost:3000/projects'))

    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('forwards the canonical pathname to the app shell', () => {
    const response = proxy(new NextRequest('http://localhost:3000/settings'))

    expect(response.headers.get('x-middleware-request-x-appraise-pathname')).toBe('/settings')
  })
})
