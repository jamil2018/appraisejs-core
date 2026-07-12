import { describe, expect, it, vi } from 'vitest'

import type { CompiledCustomExtension } from '@/lib/validation-ast'

import { projectCompiledValidationArtifacts } from './validation-canonical-projection-service'

describe('compiled validation extension persistence', () => {
  it('appends the exact reviewed extension in the same transaction as canonical projection', async () => {
    const eventCreate = vi.fn().mockResolvedValue({})
    const transaction = {
      tag: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'owner-tag', name: 'appraise_plan_plan-one' }),
      },
      planProjection: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'projection-one' }),
        update: vi.fn().mockResolvedValue({}),
      },
      planEvent: {
        findFirst: vi.fn(async ({ orderBy }) => (orderBy ? { sequence: 4 } : null)),
        create: eventCreate,
      },
    }
    const client = { $transaction: vi.fn(async callback => callback(transaction)) } as never
    const compiledExtension = {
      schemaVersion: '1',
      projectId: 'project-one',
      projectFingerprint: `sha256:${'a'.repeat(64)}`,
      extension: {
        id: 'extension-one',
        version: '1',
        title: 'Extension',
        description: 'Description',
        inputs: [],
        outputs: [],
      },
      requiredCapabilities: [],
      imports: [],
      source: 'export const value = true',
      compiledSource: 'export const value = true;\n',
      sourceHash: `sha256:${'b'.repeat(64)}`,
      compiledHash: `sha256:${'c'.repeat(64)}`,
      cucumberModulePath: '/appraise/node_modules/@cucumber/cucumber/lib/index.js',
    } satisfies CompiledCustomExtension

    await projectCompiledValidationArtifacts(
      {
        planId: 'plan-one',
        validation: { validations: [] } as never,
        astId: 'ast-one',
        astHash: `sha256:${'d'.repeat(64)}`,
        compiledExtensions: [compiledExtension],
      },
      client,
    )

    expect(client.$transaction).toHaveBeenCalledOnce()
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sequence: 5,
        type: 'validation_ast_compiled',
        payloadJson: expect.stringContaining(compiledExtension.compiledHash),
      }),
    })
    const payload = JSON.parse(eventCreate.mock.calls[0]![0].data.payloadJson)
    expect(payload.compiledExtensionHashes).toEqual([compiledExtension.compiledHash])
  })
})
