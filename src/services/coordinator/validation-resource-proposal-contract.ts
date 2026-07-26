import { z } from 'zod'

const validationResourceProposalContractVersion = 2

const localKeyConstraints = {
  type: 'string',
  minLength: 1,
  maxLength: 80,
  pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
} as const
const textConstraints = { type: 'string', minLength: 1, maxLength: 500 } as const
const routeConstraints = { type: 'string', minLength: 1, maxLength: 500 } as const
const titleConstraints = { type: 'string', maxLength: 200, normalization: 'trim' } as const

const localKey = z
  .string()
  .min(localKeyConstraints.minLength)
  .max(localKeyConstraints.maxLength)
  .regex(new RegExp(localKeyConstraints.pattern))
const text = z.string().min(textConstraints.minLength).max(textConstraints.maxLength)
const route = z.string().min(routeConstraints.minLength).max(routeConstraints.maxLength)

const moduleSchema = z.object({ localKey, name: text, parentKey: localKey.optional() })
const locatorGroupSchema = z.object({ localKey, name: text, moduleKey: localKey, route })
const locatorSchema = z.object({ localKey, name: text, groupKey: localKey, selector: text })
const environmentSchema = z.object({
  localKey,
  name: text,
  baseUrl: z.string().url(),
  expectedPageTitle: z.string().max(titleConstraints.maxLength).trim().optional(),
  apiBaseUrl: z.string().url().optional(),
})

const validationResourceProposalRelationshipRules = [
  {
    id: 'unique-local-keys',
    appliesTo: ['modules', 'locatorGroups', 'locators', 'environments'],
    rule: 'Each localKey is unique within its collection.',
  },
  {
    id: 'module-parent-reference',
    appliesTo: ['modules[].parentKey'],
    rule: 'A supplied parentKey must reference modules[].localKey; declarations may appear in any order.',
  },
  {
    id: 'module-parent-acyclic',
    appliesTo: ['modules[].parentKey'],
    rule: 'Module parent relationships must form an acyclic graph.',
  },
  {
    id: 'locator-group-module-reference',
    appliesTo: ['locatorGroups[].moduleKey'],
    rule: 'Each moduleKey must reference modules[].localKey.',
  },
  {
    id: 'locator-group-reference',
    appliesTo: ['locators[].groupKey'],
    rule: 'Each groupKey must reference locatorGroups[].localKey.',
  },
] as const

export const validationResourceProposalSchema = z
  .object({
    schemaVersion: z.literal(validationResourceProposalContractVersion),
    idempotencyKey: localKey,
    modules: z.array(moduleSchema).max(50).default([]),
    locatorGroups: z.array(locatorGroupSchema).max(50).default([]),
    locators: z.array(locatorSchema).max(200).default([]),
    environments: z.array(environmentSchema).max(20).default([]),
  })
  .strict()
  .superRefine((proposal, context) => {
    for (const [field, values] of Object.entries(proposal).filter(([, value]) => Array.isArray(value)) as Array<
      [string, Array<{ localKey: string }>]
    >) {
      const duplicates = values.filter(
        (value, index) => values.findIndex(item => item.localKey === value.localKey) !== index,
      )
      if (duplicates.length)
        context.addIssue({ code: 'custom', path: [field], message: `Duplicate ${field} localKey.` })
    }
    const moduleKeys = new Set(proposal.modules.map(item => item.localKey))
    const groupKeys = new Set(proposal.locatorGroups.map(item => item.localKey))
    const moduleParents = new Map(proposal.modules.map(item => [item.localKey, item.parentKey]))
    proposal.modules.forEach((item, index) => {
      if (item.parentKey && !moduleKeys.has(item.parentKey))
        context.addIssue({
          code: 'custom',
          path: ['modules', index, 'parentKey'],
          message: 'Unknown module parentKey.',
        })
      const visited = new Set<string>()
      let cursor: string | undefined = item.localKey
      while (cursor) {
        if (visited.has(cursor)) {
          context.addIssue({
            code: 'custom',
            path: ['modules', index, 'parentKey'],
            message: 'Module parent relationships must be acyclic.',
          })
          break
        }
        visited.add(cursor)
        cursor = moduleParents.get(cursor)
      }
    })
    proposal.locatorGroups.forEach((item, index) => {
      if (!moduleKeys.has(item.moduleKey))
        context.addIssue({ code: 'custom', path: ['locatorGroups', index, 'moduleKey'], message: 'Unknown moduleKey.' })
    })
    proposal.locators.forEach((item, index) => {
      if (!groupKeys.has(item.groupKey))
        context.addIssue({ code: 'custom', path: ['locators', index, 'groupKey'], message: 'Unknown groupKey.' })
    })
  })

export type ValidationResourceProposal = z.infer<typeof validationResourceProposalSchema>

export const validationResourceProposalBindingsSchema = z.object({
  environments: z.array(
    z.object({
      localKey,
      id: z.string().min(1),
      reference: z.string().min(1),
      disposition: z.literal('reused_or_created'),
    }),
  ),
  locatorGroups: z.array(
    z.object({
      localKey,
      id: z.string().min(1),
      astRef: z.string().min(1),
      version: z.string().min(1),
      targetProjectId: z.string().min(1),
      moduleId: z.string().min(1),
      disposition: z.literal('reused_or_created'),
    }),
  ),
  locators: z.array(
    z.object({
      localKey,
      id: z.string().min(1),
      astRef: z.string().min(1),
      version: z.string().min(1),
      targetProjectId: z.string().min(1),
      moduleId: z.string().min(1),
      locatorGroupId: z.string().min(1),
      locatorGroupAstRef: z.string().min(1),
      disposition: z.literal('reused_or_created'),
    }),
  ),
})

export const validationResourceProposalExample = validationResourceProposalSchema.parse({
  schemaVersion: validationResourceProposalContractVersion,
  idempotencyKey: 'validation-resource-example',
  modules: [
    { localKey: 'application', name: 'Application' },
    { localKey: 'primary-flow', name: 'Primary flow', parentKey: 'application' },
  ],
  locatorGroups: [{ localKey: 'primary-page', name: 'Primary page', moduleKey: 'primary-flow', route: '/' }],
  locators: [
    {
      localKey: 'primary-control',
      name: 'Primary control',
      groupKey: 'primary-page',
      selector: '[data-testid="primary-control"]',
    },
  ],
  environments: [{ localKey: 'local', name: 'Local development', baseUrl: 'https://example.test' }],
})

export const validationResourceProposalBindingExample = validationResourceProposalBindingsSchema.parse({
  environments: [
    {
      localKey: 'local',
      id: 'environment-id',
      reference: 'environment-id',
      disposition: 'reused_or_created',
    },
  ],
  locatorGroups: [
    {
      localKey: 'primary-page',
      id: 'locator-group-id',
      astRef: 'group_locator-group-id',
      version: '1',
      targetProjectId: 'target-project-id',
      moduleId: 'module-id',
      disposition: 'reused_or_created',
    },
  ],
  locators: [
    {
      localKey: 'primary-control',
      id: 'locator-id',
      astRef: 'locator_locator-id',
      version: '1',
      targetProjectId: 'target-project-id',
      moduleId: 'module-id',
      locatorGroupId: 'locator-group-id',
      locatorGroupAstRef: 'group_locator-group-id',
      disposition: 'reused_or_created',
    },
  ],
})

export const validationResourceProposalContract = {
  contractId: 'appraise.validation/resource-proposal',
  version: validationResourceProposalContractVersion,
  request: {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'idempotencyKey'],
    properties: {
      schemaVersion: { const: validationResourceProposalContractVersion },
      idempotencyKey: localKeyConstraints,
      modules: {
        type: 'array',
        maxItems: 50,
        default: [],
        items: {
          type: 'object',
          required: ['localKey', 'name'],
          properties: { localKey: localKeyConstraints, name: textConstraints, parentKey: localKeyConstraints },
        },
      },
      locatorGroups: {
        type: 'array',
        maxItems: 50,
        default: [],
        items: {
          type: 'object',
          required: ['localKey', 'name', 'moduleKey', 'route'],
          properties: {
            localKey: localKeyConstraints,
            name: textConstraints,
            moduleKey: localKeyConstraints,
            route: routeConstraints,
          },
        },
      },
      locators: {
        type: 'array',
        maxItems: 200,
        default: [],
        items: {
          type: 'object',
          required: ['localKey', 'name', 'groupKey', 'selector'],
          properties: {
            localKey: localKeyConstraints,
            name: textConstraints,
            groupKey: localKeyConstraints,
            selector: textConstraints,
          },
        },
      },
      environments: {
        type: 'array',
        maxItems: 20,
        default: [],
        items: {
          type: 'object',
          required: ['localKey', 'name', 'baseUrl'],
          properties: {
            localKey: localKeyConstraints,
            name: textConstraints,
            baseUrl: { type: 'string', format: 'uri' },
            expectedPageTitle: titleConstraints,
            apiBaseUrl: { type: 'string', format: 'uri' },
          },
        },
      },
    },
  },
  relationshipRules: validationResourceProposalRelationshipRules,
  example: validationResourceProposalExample,
  responseBindingExample: validationResourceProposalBindingExample,
} as const
