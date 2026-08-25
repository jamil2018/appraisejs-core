import type { McpRegistryContext } from '../registry.js'
import { text, withGuidance, z } from '../shared.js'

const nullableOptionalString = () => z.preprocess(value => (value === null ? undefined : value), z.string().optional())
const nullableOptionalPositiveInteger = (maximum: number) =>
  z.preprocess(value => (value === null ? undefined : value), z.number().int().positive().max(maximum).optional())

const operationSearchInputSchema = z
  .object({
    query: nullableOptionalString().pipe(z.string().trim().min(1).max(500).optional()),
    parameterNames: z.array(z.string().min(1)).max(32).optional(),
    category: nullableOptionalString(),
    capability: nullableOptionalString(),
    inputType: nullableOptionalString(),
    runtime: z.preprocess(
      value => (value === null ? undefined : value),
      z.enum(['browser', 'api', 'node', 'database']).optional(),
    ),
    surface: z.preprocess(value => (value === null ? undefined : value), z.enum(['human', 'agent']).optional()),
    deprecated: z.preprocess(value => (value === null ? undefined : value), z.boolean().optional()),
    limit: nullableOptionalPositiveInteger(100),
  })
  .superRefine((value, context) => {
    if (
      !value.query &&
      !value.parameterNames?.length &&
      !value.category &&
      !value.capability &&
      !value.inputType &&
      !value.runtime &&
      !value.surface &&
      value.deprecated === undefined
    )
      context.addIssue({
        code: 'custom',
        path: ['query'],
        message: 'Provide a query or at least one operation filter.',
      })
  })

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
      description:
        'Query a bounded locator graph path within the target bound to a Quality Plan. fromId is required; omitted optional filters are normalized to absent.',
      inputSchema: {
        target: z.string().min(1),
        qualityPlanId: z.string().min(1),
        fromId: z.string().min(1),
        relation: nullableOptionalString(),
        toType: nullableOptionalString(),
        cursor: nullableOptionalString(),
        limit: nullableOptionalPositiveInteger(100),
        depth: nullableOptionalPositiveInteger(4),
      },
    },
    async input => text(await api.queryLocatorGraph(input)),
  )

  server.registerTool(
    'locator_ensure',
    {
      description:
        'Idempotently ensure one target-owned locator closure for a Quality Plan without browser interaction or credentials.',
      inputSchema: {
        target: z.string().min(1),
        qualityPlanId: z.string().min(1),
        allowCreate: z.boolean().optional(),
        group: z.discriminatedUnion('mode', [
          z.object({ mode: z.literal('existing'), id: z.string().min(1) }),
          z.object({
            mode: z.literal('ensure'),
            name: z.string().min(1).max(200),
            route: z.string().startsWith('/').max(2_000),
            module: z.discriminatedUnion('mode', [
              z.object({ mode: z.literal('existing'), id: z.string().min(1) }),
              z.object({ mode: z.literal('ensure'), name: z.string().min(1).max(200) }),
            ]),
          }),
        ]),
        locator: z.object({ name: z.string().min(1).max(200), selector: z.string().min(1).max(10_000) }),
      },
    },
    async body => text(await api.request('locators/ensure', { method: 'POST', body: JSON.stringify(body) })),
  )

  server.registerTool(
    'project_add',
    {
      description:
        'Register either one local application workspace or one remote HTTP(S) black-box target. Local registration may initialize Git and write a non-blocking continuity marker; remote registration creates its initial environment without workspace access.',
      inputSchema: {
        path: z.string().min(1).optional(),
        url: z.string().url().optional(),
        displayName: z.string().min(1).optional(),
        initializeGit: z.boolean().optional(),
      },
    },
    async ({ path, url, displayName, initializeGit }) => {
      if (Boolean(path) === Boolean(url)) throw new Error('Provide exactly one of path or url.')
      if (url && initializeGit) throw new Error('Git initialization is available only for local workspace targets.')
      return text(
        withGuidance(
          await api.addTargetProject(
            path
              ? { path, ...(displayName ? { displayName } : {}), ...(initializeGit ? { initializeGit: true } : {}) }
              : { url: url!, ...(displayName ? { displayName } : {}) },
          ),
          { nextRecommendedAction: 'Submit an immutable requirement source for the returned target identity.' },
        ),
      )
    },
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
      description:
        'Search ready Step Definitions by one actionable versioned identity. Results are paginated; limit defaults to 5 and cannot exceed 25.',
      inputSchema: {
        query: z.string().min(1),
        parameterNames: z.array(z.string().min(1)).default([]),
        limit: z.number().int().positive().max(25).default(5),
        cursor: z.string().regex(/^\d+$/).optional(),
      },
    },
    async ({ query, parameterNames, limit, cursor }) =>
      text(
        await api.request(
          `step-definitions/search?query=${encodeURIComponent(query)}&parameterNames=${encodeURIComponent(parameterNames.join(','))}&limit=${limit}&surface=agent${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        ),
      ),
  )

  server.registerTool(
    'locator_search',
    {
      description:
        'Search target- and Quality Plan-scoped locators before validation design. Result id is the bindable persistent locator ID; presentationId is graph-only for locator_graph_query.',
      inputSchema: {
        target: z.string().min(1),
        qualityPlanId: z.string().min(1),
        query: z.string().min(1),
        cursor: z.string().regex(/^\d+$/).optional(),
        limit: z.number().int().positive().max(100).default(25),
      },
    },
    async ({ target, qualityPlanId, query, cursor, limit }) =>
      text(
        await api.request(
          `quality/plans/${encodeURIComponent(qualityPlanId)}/locators?target=${encodeURIComponent(target)}&query=${encodeURIComponent(query)}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
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
      description:
        'Search the bounded canonical operation catalog with paired human Step naming. Provide a query or at least one filter.',
      inputSchema: operationSearchInputSchema.shape,
    },
    async input => text(await api.searchOperations(operationSearchInputSchema.parse(input))),
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
