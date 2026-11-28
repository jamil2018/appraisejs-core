import { beforeEach, describe, expect, it, vi } from 'vitest'

import { answerAuthoringWorkspaceRequest, parseAuthoringWorkspaceRequest } from './authoring-workspace-requests'
import { listModules } from '@/services/module/module-service'
import { listFilterTags } from '@/services/tag/tag-service'
import { answerWorkspaceRequest } from '@/services/workspace-search/workspace-record-search'

vi.mock('@/services/module/module-service', () => ({ listModules: vi.fn() }))
vi.mock('@/services/tag/tag-service', () => ({ listFilterTags: vi.fn() }))
vi.mock('@/services/workspace-search/workspace-record-search', () => ({ answerWorkspaceRequest: vi.fn() }))

describe('authoring workspace requests', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('matches only explicit module and tag lookups', () => {
    expect(parseAuthoringWorkspaceRequest('Find modules for checkout')).toEqual({ kind: 'MODULE', query: 'checkout' })
    expect(parseAuthoringWorkspaceRequest('Show me tags named "release"')).toEqual({ kind: 'TAG', query: 'release' })
    expect(parseAuthoringWorkspaceRequest('Delete module checkout')).toBeUndefined()
    expect(parseAuthoringWorkspaceRequest('Find cases for checkout')).toBeUndefined()
    expect(parseAuthoringWorkspaceRequest(`Find tags for ${'x'.repeat(161)}`)).toBeUndefined()
  })

  it('reads modules only inside the supplied project and returns bounded exact records', async () => {
    vi.mocked(listModules).mockResolvedValue([
      { id: 'module-z', name: 'Checkout web' },
      { id: 'module-a', name: 'Checkout API' },
      { id: 'module-n', name: 'Other' },
    ] as Awaited<ReturnType<typeof listModules>>)
    const response = await answerAuthoringWorkspaceRequest({
      targetProjectId: 'project-a',
      content: 'Find modules for checkout',
    })
    expect(listModules).toHaveBeenCalledExactlyOnceWith('project-a')
    expect(listFilterTags).not.toHaveBeenCalled()
    expect(response).toEqual({
      content: 'Found 2 matching modules in this project.',
      records: [
        { kind: 'MODULE', id: 'module-a', title: 'Checkout API' },
        { kind: 'MODULE', id: 'module-z', title: 'Checkout web' },
      ],
    })
  })

  it('reads filter tags only inside the supplied project', async () => {
    vi.mocked(listFilterTags).mockResolvedValue([{ id: 'tag-a', name: 'Release' }] as Awaited<
      ReturnType<typeof listFilterTags>
    >)
    expect(
      await answerAuthoringWorkspaceRequest({ targetProjectId: 'project-b', content: 'Show tags named release' }),
    ).toEqual({
      content: 'Found 1 matching tag in this project.',
      records: [{ kind: 'TAG', id: 'tag-a', title: 'Release' }],
    })
    expect(listFilterTags).toHaveBeenCalledExactlyOnceWith('project-b')
  })

  it('links creating a test case to the manual editor in that project', async () => {
    const reply = await answerAuthoringWorkspaceRequest({
      targetProjectId: 'project-a',
      content: 'Create a test case for checkout',
    })
    expect(reply?.records).toEqual([
      { kind: 'TEST_CASE', id: 'project-a', title: 'New test case', destination: 'create' },
    ])
    expect(listModules).not.toHaveBeenCalled()
    expect(answerWorkspaceRequest).not.toHaveBeenCalled()
  })

  it('resolves an edit request through the same scoped case lookup', async () => {
    const result = {
      content: 'Found a test case.',
      records: [{ kind: 'TEST_CASE' as const, id: 'case-a', title: 'Checkout' }],
    }
    vi.mocked(answerWorkspaceRequest).mockResolvedValue(result)
    expect(
      await answerAuthoringWorkspaceRequest({
        targetProjectId: 'project-a',
        content: 'Edit the test case named checkout',
      }),
    ).toEqual(result)
    expect(answerWorkspaceRequest).toHaveBeenCalledWith('project-a', { kind: 'TEST_CASE', query: 'checkout' })
  })
})
