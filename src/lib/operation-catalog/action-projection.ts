import type { ActionDescriptor } from '@/lib/action-catalog'
import type { OperationDescriptor } from '../../../packages/cucumber-runtime/src/operations'

export function projectOperationAsAction(operation: OperationDescriptor): ActionDescriptor {
  return {
    id: operation.id,
    version: operation.version,
    title: operation.title,
    description: operation.description,
    categories: operation.categories,
    inputs: operation.inputs.map(input => ({
      name: input.name,
      type: input.type,
      required: input.required,
      description: input.description,
      constraints: input.constraints,
      ...(input.constraints?.unit === 'milliseconds' || input.constraints?.unit === 'seconds'
        ? {
            numeric: {
              unit: input.constraints.unit,
              ...(typeof input.constraints.minimum === 'number' ? { minimum: input.constraints.minimum } : {}),
              ...(typeof input.constraints.maximum === 'number' ? { maximum: input.constraints.maximum } : {}),
            },
          }
        : {}),
    })),
    outputs: operation.outputs,
    requirements: { runtime: operation.runtime, capabilities: operation.capabilities },
    examples: operation.agentProjection?.examples ?? [],
    deprecated: operation.deprecated,
    ...(operation.replacement ? { replacementActionId: operation.replacement.id } : {}),
    assertionConcerns: operation.assertionConcerns,
    contentHash: operation.descriptorHash,
  }
}
