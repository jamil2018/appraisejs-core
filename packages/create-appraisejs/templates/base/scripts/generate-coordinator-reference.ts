import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { format } from 'prettier'

import {
  coordinatorOperationRegistry,
  type CoordinatorOperationId,
} from '../src/services/coordinator/coordinator-operation-registry'

type McpDefinition = { kind: 'tool' | 'resource'; name: string; description?: string; uri?: string }
type McpFixture = { default: McpDefinition[]; providerNative: McpDefinition[] }
export type PublicOperationReference =
  { kind: 'coordinator'; operation: CoordinatorOperationId } | { kind: 'local'; reason: string }

const localSearchTools = new Set([
  'appraise_resources_list',
  'locator_search',
  'step_search',
  'step_block_search',
])
const localWorkflowTools = new Set([
  'plan_review_loop',
  'plan_wait_for_approval',
  'plan_wait_for_review',
  'planning_session_create',
  'validation_review_loop',
])

const exactCoordinatorOperations: Readonly<Record<string, CoordinatorOperationId>> = {
  coordination_slo_evaluate: 'coordination-slo',
  coordinator_heartbeat: 'heartbeat',
  coordinator_register: 'register',
  delegated_plan_create: 'plan-create',
  delegated_validation_ast_submit: 'delegated-validation-submit',
  delegation_create: 'delegation-create',
  delegation_read: 'delegation-read',
  delegation_revoke: 'delegation-revoke',
  implementation_completion_review: 'plan-completion-read',
  locator_graph_query: 'locator-graph',
  objective_create: 'objective-create',
  plan_continuation_package_create: 'plan-continuation',
  plan_create: 'plan-create',
  plan_event_acknowledge: 'plan-event-acknowledge',
  plan_events_acknowledge_through: 'plan-event-acknowledge',
  plan_events_read: 'plan-events-read',
  plan_lifecycle_health: 'plan-health',
  plan_lifecycle_snapshot: 'plan-snapshot',
  plan_read: 'plan-read',
  plan_review_read: 'plan-review-read',
  plan_revise: 'plan-revise',
  plan_start: 'plan-start',
  plan_task_update: 'plan-task-update',
  project_add: 'target-project-write',
  project_diagnostic: 'diagnostic',
  project_list: 'target-projects-list',
  provider_list: 'providers-list',
  provider_run_read: 'provider-runs-read',
  step_definition_draft_read: 'step-definitions-read',
  test_run: 'test-run-write',
  test_run_diagnose: 'test-run-evidence',
  test_run_preflight: 'test-run-write',
  test_run_read: 'test-run-evidence',
  validation_ast_extension_reviews: 'plan-validations-read',
  validation_context_read: 'plan-validations-read',
}

const coordinatorOperationPrefixes: ReadonlyArray<readonly [string, CoordinatorOperationId]> = [
  ['action_', 'actions'],
  ['actions_', 'actions'],
  ['baseline_', 'plan-baseline-write'],
  ['implementation_', 'plan-implementation-write'],
  ['operation_', 'operations'],
  ['provider_run_', 'provider-runs-write'],
  ['provider_', 'providers-write'],
  ['step_definition_', 'step-definitions-write'],
  ['validation_', 'plan-validation-write'],
]

export function referenceForMcpTool(name: string): PublicOperationReference {
  if (localSearchTools.has(name)) return { kind: 'local', reason: 'bounded local registry search' }
  if (localWorkflowTools.has(name)) return { kind: 'local', reason: 'multi-operation MCP workflow' }
  const exactOperation = exactCoordinatorOperations[name]
  if (exactOperation) return coordinator(exactOperation)
  const prefixOperation = coordinatorOperationPrefixes.find(([prefix]) => name.startsWith(prefix))?.[1]
  if (prefixOperation) return coordinator(prefixOperation)
  throw new Error(`MCP tool has no public operation reference: ${name}`)
}

function coordinator(operation: CoordinatorOperationId): PublicOperationReference {
  return { kind: 'coordinator', operation }
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

export function generateCoordinatorReference(fixture: McpFixture): string {
  const knownOperations = new Set(coordinatorOperationRegistry.definitions.map(item => item.id))
  const defaultNames = new Set(fixture.default.map(item => `${item.kind}:${item.name}`))
  const definitions = [
    ...fixture.default.map(item => ({ ...item, availability: 'default' })),
    ...fixture.providerNative
      .filter(item => !defaultNames.has(`${item.kind}:${item.name}`))
      .map(item => ({ ...item, availability: 'provider experimental' })),
  ]
  const toolRows = definitions
    .filter((item): item is McpDefinition & { availability: string } => item.kind === 'tool')
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(item => {
      const reference = referenceForMcpTool(item.name)
      if (reference.kind === 'coordinator' && !knownOperations.has(reference.operation))
        throw new Error(`MCP tool ${item.name} maps to missing coordinator operation ${reference.operation}.`)
      const target = reference.kind === 'coordinator' ? `\`${reference.operation}\`` : `local: ${reference.reason}`
      return `| \`${item.name}\` | ${item.availability} | ${target} | ${escapeCell(item.description ?? '')} |`
    })
  const resourceRows = definitions
    .filter((item): item is McpDefinition & { availability: string } => item.kind === 'resource')
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(
      item =>
        `| \`${item.name}\` | ${item.availability} | \`${escapeCell(item.uri ?? '')}\` | ${escapeCell(item.description ?? '')} |`,
    )
  const routeRows = coordinatorOperationRegistry.definitions.map(item => {
    const route = `/api/internal/coordinator/${item.pattern.join('/')}`
    return `| \`${item.id}\` | ${item.method} | \`${route}\` |`
  })

  return `<!-- GENERATED by npm run generate:coordinator-reference. DO NOT EDIT. -->
# Public Coordinator and MCP Operation Reference

This inventory is generated from the typed coordinator operation registry and the MCP contract fixture produced by
the canonical MCP registry. Human-owned lifecycle meaning and examples remain in \`docs/coordinator-api-mcp.md\`.

## Coordinator operations

| Operation | Method | Route pattern |
| --- | --- | --- |
${routeRows.join('\n')}

## MCP tools

| Tool | Availability | Coordinator or local boundary | Description |
| --- | --- | --- | --- |
${toolRows.join('\n')}

## MCP resources

| Resource | Availability | URI | Description |
| --- | --- | --- | --- |
${resourceRows.join('\n')}
`
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const fixture = JSON.parse(
    readFileSync(resolve(repoRoot, 'packages/appraisejs/src/mcp-contract.fixture.json'), 'utf8'),
  ) as McpFixture
  const outputPath = resolve(repoRoot, 'docs/generated/coordinator-operation-reference.md')
  const generated = await format(generateCoordinatorReference(fixture), { parser: 'markdown' })
  if (process.argv.includes('--check')) {
    const current = readFileSync(outputPath, 'utf8')
    if (current !== generated) throw new Error('Generated coordinator operation reference is stale.')
    console.log('Generated coordinator operation reference is current.')
    return
  }
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, generated)
  console.log(`Generated ${outputPath}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
