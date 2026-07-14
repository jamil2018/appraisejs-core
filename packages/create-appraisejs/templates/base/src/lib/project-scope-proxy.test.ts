import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { ACTIVE_PROJECT_COOKIE } from '@/lib/project-scope'

import { proxy } from '../proxy'

describe('project scope proxy', () => {
  it('rewrites an unscoped resource request to project selection', () => {
    const response = proxy(new NextRequest('http://localhost:3000/plans/plan-1?review=validation'))
    const rewrite = new URL(response.headers.get('x-middleware-rewrite')!)

    expect(rewrite.pathname).toBe('/projects')
    expect(rewrite.searchParams.get('selectProject')).toBe('required')
    expect(rewrite.searchParams.get('returnTo')).toBe('/plans/plan-1?review=validation')
  })

  it('allows project-scoped URLs and cookie-backed requests through', () => {
    const scopedResponse = proxy(new NextRequest('http://localhost:3000/test-suites?project=project-1'))
    const cookieResponse = proxy(
      new NextRequest('http://localhost:3000/plans', {
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
})
