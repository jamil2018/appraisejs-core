import { createHash } from 'node:crypto'

const REQUIRED_RECEIPT_FIELDS = ['activePermissionProfile', 'instructionSources', 'runtimeWorkspaceRoots', 'sandbox']

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function evaluatePreTurnQualification({
  requiredMcpServer,
  mcpServers,
  threadStartResponse,
  sentMethods,
  authoritativeNativeToolInventory,
}) {
  const observedMcpNames = mcpServers.map(server => server.name).sort()
  const missingReceiptFields = REQUIRED_RECEIPT_FIELDS.filter(field => !(field in threadStartResponse))
  const findings = [
    ...missingMcpFindings(requiredMcpServer, observedMcpNames),
    ...unexpectedMcpFindings(requiredMcpServer, observedMcpNames),
    ...missingReceiptFindings(missingReceiptFields),
    ...nativeInventoryFindings(authoritativeNativeToolInventory),
    ...prematureTurnFindings(sentMethods),
  ]

  return {
    qualified: findings.length === 0,
    mayStartTurn: findings.length === 0,
    findings,
    observedMcpNames,
    sentMethods: [...sentMethods],
  }
}

function missingMcpFindings(requiredMcpServer, observedMcpNames) {
  return observedMcpNames.includes(requiredMcpServer)
    ? []
    : [
        {
          id: 'QB-01',
          kind: 'required_mcp_missing',
          detail: `Required MCP server ${requiredMcpServer} was not initialized.`,
        },
      ]
}

function unexpectedMcpFindings(requiredMcpServer, observedMcpNames) {
  const unexpectedMcpNames = observedMcpNames.filter(name => name !== requiredMcpServer)
  return unexpectedMcpNames.length === 0
    ? []
    : [
        {
          id: 'QB-02',
          kind: 'unexpected_mcp_servers',
          detail: `Unexpected MCP servers remained visible: ${unexpectedMcpNames.join(', ')}.`,
        },
      ]
}

function missingReceiptFindings(missingReceiptFields) {
  return missingReceiptFields.length === 0
    ? []
    : [
        {
          id: 'QB-02',
          kind: 'startup_receipt_incomplete',
          detail: `Thread start omitted: ${missingReceiptFields.join(', ')}.`,
        },
      ]
}

function nativeInventoryFindings(authoritativeNativeToolInventory) {
  return authoritativeNativeToolInventory
    ? []
    : [
        {
          id: 'QB-02',
          kind: 'native_tool_inventory_unavailable',
          detail:
            'The provider supplied MCP inventory but no authoritative effective inventory of model-visible native tools.',
        },
      ]
}

function prematureTurnFindings(sentMethods) {
  return sentMethods.includes('turn/start')
    ? [
        {
          id: 'QB-01',
          kind: 'turn_started_before_qualification',
          detail: 'The harness sent turn/start before the boundary gate passed.',
        },
      ]
    : []
}

function optionalLength(value) {
  return Array.isArray(value) ? value.length : null
}

function optionalThreadIdHash(thread) {
  return thread?.id ? sha256(thread.id) : null
}

export function sanitizeStartupReceipt({ executable, executableHash, protocolHash, response }) {
  return {
    executable,
    executableHash,
    protocolHash,
    activePermissionProfile: response.activePermissionProfile ?? null,
    instructionSourceCount: optionalLength(response.instructionSources),
    runtimeWorkspaceRoots: response.runtimeWorkspaceRoots ?? null,
    sandbox: response.sandbox ?? null,
    threadIdHash: optionalThreadIdHash(response.thread),
  }
}
