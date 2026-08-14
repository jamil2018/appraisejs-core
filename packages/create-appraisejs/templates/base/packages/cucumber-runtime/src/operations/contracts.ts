import { createHash } from 'node:crypto'
import { z } from 'zod'

export const OPERATION_CONTRACT_VERSION = '1' as const
export const operationIdSchema = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/)
export const operationVersionSchema = z.string().regex(/^\d+(?:\.\d+){0,2}$/)
export const operationHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const identifierSchema = z.string().regex(/^[a-z][a-zA-Z0-9-]*$/)

export function canonicalOperationJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalOperationJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalOperationJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function operationContentHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalOperationJson(value)).digest('hex')}`
}

const operationValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(16_384),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(operationValueSchema).max(100),
    z.record(z.string().max(128), operationValueSchema),
  ]),
)

function validateBoundedValue(value: unknown, context: z.RefinementCtx) {
  const visit = (candidate: unknown, depth: number, nodes: { count: number }) => {
    nodes.count += 1
    if (nodes.count > 1_000) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Operation value exceeds 1,000 nodes.' })
      return
    }
    if (depth > 10) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Operation value exceeds depth 10.' })
      return
    }
    if (Array.isArray(candidate)) candidate.forEach(item => visit(item, depth + 1, nodes))
    else if (candidate && typeof candidate === 'object')
      Object.values(candidate as Record<string, unknown>).forEach(item => visit(item, depth + 1, nodes))
  }
  visit(value, 0, { count: 0 })
}

export const boundedOperationValueSchema = operationValueSchema.superRefine(validateBoundedValue)

export const operationInputSchema = z.object({
  name: identifierSchema,
  type: z.enum([
    'string',
    'number',
    'boolean',
    'json',
    'locator',
    'environment-ref',
    'stored-value-ref',
    'artifact-ref',
    'reviewed-extension-ref',
  ]),
  required: z.boolean(),
  description: z.string().min(1).max(1_000),
  defaultValue: boundedOperationValueSchema.optional(),
  constraints: z.record(z.string(), boundedOperationValueSchema).optional(),
  cardinality: z.enum(['exactlyOne', 'collection']).optional(),
})

export const operationOutputSchema = z.object({
  name: identifierSchema,
  type: z.enum(['string', 'number', 'boolean', 'json', 'locator', 'artifact', 'page', 'download']),
  description: z.string().min(1).max(1_000),
})

export const humanOperationProjectionSchema = z.object({
  id: operationIdSchema,
  signature: z.string().min(1).max(2_000),
  title: z.string().min(1).max(200),
  description: z.string().max(1_000).optional(),
  group: z.string().min(1).max(200),
  icon: z.string().min(1).max(100),
  parameterOrder: z.array(identifierSchema).max(30),
  constants: z.record(identifierSchema, boundedOperationValueSchema).default({}),
  deprecated: z.boolean().default(false),
})

export const agentOperationProjectionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1_000),
  searchTerms: z.array(z.string().min(1).max(100)).max(40),
  examples: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        inputs: z.record(identifierSchema, boundedOperationValueSchema),
      }),
    )
    .max(12),
})

export const operationAliasSchema = z.object({
  kind: z.enum(['action-id', 'step-definition-slug', 'cucumber-signature', 'deprecated-operation-id']),
  value: z.string().min(1).max(2_000),
  surface: z.enum(['human', 'agent', 'both']),
})

export const operationSurfaceStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('supported') }),
  z.object({ status: z.literal('exception'), reason: z.string().min(1).max(1_000), approvedBy: z.string().min(1) }),
])

export const operationDefinitionSchema = z
  .object({
    id: operationIdSchema,
    version: operationVersionSchema,
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2_000),
    categories: z.array(operationIdSchema).min(1).max(20),
    capabilities: z.array(operationIdSchema).max(30),
    runtime: z.enum(['browser', 'api', 'node', 'database']),
    inputs: z.array(operationInputSchema).max(30),
    outputs: z.array(operationOutputSchema).max(20),
    assertionConcerns: z.array(z.enum(['accessibility', 'persistence', 'responsive'])).max(10),
    evidenceSemantics: z.string().min(1).max(1_000).optional(),
    securityClass: z.enum(['built-in', 'bounded-structured', 'reviewed-extension']),
    handler: z.object({ id: operationIdSchema, version: operationVersionSchema, contentHash: operationHashSchema }),
    humanProjections: z.array(humanOperationProjectionSchema).max(20),
    humanSurface: operationSurfaceStateSchema,
    agentProjection: agentOperationProjectionSchema.optional(),
    agentSurface: operationSurfaceStateSchema,
    aliases: z.array(operationAliasSchema).max(50),
    deprecated: z.boolean(),
    replacement: z.object({ id: operationIdSchema, version: operationVersionSchema }).optional(),
  })
  .superRefine((definition, context) => {
    for (const [label, names] of [
      ['input', definition.inputs.map(item => item.name)],
      ['output', definition.outputs.map(item => item.name)],
      ['human projection', definition.humanProjections.map(item => item.id)],
    ] as const) {
      if (new Set(names).size !== names.length)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate ${label} in ${definition.id}@${definition.version}.`,
        })
    }
    const inputNames = new Set(definition.inputs.map(item => item.name))
    for (const input of definition.inputs) {
      if (input.type === 'locator' && !input.cardinality)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Locator input ${input.name} in ${definition.id}@${definition.version} requires cardinality.`,
        })
      if (input.type !== 'locator' && input.cardinality)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Only locator input ${input.name} in ${definition.id}@${definition.version} may declare cardinality.`,
        })
    }
    for (const projection of definition.humanProjections) {
      const projected = [...projection.parameterOrder, ...Object.keys(projection.constants)]
      const unknown = projected.find(name => !inputNames.has(name))
      if (unknown)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Human projection ${projection.id} maps unknown input ${unknown}.`,
        })
    }
    if (definition.humanSurface.status === 'supported' && definition.humanProjections.length === 0)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Supported human surface requires a projection.' })
    if (definition.agentSurface.status === 'supported' && !definition.agentProjection)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Supported agent surface requires a projection.' })
    if (definition.deprecated && !definition.replacement)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Deprecated operations require a replacement.' })
  })

export const operationDescriptorSchema = operationDefinitionSchema.and(
  z.object({ descriptorHash: operationHashSchema }),
)

export const operationReferenceSchema = z.object({
  id: operationIdSchema,
  version: operationVersionSchema,
  descriptorHash: operationHashSchema,
})

export const operationInvocationSchema = z
  .object({
    operation: operationReferenceSchema,
    inputs: z.record(identifierSchema, boundedOperationValueSchema),
    store: z.object({ output: identifierSchema, as: identifierSchema }).optional(),
    presentation: z
      .object({
        keyword: z.enum(['Given', 'When', 'Then', 'And']),
        description: z.string().min(1).max(2_000),
        humanProjectionId: operationIdSchema.optional(),
      })
      .optional(),
  })
  .strict()

export type OperationDefinition = z.infer<typeof operationDefinitionSchema>
export type OperationDescriptor = z.infer<typeof operationDescriptorSchema>
export type OperationInvocation = z.infer<typeof operationInvocationSchema>
