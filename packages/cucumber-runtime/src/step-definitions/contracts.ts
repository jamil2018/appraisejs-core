import { createHash } from 'node:crypto'
import { z } from 'zod'

import { boundedOperationValueSchema, canonicalOperationJson } from '../operations/contracts.ts'

export const STEP_DEFINITION_SCHEMA_VERSION = '1' as const

export const stepDefinitionIdSchema = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/)
export const stepDefinitionVersionSchema = z.string().regex(/^\d+(?:\.\d+){0,2}$/)
export const stepDefinitionHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const identifierSchema = z.string().regex(/^[a-z][a-zA-Z0-9-]*$/)
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum)

export function canonicalStepDefinitionJson(value: unknown): string {
  return canonicalOperationJson(value)
}

export function stepDefinitionContentHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalStepDefinitionJson(value)).digest('hex')}`
}

export const stepIdentitySchema = z.object({
  id: stepDefinitionIdSchema,
  version: stepDefinitionVersionSchema,
})

export const stepReferenceSchema = stepIdentitySchema.extend({ definitionHash: stepDefinitionHashSchema })

export const stepValueSchema = boundedOperationValueSchema

export type StepValue = string | number | boolean | null | StepValue[] | { [key: string]: StepValue }

export type StepInputSelector = { input: string } | { output: string }
export type StepInputExpression = StepValue | StepInputSelector

export const stepInputDefinitionSchema = z.object({
  name: identifierSchema,
  label: boundedText(200),
  description: boundedText(1_000),
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
  defaultValue: stepValueSchema.optional(),
  examples: z.array(stepValueSchema).max(20),
  aliases: z.array(identifierSchema).max(20),
  constraints: z
    .object({
      minimum: z.number().finite().optional(),
      maximum: z.number().finite().optional(),
      pattern: z.string().max(500).optional(),
      values: z.array(stepValueSchema).max(100).optional(),
    })
    .optional(),
})

export const stepOutputDefinitionSchema = z.object({
  name: identifierSchema,
  description: boundedText(1_000),
  type: stepInputDefinitionSchema.shape.type,
  storable: z.boolean(),
})

function isSelectorShaped(value: unknown) {
  return !!value && typeof value === 'object' && (Object.hasOwn(value, 'input') || Object.hasOwn(value, 'output'))
}

export const stepInputExpressionSchema: z.ZodType<StepInputExpression> = z.union([
  z.object({ input: identifierSchema }).strict(),
  z.object({ output: identifierSchema }).strict(),
  stepValueSchema.refine(value => !isSelectorShaped(value), {
    message: 'Selector-shaped composition input expressions must be exact input or output selectors.',
  }),
]) as z.ZodType<StepInputExpression>

export const stepExecutionBindingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('operation'),
    handlerId: stepDefinitionIdSchema,
    handlerVersion: stepDefinitionVersionSchema,
    runtime: z.enum(['browser', 'api', 'node', 'database']),
  }),
  z.object({
    kind: z.literal('composition'),
    steps: z
      .array(z.object({ step: stepReferenceSchema, inputs: z.record(identifierSchema, stepInputExpressionSchema) }))
      .min(1)
      .max(100),
  }),
  z.object({
    kind: z.literal('reviewed-extension'),
    extensionId: stepDefinitionIdSchema,
    extensionVersion: stepDefinitionVersionSchema,
    exportName: identifierSchema,
    sourceHash: stepDefinitionHashSchema,
    compiledHash: stepDefinitionHashSchema,
    runtime: z.enum(['browser', 'api', 'node', 'database']),
  }),
  z.object({ kind: z.literal('unbound') }),
])

export const stepDefinitionSchema = z
  .object({
    schemaVersion: z.literal(STEP_DEFINITION_SCHEMA_VERSION),
    identity: stepIdentitySchema.extend({ status: z.enum(['draft', 'ready', 'deprecated']) }),
    provenance: z.object({
      creationMethod: z.enum(['built-in-source', 'human-form', 'agent-command', 'migration']),
      createdBy: boundedText(200),
      createdAt: z.string().datetime(),
      reviewedBy: boundedText(200).optional(),
      sourceReference: z.string().max(2_000).optional(),
    }),
    intent: z.object({
      title: boundedText(200),
      description: boundedText(2_000),
      capabilities: z.array(stepDefinitionIdSchema).min(1).max(30),
      searchTerms: z.array(boundedText(100)).max(40),
      examples: z.array(boundedText(1_000)).min(1).max(20),
    }),
    inputs: z.array(stepInputDefinitionSchema).max(30),
    outputs: z.array(stepOutputDefinitionSchema).max(20),
    human: z.object({
      signature: z.string().min(1).max(2_000),
      keywordCompatibility: z
        .array(z.enum(['Given', 'When', 'Then', 'And']))
        .min(1)
        .max(4),
      parameterBindings: z.array(z.object({ placeholder: identifierSchema, input: identifierSchema })).max(30),
      groupId: boundedText(200),
    }),
    agent: z.object({
      summary: boundedText(1_000),
      usageGuidance: boundedText(2_000),
      examples: z
        .array(z.object({ intent: boundedText(500), inputs: z.record(identifierSchema, stepValueSchema) }))
        .min(1)
        .max(20),
    }),
    execution: stepExecutionBindingSchema,
    lifecycle: z.object({
      supersedes: stepIdentitySchema.optional(),
      deprecatedReason: boundedText(1_000).optional(),
      replacement: stepIdentitySchema.optional(),
    }),
  })
  .strict()
  .superRefine((definition, context) => {
    const inputNames = definition.inputs.map(input => input.name)
    const outputNames = definition.outputs.map(output => output.name)
    const aliases = definition.inputs.flatMap(input => input.aliases.map(alias => `${input.name}:${alias}`))
    if (new Set(inputNames).size !== inputNames.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Step input names must be unique.' })
    if (new Set(outputNames).size !== outputNames.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Step output names must be unique.' })
    const allAliases = aliases.map(value => value.slice(value.indexOf(':') + 1))
    if (new Set([...inputNames, ...allAliases]).size !== inputNames.length + allAliases.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Input names and aliases must not overlap.' })

    const boundInputs = new Set(definition.human.parameterBindings.map(binding => binding.input))
    const unknownBinding = [...boundInputs].find(input => !inputNames.includes(input))
    if (unknownBinding)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Human projection binds unknown input ${unknownBinding}.`,
      })
    if (
      new Set(definition.human.parameterBindings.map(binding => binding.placeholder)).size !==
      definition.human.parameterBindings.length
    )
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Human placeholders must bind exactly once.' })

    const signaturePlaceholders = [...definition.human.signature.matchAll(/\{([^}]+)\}/g)].map(match => match[1]!)
    const bindingPlaceholders = definition.human.parameterBindings.map(binding => binding.placeholder)
    const usesNamedPlaceholders = signaturePlaceholders.every(placeholder => bindingPlaceholders.includes(placeholder))
    if (
      signaturePlaceholders.length !== bindingPlaceholders.length ||
      (usesNamedPlaceholders && new Set(signaturePlaceholders).size !== signaturePlaceholders.length)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Every human signature placeholder must have exactly one stable parameter binding.',
      })

    const valueMatchesType = (value: unknown, type: z.infer<typeof stepInputDefinitionSchema>['type']) => {
      if (type === 'json') return true
      if (type === 'number') return typeof value === 'number'
      if (type === 'boolean') return typeof value === 'boolean'
      return typeof value === 'string'
    }
    for (const input of definition.inputs) {
      if (input.defaultValue !== undefined && !valueMatchesType(input.defaultValue, input.type))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Default value for ${input.name} has the wrong type.`,
        })
      if (input.examples.some(example => !valueMatchesType(example, input.type)))
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Example for ${input.name} has the wrong type.` })
      if (
        input.constraints?.minimum !== undefined &&
        input.constraints.maximum !== undefined &&
        input.constraints.minimum > input.constraints.maximum
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Constraints for ${input.name} have an invalid range.`,
        })
      if (input.constraints?.pattern)
        try {
          new RegExp(input.constraints.pattern)
        } catch {
          context.addIssue({ code: z.ZodIssueCode.custom, message: `Pattern for ${input.name} is invalid.` })
        }
    }

    for (const example of definition.agent.examples) {
      const provided = Object.keys(example.inputs)
      const unknown = provided.find(input => !inputNames.includes(input))
      const missing = definition.inputs.find(
        input => input.required && input.defaultValue === undefined && !provided.includes(input.name),
      )
      if (unknown)
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Agent example provides unknown input ${unknown}.` })
      if (missing)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Agent example is missing required input ${missing.name}.`,
        })
    }

    if (definition.identity.status !== 'draft' && definition.execution.kind === 'unbound')
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ready and deprecated definitions require an execution binding.',
      })
    if (definition.identity.status === 'ready' && !definition.provenance.reviewedBy)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Ready definitions require review authority.' })
    if (definition.identity.status === 'deprecated' && !definition.lifecycle.deprecatedReason)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Deprecated definitions require a reason.' })
  })

export const stepDefinitionDraftSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  definition: z.unknown(),
})

export const stepDefinitionDraftAuthoringSchema = z
  .object({
    schemaVersion: z.literal(STEP_DEFINITION_SCHEMA_VERSION),
    identity: stepIdentitySchema.extend({ status: z.literal('draft') }),
    provenance: z
      .object({
        creationMethod: z.enum(['built-in-source', 'human-form', 'agent-command', 'migration']),
        createdBy: boundedText(200),
        createdAt: z.string().datetime(),
      })
      .passthrough(),
  })
  .passthrough()

export const stepInvocationSchema = z
  .object({
    step: stepReferenceSchema,
    inputs: z.record(identifierSchema, stepValueSchema),
    store: z.object({ output: identifierSchema, as: identifierSchema }).optional(),
    presentation: z
      .object({ keyword: z.enum(['Given', 'When', 'Then', 'And']), description: boundedText(2_000).optional() })
      .optional(),
  })
  .strict()

export function stepInputValueMatchesType(value: unknown, type: StepDefinition['inputs'][number]['type']) {
  if (
    type === 'json' ||
    type === 'locator' ||
    type === 'environment-ref' ||
    type === 'stored-value-ref' ||
    type === 'artifact-ref' ||
    type === 'reviewed-extension-ref'
  )
    return true
  if (type === 'number') return typeof value === 'number'
  if (type === 'boolean') return typeof value === 'boolean'
  return typeof value === 'string'
}

export function validateStepInvocationInputs(
  definition: StepDefinition,
  supplied: Record<string, unknown>,
  resolveValue: (value: unknown) => unknown = value => value,
): Record<string, unknown> {
  const declared = new Map(definition.inputs.map(input => [input.name, input]))
  for (const name of Object.keys(supplied)) {
    if (!declared.has(name)) throw new Error(`Step ${definition.identity.id} received unknown input ${name}.`)
  }

  return Object.fromEntries(
    definition.inputs.map(input => {
      const suppliedValue = Object.hasOwn(supplied, input.name) ? supplied[input.name] : input.defaultValue
      const value = resolveValue(suppliedValue)
      if (value === undefined && input.required)
        throw new Error(`Step ${definition.identity.id} is missing required input ${input.name}.`)
      if (value !== undefined && !stepInputValueMatchesType(value, input.type))
        throw new Error(`Step ${definition.identity.id} input ${input.name} has the wrong type.`)
      return [input.name, value]
    }),
  )
}

export const stepPublicationReceiptSchema = z.object({
  step: stepIdentitySchema,
  definitionHash: stepDefinitionHashSchema,
  humanProjectionHash: stepDefinitionHashSchema,
  agentContractHash: stepDefinitionHashSchema,
  executionHash: stepDefinitionHashSchema,
  registryManifestHash: stepDefinitionHashSchema,
  conformanceRunId: boundedText(200),
  reviewAuthority: boundedText(200),
  publishedAt: z.string().datetime(),
})

export function computeStepDefinitionHashes(definition: z.infer<typeof stepDefinitionSchema>) {
  const semanticDefinition = {
    schemaVersion: definition.schemaVersion,
    identity: definition.identity,
    provenance: definition.provenance,
    intent: definition.intent,
    inputs: definition.inputs,
    outputs: definition.outputs,
    lifecycle: definition.lifecycle,
  }
  return {
    definitionHash: stepDefinitionContentHash(semanticDefinition),
    humanProjectionHash: stepDefinitionContentHash(definition.human),
    agentContractHash: stepDefinitionContentHash(definition.agent),
    executionHash: stepDefinitionContentHash(definition.execution),
  }
}

export function computeStepReferenceHash(definition: z.infer<typeof stepDefinitionSchema>) {
  return stepDefinitionContentHash(computeStepDefinitionHashes(definition))
}

export type StepDefinition = z.infer<typeof stepDefinitionSchema>
export type StepDefinitionDraft = z.infer<typeof stepDefinitionDraftSchema>
export type StepExecutionBinding = z.infer<typeof stepExecutionBindingSchema>
export type StepInvocation = z.infer<typeof stepInvocationSchema>
export type StepPublicationReceipt = z.infer<typeof stepPublicationReceiptSchema>
