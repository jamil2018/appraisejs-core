import type { CustomWorld } from '../world.ts'
import { computeStepReferenceHash } from '../step-definitions/contracts.ts'
import { builtInStepDefinitions } from '../step-definitions/builtins.ts'
import { dispatchStepInvocation } from '../step-definitions/dispatcher.ts'
import { OperationExecutionError } from './browser-handlers.ts'

/**
 * Executes a generated human projection through the same exact-invocation
 * dispatcher used by reviewed runtime capsules. Built-ins are the only
 * globally generated projections; reviewed extensions and compositions are
 * sealed into their runtime-capsule bindings and call this dispatcher there.
 */
export async function executeHumanOperation(
  ref: string,
  world: CustomWorld,
  inputNames: string[],
  parameters: unknown[],
): Promise<unknown> {
  const [id, version] = ref.split('@')
  const definition = builtInStepDefinitions.find(item => item.identity.id === id && item.identity.version === version)
  if (!definition) throw new OperationExecutionError('operation_unknown', `Operation "${ref}" is not supported.`)
  return dispatchStepInvocation({
    invocation: {
      step: {
        id: definition.identity.id,
        version: definition.identity.version,
        definitionHash: computeStepReferenceHash(definition),
      },
      inputs: Object.fromEntries(inputNames.map((name, index) => [name, parameters[index]])),
      presentation: { keyword: 'When', description: definition.intent.title },
    },
    sealedDefinitions: builtInStepDefinitions.map(item => ({
      step: { id: item.identity.id, version: item.identity.version, definitionHash: computeStepReferenceHash(item) },
      definition: item,
    })),
    context: {
      world: world as CustomWorld & Record<string, unknown>,
      baseUrl: process.env.APPRAISE_BASE_URL,
      resolveLocator: async reference => {
        const locatorName =
          typeof reference === 'string' ? reference : String((reference as { id?: unknown })?.id ?? '')
        const selector = await import('../locator.util.ts').then(module =>
          module.resolveLocator(world.page, locatorName),
        )
        if (!selector)
          throw new OperationExecutionError('operation_locator_not_found', `Locator "${locatorName}" was not found.`)
        return world.page.locator(selector)
      },
    },
  })
}
