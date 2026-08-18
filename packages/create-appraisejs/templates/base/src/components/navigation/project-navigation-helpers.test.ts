import { describe, expect, it } from 'vitest'

import { projectScopedHref, resolveNavigationProjectId } from './project-navigation-helpers'

const projects = [{ id: 'project-1', displayName: 'Project One', canonicalPath: '/project-one' }]

describe('project navigation scope', () => {
  it('does not propagate a stale URL or cookie project', () => {
    expect(resolveNavigationProjectId([], 'deleted-project', 'deleted-project')).toBeUndefined()
    expect(projectScopedHref('/reports', resolveNavigationProjectId([], 'deleted-project'))).toBe('/reports')
  })

  it('prefers a valid URL project and falls back to a valid cookie project', () => {
    expect(resolveNavigationProjectId(projects, 'project-1', 'deleted-project')).toBe('project-1')
    expect(resolveNavigationProjectId(projects, null, 'project-1')).toBe('project-1')
  })

  it('does not fall back to a cookie when an invalid URL project is explicit', () => {
    expect(resolveNavigationProjectId(projects, 'deleted-project', 'project-1')).toBeUndefined()
  })
})
