import type { McpRegistryContext } from '../registry.js'
import { text, withGuidance, z } from '../shared.js'

/** Target and bounded discovery operations available to quality workflows. */
export function registerProjectOperations(context: McpRegistryContext): void {
  const { server, api } = context

  server.registerTool(
    'environment_list',
    {
      description:
        'List bounded target-scoped environment summaries; a current registry hash returns an unchanged receipt.',
      inputSchema: { target: z.string().min(1), knownRegistryHash: z.string().optional() },
    },
    async ({ target, knownRegistryHash }) => {
      const query = new URLSearchParams({ target })
      if (knownRegistryHash) query.set('knownRegistryHash', knownRegistryHash)
      return text(await api.request(`environments?${query}`))
    },
  )

  server.registerTool(
    'environment_ensure',
    {
      description:
        'Resolve an exact target environment or explicitly create an immutable proposal with allowCreate: true.',
      inputSchema: {
        target: z.string().min(1),
        environmentId: z.string().min(1).optional(),
        allowCreate: z.boolean().optional(),
        proposal: z
          .object({
            name: z.string().min(1),
            baseUrl: z.string().url(),
            expectedPageTitle: z.string().max(200).optional(),
            apiBaseUrl: z.string().url().optional(),
            username: z.string().optional(),
            passwordEnvironmentVariable: z
              .string()
              .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
              .optional(),
          })
          .optional(),
      },
    },
    async body => text(await api.request('environments/ensure', { method: 'POST', body: JSON.stringify(body) })),
  )

  server.registerTool(
    'locator_graph_query',
    {
      description: 'Query a bounded locator graph path from a surface, group, or locator node.',
      inputSchema: {
        fromId: z.string().min(1),
        relation: z.string().optional(),
        toType: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
        depth: z.number().int().positive().max(4).optional(),
      },
    },
    async input => text(await api.queryLocatorGraph(input)),
  )

  server.registerTool(
    'project_add',
    {
      description:
        'Attach an application workspace as a target project, optionally initialize Git when the workspace is empty, and write a non-blocking .appraisejs/project.json continuity marker when writable.',
      inputSchema: {
        path: z.string().min(1),
        displayName: z.string().min(1).optional(),
        initializeGit: z.boolean().optional(),
      },
    },
    async ({ path, displayName, initializeGit }) =>
      text(
        withGuidance(await api.addTargetProject(path, displayName, initializeGit), {
          nextRecommendedAction: 'Submit an immutable requirement source for the returned target identity.',
        }),
      ),
  )

  server.registerTool(
    'project_list',
    {
      description: 'List application repositories attached to the local AppraiseJS hub.',
      inputSchema: {},
    },
    async () => text(await api.listTargetProjects()),
  )

  server.registerTool(
    'step_search',
    {
      description: 'Search ready Step Definitions by one actionable versioned identity.',
      inputSchema: {
        query: z.string().min(1),
        parameterNames: z.array(z.string().min(1)).default([]),
        limit: z.number().int().positive().max(25).default(5),
      },
    },
    async ({ query, parameterNames, limit }) =>
      text(
        await api.request(
          `step-definitions/search?query=${encodeURIComponent(query)}&parameterNames=${encodeURIComponent(parameterNames.join(','))}&limit=${limit}&surface=agent`,
        ),
      ),
  )

  server.registerTool(
    'locator_search',
    {
      description: 'Search live locators for a Quality Plan before validation design.',
      inputSchema: { qualityPlanId: z.string().min(1), query: z.string().min(1) },
    },
    async ({ qualityPlanId, query }) =>
      text(
        await api.request(
          `quality/plans/${encodeURIComponent(qualityPlanId)}/locators?query=${encodeURIComponent(query)}&limit=25`,
        ),
      ),
  )

  server.registerTool(
    'operation_categories',
    {
      description: 'List bounded canonical operation categories; known manifest hashes return unchanged.',
      inputSchema: { knownManifestHash: z.string().optional() },
    },
    async input => text(await api.listOperationCategories(input.knownManifestHash)),
  )

  server.registerTool(
    'operation_search',
    {
      description: 'Search the canonical operation catalog with paired human Step naming.',
      inputSchema: {
        query: z.string().min(1).max(500),
        parameterNames: z.array(z.string().min(1)).max(32).optional(),
        category: z.string().optional(),
        capability: z.string().optional(),
        inputType: z.string().optional(),
        runtime: z.enum(['browser', 'api', 'node', 'database']).optional(),
        surface: z.enum(['human', 'agent']).optional(),
        deprecated: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async input => text(await api.searchOperations(input)),
  )

  server.registerTool(
    'operation_read',
    {
      description: 'Read exact canonical operation descriptors and handler identities for selected references.',
      inputSchema: {
        operationRefs: z
          .array(z.object({ id: z.string(), version: z.string().optional() }))
          .min(1)
          .max(50),
      },
    },
    async ({ operationRefs }) => text(await api.readOperations(operationRefs)),
  )
}
