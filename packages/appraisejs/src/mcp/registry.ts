import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CoordinatorOptions as McpOptions } from '../coordinator-client.js'
import type { PlanSnapshot } from './shared.js'
import { registerResourcesOperations } from './domains/resources.js'
import { registerProjectOperations } from './domains/project.js'
import { registerValidationOperations } from './domains/validation.js'
import { registerPlanningOperations } from './domains/planning.js'
import { registerDiagnosticOperations } from './domains/diagnostic.js'
import { registerRuntimeOperations } from './domains/runtime.js'
import { registerBaselineOperations } from './domains/baseline.js'
import { registerImplementationOperations } from './domains/implementation.js'

export type McpRegistryContext = {
  server: McpServer
  api: Awaited<ReturnType<typeof import('../coordinator-client.js').createCoordinatorClient>>
  options: McpOptions
  readSnapshot(planId: string): Promise<PlanSnapshot>
}

export type McpContractDefinition = {
  kind: 'tool' | 'resource'
  name: string
  description?: string
  uri?: string
  inputSchema?: unknown
}

const contracts = new WeakMap<McpServer, readonly McpContractDefinition[]>()
const canonicalContracts = new Map<string, readonly McpContractDefinition[]>()

function registrationTarget(server: McpServer, definitions: McpContractDefinition[]): McpServer {
  const names = new Set<string>()
  return {
    registerTool(name: string, config: { description?: string; inputSchema?: z.ZodRawShape }, handler: unknown) {
      if (!name || names.has(`tool:${name}`)) throw new Error(`Duplicate or invalid MCP tool definition: ${name}`)
      names.add(`tool:${name}`)
      definitions.push({
        kind: 'tool',
        name,
        ...(config.description ? { description: config.description } : {}),
        inputSchema: z.toJSONSchema(z.object(config.inputSchema ?? {})),
      })
      return server.registerTool(name, config as never, handler as never)
    },
    registerResource(name: string, uri: unknown, config: { description?: string }, handler: unknown) {
      if (!name || names.has(`resource:${name}`))
        throw new Error(`Duplicate or invalid MCP resource definition: ${name}`)
      names.add(`resource:${name}`)
      const normalizedUri =
        typeof uri === 'string' ? uri : String((uri as { uriTemplate?: unknown }).uriTemplate ?? uri)
      definitions.push({
        kind: 'resource',
        name,
        ...(config.description ? { description: config.description } : {}),
        uri: normalizedUri,
      })
      return server.registerResource(name, uri as never, config, handler as never)
    },
  } as McpServer
}

const domainRegistries = Object.freeze([
  registerResourcesOperations,
  registerProjectOperations,
  registerValidationOperations,
  registerPlanningOperations,
  registerDiagnosticOperations,
  registerRuntimeOperations,
  registerBaselineOperations,
  registerImplementationOperations,
] as const)

export function assertUniqueMcpDefinitions(definitions: readonly McpContractDefinition[]): void {
  const names = new Set<string>()
  for (const definition of definitions) {
    if (definition.kind !== 'tool' && definition.kind !== 'resource') {
      throw new Error(`Unknown MCP definition kind: ${String((definition as { kind?: unknown }).kind)}`)
    }
    const key = `${definition.kind}:${definition.name}`
    if (!definition.name || names.has(key)) throw new Error(`Duplicate or invalid MCP definition: ${key}`)
    names.add(key)
  }
}

export function registerAppraiseOperations(context: McpRegistryContext): readonly McpContractDefinition[] {
  const definitions: McpContractDefinition[] = []
  const registryContext = { ...context, server: registrationTarget(context.server, definitions) }
  for (const register of domainRegistries) register(registryContext)
  assertUniqueMcpDefinitions(definitions)
  const immutableDefinitions = Object.freeze(definitions.map(definition => Object.freeze(definition)))
  const contractKey = definitions.some(definition => definition.name === 'provider_list')
    ? 'provider-native'
    : 'default'
  const canonical = canonicalContracts.get(contractKey)
  if (canonical && JSON.stringify(canonical) !== JSON.stringify(immutableDefinitions)) {
    throw new Error(`MCP ${contractKey} definitions changed within the running process.`)
  }
  const processDefinitions = canonical ?? immutableDefinitions
  canonicalContracts.set(contractKey, processDefinitions)
  contracts.set(context.server, processDefinitions)
  return processDefinitions
}

export function mcpContractForServer(server: McpServer): readonly McpContractDefinition[] {
  const definitions = contracts.get(server)
  if (!definitions) throw new Error('MCP server has not been registered through the canonical operation registry.')
  return definitions
}
