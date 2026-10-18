import { createHash } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js'

import { createExternalWorkerGateway } from './external-worker-gateway.js'

export type ExternalWorkerAdvertisedProfile = Readonly<{
  gatewayProfileDigest: string
  tools: readonly Readonly<{
    name: string
    inputSchema: ReturnType<typeof toJsonSchemaCompat>
    schemaHash: string
  }>[]
  profileDigest: string
}>

/**
 * Build one assignment-bound external worker MCP endpoint. The caller owns the
 * transport and lifetime; this factory does not launch a worker or open a port.
 */
export function createExternalWorkerMcpServer(options: Parameters<typeof createExternalWorkerGateway>[0]) {
  const gateway = createExternalWorkerGateway(options)
  const server = new McpServer({ name: 'appraisejs-external-worker', version: '0.0.0-m02' })
  const tools: ExternalWorkerAdvertisedProfile['tools'][number][] = []
  const registrationServer = new Proxy(server, {
    get(target, property, receiver) {
      if (property !== 'registerTool') return Reflect.get(target, property, receiver)
      const register: McpServer['registerTool'] = (name, config, handler) => {
        // Match the SDK's ListTools conversion on the exact registered Zod input.
        const installed = Reflect.apply(target.registerTool, target, [name, config, handler])
        const normalized = normalizeObjectSchema(config.inputSchema)
        if (!normalized) throw new Error('External worker tool has no object input schema.')
        const inputSchema = toJsonSchemaCompat(normalized, { strictUnions: true, pipeStrategy: 'input' })
        tools.push({ name, inputSchema, schemaHash: hash(inputSchema) })
        return installed
      }
      return register
    },
  })
  gateway.register(registrationServer)
  const profile = deepFreeze(gateway.profile)
  const subject = { gatewayProfileDigest: profile.profileDigest, tools }
  const advertisedProfile: ExternalWorkerAdvertisedProfile = deepFreeze({
    ...subject,
    profileDigest: hash(subject),
  })

  return Object.freeze({ server, profile, advertisedProfile })
}

function hash(value: unknown) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`
  const result = JSON.stringify(value)
  if (result === undefined) throw new Error('Non-JSON advertised schema.')
  return result
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}
