import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import {
  canonicalRuntimeCapsuleJson,
  hashRuntimeCapsuleBytes,
  hashRuntimeCapsuleValue,
  parseCanonicalRuntimeCapsuleManifest,
  prepareRuntimeCapsuleDirectories,
  resolveRuntimeCapsulePaths,
  writeImmutableCapsuleManifest,
  writeContentAddressedBlob,
} from './index'

const validationHash = `sha256:${'a'.repeat(64)}`
let workspace: string

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-runtime-capsule-'))
})
afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('runtime capsule storage foundation', () => {
  it('canonicalizes object keys and hashes the versioned contract deterministically', () => {
    expect(canonicalRuntimeCapsuleJson({ z: 1, nested: { b: 2, a: 1 } })).toBe('{"nested":{"a":1,"b":2},"z":1}')
    expect(hashRuntimeCapsuleValue({ z: 1, nested: { b: 2, a: 1 } })).toBe(
      hashRuntimeCapsuleValue({ nested: { a: 1, b: 2 }, z: 1 }),
    )
  })

  it('rejects traversal and malformed hash segments before constructing paths', () => {
    expect(() =>
      resolveRuntimeCapsulePaths({
        appraiseRoot: workspace,
        projectId: '../other',
        validationHash,
        runId: 'run-one',
      }),
    ).toThrow(/safe opaque identifier/)
    expect(() =>
      resolveRuntimeCapsulePaths({
        appraiseRoot: workspace,
        projectId: 'project-one',
        validationHash: 'sha256:not-a-hash',
        runId: 'run-one',
      }),
    ).toThrow()
  })

  it('creates isolated restrictive directories and an immutable 0600 manifest', async () => {
    const paths = resolveRuntimeCapsulePaths({
      appraiseRoot: workspace,
      projectId: 'project-one',
      validationHash,
      runId: 'run-one',
    })
    await expect(writeImmutableCapsuleManifest(paths, '{"schemaVersion":"2"}')).resolves.toBe('created')
    await expect(writeImmutableCapsuleManifest(paths, '{"schemaVersion":"2"}')).resolves.toBe('unchanged')
    await expect(writeImmutableCapsuleManifest(paths, '{"schemaVersion":"2","changed":true}')).rejects.toThrow(
      /immutable/,
    )
    expect((await fs.stat(paths.capsuleRoot)).mode & 0o777).toBe(0o700)
    expect((await fs.stat(paths.manifestPath)).mode & 0o777).toBe(0o600)
  })

  it('requires unique sorted capsule-relative POSIX file paths and canonical JSON', () => {
    const definition = builtInStepDefinitions[0]!
    const hashes = computeStepDefinitionHashes(definition)
    const step = {
      id: definition.identity.id,
      version: definition.identity.version,
      definitionHash: computeStepReferenceHash(definition),
    }
    const sealed = {
      step,
      definition,
      definitionHash: hashes.definitionHash,
      humanProjectionHash: hashes.humanProjectionHash,
      agentContractHash: hashes.agentContractHash,
      executionHash: hashes.executionHash,
      publicationReceiptHash: validationHash,
    }
    const base = {
      schemaVersion: '2',
      projectId: 'project-one',
      validationHash,
      runId: 'run-one',
      operationHash: validationHash,
      projectionHash: validationHash,
      receiptHash: validationHash,
      runtimeInputHash: validationHash,
      source: {
        kind: 'AUTHORED_TEST_SNAPSHOT',
        sourceHash: validationHash,
      snapshot: {},
      },
      commandReceipt: { path: 'command-receipt.json', hash: validationHash },
      generator: { id: 'appraise.validation-ast-capsule', version: '2' },
      expectedCases: [],
      rootInvocations: [{ step, inputs: {} }],
      stepDefinitions: [sealed],
    } as const
    const file = { role: 'feature', hash: validationHash, size: 1 } as const
    expect(() =>
      parseCanonicalRuntimeCapsuleManifest(JSON.stringify({ ...base, files: [{ ...file, path: '../x' }] })),
    ).toThrow()
    expect(() =>
      parseCanonicalRuntimeCapsuleManifest(
        JSON.stringify({
          ...base,
          files: [
            { ...file, path: 'b' },
            { ...file, path: 'a' },
          ],
        }),
      ),
    ).toThrow(/canonical|ordered/)
    expect(() =>
      parseCanonicalRuntimeCapsuleManifest(
        JSON.stringify({
          ...base,
          files: [
            { ...file, path: 'a' },
            { ...file, path: 'a' },
          ],
        }),
      ),
    ).toThrow(/canonical|unique/)
    expect(() =>
      parseCanonicalRuntimeCapsuleManifest(
        `${JSON.stringify({
          ...base,
          files: [{ path: 'command-receipt.json', role: 'command-receipt', hash: validationHash, size: 1 }],
        })} `,
      ),
    ).toThrow(/canonical/)
  })

  it('rejects the retired operation-rooted V1 capsule schema', () => {
    expect(() => parseCanonicalRuntimeCapsuleManifest('{"schemaVersion":"1"}')).toThrow()
  })

  it('seals v2 root invocations into a complete Step Definition closure', () => {
    const base = {
      schemaVersion: '2',
      projectId: 'project-one',
      validationHash,
      runId: 'run-one',
      operationHash: validationHash,
      projectionHash: validationHash,
      receiptHash: validationHash,
      runtimeInputHash: validationHash,
      source: {
        kind: 'AUTHORED_TEST_SNAPSHOT',
        sourceHash: validationHash,
      snapshot: {},
      },
      commandReceipt: { path: 'command-receipt.json', hash: validationHash },
      generator: { id: 'appraise.validation-ast-capsule', version: '2' },
      extensions: [],
      expectedCases: [],
      files: [{ path: 'command-receipt.json', role: 'command-receipt', hash: validationHash, size: 1 }],
    } as const
    const definition = builtInStepDefinitions[0]!
    const hashes = computeStepDefinitionHashes(definition)
    const step = {
      id: definition.identity.id,
      version: definition.identity.version,
      definitionHash: computeStepReferenceHash(definition),
    }
    const sealed = {
      step,
      definition,
      definitionHash: hashes.definitionHash,
      humanProjectionHash: hashes.humanProjectionHash,
      agentContractHash: hashes.agentContractHash,
      executionHash: hashes.executionHash,
      publicationReceiptHash: validationHash,
    }
    expect(() =>
      parseCanonicalRuntimeCapsuleManifest(
        canonicalRuntimeCapsuleJson({ ...base, rootInvocations: [{ step, inputs: {} }], stepDefinitions: [sealed] }),
      ),
    ).not.toThrow()
    expect(() =>
      parseCanonicalRuntimeCapsuleManifest(
        canonicalRuntimeCapsuleJson({ ...base, rootInvocations: [{ step, inputs: {} }], stepDefinitions: [] }),
      ),
    ).toThrow(/union|stepDefinitions/)
  })

  it('rejects a symlinked project ancestor', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-runtime-outside-'))
    const paths = resolveRuntimeCapsulePaths({
      appraiseRoot: workspace,
      projectId: 'project-one',
      validationHash,
      runId: 'run-one',
    })
    await fs.mkdir(paths.managedRoot, { recursive: true })
    await fs.symlink(outside, paths.projectRoot)
    await expect(prepareRuntimeCapsuleDirectories(paths)).rejects.toThrow(/symlink ancestors|escapes/)
    await fs.rm(outside, { recursive: true, force: true })
  })

  it('rejects symlinked Appraise, projects, and blob digest ancestors', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-runtime-trusted-outside-'))
    const appraiseLink = path.join(workspace, '.appraise')
    await fs.symlink(outside, appraiseLink)
    const linkedPaths = resolveRuntimeCapsulePaths({
      appraiseRoot: appraiseLink,
      projectId: 'project-one',
      validationHash,
      runId: 'run-one',
    })
    await expect(prepareRuntimeCapsuleDirectories(linkedPaths)).rejects.toThrow(/trusted Appraise storage root/)
    await fs.unlink(appraiseLink)

    await fs.mkdir(appraiseLink, { mode: 0o700 })
    await fs.symlink(outside, path.join(appraiseLink, 'projects'))
    await expect(prepareRuntimeCapsuleDirectories(linkedPaths)).rejects.toThrow(/symlink ancestors|escapes/)
    await fs.rm(path.join(appraiseLink, 'projects'))

    const bytes = Buffer.from('digest ancestor')
    const contentHash = hashRuntimeCapsuleBytes(bytes)
    const digest = contentHash.slice('sha256:'.length)
    const blobParent = path.join(appraiseLink, 'projects', 'project-one', 'cache', 'blobs')
    await fs.mkdir(blobParent, { recursive: true })
    await fs.symlink(outside, path.join(blobParent, digest.slice(0, 2)))
    await expect(
      writeContentAddressedBlob({ appraiseRoot: appraiseLink, projectId: 'project-one', contentHash, bytes }),
    ).rejects.toThrow(/symlink ancestors|escapes/)
    await fs.rm(outside, { recursive: true, force: true })
  })

  it('stores verified content-addressed bytes', async () => {
    const bytes = Buffer.from('exact reviewed bytes')
    const contentHash = hashRuntimeCapsuleBytes(bytes)
    await expect(
      writeContentAddressedBlob({ appraiseRoot: workspace, projectId: 'project-one', contentHash, bytes }),
    ).resolves.toMatchObject({ status: 'created' })
    await expect(
      writeContentAddressedBlob({ appraiseRoot: workspace, projectId: 'project-one', contentHash, bytes }),
    ).resolves.toMatchObject({ status: 'unchanged' })
    await expect(
      writeContentAddressedBlob({
        appraiseRoot: workspace,
        projectId: 'project-one',
        contentHash,
        bytes: Buffer.from('different'),
      }),
    ).rejects.toThrow(/do not match/)
  })
})
