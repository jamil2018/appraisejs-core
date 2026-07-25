import type { McpRegistryContext } from '../registry.js'
import {
  OPERATION_CATALOG_CONTRACT_VERSION,
  DELEGATED_AUTHORIZATION_VERSION,
  LOCATOR_GRAPH_CONTRACT_VERSION,
  ResourceTemplate,
  VALIDATION_AST_JSON_SCHEMA,
  VALIDATION_AST_SCHEMA_VERSION,
  agentGuide,
  planCandidateHash,
  planningWorkflow,
  projectPayload,
  providerNativeRunsEnabled,
  standbyWorkflow,
  validationPreparationWorkflow,
} from '../shared.js'

export function registerResourcesOperations(context: McpRegistryContext): void {
  const { server, api } = context
  const phase1Contracts = [
    {
      name: 'operation-catalog-contract',
      uri: 'appraise://contracts/operation-catalog',
      title: 'Unified operation catalog contract',
      value: {
        version: OPERATION_CATALOG_CONTRACT_VERSION,
        operations: ['categories', 'search', 'read'],
      },
    },
    {
      name: 'locator-graph-contract',
      uri: 'appraise://contracts/locator-graph',
      title: 'Surface and locator graph contract',
      value: { version: LOCATOR_GRAPH_CONTRACT_VERSION, boundedQueries: true, visualProjection: true },
    },
    {
      name: 'validation-ast-contract',
      uri: 'appraise://contracts/validation-ast',
      title: 'Agent-authored validation AST contract',
      value: {
        version: VALIDATION_AST_SCHEMA_VERSION,
        schemaHash: planCandidateHash(VALIDATION_AST_JSON_SCHEMA),
        schema: VALIDATION_AST_JSON_SCHEMA,
        phases: ['check', 'preview', 'compile'],
        resourceBinding: {
          locator: {
            astReference: 'astRef',
            acceptedAlias: 'id',
            fields: ['id', 'astRef', 'version', 'targetProjectId', 'moduleId', 'locatorGroupId'],
          },
          stepInvocation: {
            requiredFields: ['step.id', 'step.version', 'step.definitionHash', 'inputs', 'presentation'],
            source: 'ready-step-definition-registry',
          },
        },
      },
    },
    {
      name: 'delegated-authorization-contract',
      uri: 'appraise://contracts/delegated-authorization',
      title: 'Delegated authorization receipt contract',
      value: { version: DELEGATED_AUTHORIZATION_VERSION, replayProtection: 'durable-nonce' },
    },
  ] as const

  for (const contract of phase1Contracts) {
    server.registerResource(
      contract.name,
      contract.uri,
      { title: contract.title, mimeType: 'application/json' },
      async uri => ({
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(contract.value) }],
      }),
    )
  }

  server.registerResource(
    'project',
    'appraise://project',
    { title: 'AppraiseJS project identity', mimeType: 'application/json' },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(projectPayload(api)),
        },
      ],
    }),
  )

  server.registerResource(
    'target-projects',
    'appraise://target-projects',
    { title: 'Attached AppraiseJS target projects', mimeType: 'application/json' },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await api.listTargetProjects()),
        },
      ],
    }),
  )

  server.registerResource(
    'locator-graph-visual',
    'appraise://locator-graph/visual',
    { title: 'Human locator graph projection', mimeType: 'application/json' },
    async uri => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await api.readLocatorGraphVisual()) },
      ],
    }),
  )

  if (providerNativeRunsEnabled()) {
    server.registerResource(
      'provider-runs',
      'appraise://provider-runs',
      { title: 'AppraiseJS provider workflow runs', mimeType: 'application/json' },
      async uri => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(await api.listProviderRuns()),
          },
        ],
      }),
    )
    server.registerResource(
      'providers',
      'appraise://providers',
      { title: 'AppraiseJS coding agent providers', mimeType: 'application/json' },
      async uri => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(await api.listProviders()),
          },
        ],
      }),
    )
  }

  server.registerResource(
    'agent-guide',
    'appraise://agent-guide',
    { title: 'AppraiseJS agent workflow guide', mimeType: 'application/json' },
    async uri => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(agentGuide) }],
    }),
  )

  server.registerResource(
    'operation-catalog',
    'appraise://operations/catalog',
    { title: 'AppraiseJS unified operation catalog categories', mimeType: 'application/json' },
    async uri => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await api.listOperationCategories()) },
      ],
    }),
  )

  server.registerResource(
    'workflow-planning',
    'appraise://workflow/planning',
    { title: 'AppraiseJS planning workflow', mimeType: 'application/json' },
    async uri => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(planningWorkflow) }],
    }),
  )

  server.registerResource(
    'workflow-validation-preparation',
    'appraise://workflow/validation-preparation',
    { title: 'AppraiseJS validation preparation workflow and artifact contract', mimeType: 'application/json' },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(validationPreparationWorkflow),
        },
      ],
    }),
  )

  server.registerResource(
    'workflow-standby',
    'appraise://workflow/standby',
    { title: 'AppraiseJS standby workflow', mimeType: 'application/json' },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(standbyWorkflow),
        },
      ],
    }),
  )

  server.registerResource(
    'plan',
    new ResourceTemplate('appraise://plans/{planId}', { list: undefined }),
    { title: 'AppraiseJS plan', mimeType: 'application/json' },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await api.request(`plans/${String(variables.planId)}`)),
        },
      ],
    }),
  )

  server.registerResource(
    'validation-context',
    new ResourceTemplate('appraise://plans/{planId}/validation-context', { list: undefined }),
    { title: 'AppraiseJS validation context', mimeType: 'application/json' },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await api.request(`plans/${String(variables.planId)}/validations/context`)),
        },
      ],
    }),
  )

  server.registerResource(
    'validation-draft',
    new ResourceTemplate('appraise://plans/{planId}/validation-draft', { list: undefined }),
    { title: 'AppraiseJS validation draft', mimeType: 'application/json' },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await api.request(`plans/${String(variables.planId)}/validations/draft/context`)),
        },
      ],
    }),
  )
}
