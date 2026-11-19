import { afterEach, describe, it, expect } from 'vitest'
import { mkdtemp, rm, readdir, readFile, chmod, symlink, writeFile, rename, mkdir, link } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createAssignmentCredentialFileStore } from './assignment-credential-file-store'
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'appraise-synthetic-custody-'))
  roots.push(root)
  await chmod(root, 0o700)
  return { root, store: await createAssignmentCredentialFileStore(root) }
}
const id = `sha256:${'a'.repeat(64)}`
describe('explicit synthetic encrypted record store', () => {
  it('creates, reads and CAS-replaces only bounded ciphertext records', async () => {
    const f = await fixture()
    const a = await f.store.compareAndSwap(id, null, 'ciphertext-one')
    expect(await f.store.read(id)).toEqual({ revision: a, value: 'ciphertext-one' })
    const b = await f.store.compareAndSwap(id, a, 'ciphertext-two')
    expect(await f.store.read(id)).toEqual({ revision: b, value: 'ciphertext-two' })
    expect(await readdir(f.root)).toEqual([`${'a'.repeat(64)}.sealed`])
    await expect(f.store.compareAndSwap(id, a, 'stale')).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it('serializes competing CAS writes and never overwrites conflicting identity', async () => {
    const f = await fixture()
    const results = await Promise.allSettled([
      f.store.compareAndSwap(id, null, 'one'),
      f.store.compareAndSwap(id, null, 'two'),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
  })
  it('rejects nonprivate roots and root symlinks', async () => {
    const f = await fixture()
    await chmod(f.root, 0o755)
    await expect(createAssignmentCredentialFileStore(f.root)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    await chmod(f.root, 0o700)
    const alias = f.root + '-alias'
    roots.push(alias)
    await symlink(f.root, alias)
    await expect(createAssignmentCredentialFileStore(alias)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
  })
  it('rejects symlink records and preserves their destination', async () => {
    const f = await fixture(),
      destination = path.join(f.root, 'synthetic-destination')
    await writeFile(destination, 'unchanged', { mode: 0o600 })
    await symlink(destination, path.join(f.root, `${'a'.repeat(64)}.sealed`))
    await expect(f.store.read(id)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    await expect(f.store.compareAndSwap(id, null, 'new')).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    expect(await readFile(destination, 'utf8')).toBe('unchanged')
  })
  it('rejects multiply linked record identity', async () => {
    const f = await fixture()
    await f.store.compareAndSwap(id, null, 'ciphertext')
    await link(path.join(f.root, `${'a'.repeat(64)}.sealed`), path.join(f.root, 'synthetic-hardlink'))
    await expect(f.store.read(id)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
  })
  it('refuses a replaced original root and leaves replacement content untouched', async () => {
    const f = await fixture(),
      old = f.root + '-original'
    roots.push(old)
    await rename(f.root, old)
    await mkdir(f.root, { mode: 0o700 })
    await expect(f.store.read(id)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    expect(await readdir(f.root)).toEqual([])
  })
  it('rejects loose record permissions and invalid file identities', async () => {
    const f = await fixture()
    await f.store.compareAndSwap(id, null, 'ciphertext')
    await chmod(path.join(f.root, `${'a'.repeat(64)}.sealed`), 0o644)
    await expect(f.store.read(id)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    await expect(f.store.read('../escape')).rejects.toBeInstanceOf(Error)
  })
})
