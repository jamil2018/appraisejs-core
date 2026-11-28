import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listEnvironments, listLocatorGroups, listLocators, listTargetProjects } = vi.hoisted(() => ({
  listEnvironments: vi.fn(),
  listLocatorGroups: vi.fn(),
  listLocators: vi.fn(),
  listTargetProjects: vi.fn(),
}))

vi.mock('@/services/environment/environment-service', () => ({ listEnvironments }))
vi.mock('@/services/locator-group/locator-group-service', () => ({ listLocatorGroups }))
vi.mock('@/services/locator/locator-service', () => ({ listLocators }))
vi.mock('@/services/target-project/target-project-service', () => ({ listTargetProjects }))

import { answerProjectWorkspaceRequest } from './project-workspace-requests'

describe('project workspace requests', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    listTargetProjects.mockResolvedValue([
      { id: 'project-a', displayName: 'Store' },
      { id: 'project-b', displayName: 'Billing' },
    ])
    listEnvironments.mockResolvedValue([{ id: 'env-a', name: 'Staging' }])
    listLocatorGroups.mockResolvedValue([{ id: 'group-a', name: 'Checkout' }])
    listLocators.mockResolvedValue([{ id: 'locator-a', name: 'Place order' }])
  })

  it('reads only from the saved conversation project', async () => {
    const result = await answerProjectWorkspaceRequest({
      targetProjectId: 'project-a',
      content: 'find environments named staging',
    })

    expect(listEnvironments).toHaveBeenCalledExactlyOnceWith('project-a')
    expect(listTargetProjects).not.toHaveBeenCalled()
    expect(result?.records).toEqual([{ kind: 'ENVIRONMENT', id: 'env-a', title: 'Staging' }])
  })

  it('finds a named locator without including another project or invoking a picker', async () => {
    const result = await answerProjectWorkspaceRequest({
      targetProjectId: 'project-a',
      content: 'find Place order locator',
    })

    expect(listLocators).toHaveBeenCalledExactlyOnceWith('project-a')
    expect(result?.records).toEqual([{ kind: 'LOCATOR', id: 'locator-a', title: 'Place order' }])
  })

  it('offers exact project selection without switching the saved conversation', async () => {
    const result = await answerProjectWorkspaceRequest({
      targetProjectId: 'project-a',
      content: 'switch to Billing project',
    })

    expect(result?.content).toContain('original project')
    expect(result?.records).toEqual([{ kind: 'PROJECT', id: 'project-b', title: 'Billing' }])
  })

  it('routes creation and capture to scoped user controls without claiming a persisted write', async () => {
    const environment = await answerProjectWorkspaceRequest({
      targetProjectId: 'project-a',
      content: 'add staging environment',
    })
    const locator = await answerProjectWorkspaceRequest({
      targetProjectId: 'project-a',
      content: 'capture the Place order button',
    })
    const group = await answerProjectWorkspaceRequest({
      targetProjectId: 'project-a',
      content: 'create checkout locator group',
    })

    expect(environment?.records).toEqual([
      { kind: 'ENVIRONMENT', id: 'project-a', title: 'New environment', destination: 'create' },
    ])
    expect(locator?.records).toEqual([
      { kind: 'LOCATOR', id: 'project-a', title: 'Capture locator', destination: 'create' },
    ])
    expect(group?.records).toEqual([
      { kind: 'LOCATOR_GROUP', id: 'project-a', title: 'New locator group', destination: 'create' },
    ])
    expect(listEnvironments).not.toHaveBeenCalled()
    expect(listLocators).not.toHaveBeenCalled()
    expect(listLocatorGroups).not.toHaveBeenCalled()
  })

  it('shows a scoped missing-target answer and leaves unrelated chat to its owner', async () => {
    expect(
      await answerProjectWorkspaceRequest({ targetProjectId: 'project-a', content: 'find locators named absent' }),
    ).toEqual({ content: 'I could not find a matching locator. Check the project and name.', records: [] })
    expect(
      await answerProjectWorkspaceRequest({ targetProjectId: 'project-a', content: 'approve the journey' }),
    ).toBeUndefined()
  })

  it('keeps provider setup on existing protected surfaces', async () => {
    const result = await answerProjectWorkspaceRequest({ targetProjectId: 'project-a', content: 'connect Cursor' })

    expect(result?.records).toEqual([{ kind: 'SETTINGS', id: 'project-a', title: 'Provider settings' }])
    expect(result?.content).toContain('protected controls')
  })
})
