import { describe, expect, it } from 'vitest'

import { defaultOperationRegistry } from '@/lib/operation-catalog'
import type { RuntimeCapsuleManifest } from './contracts'
import { validateOperationClosure } from './preflight-validators'

const hash = (character: string) => `sha256:${character.repeat(64)}`

function manifest(version: '1' | '2'): RuntimeCapsuleManifest {
  const operation = defaultOperationRegistry.read([{ id: 'browser.mouse.click', version: '1' }])[0]!
  return {
    schemaVersion: '1',
    projectId: 'project',
    validationHash: hash('a'),
    runId: 'run',
    operationHash: hash('b'),
    projectionHash: hash('c'),
    receiptHash: hash('d'),
    runtimeInputHash: hash('e'),
    commandReceipt: { path: 'command-receipt.json', hash: hash('f') },
    generator: { id: 'appraise.validation-ast-capsule', version },
    operations: [
      {
        id: operation.id,
        version: operation.version,
        descriptorHash: operation.descriptorHash,
        handler: operation.handler,
      },
    ],
    expectedCases: [],
    files: [],
  }
}

describe('sealed operation closure preflight', () => {
  it('accepts current v2 descriptor and handler identities', () => {
    expect(() => validateOperationClosure(manifest('2'))).not.toThrow()
  })

  it('rejects handler drift but preserves the historical v1 reader', () => {
    const drifted = structuredClone(manifest('2'))
    drifted.operations[0]!.handler.contentHash = hash('0')
    expect(() => validateOperationClosure(drifted)).toThrow('operation closure drift')
    expect(() =>
      validateOperationClosure({ ...drifted, generator: { ...drifted.generator, version: '1' } }),
    ).not.toThrow()
  })
})
