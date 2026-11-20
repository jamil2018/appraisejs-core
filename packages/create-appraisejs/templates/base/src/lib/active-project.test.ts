import { beforeEach, expect, it, vi } from 'vitest'
import { ACTIVE_PROJECT_COOKIE, APPRAISE_REQUEST_TARGET_HEADER } from './project-scope'
import { requireActiveProjectForMutation } from './active-project'

const state = vi.hoisted(() => ({ cookie: '', target: '' }))
vi.mock('next/headers', () => ({
  cookies: async () => new Map([[ACTIVE_PROJECT_COOKIE, { value: state.cookie }]]),
  headers: async () => new Headers({ [APPRAISE_REQUEST_TARGET_HEADER]: state.target }),
}))
vi.mock('@/services/target-project/target-project-service', () => ({
  resolveActiveProject: async ({
    urlProjectId,
    cookieProjectId,
  }: {
    urlProjectId?: string
    cookieProjectId?: string
  }) => {
    const id = urlProjectId || cookieProjectId
    return ['blogen', 'other'].includes(id ?? '') ? { id } : null
  },
}))

beforeEach(() => {
  state.cookie = ''
  state.target = '/quality-journeys/journey?project=blogen'
})

it.each(['', 'other'])('binds a Journey action to its displayed project with cookie %j', async cookie => {
  state.cookie = cookie
  await expect(requireActiveProjectForMutation()).resolves.toMatchObject({ id: 'blogen' })
})

it('refuses mismatched caller scope and unregistered link projects', async () => {
  await expect(requireActiveProjectForMutation('other')).rejects.toThrow(/conflicts/)
  state.cookie = 'other'
  state.target = '/quality-journeys/journey?project=unknown'
  await expect(requireActiveProjectForMutation()).rejects.toThrow(/Select an active project/)
})

it('uses the active cookie on a Journey without an explicit project', async () => {
  state.target = '/quality-journeys/journey'
  await expect(requireActiveProjectForMutation()).rejects.toThrow(/Select an active project/)
  state.cookie = 'other'
  await expect(requireActiveProjectForMutation()).resolves.toMatchObject({ id: 'other' })
})
