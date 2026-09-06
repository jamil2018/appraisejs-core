import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { CoordinatorOptions as McpOptions } from '../coordinator-client.js'
import { CoordinatorRequestError, coordinatorRequestError, toolError } from './coordinator-call.js'
import {
  canonicalMcpResourceNames,
  canonicalMcpToolNames,
  mcpResourceAnnotations,
  mcpToolAnnotations,
  type McpResourceAnnotations,
} from './contract.js'
import { registerResourcesOperations } from './domains/resources.js'
import { registerProjectOperations } from './domains/project.js'
import { registerDiagnosticOperations } from './domains/diagnostic.js'
import { registerRuntimeOperations } from './domains/runtime.js'
import { registerStepDefinitionOperations } from './domains/step-definitions.js'
import { registerQualityJourneyOperations } from './domains/quality-journey.js'
import { registerQualityJourneyExecutionOperations } from './domains/quality-journey-execution.js'
import { registerQualityJourneyTriageOperations } from './domains/quality-journey-triage.js'
import { registerQualityJourneyLibraryOperations } from './domains/quality-journey-library.js'

export type McpRegistryContext = {
  server: McpServer
  api: Awaited<ReturnType<typeof import('../coordinator-client.js').createCoordinatorClient>>
  options: McpOptions
}

export type McpContractDefinition = {
  kind: 'tool' | 'resource'
  name: string
  description?: string
  uri?: string
  inputSchema?: unknown
  annotations?: ToolAnnotations | McpResourceAnnotations
}

const contracts = new WeakMap<McpServer, readonly McpContractDefinition[]>()
const canonicalContracts = new Map<string, readonly McpContractDefinition[]>()

type ToolHandler = (...args: unknown[]) => unknown

function resourceError(error: CoordinatorRequestError) {
  const envelope = coordinatorRequestError(error)
  return {
    schema: envelope.schema,
    errorId: envelope.errorId,
    occurredAt: envelope.occurredAt,
    classification: envelope.classification,
    code: envelope.code,
    message: envelope.message,
    httpStatus: envelope.httpStatus,
    operation: envelope.operation,
    operationOutcome: envelope.operationOutcome,
    targetOutcome: envelope.targetOutcome,
    retry: envelope.retry,
  }
}

export function withStructuredCoordinatorErrors(handler: ToolHandler): ToolHandler {
  return async (...args: unknown[]) => {
    try {
      return await handler(...args)
    } catch (error) {
      if (error instanceof CoordinatorRequestError) return toolError(error)
      throw error
    }
  }
}

function registrationTarget(server: McpServer, definitions: McpContractDefinition[]): McpServer {
  const names = new Set<string>()
  return {
    registerTool(
      name: string,
      config: { description?: string; inputSchema?: z.ZodRawShape; annotations?: ToolAnnotations },
      handler: unknown,
    ) {
      if (!mcpToolAnnotations(name)) throw new Error(`Non-canonical MCP tool registration attempted: ${name}`)
      if (!name || names.has(`tool:${name}`)) throw new Error(`Duplicate or invalid MCP tool definition: ${name}`)
      if (typeof handler !== 'function') throw new Error(`MCP tool ${name} does not have an implemented handler.`)
      names.add(`tool:${name}`)
      const annotations = mcpToolAnnotations(name)!
      definitions.push({
        kind: 'tool',
        name,
        ...(config.description ? { description: config.description } : {}),
        inputSchema: z.toJSONSchema(z.object(config.inputSchema ?? {})),
        annotations,
      })
      return server.registerTool(
        name,
        { ...config, annotations } as never,
        withStructuredCoordinatorErrors(handler as ToolHandler) as never,
      )
    },
    registerResource(name: string, uri: unknown, config: { description?: string }, handler: unknown) {
      if (!mcpResourceAnnotations(name)) throw new Error(`Non-canonical MCP resource registration attempted: ${name}`)
      if (!name || names.has(`resource:${name}`))
        throw new Error(`Duplicate or invalid MCP resource definition: ${name}`)
      if (typeof handler !== 'function') throw new Error(`MCP resource ${name} does not have an implemented handler.`)
      names.add(`resource:${name}`)
      const normalizedUri =
        typeof uri === 'string' ? uri : String((uri as { uriTemplate?: unknown }).uriTemplate ?? uri)
      definitions.push({
        kind: 'resource',
        name,
        ...(config.description ? { description: config.description } : {}),
        uri: normalizedUri,
        annotations: mcpResourceAnnotations(name)!,
      })
      const resourceHandler = async (...args: unknown[]) => {
        try {
          return await (handler as (...handlerArguments: unknown[]) => unknown)(...args)
        } catch (error) {
          if (!(error instanceof CoordinatorRequestError)) throw error
          const resourceUri = args[0] instanceof URL ? args[0].href : String(uri)
          return {
            contents: [{ uri: resourceUri, mimeType: 'application/json', text: JSON.stringify(resourceError(error)) }],
          }
        }
      }
      return server.registerResource(name, uri as never, config, resourceHandler as never)
    },
  } as McpServer
}

const domainRegistries = Object.freeze([
  registerResourcesOperations,
  registerProjectOperations,
  registerDiagnosticOperations,
  registerRuntimeOperations,
  registerStepDefinitionOperations,
  registerQualityJourneyOperations,
  registerQualityJourneyExecutionOperations,
  registerQualityJourneyTriageOperations,
  registerQualityJourneyLibraryOperations,
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

export function assertCanonicalMcpDefinitions(definitions: readonly McpContractDefinition[]): void {
  assertUniqueMcpDefinitions(definitions)
  for (const definition of definitions)
    if (!definition.annotations)
      throw new Error(`Missing MCP annotations for definition: ${definition.kind}:${definition.name}`)
  const actualTools = definitions
    .filter(definition => definition.kind === 'tool')
    .map(definition => definition.name)
    .sort()
  const actualResources = definitions
    .filter(definition => definition.kind === 'resource')
    .map(definition => definition.name)
    .sort()
  const expectedTools = [...canonicalMcpToolNames].sort()
  const expectedResources = [...canonicalMcpResourceNames].sort()
  if (JSON.stringify(actualTools) !== JSON.stringify(expectedTools)) {
    throw new Error(`MCP tool contract does not match the canonical allowlist.`)
  }
  if (JSON.stringify(actualResources) !== JSON.stringify(expectedResources)) {
    throw new Error(`MCP resource contract does not match the canonical allowlist.`)
  }
}

export function registerAppraiseOperations(context: McpRegistryContext): readonly McpContractDefinition[] {
  const definitions: McpContractDefinition[] = []
  const registryContext = { ...context, server: registrationTarget(context.server, definitions) }
  for (const register of domainRegistries) register(registryContext)
  assertCanonicalMcpDefinitions(definitions)
  const immutableDefinitions = Object.freeze(definitions.map(definition => Object.freeze(definition)))
  const contractKey = 'default'
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
