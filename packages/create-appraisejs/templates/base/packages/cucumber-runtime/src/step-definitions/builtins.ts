import definitions from '../operations/definitions.json'
import { browserOperationHandlerDescriptors } from '../operations/browser-handlers.ts'
import type { OperationDefinition } from '../operations/contracts.ts'

import { stepDefinitionSchema, type StepDefinition } from './contracts.ts'

type SourceOperation = Omit<OperationDefinition, 'handler'> & { handler: { id: string; version: string } }

function outputType(type: OperationDefinition['outputs'][number]['type']): StepDefinition['outputs'][number]['type'] {
  if (type === 'artifact' || type === 'download' || type === 'page') return 'artifact-ref'
  return type
}

function projectBuiltIn(source: SourceOperation): StepDefinition {
  const projection = source.humanProjections[0]
  const agent = source.agentProjection
  if (!projection || !agent)
    throw new Error(`Built-in ${source.id}@${source.version} must support both authoring surfaces.`)
  const handler = browserOperationHandlerDescriptors[`${source.handler.id}@${source.handler.version}`]
  if (!handler) throw new Error(`Built-in ${source.id}@${source.version} is missing its trusted handler.`)

  return stepDefinitionSchema.parse({
    schemaVersion: '1',
    identity: { id: source.id, version: source.version, status: 'ready' },
    provenance: {
      creationMethod: 'built-in-source',
      createdBy: 'appraise:builtin-source',
      createdAt: '2026-07-22T00:00:00.000Z',
      reviewedBy: 'appraise:source-review',
      sourceReference: `packages/cucumber-runtime/src/operations/definitions.json#${source.id}@${source.version}`,
    },
    intent: {
      title: source.title,
      description: source.description,
      capabilities: source.capabilities.length > 0 ? source.capabilities : source.categories,
      searchTerms: agent.searchTerms,
      examples: agent.examples.map(example => example.description),
    },
    inputs: source.inputs.map(input => ({
      name: input.name,
      label: input.name,
      description: input.description,
      type: input.type,
      required: input.required,
      defaultValue: input.defaultValue,
      examples: agent.examples.flatMap(example =>
        Object.hasOwn(example.inputs, input.name) ? [example.inputs[input.name]] : [],
      ),
      aliases: [],
      constraints: input.constraints,
    })),
    outputs: source.outputs.map(output => ({
      name: output.name,
      description: output.description,
      type: outputType(output.type),
      storable: true,
    })),
    human: {
      signature: projection.signature,
      keywordCompatibility: [projection.icon === 'VALIDATION' ? 'Then' : 'When'],
      parameterBindings: projection.parameterOrder.map(input => ({ placeholder: input, input })),
      groupId: projection.group,
    },
    agent: {
      summary: agent.title,
      usageGuidance: agent.description,
      examples: agent.examples.map(example => ({ intent: example.description, inputs: example.inputs })),
    },
    execution: {
      kind: 'operation',
      handlerId: source.handler.id,
      handlerVersion: source.handler.version,
      runtime: source.runtime,
    },
    lifecycle: {},
  })
}

export const builtInStepDefinitions = (definitions as SourceOperation[]).map(projectBuiltIn)
