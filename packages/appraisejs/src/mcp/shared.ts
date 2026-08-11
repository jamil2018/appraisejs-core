import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { canonicalMcpResourceUris, canonicalMcpToolNames } from './contract.js'
import type { createCoordinatorApiClient } from './coordinator-call.js'
import { diagnoseProject } from '../diagnostics.js'

export { z }
export {
  LOCATOR_GRAPH_CONTRACT_VERSION,
  OPERATION_CATALOG_CONTRACT_VERSION,
  VALIDATION_AST_JSON_SCHEMA,
  VALIDATION_AST_SCHEMA_VERSION,
} from '../managed-validation-contracts.js'
export { diagnoseProject }
export * from './response-projector.js'
export * from './coordinator-call.js'

const require = createRequire(import.meta.url)
const packageJson = require('../../package.json') as { version?: string }
const serverStartedAt = new Date().toISOString()
const workflowTools = canonicalMcpToolNames
const workflowResources = Object.freeze(Object.values(canonicalMcpResourceUris))

export function text(value: unknown) {
  const serialized = JSON.stringify(value, null, 2)
  return {
    content: [{ type: 'text' as const, text: serialized }],
    _meta: {
      'appraise/responseMetrics': {
        bytes: Buffer.byteLength(serialized),
        estimatedTokens: Math.ceil(serialized.length / 4),
      },
    },
  }
}

export function withGuidance(
  value: unknown,
  guidance: { nextRecommendedAction?: string; nextRequiredAgentBehavior?: string },
) {
  const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return { ...payload, ...guidance }
}

export function contentHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

export const qualityDesignWorkflow = {
  phase: 'quality_design',
  ownership:
    'Appraise owns requirement snapshots, Quality Plan revisions, quality obligations, validation design, managed evidence, and quality decisions.',
  publicToolGroups: {
    requirements: [
      'requirements_submit_source',
      'requirements_analyze',
      'requirements_graph_read',
      'requirements_answer_queries',
      'requirements_approve',
    ],
    validationDesign: [
      'validation_design_propose',
      'validation_design_approve',
      'validation_compile',
      'validation_publish',
    ],
  },
}

export const assessmentWorkflow = {
  phase: 'assessment',
  subjectAuthority:
    'Evaluation subject authority is an immutable artifact or deployment snapshot digest. Commit, URL, build, and release labels are metadata.',
  evidenceSeal:
    'Evidence is sealed per validation version and result-matrix cell, bound to subject, runtime inputs, environment, outputs, and report hashes.',
  assurance: 'Required minimum assurance is separate from observed assurance.',
}

export const mcpCapabilityMetadata = {
  packageVersion: packageJson.version ?? '0.0.0',
  mcpSurfaceVersion: '2026-08-10.quality-first',
  serverStartedAt,
  workflowCriticalTools: [...workflowTools],
  workflowResourceUris: [...workflowResources],
}

export const compactMcpCapabilityMetadata = {
  packageVersion: mcpCapabilityMetadata.packageVersion,
  mcpSurfaceVersion: mcpCapabilityMetadata.mcpSurfaceVersion,
  serverStartedAt,
  workflowCriticalToolCount: workflowTools.length,
  workflowResourceCount: workflowResources.length,
  workflowSentinelTools: [
    'project_diagnostic',
    'requirements_submit_source',
    'validation_publish',
    'assessment_run',
    'assessment_decide',
  ],
  workflowSentinelResources: [
    'appraise://project',
    'appraise://workflow/quality-design',
    'appraise://workflow/assessment',
  ],
  fullCapabilityResource: 'appraise://project',
}

type AgentPreflightObservation = {
  observedTools?: string[]
  observedResources?: string[]
  expectedTargetWorkspacePath?: string
}

export async function canonicalExpectedTargetWorkspacePath(value: string | undefined): Promise<string | undefined> {
  const candidate = value?.trim()
  if (!candidate) return undefined
  try {
    return await realpath(path.resolve(candidate))
  } catch {
    return path.resolve(candidate)
  }
}

function observedCapabilityState(observed: string[] | undefined, expected: string[]) {
  if (!observed) return { status: 'unverified' as const, missing: [] as string[] }
  const visible = new Set(observed)
  const missing = expected.filter(capability => !visible.has(capability))
  return { status: missing.length === 0 ? ('ready' as const) : ('blocked' as const), missing }
}

export function buildAgentPreflight(
  diagnostic: Awaited<ReturnType<typeof diagnoseProject>>,
  observation: AgentPreflightObservation = {},
) {
  const tools = observedCapabilityState(observation.observedTools, compactMcpCapabilityMetadata.workflowSentinelTools)
  const resources = observedCapabilityState(
    observation.observedResources,
    compactMcpCapabilityMetadata.workflowSentinelResources,
  )
  const expectedPath = observation.expectedTargetWorkspacePath?.trim()
  const targetFound = expectedPath
    ? diagnostic.targetProjects.some(project =>
        Boolean(
          project &&
          typeof project === 'object' &&
          (project as { canonicalPath?: string }).canonicalPath === expectedPath,
        ),
      ) || diagnostic.hubProject.canonicalPath === expectedPath
    : true
  const blocked = tools.status === 'blocked' || resources.status === 'blocked' || !targetFound || !diagnostic.ok
  const unverified = tools.status === 'unverified' || resources.status === 'unverified'
  const status = blocked ? 'blocked' : unverified ? 'needs_observation' : 'ready'
  return {
    schemaVersion: 'appraise.agent-preflight/v1',
    status,
    ready: status === 'ready',
    layers: {
      applicationAndIdentity: { status: diagnostic.ok ? 'ready' : 'blocked' },
      activeMcpTransport: {
        status: 'ready',
        serverStartedAt,
        mcpSurfaceVersion: mcpCapabilityMetadata.mcpSurfaceVersion,
      },
      currentTaskCapabilities: { status: blocked ? 'blocked' : unverified ? 'unverified' : 'ready', tools, resources },
      targetProjectBinding: {
        status: expectedPath ? (targetFound ? 'ready' : 'blocked') : 'not_applicable',
        expectedCanonicalPath: expectedPath,
      },
    },
  }
}

export function compactAgentPreflight(preflight: ReturnType<typeof buildAgentPreflight>) {
  return preflight
}

export function compactProjectDiagnostic(diagnostic: Awaited<ReturnType<typeof diagnoseProject>>) {
  return {
    ok: diagnostic.ok,
    hubProject: { fingerprint: diagnostic.hubProject.fingerprint, canonicalPath: diagnostic.hubProject.canonicalPath },
    contractVersion: diagnostic.contractVersion,
    baseUrl: diagnostic.baseUrl,
    checks: diagnostic.checks.map(check => ({ id: check.id, status: check.status, code: check.code })),
    warnings: diagnostic.warnings,
    recoveryActions: diagnostic.recoveryActions,
    links: diagnostic.links,
    targetProjectCount: diagnostic.targetProjects.length,
  }
}

export function diagnosticGuidance(diagnostic: unknown, preflight?: { ready?: boolean }) {
  const ok = Boolean((diagnostic as { ok?: unknown } | undefined)?.ok)
  if (ok && preflight?.ready)
    return {
      nextRecommendedAction: 'Submit a requirement source for the selected target.',
      nextRequiredAgentBehavior: 'start_quality_design',
    }
  return {
    nextRecommendedAction: ok
      ? 'Register the intended target workspace or refresh the observed MCP capability inventory.'
      : 'Resolve diagnostics, then reconnect the MCP client and rerun project_diagnostic.',
    nextRequiredAgentBehavior: ok ? 'choose_explicit_target_before_quality_design' : 'recover_mcp_or_project_binding',
  }
}

export function projectPayload(api: Awaited<ReturnType<typeof createCoordinatorApiClient>>) {
  return {
    projectFingerprint: api.identity.projectFingerprint,
    canonicalProjectPath: api.project.canonicalProjectPath,
    capabilities: mcpCapabilityMetadata,
  }
}
