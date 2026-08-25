import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { CoordinatorRequestError, createCoordinatorClient } from './coordinator-client.js'

const workspaces: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(workspaces.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function client() {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-coordinator-client-'))
  workspaces.push(cwd)
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"coordinator-client-test"}')
  return createCoordinatorClient({ cwd, baseUrl: 'http://127.0.0.1:3999', coordinatorId: 'test' })
}

function endpointMismatch(error: unknown) {
  expect(error).toBeInstanceOf(CoordinatorRequestError)
  return (error as CoordinatorRequestError).envelope
}

describe('coordinator client endpoint contracts', () => {
  it('classifies non-JSON 404 and 405 responses as an Appraise hub endpoint mismatch for every operation', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('<!doctype html>', { status: 404 }))
        .mockResolvedValueOnce(new Response('', { status: 405 })),
    )
    const api = await client()

    const listError = await api.listTargetProjects().catch(endpointMismatch)
    const operationError = await api.readOperations([{ id: 'browser.assertions.visible' }]).catch(endpointMismatch)

    for (const error of [listError, operationError]) {
      expect(error).toMatchObject({
        classification: 'infrastructure_failure',
        code: 'coordinator_endpoint_mismatch',
        operationOutcome: 'not_started',
        targetOutcome: 'not_evaluated',
        retry: {
          safe: true,
          strategy: 'repair_appraise_then_resume',
          nextAction: {
            tool: 'coordinator_error_recovery',
            reason: 'Verify --base-url points to the AppraiseJS hub, then reconnect the MCP client.',
          },
        },
      })
    }
    expect(listError.operation).toEqual({ name: 'target-projects' })
    expect(operationError.operation).toEqual({ name: expect.stringContaining('operations/read') })
  })

  it('preserves valid Appraise JSON envelopes and keeps malformed 5xx responses as runtime defects', async () => {
    const appraiseError = {
      schema: 'appraise.error/v1',
      errorId: '11111111-1111-4111-8111-111111111111',
      occurredAt: '2026-08-22T00:00:00.000Z',
      classification: 'resource_missing',
      code: 'target_not_found',
      message: 'The target does not exist.',
      httpStatus: 404,
      operation: { name: 'target-projects' },
      operationOutcome: 'not_started',
      targetOutcome: 'not_evaluated',
      retry: { safe: false, strategy: 'do_not_retry' },
    }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(appraiseError, { status: 404 }))
        .mockResolvedValueOnce(new Response('<html>server error</html>', { status: 500 })),
    )
    const api = await client()

    await expect(api.listTargetProjects()).rejects.toMatchObject({ envelope: appraiseError })
    await expect(api.listTargetProjects()).rejects.toMatchObject({
      envelope: { classification: 'appraise_runtime_defect', code: 'appraise_runtime_defect', httpStatus: 500 },
    })
  })

  it('preserves the bounded committed authorization handoff for same-key preparation replay', async () => {
    const authorization = {
      executionRequestId: '5a9fb98f-8912-44a9-b843-30fb19dd6129',
      expectedRequestHash: 'sha256:ef9b0d0aeaaf986a80f8c2f11ebee50b1e5600b14df7074dc65efc49ebb3a063',
      expiresAt: '2026-08-24T12:00:00.000Z',
      authorizationRequestCreated: true,
      nextAction: {
        tool: 'assessment_prepare_run',
        reason:
          'The credential authorization request is committed. Issue a grant, then replay the original compact preparation request with this same idempotencyKey.',
      },
    }
    const envelope = {
      schema: 'appraise.error/v1',
      errorId: '11111111-1111-4111-8111-111111111111',
      occurredAt: '2026-08-24T11:59:00.000Z',
      classification: 'authorization_failure',
      code: 'AUTHORIZATION_REQUIRED',
      message: 'AUTHORIZATION_REQUIRED',
      httpStatus: 403,
      operation: { name: 'quality/assessment-prepare-runs', idempotencyKey: 'credential-retry-key' },
      operationOutcome: 'committed',
      durableState: 'authorization_request_committed',
      targetOutcome: 'not_evaluated',
      retry: { safe: false, strategy: 'read_state_then_retry', nextAction: authorization.nextAction },
      authorization,
      details: {
        requestId: authorization.executionRequestId,
        requestHash: authorization.expectedRequestHash,
        expiresAt: authorization.expiresAt,
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(envelope, { status: 403 })))
    const api = await client()

    await expect(api.request('quality/assessment-prepare-runs', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      envelope: {
        operationOutcome: 'committed',
        durableState: 'authorization_request_committed',
        authorization,
      },
    })
  })

  it('does not send local coordinator identity headers to a non-loopback endpoint', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-untrusted-coordinator-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"untrusted-coordinator-test"}')
    const api = await createCoordinatorClient({
      cwd,
      baseUrl: 'https://untrusted.example.test',
      coordinatorId: 'test',
    })

    await expect(api.listTargetProjects()).rejects.toMatchObject({
      envelope: {
        classification: 'infrastructure_failure',
        code: 'coordinator_endpoint_untrusted',
        operationOutcome: 'not_started',
        targetOutcome: 'not_evaluated',
      },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the project identity only to a credential-free loopback coordinator endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
    vi.stubGlobal('fetch', fetchMock)
    const api = await client()

    await expect(api.listTargetProjects()).resolves.toEqual([])

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3999/api/internal/coordinator/target-projects',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: expect.stringMatching(/^Bearer /),
          'x-appraise-project': expect.stringMatching(/^sha256:/),
          'x-appraise-base-url': 'http://127.0.0.1:3999',
        }),
      }),
    )
  })

  it('continues to accept localhost as a local coordinator origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
    vi.stubGlobal('fetch', fetchMock)
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-localhost-coordinator-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"localhost-coordinator-test"}')
    const api = await createCoordinatorClient({ cwd, baseUrl: 'http://localhost:3999', coordinatorId: 'test' })

    await expect(api.listTargetProjects()).resolves.toEqual([])

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3999/api/internal/coordinator/target-projects',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: expect.stringMatching(/^Bearer /) }),
      }),
    )
  })
})
