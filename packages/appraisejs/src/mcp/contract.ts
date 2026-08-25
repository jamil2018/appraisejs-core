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
const localDecision = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
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
  requirements_submit_source: localMutation,
  requirements_analyze: localMutation,
  requirements_graph_read: readOnly,
  requirements_answer_queries: localMutation,
  requirements_approve: localDecision,
  validation_design_propose: localMutation,
  validation_design_approve: localDecision,
  evaluation_subject_remote_scope_create: localMutation,
  evaluation_subject_remote_scope_partition_create: localMutation,
  evaluation_subject_remote_scope_read: readOnly,
  assessment_create: localMutation,
  assessment_create_successor: localMutation,
  assessment_readiness: readOnly,
  assessment_preflight: readOnly,
  assessment_run: externalExecution,
  assessment_prepare_run: externalExecution,
  assessment_execution_authorization_issue: localMutation,
  assessment_execution_authorization_revoke: localMutation,
  assessment_stop: externalStop,
  assessment_diagnose: readOnly,
  assessment_reconcile: localMutation,
  assessment_review: readOnly,
  assessment_decide: localDecision,
  test_run_start: externalExecution,
  test_run_read: readOnly,
  test_run_diagnose: readOnly,
} satisfies Record<string, ToolAnnotations>)

export const canonicalMcpResourceAnnotations = Object.freeze({
  'operation-catalog-contract': Object.freeze({ readOnlyHint: true }),
  'locator-graph-contract': Object.freeze({ readOnlyHint: true }),
  'validation-ast-contract': Object.freeze({ readOnlyHint: true }),
  project: Object.freeze({ readOnlyHint: true }),
  'target-projects': Object.freeze({ readOnlyHint: true }),
  'locator-graph-visual': Object.freeze({ readOnlyHint: true }),
  'operation-catalog': Object.freeze({ readOnlyHint: true }),
  'workflow-quality-design': Object.freeze({ readOnlyHint: true }),
  'workflow-assessment': Object.freeze({ readOnlyHint: true }),
} satisfies Record<string, McpResourceAnnotations>)

export const canonicalMcpResourceUris = Object.freeze({
  'operation-catalog-contract': 'appraise://contracts/operation-catalog',
  'locator-graph-contract': 'appraise://contracts/locator-graph',
  'validation-ast-contract': 'appraise://contracts/validation-ast',
  project: 'appraise://project',
  'target-projects': 'appraise://target-projects',
  'locator-graph-visual': 'appraise://locator-graph/visual',
  'operation-catalog': 'appraise://operations/catalog',
  'workflow-quality-design': 'appraise://workflow/quality-design',
  'workflow-assessment': 'appraise://workflow/assessment',
} as const)

export const canonicalMcpToolNames = Object.freeze(Object.keys(canonicalMcpToolAnnotations))
export const canonicalMcpResourceNames = Object.freeze(Object.keys(canonicalMcpResourceAnnotations))

export function mcpToolAnnotations(name: string): ToolAnnotations | undefined {
  return canonicalMcpToolAnnotations[name as keyof typeof canonicalMcpToolAnnotations]
}

export function mcpResourceAnnotations(name: string): McpResourceAnnotations | undefined {
  return canonicalMcpResourceAnnotations[name as keyof typeof canonicalMcpResourceAnnotations]
}
