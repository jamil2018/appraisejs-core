import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { GET } from './route'

describe('project scope cleanup route', () => {
  it('clears the active project cookie and returns to a local path', () => {
    const response = GET(new NextRequest('http://localhost:3000/api/internal/project-scope/clear?returnTo=%2Freports'))

    expect(response.headers.get('location')).toBe('http://localhost:3000/reports')
    expect(response.cookies.get('appraise-active-project')?.value).toBe('')
  })

  it('rejects protocol-relative return targets', () => {
    const response = GET(
      new NextRequest('http://localhost:3000/api/internal/project-scope/clear?returnTo=%2F%2Fevil.example'),
    )

    expect(response.headers.get('location')).toBe('http://localhost:3000/')
  })
})
