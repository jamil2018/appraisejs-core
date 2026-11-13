import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  createAssignmentCredentialCustody,
  type AssignmentCredentialStore,
  type AssignmentCustodyScope,
} from './assignment-credential-custody'

function syntheticCustodyScope(): AssignmentCustodyScope {
  return {
    databaseIdentity: `sha256:${'d'.repeat(64)}`,
    claimRequest: {
      journeyId: 'journey',
      targetProjectId: 'target',
      role: 'REQUIREMENT_ANALYZER',
      principal: { principalId: 'project:synthetic', assurance: 'PROJECT_CREDENTIAL_ONLY' },
      idempotencyKey: 'original-claim',
      coordinatorSessionId: 'session',
      coordinatorGeneration: 1,
      coordinatorPrincipalId: 'project:synthetic',
    },
  }
}
const secret = 'synthetic-assignment-secret-0123456789'
const binding = {
  workItemId: 'work',
  attemptId: 'attempt',
  assignmentId: 'assignment',
  assignmentGeneration: 1,
  leaseId: 'lease',
}
function fixture() {
  const cells = new Map<string, { revision: string; value: string }>(),
    key = randomBytes(32)
  let version = 0
  const store: AssignmentCredentialStore = {
    async read(id) {
      return cells.get(id) ?? null
    },
    async compareAndSwap(id, expected, value) {
      if ((cells.get(id)?.revision ?? null) !== expected) throw new Error('conflict')
      const revision = String(++version)
      cells.set(id, { value, revision })
      return revision
    },
  }
  return { cells, key, store, vault: createAssignmentCredentialCustody({ store, keyProvider: async () => key }) }
}
describe('encrypted original assignment custody (synthetic only)', () => {
  it('prepares encrypted original material, binds once and recovers through a new vault without exposing it in receipts', async () => {
    const f = fixture(),
      scope = syntheticCustodyScope()
    const first = await f.vault.prepare(scope, secret)
    expect(first.stage).toBe('PREPARED_CLAIM')
    expect(JSON.stringify([...f.cells.values()])).not.toContain(secret)
    expect(JSON.stringify(first)).not.toContain('original-claim')
    expect(await f.vault.prepare(scope, secret)).toEqual(first)
    const bound = await f.vault.bind(scope, binding)
    expect(Object.isFrozen(bound)).toBe(true)
    expect(await f.vault.bind(scope, binding)).toEqual(bound)
    const restarted = createAssignmentCredentialCustody({ store: f.store, keyProvider: async () => f.key })
    expect(
      await restarted.withRecovered(scope, async value => ({
        secret: value.assignmentSecret,
        key: value.scope.claimRequest.idempotencyKey,
        binding: value.boundAttempt,
      })),
    ).toEqual({ secret, key: 'original-claim', binding })
    expect(bound).toMatchObject({ runtimeQualified: false, provenance: 'OFFLINE_ASSIGNMENT_CUSTODY' })
  })
  it('retains canonical byte-based secret limits including multibyte synthetic values', async () => {
    const f = fixture(),
      scope = syntheticCustodyScope(),
      unicodeSecret = '🐈'.repeat(8)
    await f.vault.prepare(scope, unicodeSecret)
    expect(await f.vault.withRecovered(scope, async material => material.assignmentSecret)).toBe(unicodeSecret)
  })
  it('never replaces original material or an already bound attempt', async () => {
    const f = fixture(),
      s = syntheticCustodyScope()
    await f.vault.prepare(s, secret)
    await f.vault.bind(s, binding)
    await expect(f.vault.prepare(s, secret + 'changed')).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(f.vault.bind(s, { ...binding, attemptId: 'new-attempt' })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await f.vault.inspect(s)).toMatchObject({ boundAttempt: binding })
  })
  it.each(['missing', 'wrong-key', 'damaged', 'swapped-scope'] as const)(
    'refuses %s without a fallback or plaintext disclosure',
    async mode => {
      const f = fixture(),
        s = syntheticCustodyScope()
      const r = await f.vault.prepare(s, secret)
      let target = s,
        vault = f.vault
      if (mode === 'missing') f.cells.delete(r.entryId)
      if (mode === 'wrong-key')
        vault = createAssignmentCredentialCustody({ store: f.store, keyProvider: async () => randomBytes(32) })
      if (mode === 'damaged') f.cells.set(r.entryId, { revision: 'changed', value: '{"ciphertext":"broken"}' })
      if (mode === 'swapped-scope') {
        target = { ...s, databaseIdentity: `sha256:${'e'.repeat(64)}` }
        const other = fixture()
        const id = await other.vault.prepare(target, secret)
        f.cells.set(id.entryId, f.cells.get(r.entryId)!)
      }
      let calls = 0
      await expect(
        vault.withRecovered(target, async () => {
          calls++
          return true
        }),
      ).rejects.toMatchObject({ code: mode === 'missing' ? 'MISSING' : 'CORRUPT' })
      expect(calls).toBe(0)
    },
  )
  it.each([undefined, async () => null, async () => new Uint8Array(31)])(
    'requires an explicitly supplied usable key %#',
    async keyProvider => {
      const f = fixture(),
        vault = createAssignmentCredentialCustody({ store: f.store, keyProvider })
      await expect(vault.prepare(syntheticCustodyScope(), secret)).rejects.toMatchObject({ code: 'KEY_UNAVAILABLE' })
      expect(f.cells.size).toBe(0)
    },
  )
  it('CAS admits only one conflicting bind without modifying the winner', async () => {
    const f = fixture(),
      s = syntheticCustodyScope()
    await f.vault.prepare(s, secret)
    const results = await Promise.allSettled([
      f.vault.bind(s, binding),
      f.vault.bind(s, { ...binding, attemptId: 'other' }),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
  })
  it('captures caller scope and original operations before asynchronous key retrieval', async () => {
    const f = fixture(),
      s = syntheticCustodyScope()
    let release!: () => void
    const pending = new Promise<void>(r => {
      release = r
    })
    const vault = createAssignmentCredentialCustody({
      store: f.store,
      keyProvider: async () => {
        await pending
        return f.key
      },
    })
    const preparing = vault.prepare(s, secret)
    s.claimRequest.idempotencyKey = 'mutated'
    release()
    await preparing
    expect(await vault.withRecovered(syntheticCustodyScope(), async m => m.scope.claimRequest.idempotencyKey)).toBe(
      'original-claim',
    )
  })
})
