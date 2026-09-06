import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'

export type McpResourceAnnotations = Readonly<{
  readOnlyHint: true
}>

const readOnly = Object.freeze({ readOnlyHint: true, openWorldHint: false } satisfies ToolAnnotations)
const localMutation = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} satisfies ToolAnnotations)
const durableLifecycleMutation = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} satisfies ToolAnnotations)
const externalExecution = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} satisfies ToolAnnotations)
const externalStop = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} satisfies ToolAnnotations)

/**
 * The sole public MCP surface. Keep this list limited to handlers that are
 * registered by the quality-owned domain registries.
 */
export const canonicalMcpToolAnnotations = Object.freeze({
  project_diagnostic: localMutation,
  project_add: Object.freeze({ ...localMutation, openWorldHint: true }),
  project_list: readOnly,
  locator_graph_query: readOnly,
  locator_ensure: localMutation,
  operation_categories: readOnly,
  operation_search: readOnly,
  operation_read: readOnly,
  step_search: readOnly,
  step_definition_draft_read: readOnly,
  locator_search: readOnly,
  environment_list: readOnly,
  environment_ensure: localMutation,
  quality_journey_create: localMutation,
  quality_journey_get: readOnly,
  quality_journey_resume: localMutation,
  quality_journey_command_submit: localMutation,
  quality_journey_factory_evidence_inspect: readOnly,
  quality_journey_work_claim: localMutation,
  quality_journey_work_dispatch: externalExecution,
  quality_journey_work_complete: localMutation,
  quality_journey_work_cancel: externalStop,
  quality_journey_work_revoke: localMutation,
  quality_journey_artifacts_list: readOnly,
  quality_journey_discovery_get: readOnly,
  quality_journey_target_observation_submit: durableLifecycleMutation,
  quality_journey_resource_resolution_submit: durableLifecycleMutation,
  quality_journey_discovery_retry: durableLifecycleMutation,
  quality_journey_discovery_revalidate: localMutation,
  quality_journey_analysis_get: readOnly,
  quality_journey_analysis_submit: durableLifecycleMutation,
  quality_journey_analysis_answer: durableLifecycleMutation,
  quality_journey_analysis_publish: durableLifecycleMutation,
  quality_journey_analysis_revision_request: durableLifecycleMutation,
  quality_journey_analysis_decide: durableLifecycleMutation,
  quality_journey_scenarios_get: readOnly,
  quality_journey_scenarios_submit: durableLifecycleMutation,
  quality_journey_scenarios_publish: durableLifecycleMutation,
  quality_journey_scenarios_decide: durableLifecycleMutation,
  quality_journey_scenarios_comment: durableLifecycleMutation,
  quality_journey_execution_get: readOnly,
  quality_journey_triage_get: readOnly,
  quality_journey_library_list: readOnly,
  quality_journey_artifact_get: readOnly,
  quality_journey_export: readOnly,
  quality_journey_triage_evidence_read: readOnly,
  quality_journey_triage_prepare: durableLifecycleMutation,
  quality_journey_triage_submit: durableLifecycleMutation,
  quality_journey_execution_start: externalExecution,
  quality_journey_execution_cancel: externalStop,
  quality_journey_execution_reconcile: durableLifecycleMutation,
  quality_journey_rerun_propose: durableLifecycleMutation,
  quality_journey_rerun_start: externalExecution,
  quality_journey_automation_context_get: readOnly,
  quality_journey_automation_materialize: durableLifecycleMutation,
  quality_journey_scenarios_comment_dispose: durableLifecycleMutation,
  quality_journey_scenarios_start: durableLifecycleMutation,
  quality_journey_scenarios_revision_request: durableLifecycleMutation,
  test_run_start: externalExecution,
  test_run_read: readOnly,
  test_run_diagnose: readOnly,
} satisfies Record<string, ToolAnnotations>)

export const canonicalMcpResourceAnnotations = Object.freeze({
  'operation-catalog-contract': Object.freeze({ readOnlyHint: true }),
  'locator-graph-contract': Object.freeze({ readOnlyHint: true }),
  project: Object.freeze({ readOnlyHint: true }),
  'target-projects': Object.freeze({ readOnlyHint: true }),
  'locator-graph-visual': Object.freeze({ readOnlyHint: true }),
  'operation-catalog': Object.freeze({ readOnlyHint: true }),
} satisfies Record<string, McpResourceAnnotations>)

export const canonicalMcpResourceUris = Object.freeze({
  'operation-catalog-contract': 'appraise://contracts/operation-catalog',
  'locator-graph-contract': 'appraise://contracts/locator-graph',
  project: 'appraise://project',
  'target-projects': 'appraise://target-projects',
  'locator-graph-visual': 'appraise://locator-graph/visual',
  'operation-catalog': 'appraise://operations/catalog',
} as const)

export const canonicalMcpToolNames = Object.freeze(Object.keys(canonicalMcpToolAnnotations))
export const canonicalMcpResourceNames = Object.freeze(Object.keys(canonicalMcpResourceAnnotations))

export function mcpToolAnnotations(name: string): ToolAnnotations | undefined {
  return canonicalMcpToolAnnotations[name as keyof typeof canonicalMcpToolAnnotations]
}

export function mcpResourceAnnotations(name: string): McpResourceAnnotations | undefined {
  return canonicalMcpResourceAnnotations[name as keyof typeof canonicalMcpResourceAnnotations]
}
