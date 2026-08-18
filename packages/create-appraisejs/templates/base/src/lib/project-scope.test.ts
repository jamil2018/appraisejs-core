import { describe, expect, it } from 'vitest'

import {
  isProjectScopedPath,
  shouldRequireProjectSelection,
  staleProjectScopeReturnTo,
  withProjectScope,
} from './project-scope'

describe('project scope route gate', () => {
  it('recognizes scoped collection and detail routes', () => {
    expect(isProjectScopedPath('/')).toBe(true)
    expect(isProjectScopedPath('/quality-plans/quality-plan-1')).toBe(true)
    expect(isProjectScopedPath('/test-suites/create')).toBe(true)
    expect(isProjectScopedPath('/projects')).toBe(false)
    expect(isProjectScopedPath('/settings')).toBe(false)
  })

  it('requires selection only when both URL and cookie scope are absent', () => {
    expect(shouldRequireProjectSelection({ pathname: '/quality-plans' })).toBe(true)
    expect(shouldRequireProjectSelection({ pathname: '/quality-plans', urlProjectId: 'project-1' })).toBe(false)
    expect(shouldRequireProjectSelection({ pathname: '/quality-plans', cookieProjectId: 'project-1' })).toBe(false)
  })

  it('adds the selected project while preserving the requested destination', () => {
    expect(withProjectScope('/quality-plans/quality-plan-1?review=validation', 'project 1')).toBe(
      '/quality-plans/quality-plan-1?review=validation&project=project+1',
    )
    expect(withProjectScope('https://example.com', 'project-1')).toBe('/?project=project-1')
  })
})

describe('stale project scope cleanup', () => {
  const registeredProjectIds = new Set(['project-1'])

  it('removes a deleted project while preserving unrelated query parameters', () => {
    expect(
      staleProjectScopeReturnTo({
        requestTarget: '/reports?project=deleted&view=failed',
        registeredProjectIds,
      }),
    ).toBe('/reports?view=failed')
  })

  it('clears an invalid cookie without changing a valid project URL', () => {
    expect(
      staleProjectScopeReturnTo({
        requestTarget: '/reports?project=project-1',
        registeredProjectIds,
        cookieProjectId: 'deleted',
      }),
    ).toBe('/reports?project=project-1')
  })

  it('leaves valid URL and cookie scope unchanged', () => {
    expect(
      staleProjectScopeReturnTo({
        requestTarget: '/reports?project=project-1',
        registeredProjectIds,
        cookieProjectId: 'project-1',
      }),
    ).toBeNull()
  })
})
