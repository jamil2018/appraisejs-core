import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import mcpContractFixture from '../mcp-contract.fixture.json' with { type: 'json' }
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
const MCP_CONTRACT_SCHEMA_VERSION = 'appraise.mcp-contract/v1'

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

function canonicalContractJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalContractJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalContractJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * A capability observation must change when a caller-visible schema changes,
 * not merely when a tool is added or removed. The generated contract fixture
 * is the deterministic source shared by registry conformance and publishing.
 */
export function mcpContractHash(definitions: unknown): string {
  return `sha256:${createHash('sha256')
    .update(canonicalContractJson({ schemaVersion: MCP_CONTRACT_SCHEMA_VERSION, definitions }))
    .digest('hex')}`
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
    validationDesign: ['validation_design_propose', 'validation_design_approve'],
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
  mcpSurfaceVersion: '2026-08-21.assessment-preflight-cutover',
  mcpContractHash: mcpContractHash(mcpContractFixture.default),
  serverStartedAt,
  workflowCriticalTools: [...workflowTools],
  workflowResourceUris: [...workflowResources],
}

export const compactMcpCapabilityMetadata = {
  packageVersion: mcpCapabilityMetadata.packageVersion,
  mcpSurfaceVersion: mcpCapabilityMetadata.mcpSurfaceVersion,
  mcpContractHash: mcpCapabilityMetadata.mcpContractHash,
  serverStartedAt,
  workflowCriticalToolCount: workflowTools.length,
  workflowResourceCount: workflowResources.length,
  workflowSentinelTools: [
    'project_diagnostic',
    'requirements_submit_source',
    'locator_ensure',
    'locator_search',
    'assessment_preflight',
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
  observedMcpSurfaceVersion?: string
  observedMcpContractHash?: string
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

function observedContractState(observation: AgentPreflightObservation) {
  const observed = {
    ...(observation.observedMcpSurfaceVersion ? { mcpSurfaceVersion: observation.observedMcpSurfaceVersion } : {}),
    ...(observation.observedMcpContractHash ? { mcpContractHash: observation.observedMcpContractHash } : {}),
  }
  const expected = {
    mcpSurfaceVersion: mcpCapabilityMetadata.mcpSurfaceVersion,
    mcpContractHash: mcpCapabilityMetadata.mcpContractHash,
  }
  if (!observed.mcpSurfaceVersion && !observed.mcpContractHash)
    return { status: 'unverified' as const, expected, observed }
  const status =
    observed.mcpSurfaceVersion === expected.mcpSurfaceVersion && observed.mcpContractHash === expected.mcpContractHash
      ? ('ready' as const)
      : ('stale' as const)
  return { status, expected, observed }
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
  const contract = observedContractState(observation)
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
  const matchedScope = expectedPath
    ? diagnostic.hubProject.canonicalPath === expectedPath
      ? ('hub' as const)
      : targetFound
        ? ('target' as const)
        : undefined
    : undefined
  const blocked =
    tools.status === 'blocked' ||
    resources.status === 'blocked' ||
    contract.status === 'stale' ||
    !targetFound ||
    !diagnostic.ok
  const unverified =
    tools.status === 'unverified' || resources.status === 'unverified' || contract.status === 'unverified'
  const status = blocked ? 'blocked' : unverified ? 'needs_observation' : 'ready'
  return {
    schemaVersion: 'appraise.agent-preflight/v1',
    status,
    ready: status === 'ready',
    layers: {
      applicationAndIdentity: {
        status: diagnostic.ok ? 'ready' : 'blocked',
        checks: diagnostic.checks.map(check => ({
          id: check.id,
          status: check.status,
          ...(check.code ? { code: check.code } : {}),
        })),
      },
      activeMcpTransport: {
        status: 'ready',
        message: 'The MCP request reached this server.',
        serverStartedAt,
        mcpSurfaceVersion: mcpCapabilityMetadata.mcpSurfaceVersion,
        mcpContractHash: mcpCapabilityMetadata.mcpContractHash,
      },
      contractCompatibility: {
        status: contract.status,
        expected: contract.expected,
        observed: contract.observed,
        message:
          contract.status === 'ready'
            ? 'The observed MCP contract matches this canonical server contract.'
            : contract.status === 'stale'
              ? 'The current task is using a stale MCP contract. Reconnect before continuing.'
              : 'The current task did not report its observed MCP contract identity.',
        reconnect:
          contract.status === 'stale'
            ? {
                required: true,
                action: 'restart_or_reconnect_mcp_client',
                reason:
                  'MCP tool schemas and capabilities are captured by the client process and cannot refresh in place.',
              }
            : { required: false },
      },
      currentTaskCapabilities: {
        status:
          tools.status === 'blocked' || resources.status === 'blocked'
            ? 'blocked'
            : unverified
              ? 'unverified'
              : 'ready',
        tools,
        resources,
        message:
          tools.status === 'blocked' || resources.status === 'blocked'
            ? 'Required MCP sentinels are missing from the current task.'
            : unverified
              ? 'Current-task MCP capability visibility was not fully observed.'
              : 'All required MCP sentinels are visible.',
      },
      targetProjectBinding: {
        status: expectedPath ? (targetFound ? 'ready' : 'blocked') : 'not_applicable',
        expectedCanonicalPath: expectedPath,
        ...(matchedScope ? { matchedScope } : {}),
        message: expectedPath
          ? targetFound
            ? `The expected target is registered in ${matchedScope} scope.`
            : 'The expected target workspace is not registered.'
          : 'No target workspace was supplied for this diagnostic.',
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
    mcpContractNegotiation: diagnostic.mcpContractNegotiation,
    baseUrl: diagnostic.baseUrl,
    checks: diagnostic.checks.map(check => ({ id: check.id, status: check.status, code: check.code })),
    warnings: diagnostic.warnings,
    recoveryActions: diagnostic.recoveryActions,
    links: diagnostic.links,
    targetProjectCount: diagnostic.targetProjects.length,
  }
}

export function diagnosticGuidance(
  diagnostic: unknown,
  preflight?: { ready?: boolean; layers?: { contractCompatibility?: { status?: unknown } } },
) {
  const ok = Boolean((diagnostic as { ok?: unknown } | undefined)?.ok)
  const contract = preflight?.layers?.contractCompatibility
  if (contract?.status === 'stale')
    return {
      nextRecommendedAction:
        'Restart or reconnect the MCP client, then rerun project_diagnostic with a fresh capability observation.',
      nextRequiredAgentBehavior: 'reconnect_mcp_client',
    }
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
