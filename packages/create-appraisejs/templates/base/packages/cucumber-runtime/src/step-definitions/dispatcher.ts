import {
  executeBrowserOperation,
  type BrowserOperationContext,
  type BrowserOperationWorld,
} from '../operations/browser-handlers.ts'

import {
  computeStepReferenceHash,
  stepDefinitionSchema,
  stepInvocationSchema,
  type StepDefinition,
  type StepInputExpression,
  type StepInvocation,
} from './contracts.ts'

export type SealedStepDefinition = {
  step: StepInvocation['step']
  definition: StepDefinition
}

export type StepInvocationDispatchContext = Omit<BrowserOperationContext, 'inputs'> & {
  world: BrowserOperationWorld & Record<string, unknown>
  extensionModules?: Record<string, string>
  environment?: Record<string, unknown>
}

const definitionKey = (step: StepInvocation['step']) => `${step.id}@${step.version}#${step.definitionHash}`
const extensionKey = (id: string, version: string) => `${id}@${version}`
const MAX_COMPOSITION_DEPTH = 16
const MAX_COMPOSITION_EXPANDED_STEPS = 100

function matchesType(value: unknown, type: StepDefinition['inputs'][number]['type']) {
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

function resolvedReferenceInput(value: unknown, context: StepInvocationDispatchContext) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const reference = value as Record<string, unknown>
  if (reference.ref === 'stored' && typeof reference.name === 'string' && Object.keys(reference).length === 2) {
    const outputs = context.world.appraiseStepOutputs
    if (!(outputs instanceof Map) || !outputs.has(reference.name))
      throw new Error(`Stored step output ${reference.name} is unavailable.`)
    return outputs.get(reference.name)
  }
  if (reference.ref === 'environment' && typeof reference.key === 'string' && Object.keys(reference).length === 2) {
    if (!context.environment || !Object.hasOwn(context.environment, reference.key))
      throw new Error(`Environment value ${reference.key} is unavailable.`)
    return context.environment[reference.key]
  }
  return value
}

function inputValues(
  definition: StepDefinition,
  supplied: Record<string, unknown>,
  context: StepInvocationDispatchContext,
) {
  const declared = new Map(definition.inputs.map(input => [input.name, input]))
  for (const name of Object.keys(supplied))
    if (!declared.has(name)) throw new Error(`Step ${definition.identity.id} received unknown input ${name}.`)
  return Object.fromEntries(
    definition.inputs.map(input => {
      const suppliedValue = Object.hasOwn(supplied, input.name) ? supplied[input.name] : input.defaultValue
      const value = resolvedReferenceInput(suppliedValue, context)
      if (value === undefined && input.required)
        throw new Error(`Step ${definition.identity.id} is missing required input ${input.name}.`)
      if (value !== undefined && !matchesType(value, input.type))
        throw new Error(`Step ${definition.identity.id} input ${input.name} has the wrong type.`)
      return [input.name, value]
    }),
  )
}

function expressionValue(
  expression: StepInputExpression,
  parentInputs: Record<string, unknown>,
  outputs: Map<string, unknown>,
) {
  if (expression && typeof expression === 'object' && !Array.isArray(expression)) {
    const selector = expression as Record<string, unknown>
    if (Object.hasOwn(selector, 'input') && typeof selector.input === 'string') {
      const name = selector.input
      if (!Object.hasOwn(parentInputs, name)) throw new Error(`Composition parent input ${name} is missing.`)
      return parentInputs[name]
    }
    if (Object.hasOwn(selector, 'output') && typeof selector.output === 'string') {
      const name = selector.output
      if (!outputs.has(name)) throw new Error(`Composition child output ${name} is missing.`)
      return outputs.get(name)
    }
  }
  return expression
}

function outputValues(definition: StepDefinition, value: unknown) {
  if (definition.outputs.length === 0) return {} as Record<string, unknown>
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Step ${definition.identity.id} did not return its declared outputs.`)
  const record = value as Record<string, unknown>
  const outputs: Record<string, unknown> = {}
  for (const output of definition.outputs) {
    if (!Object.hasOwn(record, output.name))
      throw new Error(`Step ${definition.identity.id} did not return output ${output.name}.`)
    if (!matchesType(record[output.name], output.type))
      throw new Error(`Step ${definition.identity.id} output ${output.name} has the wrong type.`)
    outputs[output.name] = record[output.name]
  }
  return outputs
}

async function invoke(
  definition: StepDefinition,
  supplied: Record<string, unknown>,
  definitions: Map<string, StepDefinition>,
  context: StepInvocationDispatchContext,
  budget: { remaining: number; active: Set<string> },
  depth: number,
): Promise<Record<string, unknown>> {
  if (depth > MAX_COMPOSITION_DEPTH)
    throw new Error(`Step Definition composition exceeds maximum depth ${MAX_COMPOSITION_DEPTH}.`)
  if (budget.remaining-- <= 0)
    throw new Error(`Step Definition composition exceeds maximum expansion ${MAX_COMPOSITION_EXPANDED_STEPS}.`)
  const key = definitionKey({ ...definition.identity, definitionHash: computeStepReferenceHash(definition) })
  if (budget.active.has(key))
    throw new Error(
      `Step Definition composition cycle reaches ${definition.identity.id}@${definition.identity.version}.`,
    )
  budget.active.add(key)
  try {
    const inputs = inputValues(definition, supplied, context)
    if (definition.execution.kind === 'operation') {
      if (definition.execution.runtime !== 'browser')
        throw new Error(`Step ${definition.identity.id} requires unsupported ${definition.execution.runtime} runtime.`)
      return outputValues(
        definition,
        await executeBrowserOperation(`${definition.execution.handlerId}@${definition.execution.handlerVersion}`, {
          ...context,
          inputs,
        }),
      )
    }
    if (definition.execution.kind === 'reviewed-extension') {
      const ref = extensionKey(definition.execution.extensionId, definition.execution.extensionVersion)
      const modulePath = context.extensionModules?.[ref]
      if (!modulePath) throw new Error(`Reviewed extension ${ref} is not sealed in this capsule.`)
      const loaded = await import(modulePath)
      const handler = loaded[definition.execution.exportName]
      if (typeof handler !== 'function')
        throw new Error(`Reviewed extension ${ref} does not export ${definition.execution.exportName}.`)
      return outputValues(
        definition,
        await handler(inputs, {
          runtime: definition.execution.runtime,
          world: context.world,
          resolveLocator: context.resolveLocator,
          resolveSelector: context.resolveSelector,
          baseUrl: context.baseUrl,
        }),
      )
    }
    if (definition.execution.kind === 'unbound') throw new Error(`Step ${definition.identity.id} is not executable.`)

    const outputs = new Map<string, unknown>()
    for (const child of definition.execution.steps) {
      const childDefinition = definitions.get(definitionKey(child.step))
      if (!childDefinition) throw new Error(`Composition child ${child.step.id}@${child.step.version} is not sealed.`)
      const childInputs = Object.fromEntries(
        Object.entries(child.inputs).map(([name, expression]) => [name, expressionValue(expression, inputs, outputs)]),
      )
      const childOutputs = await invoke(childDefinition, childInputs, definitions, context, budget, depth + 1)
      for (const [name, value] of Object.entries(childOutputs)) {
        if (outputs.has(name)) throw new Error(`Composition child output ${name} is ambiguous.`)
        outputs.set(name, value)
      }
    }
    return outputValues(definition, Object.fromEntries(outputs))
  } finally {
    budget.active.delete(key)
  }
}

/** Executes one exact invocation against the immutable definition closure. */
export async function dispatchStepInvocation(input: {
  invocation: StepInvocation
  sealedDefinitions: SealedStepDefinition[]
  context: StepInvocationDispatchContext
}) {
  const invocation = stepInvocationSchema.parse(input.invocation)
  const definitions = new Map<string, StepDefinition>()
  for (const sealed of input.sealedDefinitions) {
    const definition = stepDefinitionSchema.parse(sealed.definition)
    if (
      computeStepReferenceHash(definition) !== sealed.step.definitionHash ||
      definitionKey(sealed.step) !==
        definitionKey({ ...definition.identity, definitionHash: computeStepReferenceHash(definition) })
    )
      throw new Error(`Sealed Step Definition ${sealed.step.id}@${sealed.step.version} was tampered with.`)
    definitions.set(definitionKey(sealed.step), definition)
  }
  const definition = definitions.get(definitionKey(invocation.step))
  if (!definition)
    throw new Error(`Step Invocation ${invocation.step.id}@${invocation.step.version} is not in the sealed closure.`)
  const outputs = await invoke(
    definition,
    invocation.inputs,
    definitions,
    input.context,
    {
      remaining: MAX_COMPOSITION_EXPANDED_STEPS,
      active: new Set(),
    },
    0,
  )
  if (invocation.store) {
    if (!Object.hasOwn(outputs, invocation.store.output))
      throw new Error(`Step Invocation cannot store missing output ${invocation.store.output}.`)
    const stored = (input.context.world.appraiseStepOutputs ??= new Map<string, unknown>()) as Map<string, unknown>
    stored.set(invocation.store.as, outputs[invocation.store.output])
  }
  return outputs
}
