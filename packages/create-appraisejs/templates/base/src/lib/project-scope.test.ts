import { describe, expect, it } from 'vitest'

import { isProjectScopedPath, shouldRequireProjectSelection, withProjectScope } from './project-scope'

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
