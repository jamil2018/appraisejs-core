import type { McpRegistryContext } from '../registry.js'
import {
  LOCATOR_GRAPH_CONTRACT_VERSION,
  OPERATION_CATALOG_CONTRACT_VERSION,
  VALIDATION_AST_JSON_SCHEMA,
  VALIDATION_AST_SCHEMA_VERSION,
  assessmentWorkflow,
  contentHash,
  projectPayload,
  qualityDesignWorkflow,
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
        schemaHash: contentHash(VALIDATION_AST_JSON_SCHEMA),
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
    'workflow-quality-design',
    'appraise://workflow/quality-design',
    { title: 'AppraiseJS Quality Design workflow', mimeType: 'application/json' },
    async uri => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(qualityDesignWorkflow) }],
    }),
  )

  server.registerResource(
    'workflow-assessment',
    'appraise://workflow/assessment',
    { title: 'AppraiseJS assessment workflow', mimeType: 'application/json' },
    async uri => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(assessmentWorkflow) }],
    }),
  )

  server.registerResource(
    'quality-methodology',
    'appraise://quality/methodologies/appraise.built-in/quality-os-core/1.0.0',
    { title: 'Appraise Quality OS core methodology', mimeType: 'application/json' },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({
            providerId: 'appraise.built-in',
            methodologyId: 'quality-os-core',
            version: '1.0.0',
            instructions: [
              'Separate supplied facts, agent inferences, assumptions, and unresolved queries.',
              'Derive risk- and assurance-linked obligations before proposing validation scenarios.',
              'Use falsifiable observations and state what each failure would mean.',
              'Treat failed execution as an observation until Appraise records an attributed finding.',
            ],
          }),
        },
      ],
    }),
  )
}
