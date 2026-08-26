import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

import definitions from './definitions.json'
import {
  canonicalOperationJson,
  operationContentHash,
  operationDefinitionSchema,
  operationInvocationSchema,
  type OperationDefinition,
} from './contracts'
import { createOperationRegistry } from './registry'

const HASH = `sha256:${'a'.repeat(64)}`

function operation(overrides: Partial<OperationDefinition> = {}): OperationDefinition {
  return {
    id: 'browser.mouse.click',
    version: '1',
    title: 'Click element',
    description: 'Click a resolved locator target.',
    categories: ['browser.mouse'],
    capabilities: ['mouse'],
    runtime: 'browser',
    inputs: [
      { name: 'target', type: 'locator', required: true, description: 'Target locator.', cardinality: 'exactlyOne' },
    ],
    outputs: [],
    assertionConcerns: [],
    securityClass: 'built-in',
    handler: { id: 'browser.mouse.click', version: '1', contentHash: HASH },
    humanProjections: [
      {
        id: 'browser.mouse.click.gherkin',
        signature: 'the user clicks on the {string} element',
        title: 'click',
        group: 'click',
        icon: 'MOUSE',
        parameterOrder: ['target'],
        constants: {},
        deprecated: false,
      },
    ],
    humanSurface: { status: 'supported' },
    agentProjection: {
      title: 'Click element',
      description: 'Click a resolved locator target.',
      searchTerms: ['click', 'element'],
      examples: [{ description: 'Click submit.', inputs: { target: 'submit-button' } }],
    },
    agentSurface: { status: 'supported' },
    aliases: [{ kind: 'step-definition-slug', value: 'click/click', surface: 'human' }],
    deprecated: false,
    ...overrides,
  }
}

describe('operation contracts', () => {
  it('canonicalizes and hashes semantic content deterministically', () => {
    expect(canonicalOperationJson({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}')
    expect(operationContentHash({ z: 1, a: 2 })).toBe(operationContentHash({ a: 2, z: 1 }))
  })

  it('rejects duplicate inputs, executable values, unknown projection inputs, and unbounded values', () => {
    expect(() =>
      operationDefinitionSchema.parse(
        operation({
          inputs: [
            {
              name: 'target',
              type: 'locator',
              required: true,
              description: 'One.',
              cardinality: 'exactlyOne',
            },
            { name: 'target', type: 'string', required: true, description: 'Two.' },
          ],
        }),
      ),
    ).toThrow('Duplicate input')
    expect(() =>
      operationDefinitionSchema.parse(
        operation({ humanProjections: [{ ...operation().humanProjections[0]!, parameterOrder: ['missing'] }] }),
      ),
    ).toThrow('maps unknown input')
    expect(() =>
      operationInvocationSchema.parse({
        operation: { id: 'browser.mouse.click', version: '1', descriptorHash: HASH },
        inputs: { target: () => 'executable' },
      }),
    ).toThrow()
    const deeplyNested: Record<string, unknown> = {}
    let cursor = deeplyNested
    for (let index = 0; index < 12; index += 1) {
      cursor.next = {}
      cursor = cursor.next as Record<string, unknown>
    }
    expect(() =>
      operationInvocationSchema.parse({
        operation: { id: 'browser.mouse.click', version: '1', descriptorHash: HASH },
        inputs: { target: deeplyNested },
      }),
    ).toThrow('depth 10')
  })

  it('requires every canonical locator input to state whether it is singular or a collection', () => {
    expect(() =>
      operationDefinitionSchema.parse(
        operation({ inputs: [{ name: 'target', type: 'locator', required: true, description: 'Target locator.' }] }),
      ),
    ).toThrow('requires cardinality')
    expect(() =>
      operationDefinitionSchema.parse(
        operation({
          inputs: [
            {
              name: 'label',
              type: 'string',
              required: true,
              description: 'Label.',
              cardinality: 'exactlyOne',
            },
          ],
        }),
      ),
    ).toThrow('Only locator input')
  })

  it('allows environment-resolved credentials only for one locator-only browser operation', () => {
    expect(() =>
      operationDefinitionSchema.parse(
        operation({
          credentialSource: 'environment-resolved',
          inputs: [
            {
              name: 'target',
              type: 'locator',
              required: true,
              description: 'Target locator.',
              cardinality: 'exactlyOne',
            },
            { name: 'value', type: 'string', required: true, description: 'Untrusted authored secret.' },
          ],
        }),
      ),
    ).toThrow('environment-resolved credential operation')
  })

  it('accepts the ordered text assertion only with a collection locator and json expected texts', () => {
    const orderedTexts = definitions.find(item => item.id === 'browser.assertions.ordered.texts')

    expect(
      operationDefinitionSchema.parse({
        ...orderedTexts,
        handler: { ...orderedTexts?.handler, contentHash: HASH },
      }),
    ).toMatchObject({
      id: 'browser.assertions.ordered.texts',
      inputs: [
        { name: 'target', type: 'locator', cardinality: 'collection' },
        { name: 'expectedTexts', type: 'json', required: true },
      ],
    })
  })
})

describe('operation registry', () => {
  it('keeps TypeScript source imports bundler-safe while rewriting emitted ESM imports', async () => {
    const packageConfig = JSON.parse(await readFile(new URL('../../tsconfig.json', import.meta.url), 'utf8')) as {
      compilerOptions: Record<string, unknown>
    }
    const rootConfig = JSON.parse(await readFile(new URL('../../../../tsconfig.json', import.meta.url), 'utf8')) as {
      compilerOptions: Record<string, unknown>
    }
    const sources = await Promise.all(
      ['index.ts', 'browser-handlers.ts', 'registry.ts'].map(file =>
        readFile(new URL(`./${file}`, import.meta.url), 'utf8'),
      ),
    )

    expect(rootConfig.compilerOptions.allowImportingTsExtensions).toBe(true)
    expect(packageConfig.compilerOptions).toMatchObject({
      allowImportingTsExtensions: true,
      rewriteRelativeImportExtensions: true,
    })
    expect(sources.join('\n')).not.toMatch(/(?:from|export \*) ['"]\.\/[^'"]+\.js['"]/)
  })

  it('supports bounded, hash-aware listing and exact reads', () => {
    const registry = createOperationRegistry([operation()])
    const listing = registry.list({ surface: 'agent', inputType: 'locator' })
    expect(listing.items).toMatchObject([
      { id: 'browser.mouse.click', humanSurface: 'supported', agentSurface: 'supported' },
    ])
    expect(registry.list({}, 0, 50, registry.manifestHash)).toEqual({
      status: 'unchanged',
      manifestHash: registry.manifestHash,
      items: [],
      nextCursor: null,
    })
    expect(registry.read([{ id: 'browser.mouse.click', version: '1' }])[0]?.descriptorHash).toMatch(/^sha256:/)
    expect(registry.resolveAlias('step-definition-slug', 'click/click', 'human')?.id).toBe('browser.mouse.click')
  })

  it('rejects duplicate identities and ambiguous aliases', () => {
    expect(() => createOperationRegistry([operation(), operation()])).toThrow('must be unique')
    expect(() =>
      createOperationRegistry([
        operation(),
        operation({ id: 'browser.mouse.double-click', aliases: operation().aliases }),
      ]),
    ).toThrow('Ambiguous operation alias')
  })
})
