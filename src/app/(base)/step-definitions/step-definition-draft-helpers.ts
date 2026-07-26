import type { StepDefinition } from '../../../../packages/cucumber-runtime/src/step-definitions/index'
import { canonicalStepDefinitionJson } from '../../../../packages/cucumber-runtime/src/step-definitions/contracts'
import { generateStepDefinitionContract } from '../../../../packages/cucumber-runtime/src/step-definitions/artifact-contract'

export type DraftDefinition = StepDefinition

export function canonicalDraftDefinitionJson(definition: DraftDefinition) {
  return canonicalStepDefinitionJson(definition)
}

const searchStopWords = new Set(['and', 'for', 'from', 'into', 'that', 'the', 'this', 'with'])

export function stepDefinitionIdFromTitle(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `custom.${slug || 'untitled'}`
}

export function deriveStepSearchTerms(definition: DraftDefinition) {
  const phrases = [definition.intent.title, definition.intent.description, definition.human.signature]
  const words = phrases
    .join(' ')
    .toLowerCase()
    .match(/[a-z0-9]+/g)
  return [...new Set(words?.filter(word => word.length >= 3 && !searchStopWords.has(word)) ?? [])].slice(0, 40)
}

export function applyManagedStepMetadata(definition: DraftDefinition): DraftDefinition {
  const id = stepDefinitionIdFromTitle(definition.intent.title)
  const title = definition.intent.title.trim()
  const description = definition.intent.description.trim()
  const runtime =
    definition.execution.kind === 'reviewed-extension' || definition.execution.kind === 'operation'
      ? definition.execution.runtime
      : 'node'
  return {
    ...definition,
    identity: { ...definition.identity, id, version: '1' },
    intent: { ...definition.intent, capabilities: [runtime], searchTerms: deriveStepSearchTerms(definition) },
    agent: {
      summary: title,
      usageGuidance: description,
      examples: definition.agent.examples.map(example => ({
        ...example,
        intent: title,
      })),
    },
    human: { ...definition.human, groupId: definition.human.groupId.trim() || 'custom' },
    execution:
      definition.execution.kind === 'reviewed-extension'
        ? { ...definition.execution, extensionId: id, extensionVersion: '1' }
        : definition.execution,
  }
}

export function namedPlaceholders(signature: string) {
  return [...signature.matchAll(/\{([a-z][a-zA-Z0-9-]*)\}/g)].map(match => match[1]!)
}

export function defaultStepInputExampleValue(input: DraftDefinition['inputs'][number]): unknown {
  if (input.type === 'number') return 1
  if (input.type === 'boolean') return true
  if (input.type === 'json') return { example: true }
  if (input.type === 'locator') return 'Primary action'
  if (input.type === 'environment-ref') return 'Local development'
  if (input.type === 'stored-value-ref') return 'savedValue'
  if (input.type === 'artifact-ref') return 'artifact-1'
  if (input.type === 'reviewed-extension-ref') return 'extension-1'
  const label = (input.label || input.name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase()
  return `Example ${label || 'value'}`
}

function reconcileAgentExampleInputs(
  definition: DraftDefinition,
  inputs: DraftDefinition['inputs'],
): DraftDefinition['agent']['examples'] {
  return definition.agent.examples.map(example => ({
    ...example,
    inputs: Object.fromEntries(
      inputs.map(input => [
        input.name,
        Object.hasOwn(example.inputs, input.name) ? example.inputs[input.name] : defaultStepInputExampleValue(input),
      ]),
    ),
  }))
}

export function reconcileNamedInputs(definition: DraftDefinition, signature: string): DraftDefinition {
  const placeholders = [...new Set(namedPlaceholders(signature))]
  const existing = new Map(definition.inputs.map(input => [input.name, input]))
  const inputs = placeholders.map(
    name =>
      existing.get(name) ?? {
        name,
        label: name,
        description: '',
        type: 'string' as const,
        required: true,
        examples: [],
        aliases: [],
      },
  )
  return {
    ...definition,
    inputs,
    agent: {
      ...definition.agent,
      examples: reconcileAgentExampleInputs(definition, inputs),
    },
    human: {
      ...definition.human,
      signature,
      parameterBindings: placeholders.map(name => ({ placeholder: name, input: name })),
    },
  }
}

export function updateStepInputType(
  definition: DraftDefinition,
  inputName: string,
  type: DraftDefinition['inputs'][number]['type'],
): DraftDefinition {
  const inputs = definition.inputs.map(input => (input.name === inputName ? { ...input, type } : input))
  return {
    ...definition,
    inputs,
    agent: {
      ...definition.agent,
      examples: definition.agent.examples.map(example => ({
        ...example,
        inputs: {
          ...example.inputs,
          [inputName]: defaultStepInputExampleValue(inputs.find(input => input.name === inputName)!),
        },
      })),
    },
  }
}

export function createHumanStepDraft(now = new Date().toISOString()): DraftDefinition {
  const emptyHash = `sha256:${'0'.repeat(64)}` as const
  return {
    schemaVersion: '1',
    identity: { id: 'custom.untitled', version: '1', status: 'draft' },
    provenance: { creationMethod: 'human-form', createdBy: 'local-user', createdAt: now },
    intent: {
      title: '',
      description: '',
      capabilities: ['node'],
      searchTerms: [],
      examples: ['Describe one intended use.'],
    },
    inputs: [],
    outputs: [],
    human: {
      signature: '',
      keywordCompatibility: ['When'],
      parameterBindings: [],
      groupId: 'custom',
    },
    agent: {
      summary: 'Perform the reusable behavior.',
      usageGuidance: 'Use when this exact reusable behavior is required.',
      examples: [{ intent: 'Use the reusable behavior', inputs: {} }],
    },
    execution: {
      kind: 'reviewed-extension',
      extensionId: 'custom.untitled',
      extensionVersion: '1',
      exportName: 'handler',
      sourceHash: emptyHash,
      compiledHash: emptyHash,
      runtime: 'node',
    },
    lifecycle: {},
  }
}

export function draftContractSource(definition: DraftDefinition) {
  return generateStepDefinitionContract(definition)
}

export function draftHandlerBoilerplate(definition: DraftDefinition) {
  const outputs = definition.outputs.map(output => `${output.name}: undefined as never`).join(', ')
  return [
    "import type { StepHandler } from './contract.js'",
    '',
    'export const handler: StepHandler = async (input, context) => {',
    '  void input',
    '  context.signal.throwIfAborted()',
    '  // Implement the reviewed behavior here.',
    `  return { ${outputs} }`,
    '}',
    '',
  ].join('\n')
}
