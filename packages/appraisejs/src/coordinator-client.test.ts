import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCoordinatorClient } from './coordinator-client.js'
import { deriveProjectIdentity } from './project-identity.js'

const workspaces: string[] = []
const errorEnvelope = (overrides: Record<string, unknown> = {}) => ({
  schema: 'appraise.error/v1',
  errorId: '11111111-1111-4111-8111-111111111111',
  occurredAt: '2026-08-07T00:00:00.000Z',
  classification: 'state_conflict',
  code: 'state_conflict',
  message: 'Coordinator request failed.',
  httpStatus: 409,
  operation: { name: 'plans/cli-plan' },
  operationOutcome: 'not_committed',
  targetOutcome: 'not_evaluated',
  retry: {
    safe: true,
    strategy: 'read_state_then_retry',
    nextAction: { tool: 'coordinator_error_recovery', reason: 'Read current state and retry.' },
  },
  ...overrides,
})

async function workspace() {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-client-'))
  workspaces.push(cwd)
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"client-test"}')
  const project = await deriveProjectIdentity(cwd)
  await fs.mkdir(path.join(cwd, '.appraisejs'))
  await fs.writeFile(
    path.join(cwd, '.appraisejs', 'coordinator.json'),
    JSON.stringify({ projectFingerprint: project.projectFingerprint, token: 'secret' }),
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
          new Response(JSON.stringify(errorEnvelope({ message: 'Plan changed since expected hash.' })), {
            status: 409,
          }),
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
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-appraise-base-url': 'http://localhost:3000',
    })
  })

  it('parses only the versioned public coordinator error envelope', async () => {
    const cwd = await workspace()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...errorEnvelope({
              classification: 'request_invalid',
              message: 'Expected a non-empty string',
              operation: { name: 'plans' },
              operationOutcome: 'not_started',
              retry: {
                safe: false,
                strategy: 'repair_input_then_retry',
                nextAction: { tool: 'coordinator_error_recovery', reason: 'Correct the identified request field.' },
              },
              details: { field: 'plan.tasks.0.validationIntent' },
            }),
          }),
          { status: 400 },
        ),
      ),
    )
    const client = await createCoordinatorClient({ cwd, baseUrl: 'http://localhost:3000', coordinatorId: 'agent' })

    await expect(client.createPlan({})).rejects.toMatchObject({
      status: 400,
      envelope: {
        schema: 'appraise.error/v1',
        classification: 'request_invalid',
        details: { field: 'plan.tasks.0.validationIntent' },
      },
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
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(errorEnvelope({ message: 'active coordinator' })), { status: 409 }),
        ),
    )
    const client = await createCoordinatorClient({ cwd, baseUrl: 'http://localhost:3000', coordinatorId: 'agent' })

    await expect(client.register('cli-plan')).rejects.toMatchObject({
      status: 409,
      message: 'active coordinator',
    })
  })

  it('preserves transport causes and configured endpoints', async () => {
    const cwd = await workspace()
    const cause = new Error('connect ECONNREFUSED 127.0.0.1:9')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause))
    const client = await createCoordinatorClient({ cwd, baseUrl: 'http://127.0.0.1:9', coordinatorId: 'agent' })

    await expect(client.diagnose()).rejects.toMatchObject({
      status: 0,
      cause,
      envelope: {
        schema: 'appraise.error/v1',
        classification: 'infrastructure_failure',
        operation: { name: 'diagnostic' },
        operationOutcome: 'not_started',
        details: { source: 'client_transport' },
      },
    })
  })

  it('sends target project and standalone test-run payloads to the hub coordinator API', async () => {
    const cwd = await workspace()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ targetProject: { id: 'target-1' } }))
      .mockResolvedValueOnce(Response.json({ targetProjects: [{ id: 'target-1' }] }))
      .mockResolvedValueOnce(Response.json({ planId: 'target-plan', targetProject: { id: 'target-1' } }))
      .mockResolvedValueOnce(Response.json({ runId: 'run-1', targetProjectId: 'target-1' }))
    vi.stubGlobal('fetch', fetchMock)
    const client = await createCoordinatorClient({ cwd, baseUrl: 'http://localhost:3000', coordinatorId: 'agent' })

    await client.addTargetProject('/target/app', 'Target App')
    await client.listTargetProjects()
    await client.createPlanForTarget({ planId: 'target-plan' }, 'target-1')
    await client.runTargetTests({ target: 'target-1', environmentId: 'env-1', tagExpression: '@smoke' })

    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      'http://localhost:3000/api/internal/coordinator/target-projects',
      'http://localhost:3000/api/internal/coordinator/target-projects',
      'http://localhost:3000/api/internal/coordinator/plans',
      'http://localhost:3000/api/internal/coordinator/test-runs',
    ])
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      path: '/target/app',
      displayName: 'Target App',
    })
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      plan: { planId: 'target-plan' },
      target: 'target-1',
    })
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual({
      target: 'target-1',
      environmentId: 'env-1',
      tagExpression: '@smoke',
    })
  })

  it('scopes TestRun read and diagnose to the selected project fingerprint', async () => {
    const cwd = await workspace()
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ kind: 'manual', evidence: {} })))
    vi.stubGlobal('fetch', fetchMock)
    const client = await createCoordinatorClient({ cwd, baseUrl: 'http://localhost:3000', coordinatorId: 'agent' })
    await client.readTestRun('run-one')
    await client.diagnoseTestRun('run-one')
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      'http://localhost:3000/api/internal/coordinator/test-runs/run-one',
      'http://localhost:3000/api/internal/coordinator/test-runs/run-one/diagnose',
    ])
    for (const call of fetchMock.mock.calls) {
      const headers = call[1]?.headers as Record<string, string>
      expect(headers['x-appraise-target-project']).toBe(headers['x-appraise-project'])
    }
  })

  it('derives target-bound TestRun scope from the authoritative plan', async () => {
    const cwd = await workspace()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ planId: 'plan-one', targetProjectId: 'target-project-id' }))
      .mockResolvedValueOnce(Response.json({ evidenceHealth: 'valid' }))
      .mockResolvedValueOnce(Response.json({ planId: 'plan-one', targetProjectId: 'target-project-id' }))
      .mockResolvedValueOnce(Response.json({ kind: 'capsule', diagnostic: {} }))
    vi.stubGlobal('fetch', fetchMock)
    const client = await createCoordinatorClient({ cwd, baseUrl: 'http://localhost:3000', coordinatorId: 'agent' })

    await client.readTestRun('run-one', 'plan-one')
    await client.diagnoseTestRun('run-one', 'plan-one')

    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      'http://localhost:3000/api/internal/coordinator/plans/plan-one',
      'http://localhost:3000/api/internal/coordinator/test-runs/run-one',
      'http://localhost:3000/api/internal/coordinator/plans/plan-one',
      'http://localhost:3000/api/internal/coordinator/test-runs/run-one/diagnose',
    ])
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      'x-appraise-target-project': 'target-project-id',
    })
    expect(fetchMock.mock.calls[3]?.[1]?.headers).toMatchObject({
      'x-appraise-target-project': 'target-project-id',
    })
  })

  it('preserves project mismatch details separately from wrong-token unauthorized responses', async () => {
    const cwd = await workspace()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            errorEnvelope({
              classification: 'authorization_failure',
              message: 'Coordinator credentials are not valid for this project.',
              operation: { name: 'diagnostic' },
              operationOutcome: 'not_started',
              retry: {
                safe: false,
                strategy: 'repair_appraise_then_resume',
                nextAction: { tool: 'coordinator_error_recovery', reason: 'Reconnect to the matching project.' },
              },
              details: { boundary: 'project_identity' },
            }),
            { status: 409 },
          ),
        )
        .mockResolvedValueOnce(
          Response.json(
            errorEnvelope({
              classification: 'authorization_failure',
              message: 'Coordinator authorization failed.',
              operation: { name: 'diagnostic' },
              operationOutcome: 'not_started',
              retry: {
                safe: false,
                strategy: 'repair_appraise_then_resume',
                nextAction: { tool: 'coordinator_error_recovery', reason: 'Reconnect with authorized credentials.' },
              },
            }),
            { status: 401 },
          ),
        ),
    )
    const client = await createCoordinatorClient({ cwd, baseUrl: 'http://localhost:3000', coordinatorId: 'agent' })

    await expect(client.diagnose()).rejects.toMatchObject({
      status: 409,
      envelope: { classification: 'authorization_failure', details: { boundary: 'project_identity' } },
    })
    await expect(client.diagnose()).rejects.toMatchObject({
      status: 401,
      envelope: { classification: 'authorization_failure' },
    })
  })

  it('rejects malformed upstream error responses instead of parsing a legacy envelope', async () => {
    const cwd = await workspace()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"legacy"}', { status: 500 })))
    const client = await createCoordinatorClient({ cwd, baseUrl: 'http://localhost:3000', coordinatorId: 'agent' })

    await expect(client.diagnose()).rejects.toMatchObject({
      status: 500,
      envelope: { schema: 'appraise.error/v1', classification: 'appraise_runtime_defect' },
    })
  })
})
