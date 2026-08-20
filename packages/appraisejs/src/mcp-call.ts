import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import { assertLoopbackMcpEndpoint } from './mcp-http-security.js'
import { ensureLocalProjectIdentity } from './project-identity.js'

export async function callLocalMcpTool(input: {
  cwd: string
  endpoint: string
  tool: string
  arguments?: Record<string, unknown>
}) {
  const { identity } = await ensureLocalProjectIdentity(input.cwd)
  const transport = new StreamableHTTPClientTransport(assertLoopbackMcpEndpoint(input.endpoint), {
    requestInit: { headers: { Authorization: `Bearer ${identity.token}` } },
  })
  const client = new Client({ name: 'appraisejs-local-bridge', version: '1' })
  try {
    await client.connect(transport)
    return await client.callTool({ name: input.tool, arguments: input.arguments ?? {} })
  } finally {
    await client.close().catch(() => undefined)
  }
}

export function unwrapMcpToolResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content) || content.length !== 1) return result
  const item = content[0] as { type?: unknown; text?: unknown }
  if (item?.type !== 'text' || typeof item.text !== 'string') return result
  try {
    return JSON.parse(item.text) as unknown
  } catch {
    return result
  }
}

export function parseMcpToolArguments(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('--input-json must contain a JSON object.')
  return parsed as Record<string, unknown>
}
