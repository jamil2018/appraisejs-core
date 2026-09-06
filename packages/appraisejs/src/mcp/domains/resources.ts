import type { McpRegistryContext } from '../registry.js'
import { LOCATOR_GRAPH_CONTRACT_VERSION, OPERATION_CATALOG_CONTRACT_VERSION, projectPayload } from '../shared.js'

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
      value: {
        version: LOCATOR_GRAPH_CONTRACT_VERSION,
        boundedQueries: true,
        visualProjection: true,
        locatorSearch: {
          id: 'persistent-locator-id',
          presentationId: 'locator_<persistent-locator-id>',
          group: { id: 'persistent-locator-group-id', presentationId: 'group_<persistent-locator-group-id>' },
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
}
