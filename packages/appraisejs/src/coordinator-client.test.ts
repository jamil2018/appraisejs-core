import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCoordinatorClient } from './coordinator-client.js'

const workspaces: string[] = []

async function workspace() {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-client-'))
  workspaces.push(cwd)
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"client-test"}')
  await fs.mkdir(path.join(cwd, '.appraisejs'))
  await fs.writeFile(
    path.join(cwd, '.appraisejs', 'coordinator.json'),
    JSON.stringify({ projectFingerprint: 'sha256:test', token: 'secret' }),
  )
  return cwd
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(workspaces.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

describe('online coordinator client', () => {
  it('preserves stale revision errors and Appraise links from the internal API', async () => {
    const cwd = await workspace()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'Plan changed since expected hash.' }), { status: 409 }),
        )
        .mockResolvedValueOnce(Response.json({ planId: 'cli-plan', links: { plan: 'appraise://plans/cli-plan' } })),
    )
    const client = await createCoordinatorClient({ cwd, baseUrl: 'http://localhost:3000', coordinatorId: 'agent' })

    await expect(client.revisePlan('cli-plan', { expectedHash: 'sha256:old', plan: {} })).rejects.toMatchObject({
      status: 409,
      message: 'Plan changed since expected hash.',
    })
    await expect(client.readPlan('cli-plan')).resolves.toMatchObject({
      links: { plan: 'appraise://plans/cli-plan' },
    })
  })

  it('preserves structured validation paths and recovery guidance', async () => {
    const cwd = await workspace()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Expected a non-empty string',
            code: 'invalid-request',
            path: 'plan.tasks.0.validationIntent',
            recovery: 'Correct the identified field and retry.',
          }),
          { status: 400 },
        ),
      ),
    )
    const client = await createCoordinatorClient({ cwd, baseUrl: 'http://localhost:3000', coordinatorId: 'agent' })

    await expect(client.createPlan({})).rejects.toMatchObject({
      status: 400,
      code: 'invalid-request',
      path: 'plan.tasks.0.validationIntent',
      recovery: 'Correct the identified field and retry.',
    })
  })

  it('reads pending events before reconnect and never silently approves takeover', async () => {
    const cwd = await workspace()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          events: [
            { sequence: 4, type: 'plan_cancelled', payload: null },
            { sequence: 5, type: 'remark_added', payload: { blocking: false } },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ connectionId: 'new-connection' }))
    vi.stubGlobal('fetch', fetchMock)
    const client = await createCoordinatorClient({ cwd, baseUrl: 'http://localhost:3000', coordinatorId: 'agent' })

    await expect(client.reconnect('cli-plan', 'old-connection')).resolves.toMatchObject({
      cancelled: true,
      pendingEvents: [{ sequence: 4 }, { sequence: 5 }],
    })
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/plans/cli-plan/events')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/register')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      planId: 'cli-plan',
      coordinatorId: 'agent',
      reconnectConnectionId: 'old-connection',
    })
  })

  it('requires an explicit takeover flag and reports active coordinator conflicts', async () => {
    const cwd = await workspace()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'active coordinator' }), { status: 409 })),
    )
    const client = await createCoordinatorClient({ cwd, baseUrl: 'http://localhost:3000', coordinatorId: 'agent' })

    await expect(client.register('cli-plan')).rejects.toMatchObject({
      status: 409,
      message: 'active coordinator',
    })
  })
})
