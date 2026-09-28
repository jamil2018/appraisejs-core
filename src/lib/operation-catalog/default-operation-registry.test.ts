import { describe, expect, it } from 'vitest'

import { listBrowserOperationHandlerRefs } from '../../../packages/cucumber-runtime/src/operations/index'
import { builtInStepDefinitions } from '../../../packages/cucumber-runtime/src/step-definitions/builtins'
import definitions from '../../../packages/cucumber-runtime/src/operations/definitions.json'
import { defaultOperationDefinitions, defaultOperationRegistry } from './default-operation-registry'

describe('default operation registry', () => {
  it('covers every managed operation with one handler and both authoring projections', () => {
    const firstPage = defaultOperationRegistry.list({}, 0, 100)
    const operations = [
      ...firstPage.items,
      ...(firstPage.nextCursor == null ? [] : defaultOperationRegistry.list({}, firstPage.nextCursor, 100).items),
    ]
    expect(operations.length).toBeGreaterThanOrEqual(116)
    expect(operations.map(item => `${item.id}@${item.version}`).sort()).toEqual(listBrowserOperationHandlerRefs())
    expect(operations.every(item => item.humanSurface === 'supported' && item.agentSurface === 'supported')).toBe(true)
    expect(
      definitions
        .flatMap(operation => operation.inputs.filter(input => input.type === 'locator'))
        .every(
          input => 'cardinality' in input && (input.cardinality === 'exactlyOne' || input.cardinality === 'collection'),
        ),
    ).toBe(true)
  })

  it('converges action and template aliases on canonical operation identities', () => {
    expect(defaultOperationRegistry.resolveAlias('action-id', 'browser.mouse.click', 'agent')?.id).toBe(
      'browser.mouse.click',
    )
    expect(defaultOperationRegistry.resolveAlias('step-definition-slug', 'click/click', 'human')?.id).toBe(
      'browser.mouse.click',
    )
  })

  it('exposes ordered collection text assertions as one canonical collection operation', () => {
    const operation = defaultOperationRegistry.read([{ id: 'browser.assertions.ordered.texts', version: '1' }])[0]

    expect(operation).toMatchObject({
      handler: { id: 'browser.assertions.ordered.texts', version: '1' },
      inputs: [
        { name: 'target', type: 'locator', required: true, cardinality: 'collection' },
        { name: 'expectedTexts', type: 'json', required: true },
      ],
    })
    expect(operation?.inputs).not.toContainEqual(expect.objectContaining({ name: 'index' }))
  })

  it('binds every built-in ready Step Definition to its canonical operation and trusted handler', () => {
    const operations = new Map(
      defaultOperationDefinitions.map(operation => [`${operation.id}@${operation.version}`, operation]),
    )
    expect(builtInStepDefinitions).toHaveLength(operations.size)
    for (const definition of builtInStepDefinitions) {
      const operation = operations.get(`${definition.identity.id}@${definition.identity.version}`)
      expect(operation).toBeDefined()
      expect(definition.identity.status).toBe('ready')
      expect(definition.execution).toMatchObject({
        kind: 'operation',
        handlerId: operation!.handler.id,
        handlerVersion: operation!.handler.version,
        runtime: operation!.runtime,
      })
      expect(definition.inputs.map(input => [input.name, input.type, input.required])).toEqual(
        operation!.inputs.map(input => [input.name, input.type, input.required]),
      )
      expect(operation!.handler.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    }
  })
})
