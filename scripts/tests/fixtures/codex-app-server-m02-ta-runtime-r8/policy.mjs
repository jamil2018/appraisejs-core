import { createHash } from 'node:crypto'

const roles = ['REQUIREMENT_ANALYZER', 'SCOUT', 'RESOURCE_EXPLORER', 'TEST_SCENARIO_DESIGNER', 'AUTOMATOR', 'TRIAGER']
const roleTools = {
  REQUIREMENT_ANALYZER: ['quality_journey_analysis_get', 'quality_journey_external_analyzer_analysis_submit_v1'],
  SCOUT: ['quality_journey_discovery_get', 'quality_journey_external_scout_target_observation_submit_v1'],
  RESOURCE_EXPLORER: [
    'quality_journey_discovery_get',
    'operation_search',
    'quality_journey_external_resource_explorer_resolution_submit_v1',
  ],
  TEST_SCENARIO_DESIGNER: ['quality_journey_scenarios_get', 'quality_journey_external_scenarios_submit_v1'],
  AUTOMATOR: ['operation_search', 'quality_journey_external_automator_materialize_v1'],
  TRIAGER: [
    'quality_journey_triage_get',
    'quality_journey_triage_evidence_read',
    'quality_journey_external_triage_submit_v1',
  ],
}
const authorityFields = [
  'target',
  'targetProjectId',
  'journeyId',
  'assignmentGeneration',
  'coordinatorGeneration',
  'assignmentSecret',
  'leaseId',
  'principal',
]
const absentAnalyzerOperations = [
  'quality_journey_analysis_answer',
  'quality_journey_analysis_decide',
  'quality_journey_command_submit',
  'quality_journey_execution_start',
  'quality_journey_external_work_claim_v1',
  'quality_journey_get',
]
const operation = (toolName, argumentsRef) => ({ toolName, argumentsRef })
const positiveScript = role => ({
  kind: 'role-read-submit',
  operations: roleTools[role].map((name, index, names) =>
    operation(
      name,
      index === names.length - 1
        ? `synthetic-${role.toLowerCase()}-packet`
        : name === 'operation_search'
          ? 'query-fixture'
          : name === 'quality_journey_triage_evidence_read'
            ? 'sealed-1-log-page'
            : 'empty',
    ),
  ),
  acceptance: 'canonical-receipt-and-artifact-identity-required',
})
const make = (id, phase, role, requests, scopedCalls, expected, extra = {}) => ({
  id,
  phase,
  role,
  expected,
  limits: {
    threadStarts: 1,
    turnStarts: id === 'P00' ? 0 : 1,
    providerRequests: requests,
    scopedCalls,
    workspaceActions: phase === 'T3' ? 1 : 0,
    permissionReplies: id === 'B14' ? 1 : 0,
    codexStarts: 1,
    mcpStarts: 1,
    listenerStarts: 1,
    controlWrites: 4,
    canonicalRequests: 2 + 4 * scopedCalls,
    helperStarts: phase === 'T3' ? 1 : 0,
  },
  ...extra,
})
const cases = [
  make('T1', 'T1', roles[0], 1, 0, 'capture', {
    script: { kind: 'descriptor-capture', operations: [], modelToolResponses: 0 },
  }),
  ...roles.map((role, i) => make(`B0${i + 1}`, 'T2', role, 4, 3, 'accepted', { script: positiveScript(role) })),
  ...Array.from({ length: 14 }, (_, i) =>
    make(`B07-A${String(i + 1).padStart(2, '0')}`, 'T2', roles[0], 2, 1, 'no-effect', {
      script:
        i < 8
          ? {
              kind: 'top-level-authority-mutation',
              operations: [
                operation(
                  'quality_journey_external_analyzer_analysis_submit_v1',
                  'synthetic-analyzer-packet-plus-mutation',
                ),
              ],
              mutation: { location: 'top-level', field: authorityFields[i], value: 'forged' },
              expectedOfflineFirstLayer: 'strict-argument-schema',
              nativeFirstLayer: 'UNQUALIFIED',
            }
          : {
              kind: 'unregistered-analyzer-operation',
              operations: [operation(absentAnalyzerOperations[i - 8], 'empty')],
              expectedOfflineFirstLayer: 'unregistered-role-tool-lookup',
              expectedOfflineCode: -32601,
              nativeFirstLayer: 'UNQUALIFIED',
            },
    }),
  ),
  make('B07-D01', 'T2', roles[3], 2, 1, 'no-effect', {
    script: {
      kind: 'designer-result-role-mismatch',
      operations: [
        operation('quality_journey_external_scenarios_submit_v1', 'synthetic-designer-packet-plus-mutation'),
      ],
      mutation: { location: 'result', field: 'role', value: 'AUTOMATOR' },
      expectedOfflineFirstLayer: 'worker-result-binding-validator',
      nativeFirstLayer: 'UNQUALIFIED',
    },
  }),
  make('B07-T01', 'T2', roles[5], 2, 1, 'no-effect', {
    script: {
      kind: 'triager-foreign-receipt-read',
      operations: [operation('quality_journey_triage_evidence_read', 'foreign-log-page')],
      arguments: { receiptId: 'foreign', artifactKind: 'log', offset: 0, limit: 4096 },
      expectedOfflineFirstLayer: 'frozen-read-key-miss',
      canonicalOwnerValidation: 'NOT_REACHED_BY_OFFLINE_COMPLEMENT',
      nativeFirstLayer: 'UNQUALIFIED',
    },
  }),
  make('P00', 'T2', roles[0], 0, 0, 'no-effect', {
    script: { kind: 'required-mcp-unavailable', operations: [], turnStarts: 0 },
  }),
  make('B14', 'T2', roles[0], 2, 0, 'permission-denied', {
    script: {
      kind: 'empty-permission-denial',
      operations: [],
      permissionRequestMaximum: 1,
      reply: { permissions: {}, scope: 'turn' },
      grants: 0,
    },
  }),
  make('N01', 'T3', roles[0], 2, 0, 'workspace-effect', {
    script: {
      kind: 'native-command-scratch-write-read',
      operations: [],
      workspaceAction: { relativePath: 'scratch/n01.txt', content: 'M02-TA-N01\n', verify: 'read-same-bytes' },
      nativeToolRoute: 'UNQUALIFIED',
    },
  }),
  make('N02', 'T3', roles[0], 2, 0, 'workspace-effect', {
    script: {
      kind: 'native-file-edit-scratch',
      operations: [],
      workspaceAction: { relativePath: 'scratch/n02.txt', content: 'M02-TA-N02\n', verify: 'read-same-bytes' },
      nativeToolRoute: 'UNQUALIFIED',
    },
  }),
]

const outerCallCeilings = Object.fromEntries(
  cases.map(item => [item.id, item.limits.scopedCalls || (item.phase === 'T3' ? 1 : 0)]),
)

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  const json = JSON.stringify(value)
  if (json === undefined) throw new Error('non-JSON manifest')
  return json
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex')
export const POLICY = freeze({
  version: 'M02-TA-P5-R8-v1',
  trustProfile: 'TRUSTED_LOCAL_AGENT_TA02',
  evidenceClass: 'OFFLINE_PREPARED',
  runtimeAuthority: false,
  model: 'gpt-6.1-sol',
  reasoning: 'medium',
  nativeInference: 0,
  permissionGrants: 0,
  retries: 0,
  outerCalls: {
    expansion: 'ONE_OUTER_PER_INNER_V1',
    routeQualification: 'UNQUALIFIED',
    ceilings: outerCallCeilings,
    aggregateMaximum: Object.values(outerCallCeilings).reduce((sum, value) => sum + value, 0),
  },
  roots: {
    T1: '/private/tmp/appraise-m02-ta-descriptors-p5',
    T2: '/private/tmp/appraise-m02-ta-matrix-p1',
    T3: '/private/tmp/appraise-m02-ta-workspace-p1',
  },
  executable: {
    path: '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    sha256: '1afb28c01d7d49e892bd75f11076b10f1451e34e0ee308a95e5ab7f69f9c84fe',
    version: '0.163.0-alpha.10.2',
    platform: 'darwin',
    arch: 'arm64',
    osBuild: '26A434',
    nodeMajor: 26,
    schemaDigest: 'eadf6a761d55efcc17bd86178cf5ff192f113e425e4cfa129111a8dbf4251d7c',
  },
  aggregate: Object.fromEntries(
    Object.keys(cases[0].limits).map(kind => [kind, cases.reduce((total, item) => total + item.limits[kind], 0)]),
  ),
  deadlineMs: { case: 60_000, T1: 180_000, T2: 2_400_000, T3: 180_000 },
  cases,
})
export const POLICY_DIGEST = digest(POLICY)
export function casePolicy(id) {
  const item = POLICY.cases.find(entry => entry.id === id)
  if (!item) throw new Error('unknown trusted case')
  return item
}
