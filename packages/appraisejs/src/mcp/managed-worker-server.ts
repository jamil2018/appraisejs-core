import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js'
import { createHash } from 'node:crypto'

import type { CoordinatorOptions } from '../coordinator-client.js'
import { createAppraiseMcpServer } from './server-factory.js'

export type AttemptScopedWorkerTool = Readonly<{
  name: string
  description?: string
  inputSchema: unknown
}>

export type AttemptScopedWorkerProfile = Readonly<{
  role: string
  contractDigest: string
  tools: readonly AttemptScopedWorkerTool[]
}>

type GatewayCall = (input: {
  sealedGrant: string
  profileDigest: string
  toolName: string
  arguments: Record<string, unknown>
}) => Promise<{ result: unknown; receipt: unknown }>

/**
 * Disposable proof surface for managed-worker qualification. The trusted full
 * Appraise MCP remains on createAppraiseMcpServer; this factory registers only
 * the supplied attempt-scoped profile and delegates every call to the trusted
 * gateway boundary.
 */
export function createAttemptScopedWorkerMcpServer({
  profile,
  expectedProfileDigest,
  sealedGrant,
  callGateway,
}: {
  profile: AttemptScopedWorkerProfile
  expectedProfileDigest: string
  sealedGrant: string
  callGateway: GatewayCall
}): Server {
  const { contractDigest, ...profileSubject } = profile
  if (contractDigest !== expectedProfileDigest || digest(profileSubject) !== contractDigest) {
    throw new Error('Attempt-scoped worker profile is not the trusted launch profile.')
  }
  const names = new Set(profile.tools.map(tool => tool.name))
  if (names.size !== profile.tools.length || names.has('')) {
    throw new Error('Attempt-scoped worker tools must have unique non-empty names.')
  }
  const server = new Server(
    { name: `appraise-quality-journey-worker-${profile.role.toLowerCase()}`, version: '0.0.0-p0-proof' },
    { capabilities: { tools: {} } },
  )
  const validatorProvider = new AjvJsonSchemaValidator()
  const validators = new Map(
    profile.tools.map(tool => [tool.name, validatorProvider.getValidator(tool.inputSchema as never)]),
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: profile.tools.map(tool => ({
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      inputSchema: tool.inputSchema as never,
    })),
  }))
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const tool = profile.tools.find(candidate => candidate.name === request.params.name)
    if (!tool) throw new McpError(ErrorCode.MethodNotFound, 'Tool is not registered for this worker role.')
    const argumentsValue = request.params.arguments ?? {}
    const validation = validators.get(tool.name)!(argumentsValue)
    if (!validation.valid)
      throw new McpError(ErrorCode.InvalidParams, 'Worker tool arguments failed the scoped schema.')
    const output = await callGateway({
      sealedGrant,
      profileDigest: profile.contractDigest,
      toolName: tool.name,
      arguments: validation.data as Record<string, unknown>,
    })
    return {
      content: [{ type: 'text', text: JSON.stringify(output.result) }],
      structuredContent: { result: output.result, receipt: output.receipt },
    }
  })
  return server
}

/** Keeps the broad coordinator MCP on an in-memory trusted-side transport.
 * Workers can reach it only after scoped gateway validation and principal
 * injection; the full tool list and project bearer never cross that boundary. */
export async function createTrustedCanonicalIngressBridge(options: CoordinatorOptions) {
  const server = await createAppraiseMcpServer(options)
  const client = new Client({ name: 'appraise-managed-worker-trusted-bridge', version: '0.0.0-p0-proof' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return {
    invoke: async ({
      toolName,
      arguments: argumentsValue,
    }: {
      toolName: string
      arguments: Record<string, unknown>
    }) => {
      const result = await client.callTool({ name: toolName, arguments: argumentsValue })
      if (result.isError) throw new Error(`Canonical Journey ingress rejected ${toolName}.`)
      if (result.structuredContent !== undefined) return result.structuredContent
      const content = Array.isArray(result.content) ? (result.content as { type: string; text?: string }[]) : []
      const text = content.find(item => item.type === 'text' && typeof item.text === 'string')
      return text?.text ? JSON.parse(text.text) : content
    },
    close: async () => {
      await client.close()
      await server.close()
    },
  }
}

function digest(value: unknown) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex')}`
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalValue(nested)]),
  )
}
