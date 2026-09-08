import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { canonicalJson, collaborationHash } from './canonical'
import { collaborationManifestSchema, collaborationRecordSchema, type CollaborationRecord } from './contracts'
import { allocateLocalGraphIds, validateCollaborationGraph } from './graph'
import { readCollaborationSnapshot } from './reader'
import { buildCollaborationSnapshotFiles, validateFirstAdoption } from './snapshot'

const projectId = 'project-portable-1'

function moduleRecord(id: string, parentPortableId: string | null = null): CollaborationRecord {
  return {
    format: 'appraise.repository-collaboration/v1',
    portableProjectId: projectId,
    portableId: id,
    version: 1,
    archived: false,
    kind: 'module',
    payload: { name: id, parentPortableId },
  }
}

describe('repository collaboration contracts', () => {
  it('rejects unknown fields and duplicate manifest identities', () => {
    expect(() => collaborationRecordSchema.parse({ ...moduleRecord('root'), unexpected: true })).toThrow()
    expect(() =>
      collaborationManifestSchema.parse({
        format: 'appraise.repository-collaboration/v1',
        portableProjectId: projectId,
        records: [
          { kind: 'module', portableId: 'root', path: 'modules/root.json', hash: 'a'.repeat(64) },
          { kind: 'module', portableId: 'root', path: 'modules/root-2.json', hash: 'b'.repeat(64) },
        ],
      }),
    ).toThrow(/duplicate record/)
  })

  it('allocates different local ids without changing portable graph identity', () => {
    const records = [moduleRecord('root'), moduleRecord('child', 'root')]
    const first = allocateLocalGraphIds(records, record => `first-${record.portableId}`)
    const second = allocateLocalGraphIds(records, record => `second-${record.portableId}`)

    expect(first.get('module:child')).toBe('first-child')
    expect(second.get('module:child')).toBe('second-child')
    expect([...first.keys()]).toEqual([...second.keys()])
  })

  it('rejects missing dependencies and module cycles', () => {
    expect(() => validateCollaborationGraph([moduleRecord('child', 'missing')])).toThrow(/Missing active dependency/)
    expect(() => validateCollaborationGraph([moduleRecord('left', 'right'), moduleRecord('right', 'left')])).toThrow(
      /Module cycle/,
    )
  })

  it('normalizes record order and requires explicit adoption for same-name collisions', () => {
    const records = [moduleRecord('root'), moduleRecord('child', 'root')]
    const snapshot = buildCollaborationSnapshotFiles([...records].reverse())
    expect(snapshot.manifest.records.map(record => record.portableId)).toEqual(['child', 'root'])
    expect(snapshot.files.get('manifest.json')).toContain('modules/root.json')

    expect(validateFirstAdoption(records, new Map([['module', new Map([['root', 'local-root']])]]), new Set())).toEqual(
      [{ recordKey: 'module:root', localEntityId: 'local-root', reason: 'NAME_COLLISION_WITHOUT_BASELINE' }],
    )
  })

  it('reads a canonical bounded snapshot and rejects identity/hash mismatches', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'appraise-collaboration-'))
    await mkdir(path.join(root, 'modules'))
    const record = moduleRecord('root')
    const bytes = canonicalJson(record)
    await writeFile(path.join(root, 'modules/root.json'), bytes)
    await writeFile(
      path.join(root, 'manifest.json'),
      canonicalJson({
        format: 'appraise.repository-collaboration/v1',
        portableProjectId: projectId,
        records: [{ kind: 'module', portableId: 'root', path: 'modules/root.json', hash: collaborationHash(bytes) }],
      }),
    )

    const snapshot = await readCollaborationSnapshot(root)
    expect(snapshot.records).toEqual([record])
    expect(snapshot.snapshotHash).toMatch(/^[a-f0-9]{64}$/)

    await writeFile(path.join(root, 'modules/root.json'), canonicalJson(moduleRecord('different')))
    await expect(readCollaborationSnapshot(root)).rejects.toThrow(/Hash mismatch/)
  })

  it('rejects symlinked record files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'appraise-collaboration-link-'))
    const outside = path.join(root, '..', `outside-${Date.now()}.json`)
    await mkdir(path.join(root, 'modules'))
    await writeFile(outside, canonicalJson(moduleRecord('root')))
    await symlink(outside, path.join(root, 'modules/root.json'))
    await writeFile(
      path.join(root, 'manifest.json'),
      canonicalJson({
        format: 'appraise.repository-collaboration/v1',
        portableProjectId: projectId,
        records: [
          { kind: 'module', portableId: 'root', path: 'modules/root.json', hash: collaborationHash('irrelevant') },
        ],
      }),
    )

    await expect(readCollaborationSnapshot(root)).rejects.toThrow(/symlinks are not allowed/)
  })
})
