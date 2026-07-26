import { computeStepReferenceHash, type StepDefinition, type StepInputExpression } from './contracts.ts'

export type StepDefinitionCompositionDiagnostic = {
  code: string
  path: string
  message: string
}

export type ResolvedStepDefinition = {
  definition: StepDefinition
  status: 'ready' | 'deprecated'
}

type StepValueType = StepDefinition['inputs'][number]['type']

function identityKey(identity: { id: string; version: string }) {
  return `${identity.id}@${identity.version}`
}

function valueMatchesType(value: unknown, type: StepValueType) {
  if (type === 'json') return true
  if (type === 'number') return typeof value === 'number'
  if (type === 'boolean') return typeof value === 'boolean'
  return typeof value === 'string'
}

function referenceTypesCompatible(source: StepValueType, target: StepValueType) {
  return source === target || target === 'json'
}

type ExpressionKind =
  | { kind: 'input'; name: string }
  | { kind: 'output'; name: string }
  | { kind: 'literal' }
  | { kind: 'invalid-selector' }

function expressionKind(value: StepInputExpression | unknown): ExpressionKind {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'literal' }
  const keys = Object.keys(value)
  const record = value as Record<string, unknown>
  if (!keys.includes('input') && !keys.includes('output')) return { kind: 'literal' }
  if (keys.length !== 1) return { kind: 'invalid-selector' }
  if (keys[0] === 'input' && typeof record.input === 'string') return { kind: 'input', name: record.input }
  if (keys[0] === 'output' && typeof record.output === 'string') return { kind: 'output', name: record.output }
  return { kind: 'invalid-selector' }
}

function sortDiagnostics(diagnostics: StepDefinitionCompositionDiagnostic[]) {
  return diagnostics.sort((left, right) =>
    left.path === right.path ? left.code.localeCompare(right.code) : left.path.localeCompare(right.path),
  )
}

/**
 * Validates composition semantics against an already-resolved, exact definition
 * closure. Persistence and closure loading deliberately stay with the registry.
 */
export function validateStepDefinitionComposition(
  definition: StepDefinition,
  resolvedDefinitions: Iterable<ResolvedStepDefinition>,
): StepDefinitionCompositionDiagnostic[] {
  if (definition.execution.kind !== 'composition') return []

  const diagnostics: StepDefinitionCompositionDiagnostic[] = []
  const definitions = new Map<string, ResolvedStepDefinition>()
  for (const resolved of resolvedDefinitions) definitions.set(identityKey(resolved.definition.identity), resolved)
  definitions.set(identityKey(definition.identity), { definition, status: 'ready' })

  if (definition.outputs.length > 0)
    diagnostics.push({
      code: 'composition.outputs.unsupported',
      path: 'outputs',
      message: 'Composition outputs require explicit export mappings, which are not supported yet.',
    })

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (current: StepDefinition, path: string) => {
    const key = identityKey(current.identity)
    if (visiting.has(key)) {
      diagnostics.push({
        code: 'composition.cycle',
        path,
        message: `Composition cycle reaches ${key}.`,
      })
      return
    }
    if (visited.has(key)) return
    visiting.add(key)
    if (current.execution.kind === 'composition')
      current.execution.steps.forEach((child, index) => {
        const childPath = `${path ? `${path}.` : ''}execution.steps.${index}.step`
        const resolved = definitions.get(identityKey(child.step))
        if (!resolved) {
          diagnostics.push({
            code: 'composition.child.missing',
            path: childPath,
            message: `Composition child ${identityKey(child.step)} does not exist.`,
          })
        } else if (resolved.status !== 'ready') {
          diagnostics.push({
            code: 'composition.child.not-ready',
            path: childPath,
            message: `Composition child ${identityKey(child.step)} is ${resolved.status}, not ready.`,
          })
        } else if (computeStepReferenceHash(resolved.definition) !== child.step.definitionHash) {
          diagnostics.push({
            code: 'composition.child.hash-mismatch',
            path: childPath,
            message: `Composition child ${identityKey(child.step)} does not match its exact definition hash.`,
          })
          if (resolved.definition.execution.kind === 'composition') visit(resolved.definition, childPath)
        } else if (resolved.definition.execution.kind === 'composition') visit(resolved.definition, childPath)
      })
    visiting.delete(key)
    visited.add(key)
  }
  visit(definition, '')

  const parentInputs = new Map(definition.inputs.map(input => [input.name, input]))
  const previousOutputs = new Map<string, Array<{ type: StepValueType; index: number }>>()
  const outputProducers = new Map<string, number[]>()
  definition.execution.steps.forEach((child, index) => {
    const resolved = definitions.get(identityKey(child.step))
    if (resolved?.status !== 'ready' || computeStepReferenceHash(resolved.definition) !== child.step.definitionHash)
      return
    for (const output of resolved.definition.outputs) {
      const indexes = outputProducers.get(output.name) ?? []
      indexes.push(index)
      outputProducers.set(output.name, indexes)
    }
  })
  definition.execution.steps.forEach((child, stepIndex) => {
    const stepPath = `execution.steps.${stepIndex}`
    const resolved = definitions.get(identityKey(child.step))
    if (
      !resolved ||
      resolved.status !== 'ready' ||
      computeStepReferenceHash(resolved.definition) !== child.step.definitionHash
    )
      return

    const childInputs = new Map(resolved.definition.inputs.map(input => [input.name, input]))
    for (const [name, expression] of Object.entries(child.inputs)) {
      const childInput = childInputs.get(name)
      const inputPath = `${stepPath}.inputs.${name}`
      if (!childInput) {
        diagnostics.push({
          code: 'composition.input.unknown',
          path: inputPath,
          message: `Composition child ${identityKey(child.step)} has no input ${name}.`,
        })
        continue
      }
      const source = expressionKind(expression)
      if (source.kind === 'input') {
        const parentInput = parentInputs.get(source.name)
        if (!parentInput) {
          diagnostics.push({
            code: 'composition.input.parent-missing',
            path: inputPath,
            message: `Composition parent has no input ${source.name}.`,
          })
        } else {
          if (!referenceTypesCompatible(parentInput.type, childInput.type))
            diagnostics.push({
              code: 'composition.input.parent-type',
              path: inputPath,
              message: `Parent input ${source.name} is incompatible with child input ${name}.`,
            })
          if (childInput.required && !parentInput.required && parentInput.defaultValue === undefined)
            diagnostics.push({
              code: 'composition.input.parent-optional',
              path: inputPath,
              message: `Optional parent input ${source.name} cannot satisfy required child input ${name}.`,
            })
        }
      } else if (source.kind === 'output') {
        const producers = previousOutputs.get(source.name) ?? []
        if (producers.length === 0) {
          const producerIndexes = outputProducers.get(source.name) ?? []
          const code = producerIndexes.includes(stepIndex)
            ? 'composition.output.self'
            : producerIndexes.some(index => index > stepIndex)
              ? 'composition.output.forward'
              : 'composition.output.missing'
          diagnostics.push({
            code,
            path: inputPath,
            message: `No strictly earlier child output provides ${source.name}.`,
          })
        } else if (producers.length > 1)
          diagnostics.push({
            code: 'composition.output.ambiguous',
            path: inputPath,
            message: `Multiple earlier child outputs provide ${source.name}.`,
          })
        else if (!referenceTypesCompatible(producers[0]!.type, childInput.type))
          diagnostics.push({
            code: 'composition.output.type',
            path: inputPath,
            message: `Output ${source.name} is incompatible with child input ${name}.`,
          })
      } else if (source.kind === 'invalid-selector')
        diagnostics.push({
          code: 'composition.input.expression.invalid',
          path: inputPath,
          message: 'Composition input selectors must contain exactly one valid input or output reference.',
        })
      else if (!valueMatchesType(expression, childInput.type))
        diagnostics.push({
          code: 'composition.input.literal-type',
          path: inputPath,
          message: `Literal mapping for child input ${name} has the wrong type.`,
        })
    }
    for (const childInput of resolved.definition.inputs)
      if (childInput.required && childInput.defaultValue === undefined && !Object.hasOwn(child.inputs, childInput.name))
        diagnostics.push({
          code: 'composition.input.required',
          path: `${stepPath}.inputs.${childInput.name}`,
          message: `Required child input ${childInput.name} is not mapped.`,
        })

    for (const output of resolved.definition.outputs) {
      const outputs = previousOutputs.get(output.name) ?? []
      outputs.push({ type: output.type, index: stepIndex })
      previousOutputs.set(output.name, outputs)
    }
  })

  return sortDiagnostics(diagnostics)
}
