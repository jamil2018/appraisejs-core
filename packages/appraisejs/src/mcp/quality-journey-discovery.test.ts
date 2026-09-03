import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAppraiseMcpServer } from './server-factory.js'

const workspaces: string[] = []
const digest = (character: string) => `sha256:${character.repeat(64)}`
const discoveryBase = {
  bundleId: 'bundle-1',
  cycleId: 'cycle-1',
  analysisRevision: { artifactId: 'analysis-1', revisionId: 'revision-1', contentHash: digest('c') },
  analysisApproval: { artifactId: 'approval-1', contentHash: digest('d') },
  authorizationId: 'authorization-1',
  inputHash: digest('a'),
  assignmentScopeHash: digest('b'),
  approvedRequirementSetHash: digest('e'),
  inputArtifacts: [
    {
      kind: 'ANALYSIS_CHARTER_REVISION',
      artifactId: 'analysis-1',
      revisionId: 'revision-1',
      contentHash: digest('c'),
    },
    { kind: 'JOURNEY_APPROVAL', artifactId: 'approval-1', contentHash: digest('d') },
  ],
  evidenceReceipts: [{ artifactId: 'evidence-1', contentHash: digest('f') }],
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(workspaces.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

describe('Quality Journey discovery MCP contracts', () => {
  it('rejects semantically invalid observation provenance before coordinator I/O', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-mcp-discovery-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"mcp-discovery-test"}')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const server = await createAppraiseMcpServer({ cwd, baseUrl: 'http://127.0.0.1:3999', coordinatorId: 'test' })
    const client = new Client({ name: 'discovery-contract-test', version: '1' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await server.connect(serverTransport)
      await client.connect(clientTransport)
      const result = await client.callTool({
        name: 'quality_journey_target_observation_submit',
        arguments: {
          target: 'target-1',
          journeyId: 'journey-1',
          discoveryRevisionId: 'discovery-1',
          workItemId: 'work-1',
          attemptId: 'attempt-1',
          leaseId: 'lease-1',
          ownerToken: 'owner-token',
          idempotencyKey: 'submit-1',
          expectedInputHash: digest('a'),
          expectedScopeHash: digest('b'),
          bundle: {
            bundleId: 'bundle-1',
            cycleId: 'cycle-1',
            analysisRevision: { artifactId: 'analysis-1', revisionId: 'revision-1', contentHash: digest('c') },
            analysisApproval: { artifactId: 'approval-1', contentHash: digest('d') },
            authorizationId: 'authorization-1',
            inputHash: digest('a'),
            assignmentScopeHash: digest('b'),
            approvedRequirementSetHash: digest('e'),
            inputArtifacts: [
              {
                kind: 'ANALYSIS_CHARTER_REVISION',
                artifactId: 'analysis-1',
                revisionId: 'revision-1',
                contentHash: digest('c'),
              },
              { kind: 'JOURNEY_APPROVAL', artifactId: 'approval-1', contentHash: digest('d') },
            ],
            evidenceReceipts: [{ artifactId: 'evidence-1', contentHash: digest('f') }],
            observedAt: '2026-09-04T00:00:00.000Z',
            targetSnapshot: {
              snapshotId: 'snapshot-1',
              capturedAt: '2026-09-04T00:00:00.000Z',
              contentHash: digest('1'),
            },
            observations: [
              {
                observationId: 'observation-1',
                snapshotId: 'wrong-snapshot',
                routeId: 'route-1',
                environmentId: 'environment-1',
                fact: 'Checkout is visible.',
                evidenceReceiptIds: ['missing-evidence'],
                confidence: 'HIGH',
                confidenceRationale: 'Direct observation.',
                stability: 'STABLE',
                stabilityRationale: 'Registered route.',
                revalidationPolicy: { triggers: ['registry_changed'] },
              },
            ],
          },
        },
      })
      expect(result.isError).toBe(true)
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('rejects incomplete resource resolution before coordinator I/O', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-mcp-discovery-resource-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"mcp-discovery-resource-test"}')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const server = await createAppraiseMcpServer({ cwd, baseUrl: 'http://127.0.0.1:3999', coordinatorId: 'test' })
    const client = new Client({ name: 'discovery-resource-test', version: '1' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await server.connect(serverTransport)
      await client.connect(clientTransport)
      const result = await client.callTool({
        name: 'quality_journey_resource_resolution_submit',
        arguments: {
          target: 'target-1',
          journeyId: 'journey-1',
          discoveryRevisionId: 'discovery-1',
          workItemId: 'work-1',
          attemptId: 'attempt-1',
          leaseId: 'lease-1',
          ownerToken: 'owner-token',
          idempotencyKey: 'submit-resource-1',
          expectedInputHash: digest('a'),
          expectedScopeHash: digest('b'),
          bundle: {
            ...discoveryBase,
            resolvedAt: '2026-09-04T00:00:00.000Z',
            approvedRequirementIds: ['REQ-1'],
            reusable: [],
            incompatible: [],
            stale: [],
            crossTarget: [],
            missing: [],
          },
        },
      })
      expect(result.isError).toBe(true)
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      await client.close()
      await server.close()
    }
  })
})
