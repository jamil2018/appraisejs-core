import definitions from '../../../packages/cucumber-runtime/src/operations/definitions.json'
import {
  browserOperationHandlerDescriptors,
  createOperationRegistry,
  type BrowserOperationRef,
  type OperationDefinition,
} from '../../../packages/cucumber-runtime/src/operations/index'

function loadOperationDefinitions(): OperationDefinition[] {
  return (
    definitions as Array<Omit<OperationDefinition, 'handler'> & { handler: { id: string; version: string } }>
  ).map(definition => {
    const ref = `${definition.handler.id}@${definition.handler.version}` as BrowserOperationRef
    const handler = browserOperationHandlerDescriptors[ref]
    if (!handler)
      throw new Error(`Canonical operation ${definition.id}@${definition.version} is missing handler ${ref}.`)
    return {
      ...definition,
      handler: {
        id: definition.handler.id,
        version: definition.handler.version,
        contentHash: handler.contentHash,
      },
    } as OperationDefinition
  })
}

export const defaultOperationRegistry = createOperationRegistry(loadOperationDefinitions())
