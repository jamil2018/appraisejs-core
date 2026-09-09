import assert from 'node:assert/strict'
import { test } from 'node:test'

import { evaluatePreTurnQualification, sanitizeStartupReceipt } from '../lib/managed-journey-provider-qualification.mjs'

const completeThreadReceipt = {
  activePermissionProfile: { id: 'read-only' },
  instructionSources: [],
  runtimeWorkspaceRoots: [],
  sandbox: { type: 'readOnly' },
  thread: { id: 'thread-secret-id' },
}

test('QB-01 refuses before turn/start when required MCP is absent', () => {
  const result = evaluatePreTurnQualification({
    requiredMcpServer: 'appraise-quality-journey',
    mcpServers: [],
    threadStartResponse: completeThreadReceipt,
    sentMethods: ['initialize', 'initialized', 'thread/start', 'mcpServerStatus/list'],
    authoritativeNativeToolInventory: true,
  })

  assert.equal(result.qualified, false)
  assert.equal(result.mayStartTurn, false)
  assert.equal(result.findings[0].kind, 'required_mcp_missing')
  assert.equal(result.sentMethods.includes('turn/start'), false)
})

test('QB-02 rejects an adapter that cannot attest effective native tool inventory', () => {
  const result = evaluatePreTurnQualification({
    requiredMcpServer: 'appraise-quality-journey',
    mcpServers: [{ name: 'appraise-quality-journey' }],
    threadStartResponse: completeThreadReceipt,
    sentMethods: ['initialize', 'initialized', 'thread/start', 'mcpServerStatus/list'],
    authoritativeNativeToolInventory: false,
  })

  assert.equal(result.qualified, false)
  assert.deepEqual(
    result.findings.map(finding => finding.kind),
    ['native_tool_inventory_unavailable'],
  )
})

test('QB-02 rejects MCP servers outside the exact role mapping', () => {
  const result = evaluatePreTurnQualification({
    requiredMcpServer: 'appraise-quality-journey',
    mcpServers: [{ name: 'appraise-quality-journey' }, { name: 'ambient-server' }],
    threadStartResponse: completeThreadReceipt,
    sentMethods: ['initialize', 'initialized', 'thread/start', 'mcpServerStatus/list'],
    authoritativeNativeToolInventory: true,
  })

  assert.equal(result.qualified, false)
  assert.equal(result.findings[0].kind, 'unexpected_mcp_servers')
})

test('the sanitized receipt hashes provider thread identity', () => {
  const receipt = sanitizeStartupReceipt({
    executable: '/fixture/codex',
    executableHash: 'exe-hash',
    protocolHash: 'protocol-hash',
    response: completeThreadReceipt,
  })

  assert.equal(receipt.threadIdHash.length, 64)
  assert.equal(JSON.stringify(receipt).includes('thread-secret-id'), false)
})
