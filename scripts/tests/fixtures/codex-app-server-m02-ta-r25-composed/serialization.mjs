/** Real frozen canonical-bundle endpoint and SDK serialization; only bridge/DB effects are fake. */
import { pathToFileURL } from 'node:url'
import { Client } from '../../../../packages/appraisejs/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'
import { InMemoryTransport } from '../../../../packages/appraisejs/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js'

export async function serializedCanonicalRead(seal, bundlePath, role = 'REQUIREMENT_ANALYZER') {
  const canonical = await import(pathToFileURL(bundlePath))
  const digest = `sha256:${'a'.repeat(64)}`
  const binding = {
    hubId: 'hub-1',
    target: 'target-1',
    targetProjectId: 'project-1',
    journeyId: 'journey-1',
    role,
    workItemId: 'work-1',
    attemptId: 'attempt-1',
    assignmentId: 'assignment-1',
    assignmentGeneration: 2,
    leaseId: 'lease-1',
    authorizationId: 'authorization-1',
    coordinatorHandoffId: 'session-1',
    coordinatorGeneration: 3,
    transportGeneration: 1,
    expectedInputHash: digest,
    expectedScopeHash: digest,
    assignmentSecret: 'synthetic-offline-assignment-secret',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }
  const tools = seal.profiles.roles.find(item => item.role === role).toolsList.tools
  const reads = tools
    .filter(item => !item.name.includes('_submit_v1') && !item.name.includes('_materialize_v1'))
    .map(tool => {
      const evidence = tool.name === 'quality_journey_triage_evidence_read'
      const search = tool.name === 'operation_search'
      return {
        toolName: tool.name,
        arguments: evidence
          ? { receiptId: 'sealed-1', artifactKind: 'log', offset: 0, limit: 4096 }
          : search
            ? { query: 'fixture' }
            : {},
        allowedArtifactIds: ['sealed-1'],
        inputHash: digest,
        scopeHash: digest,
        source: [
          {
            hubId: binding.hubId,
            targetProjectId: binding.targetProjectId,
            journeyId: binding.journeyId,
            workItemId: binding.workItemId,
            attemptId: binding.attemptId,
            inputHash: digest,
            scopeHash: digest,
            artifactId: 'sealed-1',
            data: {
              summary: 'Synthetic frozen scope',
              ...(search ? { resources: [] } : {}),
              ...(evidence
                ? { receiptId: 'sealed-1', artifactKind: 'log', offset: 0, limit: 4096, text: 'Synthetic evidence' }
                : {}),
            },
          },
        ],
      }
    })
  const endpoint = await canonical.createTrustedWorkerBridgeEndpoint({
    call: async action => {
      if (action === 'bootstrap') return { binding, frozenReads: reads }
      if (['bindProfile', 'authorize'].includes(action)) return {}
      throw new Error('OFFLINE_UNPLANNED_CANONICAL_EFFECT')
    },
  })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'offline-serialization', version: '1' })
  try {
    await endpoint.server.connect(serverTransport)
    await client.connect(clientTransport)
    const results = []
    for (const read of reads) {
      const result = await client.callTool({ name: read.toolName, arguments: read.arguments })
      if (result.isError || result.content?.length !== 1 || result.content[0].type !== 'text')
        throw new Error('OFFLINE_CANONICAL_READ_REFUSED')
      // Exercise the actual JSON wire representation, not an invented structuredContent object.
      results.push(JSON.parse(JSON.stringify(result)))
    }
    return results
  } finally {
    await client.close()
    await endpoint.server.close()
  }
}
